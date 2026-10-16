import { Request, Response, NextFunction } from 'express';
import { logAgentFootprint } from '../services/auditService';
import { floorActivityService } from '../services/floorActivityService';
import { getSupabaseClient } from '../supabase';
import { computeApiKeyFingerprint, verifyAgentAccessToken, verifyHumanSession, HUMAN_SESSION_COOKIE_NAME } from '../authService';
import { MasterAccountService } from '../services/masterAccountService';

export interface SlaveAgentIdentity {
  userId: string;
  agentId: string;
  name: string;
  avatar?: string;
  emailVerified?: boolean;
  masterId: string;
}

/**
 * List of prefixes and exact paths that are strictly human-only.
 * Per requirements: "except the human only endpoints".
 */
const HUMAN_ONLY_PATH_PATTERNS = [
  /^\/(?:v1\/)?auth\/human(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/webauthn(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/forgot-password(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/reset-password(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/change-password(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/change-email(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/verify-email(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/master\/accounts(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/master\/plan(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/master\/buy-plan(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/master\/switch(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/master\/rotate-.*$/i,
  /^\/(?:v1\/)?auth\/master\/undeploy-.*$/i,
  /^\/(?:v1\/)?auth\/master\/delete-.*$/i,
  /^\/(?:v1\/)?auth\/master\/logout-.*$/i,
  /^\/(?:v1\/)?auth\/network-whitelist(?:\/|$)/i,
  /^\/(?:v1\/)?auth\/sessions\/logout-all(?:\/|$)/i,
  /^\/(?:v1\/)?secrets(?:\/|$)/i,
  /^\/(?:v1\/)?account\/access-management(?:\/|$)/i,
  /^\/(?:v1\/)?agents\/me\/e2ee\/recovery(?:\/|$)/i,
];

/**
 * Endpoints that represent internal monitoring or streaming queries.
 * We do not record these to avoid infinite monitoring recursion.
 */
const INTERNAL_MONITORING_PATTERNS = [
  /^\/(?:v1\/)?agent\/footprints(?:\/|$)/i,
  /^\/(?:v1\/)?webhooks\/events(?:\/|$)/i,
  /^\/(?:v1\/)?floor\/activity(?:\/|$)/i,
  /^\/(?:v1\/)?floor\/stream(?:\/|$)/i,
  /^\/(?:v1\/)?realtime\/stream(?:\/|$)/i,
  /^\/(?:v1\/)?realtime\/events(?:\/|$)/i,
  /^\/(?:v1\/)?stats(?:\/|$)/i,
  /^\/(?:v1\/)?health(?:\/|$)/i,
  /^\/(?:v1\/)?readiness(?:\/|$)/i,
  /^\/(?:v1\/)?liveness(?:\/|$)/i,
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|json|html|txt)$/i,
];

export function isHumanOnlyEndpoint(method: string, path: string): boolean {
  const normalizedPath = path.replace(/^\/api/, '');
  for (const pattern of HUMAN_ONLY_PATH_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  // Cluster administration mutations (PATCH, DELETE) are owner-only human operations
  if (/^\/(?:v1\/)?clusters\/[^/]+(?:\/|$)/i.test(normalizedPath)) {
    if (method === 'PATCH' || method === 'DELETE') {
      return true;
    }
  }

  // Deleting connection is human session exclusive
  if (/^\/(?:v1\/)?connections\/[^/]+$/i.test(normalizedPath) && method === 'DELETE') {
    return true;
  }

  return false;
}

export function isInternalMonitoringEndpoint(path: string): boolean {
  const normalizedPath = path.replace(/^\/api/, '');
  for (const pattern of INTERNAL_MONITORING_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves whether the current request is from a slave agent.
 */
export async function detectSlaveAgentIdentity(req: Request): Promise<SlaveAgentIdentity | null> {
  // 1. If req.user is already attached (from requireAgentAuth or requireUserOrAgentAuth)
  const authUser = (req as any).user;
  if (authUser) {
    const isExplicitSlave = Boolean(
      (authUser.master_id && authUser.master_id !== authUser.id) ||
      (authUser.masterUserId && authUser.id !== authUser.masterUserId) ||
      authUser.account_type === 'slave' ||
      authUser.role === 'slave' ||
      authUser.is_slave === true ||
      authUser.isSlave === true ||
      (typeof authUser.email === 'string' && authUser.email.includes('+AMR-'))
    );

    if (isExplicitSlave) {
      return {
        userId: authUser.id,
        agentId: authUser.agentId || authUser.id,
        name: authUser.name || authUser.agentName || authUser.agentId || 'Slave Agent',
        avatar: authUser.avatar,
        emailVerified: Boolean(authUser.emailVerified),
        masterId: authUser.master_id || authUser.masterUserId || authUser.id,
      };
    }
  }

  // 2. Check X-API-KEY header or Bearer sk_amr_... / Bearer amr_live_...
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  let rawToken: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.split(' ')[1];
  }

  const candidateApiKey = (typeof apiKeyHeader === 'string' && apiKeyHeader.trim())
    ? apiKeyHeader.trim()
    : (rawToken && (rawToken.startsWith('sk_amr_') || rawToken.startsWith('amr_live_')))
      ? rawToken.trim()
      : null;

  if (candidateApiKey) {
    try {
      const fingerprint = computeApiKeyFingerprint(candidateApiKey);
      const masterService = MasterAccountService.getInstance();
      let meta = masterService.getUserByFingerprint(fingerprint);

      const supabase = getSupabaseClient();
      let userRec: any = null;

      if (meta?.id) {
        userRec = await masterService.getUserMetadata(meta.id);
      }

      if (!userRec) {
        const { data } = await supabase
          .from('users')
          .select('id, agentId, name, avatar, email, emailVerified, master_id, is_master_primary, account_type, role, is_slave')
          .eq('apiKeyFingerprint', fingerprint)
          .maybeSingle();
        userRec = data;
      }

      if (userRec) {
        const isSlave = Boolean(
          (userRec.master_id && !userRec.is_master_primary) ||
          userRec.account_type === 'slave' ||
          userRec.role === 'slave' ||
          userRec.is_slave === true ||
          (userRec.email && userRec.email.includes('+AMR-'))
        );

        if (isSlave) {
          return {
            userId: userRec.id,
            agentId: userRec.agentId,
            name: userRec.name || userRec.agentId || 'Slave Agent',
            avatar: userRec.avatar,
            emailVerified: Boolean(userRec.emailVerified),
            masterId: userRec.master_id || userRec.id,
          };
        }
      }
    } catch (e) {}
  }

  // 3. Check Bearer Agent Access Token
  if (rawToken && !candidateApiKey) {
    try {
      const payload = verifyAgentAccessToken(rawToken);
      if (payload && payload.type === 'agent' && payload.id) {
        const supabase = getSupabaseClient();
        const { data: userRec } = await supabase
          .from('users')
          .select('id, agentId, name, avatar, email, emailVerified, master_id, is_master_primary, account_type, role, is_slave')
          .eq('id', payload.id)
          .maybeSingle();

        if (userRec) {
          const isSlave = Boolean(
            (userRec.master_id && !userRec.is_master_primary) ||
            userRec.account_type === 'slave' ||
            userRec.role === 'slave' ||
            userRec.is_slave === true ||
            (userRec.email && userRec.email.includes('+AMR-'))
          );

          if (isSlave) {
            return {
              userId: userRec.id,
              agentId: userRec.agentId,
              name: userRec.name || userRec.agentId || 'Slave Agent',
              avatar: userRec.avatar,
              emailVerified: Boolean(userRec.emailVerified),
              masterId: userRec.master_id || userRec.id,
            };
          }
        }
      }
    } catch (e) {}
  }

  // 4. Check human session switched to a slave agent identity
  const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
  if (sessionCookie) {
    try {
      const payload = await verifyHumanSession(sessionCookie);
      if (payload && payload.masterUserId && payload.userId !== payload.masterUserId) {
        const supabase = getSupabaseClient();
        const { data: userRec } = await supabase
          .from('users')
          .select('id, agentId, name, avatar, emailVerified, master_id')
          .eq('id', payload.userId)
          .maybeSingle();

        return {
          userId: payload.userId,
          agentId: userRec?.agentId || payload.userId,
          name: userRec?.name || userRec?.agentId || 'Slave Agent',
          avatar: userRec?.avatar,
          emailVerified: Boolean(userRec?.emailVerified),
          masterId: payload.masterUserId,
        };
      }
    } catch (e) {}
  }

  return null;
}

export function parseEndpointAction(method: string, cleanPath: string): {
  actionName: string;
  floorText: string;
  details: string;
  target?: string;
  type: string;
} {
  const norm = cleanPath.replace(/^\/api/, '');
  const m = method.toUpperCase();





  if (m === 'POST' && norm === '/connections/requests') {
    return {
      actionName: 'CONNECTION_REQUEST_SENT',
      floorText: 'sent a connection handshake request',
      details: 'Requested peer node connection link',
      type: 'request',
    };
  }

  if (m === 'POST' && /^\/connections\/requests\/[^/]+\/accept$/i.test(norm)) {
    return {
      actionName: 'CONNECTION_ESTABLISHED',
      floorText: 'formed a connection with peer',
      details: 'Accepted connection handshake; private link active',
      type: 'connection',
    };
  }

  if (m === 'POST' && /^\/connections(?:\/messages\/[^/]+|\/[^/]+\/messages)$/i.test(norm)) {
    return {
      actionName: 'MESSAGE_SENT',
      floorText: 'transmitted encrypted transmission to peer',
      details: 'Transmitted secure end-to-end encrypted payload',
      type: 'activity',
    };
  }

  if (m === 'GET' && /^\/connections(?:\/messages\/[^/]+|\/[^/]+\/messages)$/i.test(norm)) {
    return {
      actionName: 'MESSAGES_FETCHED',
      floorText: 'synchronized private channel transmissions',
      details: 'Fetched encrypted message history for connection',
      type: 'activity',
    };
  }

  if (m === 'GET' && norm === '/connections') {
    return {
      actionName: 'CONNECTIONS_INSPECTED',
      floorText: 'inspected active connection peer list',
      details: 'Queried authenticated node connection list',
      type: 'activity',
    };
  }





  if (m === 'PUT' && norm === '/agents/me/e2ee') {
    return {
      actionName: 'E2EE_KEYS_UPDATED',
      floorText: 'registered its E2EE cryptographic identity',
      details: 'Updated agent E2EE cryptographic public identity keys',
      type: 'activity',
    };
  }

  if (m === 'PATCH' && norm === '/agents/me') {
    return {
      actionName: 'PROFILE_UPDATED',
      floorText: 'updated its profile',
      details: 'Updated agent profile parameters and metadata',
      type: 'AGENT_PROFILE_UPDATED',
    };
  }



  if (m === 'POST' && norm === '/clusters') {
    return {
      actionName: 'CLUSTER_CREATED',
      floorText: 'created a new Cluster enclave',
      details: 'Provisioned autonomous cluster enclave',
      type: 'cluster',
    };
  }

  if (m === 'POST' && /^\/clusters\/[^/]+\/messages$/i.test(norm)) {
    return {
      actionName: 'CLUSTER_MESSAGE_SENT',
      floorText: 'transmitted an encrypted message inside Cluster enclave',
      details: 'Broadcasted encrypted transmission to cluster members',
      type: 'cluster',
    };
  }

  if (m === 'GET' && /^\/clusters\/[^/]+\/messages$/i.test(norm)) {
    return {
      actionName: 'CLUSTER_MESSAGES_FETCHED',
      floorText: 'synchronized Cluster enclave messages',
      details: 'Fetched encrypted cluster enclave message history',
      type: 'cluster',
    };
  }

  if (m === 'POST' && /^\/clusters\/[^/]+\/join$/i.test(norm)) {
    return {
      actionName: 'CLUSTER_JOINED',
      floorText: 'joined Cluster enclave',
      details: 'Joined cluster enclave as member node',
      type: 'cluster',
    };
  }

  if (m === 'POST' && /^\/clusters\/[^/]+\/invites$/i.test(norm)) {
    return {
      actionName: 'CLUSTER_INVITE_SENT',
      floorText: 'sent an invitation to join Cluster enclave',
      details: 'Dispatched cluster enclave member invitation',
      type: 'cluster',
    };
  }

  // Generic clean format for any other endpoint
  const cleanAction = `${m}_${norm.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`.replace(/_+/g, '_');
  return {
    actionName: cleanAction,
    floorText: `requested ${m} ${cleanPath}`,
    details: `Slave agent executed ${m} ${cleanPath}`,
    type: 'activity',
  };
}

/**
 * Express middleware to record slave agent requests across any non-human-only endpoint.
 * Satisfies: "except the human only endpoints if the slave agent monitor request from any endpoint
 * then I want it to be recorded in the floor activity and the in and out bound activities"
 */
export function slaveActivityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const rawPath = req.originalUrl || req.url;
  const cleanPath = rawPath.split('?')[0];

  // Immediately ignore OPTIONS, HEAD, static assets, and internal monitoring polling
  if (method === 'OPTIONS' || method === 'HEAD') {
    return next();
  }

  // Fast path: bypass static files, Vite internal paths, and root document
  if (
    cleanPath.startsWith('/@') ||
    cleanPath.startsWith('/src/') ||
    cleanPath.startsWith('/assets/') ||
    cleanPath.startsWith('/node_modules/') ||
    cleanPath.startsWith('/public/') ||
    cleanPath === '/' ||
    cleanPath === '/index.html' ||
    cleanPath === '/favicon.ico' ||
    cleanPath.endsWith('.js') ||
    cleanPath.endsWith('.css') ||
    cleanPath.endsWith('.png') ||
    cleanPath.endsWith('.svg') ||
    cleanPath.endsWith('.ico')
  ) {
    return next();
  }

  if (isInternalMonitoringEndpoint(cleanPath)) {
    return next();
  }

  if (isHumanOnlyEndpoint(method, cleanPath)) {
    return next();
  }

  // Intercept completion of response to record activity
  res.on('finish', async () => {
    // Only record successful requests (status < 400)
    if (res.statusCode >= 400) {
      return;
    }

    if ((req as any).alreadyRecordedSlaveActivity) {
      return;
    }

    try {
      const slaveIdentity = await detectSlaveAgentIdentity(req);
      if (!slaveIdentity) {
        return;
      }

      (req as any).alreadyRecordedSlaveActivity = true;

      const action = parseEndpointAction(method, cleanPath);
      const fullEndpoint = `${method} ${cleanPath}`;

      // 1. Record in Floor Activity (Live Stream & Telemetry Floor Activity)
      floorActivityService.recordFloorActivity({
        agentId: slaveIdentity.agentId,
        agentName: slaveIdentity.name || slaveIdentity.agentId,
        avatar: slaveIdentity.avatar || '🤖',
        emailVerified: slaveIdentity.emailVerified,
        text: action.floorText,
        type: action.type,
        createdAt: new Date().toISOString(),
      }).catch((e) => console.warn('[slaveActivityMiddleware] floorActivity error:', e?.message));

      // 2. Record in Outbound Activities (Slave Monitor: Agent Footprints)
      // Save footprint for the Master account's monitor
      logAgentFootprint(
        slaveIdentity.masterId,
        action.actionName,
        action.details,
        action.target || cleanPath,
        slaveIdentity.agentId,
        fullEndpoint
      ).catch((e) => console.warn('[slaveActivityMiddleware] master logAgentFootprint error:', e?.message));

      // Also save footprint under the slave agent's own ID so querying either matches
      if (slaveIdentity.userId && slaveIdentity.userId !== slaveIdentity.masterId) {
        logAgentFootprint(
          slaveIdentity.userId,
          action.actionName,
          action.details,
          action.target || cleanPath,
          slaveIdentity.agentId,
          fullEndpoint
        ).catch((e) => console.warn('[slaveActivityMiddleware] slave logAgentFootprint error:', e?.message));
      }
    } catch (err: any) {
      console.warn('[slaveActivityMiddleware] Error recording slave activity:', err?.message || err);
    }
  });

  next();
}
