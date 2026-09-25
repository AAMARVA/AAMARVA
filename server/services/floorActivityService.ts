import { Response } from 'express';
import EventEmitter from 'events';
import crypto from 'crypto';
import { getSupabaseClient } from '../supabase';
import { getClusterSymbol } from '../lib/clusterSymbols';

export function getClusterAction(text: string, type: string): string {
  const t = (text || '').toLowerCase();
  const rawType = (type || '').toLowerCase();
  if (rawType === 'cluster_created' || t.includes('created a new cluster')) return 'create';
  if (t.includes('updated cluster') || t.includes('configuration')) return 'update';
  if (t.includes('invited')) return 'invite';
  if (t.includes('revoked an invite') || t.includes('revoked invite')) return 'revoke_invite';
  if (rawType === 'cluster_joined' || t.includes('joined cluster')) return 'join';
  if (t.includes('left cluster')) return 'leave';
  if (t.includes('modified') && t.includes('role')) return 'modify_role';
  if (t.includes('removed') && t.includes('from cluster')) return 'remove_member';
  if (t.includes('disbanded cluster') || t.includes('disbanded')) return 'disband';
  return type || 'cluster';
}

export interface FloorActivityEvent {
  id: string;
  activityKey?: string;
  canonicalKey?: string;
  entityId?: string;
  agentId: string;
  agentName: string;
  avatar: string;
  emailVerified: boolean;
  text: string;
  type: string;
  peerName?: string;
  peerAgentId?: string;
  cluster?: {
    id: string;
    name: string;
    symbol?: string;
    ownerAgentId?: string;
  };
  post?: any;
  createdAt: string;
}

export interface RecordFloorActivityParams {
  id?: string;
  activityKey?: string;
  canonicalKey?: string;
  entityId?: string;
  agentId?: string;
  agentName?: string;
  avatar?: string;
  emailVerified?: boolean;
  text: string;
  type?: string;
  peerName?: string;
  peerAgentId?: string;
  replyId?: string;
  connectionId?: string;
  requestId?: string;
  cluster?: {
    id: string;
    name: string;
    symbol?: string;
    ownerAgentId?: string;
  };
  post?: any;
  createdAt?: string;
}

class FloorActivityService extends EventEmitter {
  private events: FloorActivityEvent[] = [];
  private readonly MAX_EVENTS = 500;
  private clients: Set<Response> = new Set();
  private agentCache: Map<string, { name: string; avatar: string; emailVerified: boolean }> = new Map();
  private isInitialized = false;

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const supabase = getSupabaseClient();
      // Load recent floor activity from account_audit_logs
      const { data, error } = await supabase
        .from('account_audit_logs')
        .select('*')
        .eq('eventType', 'FLOOR_ACTIVITY')
        .order('createdAt', { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        const seenKeys = new Set<string>();
        for (const row of data) {
          const details = row.details || {};
          const event: FloorActivityEvent = {
            id: details.id || `fa_${row.id}`,
            activityKey: details.activityKey,
            entityId: details.entityId,
            agentId: row.agentId || details.agentId || 'UNKNOWN_AGENT',
            agentName: details.agentName || row.agentId || 'Agent Node',
            avatar: details.avatar || '🤖',
            emailVerified: details.emailVerified === true,
            text: details.text || 'active on the floor',
            type: details.type || 'system',
            peerName: details.peerName,
            peerAgentId: details.peerAgentId,
            cluster: details.cluster,
            post: details.post,
            createdAt: details.createdAt || row.createdAt
          };

          if (!event.activityKey) {
            let eId = event.entityId;
            if (!eId) {
              if (event.type === 'reply') {
                eId = (event as any).reply?.id ? String((event as any).reply.id) :
                      ((event as any).replyId ? String((event as any).replyId) :
                      (event.post?.replyId ? String(event.post.replyId) :
                      (event.post?.reply?.id ? String(event.post.reply.id) :
                      (event.entityId ? String(event.entityId) : undefined))));
              } else if (event.type === 'post') {
                eId = !event.post?.postId && event.post?.id ? String(event.post.id) : undefined;
              } else if (event.type === 'connection') {
                eId = event.post?.connectionId ? String(event.post.connectionId) : (event.post?.id ? String(event.post.id) : undefined);
              } else if (event.type === 'request') {
                eId = event.post?.id ? String(event.post.id) : undefined;
              } else if (event.cluster?.id) {
                eId = String(event.cluster.id);
              }
            }

            if (event.type === 'post' && eId) event.activityKey = `post:${eId}`;
            else if (event.type === 'reply' && eId) event.activityKey = `reply:${eId}`;
            else if (event.type === 'connection' && eId) event.activityKey = `conn:${eId}`;
            else if (event.type === 'request' && eId) event.activityKey = `req:${eId}`;
            else if (event.type === 'cluster' || event.cluster?.id) {
              const clusterEventId = (event as any).eventId ||
                                     (event as any).clusterEventId ||
                                     (event.entityId && event.entityId !== event.cluster?.id ? event.entityId : undefined) ||
                                     (event.id && !event.id.startsWith('fa_') ? event.id : undefined);

              if (clusterEventId) {
                event.activityKey = `cluster-event:${clusterEventId}`;
              } else if (event.cluster?.id) {
                const action = getClusterAction(event.text, event.type);
                const target = event.peerAgentId || event.peerName || '';
                event.activityKey = `cluster:${event.cluster.id}:${event.agentId}:${action}${target ? `:${target}` : ''}`;
              }
            }
            else if (eId) event.activityKey = `${event.type}:${eId}`;
            else event.activityKey = `generic:${event.type}:${event.agentId}:${event.peerAgentId || event.peerName || ''}:${event.text.trim().toLowerCase()}`;
          }

          if (event.activityKey && seenKeys.has(event.activityKey)) {
            continue;
          }
          if (event.activityKey) {
            seenKeys.add(event.activityKey);
            event.canonicalKey = event.activityKey.startsWith('conn:') ? 'connection:' + event.activityKey.substring(5) : event.activityKey;
          }

          this.events.push(event);
        }
      }
    } catch (err) {
      console.warn('[FloorActivityService] Could not preload historical events:', err);
    }
  }

  public cacheAgent(agentId: string, meta: { name: string; avatar?: string; emailVerified?: boolean }) {
    if (!agentId) return;
    const cleanId = agentId.trim().toUpperCase().replace(/^@/, '');
    this.agentCache.set(cleanId, {
      name: meta.name || agentId,
      avatar: meta.avatar || '🤖',
      emailVerified: meta.emailVerified === true
    });
  }

  public async resolveAgentMeta(agentId: string): Promise<{ name: string; avatar: string; emailVerified: boolean }> {
    if (!agentId) return { name: 'Agent Node', avatar: '🤖', emailVerified: false };
    const cleanId = agentId.trim().toUpperCase().replace(/^@/, '');
    if (this.agentCache.has(cleanId)) {
      return this.agentCache.get(cleanId)!;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: user } = await supabase
        .from('users')
        .select('name, avatar, agentId, emailVerified')
        .or(`agentId.ilike.${cleanId},id.eq.${cleanId}`)
        .maybeSingle();

      if (user) {
        const meta = {
          name: user.name || user.agentId || agentId,
          avatar: user.avatar || '🤖',
          emailVerified: user.emailVerified === true
        };
        this.agentCache.set(cleanId, meta);
        return meta;
      }
    } catch (e) {}

    return { name: agentId, avatar: '🤖', emailVerified: false };
  }

  public async recordFloorActivity(params: RecordFloorActivityParams): Promise<FloorActivityEvent> {
    const rawAgentId = params.agentId || 'SYSTEM_NODE';
    const cleanAgentId = rawAgentId.trim().replace(/^@/, '');
    const meta = await this.resolveAgentMeta(cleanAgentId);

    const resolvedName = params.agentName || meta.name || cleanAgentId;
    const resolvedAvatar = params.avatar || meta.avatar || '🤖';
    const resolvedVerified = params.emailVerified !== undefined ? params.emailVerified : meta.emailVerified;

    let peerName = params.peerName;
    if (!peerName && params.peerAgentId) {
      const pMeta = await this.resolveAgentMeta(params.peerAgentId);
      peerName = pMeta.name;
    }

    let clusterData = params.cluster;
    if (clusterData && !clusterData.symbol && clusterData.id) {
      clusterData.symbol = getClusterSymbol(clusterData.id);
    }

    const type = params.type || 'activity';

    let entityId = params.entityId;
    if (!entityId) {
      if (type === 'reply') {
        entityId = (params as any).reply?.id ? String((params as any).reply.id) :
                   ((params as any).replyId ? String((params as any).replyId) :
                   (params.replyId ? String(params.replyId) :
                   ((params.post as any)?.replyId ? String((params.post as any).replyId) :
                   ((params.post as any)?.reply?.id ? String((params.post as any).reply.id) :
                   (params.entityId ? String(params.entityId) : undefined)))));
      } else if (type === 'connection') {
        entityId = (params as any).connectionId ||
                   (params.post as any)?.connectionId ||
                   (params.post?.id ? String(params.post.id) : undefined);
      } else if (type === 'request') {
        entityId = (params as any).requestId ||
                   (params.post as any)?.requestId ||
                   (params.post?.id ? String(params.post.id) : undefined);
      } else if (type === 'post') {
        entityId = !params.post?.postId && params.post?.id ? String(params.post.id) : undefined;
      } else if (params.post?.id) {
        entityId = String(params.post.id);
      } else if (params.cluster?.id) {
        entityId = String(params.cluster.id);
      }
    }

    let activityKey = params.activityKey || params.canonicalKey;
    if (activityKey?.startsWith('connection:')) {
      activityKey = 'conn:' + activityKey.substring(11);
    }

    if (!activityKey) {
      if (type === 'post' && entityId) {
        activityKey = `post:${entityId}`;
      } else if (type === 'reply' && entityId) {
        activityKey = `reply:${entityId}`;
      } else if (type === 'connection' && entityId) {
        activityKey = `conn:${entityId}`;
      } else if (type === 'request' && entityId) {
        activityKey = `req:${entityId}`;
      } else if (type === 'cluster' || clusterData?.id) {
        const clusterEventId = (params as any).eventId ||
                               (params as any).clusterEventId ||
                               (params.entityId && params.entityId !== clusterData?.id ? params.entityId : undefined) ||
                               (params.id && !params.id.startsWith('fa_') ? params.id : undefined);

        if (clusterEventId) {
          activityKey = `cluster-event:${clusterEventId}`;
        } else if (clusterData?.id) {
          const action = getClusterAction(params.text, type);
          const target = params.peerAgentId || peerName || '';
          activityKey = `cluster:${clusterData.id}:${cleanAgentId}:${action}${target ? `:${target}` : ''}`;
        }
      } else if (entityId) {
        activityKey = `${type}:${entityId}`;
      } else {
        activityKey = `generic:${type}:${cleanAgentId}:${params.peerAgentId || peerName || ''}:${params.text.trim().toLowerCase()}`;
      }
    }

    const canonicalKey = activityKey.startsWith('conn:') ? 'connection:' + activityKey.substring(5) : activityKey;

    const event: FloorActivityEvent = {
      id: params.id || `fa_${crypto.randomUUID()}`,
      activityKey,
      canonicalKey,
      entityId,
      agentId: cleanAgentId,
      agentName: resolvedName,
      avatar: resolvedAvatar,
      emailVerified: Boolean(resolvedVerified),
      text: params.text,
      type,
      peerName,
      peerAgentId: params.peerAgentId,
      cluster: clusterData,
      post: params.post,
      createdAt: params.createdAt || new Date().toISOString()
    };

    // Deduplicate in-memory events array
    const existingIndex = this.events.findIndex(e => e.activityKey === event.activityKey);
    let isDuplicate = false;
    if (existingIndex !== -1) {
      isDuplicate = true;
      const existing = this.events[existingIndex];
      this.events[existingIndex] = {
        ...event,
        ...existing,
        post: existing.post || event.post,
        cluster: existing.cluster || event.cluster,
        peerName: existing.peerName || event.peerName,
        peerAgentId: existing.peerAgentId || event.peerAgentId,
        avatar: existing.avatar || event.avatar,
        emailVerified: existing.emailVerified || event.emailVerified
      };
    } else {
      this.events.unshift(event);
      if (this.events.length > this.MAX_EVENTS) {
        this.events = this.events.slice(0, this.MAX_EVENTS);
      }
    }

    // Emit event locally
    this.emit('activity', event);

    // Broadcast via SSE to all active floor stream listeners
    this.broadcastToStream(event);

    // Persist to account_audit_logs asynchronously ONLY if it is not a duplicate.
    // CONCURRENCY LIMITATION NOTE: Sequential and single-instance duplicate calls are prevented
    // by the in-memory activityKey check. The account_audit_logs table uses a BIGSERIAL primary key
    // without a unique index on details->>'activityKey', so database-level atomic uniqueness is not supported.
    if (!isDuplicate) {
      try {
        const supabase = getSupabaseClient();
        supabase.from('account_audit_logs').insert({
          agentId: cleanAgentId,
          eventType: 'FLOOR_ACTIVITY',
          actionSource: 'SYSTEM',
          details: {
            id: event.id,
            activityKey: event.activityKey,
            canonicalKey: event.canonicalKey,
            entityId: event.entityId,
            agentId: event.agentId,
            agentName: event.agentName,
            avatar: event.avatar,
            emailVerified: event.emailVerified,
            text: event.text,
            type: event.type,
            peerName: event.peerName,
            peerAgentId: event.peerAgentId,
            cluster: event.cluster,
            post: event.post,
            createdAt: event.createdAt
          },
          createdAt: event.createdAt
        }).then(({ error }) => {
          if (error) {
            console.warn('[FloorActivityService] Failed to persist event:', error.message);
          }
        });
      } catch (err) {
        console.warn('[FloorActivityService] DB persist error:', err);
      }
    }

    return event;
  }

  public getRecentFloorActivity(limit = 100): FloorActivityEvent[] {
    return this.events.slice(0, limit);
  }

  public registerFloorStreamClient(res: Response) {
    this.clients.add(res);

    // Send headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send initial handshake with recent events
    const recent = this.getRecentFloorActivity(50);
    res.write(`event: handshake\ndata: ${JSON.stringify({ message: 'Connected to live floor stream', recent })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(':ping\n\n');
      } catch (e) {
        clearInterval(keepAlive);
      }
    }, 15000);

    res.on('close', () => {
      clearInterval(keepAlive);
      this.clients.delete(res);
    });
  }

  private broadcastToStream(event: FloorActivityEvent) {
    if (this.clients.size === 0) return;
    const payload = `event: floor_activity\ndata: ${JSON.stringify(event)}\n\n`;
    this.clients.forEach(res => {
      try {
        res.write(payload);
      } catch (e) {
        this.clients.delete(res);
      }
    });
  }
}

export const floorActivityService = new FloorActivityService();
// Initialize eagerly
floorActivityService.init().catch(console.warn);
