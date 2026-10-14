import { 
  bufferToBase64, 
  base64ToBuffer, 
  deriveChannelKey, 
  persistClusterGroupKey, 
  getClusterGroupKey,
  normalizeAgentId
} from './e2ee';

const ENC_ALGO = 'AES-GCM';

/**
 * Generates a cryptographically secure 256-bit random symmetric group key.
 */
export async function generateGroupKey(): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const randomBytes = cryptoObj.getRandomValues(new Uint8Array(32));
  return bufferToBase64(randomBytes.buffer);
}

/**
 * Computes canonical SHA-256 fingerprint of the group key material.
 * Non-secret identifier representing the authoritative key identity.
 */
export async function computeGroupKeyFingerprint(groupKeyBase64: string): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const rawBuf = base64ToBuffer(groupKeyBase64);
  const digestBuf = await cryptoObj.subtle.digest('SHA-256', rawBuf);
  const hex = Array.from(new Uint8Array(digestBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
  return `SHA256:${hex}`;
}

/**
 * Wraps (encrypts) the shared group key for an authorized recipient using ECDH + HKDF + AES-256-GCM.
 * The wrapped package is bound to clusterId, recipientAgentId, and epoch via AAD.
 */
export async function wrapGroupKeyForMember(
  groupKeyBase64: string,
  senderPrivateKey: CryptoKey | string,
  memberPublicKeyJwk: string | object | CryptoKey,
  clusterId: string,
  recipientAgentId: string,
  epoch: number
): Promise<{ iv: string; key: string }> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const groupKeyRaw = base64ToBuffer(groupKeyBase64);
  const cId = (clusterId || '').trim();
  const rId = normalizeAgentId(recipientAgentId);
  
  // Use existing deriveChannelKey (NIST P-256 ECDH + HKDF-SHA256)
  const wrappingKey = await deriveChannelKey(senderPrivateKey, memberPublicKeyJwk, cId);
  
  // Encrypt the group key
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const wrapAAD = new TextEncoder().encode(`aamarva-key-wrap:${cId}:${rId}:${epoch}`);
  
  const wrappedKeyBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv,
      additionalData: wrapAAD
    },
    wrappingKey,
    groupKeyRaw
  );
  
  return {
    iv: bufferToBase64(iv.buffer),
    key: bufferToBase64(wrappedKeyBuf)
  };
}

// Export wrapGroupKey alias
export const wrapGroupKey = wrapGroupKeyForMember;

/**
 * Unwraps (decrypts) the received group key package using recipient's private key and sender's public key.
 */
export async function unwrapGroupKeyForMember(
  wrappedKey: { iv: string; key: string },
  receiverPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: string | object | CryptoKey,
  clusterId: string,
  recipientAgentId: string,
  epoch: number
): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();
  const rId = normalizeAgentId(recipientAgentId);
  const wrappingKey = await deriveChannelKey(receiverPrivateKey, senderPublicKeyJwk, cId);
  const ivBuf = base64ToBuffer(wrappedKey.iv);
  const wrappedKeyBuf = base64ToBuffer(wrappedKey.key);
  const wrapAAD = new TextEncoder().encode(`aamarva-key-wrap:${cId}:${rId}:${epoch}`);

  const groupKeyRaw = await cryptoObj.subtle.decrypt(
    {
      name: ENC_ALGO,
      iv: new Uint8Array(ivBuf),
      additionalData: wrapAAD
    },
    wrappingKey,
    wrappedKeyBuf
  );
  
  return bufferToBase64(groupKeyRaw);
}

// Alias for unwrapGroupKey
export const unwrapGroupKey = unwrapGroupKeyForMember;

/**
 * End-to-end client distribution flow:
 * 1. Generates or takes existing group key
 * 2. Computes its authoritative fingerprint
 * 3. Wraps the key individually for all active members
 * 4. Submits distribution map to server
 * 5. Persists the group key in local keystore under (clusterId, epoch)
 */
export async function distributeClusterGroupKeyFlow(params: {
  clusterId: string;
  epoch: number;
  senderPrivateKey: CryptoKey | string;
  senderAgentId: string;
  senderPublicKeyJwk?: string | object;
  members: Array<{ agentId: string; publicKey?: any; e2eePublicKey?: any }>;
  groupKeyBase64?: string;
  apiFetchFn?: (url: string, opts?: any) => Promise<any>;
  isolatedStore?: Map<string, string>;
}): Promise<{
  groupKeyBase64: string;
  keyFingerprint: string;
  epoch: number;
  distributionMap: Record<string, { iv: string; key: string }>;
}> {
  const { clusterId, epoch, senderPrivateKey, senderAgentId, members, isolatedStore } = params;
  const groupKeyBase64 = params.groupKeyBase64 || (await generateGroupKey());
  const keyFingerprint = await computeGroupKeyFingerprint(groupKeyBase64);

  const distributionMap: Record<string, { iv: string; key: string }> = {};

  for (const member of members) {
    const rawPubKey = member.e2eePublicKey || member.publicKey;
    if (!rawPubKey || !member.agentId) continue;
    const wrapped = await wrapGroupKeyForMember(
      groupKeyBase64,
      senderPrivateKey,
      rawPubKey,
      clusterId,
      member.agentId,
      epoch
    );
    distributionMap[member.agentId] = wrapped;
  }

  // Persist locally for the sender immediately
  await persistClusterGroupKey(clusterId, groupKeyBase64, epoch, isolatedStore);

  // If apiFetchFn provided, submit distribution package to server
  if (params.apiFetchFn) {
    await params.apiFetchFn(`/api/clusters/${clusterId}/keys`, {
      method: 'POST',
      body: JSON.stringify({
        epoch,
        keyFingerprint,
        distributionMap,
        senderPublicKey: params.senderPublicKeyJwk
      })
    });
  }

  return {
    groupKeyBase64,
    keyFingerprint,
    epoch,
    distributionMap
  };
}

function getCanonicalJwkKey(key: any): string {
  if (!key) return '';
  const parsed = typeof key === 'string' ? JSON.parse(key) : key;
  return JSON.stringify({
    crv: parsed.crv || 'P-256',
    kty: parsed.kty || 'EC',
    x: parsed.x,
    y: parsed.y
  });
}

const inFlightClusterKeyRetrievals = new Map<string, Promise<string>>();

export function clearInFlightClusterKeyRetrievals(): void {
  inFlightClusterKeyRetrievals.clear();
}

/**
 * End-to-end recipient retrieval and unwrap flow:
 * 1. Checks local keystore; returns if already present
 * 2. Reuses in-flight retrieval promise if another request for the same clusterId + epoch is already active
 * 3. Fetches assigned encrypted key package from GET /api/clusters/:clusterId/keys/:epoch
 * 4. Uses distributor public key from the server package and validates against authenticated distributor identity
 * 5. Unwraps group key using recipient's private key and validated distributor public key
 * 6. Verifies unwrapped group key against authoritative epoch fingerprint before persisting or using it
 * 7. Persists unwrapped key locally under (clusterId, epoch)
 */
export async function retrieveAndUnwrapClusterGroupKey(params: {
  clusterId: string;
  epoch: number;
  receiverPrivateKey: CryptoKey | string;
  receiverAgentId: string;
  senderPublicKeyJwk?: string | object;
  distributorPublicKeyJwk?: string | object;
  distributorAgentId?: string;
  expectedDistributorKey?: string | object;
  expectedFingerprint?: string;
  members?: Array<{ agentId: string; publicKey?: any; e2eePublicKey?: any; role?: string }>;
  apiFetchFn: (url: string, opts?: any) => Promise<any>;
  isolatedStore?: Map<string, string>;
}): Promise<string> {
  const { clusterId, epoch, receiverPrivateKey, receiverAgentId, apiFetchFn, isolatedStore } = params;

  // 1. Check local keystore
  const existingKey = await getClusterGroupKey(clusterId, epoch, isolatedStore);
  if (existingKey) {
    return existingKey;
  }

  // 2. Reuse an in-flight key retrieval for messages requiring the same cluster ID + epoch
  const inFlightKey = `${clusterId}#${epoch}#${normalizeAgentId(receiverAgentId)}`;
  const inFlightPromise = inFlightClusterKeyRetrievals.get(inFlightKey);
  if (inFlightPromise) {
    return inFlightPromise;
  }

  const retrievePromise = (async (): Promise<string> => {
    try {
      // 3. Fetch assigned package from server
      const res = await apiFetchFn(`/api/clusters/${clusterId}/keys/${epoch}`, {
        method: 'GET'
      });

      const packageData = res?.json?.data || res?.data || (res?.json ? res.json : res);
      if (!packageData || !packageData.iv || !packageData.key) {
        throw new Error(`Failed to retrieve valid key package for cluster ${clusterId} epoch ${epoch}`);
      }

      // 4. Extract distributor public key from the server's key package
      const distributorPublicKey = packageData.distributorPublicKey || packageData.senderPublicKey;
      if (!distributorPublicKey) {
        throw new Error(
          `SECURITY_ERROR: Server key package for cluster ${clusterId} epoch ${epoch} does not contain distributor public key.`
        );
      }

      // Validate distributor public key structure
      const parsedDistKey = typeof distributorPublicKey === 'string' ? JSON.parse(distributorPublicKey) : distributorPublicKey;
      if (!parsedDistKey || parsedDistKey.kty !== 'EC' || parsedDistKey.crv !== 'P-256' || !parsedDistKey.x || !parsedDistKey.y) {
        throw new Error('SECURITY_ERROR: Distributor public key from server package is malformed or invalid EC P-256 key.');
      }

      // 5. Validate that distributor public key matches the authenticated distributor identity
      const expectedDistributorKey = params.expectedDistributorKey || params.distributorPublicKeyJwk || params.senderPublicKeyJwk;
      if (expectedDistributorKey) {
        const canonicalPackageKey = getCanonicalJwkKey(distributorPublicKey);
        const canonicalExpectedKey = getCanonicalJwkKey(expectedDistributorKey);
        if (canonicalPackageKey !== canonicalExpectedKey) {
          throw new Error(
            `SECURITY_ERROR: Distributor public key from server package does not match authenticated distributor identity for cluster ${clusterId}.`
          );
        }
      } else if (params.members && params.members.length > 0) {
        const targetDistId = params.distributorAgentId;
        const distributorMember = params.members.find((m) =>
          targetDistId
            ? String(m.agentId || '').toLowerCase() === targetDistId.toLowerCase()
            : (m.role === 'admin' || m.role === 'owner')
        );
        if (distributorMember) {
          const memberRegisteredKey = distributorMember.e2eePublicKey || distributorMember.publicKey;
          if (memberRegisteredKey) {
            const canonicalPackageKey = getCanonicalJwkKey(distributorPublicKey);
            const canonicalMemberKey = getCanonicalJwkKey(memberRegisteredKey);
            if (canonicalPackageKey !== canonicalMemberKey) {
              throw new Error(
                `SECURITY_ERROR: Distributor public key does not match registered key of authenticated distributor ${distributorMember.agentId}.`
              );
            }
          }
        }
      }

      // 6. Unwrap group key using the validated distributor public key from server package
      const unwrappedGroupKey = await unwrapGroupKeyForMember(
        { iv: packageData.iv, key: packageData.key },
        receiverPrivateKey,
        distributorPublicKey,
        clusterId,
        receiverAgentId,
        epoch
      );

      // 7. Verify the unwrapped group key against the authoritative epoch fingerprint before persisting or using it
      const authoritativeFingerprint = params.expectedFingerprint || packageData.keyFingerprint;
      if (!authoritativeFingerprint) {
        throw new Error(`SECURITY_ERROR: Missing authoritative epoch fingerprint for cluster ${clusterId} epoch ${epoch}.`);
      }

      const computedFingerprint = await computeGroupKeyFingerprint(unwrappedGroupKey);
      if (computedFingerprint.toUpperCase() !== authoritativeFingerprint.trim().toUpperCase()) {
        throw new Error(
          `SECURITY_ERROR: Unwrapped group key fingerprint mismatch! Computed: ${computedFingerprint}, Authoritative: ${authoritativeFingerprint}. Key will not be persisted or used.`
        );
      }

      // 8. Persist locally under exact (clusterId, epoch) only after successful verification
      await persistClusterGroupKey(clusterId, unwrappedGroupKey, epoch, isolatedStore);

      return unwrappedGroupKey;
    } finally {
      inFlightClusterKeyRetrievals.delete(inFlightKey);
    }
  })();

  inFlightClusterKeyRetrievals.set(inFlightKey, retrievePromise);
  return retrievePromise;
}
