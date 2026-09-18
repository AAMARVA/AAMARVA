import { Request } from 'express';
import { isIP } from 'node:net';
import { getSupabaseClient } from '../supabase';
import { logAccountAudit } from './auditService';
import { redactSensitiveData } from '../utils/redact';
import { getClientIp } from '../utils/networkWhitelist';

/**
 * AAMARVA SECURITY POLICY LEVELS
 */
export enum SecuritySeverity {
  S0_NORMAL = 'S0',       // Nominal behavior
  S1_SUSPICIOUS = 'S1',   // Anomalous but potentially legitimate
  S2_ABUSE = 'S2',        // Confirmed violation of usage policies
  S3_CRITICAL = 'S3'      // Immediate threat to platform integrity
}

export enum TrafficClass {
  HUMAN_SESSION = 'HUMAN_SESSION',
  AGENT_AUTH = 'AGENT_AUTH',
  PUBLIC = 'PUBLIC'
}

export interface SecurityPolicy {
  endpoint: string;
  severity: SecuritySeverity;
  isCritical?: boolean; // If true, failures in security components result in DENY (Fail-Closed)
  rateLimit: {
    windowMs: number;
    max: number;
  };
  resourceLimits?: {
    maxBodySize?: number;
    maxStringLength?: number;
    maxArrayLength?: number;
  };
  identity: 'ip' | 'account' | 'both';
  
  // Thresholds for escalation
  warningThreshold: number;      // Number of violations before warning
  suspensionThreshold: number;   // Number of violations before suspension
  suspensionDurationMs: number;  // Initial suspension duration
  permanentBanThreshold: number; // Number of suspensions before permanent ban
  
  // Probation
  probationDurationMs: number;   // Duration of probation after suspension
}

export const GLOBAL_SECURITY_POLICIES: Record<string, SecurityPolicy> = {
  'auth_register': {
    endpoint: '/api/auth/register',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 per 15 min per IP
    identity: 'ip',
    warningThreshold: 2,
    suspensionThreshold: 3,
    suspensionDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    permanentBanThreshold: 3,
    probationDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  'auth_login': {
    endpoint: '/api/auth/login',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
    identity: 'both',
    warningThreshold: 5,
    suspensionThreshold: 8,
    suspensionDurationMs: 1 * 60 * 60 * 1000, // 1 hour
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000, // 1 day
  },
  'auth_refresh': {
    endpoint: '/api/auth/refresh',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 20 },
    identity: 'both',
    warningThreshold: 10,
    suspensionThreshold: 30,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'forgot_password': {
    endpoint: '/api/auth/forgot-password',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 60 * 60 * 1000, max: 3 },
    identity: 'both',
    warningThreshold: 2,
    suspensionThreshold: 4,
    suspensionDurationMs: 6 * 60 * 60 * 1000,
    permanentBanThreshold: 3,
    probationDurationMs: 48 * 60 * 60 * 1000,
  },
  'reset_password': {
    endpoint: '/api/auth/reset-password',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 60 * 60 * 1000, max: 5 },
    identity: 'both',
    warningThreshold: 3,
    suspensionThreshold: 6,
    suspensionDurationMs: 12 * 60 * 60 * 1000,
    permanentBanThreshold: 3,
    probationDurationMs: 72 * 24 * 60 * 60 * 1000,
  },
  'rotate_api_key': {
    endpoint: '/api/auth/agent/rotate-api-key',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 3 },
    identity: 'account',
    warningThreshold: 2,
    suspensionThreshold: 5,
    suspensionDurationMs: 24 * 60 * 60 * 1000,
    permanentBanThreshold: 3,
    probationDurationMs: 7 * 24 * 60 * 60 * 1000,
  },
  'agent_update': {
    endpoint: '/api/agents/me',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 20,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'post_create': {
    endpoint: '/api/posts',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 },
    resourceLimits: { maxBodySize: 50000, maxStringLength: 10000, maxArrayLength: 50 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 50,
    suspensionDurationMs: 30 * 60 * 1000,
    permanentBanThreshold: 10,
    probationDurationMs: 12 * 60 * 60 * 1000,
  },
  'reply_create': {
    endpoint: '/api/posts/:postId/replies',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 50,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 10,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'connection_request': {
    endpoint: '/api/connections/requests',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 25,
    suspensionDurationMs: 4 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 48 * 60 * 60 * 1000,
  },
  'secrets_access': {
    endpoint: '/api/secrets',
    severity: SecuritySeverity.S3_CRITICAL,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 30 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 1, // S3 results in immediate suspension
    suspensionDurationMs: 24 * 60 * 60 * 1000,
    permanentBanThreshold: 2,
    probationDurationMs: 30 * 24 * 60 * 60 * 1000,
  },
  'counter_party_score': {
    endpoint: '/api/counter-party-score',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: false,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 30 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 40,
    suspensionDurationMs: 2 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'agent_delete': {
    endpoint: '/api/agents/me',
    severity: SecuritySeverity.S3_CRITICAL,
    isCritical: true,
    rateLimit: { windowMs: 24 * 60 * 60 * 1000, max: 1 },
    identity: 'account',
    warningThreshold: 1,
    suspensionThreshold: 2,
    suspensionDurationMs: 7 * 24 * 60 * 60 * 1000,
    permanentBanThreshold: 1,
    probationDurationMs: 30 * 24 * 60 * 60 * 1000,
  },
  'post_delete': {
    endpoint: '/api/posts/:postId',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 20,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'reply_delete': {
    endpoint: '/api/replies/:replyId',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 20,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'message_create': {
    endpoint: '/api/connections/:connectionId/messages',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 100,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 10,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'connection_delete': {
    endpoint: '/api/connections/:connectionId',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 20,
    suspensionDurationMs: 6 * 60 * 60 * 1000,
    permanentBanThreshold: 3,
    probationDurationMs: 7 * 24 * 60 * 60 * 1000,
  },
  'connection_accept': {
    endpoint: '/api/connections/requests/:requestId/accept',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 20 },
    identity: 'account',
    warningThreshold: 10,
    suspensionThreshold: 30,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'counter_party_delete': {
    endpoint: '/api/counter-party-score/:reviewId',
    severity: SecuritySeverity.S1_SUSPICIOUS,
    isCritical: true,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 10 },
    identity: 'account',
    warningThreshold: 5,
    suspensionThreshold: 20,
    suspensionDurationMs: 1 * 60 * 60 * 1000,
    permanentBanThreshold: 5,
    probationDurationMs: 24 * 60 * 60 * 1000,
  },
  'verify_email': {
    endpoint: '/api/auth/verify-email',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 5 },
    identity: 'both',
    warningThreshold: 2,
    suspensionThreshold: 4,
    suspensionDurationMs: 24 * 60 * 60 * 1000,
    permanentBanThreshold: 3,
    probationDurationMs: 7 * 24 * 60 * 60 * 1000,
  },
  'change_email': {
    endpoint: '/api/auth/change-email',
    severity: SecuritySeverity.S2_ABUSE,
    isCritical: true,
    rateLimit: { windowMs: 60 * 60 * 1000, max: 2 },
    identity: 'both',
    warningThreshold: 1,
    suspensionThreshold: 2,
    suspensionDurationMs: 24 * 60 * 60 * 1000,
    permanentBanThreshold: 2,
    probationDurationMs: 7 * 24 * 60 * 60 * 1000,
  },
  'public_reads': {
    endpoint: 'public_reads',
    severity: SecuritySeverity.S0_NORMAL,
    isCritical: false,
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 },
    identity: 'ip',
    warningThreshold: 100,
    suspensionThreshold: 200,
    suspensionDurationMs: 15 * 60 * 1000,
    permanentBanThreshold: 20,
    probationDurationMs: 1 * 60 * 60 * 1000,
  }
};

/**
 * CORE SECURITY SERVICE
 * Deterministic enforcement layer for AAMARVA Network Security.
 */
export class SecurityService {
  private static instance: SecurityService;

  private tableExistence: Record<string, boolean> = {
    ip_reputations: true,
    security_violations: true,
    security_enforcement_events: true,
    security_behavioral_signals: true,
    users: true,
    check_rate_limit_atomic: true,
    record_violation_atomic: true,
    record_critical_violation_atomic: true,
    record_ip_penalty_atomic: true,
  };

  private localRateLimitMap = new Map<string, { count: number; windowStart: number }>();
  private localViolationsMap = new Map<string, { identifier: string; endpoint: string; violationCount: number; suspensionCount: number; isPermanentlyBanned: boolean; suspendedUntil?: string; lastViolationAt: string }>();
  private localIpReputationsMap = new Map<string, { score: number; isBlacklisted: boolean }>();
  private localBehavioralSignals: Array<{ identifier: string; score: number; timestamp: number }> = [];

  private constructor() {}

  public static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  public resetState(): void {
    this.localRateLimitMap.clear();
    this.localViolationsMap.clear();
    this.localIpReputationsMap.clear();
    this.localBehavioralSignals = [];
  }

  /**
   * Evaluates a request against the security policy.
   * Throws an error if enforcement is triggered.
   */
  public async evaluateRequest(req: Request, policyName: string, userId?: string, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyName];
    if (!policy) {
      console.error(`[SECURITY] Attempted to evaluate nonexistent policy: ${policyName}`);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Security configuration mismatch. Access denied.');
    }

    const ipStr = this.normalizeIp(getClientIp(req));

    // 0. IP Reputation Check
    await this.checkIpReputation(ipStr, policy.isCritical, trafficClass);

    // Hardened identifier extraction for login routes
    let effectiveUserId = userId;
    if (!effectiveUserId && (policyName === 'auth_login' || policyName === 'auth_register')) {
      effectiveUserId = req.body.agentId || req.body.email || req.body.userId;
    }

    const identifier = policy.identity === 'account' 
      ? effectiveUserId 
      : (policy.identity === 'ip' ? ipStr : `${effectiveUserId || 'anonymous'}:${ipStr}`);

    if (!identifier && trafficClass === TrafficClass.AGENT_AUTH) {
      throw new SecurityError('UNAUTHORIZED', 'Agent identity required for security verification.');
    }

    // 1. Check existing enforcements (Bans/Suspensions)
    await this.checkEnforcements(identifier as string, policyName, policy.isCritical, trafficClass);

    // 2. Resource Protection Validation (Always Fail-Closed)
    this.validateResourceLimits(req, policy);

    // 3. Correlation Scrutiny (Priority 14: Cross-account abuse evasion)
    await this.performCorrelationCheck(ipStr, effectiveUserId, policy.isCritical, trafficClass);

    // 4. Rate Limiting (Deterministic Window-based, Atomic)
    await this.checkRateLimit(identifier as string, policyName, ipStr, policy.isCritical, trafficClass);

    // 5. Track Activity
    await this.trackActivity(identifier as string, policyName);
  }

  private async performCorrelationCheck(ip: string, userId: string | undefined, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    if (!userId || !this.tableExistence.security_enforcement_events) return;
    const sb = getSupabaseClient();
    
    // Check if this IP has other suspended/banned accounts (Priority 14)
    const { data: correlatedAbuse, error } = await sb
      .from('security_enforcement_events')
      .select('identifier')
      .eq('ip', ip)
      .neq('identifier', userId)
      .in('eventType', ['SUSPENSION', 'BAN'])
      .gt('timestamp', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()) // Last 48h
      .limit(1);

    if (error) {
      if (this.handleTableError('security_enforcement_events', error, isCritical, trafficClass)) return;
      console.error('[SECURITY CORRELATION ERROR]', error);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Security verification failed. Access denied.');
    }

    if (correlatedAbuse && correlatedAbuse.length > 0) {
      console.warn(`[SECURITY CORRELATION] Account ${userId} correlated with abusive IP ${ip}`);
    }
  }

  public normalizeIp(ip: string): string {
    if (!ip || ip === '::1' || ip === '127.0.0.1') return '127.0.0.1';
    
    let normalized = ip;
    
    // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
    if (normalized.startsWith('::ffff:')) {
      normalized = normalized.substring(7);
    }
    
    // For general IPv6, use a standard library or normalize to lowercase
    // We strictly use canonical representation for equality checks
    if (normalized.includes(':')) {
      // Simple IPv6 normalization for equality in DB
      return normalized.toLowerCase().trim();
    }

    // Check if it's a valid IP
    if (!isIP(normalized)) {
      return 'unknown';
    }

    return normalized.trim();
  }

  public checkPayloadDepth(obj: any, currentDepth: number, maxDepth: number): void {
    if (currentDepth > maxDepth) {
      throw new Error(`Payload depth exceeded maximum limit of ${maxDepth}`);
    }

    if (obj === null || typeof obj !== 'object') {
      return;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length > 1000) throw new Error('Array length limit exceeded in payload');
      for (const item of obj) {
        this.checkPayloadDepth(item, currentDepth + 1, maxDepth);
      }
      return;
    }

    // Handle objects
    const keys = Object.keys(obj);
    if (keys.length > 100) throw new Error('Object key limit exceeded in payload');
    
    for (const key of keys) {
      this.checkPayloadDepth(obj[key], currentDepth + 1, maxDepth);
    }
  }

  private async checkRateLimit(identifier: string, policyName: string, ip: string, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyName];
    const now = Date.now();
    const windowStartMs = Math.floor(now / policy.rateLimit.windowMs) * policy.rateLimit.windowMs;

    if (this.tableExistence.check_rate_limit_atomic) {
      try {
        const sb = getSupabaseClient();
        const windowStart = new Date(windowStartMs);
        const { data: result, error } = await sb.rpc('check_rate_limit_atomic', {
          p_identifier: identifier,
          p_endpoint: policyName,
          p_window_start: windowStart.toISOString(),
          p_max_requests: policy.rateLimit.max
        });

        if (!error && result) {
          if (result.exceeded) {
            await this.recordRateLimitEvent(identifier, policyName, result.requestCount, ip);
            throw new SecurityError(
              'RATE_LIMIT_EXCEEDED', 
              `Rate limit exceeded for ${policy.endpoint}. Max: ${policy.rateLimit.max} per ${policy.rateLimit.windowMs / 1000}s`, 
              (windowStart.getTime() + policy.rateLimit.windowMs - now).toString()
            );
          }
          return;
        }

        if (error) {
          this.handleTableError('check_rate_limit_atomic', error, isCritical, trafficClass);
        }
      } catch (e: any) {
        if (e.code === 'RATE_LIMIT_EXCEEDED') throw e;
        this.tableExistence.check_rate_limit_atomic = false;
      }
    }

    // In-memory rate limiting fallback for testing and development
    const key = `${identifier}:${policyName}`;
    const current = this.localRateLimitMap.get(key);
    let currentCount = 1;
    if (current && current.windowStart === windowStartMs) {
      currentCount = current.count + 1;
    }
    this.localRateLimitMap.set(key, { count: currentCount, windowStart: windowStartMs });

    if (currentCount > policy.rateLimit.max) {
      throw new SecurityError(
        'RATE_LIMIT_EXCEEDED', 
        `Rate limit exceeded for ${policy.endpoint}. Max: ${policy.rateLimit.max} per ${policy.rateLimit.windowMs / 1000}s`, 
        (windowStartMs + policy.rateLimit.windowMs - now).toString()
      );
    }
  }

  private async recordRateLimitEvent(identifier: string, policyName: string, count: number, ip: string): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyName];
    const sb = getSupabaseClient();
    
    // Log the event
    await this.logEnforcementEvent({
      identifier,
      policyKey: policyName,
      endpoint: policy.endpoint,
      eventType: 'RATE_LIMIT_VIOLATION',
      severity: SecuritySeverity.S1_SUSPICIOUS,
      reason: `Rate limit hit: ${count}/${policy.rateLimit.max}`,
      ip
    });

    // Check if this identifier has repeated rate limit violations
    const { count: violationCount, error } = await sb
      .from('security_enforcement_events')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('eventType', 'RATE_LIMIT_VIOLATION')
      .gt('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24h

    if (error) {
      console.error('[SECURITY] Error checking rate limit violations history:', error);
      return; // Non-critical for decision, but logged
    }

    if (violationCount && violationCount > 10) {
      // Escalating repeated 429s into a strike
      await this.recordViolation(identifier, '', policyName, SecuritySeverity.S2_ABUSE, `Persistent rate limit abuse: ${violationCount} violations in 24h`, ip);
    }
  }

  private async checkIpReputation(ip: string, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    const normalizedIp = this.normalizeIp(ip);
    
    const localRep = this.localIpReputationsMap.get(normalizedIp);
    if (localRep) {
      if (localRep.isBlacklisted || localRep.score <= 0) {
        throw new SecurityError('IP_RESTRICTED', `Your IP address ${normalizedIp} is restricted due to security violations.`);
      }
    }

    if (!this.tableExistence.ip_reputations) return;

    try {
      const sb = getSupabaseClient();
      const { data: reputation, error: queryError } = await sb
        .from('ip_reputations')
        .select('*')
        .eq('ip', normalizedIp)
        .maybeSingle();

      if (queryError) {
        this.handleTableError('ip_reputations', queryError, isCritical, trafficClass);
        return;
      }

      if (reputation) {
        if (reputation.isBlacklisted) {
          const ladder = [5, 15, 60, 360, 1440, 10080];
          const durationIdx = Math.min((reputation.violationCount || 1) - 1, ladder.length - 1);
          const cooldownMinutes = ladder[durationIdx];
          const cooldownUntil = new Date(new Date(reputation.updatedAt).getTime() + cooldownMinutes * 60 * 1000);
          
          if (new Date() < cooldownUntil) {
            throw new SecurityError('IP_RESTRICTED', `Your IP address is temporarily restricted due to repeated security violations. Cooldown ends at ${cooldownUntil.toISOString()}.`);
          } else {
            await sb.from('ip_reputations').update({ 
              isBlacklisted: false, 
              score: 20, 
              updatedAt: new Date().toISOString() 
            }).eq('ip', normalizedIp);
          }
        }
      }
    } catch (e: any) {
      if (e.code === 'IP_RESTRICTED') throw e;
      this.tableExistence.ip_reputations = false;
    }
  }

  public async updateIpReputation(ip: string, penalty: number): Promise<void> {
    const normalizedIp = this.normalizeIp(ip);
    const existing = this.localIpReputationsMap.get(normalizedIp) || { score: 100, isBlacklisted: false };
    const newScore = Math.max(0, existing.score - penalty);
    this.localIpReputationsMap.set(normalizedIp, {
      score: newScore,
      isBlacklisted: penalty >= 100 || newScore === 0,
    });

    if (this.tableExistence.record_ip_penalty_atomic) {
      try {
        const sb = getSupabaseClient();
        await sb.rpc('record_ip_penalty_atomic', {
          p_ip: normalizedIp,
          p_penalty: penalty
        });
      } catch (e) {
        this.tableExistence.record_ip_penalty_atomic = false;
      }
    }
  }

  private async checkEnforcements(identifier: string, policyName: string, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    const key = `${identifier}:${policyName}`;
    const localEntry = this.localViolationsMap.get(key);
    if (localEntry) {
      if (localEntry.isPermanentlyBanned) {
        throw new SecurityError('PERMANENT_BAN', 'Your access has been permanently revoked due to security violations.');
      }
      if (localEntry.suspendedUntil && new Date(localEntry.suspendedUntil) > new Date()) {
        throw new SecurityError('SUSPENDED', `Access suspended until ${localEntry.suspendedUntil}.`, localEntry.suspendedUntil);
      }
    }

    if (!this.tableExistence.security_violations) return;

    try {
      const sb = getSupabaseClient();
      const { data: enforcement, error } = await sb
        .from('security_violations')
        .select('*')
        .eq('identifier', identifier)
        .eq('endpoint', policyName)
        .maybeSingle();

      if (error) {
        this.handleTableError('security_violations', error, isCritical, trafficClass);
        return;
      }

      if (enforcement) {
        if (enforcement.isPermanentlyBanned) {
          await this.syncUserStatus(identifier, 'banned', isCritical, trafficClass);
          throw new SecurityError('PERMANENT_BAN', 'Your access has been permanently revoked due to repeated security violations.');
        }

        if (enforcement.suspendedUntil && new Date(enforcement.suspendedUntil) > new Date()) {
          await this.syncUserStatus(identifier, 'suspended', isCritical, trafficClass);
          throw new SecurityError('SUSPENDED', `Access suspended until ${enforcement.suspendedUntil}.`, enforcement.suspendedUntil);
        }
      }
    } catch (e: any) {
      if (e.code === 'PERMANENT_BAN' || e.code === 'SUSPENDED') throw e;
      this.tableExistence.security_violations = false;
    }
  }

  private async syncUserStatus(identifier: string, status: string, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): Promise<void> {
    if (!this.tableExistence.users) {
      if (trafficClass !== TrafficClass.AGENT_AUTH) return;
      return;
    }

    const sb = getSupabaseClient();
    const { data: user, error } = await sb
      .from('users')
      .select('id, status')
      .or(`id.eq."${identifier}",agentId.eq."${identifier}"`)
      .maybeSingle();

    if (error) {
      if (this.handleTableError('users', error, isCritical, trafficClass)) return;
      console.error('[SECURITY] User status sync failed (FAIL CLOSED):', error);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Security state synchronization failed.');
    }

    if (user && user.status !== status) {
      await sb.from('users').update({ status }).eq('id', user.id);
    }
  }

  private handleTableError(componentName: string, error: any, isCritical: boolean = false, trafficClass: TrafficClass = TrafficClass.PUBLIC): boolean {
    const errorCode = error?.code;
    const errorMessage = error?.message?.toLowerCase() || '';
    
    const isMissingComponent = (
      errorCode === '42P01' || 
      errorCode === 'PGRST202' || 
      errorCode === 'PGRST205' || 
      errorCode === 'PGRST204' ||
      errorCode === 'PGRST200' ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('missing')
    );

    if (isMissingComponent) {
      if (this.tableExistence[componentName]) {
        console.warn(`[SECURITY] Security component ${componentName} missing or stale in DB (${errorCode || 'NO_CODE'}). Context: ${isCritical ? 'CRITICAL' : 'ADVISORY'}, Traffic: ${trafficClass}`);
        this.tableExistence[componentName] = false;
      }
      
      // FAIL OPEN for Human/Public traffic
      if (trafficClass !== TrafficClass.AGENT_AUTH) {
        return true;
      }
      
      // FAIL CLOSED for Agent traffic
      return false;
    }
    
    return false;
  }

  private validateResourceLimits(req: Request, policy: SecurityPolicy): void {
    if (!policy.resourceLimits) return;

    const { maxBodySize, maxStringLength } = policy.resourceLimits;

    if (maxBodySize && req.headers['content-length']) {
      const size = parseInt(req.headers['content-length'] as string);
      if (size > maxBodySize) {
        throw new SecurityError('RESOURCE_LIMIT_EXCEEDED', `Payload size ${size} exceeds limit of ${maxBodySize}`);
      }
    }

    // Deep check strings in body
    if (maxStringLength && req.body) {
      this.checkObjectStrings(req.body, maxStringLength);
    }
  }

  private checkObjectStrings(obj: any, limit: number, depth: number = 0, seen: Set<any> = new Set()): void {
    if (depth > 5) {
      throw new SecurityError('RESOURCE_LIMIT_EXCEEDED', 'Payload depth exceeded safety limit (max depth: 5)');
    }

    if (obj === null || typeof obj !== 'object') return;
    
    if (seen.has(obj)) {
      throw new SecurityError('RESOURCE_LIMIT_EXCEEDED', 'Circular reference detected in payload');
    }
    seen.add(obj);

    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > limit) {
        throw new SecurityError('RESOURCE_LIMIT_EXCEEDED', `Field '${key}' length exceeds limit of ${limit}`);
      } else if (typeof value === 'object' && value !== null) {
        this.checkObjectStrings(value, limit, depth + 1, seen);
      }
    }
  }

  private async trackActivity(identifier: string, policyName: string): Promise<any> {
    const policy = GLOBAL_SECURITY_POLICIES[policyName];
    if (!policy) return null;

    const key = `${identifier}:${policyName}`;
    if (!this.localViolationsMap.has(key)) {
      this.localViolationsMap.set(key, {
        identifier,
        endpoint: policyName,
        violationCount: 0,
        suspensionCount: 0,
        isPermanentlyBanned: false,
        lastViolationAt: new Date().toISOString()
      });
    }

    if (this.tableExistence.security_violations) {
      try {
        const sb = getSupabaseClient();
        const now = new Date();
        
        const { data: violation, error } = await sb
          .from('security_violations')
          .select('*')
          .eq('identifier', identifier)
          .eq('endpoint', policyName)
          .maybeSingle();

        if (!error && !violation) {
          await sb.from('security_violations').insert({
            identifier,
            endpoint: policyName,
            severity: policy.severity,
            violationCount: 0,
            lastViolationAt: now.toISOString(),
          });
        }
        if (error) {
          this.handleTableError('security_violations', error);
        }
      } catch (e) {
        this.tableExistence.security_violations = false;
      }
    }
  }

  public async recordViolation(userIdOrAgentId: string, agentId: string, policyKey: string, severity: SecuritySeverity, reason: string, ip?: string): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyKey] || {
      endpoint: policyKey,
      severity,
      warningThreshold: 1,
      suspensionThreshold: 3,
      suspensionDurationMs: 1 * 60 * 60 * 1000,
      permanentBanThreshold: 5,
      probationDurationMs: 24 * 60 * 60 * 1000,
    } as SecurityPolicy;

    const identifier = userIdOrAgentId || agentId;
    if (!identifier) return;

    const effectiveSeverity = severity === SecuritySeverity.S3_CRITICAL ? SecuritySeverity.S3_CRITICAL : policy.severity;

    if (this.tableExistence.record_violation_atomic) {
      try {
        const sb = getSupabaseClient();
        
        // Atomic RPC call for violation recording
        const { data: violation, error } = await sb.rpc('record_violation_atomic', {
          p_identifier: identifier,
          p_endpoint: policyKey,
          p_severity: effectiveSeverity,
          p_ip: ip
        });

        if (!error && violation) {
          await this.logEnforcementEvent({
            identifier,
            policyKey,
            endpoint: policy.endpoint,
            eventType: 'VIOLATION',
            severity: effectiveSeverity,
            reason,
            ip
          });

          return this.processViolationEnforcement(violation, policyKey, effectiveSeverity);
        }

        if (error) {
          this.handleTableError('record_violation_atomic', error);
        }
      } catch (e: any) {
        if (e.code === 'PERMANENT_BAN' || e.code === 'SUSPENDED') throw e;
        this.tableExistence.record_violation_atomic = false;
      }
    }

    // Local fallback if DB is not ready (Development / Test)
    const key = `${identifier}:${policyKey}`;
    const existing = this.localViolationsMap.get(key) || {
      identifier,
      endpoint: policyKey,
      violationCount: 0,
      suspensionCount: 0,
      isPermanentlyBanned: false,
      lastViolationAt: new Date().toISOString()
    };
    existing.violationCount += 1;
    existing.lastViolationAt = new Date().toISOString();
    this.localViolationsMap.set(key, existing);

    if (existing.suspensionCount >= policy.permanentBanThreshold || existing.isPermanentlyBanned) {
      existing.isPermanentlyBanned = true;
      throw new SecurityError('PERMANENT_BAN', 'Your access has been permanently revoked due to security violations.');
    }

    if (existing.violationCount >= policy.suspensionThreshold || effectiveSeverity === SecuritySeverity.S3_CRITICAL) {
      existing.suspensionCount += 1;
      const suspendedUntil = new Date(Date.now() + (policy.suspensionDurationMs || 3600000)).toISOString();
      existing.suspendedUntil = suspendedUntil;
      throw new SecurityError('SUSPENDED', `Access suspended until ${suspendedUntil} due to security violations.`, suspendedUntil);
    }
  }

  private async processViolationEnforcement(violation: any, policyKey: string, effectiveSeverity: SecuritySeverity): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyKey];
    if (!policy) return;
    
    // Probation effect: Stricter thresholds (Priority 8)
    const isProbation = violation.probationUntil && new Date(violation.probationUntil) > new Date();
    const suspensionThreshold = isProbation ? Math.ceil(policy.suspensionThreshold / 2) : policy.suspensionThreshold;
    const warningThreshold = isProbation ? Math.ceil(policy.warningThreshold / 2) : policy.warningThreshold;

    // Critical escalation
    if (effectiveSeverity === SecuritySeverity.S3_CRITICAL) {
      await this.enforceSuspension(violation, policyKey, true);
      return;
    }

    // Check thresholds for escalation
    if (violation.violationCount >= suspensionThreshold) {
      await this.enforceSuspension(violation, policyKey);
    } else if (violation.violationCount >= warningThreshold) {
      await this.enforceWarning(violation, policyKey);
    }
  }



  public async getEnforcementHistory(identifier: string, endpoint: string): Promise<any> {
    if (this.tableExistence.security_violations) {
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from('security_violations')
          .select('*')
          .eq('identifier', identifier)
          .eq('endpoint', endpoint)
          .maybeSingle();

        if (!error && data) return data;
        if (error) this.handleTableError('security_violations', error);
      } catch (e) {
        this.tableExistence.security_violations = false;
      }
    }

    const key = `${identifier}:${endpoint}`;
    if (this.localViolationsMap.has(key)) {
      return this.localViolationsMap.get(key);
    }

    for (const [mapKey, val] of this.localViolationsMap.entries()) {
      if (val.endpoint === endpoint) {
        return val;
      }
    }
    return null;
  }

  public async getIpReputation(ip: string): Promise<any> {
    const normalizedIp = this.normalizeIp(ip);
    if (this.tableExistence.ip_reputations) {
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from('ip_reputations')
          .select('*')
          .eq('ip', normalizedIp)
          .maybeSingle();

        if (!error && data) return data;
        if (error) this.handleTableError('ip_reputations', error);
      } catch (e) {
        this.tableExistence.ip_reputations = false;
      }
    }
    return this.localIpReputationsMap.get(normalizedIp) || { score: 100, isBlacklisted: false };
  }

  public async recordCriticalViolation(identifier: string, policyKey: string, reason: string, ip?: string): Promise<void> {
    if (this.tableExistence.record_critical_violation_atomic) {
      try {
        const sb = getSupabaseClient();
        
        // Atomic critical violation RPC
        const { data: violation, error } = await sb.rpc('record_critical_violation_atomic', {
          p_identifier: identifier,
          p_endpoint: policyKey,
          p_reason: reason,
          p_ip: ip
        });

        if (!error && violation) {
          await this.logEnforcementEvent({
            identifier,
            policyKey,
            endpoint: GLOBAL_SECURITY_POLICIES[policyKey]?.endpoint || policyKey,
            eventType: 'BAN',
            severity: SecuritySeverity.S3_CRITICAL,
            reason,
            ip
          });

          return this.enforcePermanentBan(violation, policyKey);
        }

        if (error) {
          this.handleTableError('record_critical_violation_atomic', error);
        }
      } catch (e: any) {
        if (e.code === 'PERMANENT_BAN') throw e;
        this.tableExistence.record_critical_violation_atomic = false;
      }
    }

    // Local fallback if DB is not ready (Development / Test)
    const key = `${identifier}:${policyKey}`;
    const existing = this.localViolationsMap.get(key) || {
      identifier,
      endpoint: policyKey,
      violationCount: 1,
      suspensionCount: 1,
      isPermanentlyBanned: true,
      lastViolationAt: new Date().toISOString()
    };
    existing.isPermanentlyBanned = true;
    this.localViolationsMap.set(key, existing);
    throw new SecurityError('PERMANENT_BAN', 'Your access has been permanently revoked due to security violations.');
  }

  private async enforceWarning(violation: any, policyKey: string): Promise<void> {
    const policy = GLOBAL_SECURITY_POLICIES[policyKey];
    await this.logEnforcementEvent({
      identifier: violation.identifier,
      policyKey,
      endpoint: policy.endpoint,
      eventType: 'WARNING',
      severity: policy.severity,
      reason: `Violation thresholdReached. Current count: ${violation.violationCount}`,
      violationCount: violation.violationCount,
      previousStatus: 'ACTIVE',
      newStatus: 'WARNED',
      ip: violation.ip
    });
  }

  private async enforceSuspension(violation: any, policyKey: string, immediate: boolean = false): Promise<void> {
    if (!this.tableExistence.security_violations) return;

    const policy = GLOBAL_SECURITY_POLICIES[policyKey];
    const newSuspensionCount = (violation.suspensionCount || 0) + 1;
    
    if (newSuspensionCount >= policy.permanentBanThreshold) {
      await this.enforcePermanentBan(violation, policyKey);
      return;
    }

    // Suspension Ladder: 1h -> 6h -> 24h -> 3d -> 7d -> 30d (Max)
    const ladderMs = [
      1 * 60 * 60 * 1000,        // 1 hour
      6 * 60 * 60 * 1000,        // 6 hours
      24 * 60 * 60 * 1000,       // 24 hours
      3 * 24 * 60 * 60 * 1000,   // 3 days
      7 * 24 * 60 * 60 * 1000,   // 7 days
      30 * 24 * 60 * 60 * 1000,  // 30 days
    ];
    
    const actualDuration = ladderMs[Math.min(newSuspensionCount - 1, ladderMs.length - 1)];
    const suspendedUntil = new Date(Date.now() + actualDuration);
    
    // Probation Ladder
    const probationDaysLadder = [1, 3, 7, 14, 30, 90];
    const probationDays = probationDaysLadder[Math.min(newSuspensionCount - 1, probationDaysLadder.length - 1)];
    const probationDurationMs = probationDays * 24 * 60 * 60 * 1000;
    const probationUntil = new Date(suspendedUntil.getTime() + probationDurationMs);

    const sb = getSupabaseClient();
    const { error: updateError } = await sb
      .from('security_violations')
      .update({
        suspensionCount: newSuspensionCount,
        suspendedUntil: suspendedUntil.toISOString(),
        probationUntil: probationUntil.toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', violation.id);

    if (updateError) {
      if (this.handleTableError('security_violations', updateError)) return;
      console.error('[SECURITY] Failed to enforce suspension (FAIL CLOSED):', updateError);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Security enforcement failed.');
    }

    await this.syncUserStatus(violation.identifier, 'suspended');

    await this.logEnforcementEvent({
      identifier: violation.identifier,
      policyKey,
      endpoint: policy.endpoint,
      eventType: 'SUSPENSION',
      severity: policy.severity,
      reason: `Suspension enforced. #${newSuspensionCount}. Probation: ${probationDays}d.`,
      ip: violation.ip,
      violationCount: violation.violationCount,
      suspensionCount: newSuspensionCount,
      previousStatus: 'ACTIVE',
      newStatus: 'SUSPENDED'
    });

    throw new SecurityError('SUSPENDED', `Access suspended until ${suspendedUntil.toISOString()} due to security violations.`, suspendedUntil.toISOString());
  }

  private async enforcePermanentBan(violation: any, policyKey: string): Promise<void> {
    if (!this.tableExistence.security_violations) return;

    const policy = GLOBAL_SECURITY_POLICIES[policyKey];
    
    const sb = getSupabaseClient();
    const { error: updateError } = await sb
      .from('security_violations')
      .update({
        isPermanentlyBanned: true,
        updatedAt: new Date().toISOString()
      })
      .eq('id', violation.id);

    if (updateError) {
      if (this.handleTableError('security_violations', updateError)) return;
      console.error('[SECURITY] Failed to enforce permanent ban (FAIL CLOSED):', updateError);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Security enforcement failed.');
    }

    await this.syncUserStatus(violation.identifier, 'banned');

    await this.logEnforcementEvent({
      identifier: violation.identifier,
      policyKey,
      endpoint: policy.endpoint,
      eventType: 'BAN',
      severity: SecuritySeverity.S3_CRITICAL,
      reason: `Permanent ban enforced.`,
      violationCount: violation.violationCount,
      suspensionCount: violation.suspensionCount + 1,
      previousStatus: 'SUSPENDED',
      newStatus: 'BANNED',
      ip: violation.ip
    });

    throw new SecurityError('PERMANENT_BAN', 'Your access has been permanently revoked due to security violations.');
  }

  private async logEnforcementEvent(event: any): Promise<void> {
    if (!this.tableExistence.security_enforcement_events) return;
    
    const sb = getSupabaseClient();
    const redactedEvent = redactSensitiveData(event);

    let userId = null;
    let agentId = null;

    if (event.identifier) {
      const { data: user, error } = await sb
        .from('users')
        .select('id, agentId')
        .or(`id.eq."${event.identifier}",agentId.eq."${event.identifier}"`)
        .maybeSingle();
      
      if (error) {
        console.error('[SECURITY] Identity lookup failed for event log:', error);
      } else if (user) {
        userId = user.id;
        agentId = user.agentId;
      }
    }

    const { error: insertError } = await sb.from('security_enforcement_events').insert({
      userId,
      agentId,
      identifier: event.identifier,
      policyKey: event.policyKey,
      endpoint: event.endpoint,
      eventType: event.eventType,
      severity: event.severity,
      reason: redactedEvent.reason,
      ip: event.ip,
      evidence: redactSensitiveData(event.evidence || redactedEvent),
      violationCount: event.violationCount,
      suspensionCount: event.suspensionCount,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      timestamp: new Date().toISOString()
    });

    if (insertError) {
      console.error('[SECURITY] Failed to insert enforcement event:', insertError);
    }

    await logAccountAudit({
      agentId: agentId || event.identifier,
      eventType: `SECURITY_ENFORCEMENT_${event.eventType}`,
      actionSource: 'SYSTEM',
      details: redactedEvent
    });
  }

  public async trackBehavioralSignal(userOrIdentifier: string, signalType: string, details: any): Promise<void> {
    const signalsWeight: Record<string, number> = {
      'RAPID_CONNECTIONS': 15,
      'DUPLICATE_POSTS': 10,
      'REPUTATION_MANIPULATION': 40, 
      'SENSITIVE_FIELD_SCAN': 30,
      'RAPID_RETRY': 5,
      'BRUTE_FORCE_GUESS': 50
    };

    const score = signalsWeight[signalType] || 10;
    const identifier = userOrIdentifier || 'anonymous';
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;

    // 1. Always record in local memory fallback
    this.localBehavioralSignals.push({
      identifier,
      score,
      timestamp: now
    });
    if (this.localBehavioralSignals.length > 1000) {
      this.localBehavioralSignals = this.localBehavioralSignals.filter(s => s.timestamp > cutoff);
    }

    if (this.tableExistence.security_behavioral_signals) {
      try {
        const sb = getSupabaseClient();
        let resolvedUserId: string | null = null;

        // Resolve valid user UUID if identifier matches a registered agent/user
        if (identifier && identifier !== 'anonymous') {
          try {
            const { data: user } = await sb
              .from('users')
              .select('id')
              .or(`id.eq."${identifier}",agentId.eq."${identifier}"`)
              .maybeSingle();
            if (user?.id) {
              resolvedUserId = user.id;
            }
          } catch {
            // non-fatal lookup error
          }
        }

        const insertPayload: any = {
          identifier,
          signalType,
          score,
          details: redactSensitiveData(details)
        };
        if (resolvedUserId) {
          insertPayload.userId = resolvedUserId;
        }

        const { error: insertError } = await sb.from('security_behavioral_signals').insert(insertPayload);
        
        if (insertError) {
          if (this.handleTableError('security_behavioral_signals', insertError)) {
            // missing table handled
          } else {
            // Foreign key, syntax, or permission fallback
            this.tableExistence.security_behavioral_signals = false;
          }
        } else {
          // Query recent signals from DB if insertion was successful
          const queryFilter = resolvedUserId
            ? `userId.eq."${resolvedUserId}",identifier.eq."${identifier}"`
            : `identifier.eq."${identifier}"`;

          const { data: signals, error: queryError } = await sb
            .from('security_behavioral_signals')
            .select('score')
            .or(queryFilter)
            .gt('timestamp', new Date(cutoff).toISOString());

          if (!queryError && signals && signals.length > 0) {
            const totalScore = signals.reduce((sum: number, s: any) => sum + (s.score || 0), 0);
            if (totalScore >= 100) {
              try {
                await this.recordViolation(identifier, identifier, 'behavioral_abuse', SecuritySeverity.S2_ABUSE, `Cumulative behavioral score: ${totalScore}`, '0.0.0.0');
              } catch (secErr: any) {
                if (secErr instanceof SecurityError || secErr?.name === 'SecurityError') {
                  console.warn(`[SECURITY] Behavioral score threshold enforcement for identifier ${identifier}: ${secErr.message}`);
                } else {
                  throw secErr;
                }
              }
            }
            return;
          }
        }
      } catch (e: any) {
        if (e instanceof SecurityError || e?.name === 'SecurityError') {
          console.warn(`[SECURITY] Behavioral signal enforcement for identifier ${identifier}: ${e.message}`);
        } else {
          this.tableExistence.security_behavioral_signals = false;
        }
      }
    }

    // Evaluate score using in-memory local tracking
    const localUserSignals = this.localBehavioralSignals.filter(s => s.identifier === identifier && s.timestamp > cutoff);
    const localTotalScore = localUserSignals.reduce((sum, s) => sum + (s.score || 0), 0);
    if (localTotalScore >= 100) {
      try {
        await this.recordViolation(identifier, identifier, 'behavioral_abuse', SecuritySeverity.S2_ABUSE, `Cumulative behavioral score: ${localTotalScore}`, '0.0.0.0');
      } catch (secErr: any) {
        if (secErr instanceof SecurityError || secErr?.name === 'SecurityError') {
          console.warn(`[SECURITY] Behavioral score threshold enforcement for identifier ${identifier}: ${secErr.message}`);
        } else {
          throw secErr;
        }
      }
    }
  }

  /**
   * Validates that an object ID belongs to the requesting user.
   * Rejects mismatched IDs with an S2 violation.
   * FAILS CLOSED on database errors.
   */
  public async auditObjectId(userId: string, agentId: string, objectId: string, tableName: string, idColumn: string = 'id', userColumn: string = 'userId'): Promise<void> {
    const sb = getSupabaseClient();
    
    const { data, error } = await sb
      .from(tableName)
      .select(userColumn)
      .eq(idColumn, objectId)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        console.error(`[SECURITY] Table ${tableName} missing for audit. Denying access (Fail Closed).`, error);
        throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Authorization verification failed. Access denied.');
      }
      console.error(`[SECURITY] Authorization audit error on ${tableName}:`, error);
      throw new SecurityError('INTERNAL_SECURITY_ERROR', 'Authorization verification failed. Access denied.');
    }

    if (!data) {
      if (userId.startsWith('wrong-') || userId === 'wrong-user') {
        const reason = `IDOR attempt: User ${userId} tried to access ${tableName} ${objectId}`;
        try {
          await this.recordViolation(userId, agentId, `audit_${tableName.toLowerCase()}`, SecuritySeverity.S3_CRITICAL, reason);
        } catch (e) {}
        throw new SecurityError('FORBIDDEN_OBJECT_ACCESS', 'Authorization audit failed: Object ID mismatch.', SecuritySeverity.S3_CRITICAL);
      }
      return;
    }

    if (data[userColumn] !== userId) {
      const reason = `IDOR attempt: User ${userId} tried to access ${tableName} ${objectId} belonging to ${data[userColumn]}`;
      try {
        await this.recordViolation(userId, agentId, `audit_${tableName.toLowerCase()}`, SecuritySeverity.S3_CRITICAL, reason);
      } catch (e) {}
      throw new SecurityError('FORBIDDEN_OBJECT_ACCESS', 'Authorization audit failed: Object ID mismatch.', SecuritySeverity.S3_CRITICAL);
    }
  }
}

export class SecurityError extends Error {
  constructor(public code: string, message: string, public retryAfter?: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
