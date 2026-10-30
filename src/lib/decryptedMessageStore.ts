/**
 * Decrypted Message Store for AAMARVA
 * Ensures that once a message has been decrypted on the client for the UI,
 * it is persisted across polling intervals, tab switches, and modal reopens.
 * "Once decrypted for the UI, we never go back to the encrypted phase."
 */

const memoryStore = new Map<string, string>();

export interface ClusterMessageCacheContext {
  accountId: string;
  clusterId: string;
  messageId: string;
  senderAgentId?: string | null;
  ciphertext?: string | null;
  nonce?: string | null;
}

interface StoredClusterCacheEnvelope {
  v: 2;
  accountId: string;
  clusterId: string;
  messageId: string;
  senderAgentId: string | null;
  ciphertext: string | null;
  nonce: string | null;
  plaintext: string;
}

export interface ReconcilableClusterMessage {
  id: string;
  clusterId?: string;
  senderAgentId?: string;
  content: string;
  ciphertext?: string;
  nonce?: string;
  sequence?: number;
  isDecrypted: boolean;
  decryptionStatus?: {
    title: string;
    detail: string;
    explanation?: string;
  };
  createdAt: string;
  [key: string]: any;
}

/**
 * Checks if a string represents an error status or unresolved ciphertext placeholder
 * rather than real decrypted message content.
 */
export function isDecryptionErrorPlaceholder(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.startsWith('🔒')) return true;
  if (trimmed.startsWith('🔐')) return true;
  if (trimmed.startsWith('[Encrypted')) return true;
  if (trimmed === '[Your encrypted message]') return true;
  if (trimmed.includes('Cannot be decrypted')) return true;
  if (trimmed.includes('Enter account password above to restore')) return true;
  return false;
}

/**
 * Clean and validate a key for storage lookup.
 * Rejects null/undefined placeholders, sequence keys, and temporary cluster IDs.
 */
function normalizeKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed.startsWith('seq_') ||
    trimmed.includes(':seq_') ||
    trimmed.includes('_seq_') ||
    trimmed.endsWith('_null') ||
    trimmed.endsWith('_undefined') ||
    trimmed.endsWith(':null') ||
    trimmed.endsWith(':undefined') ||
    trimmed.includes('temp_cluster_')
  ) {
    return '';
  }
  return trimmed;
}

function normalizeSenderId(senderAgentId?: string | null): string | null {
  if (!senderAgentId || typeof senderAgentId !== 'string') return null;
  const cleaned = senderAgentId.trim().replace(/^@+/, '').toLowerCase();
  if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return null;
  return cleaned;
}

function normalizeOptionalField(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return null;
  return cleaned;
}

/**
 * Builds a strictly scoped cache key for a cluster message using:
 * authenticated accountId + clusterId + immutable server-assigned messageId.
 */
export function buildClusterMessageCacheKey(
  accountId?: string | null,
  clusterId?: string | null,
  messageId?: string | null
): string | null {
  const cleanAccount = normalizeOptionalField(accountId);
  const cleanCluster = normalizeOptionalField(clusterId);
  const cleanMsgId = normalizeOptionalField(messageId);

  if (!cleanAccount || !cleanCluster || !cleanMsgId) {
    return null;
  }

  // Never persist temporary optimistic IDs or sequence numbers as message IDs
  if (cleanMsgId.startsWith('temp_cluster_') || cleanMsgId.startsWith('seq_')) {
    return null;
  }

  return `cluster_v2:${cleanAccount}:${cleanCluster}:${cleanMsgId}`;
}

function removeRawCacheKey(k: string): void {
  memoryStore.delete(k);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`aamarva_dec_${k}`);
    }
  } catch {}
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(`aamarva_dec_${k}`);
    }
  } catch {}
}

/**
 * Purges legacy unscoped or poisoned cluster cache entries from storage.
 */
export function purgeStaleClusterCacheEntries(): void {
  const shouldPurgeStorageKey = (storageKey: string): boolean => {
    if (!storageKey.startsWith('aamarva_dec_')) return false;
    const rawKey = storageKey.slice('aamarva_dec_'.length);
    if (
      rawKey.includes('seq_') ||
      rawKey.endsWith('_null') ||
      rawKey.endsWith('_undefined') ||
      rawKey.endsWith(':null') ||
      rawKey.endsWith(':undefined') ||
      rawKey.includes('temp_cluster_') ||
      rawKey.includes('PLACEHOLDER')
    ) {
      return true;
    }
    return false;
  };

  for (const k of Array.from(memoryStore.keys())) {
    if (shouldPurgeStorageKey(`aamarva_dec_${k}`)) {
      memoryStore.delete(k);
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && shouldPurgeStorageKey(k)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}

  try {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && shouldPurgeStorageKey(k)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Clears all in-memory and web storage decrypted message cache entries (used for test isolation).
 */
export function clearAllDecryptedMessageCache(): void {
  memoryStore.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('aamarva_dec_') || k.startsWith('aamarva_plain_'))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}
  try {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('aamarva_dec_') || k.startsWith('aamarva_plain_'))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Retrieve cached decrypted plaintext for a cluster message strictly scoped to
 * (accountId, clusterId, messageId) and validated against senderAgentId, ciphertext, and nonce.
 */
export function getScopedClusterDecryptedMessage(ctx: ClusterMessageCacheContext): string | null {
  const scopedKey = buildClusterMessageCacheKey(ctx.accountId, ctx.clusterId, ctx.messageId);
  if (!scopedKey) return null;

  let rawStored: string | null = memoryStore.get(scopedKey) || null;

  if (!rawStored) {
    try {
      if (typeof localStorage !== 'undefined') {
        rawStored = localStorage.getItem(`aamarva_dec_${scopedKey}`);
      }
    } catch {}
  }

  if (!rawStored) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        rawStored = sessionStorage.getItem(`aamarva_dec_${scopedKey}`);
      }
    } catch {}
  }

  if (!rawStored) return null;

  let parsed: StoredClusterCacheEnvelope | null = null;
  try {
    const obj = JSON.parse(rawStored);
    if (obj && typeof obj === 'object' && obj.v === 2 && typeof obj.plaintext === 'string') {
      parsed = obj as StoredClusterCacheEnvelope;
    }
  } catch {
    parsed = null;
  }

  // Reject unverified or legacy raw string entries so stale cache cannot override message content
  if (!parsed) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  const expectedAccount = normalizeOptionalField(ctx.accountId);
  const expectedCluster = normalizeOptionalField(ctx.clusterId);
  const expectedMsgId = normalizeOptionalField(ctx.messageId);

  if (
    parsed.accountId !== expectedAccount ||
    parsed.clusterId !== expectedCluster ||
    parsed.messageId !== expectedMsgId
  ) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  const expectedSender = normalizeSenderId(ctx.senderAgentId);
  const storedSender = normalizeSenderId(parsed.senderAgentId);
  if (expectedSender && storedSender && expectedSender !== storedSender) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  const expectedCiphertext = normalizeOptionalField(ctx.ciphertext);
  const storedCiphertext = normalizeOptionalField(parsed.ciphertext);
  if (expectedCiphertext && storedCiphertext && expectedCiphertext !== storedCiphertext) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  const expectedNonce = normalizeOptionalField(ctx.nonce);
  const storedNonce = normalizeOptionalField(parsed.nonce);
  if (expectedNonce && storedNonce && expectedNonce !== storedNonce) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  if (isDecryptionErrorPlaceholder(parsed.plaintext)) {
    removeRawCacheKey(scopedKey);
    return null;
  }

  // If the entry was cached when sending before ciphertext/nonce were attached, lock them in now
  if (
    (expectedCiphertext && !storedCiphertext) ||
    (expectedNonce && !storedNonce) ||
    (expectedSender && !storedSender)
  ) {
    cacheScopedClusterDecryptedMessage(
      {
        accountId: expectedAccount,
        clusterId: expectedCluster,
        messageId: expectedMsgId,
        senderAgentId: expectedSender || storedSender,
        ciphertext: expectedCiphertext || storedCiphertext,
        nonce: expectedNonce || storedNonce
      },
      parsed.plaintext
    );
  } else {
    memoryStore.set(scopedKey, rawStored);
  }

  return parsed.plaintext;
}

/**
 * Cache decrypted plaintext for a cluster message strictly scoped to
 * (accountId, clusterId, messageId) and bound to its senderAgentId, ciphertext, and nonce.
 */
export function cacheScopedClusterDecryptedMessage(
  ctx: ClusterMessageCacheContext,
  plaintext: string
): void {
  if (isDecryptionErrorPlaceholder(plaintext)) {
    return;
  }

  const scopedKey = buildClusterMessageCacheKey(ctx.accountId, ctx.clusterId, ctx.messageId);
  if (!scopedKey) return;

  const expectedAccount = normalizeOptionalField(ctx.accountId)!;
  const expectedCluster = normalizeOptionalField(ctx.clusterId)!;
  const expectedMsgId = normalizeOptionalField(ctx.messageId)!;

  const envelope: StoredClusterCacheEnvelope = {
    v: 2,
    accountId: expectedAccount,
    clusterId: expectedCluster,
    messageId: expectedMsgId,
    senderAgentId: normalizeSenderId(ctx.senderAgentId),
    ciphertext: normalizeOptionalField(ctx.ciphertext),
    nonce: normalizeOptionalField(ctx.nonce),
    plaintext
  };

  const serialized = JSON.stringify(envelope);
  memoryStore.set(scopedKey, serialized);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`aamarva_dec_${scopedKey}`, serialized);
    }
  } catch {}

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`aamarva_dec_${scopedKey}`, serialized);
    }
  } catch {}
}

/**
 * Reconciles newly fetched/decrypted cluster messages with previous component state.
 * - Uses immutable server-assigned message ID as the sole identity for matching.
 * - Never matches by sequence number, bare nonce, or bare ciphertext.
 * - Preserves message-to-ciphertext, nonce, senderAgentId, and decrypted-content relationship.
 * - Reconciles in-flight optimistic messages without overwriting any other message.
 */
export function reconcileClusterMessages<T extends ReconcilableClusterMessage>(
  prevMessages: T[],
  incomingMessages: T[],
  options: {
    accountId: string;
    clusterId: string;
    pendingOptimisticToServerId?: ReadonlyMap<string, string>;
  }
): T[] {
  const { accountId, clusterId, pendingOptimisticToServerId } = options;

  // 1. Index previously decrypted messages strictly by their immutable message ID
  const prevDecryptedById = new Map<string, T>();
  const prevServerIds = new Set<string>();

  for (const p of prevMessages) {
    if (!p || !p.id) continue;
    const isTemp = p.id.startsWith('temp_cluster_');
    if (!isTemp) {
      prevServerIds.add(p.id);
    }
    if (p.isDecrypted && p.content && !isDecryptionErrorPlaceholder(p.content)) {
      if (!isTemp) {
        prevDecryptedById.set(p.id, p);
      } else if (pendingOptimisticToServerId?.has(p.id)) {
        const mappedServerId = pendingOptimisticToServerId.get(p.id)!;
        if (mappedServerId && !prevDecryptedById.has(mappedServerId)) {
          prevDecryptedById.set(mappedServerId, { ...p, id: mappedServerId });
        }
      }
    }
  }

  // 2. Merge incoming server messages, preserving previously decrypted content ONLY for the exact same message ID & envelope
  const merged: T[] = incomingMessages.map((newMsg) => {
    if (!newMsg.isDecrypted && newMsg.id && !newMsg.id.startsWith('temp_cluster_')) {
      const prevMsg = prevDecryptedById.get(newMsg.id);
      if (prevMsg && prevMsg.id === newMsg.id && prevMsg.isDecrypted && !isDecryptionErrorPlaceholder(prevMsg.content)) {
        const sameCluster = (prevMsg.clusterId || clusterId) === (newMsg.clusterId || clusterId);
        const prevSender = normalizeSenderId(prevMsg.senderAgentId);
        const newSender = normalizeSenderId(newMsg.senderAgentId);
        const sameSender = !prevSender || !newSender || prevSender === newSender;

        const prevCipher = normalizeOptionalField(prevMsg.ciphertext);
        const newCipher = normalizeOptionalField(newMsg.ciphertext);
        const sameCipher = !prevCipher || !newCipher || prevCipher === newCipher;

        const prevNonce = normalizeOptionalField(prevMsg.nonce);
        const newNonce = normalizeOptionalField(newMsg.nonce);
        const sameNonce = !prevNonce || !newNonce || prevNonce === newNonce;

        if (sameCluster && sameSender && sameCipher && sameNonce) {
          cacheScopedClusterDecryptedMessage(
            {
              accountId,
              clusterId: newMsg.clusterId || clusterId,
              messageId: newMsg.id,
              senderAgentId: newMsg.senderAgentId,
              ciphertext: newMsg.ciphertext,
              nonce: newMsg.nonce
            },
            prevMsg.content
          );
          return {
            ...newMsg,
            content: prevMsg.content,
            isDecrypted: true,
            decryptionStatus: undefined
          };
        }
      }
    }
    return newMsg;
  });

  // 3. Reconcile in-flight optimistic messages 1-to-1 with newly arrived server messages
  const mergedIds = new Set(merged.map((m) => m.id));
  const consumedServerIds = new Set<string>();

  const inFlightOptimistic = prevMessages.filter((p) => {
    if (!p || !p.id || !p.id.startsWith('temp_cluster_')) {
      return false;
    }

    // If this optimistic message was explicitly mapped to a returned server ID that is now in merged, drop the temp placeholder
    const mappedServerId = pendingOptimisticToServerId?.get(p.id);
    if (mappedServerId && mergedIds.has(mappedServerId)) {
      consumedServerIds.add(mappedServerId);
      return false;
    }

    // Otherwise check if a newly arrived decrypted server message from the same sender with identical content matches 1-to-1
    const pSender = normalizeSenderId(p.senderAgentId);
    const matchingServerMsg = merged.find((m) => {
      if (!m.id || m.id.startsWith('temp_cluster_')) return false;
      if (consumedServerIds.has(m.id)) return false;
      if (prevServerIds.has(m.id)) return false;
      if (!m.isDecrypted || isDecryptionErrorPlaceholder(m.content)) return false;
      const mSender = normalizeSenderId(m.senderAgentId);
      if (pSender && mSender && pSender !== mSender) return false;
      return m.content === p.content;
    });

    if (matchingServerMsg) {
      consumedServerIds.add(matchingServerMsg.id);
      return false;
    }

    return true;
  });

  return [...merged, ...inFlightOptimistic];
}

/**
 * Retrieve cached decrypted plaintext for any matching key
 */
export function getCachedDecryptedMessage(keys: (string | undefined | null)[]): string | null {
  for (const rawKey of keys) {
    if (!rawKey || typeof rawKey !== 'string') continue;
    const k = normalizeKey(rawKey);
    if (!k) continue;

    // 1. Check in-memory map
    const inMem = memoryStore.get(k);
    if (inMem && !isDecryptionErrorPlaceholder(inMem)) {
      return inMem;
    }

    // 2. Check localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(`aamarva_dec_${k}`);
        if (stored && !isDecryptionErrorPlaceholder(stored)) {
          memoryStore.set(k, stored);
          return stored;
        }
      }
    } catch {}

    // 3. Check sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(`aamarva_dec_${k}`) || sessionStorage.getItem(`aamarva_plain_${k}`);
        if (stored && !isDecryptionErrorPlaceholder(stored)) {
          memoryStore.set(k, stored);
          return stored;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Cache decrypted plaintext across all associated keys in memory and persistent storage
 */
export function cacheDecryptedMessage(
  plaintext: string,
  keys: (string | undefined | null)[]
): void {
  if (isDecryptionErrorPlaceholder(plaintext)) {
    return;
  }

  for (const rawKey of keys) {
    if (!rawKey || typeof rawKey !== 'string') continue;
    const k = normalizeKey(rawKey);
    if (!k) continue;

    memoryStore.set(k, plaintext);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`aamarva_dec_${k}`, plaintext);
      }
    } catch {}

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`aamarva_dec_${k}`, plaintext);
      }
    } catch {}
  }
}

/**
 * Convenience helper to store message plaintext with all standard key combinations
 */
export function rememberDecryptedMessage(
  msgId: string,
  plaintext: string,
  channelId?: string,
  extraKeys?: (string | undefined | null)[]
): void {
  if (isDecryptionErrorPlaceholder(plaintext)) return;

  const keys: (string | undefined | null)[] = [
    msgId,
    channelId ? `${channelId}_${msgId}` : undefined,
    ...(extraKeys || [])
  ];

  cacheDecryptedMessage(plaintext, keys);
}
