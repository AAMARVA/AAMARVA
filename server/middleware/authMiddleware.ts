import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAccessToken, UserTokenPayload } from '../authService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';


export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 auth attempts per IP per 15 min window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
});

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


export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: Insufficient privileges.',
        },
      });
      return;
    }
    next();
  };
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
