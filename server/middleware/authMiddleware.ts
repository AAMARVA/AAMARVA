import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  verifyAgentAccessToken,
  verifyHumanSession,
  HUMAN_SESSION_COOKIE_NAME,
  computeApiKeyFingerprint,
  compareApiKey,
  UserTokenPayload,
} from '../authService.js';
import { getSupabaseClient } from '../supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
  authType?: 'human' | 'agent';
}

export function getAgentKey(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyAgentAccessToken(token);
    if (payload && payload.agentId) {
      return `agent:${payload.agentId}`;
    }
  }
  return ipKeyGenerator(req.ip || '127.0.0.1');
}

const defaultSkip = (req: Request) => {
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

  // Check the standard Express req.ip
  if (checkIp(req.ip)) return true;

  // Double check X-Forwarded-For manually in case proxy trust is misconfigured
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    const ips = xForwardedFor.split(',').map(s => s.trim());
    if (ips.some(checkIp)) return true;
  }

  return false;
};

export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts from this IP. Please try again later.' } },
});

export const humanLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts from this IP. Please try again later.' } },
});

export const agentLoginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
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
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAgentKey,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded for agent actions. Please slow down.' } },
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many read requests. Please slow down.' } },
});

export const tokenRefreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token refresh attempts. Please try again later.' } },
});

export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many email verification attempts. Please try again later.' } },
});

export const connectionRequestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAgentKey,
  skip: defaultSkip,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many connection requests. Please slow down.' } },
});

export const authRateLimiter = humanLoginRateLimiter;

/**
 * requireHumanSession:
 * Validates HTTP-only cookie `aamarva_human_session` exclusively.
 * Used ONLY for human account and agent management routes.
 * Human sessions CANNOT perform autonomous agent operations.
 */
export async function requireHumanSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];

  if (!sessionCookie || typeof sessionCookie !== 'string' || !sessionCookie.trim()) {
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
    const payload = await verifyHumanSession(sessionCookie.trim());
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

  // 1. Direct API Key authentication via x-api-key header or Bearer sk_amr_...
  const rawApiKey = (typeof apiKeyHeader === 'string' && apiKeyHeader.trim())
    ? apiKeyHeader.trim()
    : (token && token.startsWith('sk_amr_'))
      ? token.trim()
      : null;

  if (rawApiKey) {
    try {
      const supabase = getSupabaseClient();
      const fingerprint = computeApiKeyFingerprint(rawApiKey);

      // 1. Direct O(1) indexed lookup in public.users by apiKeyFingerprint
      const { data: userRecord, error: userDbErr } = await supabase
        .from('users')
        .select('*')
        .eq('apiKeyFingerprint', fingerprint)
        .maybeSingle();

      if (userDbErr || !userRecord || userRecord.status !== 'active') {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid agent API key.',
          },
        });
        return;
      }

      // 2. Direct O(1) Auth user lookup by userRecord.id
      const { data: authUserData, error: authErr } = await supabase.auth.admin.getUserById(userRecord.id);
      const matchedAuthUser = authUserData?.user;

      if (authErr || !matchedAuthUser) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid agent API key.',
          },
        });
        return;
      }

      const authoritativeHash = matchedAuthUser.app_metadata?.apiKeyHash;
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

      req.user = {
        id: userRecord.id,
        agentId: userRecord.agentId,
        email: userRecord.email,
        emailVerified: Boolean(userRecord.emailVerified === true),
        type: 'agent',
      };
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
      .select('status, emailVerified')
      .eq('id', payload.id)
      .maybeSingle();

    if (error || !user || user.status !== 'active') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Agent account is invalid or suspended.',
        },
      });
      return;
    }

    req.user = {
      ...payload,
      emailVerified: Boolean(user.emailVerified === true),
    };
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
 * requireUserOrAgentAuth:
 * Accepts either a verified human session cookie or valid agent Bearer token / X-API-KEY.
 * Allows human users in web dashboard and autonomous agents to view connections and manage requests.
 */
export async function requireUserOrAgentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  if (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) {
    try {
      const payload = await verifyHumanSession(sessionCookie.trim());
      if (payload && payload.type === 'human') {
        req.user = payload;
        req.authType = 'human';
        return next();
      }
    } catch (e) {}
  }

  // Fallback to agent auth verification
  return requireAgentAuth(req, res, next);
}

