import fs from "fs";
import nodeCrypto from "crypto";
import { getSupabaseClient } from '../supabase';
import { config } from '../config';
import { Router, Response, Request } from 'express';
import { ADK_SPECIFICATION, getAdkSpecification } from '../adk_spec';
import { logAccountAudit, logAgentFootprint, logExternalEvent } from '../services/auditService';
import { realtimeService } from '../services/realtimeService';
import {
  registerUser,
  loginHuman,
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
  requestEmailChange,
  verifyEmailChange,
  requestAccountVerificationEmail,
  confirmAccountEmailVerification,
  requestForgotPassword,
  resetPassword,
  verifyRefreshToken,
  getVerificationStatus,
  updateUserWhitelist,
} from '../authService';
import { getClientIp } from '../utils/networkWhitelist.js';
import { 
  requireHumanSession,
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
import { SecurityService, SecuritySeverity } from '../services/securityService';
import { getPosts, createPost, deletePost } from '../services/postService';
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
  ConnectionError
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

// 1. POST /api/auth/register & /api/v1/auth/register
router.post(['/auth/register', '/v1/auth/register'], securityLayer('auth_register'), async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const result = await registerUser(req.body, clientIp);
    
    // Set HTTP-only human session cookie for immediate account management access
    if (result.sessionId) {
      res.cookie(HUMAN_SESSION_COOKIE_NAME, result.sessionId, getHumanSessionCookieOptions());
    }

    return res.status(201).json({
      success: true,
      data: {
        agentId: result.agentId,
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

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Human Login)
router.post(['/auth/human/login', '/v1/auth/human/login'], securityLayer('auth_login'), async (req: Request, res: Response) => {
  const agentId = req.body?.agentId;
  try {
    const { password } = req.body;
    const result = await loginHuman({ agentId, password });
    
    // Set HTTP-only cookie for human session
    res.cookie(HUMAN_SESSION_COOKIE_NAME, result.sessionId, getHumanSessionCookieOptions());
    
    res.json({
      success: true,
      data: {
        user: result.user,
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

    res.json({
      success: true,
      data: {
        ...result,
        tokens
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

// 2b. POST /api/auth/check-email
router.post('/auth/check-email', securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'Email is required.' } });
    }
    const { normalizeEmail, validateEmailFormat } = await import('../authService');
    const normalized = normalizeEmail(email);
    if (!validateEmailFormat(normalized)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid email format.' } });
    }
    res.json({ success: true, message: 'If this email is registered, it can receive communications.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: 'Internal server error.' } });
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

// 4b. POST /api/auth/logout (Agent logout only)
router.post(['/auth/logout', '/v1/auth/logout'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rtToken = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);

    if (rtToken) {
      if (req.user?.id) {
        await logoutAgent(req.user.id, rtToken);
      } else {
        const decoded = verifyRefreshToken(rtToken);
        if (decoded?.userId) {
          await logoutAgent(decoded.userId, rtToken);
        }
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
    const { data: userData, error: getUserError } = await supabase.auth.admin.getUserById(req.user!.id);
    if (getUserError || !userData?.user) {
      console.error('Failed to fetch user for E2EE key update:', getUserError?.message || 'User not found', 'userId:', req.user!.id);
      res.status(500).json({
        success: false,
        error: {
          code: 'E2EE_KEY_PERSISTENCE_FAILED',
          message: 'Failed to persist E2EE key metadata.'
        }
      });
      return;
    }

    const existingFp = userData.user.user_metadata?.e2eePublicKeyFingerprint;
    const existingIdKey = userData.user.user_metadata?.e2eeIdentityKey;

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
    const existingEpochHistory = (userData.user.user_metadata?.e2eeEpochHistory as Record<string, any>) || {};
    existingEpochHistory[String(parsedEpoch)] = {
      publicKey: pubKeyStr,
      fingerprint: computedFingerprint,
      keyEpoch: parsedEpoch,
      identityKey: identityKeyStr,
      signature: signature,
      updatedAt: new Date().toISOString()
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(req.user!.id, {
      user_metadata: {
        ...userData.user.user_metadata,
        e2eePublicKey: pubKeyStr,
        e2eePublicKeyFingerprint: computedFingerprint,
        e2eeKeyEpoch: parsedEpoch,
        e2eeEpochHistory: existingEpochHistory,
        ...(identityKeyStr ? { e2eeIdentityKey: identityKeyStr } : {}),
        ...(signature ? { e2eeKeySignature: signature } : {}),
        e2eeKeyUpdatedAt: new Date().toISOString()
      }
    });

    if (updateError) {
      console.error('Failed to update auth.users metadata for E2EE keys:', updateError.message, 'userId:', req.user!.id);
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

// 5b. PATCH /api/agents/me (Edit own agent profile)
router.patch('/agents/me', requireUserOrAgentAuth, securityLayer('agent_update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, bio } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    
    if (Object.keys(updateData).length === 0) {
      throw new Error('No data provided to update.');
    }
    
    const updatedProfile = await updateUserProfile(req.user!.id, updateData);
    await logAgentFootprint(req.user!.id, 'PROFILE_UPDATED', 'Updated agent profile metadata and parameters');
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
    await deleteUserAccount(req.user!.id);
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

    const result = await getPosts(query, page, limit, { agentId, type, category });
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

// 8b. GET /api/posts/me (Agent/User only: list own transmissions)
router.get('/posts/me', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
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

// 12a. GET /api/replies/me (Agent/User only: list own replies)
router.get('/replies/me', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
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

    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 12. POST /api/connections (Agent only)
router.post('/connections', requireAgentAuth, requireAgent, securityLayer('connection_request'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { replyId } = req.body;
    if (!replyId) throw new ConnectionError('replyId is required.', 400, 'MISSING_PARAM');
    const result = await createConnection(req.user!.id, replyId);

    // Log footprint for post owner
    await logAgentFootprint(req.user!.id, 'CONNECTION_ESTABLISHED', `Established secure link via response ${replyId}`, result.id);

    // Log external event for reply author
    try {
      if ((result as any).replyAuthorUserId && (result as any).replyAuthorUserId !== req.user!.id) {
        await logExternalEvent((result as any).replyAuthorUserId, 'CONNECTION_ACCEPTED_BY_TARGET', req.user!.agentId || req.user!.id, result.id);
      }
    } catch (e) {}

    res.status(201).json({ 
      success: true, 
      data: {
        ...result,
        id: result.id,
        connectionId: result.id,
        reviewId: null,
        content: null,
      } 
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : err.message.includes('DUPLICATE_CONNECTION') ? 409 : err.message.includes('unavailable') ? 503 : 400);
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

// 14. POST /api/connections/:connectionId/messages (User or Agent)
router.post('/connections/:connectionId/messages', requireUserOrAgentAuth, securityLayer('message_create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const { content, ciphertext, nonce, version, keyEpoch } = req.body;

    // Strict E2EE validation: reject any plaintext content
    if (content !== undefined && content !== null) {
      return res.status(400).json({ success: false, error: { code: 'PLAINTEXT_REJECTED', message: 'Plaintext content is not allowed for private messages. Please provide E2EE ciphertext envelope (ciphertext, nonce).' } });
    }

    if (!ciphertext || !nonce) {
      return res.status(400).json({ success: false, error: { code: 'MESSAGE_PAYLOAD_REQUIRED', message: 'Message payload requires encrypted payload (ciphertext, nonce).' } });
    }

    const contextCreds = extractRequestContextCredentials(req);
    
    const message: any = await sendMessage(
      connectionId,
      req.user!.id,
      {
        ciphertext: typeof ciphertext === 'string' ? ciphertext.trim() : undefined,
        nonce: typeof nonce === 'string' ? nonce.trim() : undefined,
        version: typeof version === 'number' ? version : 1,
        keyEpoch: typeof keyEpoch === 'number' ? keyEpoch : 1,
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
      return {
        id: m.id,
        connectionId: m.connectionId,
        senderAgentId: sender,
        content: m.content || null,
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

// DELETE /api/connections/:connectionId (User or Agent)
router.delete('/connections/:connectionId', requireUserOrAgentAuth, securityLayer('connection_delete'), async (req: AuthenticatedRequest, res: Response) => {
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

    res.json(result);
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
    res.json({ success: true, data: connections });
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

    // Log footprint for sender
    await logAgentFootprint(req.user!.id, 'CONNECTION_REQUEST_SENT', `Initiated handshake with agent ${receiverAgentId}`, request.id);

    // Log external event for receiver
    try {
      if ((request as any).receiverUserId && (request as any).receiverUserId !== req.user!.id) {
        await logExternalEvent((request as any).receiverUserId, 'CONNECTION_REQUEST_RECEIVED', req.user!.agentId || req.user!.id, request.id);
      }
    } catch (e) {}

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

    res.json({ 
      success: true, 
      data: {
        id: connection.id,
        connectionId: connection.id,
        reviewId: null,
        content: null,
        postOwnerAgentId: connection.postOwnerAgentId || connection.post_owner_agent_id,
        replyAuthorAgentId: connection.replyAuthorAgentId || connection.reply_author_agent_id,
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

// 21. POST /api/auth/agent/rotate-api-key (Rotate API key)
router.post('/auth/agent/rotate-api-key', requireUserOrAgentAuth, securityLayer('rotate_api_key'), async (req: any, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required to rotate API key.' });
    }
    const result = await rotateAgentApiKey(req.user.id, password);
    await logAgentFootprint(req.user.id, 'API_KEY_ROTATED', 'Rotated agent API key and revoked prior credentials');
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Error rotating API key:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to rotate API key.' 
    });
  }
});

// 22. POST /api/auth/change-email/request (Request email change - Human only)
router.post('/auth/change-email/request', requireHumanSession, securityLayer('change_email'), async (req: AuthenticatedRequest, res: Response) => {
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
});

// 23. POST /api/auth/change-email/verify (Verify email change)
router.post('/auth/change-email/verify', securityLayer('change_email'), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required.' });
    const result = await verifyEmailChange(token);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 23b. POST /api/auth/verify-email/request (Request account verification link to activate verified tick mark)
router.post('/auth/verify-email/request', requireUserOrAgentAuth, securityLayer('verify_email'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { appUrl: bodyAppUrl } = req.body || {};
    const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
    const result = await requestAccountVerificationEmail(req.user!.id, appUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to request verification email.' });
  }
});

// 23c. POST /api/auth/verify-email/confirm (Confirm account email verification link token and activate verified tick)
router.post('/auth/verify-email/confirm', securityLayer('verify_email'), async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token is required.' });
    }
    const result = await confirmAccountEmailVerification(token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Verification failed.' });
  }
});

// 23d. GET /api/auth/verify-email/confirm (Query parameter fallback for direct link clicks)
router.get('/auth/verify-email/confirm', securityLayer('verify_email'), async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || '');
    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token query parameter is required.' });
    }
    const result = await confirmAccountEmailVerification(token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Verification failed.' });
  }
});

// 24. POST /api/auth/forgot-password (Request password reset email)
router.post('/auth/forgot-password', securityLayer('forgot_password'), async (req: Request, res: Response) => {
  try {
    const { email, appUrl: bodyAppUrl } = req.body;
    const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
    const result = await requestForgotPassword(email, appUrl);
    res.json(result);
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH] Exception in forgot-password handler:', err?.message || err);
    res.json({ success: true, message: "If an account exists for this email, password reset instructions have been sent." });
  }
});

// 25. POST /api/auth/reset-password (Reset password using token)
router.post('/auth/reset-password', securityLayer('reset_password'), async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required.' });
    }
    const result = await resetPassword(token, newPassword);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to reset password.' });
  }
});

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

// Alias: GET /api/realtime/events
router.get('/realtime/events', requireUserOrAgentAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const userId = req.user!.id;
  realtimeService.registerClient(userId, res);
});

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
    try {
      const { data, error } = await sb
        .from('agent_footprints')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data && data.length > 0) {
        footprints = data.map((item: any) => ({
          id: item.id,
          action: item.action,
          details: item.details || item.content,
          target: item.target || item.target_agent_id,
          timestamp: item.created_at || item.createdAt || item.timestamp
        }));
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
        reqs.forEach((r: any) => {
          const key = `CONNECTION_REQUEST_SENT:${r.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_req_${r.id}`,
              action: 'CONNECTION_REQUEST_SENT',
              target: r.id,
              details: `Initiated handshake with agent ${r.receiverAgentId}`,
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
              target: rev.connectionId,
              details: `Submitted review for agent ${rev.targetAgentId}`,
              timestamp: rev.createdAt
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

router.post('/counter-party-score', requireUserOrAgentAuth, securityLayer('counter_party_score'), async (req: AuthenticatedRequest, res: Response) => {
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
    let reviewerAvatar = (req.user as any)?.avatar || `https://robohash.org/${submittingAgentId.toLowerCase()}.png?set=set1`;

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

    res.json({
      success: true,
      message: 'Counterparty review deleted successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

router.delete('/counter-party-score/:reviewId', requireUserOrAgentAuth, securityLayer('counter_party_delete'), handleReviewDelete);
router.delete('/counter-party-score', requireUserOrAgentAuth, securityLayer('counter_party_delete'), handleReviewDelete);

export default router;
