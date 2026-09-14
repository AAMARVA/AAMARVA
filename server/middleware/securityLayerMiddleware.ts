import { Request, Response, NextFunction } from 'express';
import { SecurityService, SecurityError, GLOBAL_SECURITY_POLICIES, SecuritySeverity, TrafficClass } from '../services/securityService';
import { AuthenticatedRequest } from './authMiddleware';
import { HUMAN_SESSION_COOKIE_NAME } from '../authService.js';

/**
 * Detects the traffic class based on existing authentication headers and cookies.
 * Does NOT perform full verification, only presence detection for classification.
 */
function detectTrafficClass(req: Request): TrafficClass {
  const authenticatedReq = req as AuthenticatedRequest;
  
  // 1. Check if authMiddleware already ran and set authType
  if (authenticatedReq.authType === 'human') return TrafficClass.HUMAN_SESSION;
  if (authenticatedReq.authType === 'agent') return TrafficClass.AGENT_AUTH;

  // 2. Fallback: Detect based on presence of credentials
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  if (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) {
    return TrafficClass.HUMAN_SESSION;
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  if (
    (authHeader && authHeader.startsWith('Bearer ')) || 
    (apiKeyHeader && typeof apiKeyHeader === 'string' && apiKeyHeader.trim())
  ) {
    return TrafficClass.AGENT_AUTH;
  }

  return TrafficClass.PUBLIC;
}

/**
 * AAMARVA Deterministic Security Layer Middleware
 * Implements S0-S3 severity enforcement, sticky violation history, and resource protection.
 */
export function securityLayer(policyName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const securityService = SecurityService.getInstance();
      const trafficClass = detectTrafficClass(req);
      
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user?.id;
      const agentId = authenticatedReq.user?.agentId;

      // Deep payload inspection (Priority 13)
      if (req.body && typeof req.body === 'object') {
        const bodyStr = JSON.stringify(req.body);
        const policy = GLOBAL_SECURITY_POLICIES[policyName];
        const maxBodySize = policy?.resourceLimits?.maxBodySize || 100000;
        
        if (bodyStr.length > maxBodySize) {
          await securityService.recordViolation(userId || '', agentId || '', policyName, SecuritySeverity.S2_ABUSE, `Payload size violation: ${bodyStr.length} > ${maxBodySize}`, req.ip);
          return res.status(400).json({ success: false, error: 'Request payload too large.' });
        }

        try {
          securityService.checkPayloadDepth(req.body, 0, 10);
        } catch (depthError: any) {
          await securityService.recordViolation(userId || '', agentId || '', policyName, SecuritySeverity.S2_ABUSE, `Payload depth violation: ${depthError.message}`, req.ip);
          return res.status(400).json({ success: false, error: 'Invalid request payload structure.' });
        }
      }

      await securityService.evaluateRequest(req, policyName, userId, trafficClass);
      
      next();
    } catch (err: any) {
      if (err instanceof SecurityError) {
        console.warn(`[SECURITY ENFORCEMENT] ${err.code}: ${err.message} on ${req.originalUrl} from ${req.ip}`);
        
        const status = err.code === 'PERMANENT_BAN' ? 403 : (err.code === 'SUSPENDED' ? 423 : 429);
        
        return res.status(status).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            retryAfter: err.retryAfter
          }
        });
      }
      
      console.error('[SECURITY LAYER ERROR]', err);
      next(err);
    }
  };
}
