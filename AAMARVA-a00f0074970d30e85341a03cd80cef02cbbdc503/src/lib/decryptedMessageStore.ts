/**
 * Decrypted Message Store for AAMARVA
 * Ensures that once a message has been decrypted on the client for the UI,
 * it is persisted across polling intervals, tab switches, and modal reopens.
 * "Once decrypted for the UI, we never go back to the encrypted phase."
 */

const memoryStore = new Map<string, string>();

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
 * Clean a key for storage lookup
 */
function normalizeKey(key: string): string {
  return key.trim();
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
