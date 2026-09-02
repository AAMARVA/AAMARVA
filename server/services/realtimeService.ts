import { Response } from 'express';
import EventEmitter from 'events';

export interface RealtimeEvent {
  id: string;
  type: string;
  category: 'footprint' | 'event' | 'system';
  accountId: string; // The user_id of the account owning this notification
  actorId?: string; // agentId or userId of actor
  targetId?: string; // agentId or userId or entityId of target
  entityId?: string;
  details?: any;
  timestamp: string;
}

class RealtimeService extends EventEmitter {
  // Map of accountId (user_id) -> Set of active Express Response SSE streams
  private clients: Map<string, Set<Response>> = new Map();

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Registers a client SSE connection for an authenticated account.
   */
  public registerClient(accountId: string, res: Response) {
    if (!this.clients.has(accountId)) {
      this.clients.set(accountId, new Set());
    }
    this.clients.get(accountId)!.add(res);

    // Initial connection handshake
    const handshake: RealtimeEvent = {
      id: `rt_init_${Date.now()}`,
      type: 'STREAM_CONNECTED',
      category: 'system',
      accountId,
      details: { message: 'Realtime synchronized stream established.' },
      timestamp: new Date().toISOString()
    };
    this.sendToResponse(res, handshake);

    // Heartbeat every 15s to keep HTTP connection alive and prevent proxy timeouts
    const pingInterval = setInterval(() => {
      try {
        res.write(':ping\n\n');
      } catch (e) {
        clearInterval(pingInterval);
      }
    }, 15000);

    res.on('close', () => {
      clearInterval(pingInterval);
      const userClients = this.clients.get(accountId);
      if (userClients) {
        userClients.delete(res);
        if (userClients.size === 0) {
          this.clients.delete(accountId);
        }
      }
    });
  }

  /**
   * Broadcasts a real-time notification strictly to the authenticated account's active connections.
   */
  public notifyAccount(accountId: string, event: RealtimeEvent) {
    if (!accountId) return;

    // 1. Emit on internal EventEmitter for local subscribers/tests
    this.emit(`account:${accountId}`, event);
    this.emit('event', event);

    // 2. Deliver SSE to all active connections for this account
    const userClients = this.clients.get(accountId);
    if (userClients && userClients.size > 0) {
      userClients.forEach((res) => {
        this.sendToResponse(res, event);
      });
    }
  }

  private sendToResponse(res: Response, event: RealtimeEvent) {
    try {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {
      // client disconnected
    }
  }

  public getConnectedClientCount(accountId?: string): number {
    if (accountId) {
      return this.clients.get(accountId)?.size || 0;
    }
    let total = 0;
    this.clients.forEach((set) => {
      total += set.size;
    });
    return total;
  }
}

export const realtimeService = new RealtimeService();
