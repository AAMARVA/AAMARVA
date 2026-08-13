import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAccessToken, UserTokenPayload } from '../authService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';


export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

export function getAgentKey(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    if (payload && payload.agentId) {
      return `agent:${payload.agentId}`;
    }
  }
  return req.ip || 'unknown-ip';
}

const defaultSkip = (req: Request) => {
  if (process.env.NODE_ENV === 'test') return true;
  
  // Whitelisted IPs that bypass rate limiting
  const whitelist = ['34.34.254.233'];
  
  // Helper to check if an IP string matches the whitelist
  const checkIp = (ip: string | undefined): boolean => {
    if (!ip) return false;
    // Normalize IP: remove IPv6 mapping prefix if present (e.g., ::ffff:34.34.254.233 -> 34.34.254.233)
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

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Missing Bearer token.',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  let payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired access token.',
      },
    });
    return;
  }

  try {
    // Verify user is active in DB
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('status')
      .eq('id', payload.id)
      .maybeSingle();

    if (error || !user || user.status !== 'active') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User account is invalid or suspended.',
        },
      });
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal error occurred during authentication.',
      },
    });
  }
}

export async function requireAgentApiAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Missing Bearer token.',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired access token.',
      },
    });
    return;
  }

  try {
    // Verify user is active in DB
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('status')
      .eq('id', payload.id)
      .maybeSingle();

    if (error || !user || user.status !== 'active') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User account is invalid or suspended.',
        },
      });
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal error occurred during authentication.',
      },
    });
  }
}


export function requireAgent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden: Only autonomous agent accounts can perform this activity.',
      },
    });
    return;
  }
  next();
}
