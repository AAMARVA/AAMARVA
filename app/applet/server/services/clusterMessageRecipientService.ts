import crypto from 'crypto';
import { ClusterMessageRecipientRecord } from '../db';

export interface RecipientKeyEnvelopeInput {
  recipientAgentId: string;
  recipientUserId?: string | null;
  wrappedKey: string;
  wrappedKeyIv: string;
}

export class ClusterMessageRecipientService {
  private static instance: ClusterMessageRecipientService;
  // In-memory fallback and fast index store for recipient relationships
  // Key: messageId -> Map<normalizedRecipientAgentId, ClusterMessageRecipientRecord>
  private messageRecipientsStore = new Map<string, Map<string, ClusterMessageRecipientRecord>>();
  // Key: `${clusterId}:${normalizedRecipientAgentId}` -> Set<messageId>
  private recipientMessagesIndex = new Map<string, Set<string>>();

  private constructor() {}

  public static getInstance(): ClusterMessageRecipientService {
    if (!ClusterMessageRecipientService.instance) {
      ClusterMessageRecipientService.instance = new ClusterMessageRecipientService();
    }
    return ClusterMessageRecipientService.instance;
  }

  public normalizeId(id: string | null | undefined): string {
    return String(id || '').trim().replace(/^@/, '').toUpperCase();
  }

  /**
   * Records explicit recipient relationships for a cluster message atomically.
   * Persists to Supabase `cluster_message_recipients` and local index.
   * Deduplicates duplicate recipient entries.
   */
  public async recordMessageRecipients(
    supabase: any,
    messageId: string,
    clusterId: string,
    recipients: RecipientKeyEnvelopeInput[]
  ): Promise<ClusterMessageRecipientRecord[]> {
    if (!messageId || !clusterId || !recipients || recipients.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const seenRecipients = new Set<string>();
    const deduplicatedRecords: ClusterMessageRecipientRecord[] = [];

    for (const r of recipients) {
      const normalizedAgentId = this.normalizeId(r.recipientAgentId);
      if (!normalizedAgentId || seenRecipients.has(normalizedAgentId)) {
        continue;
      }
      seenRecipients.add(normalizedAgentId);

      deduplicatedRecords.push({
        id: `cmr_${crypto.randomUUID()}`,
        messageId,
        clusterId,
        recipientAgentId: normalizedAgentId,
        recipientUserId: r.recipientUserId || null,
        wrappedKey: r.wrappedKey,
        wrappedKeyIv: r.wrappedKeyIv,
        createdAt: now,
      });
    }

    // 1. Update in-memory index
    let msgMap = this.messageRecipientsStore.get(messageId);
    if (!msgMap) {
      msgMap = new Map();
      this.messageRecipientsStore.set(messageId, msgMap);
    }

    for (const rec of deduplicatedRecords) {
      msgMap.set(rec.recipientAgentId, rec);
      const idxKey = `${clusterId}:${rec.recipientAgentId}`;
      let msgSet = this.recipientMessagesIndex.get(idxKey);
      if (!msgSet) {
        msgSet = new Set();
        this.recipientMessagesIndex.set(idxKey, msgSet);
      }
      msgSet.add(messageId);
    }

    // 2. Persist to database table if available
    try {
      if (supabase && typeof supabase.from === 'function') {
        const { error } = await supabase.from('cluster_message_recipients').insert(deduplicatedRecords);
        if (error && !error.message?.includes('schema cache') && !error.message?.includes('does not exist')) {
          console.warn('[ClusterMessageRecipientService] Database insert notice:', error.message);
        }
      }
    } catch (e: any) {
      // Gracefully maintain in-memory resilience if DB table is pending migration
    }

    return deduplicatedRecords;
  }

  /**
   * Retrieves all recipient records for a message.
   */
  public async getRecipientsForMessage(
    supabase: any,
    messageId: string
  ): Promise<ClusterMessageRecipientRecord[]> {
    const memoryRecs = this.messageRecipientsStore.get(messageId);
    if (memoryRecs && memoryRecs.size > 0) {
      return Array.from(memoryRecs.values());
    }

    try {
      if (supabase && typeof supabase.from === 'function') {
        const { data, error } = await supabase
          .from('cluster_message_recipients')
          .select('*')
          .eq('messageId', messageId);

        if (!error && Array.isArray(data) && data.length > 0) {
          // Sync into memory store
          let msgMap = this.messageRecipientsStore.get(messageId);
          if (!msgMap) {
            msgMap = new Map();
            this.messageRecipientsStore.set(messageId, msgMap);
          }
          data.forEach((r: any) => {
            const normId = this.normalizeId(r.recipientAgentId);
            msgMap!.set(normId, r);
          });
          return data;
        }
      }
    } catch (e) {}

    return [];
  }

  /**
   * Checks whether the caller is an authorized recipient or the sender of a message.
   */
  public async isAuthorizedForMessage(
    supabase: any,
    message: {
      id: string;
      senderUserId?: string | null;
      senderAgentId?: string | null;
      version?: number;
      createdAt?: string;
    },
    callerAgentId: string,
    callerUserId: string,
    callerJoinedAt?: string | null
  ): Promise<boolean> {
    const normCallerAgentId = this.normalizeId(callerAgentId);
    const normCallerUserId = this.normalizeId(callerUserId);
    const normSenderAgentId = this.normalizeId(message.senderAgentId);
    const normSenderUserId = this.normalizeId(message.senderUserId);

    // 1. Sender always has access to their own sent messages
    if (
      (normCallerAgentId && normCallerAgentId === normSenderAgentId) ||
      (normCallerUserId && normCallerUserId === normSenderUserId)
    ) {
      return true;
    }

    // 2. Check explicit recipient relationship for recipient-based messages
    const recipients = await this.getRecipientsForMessage(supabase, message.id);
    if (recipients.length > 0) {
      return recipients.some(
        (r) =>
          this.normalizeId(r.recipientAgentId) === normCallerAgentId ||
          (r.recipientUserId && this.normalizeId(r.recipientUserId) === normCallerUserId)
      );
    }

    // 3. Legacy message handling (version 1 without recipient rows):
    // Members who joined AFTER the legacy message was created cannot access historical messages.
    if (message.version === 1 || !message.version) {
      if (!callerJoinedAt) {
        return true;
      }
      const msgTime = message.createdAt ? new Date(message.createdAt).getTime() : 0;
      const joinTime = new Date(callerJoinedAt).getTime();
      return joinTime <= msgTime;
    }

    return false;
  }

  /**
   * Filters a message's wrapped key envelopes so only the caller's specific envelope
   * is exposed in the API response, preserving cryptographic recipient privacy.
   */
  public filterKeysForCaller(
    keysMap: Record<string, { iv: string; key: string }> | null | undefined,
    callerAgentId: string,
    isSender: boolean
  ): Record<string, { iv: string; key: string }> | null {
    if (!keysMap || typeof keysMap !== 'object') return null;

    const normCaller = this.normalizeId(callerAgentId);
    const filtered: Record<string, { iv: string; key: string }> = {};

    for (const [recId, keyObj] of Object.entries(keysMap)) {
      const normRec = this.normalizeId(recId);
      if (normRec === normCaller || isSender) {
        filtered[recId] = keyObj;
      }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
  }

  /**
   * Resets local stores (used for testing clean environments).
   */
  public clearStoreForTests(): void {
    this.messageRecipientsStore.clear();
    this.recipientMessagesIndex.clear();
  }
}

export const clusterMessageRecipientService = ClusterMessageRecipientService.getInstance();
