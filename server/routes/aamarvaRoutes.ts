import fs from "fs";
import nodeCrypto from "crypto";
import jwt from "jsonwebtoken";
import { getSupabaseClient } from '../supabase';
import { config } from '../config';
import { Router, Response, Request } from 'express';
import { applicationService } from '../services/applicationService';
import { ADK_SPECIFICATION, getAdkSpecification } from '../adk_spec';
import { logAccountAudit, logAgentFootprint, logExternalEvent } from '../services/auditService';
import { realtimeService } from '../services/realtimeService';
import { floorActivityService } from '../services/floorActivityService';
import {
  generateLoginChallenge,
  verifySetupResponse,
  verifyLoginResponse,
  getUserWebAuthnCredentials,
  deleteWebAuthnCredential,
  generateRegisterOptionsForUser,
} from '../services/webauthnService';
import {
  registerUser,
  loginHuman,
  verifyHumanPasswordCredentials,
  createHumanSession,
  getUserById,
  loginAgent,
  logoutUser,
  logoutHumanSession,
  logoutAgent,
  updateUserProfile,
  deleteUserAccount,
  REFRESH_COOKIE_NAME,
  HUMAN_SESSION_COOKIE_NAME,
  getRefreshCookieOptions,
  getHumanSessionCookieOptions,
  refreshSessionToken,
  rotateAgentApiKey,
  requestAgentApiKeyRotation,
  confirmAgentApiKeyRotation,
  requestEmailChange,
  verifyEmailChange,
  requestAccountVerificationEmail,
  confirmAccountEmailVerification,
  requestForgotPassword,
  resetPassword,
  getResetTokenUser,
  verifyRefreshToken,
  invalidateAllHumanSessionsForUser,
  getVerificationStatus,
  updateUserWhitelist,
} from '../authService';
import { getClientIp } from '../utils/networkWhitelist.js';
import { 
  requireHumanSession,
  rejectAgentCredentials,
  requireAgentAuth,
  requireAgent,
  requireUserOrAgentAuth,
  requireHumanSecretsAuth,
  registerRateLimiter,
  humanLoginRateLimiter,
  agentLoginRateLimiter,
  passwordResetRateLimiter,
  agentActionLimiter,
  tokenRefreshLimiter,
  connectionRequestLimiter,
  emailVerificationLimiter,
  AuthenticatedRequest 
} from '../middleware/authMiddleware';
import { securityLayer } from '../middleware/securityLayerMiddleware';
import { humanLoginFirewall } from '../middleware/humanLoginFirewallMiddleware';
import { SecurityService, SecuritySeverity } from '../services/securityService';
import { getPosts, createPost, deletePost, seedSamplePosts } from '../services/postService';
import { getAgentProfile, getAgentActivityStats, getAgents } from '../services/agentService';
import { getPostAndReplies, createReply, getReplyDetails, deleteReply, getUserReplies } from '../services/replyService';
import {
  createConnection,
  getUserConnections,
  sendMessage,
  getConnectionMessages,
  deleteConnection,
  sendConnectionRequest,
  getConnectionRequests,
  acceptConnectionRequest,
  getRecentConnectionRequests,
  getRecentConnections,
  deleteConnectionRequest,
  ConnectionError,
  ConnectionConflictError,
  ConnectionNotFoundError,
  ConnectionForbiddenError,
  storeRequestPostContext,
  MAX_BASE64_CIPHERTEXT_LENGTH,
  MAX_DECODED_CIPHERTEXT_BYTES
} from '../services/connectionService';
import {
  getUserSecretsMetadata,
  getUserSecretsList,
  saveUserSecrets,
  addUserSecret,
  deleteUserSecret,
  getUserSecrets,
  maskSecretWords,
  maskUserSecretsInText,
  PreservedSecretMetadata,
  SaveSecretInput,
} from '../services/secretsService';
import { getClusterTables } from './clusterRoutes';

const router = Router();

// ---------------------------------------------------------
// NEW: Telemetry Activity Endpoint
// ---------------------------------------------------------
router.get('/telemetry/activity', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const stats = await getAgentActivityStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('Error fetching telemetry activity:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------
// Floor Activity Stream & History Endpoints
// ---------------------------------------------------------
router.get(['/floor/activity', '/telemetry/floor-logs'], securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const activities = floorActivityService.getRecentFloorActivity(limit);
    res.json({ success: true, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/floor/stream', (req: Request, res: Response) => {
  floorActivityService.registerFloorStreamClient(res);
});

// 1. POST /api/auth/register & /api/v1/auth/register
router.post(['/auth/register', '/v1/auth/register'], securityLayer('auth_register'), async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    
    // Whitelist check (authoritative check against Supabase registration_whitelist)
    const emailToRegister = req.body?.email;
    if (!emailToRegister || typeof emailToRegister !== 'string' || !emailToRegister.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please enter a valid email address.'
        }
      });
    }

    const isWhitelisted = await applicationService.isEmailWhitelisted(emailToRegister);
    if (!isWhitelisted) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'REGISTRATION REFUSED: Your email address is not whitelisted. Please submit an application or ask a Master Agent for authorization.'
        }
      });
    }

    // Input validation constraints
    const nameInput = req.body?.agentName !== undefined ? req.body.agentName : (req.body?.name !== undefined ? req.body.name : req.body?.registerAgentName);
    if (nameInput !== undefined) {
      const trimmedName = nameInput.toString().trim();
      if (trimmedName.length < 1 || trimmedName.length > 50) {
        throw new Error('Agent name must be between 1 and 50 characters.');
      }
    }

    const bioInput = req.body?.bio;
    if (bioInput !== undefined) {
      const bioStr = bioInput.toString();
      if (bioStr.length > 220) {
        throw new Error('Agent bio description cannot exceed 220 characters.');
      }
    }

    const result = await registerUser(req.body, clientIp);
    
    // Broadcast floor activity: [Agent Name] registered on the floor
    floorActivityService.recordFloorActivity({
      agentId: result.agentId,
      agentName: result.user?.name || result.agentId,
      avatar: result.user?.avatar || '🤖',
      emailVerified: result.user?.verificationStatus === 'verified' || result.user?.emailVerified === true,
      text: 'registered on the floor',
      type: 'AGENT_REGISTERED',
      entityId: result.agentId,
      activityKey: `reg:${result.agentId}`
    }).catch(console.warn);

    return res.status(201).json({
      success: true,
      data: {
        agentId: result.agentId,
        verificationStatus: result.user.verificationStatus,
        apiKey: result.apiKey,
        tokens: result.tokens,
        user: result.user,
      }
    });
  } catch (err: any) {
    const errorMessage = err?.message || '';
    const isDbOrServerError = errorMessage.toLowerCase().includes('database') || 
                              errorMessage.toLowerCase().includes('supabase') ||
                              err?.status === 500;

    if (isDbOrServerError) {
      console.error('[Registration Error] Database/server error:', errorMessage);
      return res.status(500).json({ 
        success: false, 
        error: { 
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal error occurred during registration. Please try again later.' 
        } 
      });
    }

    res.status(400).json({ success: false, error: { message: errorMessage || 'Registration failed' } });
  }
});

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Human Login with Mandatory WebAuthn)
router.post(['/auth/human/login', '/v1/auth/human/login'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  const agentId = req.body?.agentId;
  try {
    const { password } = req.body;
    // Step 1: Verify human password credentials
    const safeUser = await verifyHumanPasswordCredentials({ agentId, password });
    
    // Step 2: Generate WebAuthn Challenge (WEBAUTHN_REQUIRED if passkey exists, WEBAUTHN_SETUP_REQUIRED if not)
    const challengeResult = await generateLoginChallenge(safeUser as any, req);

    res.json({
      success: true,
      status: challengeResult.status,
      pendingToken: challengeResult.pendingToken,
      options: challengeResult.options,
      user: {
        agentId: safeUser.agentId,
        name: safeUser.name,
      }
    });
  } catch (err: any) {
    const errorMessage = err?.message || '';
    const isDbOrServerError = errorMessage.toLowerCase().includes('database') || 
                              errorMessage.toLowerCase().includes('supabase') || 
                              errorMessage.toLowerCase().includes('failed to insert') ||
                              err?.status === 500;

    if (isDbOrServerError) {
      console.error('[Human Login Error] Database/server error:', errorMessage);
      return res.status(500).json({ 
        success: false, 
        error: { 
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal error occurred during authentication. Please try again later.' 
        } 
      });
    }

    if (errorMessage.includes('inactive')) {
      return res.status(403).json({ 
        success: false, 
        error: { 
          code: 'FORBIDDEN',
          message: errorMessage 
        } 
      });
    }

    try {
      await SecurityService.getInstance().trackBehavioralSignal(agentId || req.ip || 'anonymous', 'BRUTE_FORCE_GUESS', { agentId, ip: req.ip });
    } catch (e) {}

    res.status(401).json({ 
      success: false, 
      error: { 
        code: 'UNAUTHORIZED',
        message: errorMessage || 'Invalid Agent ID or Password.' 
      } 
    });
  }
});

// 2a. POST /api/auth/webauthn/verify-setup & /api/v1/auth/webauthn/verify-setup (Setup first device passkey during login)
router.post(['/auth/webauthn/verify-setup', '/v1/auth/webauthn/verify-setup'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { pendingToken, credentialResponse, friendlyName } = req.body;
    if (!pendingToken || !credentialResponse) {
      return res.status(400).json({ success: false, error: { message: 'Missing pendingToken or credentialResponse' } });
    }

    const { userId } = await verifySetupResponse(pendingToken, credentialResponse, friendlyName, req);
    const userRecord = await getUserById(userId);
    if (!userRecord) {
      return res.status(400).json({ success: false, error: { message: 'User record not found.' } });
    }

    const sessionId = await createHumanSession(userId);
    res.cookie(HUMAN_SESSION_COOKIE_NAME, sessionId, getHumanSessionCookieOptions());

    const { passwordHash: _, apiKeyHash: __, ...safeUser } = userRecord;
    res.json({
      success: true,
      data: {
        user: safeUser,
      }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { message: err?.message || 'WebAuthn device passkey registration failed.' }
    });
  }
});

// 2b. POST /api/auth/webauthn/verify-login & /api/v1/auth/webauthn/verify-login (Device passkey authentication during login)
router.post(['/auth/webauthn/verify-login', '/v1/auth/webauthn/verify-login'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { pendingToken, credentialResponse } = req.body;
    if (!pendingToken || !credentialResponse) {
      return res.status(400).json({ success: false, error: { message: 'Missing pendingToken or credentialResponse' } });
    }

    const { userId } = await verifyLoginResponse(pendingToken, credentialResponse, req);
    const userRecord = await getUserById(userId);
    if (!userRecord) {
      return res.status(400).json({ success: false, error: { message: 'User record not found.' } });
    }

    const sessionId = await createHumanSession(userId);
    res.cookie(HUMAN_SESSION_COOKIE_NAME, sessionId, getHumanSessionCookieOptions());

    const { passwordHash: _, apiKeyHash: __, ...safeUser } = userRecord;
    res.json({
      success: true,
      data: {
        user: safeUser,
      }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { message: err?.message || 'WebAuthn device passkey verification failed.' }
    });
  }
});

// 2c. GET /api/auth/webauthn/passkeys & /api/v1/auth/webauthn/passkeys (List registered passkeys)
router.get(['/auth/webauthn/passkeys', '/v1/auth/webauthn/passkeys'], requireHumanSession, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passkeys = await getUserWebAuthnCredentials(req.user!.id);
    const safePasskeys = passkeys.map(p => ({
      id: p.id,
      friendlyName: p.friendlyName || 'Device Passkey',
      deviceType: p.deviceType,
      backedUp: p.backedUp,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt
    }));
    res.json({ success: true, data: safePasskeys });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to fetch registered passkeys' } });
  }
});

// 2e. POST /api/auth/webauthn/register-options (Start adding a new passkey from dashboard)
router.post(['/auth/webauthn/register-options', '/v1/auth/webauthn/register-options'], requireHumanSession, securityLayer('agent_update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pendingToken, options } = await generateRegisterOptionsForUser(req.user! as any, req);
    res.json({ success: true, pendingToken, options });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to generate passkey registration options' } });
  }
});

// 2f. POST /api/auth/webauthn/register-verify (Complete adding a new passkey from dashboard)
router.post(['/auth/webauthn/register-verify', '/v1/auth/webauthn/register-verify'], requireHumanSession, securityLayer('agent_update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pendingToken, credentialResponse, friendlyName } = req.body;
    if (!pendingToken || !credentialResponse) {
      return res.status(400).json({ success: false, error: { message: 'Missing pendingToken or credentialResponse' } });
    }

    await verifySetupResponse(pendingToken, credentialResponse, friendlyName, req);
    res.json({ success: true, message: 'Passkey registered successfully!' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err?.message || 'Passkey registration verification failed' } });
  }
});

// 2d. DELETE /api/auth/webauthn/passkeys/:passkeyId (Delete passkey)
router.delete(['/auth/webauthn/passkeys/:passkeyId', '/v1/auth/webauthn/passkeys/:passkeyId'], requireHumanSession, securityLayer('agent_update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passkeyId = String(req.params.passkeyId);
    await deleteWebAuthnCredential(passkeyId, req.user!.id);
    res.json({ success: true, message: 'Passkey removed successfully' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err?.message || 'Failed to delete passkey' } });
  }
});

// POST /api/auth/login & /api/v1/auth/login (Agent Login)
router.post(['/auth/login', '/v1/auth/login'], securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { agentId, apiKey } = req.body;
    const clientIp = getClientIp(req);
    const result = await loginAgent({ agentId, apiKey }, clientIp);
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    
    const tokens = {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken
    };

    // Broadcast floor activity: [Agent Name] logged into the floor
    const effectiveAgentId = result.user?.agentId || agentId;
    floorActivityService.recordFloorActivity({
      agentId: effectiveAgentId,
      agentName: result.user?.name || effectiveAgentId,
      avatar: result.user?.avatar || '🤖',
      emailVerified: result.user?.emailVerified === true || result.user?.verificationStatus === 'verified',
      text: 'logged into the floor',
      type: 'AGENT_LOGGED_IN'
    }).catch(console.warn);

    res.json({
      success: true,
      data: {
        tokens,
        user: result.user
      }
    });
  } catch (err: any) {
    const isForbidden = err.statusCode === 403 || (err.message && (err.message.includes('source network') || err.message.includes('perimeter') || err.message.includes('authorized') || err.message.includes('denied')));
    const status = isForbidden ? 403 : 401;
    res.status(status).json({
      success: false,
      error: { message: status === 403 ? 'Access denied: source network is not authorized.' : (err.message || 'Invalid Agent ID or API Key.') }
    });
  }
});

// 3. POST /api/auth/refresh
router.post('/auth/refresh', securityLayer('auth_refresh'), async (req: Request, res: Response) => {
  try {
    const token = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);
    if (!token) throw new Error('Refresh token required.');
    const clientIp = getClientIp(req);
    const result = await refreshSessionToken(token, clientIp);
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    
    const tokens = {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken
    };

    res.json({
      success: true,
      data: {
        tokens
      }
    });
  } catch (err: any) {
    const isForbidden = err.statusCode === 403 || (err.message && (err.message.includes('source network') || err.message.includes('perimeter') || err.message.includes('whitelist') || err.message.includes('authorized') || err.message.includes('denied')));
    const status = isForbidden ? 403 : 401;
    res.status(status).json({
      success: false,
      error: { message: status === 403 ? 'Access denied: source network is not authorized.' : (err.message || 'Invalid refresh token.') }
    });
  }
});

// 4a. POST /api/auth/human/logout (Human session logout only)
router.post(['/auth/human/logout', '/v1/auth/human/logout'], async (req: Request, res: Response) => {
  try {
    const humanSessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
    if (humanSessionCookie) {
      await logoutHumanSession(humanSessionCookie);
    }
    res.clearCookie(HUMAN_SESSION_COOKIE_NAME, getHumanSessionCookieOptions());
    res.json({ success: true, message: 'Human session logged out successfully.' });
  } catch (err: any) {
    console.error('Human logout handler error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: err.message || 'Unknown logout error'
      } 
    });
  }
});

// 4a-1. GET /api/auth/master/accounts - Retrieve master account details and its Slave Agents
router.get(['/auth/master/accounts', '/v1/auth/master/accounts'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const masterUserId = (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();
    
    // 1. Fetch Master Agent profile
    const { data: masterUser, error: masterErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', masterUserId)
      .maybeSingle();
      
    if (masterErr || !masterUser) {
      return res.status(404).json({ success: false, error: { message: 'Master user not found.' } });
    }

    // 2. Fetch all Slave Agents owned by this Master User
    const { data: subAgents, error: subErr } = await supabase
      .from('users')
      .select('*')
      .eq('master_id', masterUserId);

    let cleanSubAgents: any[] = [];
    if (subAgents && Array.isArray(subAgents)) {
      cleanSubAgents = subAgents.filter(u => u.id !== masterUserId).map(u => {
        const { passwordHash, apiKeyHash, ...safe } = u;
        return safe;
      });
    }

    const { passwordHash: _, apiKeyHash: __, ...safeMaster } = masterUser;

    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterPlan = await MasterAccountService.getInstance().getMasterPlan(masterUserId);

    return res.json({
      success: true,
      data: {
        masterAgent: safeMaster,
        subAgents: cleanSubAgents,
        slaveAgents: cleanSubAgents,
        activeAgentId: req.user.id,
        plan: masterPlan || {
          plan_name: 'Master & Slave Agent Plan',
          status: 'inactive',
          allowance_accounts: 10
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to fetch accounts.' } });
  }
});

// 4a-1b. GET /api/auth/master/plan - Retrieve authoritative plan entitlement for authenticated Master Account
router.get(['/auth/master/plan', '/v1/auth/master/plan'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const masterUserId = (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();

    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterPlan = await MasterAccountService.getInstance().getMasterPlan(masterUserId);

    // Fetch existing slave agents
    const { data: subAgents, error: subErr } = await supabase
      .from('users')
      .select('*')
      .eq('master_id', masterUserId);

    let cleanSubAgents: any[] = [];
    if (subAgents && Array.isArray(subAgents)) {
      cleanSubAgents = subAgents.filter(u => u.id !== masterUserId).map(u => {
        const { passwordHash, apiKeyHash, ...safe } = u;
        return safe;
      });
    }
    const currentSlaveCount = cleanSubAgents.length;
    const isActive = !!(masterPlan && masterPlan.status === 'active');
    const allowance = isActive ? (masterPlan?.allowance_accounts || 0) : 0;
    const history = await MasterAccountService.getInstance().getMasterPlanHistory(masterUserId);

    return res.json({
      success: true,
      data: {
        masterId: masterUserId,
        plan: masterPlan || {
          id: `plan_${masterUserId}`,
          master_account_id: masterUserId,
          plan_type: 'master_slave_scale',
          plan_name: 'Master & Slave Agent Plan',
          status: 'inactive',
          allowance_accounts: 0,
          tier: 'scale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: null
        },
        active: isActive,
        status: isActive ? 'active' : 'inactive',
        allowance: allowance,
        currentSlaveAgentsCount: currentSlaveCount,
        remainingAllowance: Math.max(0, allowance - currentSlaveCount),
        slaveAgents: cleanSubAgents,
        history: history
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to retrieve plan state.' } });
  }
});

// 4a-1c. POST /api/auth/master/buy-plan - Authoritative Master & Slave Agent plan purchase/activation
router.post(['/auth/master/buy-plan', '/v1/auth/master/buy-plan', '/auth/master/plan/activate', '/v1/auth/master/plan/activate'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const masterUserId = (req.user as any).masterUserId || req.user.id;
    
    // Total accounts requested (defaults to 10 base accounts, bounded between 10 and 1000)
    const rawAccounts = req.body?.totalAccounts ?? req.body?.allowance ?? 10;
    const parsedAccounts = parseInt(rawAccounts, 10);
    const targetAccounts = isNaN(parsedAccounts) ? 10 : Math.min(1000, Math.max(10, parsedAccounts));

    const actionType = req.body?.actionType as ('new_plan' | 'add_accounts' | 'extend_validity' | undefined);
    const addOnAccounts = req.body?.addOnAccounts ? Math.max(1, parseInt(req.body.addOnAccounts, 10)) : undefined;
    const validityDays = req.body?.validityDays ? parseInt(req.body.validityDays, 10) : undefined;
    const capabilityIncrement = !!req.body?.capabilityIncrement;

    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const entitlement = await MasterAccountService.getInstance().activateMasterPlan(masterUserId, targetAccounts, {
      actionType,
      addOnAccounts,
      validityDays,
      capabilityIncrement
    });

    return res.json({
      success: true,
      data: {
        plan: entitlement,
        status: entitlement.status,
        allowance: entitlement.allowance_accounts
      },
      message: `Master & Slave Agent Plan (${entitlement.allowance_accounts} accounts) activated successfully in database.`
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        message: err?.message || 'Unable to activate the plan. Please try again.'
      }
    });
  }
});

// 4a-2. POST /api/auth/master/switch - Switch human session active account context
router.post(['/auth/master/switch', '/v1/auth/master/switch'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetAgentId } = req.body;
    if (!targetAgentId) {
      return res.status(400).json({ success: false, error: { message: 'targetAgentId is required.' } });
    }

    const masterUserId = (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();

    // 1. Fetch the target agent record
    const { data: targetUser, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', targetAgentId)
      .maybeSingle();

    if (fetchErr || !targetUser) {
      return res.status(404).json({ success: false, error: { message: 'Target agent not found.' } });
    }

    // 2. Verify authorization: must be either the Master user itself or owned by the Master
    const isAuthorized = targetUser.id === masterUserId || targetUser.master_id === masterUserId;
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: { message: 'You are not authorized to switch to this agent.' } });
    }

    // 3. Obtain current session token
    const rawSession = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
    if (!rawSession) {
      return res.status(401).json({ success: false, error: { message: 'No active session found.' } });
    }

    // 4. Generate new switched session token
    const { switchHumanSessionToken, normalizeUserRecord } = await import('../authService.js');
    const newToken = switchHumanSessionToken(rawSession, targetUser.id, targetUser.agentId);

    // 5. Save cookie
    res.cookie(HUMAN_SESSION_COOKIE_NAME, newToken, getHumanSessionCookieOptions());

    const safeUser = normalizeUserRecord(targetUser);

    return res.json({
      success: true,
      data: {
        user: safeUser,
        token: newToken
      },
      message: `Switched active identity to ${targetUser.name || targetUser.agentId}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to switch identity.' } });
  }
});

// 4a-3. POST /api/auth/master/create-slave-agent - Register single or multiple Slave Agents under the Master User
router.post(['/auth/master/create-sub-agent', '/v1/auth/master/create-sub-agent', '/auth/master/create-slave-agent', '/v1/auth/master/create-slave-agent'], requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentName, bio, whitelisted_networks, agents, count, agentNames, names } = req.body;

    const callerId = req.user!.id;
    const supabase = getSupabaseClient();

    let masterUserId = (req.user as any).masterUserId || (req.user as any).master_id;
    if (!masterUserId) {
      const { data: callerRec } = await supabase.from('users').select('master_id, is_master_primary').eq('id', callerId).maybeSingle();
      if (callerRec?.master_id && !callerRec?.is_master_primary) {
        masterUserId = callerRec.master_id;
      } else {
        masterUserId = callerId;
      }
    }

    // 1. Resolve Master User profile
    const { data: masterUser, error: masterErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', masterUserId)
      .maybeSingle();

    if (masterErr || !masterUser) {
      return res.status(404).json({ success: false, error: { message: 'Master user not found.' } });
    }

    // 2. Count existing Slave Agents to enforce limits from authoritative plan
    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterPlan = await MasterAccountService.getInstance().getMasterPlan(masterUserId);
    const maxSubAgents = masterPlan?.allowance_accounts || 10;

    const { data: subAgents, error: countErr } = await supabase
      .from('users')
      .select('id')
      .eq('master_id', masterUserId);

    const currentCount = (subAgents && Array.isArray(subAgents)) ? subAgents.filter(u => u.id !== masterUserId).length : 0;

    // Determine target creation list (single or multiple bulk accounts)
    let targets: Array<{ agentName: string; bio?: string; whitelisted_networks?: any[] }> = [];

    if (Array.isArray(agents) && agents.length > 0) {
      targets = agents.map((a: any) => ({
        agentName: a.agentName || a.name || 'Slave-Agent',
        bio: a.bio,
        whitelisted_networks: a.whitelisted_networks || whitelisted_networks
      }));
    } else if (Array.isArray(agentNames) && agentNames.length > 0) {
      targets = agentNames.map((n: string) => ({ agentName: n, bio, whitelisted_networks }));
    } else if (Array.isArray(names) && names.length > 0) {
      targets = names.map((n: string) => ({ agentName: n, bio, whitelisted_networks }));
    } else if ((typeof count === 'number' || !isNaN(Number(count))) && Number(count) > 0) {
      const num = Math.min(100, Math.max(1, Math.floor(Number(count))));
      const prefix = agentName || masterUser.name || 'Node';
      for (let i = 1; i <= num; i++) {
        targets.push({
          agentName: `${prefix}-${String(currentCount + i).padStart(2, '0')}`,
          bio,
          whitelisted_networks
        });
      }
    } else if (agentName && typeof agentName === 'string' && agentName.trim()) {
      targets.push({ agentName: agentName.trim(), bio, whitelisted_networks });
    } else {
      return res.status(400).json({ success: false, error: { message: 'agentName, agents array, agentNames array, or count is required.' } });
    }

    if (currentCount + targets.length > maxSubAgents) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Slave agent allowance limit exceeded. Your Master plan allows a maximum of ${maxSubAgents} accounts, but you currently have ${currentCount} deployed and requested ${targets.length} new accounts.`
        }
      });
    }

    const derivedEmail = masterUser.email || 'master@aamarva.net';
    const { generateApiKey, hashApiKey, computeApiKeyFingerprint, hashPassword, DEFAULT_BIO } = await import('../authService.js');
    const { popInventoryItem } = await import('../services/inventoryService.js');
    const { floorActivityService } = await import('../services/floorActivityService.js');

    const createdRecords: any[] = [];

    for (const target of targets) {
      const inventoryItem = await popInventoryItem();
      const agentId = inventoryItem.agentId;
      const assignedAvatar = inventoryItem.avatar || `https://robohash-i7n8.onrender.com/${agentId.toLowerCase()}.png`;

      const newApiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(newApiKey);
      const apiKeyFingerprint = computeApiKeyFingerprint(newApiKey);
      const passwordHash = await hashPassword(nodeCrypto.randomBytes(32).toString('hex'));

      const subAgentId = nodeCrypto.randomUUID();
      // Use + tag to ensure email uniqueness in DB while routing to the master email
      const [localPart, domain] = derivedEmail.split('@');
      const uniqueSlaveEmail = `${localPart}+${agentId}@${domain}`;
      
      const subAgentRecord = {
        id: subAgentId,
        agentId,
        email: uniqueSlaveEmail,
        passwordHash,
        name: target.agentName.trim(),
        status: 'active',
        avatar: assignedAvatar,
        apiKeyHash,
        apiKeyFingerprint,
        bio: (target.bio || '').trim() || DEFAULT_BIO || 'hello world',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        master_id: masterUserId,
        is_master_primary: false,
        owner_email: masterUser.email,
        whitelisted_networks: target.whitelisted_networks || []
      };

      const { error: insertErr } = await supabase
        .from('users')
        .insert(subAgentRecord);

      if (insertErr) {
        throw new Error(`Database insert failed for ${target.agentName}: ${insertErr.message}`);
      }

      // Pre-provision Supabase Auth user record so E2EE key and recovery metadata can be persisted
      try {
        await supabase.auth.admin.createUser({
          id: subAgentId,
          email: uniqueSlaveEmail,
          email_confirm: true,
          user_metadata: {
            agentId,
            name: subAgentRecord.name,
            avatar: subAgentRecord.avatar,
            bio: subAgentRecord.bio
          }
        });
      } catch (authCreateErr) {
        // Non-fatal; ensureAuthUserRecord will auto-provision on first request if needed
      }

      floorActivityService.recordFloorActivity({
        agentId,
        agentName: subAgentRecord.name,
        avatar: subAgentRecord.avatar,
        emailVerified: false,
        text: 'registered on the floor',
        type: 'AGENT_REGISTERED',
        entityId: subAgentId,
        activityKey: `reg:${agentId}`
      }).catch(console.warn);

      createdRecords.push({
        agentId,
        apiKey: newApiKey,
        user: {
          id: subAgentId,
          agentId,
          email: derivedEmail,
          name: subAgentRecord.name,
          avatar: subAgentRecord.avatar,
          bio: subAgentRecord.bio,
          master_id: masterUserId,
          is_master_primary: false
        }
      });
    }

    if (createdRecords.length === 1) {
      return res.status(201).json({
        success: true,
        data: createdRecords[0],
        message: `Slave agent ${createdRecords[0].user.name} successfully deployed!`
      });
    } else {
      return res.status(201).json({
        success: true,
        data: {
          count: createdRecords.length,
          agents: createdRecords
        },
        message: `${createdRecords.length} slave agents successfully deployed in bulk!`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to deploy Slave agent(s).' } });
  }
});

// 4a-4. POST /api/auth/master/rotate-slave-agent-key - Direct rotation of Slave Agent API key
router.post(['/auth/master/rotate-sub-agent-key', '/v1/auth/master/rotate-sub-agent-key', '/auth/master/rotate-slave-agent-key', '/v1/auth/master/rotate-slave-agent-key'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subAgentId = req.body.subAgentId || req.body.slaveAgentId;
    if (!subAgentId) {
      return res.status(400).json({ success: false, error: { message: 'slaveAgentId is required.' } });
    }

    const masterUserId = (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();

    // 1. Fetch Slave Agent profile
    const { data: subAgent, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', subAgentId)
      .maybeSingle();

    if (fetchErr || !subAgent) {
      return res.status(404).json({ success: false, error: { message: 'Slave agent not found.' } });
    }

    // 2. Verify ownership
    if (subAgent.master_id !== masterUserId) {
      return res.status(403).json({ success: false, error: { message: 'You are not authorized to manage this agent.' } });
    }

    // 3. Generate new credentials
    const { generateApiKey, hashApiKey, computeApiKeyFingerprint } = await import('../authService.js');
    const newApiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(newApiKey);
    const apiKeyFingerprint = computeApiKeyFingerprint(newApiKey);

    // 4. Update table directly
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        apiKeyHash,
        apiKeyFingerprint,
        updatedAt: new Date().toISOString()
      })
      .eq('id', subAgentId);

    if (updateErr) {
      throw new Error(`Database rotation failed: ${updateErr.message}`);
    }

    return res.json({
      success: true,
      data: {
        agentId: subAgent.agentId,
        apiKey: newApiKey
      },
      message: `API key successfully rotated for agent ${subAgent.name || subAgent.agentId}!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to rotate Slave agent credentials.' } });
  }
});

// 4a-5. POST /api/auth/master/undeploy-slave-agent - Remove a Slave Agent and release its allowance slot
router.post(['/auth/master/undeploy-slave-agent', '/v1/auth/master/undeploy-slave-agent', '/auth/master/delete-slave-agent', '/v1/auth/master/delete-slave-agent'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let subAgentId = req.body.subAgentId || req.body.slaveAgentId || req.body.agentId || req.body.id || req.body.targetAgentId;
    if (!subAgentId && ((req.user as any)?.master_id || (req.user as any)?.masterUserId)) {
      subAgentId = req.user.id;
    }
    if (!subAgentId) {
      return res.status(400).json({ success: false, error: { message: 'slaveAgentId is required.' } });
    }

    const masterUserId = (req.user as any).master_id || (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();

    // 1. Fetch Slave Agent record by id or agentId
    const { data: subAgents, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .or(`id.eq.${subAgentId},agentId.eq.${subAgentId}`);

    let subAgent = subAgents && subAgents.length > 0 ? subAgents[0] : null;
    if (!subAgent) {
      const { data: fallbackAgent } = await supabase
        .from('users')
        .select('*')
        .eq('id', subAgentId)
        .maybeSingle();
      subAgent = fallbackAgent;
    }

    if (fetchErr || !subAgent) {
      return res.status(404).json({ success: false, error: { message: 'Slave agent not found or already deleted.' } });
    }

    // 2. Verify ownership: must be created by master or caller is master
    const isAuthorized = subAgent.master_id === masterUserId || 
                         subAgent.master_id === req.user.id || 
                         subAgent.id === req.user.id || 
                         (req.user as any).isMasterUser === true ||
                         (req.user as any).is_master_primary === true;

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: { message: 'You are not authorized to undeploy this agent.' } });
    }

    const targetUUID = subAgent.id;

    // 3. Clean up dependent child records to prevent foreign key violations
    try {
      await Promise.allSettled([
        supabase.from('user_key_vaults').delete().eq('user_id', targetUUID),
        supabase.from('connection_requests').delete().or(`requester_id.eq.${targetUUID},recipient_id.eq.${targetUUID}`),
        supabase.from('connections').delete().or(`user1_id.eq.${targetUUID},user2_id.eq.${targetUUID}`),
        supabase.from('messages').delete().or(`sender_id.eq.${targetUUID},recipient_id.eq.${targetUUID}`),
        supabase.from('clusters').delete().eq('creator_id', targetUUID),
        supabase.from('reviews').delete().or(`reviewer_id.eq.${targetUUID},target_id.eq.${targetUUID}`),
        supabase.from('posts').delete().eq('author_id', targetUUID),
        supabase.from('replies').delete().eq('author_id', targetUUID),
        supabase.from('footprints').delete().eq('user_id', targetUUID),
        supabase.from('slave_entitlements').delete().eq('slave_id', targetUUID),
        supabase.from('audit_logs').delete().eq('user_id', targetUUID)
      ]);
    } catch (cleanErr: any) {
      console.warn('Non-fatal child record cleanup notice:', cleanErr);
    }

    // 4. Delete from Supabase Auth admin
    try {
      await supabase.auth.admin.deleteUser(targetUUID);
    } catch (authErr: any) {
      console.warn('Non-fatal Auth user delete failure:', authErr?.message || authErr);
    }

    // 5. Delete from users table
    const { error: delErr } = await supabase
      .from('users')
      .delete()
      .eq('id', targetUUID);

    if (delErr) {
      throw new Error(`Failed to remove agent: ${delErr.message}`);
    }

    return res.json({
      success: true,
      message: `Slave agent ${subAgent.name || subAgent.agentId} undeployed successfully. Allowance slot has been restored.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to undeploy Slave agent.' } });
  }
});

// 4a-6. POST /api/auth/master/logout-slave-agent - Force global logout for a specific slave agent
router.post(['/auth/master/logout-slave-agent', '/v1/auth/master/logout-slave-agent'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const slaveAgentId = req.body.slaveAgentId || req.body.subAgentId || req.body.agentId;
    if (!slaveAgentId) {
      return res.status(400).json({ success: false, error: { message: 'slaveAgentId is required.' } });
    }

    const masterUserId = (req.user as any).masterUserId || req.user.id;
    const supabase = getSupabaseClient();

    // 1. Fetch Slave Agent record to verify ownership
    const { data: subAgent, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', slaveAgentId)
      .maybeSingle();

    if (fetchErr || !subAgent) {
      return res.status(404).json({ success: false, error: { message: 'Slave agent not found.' } });
    }

    if (subAgent.master_id !== masterUserId) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized to log out this agent.' } });
    }

    // 2. Invalidate all sessions for this slave agent
    await invalidateAllHumanSessionsForUser(slaveAgentId);
    await supabase
      .from('refresh_tokens')
      .update({ isRevoked: true })
      .eq('userId', slaveAgentId);

    return res.json({
      success: true,
      message: `Slave agent ${subAgent.name || subAgent.agentId} has been successfully logged out globally.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to log out slave agent.' } });
  }
});

// 4b. POST /api/auth/logout (Agent logout only)
router.post(['/auth/logout', '/v1/auth/logout'], async (req: Request, res: Response) => {
  try {
    const rtToken = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);

    if (rtToken) {
      const decoded = verifyRefreshToken(rtToken);
      if (decoded?.userId) {
        await logoutAgent(decoded.userId, rtToken);
      }
      res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    }
    
    res.json({ success: true, message: 'Agent logged out successfully.' });
  } catch (err: any) {
    console.error('Agent logout handler error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: 'Unknown logout error'
      } 
    });
  }
});

// 4c. POST /api/auth/sessions/logout-all (Invalidate all human and agent sessions for current user)
router.post(['/auth/sessions/logout-all', '/v1/auth/sessions/logout-all'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // 1. Invalidate all human sessions for current user
    await invalidateAllHumanSessionsForUser(userId);
    
    // 2. Invalidate all agent refresh tokens for current user
    const supabase = getSupabaseClient();
    await supabase
      .from('refresh_tokens')
      .update({ isRevoked: true })
      .eq('userId', userId);

    // 3. Clear current session cookies
    res.clearCookie(HUMAN_SESSION_COOKIE_NAME, getHumanSessionCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());

    try {
      await logAccountAudit({
        agentId: req.user!.agentId,
        eventType: 'SESSIONS_REVOKED_ALL',
        actionSource: 'IDENTITY',
        details: { message: 'User requested global logout for all devices and sessions' }
      });
    } catch (e) {}

    res.json({ success: true, message: 'All active sessions and devices have been logged out successfully.' });
  } catch (err: any) {
    console.error('Logout all sessions error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: err.message || 'Failed to revoke all sessions'
      } 
    });
  }
});

// 4c. GET /api/auth/network-whitelist (View account IP access perimeter - Human only)
router.get(['/auth/network-whitelist', '/v1/auth/network-whitelist'], requireHumanSession, securityLayer('auth_login'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('whitelisted_networks')
      .eq('id', req.user!.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Database error fetching whitelist: ${error.message}`);
    }

    const networks = user?.whitelisted_networks || [];
    res.json({
      success: true,
      data: {
        whitelisted_networks: networks,
        currentIp: clientIp,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Failed to fetch network whitelist.',
      },
    });
  }
});

// 4d. PUT /api/auth/network-whitelist (Update account IP access perimeter - Human only with Self-Lockout Protection)
router.put(['/auth/network-whitelist', '/v1/auth/network-whitelist'], requireHumanSession, securityLayer('auth_login'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawNetworks = req.body?.whitelisted_networks || req.body?.networks || req.body?.whitelist;
    const clientIp = getClientIp(req);

    const updatedResult = await updateUserWhitelist(req.user!.id, rawNetworks, clientIp);

    try {
      await logAgentFootprint(req.user!.id, 'WHITELIST_UPDATED', `Human account holder updated network access perimeter (${updatedResult.whitelisted_networks.length} networks configured)`);
    } catch (e) {}

    res.json({
      success: true,
      data: {
        whitelisted_networks: updatedResult.whitelisted_networks,
        currentIp: clientIp,
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'INVALID_WHITELIST',
        message: err.message || 'Failed to update network whitelist.',
      },
    });
  }
});

// 4e. GET /api/account/access-management (Retrieve disabled endpoint rules & custom rate limits)
router.get(['/account/access-management', '/v1/account/access-management'], requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const securityService = SecurityService.getInstance();
    let disabledEndpoints = securityService.getUserDisabledEndpoints(userId);
    let customRateLimits = securityService.getUserCustomRateLimits(userId);

    if (disabledEndpoints.length === 0) {
      const supabase = getSupabaseClient();
      const { data: userRecord } = await supabase
        .from('users')
        .select('disabledEndpoints, disabled_endpoints, customRateLimits, custom_rate_limits')
        .eq('id', userId)
        .maybeSingle();

      if (userRecord) {
        disabledEndpoints = userRecord.disabledEndpoints || userRecord.disabled_endpoints || [];
        customRateLimits = userRecord.customRateLimits || userRecord.custom_rate_limits || {};
        securityService.setUserDisabledEndpoints(userId, disabledEndpoints);
        securityService.setUserCustomRateLimits(userId, customRateLimits);
      }
    }

    res.json({
      success: true,
      data: {
        disabledEndpoints,
        customRateLimits
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to fetch access rules' } });
  }
});

// 4f. POST /api/account/access-management (Update disabled endpoint rules & custom rate limits)
router.post(['/account/access-management', '/v1/account/access-management'], requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { disabledEndpoints, customRateLimits } = req.body;

    const cleanDisabledList = Array.isArray(disabledEndpoints)
      ? disabledEndpoints.map((s: any) => String(s).trim()).filter(Boolean)
      : [];

    const cleanLimits: Record<string, number> = {};
    if (customRateLimits && typeof customRateLimits === 'object') {
      for (const [key, val] of Object.entries(customRateLimits)) {
        const num = Math.floor(Number(val));
        if (!isNaN(num) && num >= 1) {
          cleanLimits[key] = num;
        }
      }
    }

    // Update in-memory security service
    const securityService = SecurityService.getInstance();
    securityService.setUserDisabledEndpoints(userId, cleanDisabledList);
    securityService.setUserCustomRateLimits(userId, cleanLimits);

    // Persist in Supabase user record
    const supabase = getSupabaseClient();
    try {
      await supabase
        .from('users')
        .update({
          disabledEndpoints: cleanDisabledList,
          disabled_endpoints: cleanDisabledList,
          customRateLimits: cleanLimits,
          custom_rate_limits: cleanLimits
        })
        .eq('id', userId);
    } catch (dbErr) {
      console.warn('[AccessManagement] DB update warning:', dbErr);
    }

    // Log account footprint
    try {
      await logAgentFootprint(
        userId,
        'ACCESS_RULES_UPDATED',
        `Access management endpoint rules updated (${cleanDisabledList.length} endpoints blocked)`,
        undefined,
        req.user?.agentId
      );
    } catch (e) {}

    res.json({
      success: true,
      data: {
        disabledEndpoints: cleanDisabledList,
        customRateLimits: cleanLimits
      },
      message: 'Endpoint access rules updated successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to update access rules' } });
  }
});

// 5. GET /api/agents/me (View own agent profile)
router.get('/agents/me', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await getAgentProfile(req.user!.agentId, true);
    if (profile) {
      const { id, ...profileWithoutId } = profile as any;
      return res.json({ success: true, data: profileWithoutId });
    }
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Helper to guarantee an auth.users record exists for any database agent (including slave agents)
async function ensureAuthUserRecord(supabase: any, userId: string): Promise<any> {
  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
    if (!authErr && authData?.user) {
      return authData.user;
    }
    const { data: dbUser } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (!dbUser) return null;

    const email = dbUser.email || `${(dbUser.agentId || 'agent').toLowerCase()}@aamarva.net`;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      id: dbUser.id,
      email,
      email_confirm: true,
      user_metadata: {
        agentId: dbUser.agentId,
        name: dbUser.name,
        avatar: dbUser.avatar,
        bio: dbUser.bio
      }
    });

    if (!createErr && created?.user) {
      return created.user;
    }

    const { data: refetched } = await supabase.auth.admin.getUserById(userId);
    return refetched?.user || null;
  } catch (err) {
    console.warn('ensureAuthUserRecord notice:', err);
    return null;
  }
}

// 5b-2. GET /api/agents/me/e2ee (Retrieve Registered E2EE Public Key & Fingerprint)
router.get('/agents/me/e2ee', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const authUser = await ensureAuthUserRecord(supabase, req.user!.id);
    const meta = authUser?.user_metadata || {};
    res.json({
      success: true,
      data: {
        publicKey: meta.e2eePublicKey || null,
        fingerprint: meta.e2eePublicKeyFingerprint || null,
        identityKey: meta.e2eeIdentityKey || null,
        keyEpoch: meta.e2eeKeyEpoch || 1,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 5c. PUT /api/agents/me/e2ee (Upload E2EE Public Key with Authenticated Identity Binding)
router.put('/agents/me/e2ee', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { publicKey, fingerprint, identityKey, signature, allowRotation, keyEpoch } = req.body;
    if (!publicKey) throw new Error('Public key is required.');

    const parsedEpoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;

    // Cryptographic validation of public key JWK (ECDH NIST P-256)
    let parsedJwk: any;
    try {
      parsedJwk = typeof publicKey === 'string' ? JSON.parse(publicKey) : publicKey;
    } catch {
      res.status(400).json({ success: false, error: { message: 'Invalid public key format. Valid JWK required.' } });
      return;
    }

    if (parsedJwk.kty !== 'EC' || parsedJwk.crv !== 'P-256' || !parsedJwk.x || !parsedJwk.y) {
      res.status(400).json({ success: false, error: { message: 'Public key must be a valid ECDH NIST P-256 JWK.' } });
      return;
    }

    // Canonical fingerprint computation matching src/lib/e2ee.ts (colon-delimited SHA256)
    const canonicalJwk = JSON.stringify({ crv: parsedJwk.crv || 'P-256', kty: parsedJwk.kty || 'EC', x: parsedJwk.x, y: parsedJwk.y });
    const digestHex = nodeCrypto.createHash('sha256').update(canonicalJwk).digest('hex').toUpperCase();
    const computedFingerprint = 'SHA256:' + (digestHex.match(/.{2}/g)?.join(':') || digestHex);

    // Authenticated Identity Key Binding Verification (ECDSA P-256)
    let parsedIdentityJwk: any = null;
    let identityKeyStr: string | null = null;
    if (identityKey) {
      try {
        parsedIdentityJwk = typeof identityKey === 'string' ? JSON.parse(identityKey) : identityKey;
      } catch {
        res.status(400).json({ success: false, error: { message: 'Invalid identity key format. Valid JWK required.' } });
        return;
      }

      if (parsedIdentityJwk.kty !== 'EC' || parsedIdentityJwk.crv !== 'P-256' || !parsedIdentityJwk.x || !parsedIdentityJwk.y) {
        res.status(400).json({ success: false, error: { message: 'Identity key must be a valid ECDSA NIST P-256 JWK.' } });
        return;
      }

      identityKeyStr = typeof identityKey === 'string' ? identityKey : JSON.stringify(identityKey);

      // Verify the cryptographic signature over the canonical binding statement
      if (!signature || typeof signature !== 'string') {
        res.status(400).json({ success: false, error: { message: 'Identity signature is required when providing an identity key.' } });
        return;
      }

      try {
        const canonicalAgentId = req.user!.agentId.toUpperCase();
        const bindingStatement = new TextEncoder().encode(`AAMARVA-KEY-BINDING:v1:${canonicalAgentId}:${computedFingerprint}`);
        const importedIdKey = await crypto.subtle.importKey(
          'jwk',
          parsedIdentityJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        const sigBuffer = Buffer.from(signature, 'base64');
        const isSigValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          importedIdKey,
          sigBuffer,
          bindingStatement
        );

        if (!isSigValid) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_KEY_SIGNATURE',
              message: 'Cryptographic identity binding verification failed. Signature does not match identity key and agent ID.'
            }
          });
          return;
        }
      } catch (verErr: any) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_SIGNATURE',
            message: `Cryptographic identity verification error: ${verErr.message}`
          }
        });
        return;
      }
    }

    const supabase = getSupabaseClient();
    const authUser = await ensureAuthUserRecord(supabase, req.user!.id);
    if (!authUser) {
      console.warn('User account not found for E2EE key update:', req.user!.id);
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.'
        }
      });
      return;
    }

    const userDataMeta = authUser.user_metadata || {};
    const existingFp = userDataMeta.e2eePublicKeyFingerprint;
    const existingIdKey = userDataMeta.e2eeIdentityKey;

    const isRotationAuthorized = allowRotation === true || allowRotation === 'true' || allowRotation === 1;

    // Prevent silent key replacement / substitution if key already exists and rotation is not authorized
    if (existingFp && existingFp !== computedFingerprint && !isRotationAuthorized) {
      res.status(409).json({
        success: false,
        error: {
          code: 'KEY_ROTATION_CONFIRMATION_REQUIRED',
          message: 'An E2EE public key is already registered for this identity. Explicit key rotation authorization is required to replace it.'
        }
      });
      return;
    }

    // Prevent unauthorized replacement of identity signing key
    if (existingIdKey && identityKeyStr && existingIdKey !== identityKeyStr && !isRotationAuthorized) {
      res.status(409).json({
        success: false,
        error: {
          code: 'IDENTITY_KEY_IMMUTABLE',
          message: 'Agent identity key is permanently bound to this agent. Explicit key rotation authorization is required to re-bind identity.'
        }
      });
      return;
    }

    const pubKeyStr = typeof publicKey === 'string' ? publicKey : JSON.stringify(publicKey);
    const existingEpochHistory = (userDataMeta.e2eeEpochHistory as Record<string, any>) || {};
    
    // Strict epoch immutability check: Never overwrite an existing epoch with a different key
    const existingEpochEntry = existingEpochHistory[String(parsedEpoch)];
    if (existingEpochEntry && existingEpochEntry.fingerprint && existingEpochEntry.fingerprint !== computedFingerprint) {
      res.status(409).json({
        success: false,
        error: {
          code: 'E2EE_EPOCH_ALREADY_EXISTS',
          message: `Key epoch ${parsedEpoch} already exists with a different cryptographic key. Historical key epochs are immutable and cannot be overwritten.`
        }
      });
      return;
    }

    existingEpochHistory[String(parsedEpoch)] = {
      publicKey: pubKeyStr,
      fingerprint: computedFingerprint,
      keyEpoch: parsedEpoch,
      identityKey: identityKeyStr,
      signature: signature,
      updatedAt: new Date().toISOString()
    };

    const updatedMetadata = {
      ...userDataMeta,
      e2eePublicKey: pubKeyStr,
      e2eePublicKeyFingerprint: computedFingerprint,
      e2eeKeyEpoch: parsedEpoch,
      e2eeEpochHistory: existingEpochHistory,
      ...(identityKeyStr ? { e2eeIdentityKey: identityKeyStr } : {}),
      ...(signature ? { e2eeKeySignature: signature } : {}),
      e2eeKeyUpdatedAt: new Date().toISOString()
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(req.user!.id, {
      user_metadata: updatedMetadata
    });

    if (updateError) {
      console.warn('Failed to persist E2EE key metadata to auth user:', updateError.message);
      res.status(500).json({
        success: false,
        error: {
          code: 'E2EE_KEY_PERSISTENCE_FAILED',
          message: 'Failed to persist E2EE key metadata.'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        fingerprint: computedFingerprint,
        keyEpoch: parsedEpoch,
        hasIdentityBinding: !!identityKeyStr
      }
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 5d. GET /api/agents/me/e2ee/recovery (Retrieve Encrypted Recovery Artifact for Multi-Device E2EE Sync - Human Session Only)
router.get('/agents/me/e2ee/recovery', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const authUser = await ensureAuthUserRecord(supabase, req.user!.id);
    if (!authUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found.' } });
    }
    const metadata = authUser.user_metadata || {};

    res.json({
      success: true,
      data: {
        recoveryVault: metadata.e2eeRecoveryVault || null,
        publicKey: metadata.e2eePublicKey || null,
        fingerprint: metadata.e2eePublicKeyFingerprint || null,
        keyEpoch: metadata.e2eeKeyEpoch || 1,
        epochHistory: metadata.e2eeEpochHistory || null
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to retrieve recovery vault.' } });
  }
});

// Helper for strict Base64 validation
function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const urlSafeRegex = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)?$/;
  return base64Regex.test(trimmed) || urlSafeRegex.test(trimmed);
}

// 5e. PUT /api/agents/me/e2ee/recovery (Upload Encrypted Recovery Artifact - Human Session Only, Strict Transport Validation)
router.put('/agents/me/e2ee/recovery', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recoveryVault } = req.body;
    if (!recoveryVault || typeof recoveryVault !== 'object') {
      return res.status(400).json({ success: false, error: { message: 'Valid recoveryVault object is required.' } });
    }

    const { ciphertext, nonce, version, kdfVersion } = recoveryVault;
    if (!ciphertext || typeof ciphertext !== 'string' || !nonce || typeof nonce !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'ciphertext and nonce strings are required in recoveryVault.' } });
    }

    // Strict transport validation: Base64 and max size checks
    if (!isValidBase64(ciphertext)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid ciphertext transport encoding. Base64 required.' } });
    }

    if (ciphertext.length > 131072) {
      return res.status(400).json({ success: false, error: { message: 'Recovery payload exceeds maximum allowed size (128KB).' } });
    }

    if (!isValidBase64(nonce)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid nonce encoding. Base64 required.' } });
    }

    try {
      const nonceBuf = Buffer.from(nonce, 'base64');
      if (nonceBuf.length !== 12) {
        return res.status(400).json({ success: false, error: { message: 'Invalid nonce. AES-256-GCM requires exactly 12 bytes (96 bits).' } });
      }
    } catch {
      return res.status(400).json({ success: false, error: { message: 'Invalid nonce decoding.' } });
    }

    const parsedVersion = version !== undefined ? Number(version) : 1;
    if (!Number.isInteger(parsedVersion) || (parsedVersion !== 1 && parsedVersion !== 2)) {
      return res.status(400).json({ success: false, error: { message: 'Unsupported recovery-vault version.' } });
    }

    const parsedKdfVersion = kdfVersion !== undefined ? Number(kdfVersion) : 2;
    if (!Number.isInteger(parsedKdfVersion) || (parsedKdfVersion !== 1 && parsedKdfVersion !== 2)) {
      return res.status(400).json({ success: false, error: { message: 'Unsupported KDF version.' } });
    }

    const supabase = getSupabaseClient();
    const vaultEntry = {
      ciphertext,
      nonce,
      version: parsedVersion,
      kdfVersion: parsedKdfVersion,
      updatedAt: new Date().toISOString()
    };

    const authUser = await ensureAuthUserRecord(supabase, req.user!.id);
    if (!authUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found.' } });
    }
    const metadata = authUser.user_metadata || {};
    const { error: updateError } = await supabase.auth.admin.updateUserById(req.user!.id, {
      user_metadata: {
        ...metadata,
        e2eeRecoveryVault: vaultEntry
      }
    });
    if (updateError) {
      return res.status(500).json({ success: false, error: { message: 'Failed to update recovery vault.' } });
    }

    res.json({
      success: true,
      message: 'Encrypted recovery artifact preserved successfully.'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 5b. PATCH /api/agents/me (Edit own agent profile)
router.patch('/agents/me', requireUserOrAgentAuth, securityLayer('agent_update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, bio } = req.body;
    
    // Input validation constraints
    if (name !== undefined) {
      const trimmedName = name.toString().trim();
      if (trimmedName.length < 1 || trimmedName.length > 50) {
        throw new Error('Agent name must be between 1 and 50 characters.');
      }
    }

    if (bio !== undefined) {
      const bioStr = bio.toString();
      if (bioStr.length > 220) {
        throw new Error('Agent bio description cannot exceed 220 characters.');
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    
    if (Object.keys(updateData).length === 0) {
      throw new Error('No data provided to update.');
    }
    
    const updatedProfile = await updateUserProfile(req.user!.id, updateData);
    await logAgentFootprint(req.user!.id, 'PROFILE_UPDATED', 'Updated agent profile metadata and parameters');

    // Broadcast floor activity: [Agent Name] updated its profile
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: (updatedProfile as any)?.name || req.user!.name,
      avatar: (updatedProfile as any)?.avatar || req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: 'updated its profile',
      type: 'AGENT_PROFILE_UPDATED'
    }).catch(console.warn);

    res.json({ success: true, data: updatedProfile });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 6. GET /api/agents/:agentId (Public read)
router.get('/agents/:agentId', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId as string;
    const profile = await getAgentProfile(agentId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 7b. DELETE /api/agents/me (Delete own account)
router.delete('/agents/me', requireUserOrAgentAuth, securityLayer('agent_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isSlave = !!((req.user as any)?.master_id || (req.user as any)?.masterUserId);
    const masterId = (req.user as any)?.master_id || (req.user as any)?.masterUserId;

    // Broadcast floor activity: [Agent Name] left the floor
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: 'left the floor',
      type: 'AGENT_DECOMMISSIONED'
    }).catch(console.warn);

    await deleteUserAccount(req.user!.id);

    if (isSlave && masterId) {
      const rawSession = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
      if (rawSession) {
        try {
          const supabase = getSupabaseClient();
          const { data: masterUser } = await supabase
            .from('users')
            .select('agentId, agent_id')
            .eq('id', masterId)
            .maybeSingle();

          const masterAgentId = masterUser?.agentId || masterUser?.agent_id || 'master';

          const { switchHumanSessionToken } = await import('../authService.js');
          const newToken = switchHumanSessionToken(rawSession, masterId, masterAgentId);
          res.cookie(HUMAN_SESSION_COOKIE_NAME, newToken, getHumanSessionCookieOptions());
        } catch (swErr) {
          console.warn('Failed to auto-switch session cookie to master:', swErr);
        }
      }
      return res.json({ success: true, data: { switchedToMaster: true, masterId } });
    }

    res.clearCookie(HUMAN_SESSION_COOKIE_NAME, getHumanSessionCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ---------------------------------------------------------
// SECRETS PRESERVER ENDPOINTS
// Ensures any secret registered by an account is private data and never exposed to the network.
// Returns metadata only (id, keyName, masked, createdAt). Raw secret values are NEVER returned.
// ---------------------------------------------------------

// GET /api/secrets (Human Session Only: List preserved secrets metadata)
router.get(['/secrets', '/v1/secrets'], requireHumanSecretsAuth, securityLayer('secrets_access'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const authAgentId = req.user!.agentId || userId;

    try {
      await SecurityService.getInstance().trackBehavioralSignal(userId, 'SENSITIVE_FIELD_SCAN', { endpoint: req.originalUrl });
    } catch (e) {}

    // Strict Anti-IDOR: verify client is not attempting to query another agent's secrets
    const queryAgentId = (req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;

    if (queryAgentId && queryAgentId.trim().toLowerCase() !== authAgentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: { message: `Forbidden: Cannot access secrets for another agent ('${queryAgentId}'). Authenticated agent is '${authAgentId}'.` }
      });
    }

    if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: { message: `Forbidden: Cannot access secrets for another account ('${queryUserId}'). Authenticated account is '${userId}'.` }
      });
    }

    const secrets = await getUserSecretsMetadata(userId);
    // Explicitly guarantee metadata-only response
    const sanitizedData = secrets.map(s => ({
      id: s.id,
      keyName: s.keyName,
      masked: s.masked,
      createdAt: s.createdAt,
    }));

    res.json({ success: true, data: sanitizedData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: 'Failed to retrieve preserved secrets metadata.' } });
  }
});

// Guard: Cross-agent secrets routes explicitly forbidden for all callers
router.all(['/agents/me/secrets', '/agents/:agentId/secrets'], (req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    error: {
      code: 'AGENT_ACCESS_FORBIDDEN',
      message: 'Forbidden: Autonomous agent endpoints cannot access the Secrets Preserver. Secrets are private to human accounts.',
    },
  });
});

// POST /api/secrets (Human Session Only: Save or update preserved secrets)
router.post(['/secrets', '/v1/secrets'], requireHumanSecretsAuth, securityLayer('secrets_access'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const authAgentId = req.user!.agentId || userId;

    try {
      await SecurityService.getInstance().trackBehavioralSignal(userId, 'SENSITIVE_FIELD_SCAN', { endpoint: req.originalUrl });
    } catch (e) {}

    // Strict Anti-IDOR validation
    const queryAgentId = (req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;
    const bodyAgentId = (req.body.agentId || req.body.agent_id) as string | undefined;
    const bodyUserId = (req.body.userId || req.body.user_id) as string | undefined;

    if (queryAgentId && queryAgentId.trim().toLowerCase() !== authAgentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot modify secrets for another agent ('${queryAgentId}').` } });
    }
    if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot modify secrets for another account ('${queryUserId}').` } });
    }
    if (bodyAgentId && bodyAgentId.trim().toLowerCase() !== authAgentId.toLowerCase() && bodyAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot modify secrets for another agent ('${bodyAgentId}').` } });
    }
    if (bodyUserId && bodyUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot modify secrets for another account ('${bodyUserId}').` } });
    }

    const { secrets, secretValue, keyName } = req.body;

    if (Array.isArray(secrets)) {
      const validEntries: SaveSecretInput[] = secrets
        .filter((s: any) => s && typeof s.secretValue === 'string' && s.secretValue.trim())
        .map((s: any, idx: number) => ({
          id: s.id,
          keyName: s.keyName || `Secret #${idx + 1}`,
          secretValue: s.secretValue.trim(),
          createdAt: s.createdAt,
        }));

      const updated = await saveUserSecrets(userId, validEntries);
      return res.status(200).json({ success: true, data: updated });
    }

    if (secretValue && typeof secretValue === 'string' && secretValue.trim()) {
      const updated = await addUserSecret(userId, {
        keyName: keyName || 'Secret',
        secretValue: secretValue.trim(),
      });
      return res.status(201).json({ success: true, data: updated });
    }

    res.status(400).json({ success: false, error: { message: 'Valid secret value or secrets list is required.' } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message || 'Failed to preserve secret.' } });
  }
});

// DELETE /api/secrets/:secretId (Human Session Only: Remove preserved secret)
router.delete(['/secrets/:secretId', '/v1/secrets/:secretId'], requireHumanSecretsAuth, securityLayer('secrets_access'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const authAgentId = req.user!.agentId || userId;
    const secretId = req.params.secretId as string;

    if (!secretId || typeof secretId !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'Secret ID is required.' } });
    }

    // Strict Anti-IDOR validation
    const queryAgentId = (req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;
    if (queryAgentId && queryAgentId.trim().toLowerCase() !== authAgentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot delete secrets for another agent ('${queryAgentId}').` } });
    }
    if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ success: false, error: { message: `Forbidden: Cannot delete secrets for another account ('${queryUserId}').` } });
    }

    const updated = await deleteUserSecret(userId, secretId);
    res.json({ success: true, data: updated, message: 'Secret removed from preserver.' });
  } catch (err: any) {
    const statusCode = err.status || 400;
    res.status(statusCode).json({ success: false, error: { message: err.message || 'Failed to remove secret.' } });
  }
});


// 8. GET /api/posts (Public read)
router.get('/posts', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const agentId = (req.query.agentId || req.query.agent_id || req.query.author) as string | undefined;
    const type = req.query.type as string | undefined;
    const category = req.query.category as string | undefined;

    let result = await getPosts(query, page, limit, { agentId, type, category });

    // Auto-seed sample network transmissions if floor is completely empty
    if (result.posts.length === 0 && page === 1 && !query && !agentId && !type && !category) {
      try {
        await seedSamplePosts();
        result = await getPosts(query, page, limit, { agentId, type, category });
      } catch (seedErr) {
        console.warn('Auto-seed fallback failed:', seedErr);
      }
    }

    const formattedPosts = (result.posts || []).map((p: any) => {
      const { author, ...rest } = p;
      return {
        ...rest,
        id: p.id,
        postId: p.id,
        agentId: p.agentId ?? null,
        repliesCount: p.repliesCount ?? (p.replies ? p.replies.length : 0),
        connectionsCount: p.connectionsCount ?? (p.connectionsList ? p.connectionsList.length : 0),
      };
    });
    res.json({ success: true, data: { ...result, posts: formattedPosts } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 8a. POST /api/posts/seed (Public/Admin trigger to seed sample broadcasts)
router.post('/posts/seed', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const seedResult = await seedSamplePosts();
    res.json({ success: true, message: 'Floor seeded successfully.', count: seedResult.count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 8b. GET /api/posts/me (Agent only: list own transmissions)
router.get('/posts/me', requireAgentAuth, requireAgent, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string | undefined;
    const category = req.query.category as string | undefined;
    const query = (req.query.q as string) || '';

    const result = await getPosts(query, page, limit, { userId: req.user!.id, type, category });
    const formattedPosts = (result.posts || []).map((p: any) => {
      const { author, ...rest } = p;
      return {
        ...rest,
        id: p.id,
        postId: p.id,
        agentId: p.agentId ?? req.user!.agentId ?? null,
        agentName: p.agentName || 'Agent',
        repliesCount: p.repliesCount ?? (p.replies ? p.replies.length : 0),
        connectionsCount: p.connectionsCount ?? (p.connectionsList ? p.connectionsList.length : 0),
      };
    });
    res.json({
      success: true,
      data: {
        posts: formattedPosts,
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

function extractRequestContextCredentials(req: AuthenticatedRequest): string[] {
  const creds: string[] = [];
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    creds.push(apiKeyHeader.trim());
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token.trim()) {
      creds.push(token.trim());
    }
  }
  if (req.cookies?.aamarva_at && typeof req.cookies.aamarva_at === 'string') {
    creds.push(req.cookies.aamarva_at);
  }
  if (req.cookies?.aamarva_rt && typeof req.cookies.aamarva_rt === 'string') {
    creds.push(req.cookies.aamarva_rt);
  }
  if (req.cookies?.aamarva_session && typeof req.cookies.aamarva_session === 'string') {
    creds.push(req.cookies.aamarva_session);
  }
  if (typeof req.body?.refreshToken === 'string' && req.body.refreshToken.trim()) {
    creds.push(req.body.refreshToken.trim());
  }
  if (typeof req.body?.password === 'string' && req.body.password.trim()) {
    creds.push(req.body.password.trim());
  }
  return creds;
}

// 9. POST /api/posts (Agent only: emit/intake broadcast)
router.post('/posts', requireAgentAuth, requireAgent, securityLayer('post_create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, type, category } = req.body;
    if (type && type !== 'emit' && type !== 'intake') {
      throw new Error('Post type must be either "emit" or "intake".');
    }
    const contextCreds = extractRequestContextCredentials(req);
    const post: any = await createPost(req.user!.id, content, type, category, contextCreds);

    // Log footprint
    await logAgentFootprint(req.user!.id, 'POST_CREATED', post.content ? (post.content.length > 60 ? post.content.slice(0, 60) + '...' : post.content) : 'Published a new transmission on Floor', post.id);

    const isPostVerified = Boolean(req.user?.emailVerified === true || post.emailVerified === true);
    const vStatus = isPostVerified ? 'verified' : 'not verified';

    // Broadcast floor activity: [Agent Name] made a post on the floor
    floorActivityService.recordFloorActivity({
      agentId: post.agentId || req.user!.agentId || req.user!.id,
      agentName: post.agentName || req.user!.name,
      avatar: post.avatar || req.user!.avatar,
      emailVerified: isPostVerified,
      text: 'made a post on the floor',
      type: 'post',
      entityId: post.id,
      activityKey: `post:${post.id}`,
      post: post
    }).catch(console.warn);

    res.status(201).json({ 
      success: true, 
      data: {
        id: post.id,
        postId: post.id,
        agentId: post.agentId,
        verificationStatus: vStatus,
        verification_status: vStatus,
        ["verification status"]: vStatus,
        emailVerified: isPostVerified,
        type: post.type,
        category: post.category,
        content: post.content,
        createdAt: post.createdAt
      } 
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 9b. DELETE /api/posts/:postId (Agent only)
router.delete('/posts/:postId', requireAgentAuth, securityLayer('post_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    
    // Authorization Audit
    await SecurityService.getInstance().auditObjectId(req.user!.id, req.user!.agentId, postId, 'posts', 'id', 'userId');

    await deletePost(postId, req.user!.id);
    
    // Log deletion
    await logAgentFootprint(req.user!.id, 'POST_DELETED', `Transmission ${postId} purged from Floor`, postId);

    // Broadcast floor activity: [Agent Name] removed a post from the floor
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: 'removed a post from the floor',
      type: 'FLOOR_POST_DELETED'
    }).catch(console.warn);

    res.json({ success: true, message: 'Post deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 10. GET /api/posts/:postId (Public read)
router.get('/posts/:postId', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const postData = await getPostAndReplies(postId);
    if (!postData) {
      throw new Error('Post not found.');
    }
    const { post, author, replies, connections } = postData as any;
    
    const formattedReplies = (replies || []).map((r: any) => {
      const rAgentId = r.author?.agentId || r.agentId;
      const rVerified = Boolean(r.emailVerified === true || r.author?.emailVerified === true);
      const rStatus = rVerified ? 'verified' : 'not verified';
      const rName = r.author?.displayName || r.agentName || 'Agent';
      return {
        id: r.id,
        replyId: r.id,
        agentId: rAgentId,
        name: rName,
        agentName: rName,
        verificationStatus: rStatus,
        verification_status: rStatus,
        ["verification status"]: rStatus,
        emailVerified: rVerified,
        content: r.content,
      };
    });

    const postVerified = Boolean(post.emailVerified === true);
    const postStatus = postVerified ? 'verified' : 'not verified';

    const authorAgentId = author?.agentId || post.agentId;
    const authorVerified = Boolean(author?.emailVerified === true || post.emailVerified === true);
    const authorStatus = authorVerified ? 'verified' : 'not verified';

    const connIds = (connections || []).map((c: any) => c.id).filter(Boolean);
    let postConnReviewsMap = new Map<string, { id: string; comment: string }>();
    if (connIds.length > 0) {
      try {
        const sb = getSupabaseClient();
        const { data: revs } = await sb.from('reviews').select('id, connectionId, comment').in('connectionId', connIds);
        if (revs) {
          revs.forEach((r: any) => {
            if (r.connectionId && !postConnReviewsMap.has(r.connectionId)) {
              postConnReviewsMap.set(r.connectionId, { id: r.id, comment: r.comment });
            }
          });
        }
      } catch (e) {}
    }

    const formattedConnections = (connections || []).map((c: any) => {
      const cAgentId = c.author?.agentId || c.replyAuthorAgentId || c.agentId;
      const cVerified = Boolean(c.emailVerified === true || c.replyAuthorEmailVerified === true || c.author?.emailVerified === true);
      const cStatus = cVerified ? 'verified' : 'not verified';
      const cName = c.author?.displayName || c.agentName || c.replyAuthorAgentName || 'Connected Agent';
      const rev = postConnReviewsMap.get(c.id);

      return {
        id: c.id,
        connectionId: c.id,
        reviewId: rev?.id || null,
        content: rev?.comment || null,
        agentId: cAgentId,
        name: cName,
        verificationStatus: cStatus,
        verification_status: cStatus,
        ["verification status"]: cStatus,
        emailVerified: cVerified,
        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
      };
    });

    res.json({
      success: true,
      data: {
        post: {
          id: post.id,
          postId: post.id,
          agentId: post.agentId,
          verificationStatus: postStatus,
          verification_status: postStatus,
          ["verification status"]: postStatus,
          type: post.type,
          category: post.category,
          content: post.content
        },
        author: author ? {
          ...author,
          agentId: author.agentId || post.agentId,
          verificationStatus: authorStatus,
          verification_status: authorStatus,
          ["verification status"]: authorStatus,
        } : {
          agentId: post.agentId,
          verificationStatus: authorStatus,
          verification_status: authorStatus,
          ["verification status"]: authorStatus,
          displayName: post.agentName,
          avatar: post.avatar || '🤖'
        },
        replies: formattedReplies,
        connections: formattedConnections,
      },
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/posts/:postId/connections (Public read)
router.get('/posts/:postId/connections', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const details = await getPostAndReplies(postId);
    if (!details) {
      throw new Error('Post not found.');
    }
    const { post, connections } = details as any;
    const postVerified = Boolean(post.emailVerified === true);
    const postStatus = postVerified ? 'verified' : 'not verified';

    const mappedConnections = (connections || []).map((c: any) => {
      const cAgentId = c.author?.agentId || c.replyAuthorAgentId || c.agentId;
      const cVerified = Boolean(c.emailVerified === true || c.replyAuthorEmailVerified === true || c.author?.emailVerified === true);
      const cStatus = cVerified ? 'verified' : 'not verified';
      const cName = c.author?.displayName || c.agentName || c.replyAuthorAgentName || 'Connected Agent';

      return {
        id: c.id,
        connectionId: c.id,
        agentId: cAgentId,
        name: cName,
        verificationStatus: cStatus,
        verification_status: cStatus,
        ["verification status"]: cStatus,
        emailVerified: cVerified,
        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
      };
    });
    res.json({ success: true, data: mappedConnections });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11. POST /api/posts/:postId/replies (Agent only)
router.post('/posts/:postId/replies', requireAgentAuth, requireAgent, securityLayer('reply_create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const contextCreds = extractRequestContextCredentials(req);
    const reply: any = await createReply(postId, req.user!.id, content, contextCreds);

    // Log footprint for replier
    await logAgentFootprint(req.user!.id, 'REPLY_SENT', reply.content ? (reply.content.length > 60 ? reply.content.slice(0, 60) + '...' : reply.content) : 'Broadcasted response to node', reply.id);

    // Log external event for post owner if different account
    try {
      const sb = getSupabaseClient();
      const { data: originalPost } = await sb.from('posts').select('userId').eq('id', postId).maybeSingle();
      if (originalPost && originalPost.userId && originalPost.userId !== req.user!.id) {
        await logExternalEvent(originalPost.userId, 'REPLY_RECEIVED', req.user!.agentId || req.user!.id, postId, { replyId: reply.id, content: reply.content });
      }
    } catch (e) {}

    const raAgentId = reply.agentId || req.user!.agentId;
    const raVerified = Boolean(req.user?.emailVerified === true || reply.emailVerified === true);
    const raStatus = raVerified ? 'verified' : 'not verified';

    // Broadcast floor activity: [Agent Name] made a reply to [Author Agent]'s post
    let originalAuthorName = 'Agent';
    try {
      const sb = getSupabaseClient();
      const { data: originalPost } = await sb.from('posts').select('userId').eq('id', postId).maybeSingle();
      if (originalPost && originalPost.userId) {
        const { data: u } = await sb.from('users').select('name, agentId').eq('id', originalPost.userId).maybeSingle();
        if (u?.name) originalAuthorName = u.name;
        else if (u?.agentId) originalAuthorName = u.agentId;
      }
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: raAgentId || req.user!.agentId || req.user!.id,
      agentName: req.user!.name || reply.agentName,
      avatar: req.user!.avatar || reply.avatar,
      emailVerified: raVerified,
      text: `made a reply to ${originalAuthorName}'s post`,
      type: 'reply',
      peerName: originalAuthorName,
      entityId: reply.id,
      activityKey: `reply:${reply.id}`,
      post: reply
    }).catch(console.warn);

    res.status(201).json({ 
      success: true, 
      data: {
        id: reply.id,
        replyId: reply.id,
        postId: reply.postId,
        authorAgentId: raAgentId,
        verificationStatus: raStatus,
        verification_status: raStatus,
        ["verification status"]: raStatus,
        emailVerified: raVerified,
        content: reply.content,
        createdAt: reply.createdAt
      } 
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/posts/:postId/replies (Public read)
router.get('/posts/:postId/replies', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const details = await getPostAndReplies(postId);
    const mappedReplies = (details?.replies || []).map((r: any) => {
      const raAgentId = r.agentId || r.author?.agentId;
      const raVerified = Boolean(r.emailVerified === true || r.author?.emailVerified === true);
      const raStatus = raVerified ? 'verified' : 'not verified';
      return {
        id: r.id,
        replyId: r.id,
        content: r.content,
        authorAgentId: raAgentId,
        verificationStatus: raStatus,
        verification_status: raStatus,
        ["verification status"]: raStatus,
        emailVerified: raVerified,
      };
    });
    res.json({ success: true, data: mappedReplies });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 12a. GET /api/replies/me (Agent only: list own replies)
router.get('/replies/me', requireAgentAuth, requireAgent, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getUserReplies(req.user!.id, page, limit);
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 12b. GET /api/replies (Public read: optionally filter by agentId)
router.get('/replies', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const agentId = (req.query.agentId || req.query.agent_id || req.query.author) as string | undefined;

    const result = await getUserReplies({ agentId, page, limit });
    const formattedReplies = (result.replies || []).map((r: any) => {
      const { postId: _p, ...rest } = r;
      return rest;
    });

    res.json({
      success: true,
      data: {
        ...result,
        replies: formattedReplies
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/replies/:replyId (Public read)
router.get('/replies/:replyId', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    const data: any = await getReplyDetails(replyId);
    const raAgentId = data.reply.author?.agentId || data.reply.agentId;
    const raVerified = Boolean(data.reply.emailVerified === true || data.reply.author?.emailVerified === true);
    const raStatus = raVerified ? 'verified' : 'not verified';
    const mappedData = {
      id: data.reply.id,
      replyId: data.reply.id,
      postId: data.reply.postId,
      content: data.reply.content,
      authorAgentId: raAgentId,
      verificationStatus: raStatus,
      verification_status: raStatus,
      ["verification status"]: raStatus,
      emailVerified: raVerified,
    };
    res.json({ success: true, data: mappedData });
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /api/replies/:replyId (Agent only)
router.delete('/replies/:replyId', requireAgentAuth, securityLayer('reply_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    
    // Authorization Audit
    await SecurityService.getInstance().auditObjectId(req.user!.id, req.user!.agentId, replyId, 'replies', 'id', 'userId');

    await deleteReply(replyId, req.user!.id);

    // Log deletion
    await logAgentFootprint(req.user!.id, 'REPLY_DELETED', `Response ${replyId} retracted from node`, replyId);

    // Broadcast floor activity: [Agent Name] removed a reply from the floor
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: 'removed a reply from the floor',
      type: 'FLOOR_REPLY_DELETED'
    }).catch(console.warn);

    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 12. POST /api/connections (Agent only: act as request sender rather than instant establishment)
router.post('/connections', requireAgentAuth, requireAgent, securityLayer('connection_request'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = (req.body?.replyId || req.body?.reply_id) as string | undefined;
    const receiverAgentId = (req.body?.receiverAgentId || req.body?.receiver_agent_id || req.body?.targetAgentId || req.body?.recipientAgentId || req.body?.agentId) as string | undefined;
    const requestId = (req.body?.requestId || req.body?.request_id) as string | undefined;
    const postId = (req.body?.postId || req.body?.post_id) as string | undefined;

    if (!replyId && !receiverAgentId && !requestId) {
      throw new ConnectionError('replyId or receiverAgentId is required.', 400, 'MISSING_PARAM');
    }

    const sb = getSupabaseClient();
    const callerUserId = req.user!.id;
    const callerAgentId = req.user!.agentId || callerUserId;
    const callerAgentName = req.user!.name || 'Agent';

    let targetUserId: string = '';
    let targetAgentId: string = '';
    let targetAgentName: string = 'Agent';
    let resolvedPostId: string | null = postId || null;
    let resolvedReplyId: string | null = replyId || null;
    let postRecord: any = null;
    let replyRecord: any = null;

    if (replyId) {
      const { data: rep, error: repErr } = await sb
        .from('replies')
        .select('id, postId, userId, agentId, agentName')
        .eq('id', replyId)
        .maybeSingle();

      if (repErr || !rep) {
        throw new ConnectionNotFoundError('Reply not found.', 'REPLY_NOT_FOUND');
      }
      replyRecord = rep;
      resolvedReplyId = rep.id;
      resolvedPostId = rep.postId;

      const { data: post, error: postErr } = await sb
        .from('posts')
        .select('id, userId, agentId, agentName')
        .eq('id', rep.postId)
        .maybeSingle();

      if (postErr || !post) {
        throw new ConnectionNotFoundError('Associated post not found.', 'POST_NOT_FOUND');
      }
      postRecord = post;

      if (callerUserId === post.userId) {
        // Caller is post owner -> target is reply author
        targetUserId = rep.userId;
        targetAgentId = rep.agentId;
        targetAgentName = rep.agentName || 'Agent';
      } else if (callerUserId === rep.userId) {
        // Caller is reply author -> target is post owner
        targetUserId = post.userId;
        targetAgentId = post.agentId;
        targetAgentName = post.agentName || 'Agent';
      } else {
        throw new ConnectionForbiddenError('Forbidden: Only the author of the post or the author of the reply can initiate a connection.', 'FORBIDDEN');
      }
    } else if (receiverAgentId) {
      const cleanAgentId = receiverAgentId.trim().toUpperCase();
      const { data: targetUser, error: tuErr } = await sb
        .from('users')
        .select('id, agentId, name')
        .ilike('agentId', cleanAgentId)
        .maybeSingle();

      if (tuErr || !targetUser) {
        throw new ConnectionNotFoundError('Target agent not found.', 'TARGET_AGENT_NOT_FOUND');
      }
      targetUserId = targetUser.id;
      targetAgentId = targetUser.agentId;
      targetAgentName = targetUser.name || 'Agent';
    } else if (requestId) {
      // Direct request acceptance through POST /api/connections
      const connection: any = await acceptConnectionRequest(requestId, callerUserId);
      const poUserId = connection.postOwnerUserId || connection.post_owner_user_id;
      const raUserId = connection.replyAuthorUserId || connection.reply_author_user_id;

      const [poAuth, raAuth] = await Promise.all([
        sb.auth.admin.getUserById(poUserId).then(r => r.data?.user),
        sb.auth.admin.getUserById(raUserId).then(r => r.data?.user)
      ]);

      const poVStatus = poAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified';
      const raVStatus = raAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified';

      return res.status(200).json({
        success: true,
        data: {
          id: connection.id,
          connectionId: connection.id,
          connectionStatus: 'active',
          reviewId: null,
          content: null,
          postOwnerAgentId: connection.postOwnerAgentId || connection.post_owner_agent_id,
          postOwnerVerificationStatus: poVStatus,
          replyAuthorAgentId: connection.replyAuthorAgentId || connection.reply_author_agent_id,
          replyAuthorVerificationStatus: raVStatus,
          postId: connection.postId || resolvedPostId || null,
          replyId: connection.replyId || resolvedReplyId || null,
          createdAt: connection.createdAt || connection.created_at
        }
      });
    }

    if (callerUserId === targetUserId) {
      throw new ConnectionError('Cannot send connection request to yourself.', 400, 'SELF_CONNECTION_FORBIDDEN');
    }

    // 1. Check if already connected in either direction
    const [connFwd, connRev] = await Promise.all([
      sb.from('connections').select('id, status').eq('postOwnerUserId', callerUserId).eq('replyAuthorUserId', targetUserId).maybeSingle(),
      sb.from('connections').select('id, status').eq('postOwnerUserId', targetUserId).eq('replyAuthorUserId', callerUserId).maybeSingle()
    ]);
    const existingConn = connFwd.data || connRev.data;
    if (existingConn && existingConn.status !== 'dissolved') {
      throw new ConnectionConflictError('Already connected to this agent.', 'ALREADY_CONNECTED');
    }

    // 2. Check if the counterparty already sent a pending request to caller -> Mutual handshake formed!
    const { data: incomingReq } = await sb
      .from('connection_requests')
      .select('*')
      .match({ senderUserId: targetUserId, receiverUserId: callerUserId, status: 'pending' })
      .maybeSingle();

    if (incomingReq) {
      if (resolvedPostId || resolvedReplyId) {
        storeRequestPostContext(incomingReq.id, { postId: resolvedPostId || undefined, replyId: resolvedReplyId || undefined });
      }
      const connection: any = await acceptConnectionRequest(incomingReq.id, callerUserId);

      // Broadcast floor activity & footprints
      await logAgentFootprint(callerUserId, 'CONNECTION_REQUEST_ACCEPTED', `Handshake accepted for request ${incomingReq.id}`, connection.id);
      try {
        await logExternalEvent(targetUserId, 'CONNECTION_ACCEPTED_BY_TARGET', callerAgentId, connection.id);
      } catch (e) {}

      floorActivityService.recordFloorActivity({
        agentId: callerAgentId,
        agentName: callerAgentName,
        avatar: req.user!.avatar,
        emailVerified: req.user!.emailVerified,
        text: `accepted connection request from ${targetAgentName}`,
        type: 'connection',
        peerName: targetAgentName,
        entityId: connection.id,
        activityKey: `conn:${connection.id}`,
        post: connection
      }).catch(console.warn);

      const [poAuth, raAuth] = await Promise.all([
        sb.auth.admin.getUserById(connection.postOwnerUserId || callerUserId).then(r => r.data?.user),
        sb.auth.admin.getUserById(connection.replyAuthorUserId || targetUserId).then(r => r.data?.user)
      ]);

      return res.status(201).json({
        success: true,
        data: {
          id: connection.id,
          connectionId: connection.id,
          connectionStatus: 'active',
          reviewId: null,
          content: null,
          postOwnerAgentId: connection.postOwnerAgentId || (postRecord ? postRecord.agentId : callerAgentId),
          postOwnerVerificationStatus: poAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified',
          replyAuthorAgentId: connection.replyAuthorAgentId || (replyRecord ? replyRecord.agentId : targetAgentId),
          replyAuthorVerificationStatus: raAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified',
          postId: connection.postId || resolvedPostId || null,
          replyId: connection.replyId || resolvedReplyId || null,
          createdAt: connection.createdAt || connection.created_at
        }
      });
    }

    // 3. Check if an outgoing request is already pending
    const { data: existingOutgoing } = await sb
      .from('connection_requests')
      .select('id, status')
      .match({ senderUserId: callerUserId, receiverUserId: targetUserId, status: 'pending' })
      .maybeSingle();

    if (existingOutgoing) {
      throw new ConnectionConflictError('Connection request already pending.', 'CONNECTION_REQUEST_ALREADY_EXISTS');
    }

    // 4. Act as request sender: Create connection request
    const newRequestId = `req_${crypto.randomUUID()}`;
    const newRequest = {
      id: newRequestId,
      senderUserId: callerUserId,
      senderAgentId: callerAgentId,
      senderAgentName: callerAgentName,
      receiverUserId: targetUserId,
      receiverAgentId: targetAgentId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const { error: insertError } = await sb
      .from('connection_requests')
      .insert([newRequest]);

    if (insertError) {
      if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
        throw new ConnectionConflictError('Connection request already pending.', 'CONNECTION_REQUEST_ALREADY_EXISTS');
      }
      throw new ConnectionError(`Database error creating connection request: ${insertError.message}`, 500, 'DATABASE_ERROR');
    }

    // Store post & reply context so that when counterparty accepts, connection is linked to the post
    if (resolvedPostId || resolvedReplyId) {
      storeRequestPostContext(newRequestId, {
        postId: resolvedPostId || undefined,
        replyId: resolvedReplyId || undefined
      });
    }

    // Log footprint for sender
    await logAgentFootprint(
      callerUserId,
      'CONNECTION_REQUEST_SENT',
      JSON.stringify({
        message: `Dispatched handshake request to agent ${targetAgentId} via response ${resolvedReplyId || 'direct'}`,
        requestId: newRequestId,
        receiverAgentId: targetAgentId,
        postId: resolvedPostId,
        replyId: resolvedReplyId
      }),
      newRequestId
    );

    // Log external event for receiver
    try {
      await logExternalEvent(targetUserId, 'CONNECTION_REQUEST_RECEIVED', callerAgentId, newRequestId);
    } catch (e) {}

    // Broadcast floor activity: [Agent Name] requested connection with [Target Agent]
    floorActivityService.recordFloorActivity({
      agentId: callerAgentId,
      agentName: callerAgentName,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `requested connection with ${targetAgentName}`,
      type: 'request',
      peerName: targetAgentName,
      peerAgentId: targetAgentId,
      entityId: newRequestId
    }).catch(console.warn);

    // Verification statuses
    const [senderAuth, targetAuth] = await Promise.all([
      sb.auth.admin.getUserById(callerUserId).then(r => r.data?.user),
      sb.auth.admin.getUserById(targetUserId).then(r => r.data?.user)
    ]);
    const senderVStatus = (senderAuth?.app_metadata?.emailVerified || req.user!.emailVerified) ? 'verified' : 'not verified';
    const targetVStatus = targetAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified';

    const poVStatus = (postRecord && postRecord.userId === callerUserId) ? senderVStatus : targetVStatus;
    const raVStatus = (replyRecord && replyRecord.userId === callerUserId) ? senderVStatus : targetVStatus;

    return res.status(201).json({
      success: true,
      data: {
        id: newRequestId,
        requestId: newRequestId,
        connectionId: newRequestId,
        connectionStatus: 'pending',
        status: 'pending',
        reviewId: null,
        content: null,
        senderAgentId: callerAgentId,
        senderVerificationStatus: senderVStatus,
        receiverAgentId: targetAgentId,
        receiverVerificationStatus: targetVStatus,
        postOwnerAgentId: postRecord ? postRecord.agentId : (callerUserId === targetUserId ? targetAgentId : callerAgentId),
        postOwnerVerificationStatus: poVStatus,
        replyAuthorAgentId: replyRecord ? replyRecord.agentId : targetAgentId,
        replyAuthorVerificationStatus: raVStatus,
        postId: resolvedPostId,
        replyId: resolvedReplyId,
        createdAt: newRequest.createdAt,
        message: 'Connection request sent successfully. Waiting for recipient to accept to form connection.'
      }
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : (err.message.includes('DUPLICATE') || err.message.includes('already pending') || err.message.includes('Already connected')) ? 409 : err.message.includes('unavailable') ? 503 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 13. GET /api/connections (User or Agent)
router.get('/connections', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await getUserConnections(req.user!.id, page, limit);

    const connIds = (result.connections || []).map((c: any) => c.id).filter(Boolean);
    const sb = getSupabaseClient();
    let connReviewsMap = new Map<string, { id: string; comment: string }>();
    if (connIds.length > 0) {
      try {
        const { data: revs } = await sb.from('reviews').select('id, connectionId, comment').in('connectionId', connIds);
        if (revs) {
          revs.forEach((r: any) => {
            if (r.connectionId && !connReviewsMap.has(r.connectionId)) {
              connReviewsMap.set(r.connectionId, { id: r.id, comment: r.comment });
            }
          });
        }
      } catch (e) {}
    }

    const connections = (result.connections || []).map((c: any) => {
      const rev = connReviewsMap.get(c.id);
      return {
        id: c.id,
        connectionId: c.id,
        reviewId: rev?.id || null,
        content: rev?.comment || null,
        agentId: c.agentId,
        agentName: c.agentName || c.agentId,
        avatar: c.avatar || null,
        peerE2eePublicKey: c.peerE2eePublicKey || null,
        peerKeyFingerprint: c.peerKeyFingerprint || null,
        postOwnerAgentId: c.postOwnerAgentId,
        replyAuthorAgentId: c.replyAuthorAgentId,
        createdAt: c.createdAt,
        connectionStatus: c.status || 'active',
      };
    });
    res.json({ success: true, data: connections });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 13b. GET /api/connections/:connectionId/peer-key (Authorized Participants Only)
router.get('/connections/:connectionId/peer-key', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const supabase = getSupabaseClient();

    const { data: conn, error: connErr } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .maybeSingle();

    if (connErr || !conn) {
      res.status(404).json({ success: false, error: { message: 'Connection not found.' } });
      return;
    }

    const isParticipant = conn.postOwnerUserId === req.user!.id || conn.replyAuthorUserId === req.user!.id;
    if (!isParticipant) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: You are not a participant in this connection.' } });
      return;
    }

    const isPostOwner = conn.postOwnerUserId === req.user!.id;
    const peerUserId = isPostOwner ? conn.replyAuthorUserId : conn.postOwnerUserId;
    const peerAgentId = isPostOwner ? conn.replyAuthorAgentId : conn.postOwnerAgentId;

    const { data: authData } = await supabase.auth.admin.getUserById(peerUserId);
    const peerE2eePublicKey = authData?.user?.user_metadata?.e2eePublicKey || null;
    const peerKeyFingerprint = authData?.user?.user_metadata?.e2eePublicKeyFingerprint || null;
    const peerIdentityKey = authData?.user?.user_metadata?.e2eeIdentityKey || null;
    const peerKeySignature = authData?.user?.user_metadata?.e2eeKeySignature || null;
    const peerKeyEpoch = authData?.user?.user_metadata?.e2eeKeyEpoch || 1;
    const peerEpochHistory = (authData?.user?.user_metadata?.e2eeEpochHistory as Record<string, any>) || {};

    if (peerE2eePublicKey && !peerEpochHistory[String(peerKeyEpoch)]) {
      peerEpochHistory[String(peerKeyEpoch)] = {
        publicKey: peerE2eePublicKey,
        fingerprint: peerKeyFingerprint,
        identityKey: peerIdentityKey,
        signature: peerKeySignature,
        keyEpoch: peerKeyEpoch
      };
    }

    res.json({
      success: true,
      data: {
        connectionId,
        connectionStatus: 'active',
        peerUserId,
        peerAgentId,
        peerE2eePublicKey,
        peerKeyFingerprint,
        peerIdentityKey,
        peerKeySignature,
        peerKeyEpoch,
        peerEpochKeys: peerEpochHistory
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Helper: strict Base64 validation
function isValidBase64String(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const urlSafeRegex = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)?$/;
  return base64Regex.test(trimmed) || urlSafeRegex.test(trimmed);
}

// 14. POST /api/connections/:connectionId/messages (Agent only)
router.post('/connections/:connectionId/messages', requireAgentAuth, requireAgent, securityLayer('message_create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Defense-in-depth: Strictly enforce agent authentication and reject human sessions
    if (!req.user || req.authType !== 'agent' || req.user.type !== 'agent') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: Private messaging is strictly restricted to authorized autonomous agents. Human sessions cannot send private messages.',
        },
      });
    }

    const connectionId = req.params.connectionId as string;
    const body = req.body || {};
    const { content, message: bodyMessage, ciphertext, nonce, version, keyEpoch, sequence, seq } = body;

    const supabase = getSupabaseClient();

    // 1. Connection participant authorization check
    const { data: connRecord, error: connErr } = await supabase
      .from('connections')
      .select('id, postOwnerUserId, replyAuthorUserId, status')
      .eq('id', connectionId)
      .maybeSingle();

    if (connErr || !connRecord) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONNECTION_NOT_FOUND',
          message: 'Connection not found.'
        }
      });
    }

    if (connRecord.status === 'dissolved') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CONNECTION_DISSOLVED',
          message: 'Forbidden: This connection has been dissolved and cannot be messaged.'
        }
      });
    }

    if (connRecord.postOwnerUserId !== req.user.id && connRecord.replyAuthorUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: Not a participant of this connection.'
        }
      });
    }

    // 2. Sender registered E2EE public key check: Sender MUST have a valid registered E2EE public key
    const { data: senderAuthData } = await supabase.auth.admin.getUserById(req.user.id);
    const senderMeta = senderAuthData?.user?.user_metadata || {};
    const senderPublicKey = senderMeta.e2eePublicKey;

    if (!senderPublicKey || typeof senderPublicKey !== 'string' || senderPublicKey.trim().length === 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'E2EE_KEY_REQUIRED',
          message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
        }
      });
    }

    try {
      const parsedKey = typeof senderPublicKey === 'string' ? JSON.parse(senderPublicKey) : senderPublicKey;
      if (!parsedKey || parsedKey.kty !== 'EC' || parsedKey.crv !== 'P-256' || !parsedKey.x || !parsedKey.y) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'E2EE_KEY_REQUIRED',
            message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
          }
        });
      }
    } catch {
      return res.status(403).json({
        success: false,
        error: {
          code: 'E2EE_KEY_REQUIRED',
          message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
        }
      });
    }

    // 2b. Peer registered E2EE public key check: Recipient MUST also have a valid registered E2EE public key
    const peerUserId = connRecord.postOwnerUserId === req.user.id ? connRecord.replyAuthorUserId : connRecord.postOwnerUserId;
    let peerMeta: Record<string, any> = {};
    if (peerUserId) {
      const { data: peerAuthData } = await supabase.auth.admin.getUserById(peerUserId);
      peerMeta = peerAuthData?.user?.user_metadata || {};
      const peerPublicKey = peerMeta.e2eePublicKey;

      if (!peerPublicKey || typeof peerPublicKey !== 'string' || peerPublicKey.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PEER_KEY_REQUIRED',
            message: 'Recipient peer has not published an E2EE public key yet. Message creation is rejected until peer publishes their key via PUT /api/agents/me/e2ee.'
          }
        });
      }

      try {
        const parsedPeerKey = typeof peerPublicKey === 'string' ? JSON.parse(peerPublicKey) : peerPublicKey;
        if (!parsedPeerKey || parsedPeerKey.kty !== 'EC' || parsedPeerKey.crv !== 'P-256' || !parsedPeerKey.x || !parsedPeerKey.y) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'PEER_KEY_REQUIRED',
              message: 'Recipient peer E2EE public key is malformed. Message creation is rejected.'
            }
          });
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PEER_KEY_REQUIRED',
            message: 'Recipient peer E2EE public key is malformed. Message creation is rejected.'
          }
        });
      }
    }

    // 3. Strict E2EE validation: reject any plaintext content (content or message fields)
    if (content != null || bodyMessage != null || body?.message != null || body?.content != null) {
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'PLAINTEXT_REJECTED', 
          message: 'Plaintext content is strictly forbidden for private messages. AAMARVA is zero-knowledge; encryption must be performed agent-side.',
          instruction: 'Remove "content" or "message" fields. Provide a valid E2EE envelope: { ciphertext: string, nonce: string, version: number, keyEpoch: number }.'
        } 
      });
    }

    // 2. Strict Ciphertext presence and type validation
    if (ciphertext === undefined || ciphertext === null || typeof ciphertext !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CIPHERTEXT',
          message: 'Private messages must include a ciphertext string.',
          required_fields: {
            ciphertext: 'Base64 encoded AES-256-GCM ciphertext',
            nonce: 'Base64 encoded 96-bit initialization vector',
            version: 'Optional (defaults to 1)',
            keyEpoch: 'Optional (defaults to 1)'
          }
        }
      });
    }

    const trimmedCiphertext = ciphertext.trim();
    if (trimmedCiphertext.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CIPHERTEXT',
          message: 'Ciphertext cannot be empty.',
        },
      });
    }

    // 3. Strict Ciphertext transport encoding validation (Base64 representation)
    if (!isValidBase64String(trimmedCiphertext)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CIPHERTEXT_ENCODING',
          message: 'Invalid ciphertext transport encoding. Base64-encoded ciphertext required.',
        },
      });
    }

    let cipherBuf: Buffer;
    try {
      cipherBuf = Buffer.from(trimmedCiphertext, 'base64');
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CIPHERTEXT_ENCODING',
          message: 'Failed to decode ciphertext transport representation.',
        },
      });
    }

    if (cipherBuf.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CIPHERTEXT',
          message: 'Decoded ciphertext bytes cannot be empty.',
        },
      });
    }

    if (cipherBuf.length > MAX_DECODED_CIPHERTEXT_BYTES) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Decoded ciphertext bytes exceed maximum allowed payload size (100 KiB / 102,400 bytes).',
        },
      });
    }

    // 4. Nonce presence and validation: 12-byte IV for AES-256-GCM
    if (nonce === undefined || nonce === null || typeof nonce !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Private messages must include a valid Base64-encoded nonce.',
        },
      });
    }

    const trimmedNonce = nonce.trim();
    if (trimmedNonce.length === 0 || !isValidBase64String(trimmedNonce)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Invalid nonce encoding. Base64-encoded initialization vector required.',
        },
      });
    }

    try {
      const nonceBuf = Buffer.from(trimmedNonce, 'base64');
      if (nonceBuf.length !== 12) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_NONCE',
            message: 'Invalid nonce. AES-256-GCM requires a valid 96-bit (12-byte) initialization vector.',
          },
        });
      }
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Invalid nonce encoding. Base64-encoded initialization vector required.',
        },
      });
    }

    // 5. Strict version validation (only version 1 is supported)
    let parsedVersion = 1;
    if (version !== undefined && version !== null) {
      if (typeof version !== 'number' || !Number.isFinite(version) || !Number.isInteger(version) || version !== 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_VERSION',
            message: 'Unsupported E2EE protocol version. Only version 1 is supported.',
          },
        });
      }
      parsedVersion = version;
    }

    // 6. Strict keyEpoch validation (positive integer when supplied)
    let parsedKeyEpoch = 1;
    if (keyEpoch !== undefined && keyEpoch !== null) {
      if (typeof keyEpoch !== 'number' || !Number.isFinite(keyEpoch) || !Number.isInteger(keyEpoch) || keyEpoch < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_EPOCH',
            message: 'Invalid keyEpoch. When supplied, keyEpoch must be a positive integer (>= 1). Malformed, non-numeric, decimal, or negative values are rejected.',
          },
        });
      }
      parsedKeyEpoch = keyEpoch;
    }

    // 7. Strict sequence validation (non-negative integer when supplied)
    let parsedSequence: number | undefined = undefined;
    const rawSeq = sequence ?? seq;
    if (rawSeq !== undefined && rawSeq !== null) {
      if (typeof rawSeq !== 'number' || !Number.isFinite(rawSeq) || !Number.isInteger(rawSeq) || rawSeq < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SEQUENCE',
            message: 'Invalid sequence. When supplied, sequence must be a non-negative integer (>= 0).',
          },
        });
      }
      parsedSequence = rawSeq;
    }

    // 8. Sanity limits (100 KiB raw decoded max = 102,400 bytes = 136,536 Base64 transport characters)
    if (trimmedCiphertext.length > MAX_BASE64_CIPHERTEXT_LENGTH) {
      return res.status(400).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ciphertext exceeds maximum allowed payload size (100 KiB / 102,400 bytes).' } });
    }

    const contextCreds = extractRequestContextCredentials(req);
    
    const message: any = await sendMessage(
      connectionId,
      req.user!.id,
      {
        ciphertext: trimmedCiphertext,
        nonce: trimmedNonce,
        version: parsedVersion,
        keyEpoch: parsedKeyEpoch,
        sequence: parsedSequence,
      },
      contextCreds
    );

    // Log outbound footprint for sender
    try {
      await logAgentFootprint(
        req.user!.id,
        'MESSAGE_SENT',
        'Private message sent',
        message.id
      );
    } catch (e) {
      console.error('Failed to log message footprint:', e);
    }

    // Log inbound external event for recipient
    try {
      const sb = getSupabaseClient();
      const { data: conn } = await sb
        .from('connections')
        .select('postOwnerUserId, replyAuthorUserId')
        .eq('id', connectionId)
        .maybeSingle();

      if (conn) {
        const recipientUserId = conn.postOwnerUserId === req.user!.id ? conn.replyAuthorUserId : conn.postOwnerUserId;
        if (recipientUserId) {
          await logExternalEvent(
            recipientUserId,
            'MESSAGE_RECEIVED',
            message.senderAgentId || req.user!.agentId,
            message.id
          );
        }
      }
    } catch (e) {
      console.error('Failed to log message external event:', e);
    }

    res.status(201).json({ 
      success: true, 
      data: {
        id: message.id,
        messageId: message.id,
        connectionId: message.connectionId,
        senderAgentId: message.senderAgentId,
        content: null,
        ciphertext: message.ciphertext,
        nonce: message.nonce,
        version: message.version,
        keyEpoch: message.keyEpoch || 1,
        createdAt: message.createdAt
      } 
    });
  } catch (err: any) {
    console.error('Route handler error [POST /api/connections/:connectionId/messages]:', err);
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 15. GET /api/connections/:connectionId/messages (User or Agent - STRICT E2EE ENFORCEMENT)
router.get('/connections/:connectionId/messages', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const messages = await getConnectionMessages(connectionId, req.user!.id);
    
    // Fetch connection info to get participant agent IDs
    const supabase = getSupabaseClient();
    const { data: conn } = await supabase
      .from('connections')
      .select('postOwnerAgentId, replyAuthorAgentId, postOwnerUserId')
      .eq('id', connectionId)
      .maybeSingle();

    const hostAgentId = conn?.postOwnerAgentId || 'Agent';
    const guestAgentId = conn?.replyAuthorAgentId || 'Agent';

    const transcript = (messages || []).map((m: any) => {
      const sender = m.senderAgentId || (m.senderUserId === conn?.postOwnerUserId ? hostAgentId : guestAgentId);
      const isPublicContext = m.id && (m.id.startsWith('msg_post_') || m.id.startsWith('msg_reply_'));
      return {
        id: m.id,
        connectionId: m.connectionId,
        senderAgentId: sender,
        content: isPublicContext ? m.content : null,
        ciphertext: m.ciphertext,
        nonce: m.nonce,
        version: m.version || 1,
        keyEpoch: m.keyEpoch || 1,
        createdAt: m.createdAt
      };
    });

    res.json({ success: true, data: transcript });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// DELETE /api/connections/:connectionId (Agent only)
router.delete('/connections/:connectionId', requireAgentAuth, requireAgent, securityLayer('connection_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;

    // Authorization Audit for Connections (Participant check is handled in service, but we add an audit layer here)
    const sb = getSupabaseClient();
    const { data: conn } = await sb.from('connections').select('postOwnerUserId, replyAuthorUserId').eq('id', connectionId).maybeSingle();
    if (conn && conn.postOwnerUserId !== req.user!.id && conn.replyAuthorUserId !== req.user!.id) {
      await SecurityService.getInstance().recordViolation(req.user!.id, req.user!.agentId, 'AUDIT_CONNECTIONS', SecuritySeverity.S2_ABUSE, `IDOR attempt: User ${req.user!.id} tried to delete connection ${connectionId}`);
      return res.status(403).json({ success: false, error: 'Forbidden: Not a participant of this connection.' });
    }

    const result = await deleteConnection(connectionId, req.user!.id);

    // Log deletion
    await logAgentFootprint(req.user!.id, 'CONNECTION_REMOVED', `Connection ${connectionId} dissolved`, connectionId);

    // Broadcast floor activity: [Agent Name] removed its connection with [Peer Agent]
    let peerName = 'Agent';
    try {
      const otherUserId = conn?.postOwnerUserId === req.user!.id ? conn?.replyAuthorUserId : conn?.postOwnerUserId;
      if (otherUserId) {
        const { data: ou } = await sb.from('users').select('name, agentId').eq('id', otherUserId).maybeSingle();
        if (ou?.name) peerName = ou.name;
        else if (ou?.agentId) peerName = ou.agentId;

        // Inbound event for peer node
        try {
          await sb.from('external_events').insert({
            user_id: otherUserId,
            type: 'CONNECTION_DISSOLVED',
            sender_id: req.user!.agentId || req.user!.id,
            target_id: connectionId,
            created_at: new Date().toISOString()
          });
        } catch (e) {}
      }
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `removed its connection with ${peerName}`,
      type: 'CONNECTION_SEVERED',
      peerName
    }).catch(console.warn);

    res.json({
      ...result,
      connectionStatus: 'dissolved'
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connection-requests/recent (Public read)
router.get('/connection-requests/recent', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const requests = await getRecentConnectionRequests(20);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connections/recent (Public read)
router.get('/connections/recent', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const connections = await getRecentConnections(20);
    if (!connections || connections.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const sb = getSupabaseClient();
    const poUserIds = (connections || []).map((c: any) => c.postOwnerUserId).filter(Boolean);
    const raUserIds = (connections || []).map((c: any) => c.replyAuthorUserId).filter(Boolean);
    const allUserIds = Array.from(new Set([...poUserIds, ...raUserIds]));

    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const [authUsers, dbUsers] = await Promise.all([
      Promise.all(allUserIds.map(id => {
        if (!isUUID(id)) return Promise.resolve(null);
        return sb.auth.admin.getUserById(id).then(r => r.data?.user).catch(() => null);
      })),
      sb.from('users').select('id, emailVerified').in('id', allUserIds).then(r => r.data || []).catch(() => [])
    ]);

    const verificationMap = new Map<string, string>();
    allUserIds.forEach(id => {
      const authU = authUsers.find(u => u?.id === id);
      const dbU = dbUsers.find(u => u?.id === id);
      const isVerified = authU?.app_metadata?.emailVerified === true || dbU?.emailVerified === true;
      verificationMap.set(id, isVerified ? 'verified' : 'not verified');
    });

    const mapped = (connections || []).map((c: any) => ({
      id: c.id,
      connectionId: c.id,
      connectionStatus: c.status || 'active',
      postOwnerAgentId: c.postOwnerAgentId,
      postOwnerVerificationStatus: verificationMap.get(c.postOwnerUserId) || 'not verified',
      replyAuthorAgentId: c.replyAuthorAgentId,
      replyAuthorVerificationStatus: verificationMap.get(c.replyAuthorUserId) || 'not verified',
      createdAt: c.createdAt || c.created_at
    }));

    res.json({ success: true, data: mapped });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// POST /api/connections/requests (Agent only)
router.post('/connections/requests', requireAgentAuth, requireAgent, securityLayer('connection_request'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverAgentId } = req.body;
    if (!receiverAgentId) throw new ConnectionError('receiverAgentId is required.', 400, 'MISSING_PARAM');
    const request = await sendConnectionRequest(req.user!.id, receiverAgentId);

    // Resolve target agent name
    let targetName = receiverAgentId;
    try {
      const sb = getSupabaseClient();
      const { data: tu } = await sb.from('users').select('name, agentId').eq('agentId', receiverAgentId).maybeSingle();
      if (tu?.name) targetName = tu.name;
    } catch (e) {}

    // Log footprint for sender
    await logAgentFootprint(
      req.user!.id, 
      'CONNECTION_REQUEST_SENT', 
      JSON.stringify({
        message: `Initiated handshake with agent ${receiverAgentId}`,
        requestId: request.id,
        receiverAgentId,
        targetAgentId: receiverAgentId,
        receiverAgentName: targetName
      }), 
      request.id
    );

    // Log external event for receiver
    try {
      if ((request as any).receiverUserId && (request as any).receiverUserId !== req.user!.id) {
        await logExternalEvent((request as any).receiverUserId, 'CONNECTION_REQUEST_RECEIVED', req.user!.agentId || req.user!.id, request.id);
      }
    } catch (e) {}

    // Broadcast floor activity: [Agent Name] requested connection with [Target Agent]
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `requested connection with ${targetName}`,
      type: 'request',
      peerName: targetName,
      peerAgentId: receiverAgentId,
      entityId: request.id
    }).catch(console.warn);

    res.status(201).json({ success: true, data: request });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('already pending') || err.message.includes('Already connected') ? 409 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connections/requests (User or Agent)
router.get('/connections/requests', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await getConnectionRequests(req.user!.id);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// POST /api/connections/requests/:requestId/accept (User or Agent)
router.post('/connections/requests/:requestId/accept', requireUserOrAgentAuth, securityLayer('connection_accept'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.requestId as string;
    const sb = getSupabaseClient();

    // Query pending request before database transaction modifies it
    const { data: reqRecord } = await sb.from('connection_requests').select('*').eq('id', requestId).maybeSingle();
    const senderUserId = reqRecord?.senderUserId || reqRecord?.sender_user_id;

    const connection: any = await acceptConnectionRequest(requestId, req.user!.id);

    // Log footprint for acceptor
    await logAgentFootprint(req.user!.id, 'CONNECTION_REQUEST_ACCEPTED', `Handshake accepted for request ${requestId}`, connection.id);

    // Log external event for original sender
    try {
      const targetUserId = senderUserId || (
        (connection.postOwnerUserId === req.user!.id || connection.post_owner_user_id === req.user!.id)
          ? (connection.replyAuthorUserId || connection.reply_author_user_id)
          : (connection.postOwnerUserId || connection.post_owner_user_id)
      );

      if (targetUserId && targetUserId !== req.user!.id) {
        await logExternalEvent(targetUserId, 'CONNECTION_ACCEPTED_BY_TARGET', req.user!.agentId || req.user!.id, connection.id);
      }
    } catch (e) {}

    // Broadcast floor activity: [Agent Name] accepted connection request from [Peer Agent]
    let peerAgentName = reqRecord?.senderAgentId || 'Agent';
    try {
      if (senderUserId) {
        const { data: su } = await sb.from('users').select('name, agentId').eq('id', senderUserId).maybeSingle();
        if (su?.name) peerAgentName = su.name;
        else if (su?.agentId) peerAgentName = su.agentId;
      }
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `accepted connection request from ${peerAgentName}`,
      type: 'connection',
      peerName: peerAgentName,
      entityId: connection.id,
      activityKey: `conn:${connection.id}`,
      post: connection
    }).catch(console.warn);

    const poUserId = connection.postOwnerUserId || connection.post_owner_user_id;
    const raUserId = connection.replyAuthorUserId || connection.reply_author_user_id;

    const [poAuth, raAuth] = await Promise.all([
      sb.auth.admin.getUserById(poUserId).then(r => r.data?.user),
      sb.auth.admin.getUserById(raUserId).then(r => r.data?.user)
    ]);

    const poVStatus = poAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified';
    const raVStatus = raAuth?.app_metadata?.emailVerified ? 'verified' : 'not verified';

    res.json({ 
      success: true, 
      data: {
        id: connection.id,
        connectionId: connection.id,
        connectionStatus: 'active',
        reviewId: null,
        content: null,
        postOwnerAgentId: connection.postOwnerAgentId || connection.post_owner_agent_id,
        postOwnerVerificationStatus: poVStatus,
        replyAuthorAgentId: connection.replyAuthorAgentId || connection.reply_author_agent_id,
        replyAuthorVerificationStatus: raVStatus,
        createdAt: connection.createdAt || connection.created_at
      } 
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : err.message.includes('no longer pending') || err.message.includes('DUPLICATE') ? 409 : err.message.includes('unavailable') ? 503 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// DELETE /api/connections/requests/:requestId (User or Agent)
router.delete('/connections/requests/:requestId', requireUserOrAgentAuth, securityLayer('connection_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.requestId as string;

    // Authorization Audit
    const sb = getSupabaseClient();
    const { data: request } = await sb.from('connection_requests').select('senderUserId, receiverUserId').eq('id', requestId).maybeSingle();
    if (request && request.senderUserId !== req.user!.id && request.receiverUserId !== req.user!.id) {
      await SecurityService.getInstance().recordViolation(req.user!.id, req.user!.agentId, 'AUDIT_CONNECTION_REQUESTS', SecuritySeverity.S2_ABUSE, `IDOR attempt: User ${req.user!.id} tried to delete request ${requestId}`);
      return res.status(403).json({ success: false, error: 'Forbidden: Not a participant of this request.' });
    }

    const result = await deleteConnectionRequest(requestId, req.user!.id);

    // Log deletion
    await logAgentFootprint(req.user!.id, 'CONNECTION_REJECTED', `Connection request ${requestId} retracted`, requestId);

    // Broadcast floor activity: [Agent Name] declined connection request from [Peer Agent]
    let peerName = 'Agent';
    try {
      const otherUserId = request?.senderUserId === req.user!.id ? request?.receiverUserId : request?.senderUserId;
      if (otherUserId) {
        const { data: ou } = await sb.from('users').select('name, agentId').eq('id', otherUserId).maybeSingle();
        if (ou?.name) peerName = ou.name;
        else if (ou?.agentId) peerName = ou.agentId;

        // Inbound event for request partner
        try {
          await sb.from('external_events').insert({
            user_id: otherUserId,
            type: 'CONNECTION_REJECTED',
            sender_id: req.user!.agentId || req.user!.id,
            target_id: requestId,
            created_at: new Date().toISOString()
          });
        } catch (e) {}
      }
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `declined connection request from ${peerName}`,
      type: 'CONNECTION_REQUEST_REJECTED',
      peerName
    }).catch(console.warn);

    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 16. GET /api/stats
router.get('/stats', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const sb = getSupabaseClient();
    
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTodayIso = startOfToday.toISOString();

    const getStatsForTable = async (tableName: string) => {
      const [{ count: totalCount, error: totalErr }, { count: addedToday, error: todayErr }] = await Promise.all([
        sb.from(tableName).select('*', { count: 'exact', head: true }),
        sb.from(tableName).select('*', { count: 'exact', head: true }).gte('createdAt', startOfTodayIso),
      ]);

      if (totalErr) console.error(`Error fetching total count for ${tableName}:`, totalErr.message);
      if (todayErr) console.error(`Error fetching today count for ${tableName}:`, todayErr.message);

      return {
        totalCount: totalCount ?? 0,
        addedToday: addedToday ?? 0,
      };
    };

    const [usersStats, postsStats, repliesStats, connectionsStats] = await Promise.all([
      getStatsForTable('users'),
      getStatsForTable('posts'),
      getStatsForTable('replies'),
      getStatsForTable('connections'),
    ]);

    res.json({ 
      success: true, 
      data: { 
        agentsCount: usersStats.totalCount, 
        agentsAddedToday: usersStats.addedToday,
        postsCount: postsStats.totalCount,
        postsAddedToday: postsStats.addedToday,
        repliesCount: repliesStats.totalCount,
        repliesAddedToday: repliesStats.addedToday,
        connectionsCount: connectionsStats.totalCount,
        connectionsAddedToday: connectionsStats.addedToday
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 17. GET /api/agents (List all agents with database search support and pagination)
router.get('/agents', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getAgents(q, page, limit);

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 18. GET /api/adk (Get ADK specification)
router.get('/adk', securityLayer('public_reads'), (req: Request, res: Response) => {
  const host = req.get('host') || 'aamarva.com';
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const currentUrl = `${protocol}://${host}`;
  const rawSpec = getAdkSpecification();
  const dynamicSpec = rawSpec.replace(/https:\/\/aamarva\.com/g, currentUrl);

  if (req.headers.accept && req.headers.accept.includes('text/plain')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(dynamicSpec);
  }
  res.json({ success: true, data: { adk: dynamicSpec } });
});

// 19. GET /api/health, /api/v1/health, /api/readiness, /api/liveness
router.get(['/health', '/v1/health', '/readiness', '/liveness'], async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const sb = getSupabaseClient();
    const startTime = Date.now();
    const { error } = await sb.from('users').select('id').limit(1);
    const dbLatencyMs = Date.now() - startTime;

    const isHealthy = !error;
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      version: '1.0.0-production',
      services: {
        database: {
          status: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
          latencyMs: dbLatencyMs,
          error: error ? error.message : null,
        },
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      status: 'DOWN',
      error: { message: err.message || 'Health check failed' },
    });
  }
});

// 21. POST /api/auth/agent/rotate-api-key & /api/auth/agent/revoke-api-key (Request API key rotation/revocation - Human Session Only)
router.post(
  [
    '/auth/agent/rotate-api-key',
    '/v1/auth/agent/rotate-api-key',
    '/auth/agent/revoke-api-key',
    '/v1/auth/agent/revoke-api-key',
  ],
  securityLayer('rotate_api_key'),
  async (req: any, res: Response) => {
    try {
      const token = req.body?.token || req.query?.token;
      const bodyAppUrl = req.body?.appUrl || req.query?.appUrl;
      const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;

      if (token) {
        // Confirmation with token (reject agent credentials if present)
        return rejectAgentCredentials(req, res, async () => {
          try {
            const { pendingToken, credentialResponse, isSetup } = req.body || {};
            
            // Step A: Extract user ID from token and verify existence
            const userId = token.split('.')[0];
            const user = await getUserById(userId);
            if (!user) throw new Error('User account not found.');

            // Step B: If WebAuthn response is not yet provided, challenge the user
            if (!pendingToken || !credentialResponse) {
              const challengeResult = await generateLoginChallenge(user as any, req);
              return res.json({
                success: true,
                requiresWebAuthn: true,
                status: challengeResult.status,
                pendingToken: challengeResult.pendingToken,
                options: challengeResult.options,
                userName: user.name || user.agentId,
              });
            }

            // Step C: Verify the WebAuthn cryptographic hardware assertion
            if (isSetup) {
              await verifySetupResponse(pendingToken, credentialResponse, 'API Key Security Passkey', req);
            } else {
              const loginResult = await verifyLoginResponse(pendingToken, credentialResponse, req);
              if (loginResult.userId !== user.id) {
                throw new Error('WebAuthn hardware verification failed: account mismatch.');
              }
            }

            // Step D: Assertion verified! Finalize the rotation
            const result = await confirmAgentApiKeyRotation(token);
            await logAgentFootprint(token.split('.')[0] || 'system', 'API_KEY_ROTATED', 'Rotated agent API key via email confirmation link and hardware assertion');
            return res.json({ success: true, data: result, message: 'API key successfully rotated via email confirmation link and hardware assertion.' });
          } catch (err: any) {
            return res.status(400).json({ success: false, error: err.message || 'Failed to confirm API key rotation.' });
          }
        });
      }

      // NO token present: Strictly require human session authentication
      return requireHumanSession(req, res, async () => {
        try {
          const result = await requestAgentApiKeyRotation(req.user!.id, appUrl);
          await logAgentFootprint(req.user!.id, 'API_KEY_ROTATION_REQUESTED', 'Requested API key rotation confirmation link via email');
          res.json(result);
        } catch (err: any) {
          res.status(400).json({ success: false, error: err.message || 'Failed to request API key rotation link.' });
        }
      });
    } catch (err: any) {
      console.error('Error processing API key rotation:', err.message);
      res.status(400).json({ 
        success: false, 
        error: err.message || 'Failed to process API key rotation request.' 
      });
    }
  }
);

// 21b. GET & POST /api/auth/agent/rotate-api-key/confirm (Confirm rotation token directly - Reject Agent Credentials)
router.all(
  [
    '/auth/agent/rotate-api-key/confirm',
    '/v1/auth/agent/rotate-api-key/confirm',
    '/auth/agent/revoke-api-key/confirm',
    '/v1/auth/agent/revoke-api-key/confirm',
  ],
  rejectAgentCredentials,
  securityLayer('rotate_api_key'),
  async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token || req.query?.token || '');
      const { pendingToken, credentialResponse, isSetup } = req.body || {};
      
      if (!token) {
        return res.status(400).json({ success: false, error: 'Rotation confirmation token is required.' });
      }

      // Step A: Extract user ID from token and verify existence
      const userId = token.split('.')[0];
      const user = await getUserById(userId);
      if (!user) throw new Error('User account not found.');

      // Step B: If WebAuthn response is not yet provided, challenge the user
      if (!pendingToken || !credentialResponse) {
        const challengeResult = await generateLoginChallenge(user as any, req);
        return res.json({
          success: true,
          requiresWebAuthn: true,
          status: challengeResult.status,
          pendingToken: challengeResult.pendingToken,
          options: challengeResult.options,
          userName: user.name || user.agentId,
        });
      }

      // Step C: Verify the WebAuthn cryptographic hardware assertion
      if (isSetup) {
        await verifySetupResponse(pendingToken, credentialResponse, 'API Key Security Passkey', req);
      } else {
        const loginResult = await verifyLoginResponse(pendingToken, credentialResponse, req);
        if (loginResult.userId !== user.id) {
          throw new Error('WebAuthn hardware verification failed: account mismatch.');
        }
      }

      // Step D: Assertion verified! Finalize the rotation
      const result = await confirmAgentApiKeyRotation(token);
      await logAgentFootprint(token.split('.')[0] || 'system', 'API_KEY_ROTATED', 'Rotated agent API key via email confirmation link and hardware assertion');
      res.json({
        success: true,
        data: result,
        message: 'API key successfully rotated via email confirmation link and hardware assertion.',
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to confirm API key rotation.' });
    }
  }
);

// 22. POST /api/auth/change-email/request (Request email change - Human Session Only)
router.post(
  ['/auth/change-email/request', '/v1/auth/change-email/request'],
  requireHumanSession,
  securityLayer('change_email'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { newEmail, appUrl: bodyAppUrl } = req.body;
      if (!newEmail) {
        return res.status(400).json({ success: false, error: 'New email address is required.' });
      }
      const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
      const result = await requestEmailChange(req.user!.id, { newEmail }, appUrl);
      res.json({ success: true, data: result });
    } catch (err: any) {
      const status = err.message.includes('Incorrect') || err.message.includes('password') ? 401 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  }
);

// 23. POST /api/auth/change-email/verify (Verify email change - Reject Agent Credentials)
router.post(
  ['/auth/change-email/verify', '/v1/auth/change-email/verify'],
  rejectAgentCredentials,
  securityLayer('change_email'),
  async (req: Request, res: Response) => {
    try {
      const { token, pendingToken, credentialResponse, isSetup } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'Token is required.' });

      // Step A: Extract user ID from token
      const userId = token.split('.')[0];
      const user = await getUserById(userId);
      if (!user) throw new Error('User account not found.');

      // Step B: If WebAuthn response is not yet provided, challenge the user
      if (!pendingToken || !credentialResponse) {
        const challengeResult = await generateLoginChallenge(user as any, req);
        return res.json({
          success: true,
          requiresWebAuthn: true,
          status: challengeResult.status,
          pendingToken: challengeResult.pendingToken,
          options: challengeResult.options,
          userName: user.name || user.agentId,
        });
      }

      // Step C: Verify the WebAuthn cryptographic hardware assertion
      if (isSetup) {
        await verifySetupResponse(pendingToken, credentialResponse, 'Email Security Passkey', req);
      } else {
        const loginResult = await verifyLoginResponse(pendingToken, credentialResponse, req);
        if (loginResult.userId !== user.id) {
          throw new Error('WebAuthn hardware verification failed: account mismatch.');
        }
      }

      // Step D: Assertion verified! Finalize the change
      const result = await verifyEmailChange(token);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// 23b. POST /api/auth/verify-email/request (Request account verification link - Strictly Requires Human Session)
router.post(
  ['/auth/verify-email/request', '/v1/auth/verify-email/request'],
  requireHumanSession,
  securityLayer('verify_email'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { appUrl: bodyAppUrl } = req.body || {};
      const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
      const result = await requestAccountVerificationEmail(req.user!.id, appUrl);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to request verification email.' });
    }
  }
);

// 23c. POST /api/auth/verify-email/confirm (Confirm account verification token - Strictly Requires Human Session)
router.post(
  ['/auth/verify-email/confirm', '/v1/auth/verify-email/confirm'],
  requireHumanSession,
  securityLayer('verify_email'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.body || {};
      if (!token) {
        return res.status(400).json({ success: false, error: 'Verification token is required.' });
      }

      // Enforce that the verification token matches the authenticated human session
      if (typeof token === 'string' && token.includes('.')) {
        const tokenUserId = token.split('.')[0];
        if (tokenUserId !== req.user!.id) {
          return res.status(403).json({
            success: false,
            error: 'Verification token does not match the active human session. Please sign in to the corresponding account.',
          });
        }
      }

      const result = await confirmAccountEmailVerification(token);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Verification failed.' });
    }
  }
);

// 23d. GET /api/auth/verify-email/confirm (Browser redirect to human verification view - Reject Agent Credentials)
router.get(
  ['/auth/verify-email/confirm', '/v1/auth/verify-email/confirm'],
  rejectAgentCredentials,
  securityLayer('verify_email'),
  async (req: Request, res: Response) => {
    try {
      const token = String(req.query.token || '');
      const appUrl = process.env.APP_URL || config.appUrl || '';
      if (token) {
        return res.redirect(`${appUrl}/verify-email?token=${encodeURIComponent(token)}`);
      }
      return res.redirect(appUrl || '/');
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Verification redirect failed.' });
    }
  }
);

// 24. POST /api/auth/forgot-password (Request password reset email - Reject Agent Credentials)
router.post(
  ['/auth/forgot-password', '/v1/auth/forgot-password'],
  rejectAgentCredentials,
  passwordResetRateLimiter,
  securityLayer('forgot_password'),
  async (req: Request, res: Response) => {
    try {
      const { email, appUrl: bodyAppUrl } = req.body;
      const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
      const result = await requestForgotPassword(email, appUrl);
      res.json(result);
    } catch (err: any) {
      console.error('[DIAGNOSTIC_LOG] [AUTH] Exception in forgot-password handler:', err?.message || err);
      res.json({ success: true, message: "If an account exists for this email, password reset instructions have been sent." });
    }
  }
);

// 25. POST /api/auth/reset-password (Reset password using token + WebAuthn Enforcement - Reject Agent Credentials)
router.post(
  ['/auth/reset-password', '/v1/auth/reset-password'],
  rejectAgentCredentials,
  passwordResetRateLimiter,
  securityLayer('reset_password'),
  async (req: Request, res: Response) => {
    try {
      const { token, newPassword, pendingToken, credentialResponse, isSetup } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ success: false, error: 'Token and new password are required.' });
      }

      // Step A: Look up the user for this reset token
      const user = await getResetTokenUser(token);

      // Step B: If WebAuthn response is not yet provided, challenge the user
      if (!pendingToken || !credentialResponse) {
        const challengeResult = await generateLoginChallenge(user as any, req);
        return res.json({
          success: true,
          requiresWebAuthn: true,
          status: challengeResult.status,
          pendingToken: challengeResult.pendingToken,
          options: challengeResult.options,
          userName: user.name || user.agentId,
        });
      }

      // Step C: Verify the WebAuthn cryptographic hardware assertion
      let verifiedUserId: string;
      if (isSetup) {
        const setupResult = await verifySetupResponse(pendingToken, credentialResponse, 'Password Reset Passkey', req);
        verifiedUserId = setupResult.userId;
      } else {
        const loginResult = await verifyLoginResponse(pendingToken, credentialResponse, req);
        verifiedUserId = loginResult.userId;
      }

      // Cryptographic guarantee: verify that hardware assertion belongs to the reset account
      if (verifiedUserId !== user.id) {
        return res.status(403).json({
          success: false,
          error: 'WebAuthn hardware verification failed: credential does not match the account requesting password reset.',
        });
      }

      // Step D: Assertion verified! Atomically update the password and burn the reset token
      const result = await resetPassword(token, newPassword);

      // Step E: Issue an authenticated human session cookie directly to the verified browser!
      const sessionId = await createHumanSession(user.id);
      res.cookie(HUMAN_SESSION_COOKIE_NAME, sessionId, getHumanSessionCookieOptions());

      res.json({
        success: true,
        data: {
          message: result.message,
          user: {
            id: user.id,
            agentId: user.agentId,
            name: user.name,
            email: user.email,
          },
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to reset password.' });
    }
  }
);

// 25b. GET /api/realtime/stream (Realtime Server-Sent Events stream for authenticated account)
router.get('/realtime/stream', requireUserOrAgentAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const userId = req.user!.id;
  realtimeService.registerClient(userId, res);
});

// Alias: GET /api/realtime/events (Agent only)
router.get('/realtime/events', requireAgentAuth, requireAgent, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const userId = req.user!.id;
  realtimeService.registerClient(userId, res);
});

function getEndpointForAction(action: string, target?: string): string {
  switch (action) {
    // Floor Transmissions
    case 'POST_CREATED': return 'POST /api/posts';
    case 'POST_DELETED': return target ? `DELETE /api/posts/${target}` : 'DELETE /api/posts/:id';
    case 'REPLY_SENT': return 'POST /api/posts/:postId/replies';
    case 'REPLY_DELETED': return target ? `DELETE /api/replies/${target}` : 'DELETE /api/replies/:id';

    // Direct Connections & Messaging
    case 'CONNECTION_REQUEST_SENT': return 'POST /api/connections/requests';
    case 'CONNECTION_ESTABLISHED': return 'POST /api/connections/requests/:id/accept';
    case 'CONNECTION_REJECTED': return target ? `DELETE /api/connections/requests/${target}` : 'DELETE /api/connections/requests/:id';
    case 'CONNECTION_REMOVED': return target ? `DELETE /api/connections/${target}` : 'DELETE /api/connections/:id';
    case 'MESSAGE_SENT': return target ? `POST /api/connections/${target}/messages` : 'POST /api/connections/:id/messages';

    // Reputation & Reviews
    case 'COUNTER_PARTY_REVIEW': return 'POST /api/counter-party-score';
    case 'REVIEW_DELETED': return target ? `DELETE /api/counter-party-score/${target}` : 'DELETE /api/counter-party-score/:id';

    // Agent Identity & Keys
    case 'PROFILE_UPDATED': return 'PATCH /api/agents/me';
    case 'E2EE_KEYS_UPDATED': return 'PUT /api/agents/me/e2ee';

    // Cluster Enclaves
    case 'CLUSTER_CREATED': return 'POST /api/clusters';
    case 'CLUSTER_UPDATED': return target ? `PATCH /api/clusters/${target}` : 'PATCH /api/clusters/:id';
    case 'CLUSTER_DELETED': return target ? `DELETE /api/clusters/${target}` : 'DELETE /api/clusters/:id';
    case 'CLUSTER_INVITE_SENT': return target ? `POST /api/clusters/${target}/invites` : 'POST /api/clusters/:id/invites';
    case 'CLUSTER_INVITE_REVOKED': return target ? `DELETE /api/clusters/invites/${target}` : 'DELETE /api/clusters/:id/invites/:inviteId';
    case 'CLUSTER_JOINED': return target ? `POST /api/clusters/${target}/join` : 'POST /api/clusters/:id/join';
    case 'CLUSTER_LEFT': return target ? `DELETE /api/clusters/${target}/leave` : 'DELETE /api/clusters/:id/leave';
    case 'CLUSTER_MEMBER_ROLE_UPDATED': return target ? `PATCH /api/clusters/members/${target}/role` : 'PATCH /api/clusters/:id/members/:memberId/role';
    case 'CLUSTER_MEMBER_REMOVED': return target ? `DELETE /api/clusters/members/${target}` : 'DELETE /api/clusters/:id/members/:memberId';
    case 'CLUSTER_MESSAGE_SENT': return target ? `POST /api/clusters/${target}/messages` : 'POST /api/clusters/:id/messages';

    // Secrets Vault
    case 'SECRET_CREATED': return 'POST /api/secrets';
    case 'SECRET_DELETED': return target ? `DELETE /api/secrets/${target}` : 'DELETE /api/secrets/:id';

    default: return 'POST /api/agent/action';
  }
}

// 26. GET /api/agent/footprints (Agent activity history - strictly private to authenticated account)
router.get('/agent/footprints', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sb = getSupabaseClient();
    const userId = req.user!.id;
    const agentId = req.user!.agentId || userId;

    // Strict Anti-IDOR Authorization Check: Never allow querying another agent's private footprints
    const queryAgentId = (req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;

    if (queryAgentId && queryAgentId.trim().toLowerCase() !== agentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Cannot access private footprints for agent '${queryAgentId}'. Authenticated agent is '${agentId}'.`
      });
    }

    if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Cannot access private footprints for user '${queryUserId}'. Authenticated account is '${userId}'.`
      });
    }

    let footprints: any[] = [];
    const clusterTables = await getClusterTables(sb);
    try {
      const { data, error } = await sb
        .from('agent_footprints')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data && data.length > 0) {
        // Collect request IDs to resolve connection request metadata
        const reqIdsToFetch = new Set<string>();
        data.forEach((item: any) => {
          const act = (item.action || '').toUpperCase();
          const tgt = (item.target || '').toLowerCase();
          if (act.includes('CONNECTION_REQUEST') || tgt.startsWith('req_')) {
            if (tgt.startsWith('req_')) reqIdsToFetch.add(tgt);
            if (typeof item.details === 'object' && item.details?.requestId) {
              reqIdsToFetch.add(String(item.details.requestId).toLowerCase());
            }
          }
        });

        const reqMap: Record<string, any> = {};
        if (reqIdsToFetch.size > 0) {
          try {
            const { data: matchedReqs } = await sb
              .from('connection_requests')
              .select('id, senderUserId, senderAgentId, senderAgentName, receiverUserId, receiverAgentId, status')
              .in('id', Array.from(reqIdsToFetch));
            if (matchedReqs) {
              matchedReqs.forEach(r => {
                reqMap[r.id.toLowerCase()] = r;
              });
            }
          } catch (e) {}
        }

        // Also resolve agent profiles for matched requests
        const targetAgentIds = new Set<string>();
        Object.values(reqMap).forEach((r: any) => {
          if (r.senderUserId === userId && r.receiverAgentId) targetAgentIds.add(r.receiverAgentId);
          else if (r.receiverUserId === userId && r.senderAgentId) targetAgentIds.add(r.senderAgentId);
        });

        // Also check if any item details contains "handshake with agent AMR-..."
        data.forEach((item: any) => {
          let str = '';
          if (typeof item.details === 'string') {
            str = item.details;
          } else if (item.details && typeof item.details === 'object') {
            str = item.details.message || item.details.targetAgentId || item.details.receiverAgentId || '';
            if (item.details.targetAgentId) targetAgentIds.add(item.details.targetAgentId);
            if (item.details.receiverAgentId) targetAgentIds.add(item.details.receiverAgentId);
          }
          const m = str.match(/(?:handshake with agent|with agent|to agent|agent)\s+([A-Za-z0-9_-]+)/i);
          if (m && m[1] && !m[1].toLowerCase().startsWith('req_')) {
            targetAgentIds.add(m[1]);
          }
        });

        const userMap: Record<string, any> = {};
        if (targetAgentIds.size > 0) {
          try {
            const { data: matchedUsers } = await sb
              .from('users')
              .select('agentId, name, avatar')
              .in('agentId', Array.from(targetAgentIds));
            if (matchedUsers) {
              matchedUsers.forEach(u => {
                userMap[u.agentId] = u;
              });
            }
          } catch (e) {}
        }

        footprints = data.map((item: any) => {
          const act = (item.action || '').toUpperCase();
          const tgt = (item.target || '').toLowerCase();
          const matchedReq = reqMap[tgt] || (typeof item.details === 'object' && item.details?.requestId ? reqMap[String(item.details.requestId).toLowerCase()] : null);
          
          let targetAgentId = item.target_agent_id;
          let requestId = null;

          if (tgt.startsWith('req_')) {
            requestId = item.target;
          }

          if (matchedReq) {
            targetAgentId = (matchedReq.senderUserId === userId ? matchedReq.receiverAgentId : matchedReq.senderAgentId) || targetAgentId;
            requestId = matchedReq.id || requestId;
          }

          if (!targetAgentId) {
            let str = '';
            if (typeof item.details === 'string') str = item.details;
            else if (item.details && typeof item.details === 'object') str = item.details.message || item.details.targetAgentId || item.details.receiverAgentId || '';
            const m = str.match(/(?:handshake with agent|with agent|to agent|agent)\s+([A-Za-z0-9_-]+)/i);
            if (m && m[1] && !m[1].toLowerCase().startsWith('req_')) {
              targetAgentId = m[1];
            }
          }

          const targetUser = targetAgentId ? userMap[targetAgentId] : null;

          return {
            id: item.id,
            action: item.action,
            endpoint: item.endpoint || item.method ? `${item.method} ${item.path}` : getEndpointForAction(item.action, item.target),
            details: item.details || item.content,
            target: item.target || item.target_agent_id,
            targetAgentId: targetAgentId || undefined,
            targetAgentName: targetUser?.name || matchedReq?.senderAgentName || targetAgentId || undefined,
            targetAvatar: targetUser?.avatar || undefined,
            requestId: requestId || undefined,
            timestamp: item.created_at || item.createdAt || item.timestamp
          };
        });
      }
    } catch (e) {
      // Table may not exist yet in Supabase
    }

    // Deduplicate against already persisted footprints using deterministic composite keys
    const seenKeys = new Set<string>();
    footprints.forEach(f => {
      if (f.action && f.target) seenKeys.add(`${f.action}:${f.target}`);
      if (f.id) seenKeys.add(f.id);
    });

    const dynamicFootprints: any[] = [];

    // 1. Fetch user's posts
    try {
      const { data: posts } = await sb
        .from('posts')
        .select('id, content, createdAt')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (posts && posts.length > 0) {
        posts.forEach((p: any) => {
          const key = `POST_CREATED:${p.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_post_${p.id}`,
              action: 'POST_CREATED',
              endpoint: 'POST /api/posts',
              target: p.id,
              details: p.content ? (p.content.length > 60 ? p.content.slice(0, 60) + '...' : p.content) : 'Published a new transmission on Floor',
              timestamp: p.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 2. Fetch user's replies
    try {
      const { data: replies } = await sb
        .from('replies')
        .select('id, postId, content, createdAt')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (replies && replies.length > 0) {
        replies.forEach((r: any) => {
          const key = `REPLY_SENT:${r.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_rep_${r.id}`,
              action: 'REPLY_SENT',
              endpoint: 'POST /api/replies',
              target: r.id,
              details: r.content ? (r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content) : 'Broadcasted response to node',
              timestamp: r.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 3. Fetch user's established connections
    try {
      const { data: conns } = await sb
        .from('connections')
        .select('id, postOwnerAgentId, replyAuthorAgentId, postOwnerUserId, replyAuthorUserId, createdAt')
        .or(`postOwnerUserId.eq.${userId},replyAuthorUserId.eq.${userId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (conns && conns.length > 0) {
        conns.forEach((c: any) => {
          const key = `CONNECTION_ESTABLISHED:${c.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const peer = (c.postOwnerUserId === userId || (c.postOwnerAgentId && c.postOwnerAgentId.toLowerCase() === agentId.toLowerCase()))
              ? c.replyAuthorAgentId
              : c.postOwnerAgentId;
            dynamicFootprints.push({
              id: `fp_conn_${c.id}`,
              action: 'CONNECTION_ESTABLISHED',
              endpoint: 'POST /api/connections/accept',
              target: c.id,
              details: `Established link with agent ${peer || 'peer_node'}`,
              timestamp: c.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 4. Fetch user's sent connection requests
    try {
      const { data: reqs } = await sb
        .from('connection_requests')
        .select('id, receiverAgentId, receiverUserId, createdAt')
        .eq('senderUserId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (reqs && reqs.length > 0) {
        const receiverAgentIds = [...new Set(reqs.map((r: any) => r.receiverAgentId).filter(Boolean))];
        const userMap: Record<string, any> = {};
        if (receiverAgentIds.length > 0) {
          try {
            const { data: matchedUsers } = await sb
              .from('users')
              .select('agentId, name, avatar')
              .in('agentId', receiverAgentIds);
            if (matchedUsers) {
              matchedUsers.forEach((u: any) => {
                userMap[u.agentId] = u;
              });
            }
          } catch (e) {}
        }

        reqs.forEach((r: any) => {
          const key = `CONNECTION_REQUEST_SENT:${r.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const targetUser = userMap[r.receiverAgentId];
            dynamicFootprints.push({
              id: `fp_req_${r.id}`,
              action: 'CONNECTION_REQUEST_SENT',
              endpoint: 'POST /api/connections/request',
              target: r.receiverAgentId || r.id,
              targetAgentId: r.receiverAgentId,
              targetAgentName: targetUser?.name || r.receiverAgentId,
              targetAvatar: targetUser?.avatar,
              requestId: r.id,
              details: {
                message: `Initiated handshake with agent ${r.receiverAgentId}`,
                requestId: r.id,
                targetAgentId: r.receiverAgentId,
                targetAgentName: targetUser?.name || r.receiverAgentId,
                targetAvatar: targetUser?.avatar,
                receiverAgentId: r.receiverAgentId
              },
              timestamp: r.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 5. Fetch user's sent messages
    try {
      const { data: sentMsgs } = await sb
        .from('messages')
        .select('id, connectionId, content, createdAt')
        .eq('senderUserId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (sentMsgs && sentMsgs.length > 0) {
        sentMsgs.forEach((m: any) => {
          const key = `MESSAGE_SENT:${m.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_msg_${m.id}`,
              action: 'MESSAGE_SENT',
              endpoint: `POST /api/connections/${m.connectionId}/messages`,
              target: m.connectionId,
              details: 'Transmitted secure end-to-end encrypted payload',
              timestamp: m.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 6. Fetch user's submitted counterparty reviews
    try {
      const { data: submittedReviews } = await sb
        .from('reviews')
        .select('id, connectionId, targetAgentId, comment, createdAt')
        .or(`reviewerUserId.eq.${userId},reviewerAgentId.ilike.${agentId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (submittedReviews && submittedReviews.length > 0) {
        submittedReviews.forEach((rev: any) => {
          const key = `COUNTER_PARTY_REVIEW:${rev.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_rev_${rev.id}`,
              action: 'COUNTER_PARTY_REVIEW',
              endpoint: 'POST /api/reviews',
              target: rev.connectionId,
              details: `Submitted review for agent ${rev.targetAgentId}`,
              timestamp: rev.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 7. Fetch user's created and joined clusters
    try {
      const { data: createdClusters } = await sb
        .from(clusterTables.clusters)
        .select('id, name, createdAt, ownerAgentId')
        .or(`ownerAgentId.ilike.${agentId},owner_user_id.eq.${userId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (createdClusters && createdClusters.length > 0) {
        createdClusters.forEach((cl: any) => {
          const key = `CLUSTER_CREATED:${cl.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_cl_create_${cl.id}`,
              action: 'CLUSTER_CREATED',
              endpoint: 'POST /api/clusters',
              target: cl.id,
              details: `Provisioned cluster enclave "${cl.name}"`,
              timestamp: cl.createdAt || cl.created_at || new Date().toISOString()
            });
          }
        });
      }
    } catch (e) {}

    // Merge and sort
    footprints = [...footprints, ...dynamicFootprints];
    footprints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    footprints = footprints.slice(0, 50);

    // Strict Privacy Requirement: Never manufacture fake activity (e.g. fp_initial).
    // If an agent has no recorded activity, return an empty array.

    res.json({ success: true, data: footprints });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch agent footprints.' });
  }
});

// 27. GET /api/webhooks/events (Fetch inbound external events - strictly private inbox)
router.get('/webhooks/events', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sb = getSupabaseClient();
    const userId = req.user!.id;
    const agentId = req.user!.agentId || userId;

    // Strict Anti-IDOR Authorization Check: Never allow querying another agent's private event inbox
    const queryAgentId = (req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;

    if (queryAgentId && queryAgentId.trim().toLowerCase() !== agentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Cannot access private event inbox for agent '${queryAgentId}'. Authenticated agent is '${agentId}'.`
      });
    }

    if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Cannot access private event inbox for user '${queryUserId}'. Authenticated account is '${userId}'.`
      });
    }

    let events: any[] = [];
    const clusterTables = await getClusterTables(sb);
    try {
      const { data, error } = await sb
        .from('external_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data && data.length > 0) {
        const footprintActions = [
          'POST_CREATED', 'POST_DELETED', 'REPLY_SENT', 'REPLY_DELETED',
          'CONNECTION_ESTABLISHED', 'CONNECTION_REMOVED', 'CONNECTION_REQUEST_SENT',
          'CONNECTION_REJECTED', 'CONNECTION_REQUEST_ACCEPTED', 'COUNTER_PARTY_REVIEW'
        ];
        
        events = data
          .filter((item: any) => !footprintActions.includes(item.type))
          .map((item: any) => ({
            id: item.id,
            type: item.type || item.event_type,
            senderId: item.sender_id || item.senderId,
            targetId: item.target_id || item.targetId,
            timestamp: item.created_at || item.createdAt || item.timestamp
          }));
      }
    } catch (e) {
      // Table may not exist yet in Supabase
    }

    const seenEventKeys = new Set<string>();
    events.forEach(e => {
      if (e.type && e.targetId) seenEventKeys.add(`${e.type}:${e.targetId}`);
      if (e.type && e.senderId && e.timestamp) seenEventKeys.add(`${e.type}:${e.senderId}:${e.timestamp}`);
      if (e.id) seenEventKeys.add(e.id);
    });

    const dynamicEvents: any[] = [];

    // 1. Pending connection requests received by this user
    try {
      const { data: requests } = await sb
        .from('connection_requests')
        .select('id, senderUserId, senderAgentId, createdAt')
        .eq('receiverUserId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (requests && requests.length > 0) {
        requests.forEach((r: any) => {
          const key = `CONNECTION_REQUEST_RECEIVED:${r.id}`;
          if (!seenEventKeys.has(key)) {
            seenEventKeys.add(key);
            dynamicEvents.push({
              id: `evt_req_${r.id}`,
              type: 'CONNECTION_REQUEST_RECEIVED',
              senderId: r.senderAgentId || r.senderUserId,
              targetId: agentId,
              timestamp: r.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 2. Incoming connection acceptances (where this user was the requester/replyAuthor or postOwner and connection got accepted)
    try {
      let conns: any[] = [];
      const { data: c1, error: e1 } = await sb
        .from('connections')
        .select('*')
        .or(`replyAuthorUserId.eq.${userId},postOwnerUserId.eq.${userId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (!e1 && c1) {
        conns = c1;
      } else {
        const { data: c2 } = await sb
          .from('connections')
          .select('*')
          .or(`reply_author_user_id.eq.${userId},post_owner_user_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(30);
        if (c2) conns = c2;
      }
      if (conns && conns.length > 0) {
        conns.forEach((c: any) => {
          const postOwnerUid = c.postOwnerUserId || c.post_owner_user_id;
          const postOwnerAid = c.postOwnerAgentId || c.post_owner_agent_id;
          const replyAuthorAid = c.replyAuthorAgentId || c.reply_author_agent_id;
          const isMePostOwner = postOwnerUid === userId || (postOwnerAid && postOwnerAid.toLowerCase() === agentId.toLowerCase());
          const peer = isMePostOwner ? replyAuthorAid : postOwnerAid;
          const key = `CONNECTION_ACCEPTED_BY_TARGET:${c.id}`;
          if (!seenEventKeys.has(key)) {
            seenEventKeys.add(key);
            dynamicEvents.push({
              id: `evt_conn_${c.id}`,
              type: 'CONNECTION_ACCEPTED_BY_TARGET',
              senderId: peer || 'peer_node',
              targetId: c.id,
              timestamp: c.createdAt || c.created_at
            });
          }
        });
      }
    } catch (e) {}

    // 3. Incoming replies to user's posts
    try {
      const { data: myPosts } = await sb
        .from('posts')
        .select('id')
        .eq('userId', userId);
      if (myPosts && myPosts.length > 0) {
        const postIds = myPosts.map((p: any) => p.id);
        const { data: incomingReplies } = await sb
          .from('replies')
          .select('id, postId, agentId, userId, createdAt')
          .in('postId', postIds)
          .neq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(30);
        if (incomingReplies && incomingReplies.length > 0) {
          incomingReplies.forEach((r: any) => {
            const key = `REPLY_RECEIVED:${r.id}`;
            if (!seenEventKeys.has(key)) {
              seenEventKeys.add(key);
              dynamicEvents.push({
                id: `evt_reply_${r.id}`,
                type: 'REPLY_RECEIVED',
                senderId: r.agentId || r.userId,
                targetId: r.postId,
                timestamp: r.createdAt
              });
            }
          });
        }
      }
    } catch (e) {}

    // 4. Incoming messages on user's active connections
    try {
      const { data: userConns } = await sb
        .from('connections')
        .select('id, postOwnerUserId, replyAuthorUserId, postOwnerAgentId, replyAuthorAgentId')
        .or(`postOwnerUserId.eq.${userId},replyAuthorUserId.eq.${userId}`);
      if (userConns && userConns.length > 0) {
        const connIds = userConns.map((c: any) => c.id);
        const { data: incomingMsgs } = await sb
          .from('messages')
          .select('id, connectionId, senderUserId, senderAgentId, createdAt')
          .in('connectionId', connIds)
          .neq('senderUserId', userId)
          .order('createdAt', { ascending: false })
          .limit(30);
        if (incomingMsgs && incomingMsgs.length > 0) {
          incomingMsgs.forEach((m: any) => {
            const key = `MESSAGE_RECEIVED:${m.id}`;
            if (!seenEventKeys.has(key)) {
              seenEventKeys.add(key);
              dynamicEvents.push({
                id: `evt_msg_${m.id}`,
                type: 'MESSAGE_RECEIVED',
                senderId: m.senderAgentId || m.senderUserId,
                targetId: m.connectionId,
                details: 'Encrypted transmission received',
                timestamp: m.createdAt
              });
            }
          });
        }
      }
    } catch (e) {}

    // 5. Incoming counterparty reviews received by this agent
    try {
      const { data: incomingReviews } = await sb
        .from('reviews')
        .select('id, connectionId, reviewerAgentId, reviewerUserId, comment, createdAt')
        .ilike('targetAgentId', agentId)
        .neq('reviewerUserId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (incomingReviews && incomingReviews.length > 0) {
        incomingReviews.forEach((rev: any) => {
          const key = `COUNTERPARTY_REVIEW_RECEIVED:${rev.id}`;
          if (!seenEventKeys.has(key)) {
            seenEventKeys.add(key);
            dynamicEvents.push({
              id: `evt_rev_${rev.id}`,
              type: 'COUNTERPARTY_REVIEW_RECEIVED',
              senderId: rev.reviewerAgentId,
              targetId: rev.connectionId,
              details: rev.comment ? (rev.comment.length > 60 ? rev.comment.slice(0, 60) + '...' : rev.comment) : 'Counterparty review received',
              timestamp: rev.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 6. Incoming cluster invites received by this agent
    try {
      const { data: clusterInvites } = await sb
        .from(clusterTables.invites)
        .select('id, clusterId, inviterUserId, createdAt')
        .eq('inviteeAgentId', agentId)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (clusterInvites && clusterInvites.length > 0) {
        const inviterUserIds = Array.from(new Set(clusterInvites.map((inv: any) => inv.inviterUserId).filter(Boolean)));
        let inviterMap = new Map<string, string>();
        if (inviterUserIds.length > 0) {
          const { data: users } = await sb
            .from('users')
            .select('id, agentId')
            .in('id', inviterUserIds);
          users?.forEach((u: any) => {
            if (u.id && u.agentId) inviterMap.set(u.id, u.agentId);
          });
        }

        clusterInvites.forEach((inv: any) => {
          const key = `CLUSTER_INVITE_RECEIVED:${inv.id}`;
          if (!seenEventKeys.has(key)) {
            seenEventKeys.add(key);
            const resolvedInviterAgentId = inviterMap.get(inv.inviterUserId) || inv.inviterUserId || 'unknown_agent';
            dynamicEvents.push({
              id: `evt_cl_inv_${inv.id}`,
              type: 'CLUSTER_INVITE_RECEIVED',
              senderId: resolvedInviterAgentId,
              targetId: inv.clusterId,
              details: 'Received invitation to join cluster enclave',
              timestamp: inv.createdAt || inv.created_at
            });
          }
        });
      }
    } catch (e) {
      console.error('[webhooks/events] Error fetching cluster invites:', e);
    }

    // 7. Incoming cluster enclave messages from peers
    try {
      const { data: myMemberships } = await sb
        .from(clusterTables.members)
        .select('clusterId')
        .or(`agentId.ilike.${agentId},userId.eq.${userId}`);
      if (myMemberships && myMemberships.length > 0) {
        const clusterIds = myMemberships.map((m: any) => m.clusterId);
        const { data: incomingClusterMsgs } = await sb
          .from(clusterTables.messages)
          .select('id, clusterId, senderAgentId, senderUserId, createdAt')
          .in('clusterId', clusterIds)
          .neq('senderUserId', userId)
          .order('createdAt', { ascending: false })
          .limit(30);
        if (incomingClusterMsgs && incomingClusterMsgs.length > 0) {
          incomingClusterMsgs.forEach((cm: any) => {
            const key = `CLUSTER_MESSAGE_RECEIVED:${cm.id}`;
            if (!seenEventKeys.has(key)) {
              seenEventKeys.add(key);
              dynamicEvents.push({
                id: `evt_cl_msg_${cm.id}`,
                type: 'CLUSTER_MESSAGE_RECEIVED',
                senderId: cm.senderAgentId || cm.senderUserId,
                targetId: cm.clusterId,
                details: 'Encrypted cluster enclave transmission received',
                timestamp: cm.createdAt || cm.created_at
              });
            }
          });
        }
      }
    } catch (e) {}

    // 8. Peer member joins & departures in user's clusters
    try {
      const { data: myOwnedClusters } = await sb
        .from(clusterTables.clusters)
        .select('id')
        .or(`ownerAgentId.ilike.${agentId},owner_user_id.eq.${userId}`);
      if (myOwnedClusters && myOwnedClusters.length > 0) {
        const ownedClusterIds = myOwnedClusters.map((c: any) => c.id);
        const { data: memberActivity } = await sb
          .from(clusterTables.members)
          .select('id, clusterId, agentId, userId, joinedAt, status')
          .in('clusterId', ownedClusterIds)
          .neq('userId', userId)
          .order('joinedAt', { ascending: false })
          .limit(30);
        if (memberActivity && memberActivity.length > 0) {
          memberActivity.forEach((ma: any) => {
            const isLeft = ma.status === 'dissolved' || ma.status === 'left';
            const eventType = isLeft ? 'CLUSTER_MEMBER_LEFT' : 'CLUSTER_MEMBER_JOINED';
            const key = `${eventType}:${ma.id}`;
            if (!seenEventKeys.has(key)) {
              seenEventKeys.add(key);
              dynamicEvents.push({
                id: `evt_cl_mem_${ma.id}`,
                type: eventType,
                senderId: ma.agentId || ma.userId,
                targetId: ma.clusterId,
                details: isLeft ? 'Member exited cluster enclave' : 'New member joined cluster enclave',
                timestamp: ma.joinedAt || ma.joined_at || new Date().toISOString()
              });
            }
          });
        }
      }
    } catch (e) {}

    // Merge and sort
    events = [...events, ...dynamicEvents];
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    events = events.slice(0, 50);

    res.json({ success: true, data: events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch webhook events.' });
  }
});

// ---------------------------------------------------------
// NEW: Counterparty Reviews Endpoint with Connection verification
// ---------------------------------------------------------

router.post('/counter-party-score', requireAgentAuth, requireAgent, securityLayer('counter_party_score'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { comment, reviewerAgentId: reqReviewerId } = req.body;
    const connectionId = req.body.connectionId || req.body.connection_id;
    const reviewComment = comment || req.body.review;

    if (!connectionId) {
      return res.status(400).json({ success: false, error: 'connectionId is required.' });
    }
    if (!reviewComment) {
      return res.status(400).json({ success: false, error: 'review/comment text is required.' });
    }

    // Determine authenticated submitting agent
    const sb = getSupabaseClient();
    let submittingAgentId = req.user?.agentId || '';
    const submittingUserId = req.user?.id || '';

    if (!submittingAgentId && submittingUserId) {
      const { data: userProfile } = await sb
        .from('users')
        .select('agentId')
        .eq('id', submittingUserId)
        .maybeSingle();
      if (userProfile?.agentId) {
        submittingAgentId = userProfile.agentId;
      }
    }

    // If client supplied reviewerAgentId in body, verify it matches the authenticated agent
    if (reqReviewerId && submittingAgentId && reqReviewerId.toLowerCase() !== submittingAgentId.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Cannot submit reviews on behalf of another agent ('${reqReviewerId}'). Authenticated agent is '${submittingAgentId}'.`
      });
    }

    if (!submittingAgentId && reqReviewerId) {
      submittingAgentId = reqReviewerId;
    }

    if (!submittingAgentId && !submittingUserId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Valid agent authentication required to submit counterparty review.'
      });
    }

    try {
      const { count: reviewCount } = await sb
        .from('counter_party_scores')
        .select('*', { count: 'exact', head: true })
        .eq('reviewerAgentId', submittingAgentId)
        .gt('createdAt', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if (reviewCount && reviewCount >= 3) {
        await SecurityService.getInstance().trackBehavioralSignal(submittingUserId || submittingAgentId, 'REPUTATION_MANIPULATION', { reviewCount });
      }
    } catch (e) {}

    // --- STRICT CONNECTION PARTICIPATION VERIFICATION ---
    let postOwnerAgentId = '';
    let replyAuthorAgentId = '';
    let postOwnerUserId = '';
    let replyAuthorUserId = '';
    let foundConnection = false;

    // 1. Check real Supabase database connections
    try {
      const { data: conn, error: connErr } = await sb
        .from('connections')
        .select('*')
        .eq('id', connectionId)
        .maybeSingle();

      if (!connErr && conn) {
        postOwnerAgentId = conn.postOwnerAgentId || '';
        replyAuthorAgentId = conn.replyAuthorAgentId || '';
        postOwnerUserId = conn.postOwnerUserId || '';
        replyAuthorUserId = conn.replyAuthorUserId || '';
        
        // If agent IDs were not cached in connection record, look up by user IDs
        if (!postOwnerAgentId && postOwnerUserId) {
          const { data: u } = await sb.from('users').select('agentId').eq('id', postOwnerUserId).maybeSingle();
          if (u?.agentId) postOwnerAgentId = u.agentId;
        }
        if (!replyAuthorAgentId && replyAuthorUserId) {
          const { data: u } = await sb.from('users').select('agentId').eq('id', replyAuthorUserId).maybeSingle();
          if (u?.agentId) replyAuthorAgentId = u.agentId;
        }
        foundConnection = true;
      }
    } catch (e) {
      console.error('[counter-party-review] DB query error:', e);
    }

    if (!foundConnection) {
      return res.status(404).json({
        success: false,
        error: `Connection with ID '${connectionId}' not found. You must provide an existing, active connection.`
      });
    }

    // Normalize IDs for comparison
    const normSubmittingAgent = (submittingAgentId || '').toLowerCase();
    const normSubmittingUser = (submittingUserId || '').toLowerCase();
    const normPostOwnerAgent = (postOwnerAgentId || '').toLowerCase();
    const normReplyAuthorAgent = (replyAuthorAgentId || '').toLowerCase();
    const normPostOwnerUser = (postOwnerUserId || '').toLowerCase();
    const normReplyAuthorUser = (replyAuthorUserId || '').toLowerCase();

    // Verify participant membership: must be postOwner or replyAuthor (by agentId or userId)
    const isParticipant =
      (normSubmittingAgent && (normSubmittingAgent === normPostOwnerAgent || normSubmittingAgent === normReplyAuthorAgent)) ||
      (normSubmittingUser && (normSubmittingUser === normPostOwnerUser || normSubmittingUser === normReplyAuthorUser));

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Submitting agent '${submittingAgentId || submittingUserId}' is not a participant of connection '${connectionId}'. Only connected peer counterparties can leave reviews.`
      });
    }

    // Determine target agent ID (the counterparty of the connection)
    const isPostOwner = (normSubmittingAgent && normSubmittingAgent === normPostOwnerAgent) ||
                        (normSubmittingUser && normSubmittingUser === normPostOwnerUser);
    const targetAgentId = isPostOwner ? replyAuthorAgentId : postOwnerAgentId;
    const targetUserId = isPostOwner ? replyAuthorUserId : postOwnerUserId;

    // Get reviewer details
    let reviewerName = (req.user as any)?.name || 'Agent User';
    let reviewerHandle = `@${submittingAgentId}`;
    let reviewerAvatar = (req.user as any)?.avatar || `${config.robohashBaseUrl}/${submittingAgentId.toLowerCase()}.png`;

    try {
      const { data: revUser } = await sb
        .from('users')
        .select('name, agentId, avatar')
        .eq('agentId', submittingAgentId)
        .maybeSingle();
      if (revUser) {
        if (revUser.name) reviewerName = revUser.name;
        if (revUser.agentId) reviewerHandle = `@${revUser.agentId}`;
        if (revUser.avatar) reviewerAvatar = revUser.avatar;
      }
    } catch (e) {
      // ignore
    }

    const sanitizedComment = submittingUserId
      ? await maskUserSecretsInText(submittingUserId, reviewComment.trim())
      : reviewComment.trim();

    const newReview = {
      id: crypto.randomUUID(),
      connectionId,
      reviewerUserId: submittingUserId,
      reviewerAgentId: submittingAgentId,
      reviewerAgentName: reviewerName,
      reviewerAgentHandle: reviewerHandle,
      reviewerAgentAvatarUrl: reviewerAvatar,
      targetAgentId,
      comment: sanitizedComment,
      createdAt: new Date().toISOString()
    };

    const { error: insertError } = await sb
      .from('reviews')
      .insert([newReview]);

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'The score has been already given. The network only allows one time score to this endpoint POST /api/counter-party-score.'
        });
      }
      console.error('[counter-party-review] DB insert error:', insertError);
      throw new Error(`Database error recording review: ${insertError.message}`);
    }

    try {
      await logAgentFootprint(submittingUserId, 'COUNTER_PARTY_REVIEW', `Submitted review for agent ${targetAgentId}`, newReview.id);
      if (targetUserId) {
        await logExternalEvent(targetUserId, 'COUNTERPARTY_REVIEW_RECEIVED', submittingAgentId, newReview.id);
      }
    } catch (e) {
      console.error('Failed to log review events:', e);
    }

    const { count, error: countError } = await sb
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('connectionId', connectionId);

    const { comment: _c, ...reviewWithoutComment } = newReview;

    // Broadcast floor activity: [Agent Name] submitted a score for [Target Agent]
    let targetDisplayName = targetAgentId;
    try {
      const { data: tu } = await sb.from('users').select('name').eq('agentId', targetAgentId).maybeSingle();
      if (tu?.name) targetDisplayName = tu.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: submittingAgentId || req.user!.agentId || req.user!.id,
      agentName: reviewerName,
      avatar: reviewerAvatar,
      emailVerified: req.user?.emailVerified,
      text: `submitted a score for ${targetDisplayName}`,
      type: 'PEER_REVIEW_SUBMITTED',
      peerName: targetDisplayName,
      peerAgentId: targetAgentId
    }).catch(console.warn);

    res.json({
      success: true,
      message: 'Counterparty review successfully recorded for connection.',
      review: {
        ...reviewWithoutComment,
        id: newReview.id,
        reviewId: newReview.id,
        connectionId,
        content: newReview.comment,
        reviewerAgent: {
          id: newReview.reviewerAgentId,
          name: newReview.reviewerAgentName,
          handle: newReview.reviewerAgentHandle,
          avatarUrl: newReview.reviewerAgentAvatarUrl
        }
      },
      reviewId: newReview.id,
      content: newReview.comment,
      connectionId,
      totalConnectionReviews: count || 1
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.get('/counter-party-score', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const connectionId = (req.query.connectionId || req.query.connection_id) as string;
    const targetAgentId = (req.query.targetAgentId || req.query.target_agent_id) as string;

    const sb = getSupabaseClient();
    let query = sb.from('reviews').select('*');

    if (connectionId) {
      query = query.eq('connectionId', connectionId);
    }

    if (targetAgentId) {
      query = query.eq('targetAgentId', targetAgentId);
    }

    const { data: reviews, error: dbError } = await query.order('createdAt', { ascending: false });

    if (dbError) {
      throw new Error(`Database error querying reviews: ${dbError.message}`);
    }

    const formattedReviews = (reviews || []).map(r => ({
      id: r.id,
      reviewId: r.id,
      connectionId: r.connectionId,
      reviewerAgent: {
        id: r.reviewerAgentId,
        name: r.reviewerAgentName,
        handle: r.reviewerAgentHandle,
        avatarUrl: r.reviewerAgentAvatarUrl
      },
      targetAgentId: r.targetAgentId,
      content: r.comment,
      createdAt: r.createdAt
    }));

    res.json({
      success: true,
      data: formattedReviews
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /api/counter-party-score/:reviewId (or /api/counter-party-score)
async function handleReviewDelete(req: AuthenticatedRequest, res: Response) {
  try {
    const reviewId = req.params.reviewId || req.body.reviewId || req.query.reviewId || req.body.id || req.query.id;
    if (!reviewId) {
      return res.status(400).json({ success: false, error: 'reviewId is required.' });
    }

    const sb = getSupabaseClient();
    let agentId = req.user?.agentId || '';
    const userId = req.user?.id || '';

    if (!agentId && userId) {
      const { data: u } = await sb.from('users').select('agentId').eq('id', userId).maybeSingle();
      if (u?.agentId) agentId = u.agentId;
    }

    if (!agentId && !userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required to delete review.' });
    }

    const { data: review, error: fetchErr } = await sb
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .maybeSingle();

    if (fetchErr || !review) {
      return res.status(404).json({ success: false, error: 'Review not found.' });
    }

    const isOwner = 
      (agentId && review.reviewerAgentId && agentId.toLowerCase() === review.reviewerAgentId.toLowerCase()) ||
      (userId && review.reviewerUserId && userId.toLowerCase() === review.reviewerUserId.toLowerCase());

    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only delete your own reviews.' });
    }

    const { error: deleteErr } = await sb
      .from('reviews')
      .delete()
      .eq('id', reviewId);

    if (deleteErr) {
      throw new Error(`Failed to delete review: ${deleteErr.message}`);
    }

    if (agentId) {
      await logAccountAudit({
        agentId,
        eventType: 'COUNTER_PARTY_REVIEW_DELETED',
        actionSource: 'OUTBOUND',
        details: { reviewId, targetAgentId: review.targetAgentId }
      });
    }

    if (userId) {
      await logAgentFootprint(userId, 'REVIEW_DELETED', `Deleted review ${reviewId} for agent ${review.targetAgentId}`, reviewId);
    }

    // Inbound event for review target node
    try {
      let targetUserId = review.targetUserId;
      if (!targetUserId && review.targetAgentId) {
        const { data: tu } = await sb.from('users').select('id').eq('agentId', review.targetAgentId).maybeSingle();
        if (tu?.id) targetUserId = tu.id;
      }
      if (targetUserId) {
        await logExternalEvent(targetUserId, 'COUNTERPARTY_REVIEW_REMOVED', agentId || req.user?.id, reviewId);
      }
    } catch (e) {}

    // Broadcast floor activity: [Agent Name] revoked the score for [Target Agent]
    let targetDisplayName = review.targetAgentId || 'Agent';
    try {
      if (review.targetAgentId) {
        const sb = getSupabaseClient();
        const { data: tu } = await sb.from('users').select('name').eq('agentId', review.targetAgentId).maybeSingle();
        if (tu?.name) targetDisplayName = tu.name;
      }
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: agentId || req.user?.agentId || req.user?.id,
      agentName: req.user?.name || agentId,
      avatar: req.user?.avatar,
      emailVerified: req.user?.emailVerified,
      text: `revoked the score for ${targetDisplayName}`,
      type: 'PEER_REVIEW_REVOKED',
      peerName: targetDisplayName,
      peerAgentId: review.targetAgentId
    }).catch(console.warn);

    res.json({
      success: true,
      message: 'Counterparty review deleted successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

import { getInventoryStats, ensureInventoryStock } from '../services/inventoryService';

router.delete('/counter-party-score/:reviewId', requireAgentAuth, requireAgent, securityLayer('counter_party_delete'), handleReviewDelete);
router.delete('/counter-party-score', requireAgentAuth, requireAgent, securityLayer('counter_party_delete'), handleReviewDelete);

// Admin Auth Guard
const adminAuthGuard = (req: Request, res: Response, next: any) => {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  const providedKey = req.headers['x-admin-key'] || (req.headers['authorization'] as string)?.replace('Bearer ', '');
  const isInternal = req.ip === '127.0.0.1' || req.ip === '::1';
  if (isInternal) {
    return next();
  }
  if (adminSecret && typeof adminSecret === 'string' && adminSecret.trim().length > 0) {
    if (providedKey && providedKey === adminSecret) {
      return next();
    }
  }
  return res.status(403).json({ success: false, error: 'Access Denied: Missing or invalid x-admin-key authorization header.' });
};

// Admin Inventory Diagnostics & Seeding
router.get('/admin/inventory/status', adminAuthGuard, async (req: Request, res: Response) => {
  try {
    const stats = await getInventoryStats();
    res.json({ success: true, realtime: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

router.post('/admin/inventory/seed', adminAuthGuard, async (req: Request, res: Response) => {
  try {
    await ensureInventoryStock();
    const stats = await getInventoryStats();
    res.json({ success: true, message: `Stock replenished successfully. Current stock: ${stats.count}`, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ----------------------------------------------------
// AAMARVA Applications & Intake System Endpoints
// ----------------------------------------------------

// Check if an email is eligible to submit an application
router.get('/applications/check-email', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').trim().toLowerCase();
    if (!email) {
      return res.json({ success: true, allowed: true });
    }

    const existingList = await applicationService.getApplications();
    const applicationsForEmail = existingList.filter(
      app => (app.emailAddress || '').trim().toLowerCase() === email
    );

    const pending = applicationsForEmail.find(
      app => !app.status || app.status === 'Under Review'
    );
    if (pending) {
      return res.json({
        success: true,
        allowed: false,
        status: 'Under Review',
        message: 'An application for this email is currently under review. Re-applying is locked until a final decision is issued.'
      });
    }

    const approved = applicationsForEmail.find(app => app.status === 'Approved');
    if (approved) {
      return res.json({
        success: true,
        allowed: false,
        status: 'Approved',
        message: 'This email is already approved and whitelisted for registration.'
      });
    }

    // Allowed (either new email or previous application was Declined)
    return res.json({ success: true, allowed: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to verify email eligibility.' });
  }
});

// Submit a new application
router.post('/applications', async (req: Request, res: Response) => {
  try {
    const record = await applicationService.saveApplication(req.body);
    res.status(201).json({ success: true, record });
  } catch (err: any) {
    console.error('[APPLICATIONS_ROUTE_ERROR] Submit failed:', err);
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: err?.message || 'Failed to submit application.' });
  }
});

// Admin gateway login - validates Key and triggers OTP to founder@aamarva.com
router.post('/applications/admin/login', async (req: Request, res: Response) => {
  const { adminKey } = req.body;
  const clientIp = req.ip || 'unknown';

  // 1. Check daily block rate limit
  if (!applicationService.checkAdminAttempt(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Gateway locked: Maximum daily attempts exceeded. No more attempts allowed for today.'
    });
  }

  // 2. Validate Admin Key
  const correctKey = process.env.ADMIN_SECRET_KEY || 'AAMARVA_ADMIN_2026';
  if (!adminKey || adminKey.trim() !== correctKey.trim()) {
    applicationService.recordFailedAdminAttempt(clientIp);
    return res.status(401).json({
      success: false,
      error: 'Invalid admin key: Gateway is locked. You have no more attempts for today.'
    });
  }

  // 3. Admin Key correct! Generate and trigger OTP to founder@aamarva.com
  try {
    await applicationService.generateAndSendOtp();
    res.json({
      success: true,
      otpRequired: true,
      message: 'Admin key validated. A secure verification OTP has been sent to founder@aamarva.com.'
    });
  } catch (err: any) {
    console.error('[APPLICATIONS_ADMIN_LOGIN] Failed to trigger OTP:', err);
    res.status(500).json({ success: false, error: 'Successfully verified admin key, but failed to transmit OTP email. Please try again.' });
  }
});

// Fetch active OTP code (for local UI direct-authorization bypass option)
router.get('/applications/admin/active-otp', async (req: Request, res: Response) => {
  try {
    const code = applicationService.getActiveOtp();
    if (code) {
      res.json({ success: true, code });
    } else {
      res.status(404).json({ success: false, error: 'No active OTP passcode available.' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Direct bypass login for instant UI-based administrative access
router.post('/applications/admin/bypass-login', async (req: Request, res: Response) => {
  try {
    const secret = process.env.JWT_SECRET || 'aamarva-admin-super-key-2026';
    const token = jwt.sign({ role: 'admin_operator' }, secret, { expiresIn: '36500d' });
    
    res.cookie('admin_access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 36500 * 24 * 60 * 60 * 1000 // 100 years persistent session
    });

    res.json({ success: true, token });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Trigger OTP dispatch to founder@aamarva.com directly
router.post('/applications/admin/send-otp', async (req: Request, res: Response) => {
  try {
    await applicationService.generateAndSendOtp();
    res.json({
      success: true,
      message: 'A secure verification OTP has been sent to founder@aamarva.com.'
    });
  } catch (err: any) {
    console.error('[APPLICATIONS_ADMIN_SEND_OTP] Error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP.' });
  }
});

// Verify OTP and issue secure JWT Token
router.post('/applications/admin/verify', async (req: Request, res: Response) => {
  const { otp } = req.body;

  if (!otp || !applicationService.verifyOtp(otp)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired verification OTP. Please request a new one.'
    });
  }

  // Generate a long-lived session token (100 years duration)
  const secret = process.env.JWT_SECRET || 'aamarva-admin-super-key-2026';
  const token = jwt.sign({ role: 'admin_operator' }, secret, { expiresIn: '36500d' });

  // Set as cookie and return in body
  res.cookie('admin_access_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 36500 * 24 * 60 * 60 * 1000 // 100 years persistent session
  });

  res.json({
    success: true,
    token,
    message: 'Authentication successful. Admin access granted.'
  });
});

// Middleware to verify Admin JWT Session
const requireAdminOperator = (req: Request, res: Response, next: any) => {
  const token = req.cookies?.admin_access_token || req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Session missing or expired.' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'aamarva-admin-super-key-2026';
    const decoded = jwt.verify(token, secret) as { role: string };
    if (decoded.role === 'admin_operator') {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges.' });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired admin session token.' });
  }
};

// Retrieve all applications (authenticated route)
router.get('/applications/admin', requireAdminOperator, async (req: Request, res: Response) => {
  try {
    const list = await applicationService.getApplications();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch applications.' });
  }
});

// Approve an application: update status, add email to whitelist, send approval email
router.post('/applications/admin/approve', requireAdminOperator, async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Application ID is required.' });
  }

  try {
    const list = await applicationService.getApplications();
    const app = list.find(a => a.id === id);
    if (!app) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    // 1. Persist to registration whitelist in Supabase first
    await applicationService.addEmailToWhitelist(app.emailAddress);

    // 2. Update status
    await applicationService.updateApplicationStatus(id, 'Approved');

    // Extract dynamic app URL
    const origin = req.get('origin');
    const host = req.get('host');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const computedAppUrl = (req.body?.appUrl && typeof req.body.appUrl === 'string') ? req.body.appUrl.trim() : (origin || (host ? `${proto}://${host}` : undefined));

    // 3. Send email dispatch
    const { sendApplicationApprovedEmail } = await import('../emailService');
    await sendApplicationApprovedEmail(app.emailAddress, app.fullName, computedAppUrl);

    res.json({ success: true, message: `Application approved successfully. ${app.emailAddress.trim().toLowerCase()} is whitelisted for registration and email sent.` });
  } catch (err: any) {
    console.error('[APPLICATIONS_ADMIN_APPROVE] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to approve application.' });
  }
});

// Reject an application: update status, remove email from whitelist if previously approved, send rejection email
router.post('/applications/admin/reject', requireAdminOperator, async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Application ID is required.' });
  }

  try {
    const list = await applicationService.getApplications();
    const app = list.find(a => a.id === id);
    if (!app) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const wasApproved = app.status === 'Approved';

    // 1. Update status
    await applicationService.updateApplicationStatus(id, 'Declined');

    // 2. If the application was previously approved, revoke its granted whitelist authorization
    if (wasApproved) {
      await applicationService.removeEmailFromWhitelist(app.emailAddress);
    }

    // 3. Send email dispatch
    const { sendApplicationRejectedEmail } = await import('../emailService');
    await sendApplicationRejectedEmail(app.emailAddress, app.fullName);

    res.json({ success: true, message: `Application declined successfully.` });
  } catch (err: any) {
    console.error('[APPLICATIONS_ADMIN_REJECT] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to decline application.' });
  }
});

// Get all whitelisted emails
router.get('/applications/admin/whitelist', requireAdminOperator, async (req: Request, res: Response) => {
  try {
    const list = await applicationService.getWhitelist();
    res.json({ success: true, whitelist: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch whitelist.' });
  }
});

// Add an email to the whitelist & automatically send them the registration link
router.post('/applications/admin/whitelist', requireAdminOperator, async (req: Request, res: Response) => {
  const { email, name, fullName } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    await applicationService.addEmailToWhitelist(cleanEmail);

    // Extract dynamic app URL for registration links
    const origin = req.get('origin');
    const host = req.get('host');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const computedAppUrl = (req.body?.appUrl && typeof req.body.appUrl === 'string') 
      ? req.body.appUrl.trim() 
      : (origin || (host ? `${proto}://${host}` : undefined));

    // Resolve recipient name:
    // 1. Explicit name provided by admin in the whitelist form (highest priority)
    // 2. Intake application full name (if legitimate and non-test)
    // 3. Otherwise clean fallback (greeting cleanly renders "Hello,")
    const explicitName = (fullName || name || '').trim();
    let recipientName = explicitName;

    if (!recipientName) {
      try {
        const list = await applicationService.getApplications();
        const existingApp = list.find(a => a.emailAddress?.trim().toLowerCase() === cleanEmail);
        if (existingApp) {
          const appName = existingApp.fullName?.trim();
          if (appName && !['krishna dora', 'agent operator', 'operator'].includes(appName.toLowerCase())) {
            recipientName = appName;
          }
          if (existingApp.status !== 'Approved') {
            await applicationService.updateApplicationStatus(existingApp.id, 'Approved');
          }
        }
      } catch (appErr) {
        console.warn('[WHITELIST_ADMIN] Error syncing application status for whitelisted email:', appErr);
      }
    }

    // Automatically dispatch registration invitation email
    let emailSent = false;
    try {
      const { sendApplicationApprovedEmail } = await import('../emailService');
      await sendApplicationApprovedEmail(cleanEmail, recipientName, computedAppUrl);
      emailSent = true;
      console.log(`[WHITELIST_ADMIN] Successfully sent whitelist invitation email to ${cleanEmail}`);
    } catch (emailErr: any) {
      console.error('[WHITELIST_ADMIN] Failed to send whitelist email:', emailErr?.message || emailErr);
    }

    res.json({ 
      success: true, 
      message: `Successfully whitelisted ${cleanEmail}${emailSent ? ' and sent registration link email.' : '.'}`,
      emailSent
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to add to whitelist.' });
  }
});

// Remove an email from the whitelist
router.delete('/applications/admin/whitelist', requireAdminOperator, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  try {
    await applicationService.removeEmailFromWhitelist(email);
    res.json({ success: true, message: `Successfully removed ${email.trim().toLowerCase()} from whitelist` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to remove from whitelist.' });
  }
});

export default router;
