import { apiFetch } from '../services/authApi';
import { 
  normalizeAgentId, 
  pinPeerKey, 
  savePeerEpochKey, 
  getPinnedPeerKey 
} from './e2ee';

export interface CachedPeerKeyData {
  connectionId: string;
  peerUserId?: string;
  peerAgentId?: string;
  peerPublicKey: string | null;
  peerKeyFingerprint?: string | null;
  peerIdentityKey?: string | null;
  peerKeySignature?: string | null;
  peerKeyEpoch?: number;
  peerEpochKeys?: Record<string, any>;
  fetchedAt: number;
  hasKey: boolean;
}

// In-memory cache for connection peer keys (TTL: 5 minutes)
const PEER_KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const connectionPeerKeyCache = new Map<string, CachedPeerKeyData>();
const inFlightPrefetches = new Map<string, Promise<CachedPeerKeyData | null>>();

// Rate-limiting backoff timestamp
let rateLimitedUntil = 0;

/**
 * Retrieves the cached peer public key data for a connection if fresh.
 */
export function getCachedPeerKey(connectionId: string): CachedPeerKeyData | null {
  if (!connectionId) return null;
  const cached = connectionPeerKeyCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < PEER_KEY_CACHE_TTL_MS) {
    return cached;
  }
  return null;
}

/**
 * Manually updates the cached peer public key data for a connection.
 */
export function setCachedPeerKey(connectionId: string, data: Partial<CachedPeerKeyData>): void {
  if (!connectionId) return;
  const existing = connectionPeerKeyCache.get(connectionId);
  const updated: CachedPeerKeyData = {
    connectionId,
    peerUserId: data.peerUserId ?? existing?.peerUserId,
    peerAgentId: data.peerAgentId ?? existing?.peerAgentId,
    peerPublicKey: data.peerPublicKey !== undefined ? data.peerPublicKey : (existing?.peerPublicKey ?? null),
    peerKeyFingerprint: data.peerKeyFingerprint ?? existing?.peerKeyFingerprint,
    peerIdentityKey: data.peerIdentityKey ?? existing?.peerIdentityKey,
    peerKeySignature: data.peerKeySignature ?? existing?.peerKeySignature,
    peerKeyEpoch: data.peerKeyEpoch ?? existing?.peerKeyEpoch ?? 1,
    peerEpochKeys: data.peerEpochKeys ?? existing?.peerEpochKeys ?? {},
    fetchedAt: Date.now(),
    hasKey: Boolean(data.peerPublicKey ?? existing?.peerPublicKey),
  };
  connectionPeerKeyCache.set(connectionId, updated);
}

/**
 * Clears the peer key prefetch cache.
 */
export function clearPeerKeyCache(): void {
  connectionPeerKeyCache.clear();
  inFlightPrefetches.clear();
  rateLimitedUntil = 0;
}

/**
 * Fetches the peer public key for a single connection and caches it.
 * Reuses existing in-flight request to avoid duplicate requests.
 */
export async function prefetchPeerKey(connectionId: string): Promise<CachedPeerKeyData | null> {
  if (!connectionId) return null;

  // 1. Check in-memory fresh cache
  const cached = getCachedPeerKey(connectionId);
  if (cached) {
    return cached;
  }

  // 2. Check if already fetching
  const inFlight = inFlightPrefetches.get(connectionId);
  if (inFlight) {
    return inFlight;
  }

  // 3. Respect active rate limit cooldown
  if (Date.now() < rateLimitedUntil) {
    return null;
  }

  const fetchPromise = (async (): Promise<CachedPeerKeyData | null> => {
    try {
      const res = await apiFetch(`/api/connections/${connectionId}/peer-key`, { authType: 'human' });
      if (res?.data) {
        const d = res.data;
        const normalizedPeerId = normalizeAgentId(d.peerAgentId);
        const epochNum = typeof d.peerKeyEpoch === 'number' ? d.peerKeyEpoch : 1;

        const entry: CachedPeerKeyData = {
          connectionId,
          peerUserId: d.peerUserId,
          peerAgentId: d.peerAgentId,
          peerPublicKey: d.peerE2eePublicKey || null,
          peerKeyFingerprint: d.peerKeyFingerprint || null,
          peerIdentityKey: d.peerIdentityKey || null,
          peerKeySignature: d.peerKeySignature || null,
          peerKeyEpoch: epochNum,
          peerEpochKeys: d.peerEpochKeys || {},
          fetchedAt: Date.now(),
          hasKey: Boolean(d.peerE2eePublicKey)
        };

        connectionPeerKeyCache.set(connectionId, entry);

        // Opportunistically pin peer key and epoch keys in IndexedDB / local cache if key is present
        if (d.peerE2eePublicKey && normalizedPeerId) {
          try {
            await pinPeerKey(
              normalizedPeerId,
              d.peerE2eePublicKey,
              d.peerIdentityKey || null,
              d.peerKeySignature || null,
              false,
              epochNum
            );

            if (d.peerEpochKeys && typeof d.peerEpochKeys === 'object') {
              for (const [epStr, epData] of Object.entries(d.peerEpochKeys)) {
                const epVal = parseInt(epStr, 10);
                if (!isNaN(epVal) && (epData as any)?.publicKey) {
                  await savePeerEpochKey(
                    normalizedPeerId,
                    epVal,
                    (epData as any).publicKey,
                    (epData as any).fingerprint,
                    (epData as any).identityKey,
                    (epData as any).signature
                  );
                }
              }
            }
          } catch {
            // Pinning errors in prefetch are non-fatal
          }
        }

        return entry;
      }
      return null;
    } catch (err: any) {
      if (err?.status === 429) {
        // Rate limit encountered: back off for 15 seconds
        rateLimitedUntil = Date.now() + 15000;
        console.warn('Peer-key prefetch paused due to rate limiting (429).');
      }
      return null;
    } finally {
      inFlightPrefetches.delete(connectionId);
    }
  })();

  inFlightPrefetches.set(connectionId, fetchPromise);
  return fetchPromise;
}

/**
 * Prefetches peer public keys for a list of connections with bounded concurrency.
 * Does not fire unbounded simultaneous requests or hammer endpoints.
 */
export async function prefetchPeerKeys(
  connections: Array<string | { id: string; status?: string }>,
  concurrency: number = 3
): Promise<void> {
  if (!Array.isArray(connections) || connections.length === 0) return;

  // Extract valid connection IDs that need prefetching
  const candidateIds: string[] = [];
  for (const item of connections) {
    const id = typeof item === 'string' ? item : item?.id;
    if (id && typeof id === 'string') {
      const cached = getCachedPeerKey(id);
      if (!cached && !inFlightPrefetches.has(id)) {
        candidateIds.push(id);
      }
    }
  }

  if (candidateIds.length === 0) return;

  // Bounded concurrency pool
  let cursor = 0;
  const poolSize = Math.max(1, Math.min(concurrency, candidateIds.length, 5));

  const worker = async () => {
    while (cursor < candidateIds.length) {
      if (Date.now() < rateLimitedUntil) break;
      const id = candidateIds[cursor++];
      try {
        await prefetchPeerKey(id);
      } catch {
        // Non-blocking
      }
    }
  };

  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);
}
