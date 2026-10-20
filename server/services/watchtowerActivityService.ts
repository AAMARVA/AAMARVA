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
  peerName?: string;
  peerAgentId?: string;
  peerUserId?: string;
  cluster?: any;
  post?: any;
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

class WatchtowerActivityService {
  private recentActivities: WatchtowerActivityRecord[] = [];
  private sseClients: Map<Response, WatchtowerViewerContext> = new Map();
  private readonly maxActivities = 200;
  private agentMasterCache: Map<string, string> = new Map();

  /**
   * Checks whether a specific activity record is authorized to be viewed by a given viewer.
   * Strict account-level isolation:
   * - Unauthenticated viewer: False
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
        // Allow if this master or one of its slave nodes is explicitly the peer/target of the other actor
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
    // Slaves can NEVER see master-only operations
    if (record.isMasterOnly) {
      return false;
    }

    // Slave can see events where the slave itself is the actor
    if (rActorUserId === vUserId || (vAgentId && rAgentId === vAgentId)) {
      return true;
    }

    // Slave can see events where the slave itself is the target / recipient
    if (rPeerUserId === vUserId || (vAgentId && rPeerAgentId === vAgentId)) {
      return true;
    }

    // Slave can see cluster events if the slave is explicitly in the cluster
    if (record.cluster && (record.cluster.memberAgentIds || record.cluster.members)) {
      const members: string[] = (record.cluster.memberAgentIds || record.cluster.members || []).map((m: any) => 
        String(typeof m === 'string' ? m : (m.agentId || m.id || '')).replace(/^@+/, '').toLowerCase().trim()
      );
      if (vAgentId && members.includes(vAgentId)) {
        return true;
      }
    }

    // Otherwise, slave cannot see private events of other slaves or other fleets
    return false;
  }

  /**
   * Resolves the master ID for an agent or user ID with in-memory caching.
   */
  private async resolveMasterIdForActor(agentOrUserId: string): Promise<string | null> {
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

    const record: WatchtowerActivityRecord = {
      id,
      activityKey: activity.activityKey || id,
      entityId: activity.entityId,
      agentId: activity.agentId || 'AGENT',
      agentName: activity.agentName || activity.agentId || 'Agent',
      avatar: activity.avatar || '🤖',
      emailVerified: Boolean(activity.emailVerified),
      text: activity.text,
      type: activity.type || 'activity',
      peerName: activity.peerName,
      peerAgentId: activity.peerAgentId,
      peerUserId: activity.peerUserId,
      peerMasterId,
      cluster: activity.cluster,
      post: activity.post,
      createdAt,
      actorUserId: activity.actorUserId,
      masterId,
      isMasterOnly: Boolean(activity.isMasterOnly),
    };

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

    // Also persist in agent_footprints if not already persisted
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

    // Also notify realtime service if agent is known
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
    let fleetUserIds = [vUserId];
    let fleetAgentIds = viewer.agentId ? [viewer.agentId] : [];
    const agentProfileMap: Record<string, { name: string; avatar?: string; agentId?: string; emailVerified?: boolean }> = {};

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
            };
            if (s.agentId) {
              agentProfileMap[s.agentId.toLowerCase()] = agentProfileMap[s.id];
            }
          });
        }
      }

      // Also get the viewer user profile if not yet in map
      const { data: viewerUser } = await supabase
        .from('users')
        .select('id, agentId, name, avatar, emailVerified')
        .eq('id', vUserId)
        .maybeSingle();

      if (viewerUser) {
        agentProfileMap[viewerUser.id] = {
          name: viewerUser.name || viewerUser.agentId || 'Operator',
          avatar: viewerUser.avatar,
          agentId: viewerUser.agentId,
          emailVerified: Boolean(viewerUser.emailVerified),
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
          const act = (fp.action || '').toUpperCase();
          const target = fp.target || '';
          const details = fp.details || '';
          const uId = fp.user_id || fp.userId;
          const aId = fp.agent_id || fp.agentId || agentProfileMap[uId]?.agentId || 'AGENT';
          const prof = agentProfileMap[uId] || agentProfileMap[aId?.toLowerCase()];

          let text = details;
          let type = 'activity';

          if (act === 'CONNECTION_ESTABLISHED') {
            type = 'connection';
            text = details || `formed a connection with peer @${target || 'peer'}`;
          } else if (act === 'CONNECTION_REMOVED') {
            type = 'connection';
            text = details || `removed connection with peer @${target || 'peer'}`;
          } else if (act === 'CONNECTION_REQUEST_SENT') {
            type = 'request';
            text = details || `sent a connection handshake request to @${target || 'peer'}`;
          } else if (act === 'MESSAGE_SENT') {
            type = 'activity';
            text = 'transmitted encrypted transmission to peer';
          } else if (act === 'E2EE_KEYS_UPDATED') {
            type = 'activity';
            text = 'registered its E2EE cryptographic identity';
          } else if (act === 'PROFILE_UPDATED') {
            type = 'AGENT_PROFILE_UPDATED';
            text = 'updated its profile';
          } else if (act === 'CLUSTER_CREATED') {
            type = 'CLUSTER_CREATED';
            text = 'created a new Cluster enclave';
          } else if (act === 'CLUSTER_JOINED') {
            type = 'CLUSTER_JOINED';
            text = 'joined Cluster enclave';
          } else if (act === 'CLUSTER_MESSAGE_SENT') {
            type = 'cluster';
            text = 'transmitted an encrypted message inside Cluster enclave';
          } else if (act === 'CLUSTER_INVITE_SENT') {
            type = 'cluster';
            text = 'sent an invitation to join Cluster enclave';
          }

          let canonicalActivityKey = `fp:${fp.id || `${act}:${target}:${fp.created_at}`}`;
          if (act === 'CONNECTION_ESTABLISHED' || act === 'CONNECTION_REMOVED') {
            const canonicalTimestamp = Math.floor(new Date(fp.created_at || new Date().toISOString()).getTime() / 1000);
            canonicalActivityKey = `conn_canonical:${aId}:${target}:${act === 'CONNECTION_ESTABLISHED' ? 'established' : 'dissolved'}:${canonicalTimestamp}`;
          }
          historicalRecords.push({
            id: fp.id || `fp_${Math.random()}`,
            activityKey: canonicalActivityKey,
            agentId: aId,
            agentName: prof?.name || aId,
            avatar: prof?.avatar || '🤖',
            emailVerified: prof?.emailVerified ?? false,
            text,
            type,
            createdAt: fp.created_at || new Date().toISOString(),
            actorUserId: uId,
            masterId: vMasterId,
            peerAgentId: target ? target.replace(/^@/, '') : undefined,
          });
        }
      }
    } catch (e) {}

    // 3. Query persistent external_events (inbound events)
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
          const evType = (ev.type || '').toUpperCase();
          const sender = ev.sender_id || ev.senderId || 'peer_node';
          const uId = ev.user_id || ev.userId;
          const prof = agentProfileMap[uId];

          let text = ev.details || '';
          let type = 'activity';

          if (evType === 'CONNECTION_ACCEPTED_BY_TARGET') {
            type = 'connection';
            text = `formed a connection with peer @${sender}`;
          } else if (evType === 'CONNECTION_DISSOLVED') {
            type = 'connection';
            text = `peer @${sender} terminated connection link`;
          } else if (evType === 'MESSAGE_RECEIVED') {
            type = 'activity';
            text = `received encrypted payload from peer @${sender}`;
          } else if (evType === 'CLUSTER_MEMBER_JOINED') {
            type = 'CLUSTER_JOINED';
            text = `a member joined Cluster enclave`;
          } else if (evType === 'CLUSTER_MESSAGE_RECEIVED') {
            type = 'cluster';
            text = `received encrypted message inside Cluster enclave`;
          }

          const actorAgentId = agentProfileMap[uId]?.agentId || 'UNKNOWN_AGENT';
          const peerAgentId = sender;
          
          let canonicalActivityKey = `evt:${ev.id || `${evType}:${sender}:${ev.created_at}`}`;
          if (evType === 'CONNECTION_ACCEPTED_BY_TARGET' || evType === 'CONNECTION_DISSOLVED') {
            const canonicalTimestamp = Math.floor(new Date(ev.created_at || new Date().toISOString()).getTime() / 1000);
            canonicalActivityKey = `conn_canonical:${actorAgentId}:${peerAgentId}:${evType === 'CONNECTION_ACCEPTED_BY_TARGET' ? 'established' : 'dissolved'}:${canonicalTimestamp}`;
          }

          if (text) {
            historicalRecords.push({
              id: ev.id || `evt_${Math.random()}`,
              activityKey: canonicalActivityKey,
              agentId: actorAgentId,
              agentName: sender,
              avatar: '🤖',
              emailVerified: false,
              text,
              type,
              createdAt: ev.created_at || new Date().toISOString(),
              peerUserId: uId,
              peerMasterId: vMasterId,
              masterId: vMasterId,
            });
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

          const isSender = fleetUserIds.includes(u1);
          const actorAgentId = isSender ? a1 : a2;
          const peerAgentId = isSender ? a2 : a1;
          const actorUserId = isSender ? u1 : u2;
          const peerUserId = isSender ? u2 : u1;
          const prof = agentProfileMap[actorUserId] || agentProfileMap[actorAgentId.toLowerCase()];

          const isDissolved = c.status === 'dissolved';
          const text = isDissolved
            ? `removed its connection with @${peerAgentId}`
            : `formed a connection with peer @${peerAgentId}`;

          const canonicalTimestamp = Math.floor(new Date(c.createdAt || c.created_at || new Date().toISOString()).getTime() / 1000);
          const activityKey = `conn_canonical:${actorAgentId}:${peerAgentId}:${isDissolved ? 'dissolved' : 'established'}:${canonicalTimestamp}`;
          historicalRecords.push({
            id: `conn_${c.id}`,
            activityKey,
            agentId: actorAgentId,
            agentName: prof?.name || actorAgentId,
            avatar: prof?.avatar || '🤖',
            emailVerified: prof?.emailVerified ?? false,
            text,
            type: 'connection',
            peerAgentId,
            peerName: peerAgentId,
            createdAt: c.createdAt || c.created_at || new Date().toISOString(),
            actorUserId,
            peerUserId,
            masterId: vMasterId,
          });
        }
      }
    } catch (e) {}

    // 5. Merge in-memory recent activities with historical records
    const inMemoryFiltered = this.recentActivities.filter((a) => this.isRecordAuthorizedForViewer(a, viewer));

    // Combine and deduplicate
    const combined = [...inMemoryFiltered, ...historicalRecords];
    const seenKeys = new Set<string>();
    const deduplicated: WatchtowerActivityRecord[] = [];

    for (const item of combined) {
      if (!item || !item.text) continue;
      const key = item.activityKey || item.id || `${item.agentId}:${item.type}:${item.text}:${item.createdAt}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        // Ensure record satisfies viewer authorization
        if (this.isRecordAuthorizedForViewer(item, viewer)) {
          deduplicated.push(item);
        }
      }
    }

    // Sort chronologically descending
    deduplicated.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Merge these into this.recentActivities so SSE and in-memory caches stay warm
    for (const d of deduplicated.slice(0, this.maxActivities)) {
      const idx = this.recentActivities.findIndex(
        (a) => (a.activityKey && a.activityKey === d.activityKey) || a.id === d.id
      );
      if (idx === -1) {
        this.recentActivities.push(d);
      }
    }
    // Re-sort recentActivities
    this.recentActivities.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (this.recentActivities.length > this.maxActivities) {
      this.recentActivities.splice(this.maxActivities);
    }

    return deduplicated.slice(0, 100);
  }

  /**
   * Returns a scoped copy of recent watchtower activities for an authenticated viewer.
   * If viewer is not provided or unauthenticated, returns an empty list (fail-closed).
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

    // Initial handshake packet with strictly authorized recent buffer
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
