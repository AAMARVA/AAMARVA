import { Response } from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { realtimeService } from './realtimeService.js';

export interface WatchtowerActivityRecord {
  id: string;
  activityKey?: string;
  entityId?: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  emailVerified?: boolean;
  text: string;
  type: string;
  category?: 'connection' | 'account' | 'cluster' | 'plan' | 'security' | 'tool' | 'general';
  peerName?: string;
  peerAgentId?: string;
  peerUserId?: string;
  actorRole?: 'master' | 'slave' | 'agent';
  peerRole?: 'master' | 'slave' | 'agent';
  outcome?: 'success' | 'failed' | 'pending' | 'info';
  status?: string;
  cluster?: any;
  post?: any;
  planDetails?: {
    planName?: string;
    actionType?: string;
    accounts?: number;
    amount?: number;
    currency?: string;
    validityDays?: number;
    targetAccountIds?: string[];
  };
  details?: any;
  technicalDetails?: any;
  createdAt: string;
  actorUserId?: string;
  masterId?: string;
  peerMasterId?: string;
  isMasterOnly?: boolean;
}

export type FloorActivityRecord = WatchtowerActivityRecord;

export interface WatchtowerViewerContext {
  userId: string;
  agentId?: string;
  masterId?: string;
  isMaster: boolean;
}

/**
 * Strips all sensitive credentials, secret tokens, password hashes, and private keys.
 */
export function sanitizeStructuredDetails(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeStructuredDetails);

  const sensitiveKeywords = [
    'password', 'passwordhash', 'apikey', 'apikeyhash', 'apikeyfingerprint',
    'secret', 'token', 'refreshtoken', 'privatekey', 'recoverykey',
    'seed', 'credential', 'authheader', 'hash', 'signature'
  ];

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeywords.some((s) => lowerKey.includes(s))) {
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeStructuredDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Builds a deterministic canonical key for activity deduplication across live & historical sources.
 */
export function buildCanonicalKey(
  type: string,
  actor: string,
  peer: string | undefined,
  createdAt: string,
  explicitId?: string
): string {
  const normType = (type || 'activity').toLowerCase().trim();
  const normActor = (actor || 'agent').replace(/^@+/, '').toLowerCase().trim();
  const normPeer = (peer || '').replace(/^@+/, '').toLowerCase().trim();
  const timeMs = new Date(createdAt || Date.now()).getTime();
  const timeBucket10s = Math.floor(timeMs / 10000);

  const cleanId = explicitId ? explicitId.replace(/^(fp_|wt_|conn_|evt_)/, '') : '';
  const isRandomId = !cleanId || cleanId.includes('0.') || cleanId.includes('Math') || cleanId.length < 8;

  if (normType.includes('connection')) {
    const pair = [normActor, normPeer].filter(Boolean).sort().join('<->');
    const action = normType.includes('dissolv') || normType.includes('remov') ? 'dissolved' : 'established';
    return `conn_canon:${pair}:${action}:${timeBucket10s}`;
  }

  if (normType.includes('capability') || normType.includes('plan')) {
    if (!isRandomId) {
      return `plan_canon:${cleanId}`;
    }
    return `plan_canon:${normActor}:${normType}:${timeBucket10s}`;
  }

  if (normType.includes('cluster')) {
    return `cluster_canon:${normActor}:${normType}:${normPeer}:${timeBucket10s}`;
  }

  if (!isRandomId) {
    return `act_canon:${cleanId}`;
  }

  return `act_canon:${normActor}:${normType}:${normPeer}:${timeBucket10s}`;
}

class WatchtowerActivityService {
  private recentActivities: WatchtowerActivityRecord[] = [];
  private sseClients: Map<Response, WatchtowerViewerContext> = new Map();
  private readonly maxActivities = 200;
  private agentMasterCache: Map<string, string> = new Map();

  /**
   * Checks whether a specific activity record is authorized to be viewed by a given viewer.
   * Strict fleet-level isolation:
   * - Master viewer: Can see their own activity and activities within their own fleet of slave agents.
   *   Can NEVER see another master's fleet activity.
   * - Slave viewer: Can ONLY see their own authorized activity and events involving their own node.
   *   Can NEVER see other slaves' private activity or master-only administrative events.
   */
  public isRecordAuthorizedForViewer(record: WatchtowerActivityRecord, viewer?: WatchtowerViewerContext): boolean {
    if (!viewer || !viewer.userId) {
      return false;
    }

    const vUserId = viewer.userId.toLowerCase().trim();
    const vAgentId = viewer.agentId ? viewer.agentId.replace(/^@+/, '').toLowerCase().trim() : '';
    const vMasterId = (viewer.masterId || viewer.userId).toLowerCase().trim();

    const rAgentId = (record.agentId || '').replace(/^@+/, '').toLowerCase().trim();
    const rActorUserId = (record.actorUserId || '').toLowerCase().trim();
    const rMasterId = (record.masterId || '').toLowerCase().trim();
    const rPeerAgentId = (record.peerAgentId || '').replace(/^@+/, '').toLowerCase().trim();
    const rPeerUserId = (record.peerUserId || '').toLowerCase().trim();
    const rPeerMasterId = (record.peerMasterId || '').toLowerCase().trim();

    // 1. If viewer is a Master Account
    if (viewer.isMaster) {
      // Must not see another master's fleet activity unless this master or its fleet is the target/peer
      if (rMasterId && rMasterId !== vMasterId) {
        if (rPeerMasterId && rPeerMasterId === vMasterId) {
          return true;
        }
        const isTarget = (rPeerUserId && rPeerUserId === vUserId) || (vAgentId && rPeerAgentId === vAgentId);
        if (isTarget) {
          return true;
        }
        // If it's a cluster event, allow if this master or its slave is a cluster member
        if (record.cluster && (record.cluster.memberAgentIds || record.cluster.members)) {
          const members: string[] = (record.cluster.memberAgentIds || record.cluster.members || []).map((m: any) =>
            String(typeof m === 'string' ? m : (m.agentId || m.id || '')).replace(/^@+/, '').toLowerCase().trim()
          );
          if ((vAgentId && members.includes(vAgentId)) || (vUserId && members.includes(vUserId))) {
            return true;
          }
        }
        return false;
      }

      // Can see any event where actor's master is this master
      if (rMasterId && rMasterId === vMasterId) {
        return true;
      }

      // Can see any event where peer's master is this master (e.g. inbound transmission to slave)
      if (rPeerMasterId && rPeerMasterId === vMasterId) {
        return true;
      }

      // Can see if master is the direct actor or peer
      if (rActorUserId === vUserId || (vAgentId && rAgentId === vAgentId)) {
        return true;
      }
      if (rPeerUserId === vUserId || (vAgentId && rPeerAgentId === vAgentId)) {
        return true;
      }

      // Cluster membership check for master
      if (record.cluster && (record.cluster.memberAgentIds || record.cluster.members)) {
        const members: string[] = (record.cluster.memberAgentIds || record.cluster.members || []).map((m: any) =>
          String(typeof m === 'string' ? m : (m.agentId || m.id || '')).replace(/^@+/, '').toLowerCase().trim()
        );
        if ((vAgentId && members.includes(vAgentId)) || (vUserId && members.includes(vUserId))) {
          return true;
        }
      }

      return false;
    }

    // 2. If viewer is a Slave Agent Account
    if (record.isMasterOnly) {
      return false;
    }

    if (rActorUserId === vUserId || (vAgentId && rAgentId === vAgentId)) {
      return true;
    }

    if (rPeerUserId === vUserId || (vAgentId && rPeerAgentId === vAgentId)) {
      return true;
    }

    if (record.cluster && (record.cluster.memberAgentIds || record.cluster.members)) {
      const members: string[] = (record.cluster.memberAgentIds || record.cluster.members || []).map((m: any) =>
        String(typeof m === 'string' ? m : (m.agentId || m.id || '')).replace(/^@+/, '').toLowerCase().trim()
      );
      if (vAgentId && members.includes(vAgentId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves the master ID for an agent or user ID with in-memory caching.
   */
  public async resolveMasterIdForActor(agentOrUserId: string): Promise<string | null> {
    if (!agentOrUserId) return null;
    const clean = agentOrUserId.replace(/^@+/, '').toLowerCase().trim();
    if (this.agentMasterCache.has(clean)) {
      return this.agentMasterCache.get(clean)!;
    }

    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('users')
        .select('id, master_id, is_master_primary')
        .or(`agentId.ilike.${clean},id.eq.${clean}`)
        .maybeSingle();

      if (data) {
        const effectiveMaster = (data.master_id && !data.is_master_primary) ? data.master_id : data.id;
        this.agentMasterCache.set(clean, effectiveMaster);
        return effectiveMaster;
      }
    } catch {}

    return null;
  }

  /**
   * Converts any raw event or database row into a structured, human-readable WatchtowerActivityRecord.
   */
  public formatStructuredRecord(
    raw: any,
    agentProfileMap: Record<string, any> = {},
    source: 'live' | 'footprint' | 'external_event' | 'connection' = 'live'
  ): WatchtowerActivityRecord | null {
    if (!raw) return null;

    const id = raw.id || `wt_${crypto.randomUUID()}`;
    const createdAt = raw.createdAt || raw.created_at || new Date().toISOString();
    const rawType = (raw.type || raw.action || 'activity').toUpperCase();

    // Parse details safely
    let parsedDetails: any = raw.details;
    if (typeof parsedDetails === 'string') {
      const trimmed = parsedDetails.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          parsedDetails = JSON.parse(trimmed);
        } catch {}
      }
    }

    const actorUserId = raw.actorUserId || raw.user_id || raw.userId;
    let agentId = raw.agentId || raw.agent_id || (actorUserId ? agentProfileMap[actorUserId]?.agentId : undefined) || 'AGENT';
    agentId = agentId.replace(/^@+/, '');
    const prof = agentProfileMap[actorUserId] || agentProfileMap[agentId.toLowerCase()];

    const agentName = prof?.name || raw.agentName || raw.agent_name || agentId;
    const avatar = prof?.avatar || raw.avatar || '🤖';
    const emailVerified = prof?.emailVerified ?? Boolean(raw.emailVerified);

    let peerAgentId = (raw.peerAgentId || raw.peer_agent_id || raw.target || '').replace(/^@+/, '') || undefined;
    let peerUserId = raw.peerUserId || raw.peer_user_id || undefined;
    let peerName = raw.peerName || raw.peer_name || peerAgentId || undefined;

    if (!peerAgentId && typeof raw.details === 'string') {
      const matchPeer = raw.details.match(/@([a-zA-Z0-9_-]+)/);
      if (matchPeer) {
        peerAgentId = matchPeer[1];
      }
    }
    if (!raw.activityKey && typeof raw.details === 'string') {
      const keyMatch = raw.details.match(/\[key:([^\]]+)\]/);
      if (keyMatch) {
        raw.activityKey = keyMatch[1];
      }
    }

    let category: WatchtowerActivityRecord['category'] = 'general';
    let outcome: WatchtowerActivityRecord['outcome'] = 'info';
    let text = typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim() : '';
    let planDetails: WatchtowerActivityRecord['planDetails'] = raw.planDetails;
    let cluster = raw.cluster;

    // Detect if text is a raw serialized JSON dump (e.g. from external_events)
    const isTextRawJson = text.startsWith('{') && text.endsWith('}') && (text.includes('master_id') || text.includes('validity_days') || text.includes('batch_id'));
    if (isTextRawJson && !parsedDetails) {
      try {
        parsedDetails = JSON.parse(text);
      } catch {}
      text = '';
    }

    // Determine category, outcome, and human-readable text
    if (rawType.includes('CAPABILITY_BATCH') || rawType === 'SLAVE_CAPABILITY_BATCH_ACTIVATED') {
      category = 'plan';
      outcome = 'success';
      const count = parsedDetails?.accounts_count || parsedDetails?.target_account_ids?.length || parsedDetails?.metadata?.accounts_in_transaction || 1;
      const days = parsedDetails?.validity_days || parsedDetails?.metadata?.validity_days_extended || 30;
      text = `Master activated Capability Increment (+${days} Days) for ${count} slave account${count === 1 ? '' : 's'}`;
      planDetails = {
        planName: 'Capability Increment Plan',
        actionType: 'capability_increment',
        accounts: count,
        validityDays: days,
        targetAccountIds: parsedDetails?.target_account_ids || []
      };
    } else if (rawType.includes('CAPABILITY') || rawType === 'SLAVE_CAPABILITY_ACTIVATED') {
      category = 'plan';
      outcome = 'success';
      const days = parsedDetails?.validity_days || parsedDetails?.metadata?.validity_days_extended || 30;
      const targetAccount = peerAgentId || parsedDetails?.agent_id || parsedDetails?.user_id || agentId;
      text = `Activated Capability Increment (+${days} Days) for @${targetAccount.replace(/^@+/, '')}`;
      planDetails = {
        planName: 'Capability Increment Plan',
        actionType: 'capability_increment',
        accounts: 1,
        validityDays: days
      };
    } else if (rawType.includes('PLAN_ENTITLEMENT') || rawType === 'PLAN_ENTITLEMENT_ACTIVATED') {
      category = 'plan';
      outcome = 'success';
      const planName = parsedDetails?.plan_name || 'Master & Slave Agent Plan';
      const allowance = parsedDetails?.allowance_accounts || 10;
      const actionType = parsedDetails?.metadata?.action_type || parsedDetails?.action_type || 'activation';
      const added = parsedDetails?.metadata?.added_accounts || parsedDetails?.metadata?.accounts_bought || 0;
      if (actionType === 'add_accounts' || added > 0) {
        text = `Master expanded fleet capacity (+${added || 10} Accounts, ${allowance} total)`;
      } else {
        text = `Master activated ${planName} (${allowance} Accounts total)`;
      }
      planDetails = {
        planName,
        actionType,
        accounts: allowance,
        amount: parsedDetails?.metadata?.amount,
        currency: 'USD'
      };
    } else if (rawType === 'CONNECTION_ESTABLISHED' || rawType === 'CONNECTION_ACCEPTED_BY_TARGET' || rawType === 'CONNECTION' || rawType === 'CONNECTION_CREATED' || rawType === 'CONNECTION_FORMED') {
      category = 'connection';
      outcome = 'success';
      const peer = peerAgentId || raw.target || parsedDetails?.sender_id || parsedDetails?.peerAgentId || 'peer';
      text = `@${agentId} formed a connection with peer @${peer.replace(/^@+/, '')}`;
      peerAgentId = peer.replace(/^@+/, '');
    } else if (rawType === 'CONNECTION_REMOVED' || rawType === 'CONNECTION_DISSOLVED') {
      category = 'connection';
      outcome = 'info';
      const peer = peerAgentId || raw.target || parsedDetails?.sender_id || parsedDetails?.peerAgentId || 'peer';
      text = `@${agentId} removed its connection with @${peer.replace(/^@+/, '')}`;
      peerAgentId = peer.replace(/^@+/, '');
    } else if (rawType === 'CONNECTION_REQUEST_SENT') {
      category = 'connection';
      outcome = 'pending';
      const peer = peerAgentId || raw.target || 'peer';
      text = `@${agentId} sent a connection request to @${peer.replace(/^@+/, '')}`;
      peerAgentId = peer.replace(/^@+/, '');
    } else if (rawType === 'SLAVE_CREATED' || rawType === 'SLAVE_DEPLOYED' || rawType === 'AGENT_REGISTERED') {
      category = 'account';
      outcome = 'success';
      if (peerAgentId && peerAgentId !== agentId) {
        text = `Master deployed slave account @${peerAgentId.replace(/^@+/, '')}`;
      } else if (raw.isMasterOnly || raw.masterId) {
        text = `Master deployed slave account @${agentId}`;
      } else {
        text = `@${agentId} registered on the floor`;
      }
    } else if (rawType === 'SLAVE_UNDEPLOYED' || rawType === 'SLAVE_DELETED') {
      category = 'account';
      outcome = 'info';
      const targetAccount = peerAgentId || agentId;
      text = `Master undeployed slave account @${targetAccount.replace(/^@+/, '')}`;
    } else if (rawType === 'API_KEY_ROTATED' || rawType === 'API_KEY_ROTATION_REQUESTED') {
      category = 'security';
      outcome = 'success';
      const targetAccount = peerAgentId || agentId;
      text = `API key rotated for @${targetAccount.replace(/^@+/, '')}`;
    } else if (rawType === 'E2EE_KEYS_UPDATED' || rawType === 'INITIALIZE_SLAVE_E2EE') {
      category = 'security';
      outcome = 'success';
      const targetAccount = peerAgentId || agentId;
      text = `@${targetAccount.replace(/^@+/, '')} updated encryption identity`;
    } else if (rawType === 'WHITELIST_UPDATED') {
      category = 'security';
      outcome = 'success';
      const count = parsedDetails?.networksCount || (Array.isArray(parsedDetails?.whitelisted_networks) ? parsedDetails.whitelisted_networks.length : undefined);
      text = count ? `Updated network access perimeter (${count} networks configured)` : `Updated network access perimeter`;
    } else if (rawType === 'CLUSTER_CREATED') {
      category = 'cluster';
      outcome = 'success';
      const cName = cluster?.name || parsedDetails?.name || 'Cluster';
      text = `@${agentId} created cluster "${cName}"`;
    } else if (rawType === 'CLUSTER_MEMBER_ADDED' || rawType === 'CLUSTER_JOINED') {
      category = 'cluster';
      outcome = 'success';
      const cName = cluster?.name || parsedDetails?.name || 'Cluster';
      if (peerAgentId && peerAgentId !== agentId) {
        text = `@${agentId} added @${peerAgentId.replace(/^@+/, '')} to cluster "${cName}"`;
      } else {
        text = `@${agentId} joined cluster "${cName}"`;
      }
    } else if (rawType === 'CLUSTER_MEMBER_REMOVED' || rawType === 'CLUSTER_LEFT' || rawType === 'CLUSTER_DISBANDED') {
      category = 'cluster';
      outcome = 'info';
      const cName = cluster?.name || parsedDetails?.name || 'Cluster';
      if (rawType === 'CLUSTER_DISBANDED') {
        text = `@${agentId} disbanded cluster "${cName}"`;
      } else if (peerAgentId && peerAgentId !== agentId) {
        text = `@${agentId} removed @${peerAgentId.replace(/^@+/, '')} from cluster "${cName}"`;
      } else {
        text = `@${agentId} left cluster "${cName}"`;
      }
    } else if (rawType === 'CLUSTER_MESSAGE_SENT' || rawType === 'CLUSTER_MESSAGE_RECEIVED') {
      category = 'cluster';
      outcome = 'success';
      const cName = cluster?.name || parsedDetails?.name || 'Cluster';
      text = `@${agentId} sent a message in cluster "${cName}"`;
    } else if (rawType === 'MESSAGE_SENT' || rawType === 'MESSAGE_RECEIVED') {
      category = 'general';
      outcome = 'success';
      const peer = peerAgentId || 'peer';
      text = rawType === 'MESSAGE_SENT'
        ? `@${agentId} transmitted encrypted message to @${peer.replace(/^@+/, '')}`
        : `@${agentId} received encrypted message from @${peer.replace(/^@+/, '')}`;
    } else if (rawType === 'PROFILE_UPDATED' || rawType === 'AGENT_PROFILE_UPDATED') {
      category = 'account';
      outcome = 'success';
      text = `@${agentId} updated its profile`;
    } else if (rawType.includes('TOOL') || rawType.includes('MCP')) {
      category = 'tool';
      outcome = 'success';
      const toolName = parsedDetails?.toolName || parsedDetails?.toolId || 'Tool';
      text = `@${agentId} invoked tool "${toolName}"`;
    } else if (!text) {
      // Safe fallback for unclassified records: readable summary, never raw JSON
      if (parsedDetails && typeof parsedDetails === 'object') {
        const actionLabel = parsedDetails.action || parsedDetails.event || rawType.replace(/_/g, ' ').toLowerCase();
        text = `@${agentId} completed ${actionLabel}`;
      } else {
        text = `@${agentId} executed ${rawType.replace(/_/g, ' ').toLowerCase()}`;
      }
    }

    // Clean any lingering technical brackets or serialized JSON in text
    if (text.startsWith('{') && text.endsWith('}')) {
      text = `@${agentId} performed fleet operation (${rawType.toLowerCase()})`;
    }

    const activityKey = raw.activityKey || buildCanonicalKey(rawType, agentId, peerAgentId, createdAt, raw.id);
    const sanitizedTechDetails = sanitizeStructuredDetails(typeof parsedDetails === 'object' ? parsedDetails : undefined);

    return {
      id,
      activityKey,
      entityId: raw.entityId,
      agentId,
      agentName,
      avatar,
      emailVerified,
      text,
      type: rawType,
      category,
      peerName,
      peerAgentId,
      peerUserId,
      actorRole: raw.actorRole,
      peerRole: raw.peerRole,
      outcome,
      status: raw.status || (outcome === 'success' ? 'ACTIVE' : undefined),
      cluster,
      post: raw.post,
      planDetails,
      details: sanitizedTechDetails,
      technicalDetails: sanitizedTechDetails,
      createdAt,
      actorUserId,
      masterId: raw.masterId,
      peerMasterId: raw.peerMasterId,
      isMasterOnly: Boolean(raw.isMasterOnly)
    };
  }

  /**
   * Records a new activity on Watchtower and broadcasts it via SSE to all authorized clients.
   */
  public async recordWatchtowerActivity(activity: Partial<WatchtowerActivityRecord> & { text: string }): Promise<WatchtowerActivityRecord> {
    const id = activity.id || `wt_${crypto.randomUUID()}`;
    const createdAt = activity.createdAt || new Date().toISOString();

    let masterId = activity.masterId;
    if (!masterId && (activity.agentId || activity.actorUserId)) {
      masterId = await this.resolveMasterIdForActor(activity.actorUserId || activity.agentId || '') || undefined;
    }

    let peerMasterId = activity.peerMasterId;
    if (!peerMasterId && (activity.peerUserId || activity.peerAgentId)) {
      peerMasterId = await this.resolveMasterIdForActor(activity.peerUserId || activity.peerAgentId || '') || undefined;
    }

    const record = this.formatStructuredRecord({
      ...activity,
      id,
      masterId,
      peerMasterId,
      createdAt
    })!;

    // Store in ring buffer, deduplicating if identical activityKey exists
    const existingIndex = this.recentActivities.findIndex(
      (a) => (a.activityKey && a.activityKey === record.activityKey) || a.id === record.id
    );

    if (existingIndex >= 0) {
      this.recentActivities[existingIndex] = record;
    } else {
      this.recentActivities.unshift(record);
      if (this.recentActivities.length > this.maxActivities) {
        this.recentActivities.pop();
      }
    }

    // Broadcast SSE event to all connected watchtower/floor stream clients that are authorized to view it
    const payloadWatchtower = `event: watchtower_activity\ndata: ${JSON.stringify(record)}\n\n`;
    const payloadFloor = `event: floor_activity\ndata: ${JSON.stringify(record)}\n\n`;

    for (const [client, viewer] of Array.from(this.sseClients.entries())) {
      try {
        if (this.isRecordAuthorizedForViewer(record, viewer)) {
          client.write(payloadWatchtower);
          client.write(payloadFloor);
        }
      } catch (err) {
        this.sseClients.delete(client);
      }
    }

    // Persist in agent_footprints with stable ID and readable text
    try {
      if (record.actorUserId || record.masterId) {
        const supabase = getSupabaseClient();
        const targetUserId = record.actorUserId || record.masterId;
        if (targetUserId) {
          supabase.from('agent_footprints').insert({
            id: record.id.startsWith('fp_') ? record.id : `fp_${record.id}`,
            user_id: targetUserId,
            agent_id: record.agentId,
            action: record.type.toUpperCase(),
            details: record.text,
            target: record.peerAgentId || record.entityId || null,
            created_at: record.createdAt,
          }).then(() => {}).catch(() => {});
        }
      }
    } catch (e) {}

    // Notify realtime service if agent is known
    try {
      if (record.agentId) {
        realtimeService.notifyAccount(record.agentId, {
          id: record.id,
          type: record.type,
          category: 'event',
          actorId: record.agentId,
          accountId: record.agentId,
          details: record.text,
          timestamp: createdAt,
        });
      }
    } catch (e) {}

    return record;
  }

  public async recordFloorActivity(activity: Partial<WatchtowerActivityRecord> & { text: string }): Promise<WatchtowerActivityRecord> {
    return this.recordWatchtowerActivity(activity);
  }

  /**
   * Fetches persistent historical activities for an authenticated viewer from Supabase,
   * merges with in-memory activities, deduplicates, and returns the sorted list.
   */
  public async fetchWatchtowerActivitiesForViewer(viewer?: WatchtowerViewerContext): Promise<WatchtowerActivityRecord[]> {
    if (!viewer || !viewer.userId) {
      return [];
    }

    const supabase = getSupabaseClient();
    const vUserId = viewer.userId;
    const vMasterId = viewer.masterId || viewer.userId;
    const isMaster = viewer.isMaster;

    // 1. Resolve fleet user IDs and agent IDs
    const fleetUserIds = [vUserId];
    const fleetAgentIds = viewer.agentId ? [viewer.agentId] : [];
    const agentProfileMap: Record<string, { name: string; avatar?: string; agentId?: string; emailVerified?: boolean; role?: 'master' | 'slave' }> = {};

    try {
      if (isMaster) {
        const { data: slaves } = await supabase
          .from('users')
          .select('id, agentId, name, avatar, emailVerified')
          .eq('master_id', vMasterId);

        if (slaves && Array.isArray(slaves)) {
          slaves.forEach((s: any) => {
            if (s.id) fleetUserIds.push(s.id);
            if (s.agentId) fleetAgentIds.push(s.agentId);
            agentProfileMap[s.id] = {
              name: s.name || s.agentId || 'Slave Agent',
              avatar: s.avatar,
              agentId: s.agentId,
              emailVerified: Boolean(s.emailVerified),
              role: 'slave'
            };
            if (s.agentId) {
              agentProfileMap[s.agentId.toLowerCase()] = agentProfileMap[s.id];
            }
          });
        }
      }

      // Viewer user profile
      const { data: viewerUser } = await supabase
        .from('users')
        .select('id, agentId, name, avatar, emailVerified, account_type, is_master_primary')
        .eq('id', vUserId)
        .maybeSingle();

      if (viewerUser) {
        agentProfileMap[viewerUser.id] = {
          name: viewerUser.name || viewerUser.agentId || (isMaster ? 'Master Account' : 'Operator'),
          avatar: viewerUser.avatar,
          agentId: viewerUser.agentId,
          emailVerified: Boolean(viewerUser.emailVerified),
          role: isMaster ? 'master' : 'slave'
        };
        if (viewerUser.agentId) {
          agentProfileMap[viewerUser.agentId.toLowerCase()] = agentProfileMap[viewerUser.id];
        }
      }
    } catch (e) {}

    const historicalRecords: WatchtowerActivityRecord[] = [];

    // 2. Query persistent agent_footprints
    try {
      let fpQuery = supabase.from('agent_footprints').select('*');
      if (isMaster) {
        if (fleetUserIds.length === 1) {
          fpQuery = fpQuery.eq('user_id', fleetUserIds[0]);
        } else {
          fpQuery = fpQuery.in('user_id', fleetUserIds);
        }
      } else {
        fpQuery = fpQuery.eq('user_id', vUserId);
      }

      const { data: footprints, error: fpErr } = await fpQuery
        .order('created_at', { ascending: false })
        .limit(100);

      if (!fpErr && footprints && Array.isArray(footprints)) {
        for (const fp of footprints) {
          const formatted = this.formatStructuredRecord(
            {
              ...fp,
              masterId: vMasterId,
              actorUserId: fp.user_id || fp.userId,
              peerAgentId: fp.target,
              type: fp.action
            },
            agentProfileMap,
            'footprint'
          );
          if (formatted) {
            historicalRecords.push(formatted);
          }
        }
      }
    } catch (e) {}

    // 3. Query persistent external_events (inbound & audit events)
    try {
      let evtQuery = supabase.from('external_events').select('*');
      if (isMaster) {
        if (fleetUserIds.length === 1) {
          evtQuery = evtQuery.eq('user_id', fleetUserIds[0]);
        } else {
          evtQuery = evtQuery.in('user_id', fleetUserIds);
        }
      } else {
        evtQuery = evtQuery.eq('user_id', vUserId);
      }

      const { data: extEvents, error: evtErr } = await evtQuery
        .order('created_at', { ascending: false })
        .limit(100);

      if (!evtErr && extEvents && Array.isArray(extEvents)) {
        for (const ev of extEvents) {
          const uId = ev.user_id || ev.userId;
          const formatted = this.formatStructuredRecord(
            {
              ...ev,
              masterId: vMasterId,
              actorUserId: uId,
              peerAgentId: ev.sender_id || ev.senderId,
              type: ev.type || ev.event_type || ev.action
            },
            agentProfileMap,
            'external_event'
          );
          if (formatted) {
            historicalRecords.push(formatted);
          }
        }
      }
    } catch (e) {}

    // 4. Query connections table
    try {
      const orClauses = fleetUserIds.map((uid) => `user1_id.eq.${uid},user2_id.eq.${uid}`).join(',');
      const { data: conns, error: connErr } = await supabase
        .from('connections')
        .select('*')
        .or(orClauses)
        .order('createdAt', { ascending: false })
        .limit(50);

      if (!connErr && conns && Array.isArray(conns)) {
        for (const c of conns) {
          const u1 = c.user1_id || c.postOwnerUserId;
          const u2 = c.user2_id || c.replyAuthorUserId;
          const a1 = c.user1_agent_id || c.postOwnerAgentId || 'Node';
          const a2 = c.user2_agent_id || c.replyAuthorAgentId || 'Peer';

          // If viewer or viewer's fleet is user1, actor is a1 and peer is a2. Otherwise actor is a2 and peer is a1.
          const isUser1Fleet = fleetUserIds.includes(u1) || (viewer.agentId && a1.toLowerCase() === viewer.agentId.toLowerCase());
          const actorAgentId = isUser1Fleet ? a1 : a2;
          const peerAgentId = isUser1Fleet ? a2 : a1;
          const actorUserId = isUser1Fleet ? u1 : u2;
          const peerUserId = isUser1Fleet ? u2 : u1;
          const isDissolved = c.status === 'dissolved';

          const formatted = this.formatStructuredRecord(
            {
              id: `conn_${c.id}`,
              action: isDissolved ? 'CONNECTION_REMOVED' : 'CONNECTION_ESTABLISHED',
              type: 'connection',
              agentId: actorAgentId,
              peerAgentId,
              actorUserId,
              peerUserId,
              masterId: vMasterId,
              status: c.status,
              createdAt: c.createdAt || c.created_at
            },
            agentProfileMap,
            'connection'
          );

          if (formatted) {
            historicalRecords.push(formatted);
          }
        }
      }
    } catch (e) {}

    // 5. Merge in-memory recent activities with historical records
    const inMemoryFiltered = this.recentActivities.filter((a) => this.isRecordAuthorizedForViewer(a, viewer));

    // Combine and deduplicate
    const combined = [...inMemoryFiltered, ...historicalRecords];
    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();
    const deduplicated: WatchtowerActivityRecord[] = [];

    for (const item of combined) {
      if (!item || !item.text) continue;
      const cleanId = item.id ? item.id.replace(/^(fp_|wt_|conn_|evt_|sf_)/, '').trim().toLowerCase() : '';
      const canonicalKey = buildCanonicalKey(item.type, item.agentId, item.peerAgentId, item.createdAt, item.id);
      const customKey = item.activityKey ? item.activityKey.toLowerCase() : '';

      if (cleanId && cleanId.length >= 8 && seenIds.has(cleanId)) {
        continue;
      }
      if (customKey && seenKeys.has(customKey)) {
        continue;
      }
      if (canonicalKey && seenKeys.has(canonicalKey)) {
        continue;
      }

      if (cleanId && cleanId.length >= 8) {
        seenIds.add(cleanId);
      }
      if (customKey) {
        seenKeys.add(customKey);
      }
      if (canonicalKey) {
        seenKeys.add(canonicalKey);
      }

      if (this.isRecordAuthorizedForViewer(item, viewer)) {
        deduplicated.push(item);
      }
    }

    // Sort chronologically descending
    deduplicated.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Update recent ring buffer with newly formatted unique records
    for (const d of deduplicated.slice(0, this.maxActivities)) {
      const idx = this.recentActivities.findIndex(
        (a) => (a.activityKey && a.activityKey === d.activityKey) || a.id === d.id
      );
      if (idx === -1) {
        this.recentActivities.push(d);
      }
    }
    this.recentActivities.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (this.recentActivities.length > this.maxActivities) {
      this.recentActivities.splice(this.maxActivities);
    }

    return deduplicated.slice(0, 100);
  }

  /**
   * Returns a scoped copy of recent watchtower activities for an authenticated viewer.
   */
  public getRecentWatchtowerActivity(viewer?: WatchtowerViewerContext): WatchtowerActivityRecord[] {
    if (!viewer || !viewer.userId) {
      return [];
    }
    return this.recentActivities.filter((a) => this.isRecordAuthorizedForViewer(a, viewer));
  }

  public getRecentFloorActivity(viewer?: WatchtowerViewerContext): WatchtowerActivityRecord[] {
    return this.getRecentWatchtowerActivity(viewer);
  }

  /**
   * Registers an authenticated client for Server-Sent Events (SSE).
   */
  public registerWatchtowerStreamClient(res: Response, viewer: WatchtowerViewerContext): void {
    this.sseClients.set(res, viewer);

    try {
      const authorizedRecent = this.getRecentWatchtowerActivity(viewer).slice(0, 50);
      const handshake = `event: handshake\ndata: ${JSON.stringify({
        status: 'CONNECTED',
        recent: authorizedRecent,
      })}\n\n`;
      res.write(handshake);
    } catch (err) {
      this.sseClients.delete(res);
      return;
    }

    res.on('close', () => {
      this.sseClients.delete(res);
    });

    res.on('error', () => {
      this.sseClients.delete(res);
    });
  }

  public registerFloorStreamClient(res: Response, viewer?: WatchtowerViewerContext): void {
    if (viewer) {
      return this.registerWatchtowerStreamClient(res, viewer);
    }
  }

  /**
   * Terminates any active SSE streams for a specific user ID upon session revocation or logout.
   */
  public invalidateStreamsForUser(userId: string): void {
    if (!userId) return;
    const clean = userId.toLowerCase().trim();
    for (const [client, viewer] of Array.from(this.sseClients.entries())) {
      if (viewer.userId.toLowerCase().trim() === clean || (viewer.masterId && viewer.masterId.toLowerCase().trim() === clean)) {
        try {
          client.write(`event: stream_revoked\ndata: {"status":"REVOKED","message":"Session revoked"}\n\n`);
          client.end();
        } catch {}
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Resolves agent metadata (name, avatar, emailVerified) by agentId or userId.
   */
  public async resolveAgentMeta(identifier: string): Promise<{ name?: string; avatar?: string; emailVerified?: boolean } | null> {
    if (!identifier) return null;
    try {
      const supabase = getSupabaseClient();
      const cleanId = identifier.trim().replace(/^@/, '');
      const { data } = await supabase
        .from('users')
        .select('name, avatar, emailVerified')
        .or(`agentId.ilike.${cleanId},id.eq.${cleanId}`)
        .maybeSingle();

      if (data) {
        return {
          name: data.name,
          avatar: data.avatar,
          emailVerified: Boolean(data.emailVerified),
        };
      }
    } catch (e) {}
    return null;
  }

  private streamTickets: Map<string, { viewer: WatchtowerViewerContext; expiresAt: number }> = new Map();

  public createStreamTicket(viewer: WatchtowerViewerContext): string {
    const ticket = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 1000; // 60s TTL
    this.streamTickets.set(ticket, { viewer, expiresAt });
    return ticket;
  }

  public redeemStreamTicket(ticket: string): WatchtowerViewerContext | null {
    if (!ticket || typeof ticket !== 'string') return null;
    const clean = ticket.trim();
    const entry = this.streamTickets.get(clean);
    if (!entry) return null;
    this.streamTickets.delete(clean);
    if (Date.now() > entry.expiresAt) return null;
    return entry.viewer;
  }
}

export const watchtowerActivityService = new WatchtowerActivityService();
export const floorActivityService = watchtowerActivityService;
export { WatchtowerActivityService as FloorActivityService };
