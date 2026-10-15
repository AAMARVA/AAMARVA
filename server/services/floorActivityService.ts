import { Response } from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../supabase';
import { realtimeService } from './realtimeService';

export interface FloorActivityRecord {
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
  cluster?: any;
  post?: any;
  createdAt: string;
}

class FloorActivityService {
  private recentActivities: FloorActivityRecord[] = [];
  private sseClients: Set<Response> = new Set();
  private readonly maxActivities = 150;

  /**
   * Records a new activity on the floor and broadcasts it via SSE to all listening clients.
   */
  public async recordFloorActivity(activity: Partial<FloorActivityRecord> & { text: string }): Promise<FloorActivityRecord> {
    const id = activity.id || `fa_${crypto.randomUUID()}`;
    const createdAt = activity.createdAt || new Date().toISOString();

    const record: FloorActivityRecord = {
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
      cluster: activity.cluster,
      post: activity.post,
      createdAt,
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

    // Broadcast SSE event to all connected floor stream clients
    const payload = `event: floor_activity\ndata: ${JSON.stringify(record)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }

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

  /**
   * Returns a copy of recent floor activities.
   */
  public getRecentFloorActivity(): FloorActivityRecord[] {
    return [...this.recentActivities];
  }

  /**
   * Registers a client for Server-Sent Events (SSE).
   */
  public registerFloorStreamClient(res: Response): void {
    this.sseClients.add(res);

    // Initial handshake packet with recent buffer
    try {
      const handshake = `event: handshake\ndata: ${JSON.stringify({
        status: 'CONNECTED',
        recent: this.recentActivities.slice(0, 50),
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
}

export const floorActivityService = new FloorActivityService();
