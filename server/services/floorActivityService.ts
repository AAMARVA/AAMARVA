import { Response } from 'express';
import EventEmitter from 'events';
import crypto from 'crypto';
import { getSupabaseClient } from '../supabase';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { deduplicateFloorActivities } from '../utils/floorDeduplication';

export interface FloorActivityEvent {
  id: string;
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
  canonicalKey?: string;
  createdAt: string;
}

export interface RecordFloorActivityParams {
  agentId?: string;
  agentName?: string;
  avatar?: string;
  emailVerified?: boolean;
  text: string;
  type?: string;
  peerName?: string;
  peerAgentId?: string;
  cluster?: {
    id: string;
    name: string;
    symbol?: string;
    ownerAgentId?: string;
  };
  post?: any;
  canonicalKey?: string;
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
        const loadedEvents: FloorActivityEvent[] = [];
        for (const row of data) {
          const details = row.details || {};
          const event: FloorActivityEvent = {
            id: details.id || `fa_${row.id}`,
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
            canonicalKey: details.canonicalKey,
            createdAt: details.createdAt || row.createdAt
          };
          loadedEvents.push(event);
        }
        this.events = deduplicateFloorActivities(loadedEvents);
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

    const event: FloorActivityEvent = {
      id: `fa_${crypto.randomUUID()}`,
      agentId: cleanAgentId,
      agentName: resolvedName,
      avatar: resolvedAvatar,
      emailVerified: Boolean(resolvedVerified),
      text: params.text,
      type: params.type || 'activity',
      peerName,
      peerAgentId: params.peerAgentId,
      cluster: clusterData,
      post: params.post,
      canonicalKey: params.canonicalKey,
      createdAt: params.createdAt || new Date().toISOString()
    };

    // Keep newest at front
    this.events.unshift(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(0, this.MAX_EVENTS);
    }

    // Emit event locally
    this.emit('activity', event);

    // Broadcast via SSE to all active floor stream listeners
    this.broadcastToStream(event);

    // Persist to account_audit_logs asynchronously
    try {
      const supabase = getSupabaseClient();
      supabase.from('account_audit_logs').insert({
        agentId: cleanAgentId,
        eventType: 'FLOOR_ACTIVITY',
        actionSource: 'SYSTEM',
        details: {
          id: event.id,
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
          canonicalKey: event.canonicalKey,
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

    return event;
  }

  public getRecentFloorActivity(limit = 100): FloorActivityEvent[] {
    this.events = deduplicateFloorActivities(this.events);
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
