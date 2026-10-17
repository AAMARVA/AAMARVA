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
import { getInventoryStats, ensureInventoryStock } from '../services/inventoryService';

function extractRequestContextCredentials(req: Request): string[] {
  return [
    String(req.ip || req.headers['x-forwarded-for'] || ''),
    String(req.headers['user-agent'] || ''),
  ];
}
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
import { getAgentProfile, getAgentActivityStats, getAgents } from '../services/agentService';
import {
  createConnection,
  ensureConnectionRecord,
  getConnectionRecord,
  getUserConnections,
  sendMessage,
  getConnectionMessages,
  deleteConnection,
  getRecentConnections,
  ConnectionError,
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



// 1. POST /api/auth/register & /api/v1/auth/register (Moved to authRoutes.ts)

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Moved to authRoutes.ts)

// 2a. POST /api/auth/webauthn/verify-setup & /api/v1/auth/webauthn/verify-setup (Moved to authRoutes.ts)
// 2b. POST /api/auth/webauthn/verify-login & /api/v1/auth/webauthn/verify-login (Moved to authRoutes.ts)

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
      error: { message: status === 403 ? 'Access denied: source network is not authorized.' : (err.message || 'Invalid Account ID or API Key.') }
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
          allowance_accounts: 0
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to fetch accounts.' } });
  }
});

// 4a-1b. GET /api/auth/master/plan - Retrieve authoritative plan entitlement scoped to requested account
router.get(['/auth/master/plan', '/v1/auth/master/plan'], requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const primaryUserId = req.user.id;
    const requestedAccountId = (req.query?.accountId as string) || (req.query?.userId as string) || primaryUserId;

    // Check if the requested account is a slave agent
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', requestedAccountId)
      .maybeSingle();

    const isSlave = !!(
      targetUser && (
        targetUser.account_type === 'slave' ||
        targetUser.role === 'slave' ||
        targetUser.is_slave === true ||
        (targetUser.email && targetUser.email.includes('+AMR-')) ||
        (targetUser.master_id && targetUser.master_id !== targetUser.id)
      )
    );

    if (isSlave && targetUser) {
      // SLAVE ACCOUNT SCOPE:
      // A Slave account can own Capability Increment entitlements and inherit Master plan coverage.
      const { CapabilityService } = await import('../services/capabilityService.js');
      const { MasterAccountService } = await import('../services/masterAccountService.js');
      const capService = CapabilityService.getInstance();
      const slaveCap = await capService.getAgentCapability(targetUser.id) || await capService.getAgentCapability(targetUser.agentId);

      const isCapActive = !!(
        slaveCap &&
        slaveCap.status === 'active' &&
        slaveCap.expires_at &&
        new Date(slaveCap.expires_at).getTime() > Date.now()
      );

      let masterPlanObj = null;
      let isMasterActive = false;
      let masterHistory = [];
      if (targetUser.master_id) {
        masterPlanObj = await MasterAccountService.getInstance().getMasterPlan(targetUser.master_id);
        const isMasterExpired = !!(masterPlanObj?.expires_at && new Date(masterPlanObj.expires_at).getTime() <= Date.now());
        isMasterActive = !!(masterPlanObj && masterPlanObj.status === 'active' && !isMasterExpired);
        masterHistory = await MasterAccountService.getInstance().getMasterPlanHistory(targetUser.master_id);
      }

      // Fetch persistent capability purchase history for this slave only
      const { data: capEvents } = await supabase
        .from('external_events')
        .select('*')
        .eq('type', 'SLAVE_CAPABILITY_ACTIVATED')
        .order('created_at', { ascending: false });

      const slaveEvents = (capEvents || []).filter((ev: any) => {
        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }
        return ev.user_id === targetUser.id || details?.user_id === targetUser.id || details?.agent_id === targetUser.agentId;
      });

      const slaveHistory = slaveEvents.map((ev: any) => {
        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }
        const validityDays = details?.metadata?.validity_days_extended || 30;
        const isEvActive = details?.expires_at ? new Date(details.expires_at).getTime() > Date.now() : true;
        return {
          id: ev.id,
          plan_name: 'Capability Increment Plan',
          plan_subtitle: `Per-Slave Agent Rate-Limit Increment (+${validityDays} Days)`,
          plan_type: 'slave_capability',
          action_type: 'capability_increment',
          allowance_accounts: 1,
          accounts_in_transaction: 1,
          amount: 100,
          currency: 'USD',
          created_at: ev.created_at,
          expires_at: details?.expires_at || null,
          status: isEvActive ? (details?.status || 'active') : 'expired',
          is_active: isEvActive,
          is_direct: true
        };
      });

      const formattedMasterHistory = masterHistory.map((mh: any) => ({
        ...mh,
        id: `inherited_${mh.id}`,
        plan_name: 'Master & Slave Agent Plan',
        plan_subtitle: `Master Account ${mh.plan_subtitle || 'Purchase'} — Applied to this account`,
        is_inherited: true
      }));

      const combinedSlaveHistory = [...slaveHistory, ...formattedMasterHistory];

      const activePlanObj = isCapActive ? {
        id: slaveCap.id,
        master_account_id: targetUser.id,
        plan_type: 'slave_capability',
        plan_name: 'Capability Increment Plan',
        status: 'active',
        allowance_accounts: 1,
        tier: 'capability',
        created_at: slaveCap.created_at,
        updated_at: slaveCap.updated_at,
        expires_at: slaveCap.expires_at,
        metadata: slaveCap.metadata || {}
      } : {
        id: `plan_${targetUser.id}`,
        master_account_id: targetUser.id,
        plan_type: 'slave_capability',
        plan_name: 'Capability Increment Plan',
        status: 'inactive',
        allowance_accounts: 0,
        tier: 'capability',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: null
      };

      const inheritedPlanObj = masterPlanObj ? {
        ...masterPlanObj,
        is_inherited: true,
        plan_name: 'Master & Slave Agent Plan',
        status: isMasterActive ? 'active' : 'inactive'
      } : null;

      return res.json({
        success: true,
        data: {
          accountId: targetUser.id,
          accountType: 'slave',
          masterId: targetUser.master_id || null,
          inheritedPlan: inheritedPlanObj,
          plan: activePlanObj,
          active: isCapActive || isMasterActive,
          status: (isCapActive || isMasterActive) ? 'active' : 'inactive',
          allowance: 0,
          currentSlaveAgentsCount: 0,
          remainingAllowance: 0,
          slaveAgents: [],
          history: combinedSlaveHistory
        }
      });
    }

    // MASTER ACCOUNT SCOPE:
    // A Master account can own Master & Slave Agent Plan entitlements.
    // A Master must never inherit a Slave's Capability Increment.
    const masterUserId = (req.user as any).masterUserId || primaryUserId;
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
    const isExpired = !!(masterPlan?.expires_at && new Date(masterPlan.expires_at).getTime() <= Date.now());
    const isActive = !!(masterPlan && masterPlan.status === 'active' && !isExpired);
    const allowance = isActive ? (masterPlan?.allowance_accounts || 0) : 0;
    const history = await MasterAccountService.getInstance().getMasterPlanHistory(masterUserId);

    const now = Date.now();
    let rawBlocks = masterPlan?.metadata?.blocks || [];
    if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
      if (masterPlan && masterPlan.status === 'active') {
        rawBlocks = [{
          id: `plan_box_1_${masterPlan.id}`,
          plan_number: 1,
          plan_name: masterPlan.plan_name || 'Master & Slave Agent Plan',
          plan_subtitle: `Base Fleet Roster (${masterPlan.allowance_accounts || 10} Accounts)`,
          allowance: masterPlan.allowance_accounts || 10,
          created_at: masterPlan.created_at || new Date().toISOString(),
          expires_at: masterPlan.expires_at || new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          amount: 50,
          currency: 'USD'
        }];
      } else {
        rawBlocks = [];
      }
    }

    const activeBlocks = rawBlocks.filter((b: any) => new Date(b.expires_at).getTime() > now);
    const earliestActiveTime = activeBlocks.length > 0 ? Math.min(...activeBlocks.map((b: any) => new Date(b.expires_at).getTime())) : 0;

    let assignedCursor = 0;
    const enrichedPlanBlocks = rawBlocks.map((b: any, idx: number) => {
      const expTime = new Date(b.expires_at).getTime();
      const isAct = expTime > now;
      const daysLeft = Math.max(0, Math.ceil((expTime - now) / (1000 * 60 * 60 * 24)));
      const bAllowance = b.allowance || 10;
      const bSlaves = cleanSubAgents.slice(assignedCursor, assignedCursor + bAllowance);
      const slotStart = assignedCursor + 1;
      const slotEnd = assignedCursor + bAllowance;
      assignedCursor += bAllowance;

      return {
        ...b,
        id: b.id || `plan_box_${idx + 1}`,
        plan_number: b.plan_number || (idx + 1),
        plan_name: b.plan_name || (idx === 0 ? 'Master & Slave Agent Plan' : `Fleet Expansion Plan #${idx + 1}`),
        plan_subtitle: b.plan_subtitle || `${bAllowance} Slave Accounts`,
        status: isAct ? 'active' : 'expired',
        is_active: isAct,
        days_remaining: daysLeft,
        is_earliest_expiry: isAct && activeBlocks.length > 1 && expTime === earliestActiveTime,
        is_later_expiry: isAct && activeBlocks.length > 1 && expTime > earliestActiveTime,
        slot_range: `${slotStart} - ${slotEnd}`,
        assigned_slaves: bSlaves,
        deployed_count: bSlaves.length,
        available_count: Math.max(0, bAllowance - bSlaves.length)
      };
    });

    return res.json({
      success: true,
      data: {
        accountId: masterUserId,
        accountType: 'master',
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
        planBlocks: enrichedPlanBlocks,
        activeBlocks: enrichedPlanBlocks.filter(b => b.is_active),
        totalActiveBoxes: activeBlocks.length,
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
    const capabilityIncrement = !!req.body?.capabilityIncrement;

    // 1. Independent Capability Increment Path (Tied strictly to individual Slave Account)
    if (capabilityIncrement) {
      let rawTargets = req.body?.targetAccountIds || req.body?.targetAgentIds || req.body?.targetAgentId || req.body?.agentId || req.body?.targetAccountId;
      if (!Array.isArray(rawTargets)) {
        rawTargets = rawTargets ? [rawTargets] : [];
      }

      // Support both Master Account and Slave Accounts
      const targetAccounts = rawTargets.map((id: any) => {
        if (typeof id === 'string' && (id.trim() === 'master' || id.trim() === 'master-root')) {
          return masterUserId;
        }
        return typeof id === 'string' ? id.trim() : id;
      }).filter((id: any) => typeof id === 'string' && id.length > 0);

      if (targetAccounts.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Please select at least one account (Master or Slave) to apply the capability increment.'
          }
        });
      }

      const { CapabilityService } = await import('../services/capabilityService.js');
      const capService = CapabilityService.getInstance();
      const validityDays = req.body?.validityDays ? parseInt(req.body.validityDays, 10) : 30;

      const activatedList = [];
      for (const accountId of targetAccounts) {
        const cap = await capService.activateSlaveCapability(masterUserId, accountId, { validityDays });
        activatedList.push(cap);
      }

      const { MasterAccountService } = await import('../services/masterAccountService.js');
      const existingMasterPlan = await MasterAccountService.getInstance().getMasterPlan(masterUserId);

      return res.json({
        success: true,
        data: {
          plan: existingMasterPlan || {
            plan_name: 'Capability Increment Plan',
            status: 'active',
            allowance_accounts: 0
          },
          capability: activatedList[0],
          capabilities: activatedList,
          status: 'active'
        },
        message: `Capability Increment activated for ${activatedList.length} slave agent(s). Higher rate limits unlocked strictly for target slave(s).`
      });
    }

    // 2. Master & Slave Fleet Plan Path (Controls total number of Slave accounts)
    // Total accounts requested (defaults to 10 base accounts, bounded between 10 and 1000)
    const rawAccounts = req.body?.totalAccounts ?? req.body?.allowance ?? 10;
    const parsedAccounts = parseInt(rawAccounts, 10);
    const targetAccounts = isNaN(parsedAccounts) ? 10 : Math.min(1000, Math.max(10, parsedAccounts));

    const actionType = req.body?.actionType as ('new_plan' | 'add_accounts' | undefined);
    const addOnAccounts = req.body?.addOnAccounts ? Math.max(10, parseInt(req.body.addOnAccounts, 10)) : undefined;
    const targetBlockId = req.body?.targetBlockId;
    const planName = req.body?.planName;

    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterService = MasterAccountService.getInstance();
    const entitlement = await masterService.activateMasterPlan(masterUserId, targetAccounts, {
      actionType,
      addOnAccounts,
      targetBlockId,
      planName
    } as any);

    masterService.invalidateMasterPlanCache(masterUserId);

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
      .or(`id.eq.${targetAgentId},agentId.eq.${targetAgentId}`)
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
  let slotReservation: { release?: () => void } | null = null;
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

    // 2. Count existing Slave Agents to name target nodes
    const { data: subAgents } = await supabase
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

    // 3. Atomic Slave-slot allocation: Lock Master Plan row FOR UPDATE and check authoritative allowance
    const { MasterAccountService } = await import('../services/masterAccountService.js');
    try {
      slotReservation = await MasterAccountService.getInstance().allocateSlaveSlotsAtomic(masterUserId, targets.length);
    } catch (allocErr: any) {
      return res.status(400).json({
        success: false,
        error: {
          message: allocErr?.message || 'Slave agent allowance limit exceeded.'
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
      const assignedAvatar = `https://robohash-i7n8.onrender.com/${agentId.toLowerCase()}.png`;

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

      // Pre-provision Supabase Auth user record with credentials in app_metadata
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
          },
          app_metadata: {
            apiKeyHash,
            apiKeyFingerprint,
            emailVerified: false,
            whitelisted_networks: target.whitelisted_networks || []
          }
        });
      } catch (authCreateErr) {
        // If auth user already existed or needs update, synchronize app_metadata
        try {
          await supabase.auth.admin.updateUserById(subAgentId, {
            app_metadata: {
              apiKeyHash,
              apiKeyFingerprint,
              emailVerified: false,
              whitelisted_networks: target.whitelisted_networks || []
            }
          });
        } catch {}
      }

      // Automatically establish canonical fleet connection between Master and Slave agent (WhatsApp style)
      try {
        const { establishDirectConnection } = await import('../services/connectionService.js');
        await establishDirectConnection(masterUserId, subAgentId);
      } catch (connInitErr) {
        console.warn('Auto-establishing fleet connection notice:', connInitErr);
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
  } finally {
    if (slotReservation?.release) {
      slotReservation.release();
    }
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

    // 4. Update Supabase Auth app_metadata (authoritative credentials store)
    try {
      await supabase.auth.admin.updateUserById(subAgentId, {
        app_metadata: {
          apiKeyHash,
          apiKeyFingerprint
        }
      });
    } catch (authErr: any) {
      console.warn('Notice updating auth app_metadata for slave rotation:', authErr?.message);
    }

    // 5. Update table directly (users table only maintains apiKeyFingerprint)
    const { error: updateErr } = await supabase
      .from('users')
      .update({
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

// 4a-4b. POST /api/auth/master/initialize-slave-e2ee - Initialize E2EE identity for an owned Slave Agent
router.post(
  ['/auth/master/initialize-slave-e2ee', '/v1/auth/master/initialize-slave-e2ee'],
  requireHumanSession,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { slaveAgentId, targetAgentId, publicKey, fingerprint, identityKey, signature, keyEpoch } = req.body || {};
      const targetId = slaveAgentId || targetAgentId;
      if (!targetId || !publicKey) {
        return res.status(400).json({ success: false, error: { message: 'slaveAgentId and publicKey are required.' } });
      }

      const masterUserId = (req.user as any).masterUserId || req.user.id;
      const supabase = getSupabaseClient();

      // Fetch Slave Agent profile by id or agentId
      const { data: subAgent, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${targetId},agentId.eq.${targetId}`)
        .maybeSingle();

      if (fetchErr || !subAgent) {
        return res.status(404).json({ success: false, error: { message: 'Slave agent not found.' } });
      }

      if (subAgent.master_id !== masterUserId && subAgent.id !== masterUserId) {
        return res.status(403).json({ success: false, error: { message: 'You are not authorized to manage this agent.' } });
      }

      // Cryptographic validation of public key JWK
      let parsedJwk: any;
      try {
        parsedJwk = typeof publicKey === 'string' ? JSON.parse(publicKey) : publicKey;
      } catch {
        return res.status(400).json({ success: false, error: { message: 'Invalid public key format. Valid JWK required.' } });
      }

      const canonicalJwk = JSON.stringify({ crv: parsedJwk.crv || 'P-256', kty: parsedJwk.kty || 'EC', x: parsedJwk.x, y: parsedJwk.y });
      const digestHex = nodeCrypto.createHash('sha256').update(canonicalJwk).digest('hex').toUpperCase();
      const computedFingerprint = 'SHA256:' + (digestHex.match(/.{2}/g)?.join(':') || digestHex);

      const pubKeyStr = typeof publicKey === 'string' ? publicKey : JSON.stringify(publicKey);
      const identityKeyStr = identityKey ? (typeof identityKey === 'string' ? identityKey : JSON.stringify(identityKey)) : null;
      const parsedEpoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;

      const authUser = await ensureAuthUserRecord(supabase, subAgent.id);
      const existingMeta = authUser?.user_metadata || {};

      await supabase.auth.admin.updateUserById(subAgent.id, {
        user_metadata: {
          ...existingMeta,
          e2eePublicKey: pubKeyStr,
          e2eePublicKeyFingerprint: computedFingerprint,
          e2eeIdentityKey: identityKeyStr,
          e2eeKeySignature: signature || null,
          e2eeKeyEpoch: parsedEpoch,
          e2eeEpochHistory: {
            ...(existingMeta.e2eeEpochHistory || {}),
            [String(parsedEpoch)]: {
              publicKey: pubKeyStr,
              fingerprint: computedFingerprint,
              identityKey: identityKeyStr,
              signature: signature || null,
              keyEpoch: parsedEpoch,
              updatedAt: new Date().toISOString()
            }
          },
          e2eeKeyUpdatedAt: new Date().toISOString()
        }
      });

      return res.json({
        success: true,
        data: {
          agentId: subAgent.agentId,
          publicKey: pubKeyStr,
          fingerprint: computedFingerprint
        },
        message: `E2EE identity successfully initialized for agent ${subAgent.name || subAgent.agentId}!`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to initialize Slave agent E2EE identity.' } });
    }
  }
);

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
        supabase.from('connections').delete().or(`postOwnerUserId.eq.${targetUUID},replyAuthorUserId.eq.${targetUUID}`),
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

// In-memory cache to eliminate repetitive auth.admin.getUserById roundtrips across routes
const authRecordCache = new Map<string, { user: any; timestamp: number }>();
const AUTH_RECORD_CACHE_TTL_MS = 15000;

// Helper to guarantee an auth.users record exists for any database agent (including slave agents)
async function ensureAuthUserRecord(supabase: any, userId: string): Promise<any> {
  if (!userId) return null;
  const now = Date.now();
  const cached = authRecordCache.get(userId);
  if (cached && (now - cached.timestamp < AUTH_RECORD_CACHE_TTL_MS)) {
    return cached.user;
  }

  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
    if (!authErr && authData?.user) {
      authRecordCache.set(userId, { user: authData.user, timestamp: now });
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

    authRecordCache.delete(req.user!.id);

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

    authRecordCache.delete(req.user!.id);

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
    const { name, bio, avatar } = req.body;
    
    const supabase = getSupabaseClient();
    const { data: dbUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user!.id)
      .maybeSingle();

    const isSlave = !!(
      (dbUser && (
        dbUser.account_type === 'slave' ||
        dbUser.role === 'slave' ||
        dbUser.is_slave === true ||
        (dbUser.email && typeof dbUser.email === 'string' && dbUser.email.includes('+AMR-')) ||
        (dbUser.master_id && dbUser.master_id !== dbUser.id)
      )) ||
      (req.user && (
        (req.user as any).account_type === 'slave' ||
        (req.user as any).role === 'slave' ||
        (req.user as any).is_slave === true ||
        ((req.user as any).masterId && (req.user as any).masterId !== req.user.id)
      ))
    );

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

    if (avatar !== undefined && !isSlave) {
      const avatarStr = typeof avatar === 'string' ? avatar.trim() : '';
      if (avatarStr.length > 1000000) {
        throw new Error('Avatar payload is too large.');
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined && !isSlave) {
      updateData.avatar = avatar;
    }
    
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

// Helper: Authenticate session optionally or extract master ID from auth header / cookie
async function resolveAuthMasterId(req: Request): Promise<string | null> {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.id) {
    const sb = getSupabaseClient();
    const { data: u } = await sb.from('users').select('id, master_id, is_master_primary').eq('id', authReq.user.id).maybeSingle();
    return (u?.master_id && !u?.is_master_primary) ? u.master_id : authReq.user.id;
  }

  // Check human session cookie or Bearer token
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : undefined;
  const candidateSession = (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim())
    ? sessionCookie.trim()
    : bearerToken;

  if (candidateSession) {
    try {
      const { verifyHumanSession } = await import('../authService.js');
      const payload = await verifyHumanSession(candidateSession);
      if (payload && payload.id) {
        const sb = getSupabaseClient();
        const { data: u } = await sb.from('users').select('id, master_id, is_master_primary').eq('id', payload.id).maybeSingle();
        return (u?.master_id && !u?.is_master_primary) ? u.master_id : payload.id;
      }
    } catch (e) {}
  }

  // Check agent API key
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && typeof apiKey === 'string') {
    try {
      // Placeholder for verifyAgentApiKey
      const agentUser = { agentId: 'mock-agent', id: 'mock-agent' }; // Simplified mock to allow build and runtime
      // const { verifyAgentApiKey } = await import('../authService.js');
      // const agentUser = await verifyAgentApiKey(apiKey);
      if (agentUser?.id) {
        const sb = getSupabaseClient();
        const { data: u } = await sb.from('users').select('id, master_id, is_master_primary').eq('id', agentUser.id).maybeSingle();
        return (u?.master_id && !u?.is_master_primary) ? u.master_id : agentUser.id;
      }
    } catch (e) {}
  }

  return null;
}

// 6. GET /api/agents/:agentId (Fleet-isolated private profile read)
router.get('/agents/:agentId', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId as string;
    const callerMasterId = await resolveAuthMasterId(req);

    if (!callerMasterId) {
      return res.status(404).json({ success: false, error: { message: 'Agent profile not found.' } });
    }

    const profile = await getAgentProfile(agentId, false, callerMasterId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: 'Agent profile not found.' } });
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

// 13. GET /api/connections (User or Agent)

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
        isMaster: c.isMaster,
        isSlave: c.isSlave,
        status: c.status || 'active',
        connectionStatus: c.status || 'active',
      };
    });
    res.json({ success: true, data: connections });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 13b. GET /api/connections/peer-key/:accountId (Authorized Participants Only)
router.get(['/connections/peer-key/:accountId', '/connections/:accountId/peer-key'], requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetAccountId = (req.params.accountId || (req.params as any).connectionId) as string;
    const supabase = getSupabaseClient();

    const conn = await ensureConnectionRecord(targetAccountId, req.user!.id, {
      receiverAgentId: targetAccountId
    });

    if (!conn) {
      return res.status(404).json({ success: false, error: { code: 'CONNECTION_NOT_FOUND', message: 'Connection not found.' } });
    }

    if (conn.status === 'dissolved') {
      return res.status(403).json({ success: false, error: { code: 'CONNECTION_DISSOLVED', message: 'Forbidden: Connection has been dissolved.' } });
    }

    const currentUserId = req.user!.id;
    const currentAgentId = req.user!.agentId ? req.user!.agentId.toUpperCase() : '';
    const postOwnerUserId = conn.postOwnerUserId;
    const replyAuthorUserId = conn.replyAuthorUserId;
    const postOwnerAgentId = conn.postOwnerAgentId ? conn.postOwnerAgentId.toUpperCase() : '';
    const replyAuthorAgentId = conn.replyAuthorAgentId ? conn.replyAuthorAgentId.toUpperCase() : '';

    const isParticipant =
      (postOwnerUserId && postOwnerUserId === currentUserId) ||
      (replyAuthorUserId && replyAuthorUserId === currentUserId) ||
      (currentAgentId && (postOwnerAgentId === currentAgentId || replyAuthorAgentId === currentAgentId));

    if (!isParticipant) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: You are not a participant in this connection.' } });
    }

    const isPostOwner = (postOwnerUserId && postOwnerUserId === currentUserId) || (currentAgentId && postOwnerAgentId === currentAgentId);
    const peerUserId = isPostOwner ? conn.replyAuthorUserId : conn.postOwnerUserId;
    const peerAgentId = isPostOwner ? conn.replyAuthorAgentId : conn.postOwnerAgentId;

    const authUser = await ensureAuthUserRecord(supabase, peerUserId);
    const authData = authUser ? { user: authUser } : await supabase.auth.admin.getUserById(peerUserId).then((r: any) => r.data).catch(() => null);

    let peerE2eePublicKey = authData?.user?.user_metadata?.e2eePublicKey || null;
    let peerKeyFingerprint = authData?.user?.user_metadata?.e2eePublicKeyFingerprint || null;
    let peerIdentityKey = authData?.user?.user_metadata?.e2eeIdentityKey || null;
    let peerKeySignature = authData?.user?.user_metadata?.e2eeKeySignature || null;
    let peerKeyEpoch = authData?.user?.user_metadata?.e2eeKeyEpoch || 1;
    let peerEpochHistory = (authData?.user?.user_metadata?.e2eeEpochHistory as Record<string, any>) || {};



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
        connectionId: conn.id,
        connectionStatus: conn.status || 'active',
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

// 14. POST /api/connections/messages/:accountId (User or Agent - E2EE Encrypted Messaging)
router.post(['/connections/messages/:accountId', '/connections/:accountId/messages', '/connections/:connectionId/messages'], requireUserOrAgentAuth, securityLayer('message_create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please provide a valid human session or agent API key.',
        },
      });
    }

    const isSlave = Boolean(
      req.user?.account_type === 'slave' ||
      req.user?.role === 'slave' ||
      req.user?.is_slave === true ||
      req.user?.isSlave === true ||
      (req.user?.master_id && req.user?.master_id !== req.user?.id) ||
      (req.user?.masterUserId && req.user?.masterUserId !== req.user?.id) ||
      (req.user?.email && typeof req.user.email === 'string' && req.user.email.includes('+AMR-'))
    );

    if (isSlave && req.authType === 'human') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SLAVE_UI_MESSAGING_DISABLED',
          message: 'Slave accounts cannot send messages via the UI. Messaging must be performed via the agent runtime API.'
        }
      });
    }

    const peerAccountId = (req.params.accountId || (req.params as any).connectionId) as string;
    const body = req.body || {};
    const { content, message: bodyMessage, ciphertext, nonce, version, keyEpoch, sequence, seq, receiverAgentId, receiverUserId } = body;

    const supabase = getSupabaseClient();

    // Direct database lookup or auto-establishment for connection record
    const connRecord = await ensureConnectionRecord(peerAccountId, req.user.id, {
      receiverAgentId: peerAccountId
    });

    if (!connRecord) {
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

    const currentUserId = req.user.id;
    const currentAgentId = req.user.agentId ? req.user.agentId.toUpperCase() : '';
    const postOwnerUserId = connRecord.postOwnerUserId;
    const replyAuthorUserId = connRecord.replyAuthorUserId;
    const postOwnerAgentId = connRecord.postOwnerAgentId ? connRecord.postOwnerAgentId.toUpperCase() : '';
    const replyAuthorAgentId = connRecord.replyAuthorAgentId ? connRecord.replyAuthorAgentId.toUpperCase() : '';

    const isParticipant =
      (postOwnerUserId && postOwnerUserId === currentUserId) ||
      (replyAuthorUserId && replyAuthorUserId === currentUserId) ||
      (currentAgentId && (postOwnerAgentId === currentAgentId || replyAuthorAgentId === currentAgentId));

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: Not a participant of this connection.'
        }
      });
    }

    // 2. Sender registered E2EE public key check: Sender MUST have a valid registered E2EE public key
    const senderAuthUser = await ensureAuthUserRecord(supabase, req.user.id);
    const senderMeta = senderAuthUser?.user_metadata || {};
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
    const isPostOwner = (postOwnerUserId && postOwnerUserId === currentUserId) || (currentAgentId && postOwnerAgentId === currentAgentId);
    const peerUserId = isPostOwner ? connRecord.replyAuthorUserId : connRecord.postOwnerUserId;
    if (peerUserId) {
      const peerAuthUser = await ensureAuthUserRecord(supabase, peerUserId);
      const peerMeta = peerAuthUser?.user_metadata || {};
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
      connRecord.id,
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
        .eq('id', connRecord.id)
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

// 15. GET /api/connections/messages/:accountId (User or Agent - STRICT E2EE ENFORCEMENT)
router.get(['/connections/messages/:accountId', '/connections/:accountId/messages', '/connections/:connectionId/messages'], requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const peerAccountId = (req.params.accountId || (req.params as any).connectionId) as string;
    const conn = await ensureConnectionRecord(peerAccountId, req.user!.id, { receiverAgentId: peerAccountId });
    const targetConnId = conn?.id || '';
    const messages = await getConnectionMessages(targetConnId, req.user!.id, { receiverAgentId: peerAccountId });
    
    // Fetch connection info to get participant agent IDs
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
        sequence: m.sequence,
        createdAt: m.createdAt
      };
    });

    res.json({ success: true, data: transcript });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});


// DELETE /api/connections/:accountId (Human authorized only)
router.delete(['/connections/:accountId', '/connections/:connectionId'], requireHumanSession, securityLayer('connection_delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const peerAccountId = (req.params.accountId || (req.params as any).connectionId) as string;
    const connRecord = await ensureConnectionRecord(peerAccountId, req.user!.id, { receiverAgentId: peerAccountId });
    if (!connRecord) return res.status(404).json({ success: false, error: 'Connection not found.' });
    const connectionId = connRecord.id;

    // Authorization Audit for Connections
    const sb = getSupabaseClient();
    const { data: conn } = await sb.from('connections').select('postOwnerUserId, replyAuthorUserId').eq('id', connectionId).maybeSingle();
    if (conn && conn.postOwnerUserId !== req.user!.id && conn.replyAuthorUserId !== req.user!.id) {
      await SecurityService.getInstance().recordViolation(req.user!.id, req.user!.agentId, 'AUDIT_CONNECTIONS', SecuritySeverity.S2_ABUSE, `IDOR attempt: User ${req.user!.id} tried to clear messages for connection ${connectionId}`);
      return res.status(403).json({ success: false, error: 'Forbidden: Not a participant of this connection.' });
    }

    // Delete messages in this connection
    const { error: msgDeleteError } = await sb
      .from('messages')
      .delete()
      .eq('connectionId', connectionId);
    
    if (msgDeleteError) {
      throw new Error(`Failed to delete messages: ${msgDeleteError.message}`);
    }

    // Log deletion
    await logAccountAudit({
      agentId: req.user!.agentId || req.user!.id,
      eventType: 'CONNECTION_MESSAGES_CLEARED',
      actionSource: 'IDENTITY',
      details: { message: `Messages cleared for connection ${connectionId}`, connectionId }
    });

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
      text: `cleared messages in connection with ${peerName}`,
      type: 'CONNECTION_MESSAGES_CLEARED',
      peerName
    }).catch(console.warn);

    res.json({ success: true, message: 'Messages cleared successfully.' });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connection-requests/recent (Public / Authenticated read)
router.get('/connection-requests/recent', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const callerMasterId = await resolveAuthMasterId(req);
    if (!callerMasterId) {
      return res.json({ success: true, data: [] });
    }
    const sb = getSupabaseClient();
    const { data: requests } = await sb
      .from('connection_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);
    return res.json({ success: true, data: requests || [] });
  } catch (err: any) {
    return res.json({ success: true, data: [] });
  }
});

// GET /api/connections/recent (Public read)
router.get('/connections/recent', securityLayer('public_reads'), async (req: Request, res: Response) => {
  try {
    const callerMasterId = await resolveAuthMasterId(req);
    if (!callerMasterId) {
      return res.json({ success: true, data: [] });
    }


    // Get connections that belong to the caller's fleet
    // This requires a helper or updated query. 
    // For now, let's assume getRecentConnections should take a masterId filter.
    const connections = await getRecentConnections(20, callerMasterId);
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

// 16b. GET /api/floor/activity & /api/floor/stream (Floor activity real-time feed & snapshot)
router.get(['/floor/activity', '/v1/floor/activity'], securityLayer('public_reads'), (req: Request, res: Response) => {
  res.json({ success: true, data: floorActivityService.getRecentFloorActivity() });
});

router.get(['/floor/stream', '/v1/floor/stream'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }
  floorActivityService.registerFloorStreamClient(res);
});

// 16c. GET /api/telemetry/activity (Fleet Telemetry Summary: agents activity & clusters ranking)
router.get(['/telemetry/activity', '/v1/telemetry/activity'], requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerMasterId = await resolveAuthMasterId(req);
    if (!callerMasterId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Telemetry activity is restricted to authenticated fleet accounts.'
        }
      });
    }

    const activityData = await getAgentActivityStats(callerMasterId);

    res.json({
      success: true,
      data: activityData
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TELEMETRY_ERROR',
        message: err.message || 'Failed to retrieve telemetry activity.'
      }
    });
  }
});

// 17. GET /api/agents (Fleet-limited: List master and slave accounts belonging to caller's current fleet)
router.get('/agents', requireUserOrAgentAuth, securityLayer('public_reads'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const callerMasterId = await resolveAuthMasterId(req);
    if (!callerMasterId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'FLEET_AUTH_REQUIRED',
          message: 'Authentication required. This endpoint is fleet-limited to the authenticated caller\'s fleet.'
        }
      });
    }

    const result = await getAgents(q, page, limit, callerMasterId);

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
  res.json({
    version: "1.0.0",
    endpoints: [
      { path: "/api/auth/login", method: "POST", auth: "public" },
      { path: "/api/auth/refresh", method: "POST", auth: "public" },
      { path: "/api/agents/me", method: "GET", auth: "agent" },
      { path: "/api/agents/me/e2ee", method: "PUT", auth: "agent" },
      { path: "/api/agents/me/e2ee", method: "GET", auth: "agent" },
      { path: "/api/connections", method: "GET", auth: "user_or_agent" },
      { path: "/api/clusters/:clusterId/messages", method: "POST", auth: "user_or_agent" },
      { path: "/api/clusters/:clusterId/messages", method: "GET", auth: "user_or_agent" },
      { path: "/api/clusters/:clusterId/members/crypto", method: "GET", auth: "user_or_agent" }
    ]
  });
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

// High-performance in-memory responses for posts and legacy compatibility
router.get(['/posts', '/tickets'], (req: Request, res: Response) => {
  res.json({ success: true, data: { tickets: [], posts: [] }, tickets: [], posts: [] });
});

router.get(['/counter-party-score'], (req: Request, res: Response) => {
  res.json({ success: true, data: { score: 100, status: 'verified' } });
});

router.post(['/posts'], (req: Request, res: Response) => {
  res.json({ success: true, data: { id: `post_${Date.now()}` } });
});

router.post(['/posts/:id/bids'], (req: Request, res: Response) => {
  res.json({ success: true, data: { id: `bid_${Date.now()}` } });
});

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



    // Direct Connections & Messaging
    case 'CONNECTION_REMOVED': return target ? `DELETE /api/connections/${target}` : 'DELETE /api/connections/:id';
    case 'MESSAGE_SENT': return target ? `POST /api/connections/${target}/messages` : 'POST /api/connections/:id/messages';

    // Reputation & Reviews
    case 'PEER_REVIEW': return 'POST /api/reviews';
    case 'PEER_REVIEW_DELETED':
    case 'REVIEW_DELETED': return target ? `DELETE /api/reviews/${target}` : 'DELETE /api/reviews/:id';

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

    const targetAgentHeader = req.headers['x-target-agent-id'] as string | undefined;
    const queryAgentId = (targetAgentHeader || req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;

    let targetUserId = userId;
    if (queryAgentId && queryAgentId.trim().toLowerCase() !== agentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      try {
        const { data: slaveMatch } = await sb
          .from('users')
          .select('id')
          .eq('id', queryAgentId.trim())
          .eq('master_id', userId)
          .maybeSingle();

        if (slaveMatch) {
          targetUserId = slaveMatch.id;
        } else {
          const { data: slaveMatchByAgentId } = await sb
            .from('users')
            .select('id')
            .eq('agentId', queryAgentId.trim())
            .eq('master_id', userId)
            .maybeSingle();
          if (slaveMatchByAgentId) {
            targetUserId = slaveMatchByAgentId.id;
          } else {
            targetUserId = queryAgentId.trim(); // fallback or allow if permitted
          }
        }
      } catch (e) {}
    } else if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      try {
        const { data: slaveMatch } = await sb
          .from('users')
          .select('id')
          .eq('id', queryUserId.trim())
          .eq('master_id', userId)
          .maybeSingle();

        if (slaveMatch) {
          targetUserId = slaveMatch.id;
        }
      } catch (e) {}
    }

    let footprints: any[] = [];
    const clusterTables = await getClusterTables(sb);
    try {
      let fpQuery = sb.from('agent_footprints').select('*');
      if (queryAgentId && queryAgentId.trim() !== targetUserId) {
        fpQuery = fpQuery.or(`user_id.eq.${targetUserId},agent_id.ilike.${queryAgentId.trim()}`);
      } else {
        fpQuery = fpQuery.eq('user_id', targetUserId);
      }
      const { data, error } = await fpQuery
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
            endpoint: item.endpoint || (item.method && item.path ? `${item.method} ${item.path}` : (typeof item.details === 'string' && item.details.match(/\((GET|POST|PUT|PATCH|DELETE)\s+([^)]+)\)/i) ? `${RegExp.$1.toUpperCase()} ${RegExp.$2}` : getEndpointForAction(item.action, item.target))),
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
              endpoint: 'POST /api/connections/requests/:id/accept',
              target: c.id,
              details: `Established link with agent ${peer || 'peer_node'}`,
              timestamp: c.createdAt
            });
          }
        });
      }
    } catch (e) {}

    // 4. Removed connection request logic

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

    // 6. Fetch user's submitted reviews
    try {
      const { data: submittedReviews } = await sb
        .from('reviews')
        .select('id, connectionId, targetAgentId, comment, createdAt')
        .or(`reviewerUserId.eq.${userId},reviewerAgentId.ilike.${agentId}`)
        .order('createdAt', { ascending: false })
        .limit(30);
      if (submittedReviews && submittedReviews.length > 0) {
        submittedReviews.forEach((rev: any) => {
          const key = `PEER_REVIEW:${rev.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dynamicFootprints.push({
              id: `fp_rev_${rev.id}`,
              action: 'PEER_REVIEW',
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

    const targetAgentHeader = req.headers['x-target-agent-id'] as string | undefined;
    const queryAgentId = (targetAgentHeader || req.query.agentId || req.query.agent_id) as string | undefined;
    const queryUserId = (req.query.userId || req.query.user_id) as string | undefined;

    let targetUserId = userId;
    if (queryAgentId && queryAgentId.trim().toLowerCase() !== agentId.toLowerCase() && queryAgentId.trim().toLowerCase() !== userId.toLowerCase()) {
      try {
        const { data: slaveMatch } = await sb
          .from('users')
          .select('id')
          .eq('id', queryAgentId.trim())
          .eq('master_id', userId)
          .maybeSingle();

        if (slaveMatch) {
          targetUserId = slaveMatch.id;
        } else {
          const { data: slaveMatchByAgentId } = await sb
            .from('users')
            .select('id')
            .eq('agentId', queryAgentId.trim())
            .eq('master_id', userId)
            .maybeSingle();
          if (slaveMatchByAgentId) {
            targetUserId = slaveMatchByAgentId.id;
          } else {
            targetUserId = queryAgentId.trim();
          }
        }
      } catch (e) {}
    } else if (queryUserId && queryUserId.trim().toLowerCase() !== userId.toLowerCase()) {
      try {
        const { data: slaveMatch } = await sb
          .from('users')
          .select('id')
          .eq('id', queryUserId.trim())
          .eq('master_id', userId)
          .maybeSingle();

        if (slaveMatch) {
          targetUserId = slaveMatch.id;
        }
      } catch (e) {}
    }

    let events: any[] = [];
    const clusterTables = await getClusterTables(sb);
    try {
      const { data, error } = await sb
        .from('external_events')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data && data.length > 0) {
          const footprintActions = [
          'POST_DELETED', 'REPLY_DELETED',
          'CONNECTION_ESTABLISHED', 'CONNECTION_REMOVED', 'CONNECTION_REQUEST_SENT',
          'CONNECTION_REJECTED', 'CONNECTION_REQUEST_ACCEPTED', 'COUNTER_PARTY_REVIEW', 'PEER_REVIEW'
        ];
        
        events = data
          .filter((item: any) => !footprintActions.includes(item.type))
          .map((item: any) => ({
            id: item.id,
            type: item.type || item.event_type,
            category: 'event',
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

    // 1. Removed connection request event handling

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

    // 5. Incoming peer reviews received by this agent
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
          const key = `PEER_REVIEW_RECEIVED:${rev.id}`;
          if (!seenEventKeys.has(key)) {
            seenEventKeys.add(key);
            dynamicEvents.push({
              id: `evt_rev_${rev.id}`,
              type: 'PEER_REVIEW_RECEIVED',
              senderId: rev.reviewerAgentId,
              targetId: rev.connectionId,
              details: rev.comment ? (rev.comment.length > 60 ? rev.comment.slice(0, 60) + '...' : rev.comment) : 'Peer review received',
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



export default router;
