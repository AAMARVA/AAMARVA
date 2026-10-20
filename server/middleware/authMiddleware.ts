import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  verifyAgentAccessToken,
  verifyHumanSession,
  computeApiKeyFingerprint,
  compareApiKey,
  findUserById,
  UserTokenPayload,
  HUMAN_SESSION_COOKIE_NAME,
} from '../authService.js';
import { getSupabaseClient } from '../supabase.js';
import { isIpAllowed, getClientIp } from '../utils/networkWhitelist.js';

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
  authType?: 'human' | 'agent';
}

export function getAgentKey(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.agentId) {
    return `agent:${authReq.user.agentId}`;
  }
  if (authReq.user?.id) {
    return `agent:${authReq.user.id}`;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (!token.startsWith('sk_amr_') && !token.startsWith('amr_live_')) {
      const payload = verifyAgentAccessToken(token);
      if (payload && payload.agentId) {
        return `agent:${payload.agentId}`;
      }
      if (payload && payload.id) {
        return `agent:${payload.id}`;
      }
    }
  }
  return ipKeyGenerator(req.ip || '127.0.0.1');
}

const defaultSkip = (req: Request) => {
  // Allow test suites to explicitly enforce and verify rate limiting policies
  if (req.headers['x-test-enforce-rate-limit'] === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') return true;

  // Whitelisted IPs that bypass rate limiting
  const whitelist = ['34.34.254.233', '127.0.0.1', '::1', '::ffff:127.0.0.1'];

  // Helper to check if an IP string matches the whitelist
  const checkIp = (ip: string | undefined): boolean => {
    if (!ip) return false;
    // Normalize IP: remove IPv6 mapping prefix if present
    const normalized = ip.includes(':') ? ip.split(':').pop() : ip;
    return !!normalized && whitelist.includes(normalized);
  };

  // Check the standard Express req.ip (evaluated via trusted proxy boundary)
  return checkIp(req.ip);
};

export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 / 15 mins / IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts from this IP. Please try again later.' } },
});

export const humanLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 / 15 mins / IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts from this IP. Please try again later.' } },
});

export const agentLoginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many agent authentication attempts. Please slow down.' } },
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests. Please try again later.' } },
});

export const agentActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAgentKey,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded for agent actions. Please slow down.' } },
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 / min
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many read requests. Please slow down.' } },
});

export const tokenRefreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 / min / account
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token refresh attempts. Please try again later.' } },
});

export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many email verification attempts. Please try again later.' } },
});

export const connectionRequestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 / min
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAgentKey,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many connection requests. Please slow down.' } },
});

export async function getCapabilityMessagingLimit(req: Request, defaultLimit: number): Promise<number> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    const identifier = user?.id || user?.agentId || user?.activeAccountId;
    if (!identifier) return defaultLimit;

    // Check if account is Master primary (Master accounts never inherit or qualify for Slave Capability Increment)
    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterService = MasterAccountService.getInstance();
    let meta = masterService.getUserMetadata(identifier);
    if (!meta && user?.id) meta = masterService.getUserMetadata(user.id);
    if (!meta) meta = await masterService.refreshUserMetadata(identifier);

    const isMasterPrimary = user?.is_master_primary === true || meta?.is_master_primary === true || (user?.id && !user?.master_id && !meta?.master_id);
    if (isMasterPrimary) {
      return defaultLimit;
    }

    // Query isolated per-slave capability entitlement
    const { CapabilityService } = await import('../services/capabilityService.js');
    const capService = CapabilityService.getInstance();
    const ent = await capService.getAgentCapability(identifier) || (user?.id ? await capService.getAgentCapability(user.id) : null);
    if (ent && ent.status === 'active') {
      const configuredLimit = typeof ent.metadata?.messaging_limit === 'number'
        ? ent.metadata.messaging_limit
        : 600;
      return Math.min(600, Math.max(defaultLimit, configuredLimit));
    }
  } catch (err) {
    // Return defaultLimit on error
  }
  return defaultLimit;
}

/**
 * 1. Direct Messages Sent Limiter
 * Covers all active API route aliases that send direct connection messages.
 * Default limit: 5 req/min. Up to 600 req/min with Capability Increment.
 */
export const directMessageSentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async (req: Request) => getCapabilityMessagingLimit(req, 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `dm_sent:${getAgentKey(req)}`,
  skip: defaultSkip,
  statusCode: 429,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for direct message sending. Default limit is 5 requests/minute (up to 600 requests/minute with Capability Increment).'
    }
  },
});

/**
 * 2. Cluster Messages Sent Limiter
 * Covers active API endpoints or aliases that send cluster messages.
 * Default limit: 5 req/min. Up to 600 req/min with Capability Increment.
 */
export const clusterMessageSentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async (req: Request) => getCapabilityMessagingLimit(req, 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `cluster_sent:${getAgentKey(req)}`,
  skip: defaultSkip,
  statusCode: 429,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for cluster message sending. Default limit is 5 requests/minute (up to 600 requests/minute with Capability Increment).'
    }
  },
});

/**
 * 3. Direct Messages Retrieved Limiter
 * Covers all active API route aliases that retrieve direct connection messages.
 * Default limit: 10 req/min. Up to 600 req/min with Capability Increment.
 */
export const directMessageRetrieveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async (req: Request) => getCapabilityMessagingLimit(req, 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `dm_retrieve:${getAgentKey(req)}`,
  skip: defaultSkip,
  statusCode: 429,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for direct message retrieval. Default limit is 10 requests/minute (up to 600 requests/minute with Capability Increment).'
    }
  },
});

/**
 * 4. Cluster Messages Retrieved Limiter
 * Covers active API endpoints or aliases that retrieve cluster messages.
 * Default limit: 10 req/min. Up to 600 req/min with Capability Increment.
 */
export const clusterMessageRetrieveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async (req: Request) => getCapabilityMessagingLimit(req, 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `cluster_retrieve:${getAgentKey(req)}`,
  skip: defaultSkip,
  statusCode: 429,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for cluster message retrieval. Default limit is 10 requests/minute (up to 600 requests/minute with Capability Increment).'
    }
  },
});

// Backward compatibility aliases
export const messageSentLimiter = directMessageSentLimiter;
export const messageRetrieveLimiter = directMessageRetrieveLimiter;

export function rejectAgentCredentials(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  if (apiKeyHeader || (authHeader && authHeader.startsWith('Bearer sk_amr_'))) {
    res.status(403).json({
      success: false,
      error: {
        code: 'AGENT_ACCESS_FORBIDDEN',
        message: 'Forbidden: Autonomous agent credentials cannot access human account management endpoints.',
      },
    });
    return;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.split(' ')[1]?.trim();
    if (bearerToken && !bearerToken.startsWith('sk_amr_')) {
      const agentPayload = verifyAgentAccessToken(bearerToken);
      if (agentPayload && agentPayload.type === 'agent') {
        res.status(403).json({
          success: false,
          error: {
            code: 'AGENT_ACCESS_FORBIDDEN',
            message: 'Forbidden: Autonomous agent credentials cannot access human account management endpoints.',
          },
        });
        return;
      }
    }
  }

  next();
}

/**
 * requireHumanSession:
 * Validates HTTP-only cookie `aamarva_human_session` exclusively.
 * Used ONLY for human account and agent management routes.
 * Human sessions CANNOT perform autonomous agent operations.
 */
export async function requireHumanSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  // 1. Explicitly reject agent API keys and agent Bearer tokens
  if (apiKeyHeader || (authHeader && authHeader.startsWith('Bearer sk_amr_'))) {
    res.status(403).json({
      success: false,
      error: {
        code: 'AGENT_ACCESS_FORBIDDEN',
        message: 'Forbidden: Autonomous agent credentials cannot access human account management endpoints.',
      },
    });
    return;
  }

  let bearerToken: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.split(' ')[1]?.trim();
  }

  if (bearerToken && !bearerToken.startsWith('sk_amr_')) {
    const agentPayload = verifyAgentAccessToken(bearerToken);
    if (agentPayload && agentPayload.type === 'agent') {
      res.status(403).json({
        success: false,
        error: {
          code: 'AGENT_ACCESS_FORBIDDEN',
          message: 'Forbidden: Autonomous agent credentials cannot access human account management endpoints.',
        },
      });
      return;
    }
  }

  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  const rawSession = (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) ? sessionCookie.trim() : bearerToken;

  if (!rawSession) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Human account session required. Please sign in with your password.',
      },
    });
    return;
  }

  try {
    const payload = await verifyHumanSession(rawSession);
    if (!payload || payload.type !== 'human') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired human account session.',
        },
      });
      return;
    }

    req.user = payload;
    req.authType = 'human';

    // Priority 7: Authoritative Status Check (Banned/Suspended users cannot use existing sessions)
    const supabase = getSupabaseClient();
    const activeAccountId = payload.activeAccountId || payload.id;
    const activeUser = await findUserById(supabase, activeAccountId);

    if (!activeUser || (activeUser.status !== 'active' && activeUser.status !== 'frozen')) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_ENFORCEMENT',
          message: `This account is currently ${activeUser?.status || 'inactive'}. Access denied.`,
        },
      });
      return;
    }

    // Dynamic Plan Expiration & Master User Check
    let planStatus = 'ACTIVE';
    const isOperatingMasterAccount = activeUser.is_master_primary === true || activeUser.id === (payload.masterUserId || payload.id);

    if (payload.masterId) {
      const { MasterAccountService } = await import('../services/masterAccountService.js');
      const masterAcct = await MasterAccountService.getInstance().getMasterAccount(payload.masterId);

      if (masterAcct) {
        planStatus = masterAcct.plan_status || 'ACTIVE';

        // Auto-expiration based on plan_expires_at
        if (planStatus === 'ACTIVE' && masterAcct.plan_expires_at && new Date(masterAcct.plan_expires_at).getTime() <= Date.now()) {
          planStatus = 'EXPIRED';
          try {
            const { BillingEntitlementService } = await import('../services/billingService.js');
            await BillingEntitlementService.getInstance().expireMasterPlan(payload.masterId);
          } catch (e) {
            console.error('[requireHumanSession] Auto-expiration failed:', e);
          }
        }
      }
    }

    // Enforce Frozen Restrictions (Only on sub-accounts, NEVER block the Master user identity context!)
    if (!isOperatingMasterAccount && (activeUser.status === 'frozen' || planStatus === 'EXPIRED')) {
      const requestedPath = req.baseUrl + req.path;
      const isGetAgentsMe = requestedPath.endsWith('/agents/me') && req.method === 'GET';
      const isAllowedManagementRoute = requestedPath.endsWith('/auth/master/accounts') || requestedPath.endsWith('/auth/master/switch') || requestedPath.includes('/auth/master/plan');

      if (!isGetAgentsMe && !isAllowedManagementRoute) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_FROZEN',
            message: 'This action is disabled because your Master plan is expired. Please ask the Master account owner to renew the plan.',
          },
        });
        return;
      }
    }

    // Attach active account status
    req.user.status = activeUser.status;
    req.user.activeAccountId = activeUser.id;
    // IMPORTANT: req.user.isMasterUser reflects the AUTHENTICATED HUMAN, preserved from payload.
    // It is NOT overwritten by the active account's Master status here.

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal error occurred during human session verification.',
      },
    });
  }
}


/**
 * requireAgentAuth:
 * Validates agent Bearer tokens (`Authorization: Bearer <token>`) or `X-API-KEY`.
 * Used for autonomous agent network operations (posting, messaging, connections).
 * Human session cookies MUST NOT satisfy this middleware.
 */
export async function requireAgentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 1. Direct API Key authentication via x-api-key header or Bearer sk_amr_... / Bearer amr_live_...
  const rawApiKey = (typeof apiKeyHeader === 'string' && apiKeyHeader.trim())
    ? apiKeyHeader.trim()
    : (token && (token.startsWith('sk_amr_') || token.startsWith('amr_live_')))
      ? token.trim()
      : null;

  if (rawApiKey) {
    try {
      const supabase = getSupabaseClient();
      const fingerprint = computeApiKeyFingerprint(rawApiKey);

      // 1. Direct O(1) indexed lookup in public.users by apiKeyFingerprint
      let { data: userRecord, error: userDbErr } = await supabase
        .from('users')
        .select('*')
        .eq('apiKeyFingerprint', fingerprint)
        .maybeSingle();

      if (!userRecord) {
        const { MasterAccountService } = await import('../services/masterAccountService.js');
        const meta = MasterAccountService.getInstance().getUserByFingerprint(fingerprint);
        if (meta) {
          const { findUserById } = await import('../authService.js');
          userRecord = await findUserById(supabase, meta.id);
        }
      }

      if (!userRecord) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid agent API key.',
          },
        });
        return;
      }

      if (userRecord.status === 'deleted') {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DELETED',
            message: 'Agent account has been deleted.',
          },
        });
        return;
      }

      if (userRecord.status === 'frozen') {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_FROZEN',
            message: 'Agent account is frozen.',
          },
        });
        return;
      }

      if (userRecord.status !== 'active') {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_ENFORCEMENT',
            message: `Agent account is ${userRecord.status}. Access denied.`,
          },
        });
        return;
      }

      // 2. Direct O(1) Auth user lookup by userRecord.id with fallback to metadata store
      const { MasterAccountService } = await import('../services/masterAccountService.js');
      const masterService = MasterAccountService.getInstance();
      const meta = masterService.getUserMetadata(userRecord.id) || await masterService.refreshUserMetadata(userRecord.id);
      let authoritativeHash = (userRecord as any).apiKeyHash || (userRecord as any).apiKey_hash || meta?.apiKeyHash;
      try {
        const { data: authUserData } = await supabase.auth.admin.getUserById(userRecord.id);
        if (authUserData?.user?.app_metadata?.apiKeyHash) {
          authoritativeHash = authUserData.user.app_metadata.apiKeyHash;
        }
      } catch (e) {}

      if (!authoritativeHash) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid agent API key.',
          },
        });
        return;
      }

      const isKeyValid = await compareApiKey(rawApiKey, authoritativeHash);
      if (!isKeyValid) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid agent API key.',
          },
        });
        return;
      }

      // Check Master plan entitlement for Slaves (stale active Slave record cannot bypass expired Master plan)
      const masterId = userRecord.master_id || meta?.master_id;
      const isMasterPrimary = userRecord.is_master_primary === true || meta?.is_master_primary === true;

      if (masterId && !isMasterPrimary) {
        const masterAcct = await masterService.getMasterAccount(masterId);
        if (masterAcct) {
          const isExpired = masterAcct.plan_status === 'EXPIRED' ||
            (masterAcct.plan_expires_at && new Date(masterAcct.plan_expires_at).getTime() <= Date.now());
          if (isExpired) {
            res.status(403).json({
              success: false,
              error: {
                code: 'ACCOUNT_FROZEN',
                message: 'Agent account is frozen because the Master plan is expired.',
              },
            });
            return;
          }
        }
      }

      const clientIp = getClientIp(req);
      const isSlaveAccount = Boolean((userRecord.master_id && !userRecord.is_master_primary) || userRecord.account_type === 'slave' || userRecord.role === 'slave' || userRecord.is_slave === true);
      if (isSlaveAccount && !isIpAllowed(clientIp, userRecord.whitelisted_networks)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied: Source IP is not within the agent whitelisted networks perimeter.',
          },
        });
        return;
      }

      req.user = {
        id: userRecord.id,
        agentId: userRecord.agentId,
        name: userRecord.name,
        avatar: userRecord.avatar,
        email: userRecord.email,
        emailVerified: Boolean(userRecord.emailVerified === true),
        type: 'agent',
        master_id: userRecord.master_id,
        is_master_primary: userRecord.is_master_primary,
        account_type: isSlaveAccount ? 'slave' : 'master',
        role: isSlaveAccount ? 'slave' : (userRecord.role || 'agent'),
        is_slave: isSlaveAccount,
        isSlave: isSlaveAccount,
      };
      (req as any).isSlaveAgent = isSlaveAccount;
      req.authType = 'agent';
      next();
      return;
    } catch (e: any) {
      console.error('Agent API key authentication error:', e.message);
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid agent API key.',
        },
      });
      return;
    }
  }

  // 2. Bearer Access Token authentication
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Agent authentication required. Missing Bearer token or X-API-KEY header.',
      },
    });
    return;
  }



  const payload = verifyAgentAccessToken(token);
  if (!payload || payload.type !== 'agent') {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired agent access token. Human sessions cannot perform agent operations.',
      },
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('status, emailVerified, id, agentId, whitelisted_networks, passwordChangedAt')
      .eq('id', payload.id)
      .maybeSingle();

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid agent token.',
        },
      });
      return;
    }

    // Invalidation check: Only revoke if user password/credentials were explicitly rotated after this session was issued
    if (user.passwordChangedAt && payload.iat) {
      const pwdChangedSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (payload.iat < pwdChangedSeconds) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Agent session has been revoked globally. Please re-authenticate.',
          },
        });
        return;
      }
    }

    if (user.status === 'deleted') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'Agent account has been deleted.',
        },
      });
      return;
    }

    if (user.status === 'frozen') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_FROZEN',
          message: 'Agent account is frozen.',
        },
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_ENFORCEMENT',
          message: `Agent account is currently ${user.status}. Access denied.`,
        },
      });
      return;
    }

    // Check Master plan entitlement for Slaves (stale active Slave record cannot bypass expired Master plan)
    const { MasterAccountService } = await import('../services/masterAccountService.js');
    const masterService = MasterAccountService.getInstance();
    const meta = masterService.getUserMetadata(user.id) || await masterService.refreshUserMetadata(user.id);
    const masterId = (user as any).master_id || meta?.master_id;
    const isMasterPrimary = (user as any).is_master_primary === true || meta?.is_master_primary === true;

    if (masterId && !isMasterPrimary) {
      const masterAcct = await masterService.getMasterAccount(masterId);
      if (masterAcct) {
        const isExpired = masterAcct.plan_status === 'EXPIRED' ||
          (masterAcct.plan_expires_at && new Date(masterAcct.plan_expires_at).getTime() <= Date.now());
        if (isExpired) {
          res.status(403).json({
            success: false,
            error: {
              code: 'ACCOUNT_FROZEN',
              message: 'Agent account is frozen because the Master plan is expired.',
            },
          });
          return;
        }
      }
    }

    const clientIp = getClientIp(req);
    const isSlaveAccount = Boolean((user.master_id && !user.is_master_primary) || user.type === 'agent' || user.role === 'slave' || user.account_type === 'slave' || user.is_slave === true);
    if (isSlaveAccount && !isIpAllowed(clientIp, user.whitelisted_networks)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: Source IP is not within the agent whitelisted networks perimeter.',
        },
      });
      return;
    }

    req.user = {
      ...payload,
      id: user.id,
      agentId: user.agentId,
      name: (user as any).name || payload.name,
      avatar: (user as any).avatar || payload.avatar,
      emailVerified: Boolean(user.emailVerified === true),
      master_id: (user as any).master_id,
      is_master_primary: (user as any).is_master_primary,
      account_type: isSlaveAccount ? 'slave' : 'master',
      role: isSlaveAccount ? 'slave' : ((user as any).role || 'agent'),
      is_slave: isSlaveAccount,
      isSlave: isSlaveAccount,
    };
    (req as any).isSlaveAgent = isSlaveAccount;
    req.authType = 'agent';
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal error occurred during agent token authentication.',
      },
    });
  }
}

export function requireAgent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.authType !== 'agent') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden: Only autonomous agent accounts can perform network activities.',
      },
    });
    return;
  }
  next();
}

/**
 * enforceSlavePostGuard:
 * Strictly enforces that if an authenticated caller is a slave agent (or agent API user),
 * they MUST have registered their cryptographic identity (E2EE public key) before making any POST requests.
 * 
 * Applies ONLY to POST endpoints (mutating/talking/initiating actions).
 * GET (inspection/reads) and PUT (such as PUT /api/agents/me/e2ee for registration) are permitted.
 */
export async function enforceSlavePostGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== 'POST' || !req.user?.id) {
    return next();
  }
  const path = (req.baseUrl || '') + (req.path || '');
  if (path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/refresh') || path.includes('/auth/logout')) {
    return next();
  }
  try {
    const supabase = getSupabaseClient();
    const { data: dbUser } = await supabase.from('users').select('master_id, is_master_primary, account_type, role, is_slave').eq('id', req.user.id).maybeSingle();
    const isSlave = Boolean(
      dbUser?.account_type === 'slave' ||
      dbUser?.role === 'slave' ||
      dbUser?.is_slave === true ||
      dbUser?.isSlave === true ||
      (dbUser?.master_id && !dbUser?.is_master_primary) ||
      (req.user as any)?.account_type === 'slave' ||
      (req.user as any)?.role === 'slave' ||
      (req.user as any)?.is_slave === true ||
      (req.user as any)?.isSlave === true ||
      ((req.user as any)?.master_id && (req.user as any)?.master_id !== (req.user as any)?.id) ||
      ((req.user as any)?.masterUserId && (req.user as any)?.masterUserId !== (req.user as any)?.id) ||
      ((req.user as any)?.email && typeof (req.user as any).email === 'string' && (req.user as any).email.includes('+AMR-'))
    );
    if (isSlave) {
      if (req.authType === 'human' && (path.includes('/messages') || path.includes('/chat'))) {
        res.status(403).json({
          success: false,
          error: {
            code: 'SLAVE_UI_MESSAGING_DISABLED',
            message: 'Slave accounts cannot send messages via the UI. Messaging must be performed via the agent runtime API.'
          }
        });
        return;
      }
      const { data: authData } = await supabase.auth.admin.getUserById(req.user.id);
      const meta = authData?.user?.user_metadata || {};
      if (!meta.e2eePublicKey || typeof meta.e2eePublicKey !== 'string' || meta.e2eePublicKey.trim().length === 0) {
        res.status(403).json({
          success: false,
          error: {
            code: 'E2EE_KEY_REQUIRED',
            message: 'Slave agent identity registration required. Register an E2EE public key via PUT /api/agents/me/e2ee before taking actions or communicating.'
          }
        });
        return;
      }
    }
  } catch (err) {
    console.warn('[enforceSlavePostGuard] verification notice:', err);
  }
  return next();
}

/**
 * requireUserOrAgentAuth:
 * Accepts either a verified human session cookie or valid agent Bearer token / X-API-KEY.
 * Allows human users in web dashboard and autonomous agents to view connections and manage requests.
 */
export async function requireUserOrAgentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.user) {
    return enforceSlavePostGuard(req, res, next);
  }
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : undefined;
  const queryToken = (typeof req.query?.token === 'string' && (req.query.token as string).trim()) ? (req.query.token as string).trim() : undefined;

  const candidateSession = (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim())
    ? sessionCookie.trim()
    : (bearerToken || queryToken);

  if (candidateSession) {
    try {
      const payload = await verifyHumanSession(candidateSession);
      if (payload && payload.type === 'human') {
        req.user = payload;
        req.authType = 'human';
        return enforceSlavePostGuard(req, res, next);
      }
    } catch (e) {}

    try {
      const agentPayload = verifyAgentAccessToken(candidateSession);
      if (agentPayload && agentPayload.agentId) {
        req.user = agentPayload;
        req.authType = 'agent';
        return enforceSlavePostGuard(req, res, next);
      }
    } catch (e) {}
  }

  // Fallback to agent API key auth if an API key was provided
  if (req.headers['x-api-key']) {
    return await requireAgentAuth(req, res, () => enforceSlavePostGuard(req, res, next));
  }

  if (!res.headersSent) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid human session or agent API key.',
      },
    });
  }
}

/**
 * requireHumanSecretsAuth:
 * STRICT ISOLATION GUARD FOR SECRETS PRESERVER.
 * 
 * Only human user sessions are permitted to access the Secrets Preserver.
 * Autonomous agents are categorically FORBIDDEN from accessing secrets:
 * - Agents cannot GET secrets or secret metadata
 * - Agents cannot POST / create secrets
 * - Agents cannot DELETE secrets
 * - Any request bearing agent authentication (X-API-KEY, agent Bearer token, or sk_amr_*)
 *   is strictly rejected with 403 Forbidden.
 * Unauthenticated requests receive 401 Unauthorized.
 */
export async function requireHumanSecretsAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // 1. Explicitly reject agent API keys
  if (apiKeyHeader || (authHeader && (authHeader.startsWith('Bearer sk_amr_') || authHeader.startsWith('Bearer amr_live_')))) {
    res.status(403).json({
      success: false,
      error: {
        code: 'AGENT_ACCESS_FORBIDDEN',
        message: 'Forbidden: Autonomous agent accounts cannot access the Secrets Preserver. Secrets are private to human users.',
      },
    });
    return;
  }

  // 2. Check if Bearer token is an agent token
  let bearerToken: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.split(' ')[1]?.trim();
  }

  if (bearerToken && !bearerToken.startsWith('sk_amr_')) {
    const agentPayload = verifyAgentAccessToken(bearerToken);
    if (agentPayload && agentPayload.type === 'agent') {
      res.status(403).json({
        success: false,
        error: {
          code: 'AGENT_ACCESS_FORBIDDEN',
          message: 'Forbidden: Autonomous agent accounts cannot access the Secrets Preserver. Secrets are private to human users.',
        },
      });
      return;
    }
  }

  // 3. Resolve human session from HTTP-only cookie or human Bearer token
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  const candidateSession = (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim())
    ? sessionCookie.trim()
    : bearerToken;

  if (!candidateSession) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Human account authentication required to access the Secrets Preserver.',
      },
    });
    return;
  }

  try {
    const payload = await verifyHumanSession(candidateSession);
    if (!payload || payload.type !== 'human') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired human account session.',
        },
      });
      return;
    }

    req.user = payload;
    req.authType = 'human';

    // Priority 7: Authoritative Status Check (Banned/Suspended users cannot use existing sessions)
    const supabase = getSupabaseClient();
    const { data: user, error: statusError } = await supabase
      .from('users')
      .select('status')
      .eq('id', payload.id)
      .maybeSingle();

    if (statusError || !user || user.status !== 'active') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_ENFORCEMENT',
          message: `This account is currently ${user?.status || 'inactive'}. Access denied.`,
        },
      });
      return;
    }

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal error occurred during secrets authentication verification.',
      },
    });
  }
}

export function rejectIfFrozen(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.status === 'frozen') {
    res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_FROZEN',
        message: 'This action is disabled because the Master plan has expired. Please renew the plan to reactivate the account.',
      },
    });
    return;
  }
  next();
}

export function requireMasterOnly(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.authType !== 'human' || req.user.isMasterUser !== true) {
    res.status(403).json({
      success: false,
      error: {
        code: 'MASTER_ONLY',
        message: 'Access denied. This operation requires a Master Account session.'
      }
    });
    return;
  }
  next();
}


