import { normalizeAgentId, deriveChannelKey, bufferToBase64, base64ToBuffer, constructAAD } from './e2ee';

const ENC_ALGO = 'AES-GCM';

/**
 * Generates a fresh 256-bit symmetric AES-GCM encryption key for a cluster epoch.
 */
export async function generateClusterGroupKey(): Promise<{
  key: CryptoKey;
  rawKey: Uint8Array;
  base64: string;
  fingerprint: string;
}> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const rawBytes = cryptoObj.getRandomValues(new Uint8Array(32));
  const key = await cryptoObj.subtle.importKey(
    'raw',
    rawBytes,
    { name: ENC_ALGO, length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const base64 = bufferToBase64(rawBytes.buffer);
  const digestBuf = await cryptoObj.subtle.digest('SHA-256', rawBytes);
  const hex = Array.from(new Uint8Array(digestBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
  const fingerprint = `SHA256:${hex}`;
  return { key, rawKey: rawBytes, base64, fingerprint };
}

/**
 * Encrypts a cluster message exactly once using the cluster's shared symmetric group key.
 * Message encryption cost is O(1) regardless of member count.
 * Returns Base64 ciphertext, unique 12-byte nonce (IV), protocol version (2), and keyEpoch.
 */
export async function encryptClusterMessage(
  plaintext: string,
  groupKey: CryptoKey | string | Uint8Array,
  senderAgentId: string,
  clusterId: string = 'general',
  keyEpoch: number = 1
): Promise<{
  ciphertext: string;
  nonce: string;
  version: number;
  keyEpoch: number;
}> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('E2EE Error: Plaintext message content cannot be empty.');
  }
  if (!groupKey) {
    throw new Error('E2EE Error: Missing cluster group key for encryption.');
  }
  if (
    keyEpoch === undefined ||
    keyEpoch === null ||
    typeof keyEpoch !== 'number' ||
    !Number.isFinite(keyEpoch) ||
    !Number.isInteger(keyEpoch) ||
    keyEpoch < 1
  ) {
    throw new Error('E2EE Error: Missing or invalid keyEpoch. keyEpoch must be a positive integer (>= 1).');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const version = 2;
  const sId = normalizeAgentId(senderAgentId);
  const cId = (clusterId || '').trim();
  const epoch = keyEpoch;

  // Resolve group key as CryptoKey
  let aesKey: CryptoKey;
  if (typeof groupKey === 'string') {
    const rawBuf = base64ToBuffer(groupKey.trim());
    aesKey = await cryptoObj.subtle.importKey(
      'raw',
      rawBuf,
      { name: ENC_ALGO, length: 256 },
      false,
      ['encrypt']
    );
  } else if (groupKey instanceof Uint8Array || groupKey instanceof ArrayBuffer) {
    const u8 = groupKey instanceof Uint8Array ? groupKey : new Uint8Array(groupKey);
    aesKey = await cryptoObj.subtle.importKey(
      'raw',
      u8,
      { name: ENC_ALGO, length: 256 },
      false,
      ['encrypt']
    );
  } else {
    aesKey = groupKey;
  }

  // Generate unique 12-byte (96-bit) initialization vector
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const aad = constructAAD(cId, version, sId, epoch);

  const cipherBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv,
      additionalData: aad
    },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(cipherBuf),
    nonce: bufferToBase64(iv.buffer),
    version,
    keyEpoch: epoch
  };
}

/**
 * Decrypts a cluster message using the cluster's shared symmetric group key.
 * Authenticates AAD context (clusterId, version, senderAgentId, keyEpoch) and ciphertext integrity.
 */
export async function decryptClusterMessage(
  ciphertext: string,
  nonce: string,
  groupKey: CryptoKey | string | Uint8Array,
  senderAgentId: string,
  clusterId: string = 'general',
  keyEpoch: number = 1,
  version: number = 2
): Promise<string> {
  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim().length === 0) {
    throw new Error('E2EE Error: Missing ciphertext payload.');
  }
  if (!nonce || typeof nonce !== 'string' || nonce.trim().length === 0) {
    throw new Error('E2EE Error: Missing nonce (IV).');
  }
  if (!groupKey) {
    throw new Error('E2EE Error: Missing cluster group key for decryption.');
  }
  if (typeof version !== 'number' || version !== 2) {
    throw new Error(`E2EE Error: Unsupported protocol version (${version}). Only version 2 is supported.`);
  }
  if (
    typeof keyEpoch !== 'number' ||
    !Number.isFinite(keyEpoch) ||
    !Number.isInteger(keyEpoch) ||
    keyEpoch < 1
  ) {
    throw new Error('E2EE Error: Missing or invalid keyEpoch. keyEpoch must be a positive integer (>= 1).');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const sId = normalizeAgentId(senderAgentId);
  const cId = (clusterId || '').trim();
  const epoch = keyEpoch;

  let aesKey: CryptoKey;
  if (typeof groupKey === 'string') {
    const rawBuf = base64ToBuffer(groupKey.trim());
    aesKey = await cryptoObj.subtle.importKey(
      'raw',
      rawBuf,
      { name: ENC_ALGO, length: 256 },
      false,
      ['decrypt']
    );
  } else if (groupKey instanceof Uint8Array || groupKey instanceof ArrayBuffer) {
    const u8 = groupKey instanceof Uint8Array ? groupKey : new Uint8Array(groupKey);
    aesKey = await cryptoObj.subtle.importKey(
      'raw',
      u8,
      { name: ENC_ALGO, length: 256 },
      false,
      ['decrypt']
    );
  } else {
    aesKey = groupKey;
  }

  let ivBuf: ArrayBuffer;
  let cipherBuf: ArrayBuffer;
  try {
    ivBuf = base64ToBuffer(nonce.trim());
    cipherBuf = base64ToBuffer(ciphertext.trim());
  } catch (err: any) {
    throw new Error(`E2EE Error: Failed to decode base64 buffer: ${err?.message || 'Invalid encoding'}`);
  }

  if (ivBuf.byteLength !== 12) {
    throw new Error('E2EE Error: Invalid nonce. Nonce must be 12 bytes.');
  }

  const primaryAAD = constructAAD(cId, version, sId, epoch);
  const sIdRaw = (senderAgentId || '').trim();
  const aadCandidates: Array<Uint8Array | undefined> = [
    primaryAAD,
    new TextEncoder().encode(`AAMARVA:E2EE:v1:${cId}:${sIdRaw}`),
    new TextEncoder().encode(`AAMARVA:E2EE:v1:${cId}:${sId.toLowerCase()}`),
    new TextEncoder().encode(`aamarva-cluster-group-key:${cId}:${epoch}`),
    undefined
  ];

  let decryptedBuf: ArrayBuffer | null = null;
  let lastErr: any = null;
  for (const candidateAAD of aadCandidates) {
    try {
      decryptedBuf = await cryptoObj.subtle.decrypt(
        candidateAAD
          ? { name: ENC_ALGO, iv: new Uint8Array(ivBuf), additionalData: candidateAAD }
          : { name: ENC_ALGO, iv: new Uint8Array(ivBuf) },
        aesKey,
        cipherBuf
      );
      if (decryptedBuf) break;
    } catch (err: any) {
      lastErr = err;
    }
  }

  if (!decryptedBuf) {
    throw new Error(`E2EE Error: Cluster message decryption/authentication failed: ${lastErr?.message || 'Authentication tag failed'}`);
  }

  return new TextDecoder().decode(decryptedBuf);
}

export interface ClusterKeyWrapOptions {
  senderPublicKey?: any;
  senderAgentId?: string;
  recipientAgentId?: string;
  recipientKeyFingerprint?: string;
}

export interface WrappedClusterKeyPackage {
  iv: string;
  key: string;
  epoch: number;
  clusterId: string;
  senderAgentId?: string;
  senderPublicKey?: any;
  recipientAgentId?: string;
  recipientPublicKey?: any;
  recipientKeyFingerprint?: string;
  aad?: string;
  hkdfSalt?: string;
  hkdfInfo?: string;
  wrappingParams?: {
    algorithm: string;
    kdf: string;
    curve: string;
    hkdfHash: string;
    hkdfSalt: string;
    hkdfInfo: string;
    aad: string;
    iv: string;
    senderAgentId?: string;
    senderPublicKey?: any;
    recipientAgentId?: string;
    recipientPublicKey?: any;
    recipientKeyFingerprint?: string;
  };
}

/**
 * Wraps the raw symmetric group key for a member using pairwise ECDH + HKDF.
 * Used during key distribution to deliver the group key securely to an authorized member.
 */
export async function wrapClusterGroupKeyForMember(
  rawGroupKeyBytes: Uint8Array | string,
  senderPrivateKey: CryptoKey | string,
  recipientPublicKeyJwk: any,
  clusterId: string,
  epoch: number,
  options?: ClusterKeyWrapOptions
): Promise<WrappedClusterKeyPackage> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();
  const rawBytes = typeof rawGroupKeyBytes === 'string' ? new Uint8Array(base64ToBuffer(rawGroupKeyBytes)) : rawGroupKeyBytes;

  const channelKey = await deriveChannelKey(senderPrivateKey, recipientPublicKeyJwk, cId);
  const wrapIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const aadStr = `aamarva-cluster-group-key:${cId}:${epoch}`;
  const wrapAAD = new TextEncoder().encode(aadStr);

  const wrappedBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv: wrapIv,
      additionalData: wrapAAD
    },
    channelKey,
    rawBytes
  );

  const ivB64 = bufferToBase64(wrapIv.buffer);
  const keyB64 = bufferToBase64(wrappedBuf);
  const hkdfSaltStr = 'aamarva-e2ee-channel-v1';
  const hkdfInfoStr = `aamarva-channel:${cId}`;

  let parsedSenderPub: any = undefined;
  if (options?.senderPublicKey) {
    try {
      parsedSenderPub = typeof options.senderPublicKey === 'string'
        ? JSON.parse(options.senderPublicKey)
        : options.senderPublicKey;
    } catch {
      parsedSenderPub = options.senderPublicKey;
    }
  }

  let parsedRecipientPub: any = undefined;
  if (recipientPublicKeyJwk) {
    try {
      parsedRecipientPub = typeof recipientPublicKeyJwk === 'string'
        ? JSON.parse(recipientPublicKeyJwk)
        : recipientPublicKeyJwk;
    } catch {
      parsedRecipientPub = recipientPublicKeyJwk;
    }
  }

  const normSenderId = options?.senderAgentId ? normalizeAgentId(options.senderAgentId) : undefined;
  const normRecipId = options?.recipientAgentId ? normalizeAgentId(options.recipientAgentId) : undefined;

  return {
    iv: ivB64,
    key: keyB64,
    epoch,
    clusterId: cId,
    ...(normSenderId ? { senderAgentId: normSenderId } : {}),
    ...(parsedSenderPub ? { senderPublicKey: parsedSenderPub } : {}),
    ...(normRecipId ? { recipientAgentId: normRecipId } : {}),
    ...(parsedRecipientPub ? { recipientPublicKey: parsedRecipientPub } : {}),
    ...(options?.recipientKeyFingerprint ? { recipientKeyFingerprint: options.recipientKeyFingerprint } : {}),
    aad: aadStr,
    hkdfSalt: hkdfSaltStr,
    hkdfInfo: hkdfInfoStr,
    wrappingParams: {
      algorithm: 'AES-256-GCM',
      kdf: 'ECDH-P256-HKDF-SHA256',
      curve: 'P-256',
      hkdfHash: 'SHA-256',
      hkdfSalt: hkdfSaltStr,
      hkdfInfo: hkdfInfoStr,
      aad: aadStr,
      iv: ivB64,
      ...(normSenderId ? { senderAgentId: normSenderId } : {}),
      ...(parsedSenderPub ? { senderPublicKey: parsedSenderPub } : {}),
      ...(normRecipId ? { recipientAgentId: normRecipId } : {}),
      ...(parsedRecipientPub ? { recipientPublicKey: parsedRecipientPub } : {}),
      ...(options?.recipientKeyFingerprint ? { recipientKeyFingerprint: options.recipientKeyFingerprint } : {})
    }
  };
}

/**
 * Unwraps an encrypted group key distribution package using the recipient member's private key.
 */
export async function unwrapClusterGroupKeyFromPackage(
  packageData: { iv: string; key: string; [k: string]: any } | string,
  recipientPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: any,
  clusterId: string,
  epoch: number
): Promise<{ groupKey: CryptoKey; rawKey: Uint8Array; base64: string }> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();

  let parsed: { iv: string; key: string; [k: string]: any };
  if (typeof packageData === 'string') {
    parsed = JSON.parse(packageData);
  } else {
    parsed = packageData;
  }

  const wrapIvBuf = base64ToBuffer(parsed.iv || parsed.nonce);
  const wrappedBuf = base64ToBuffer(parsed.key || parsed.ciphertext);

  // Collect candidate sender public keys (preferring the exact senderPublicKey embedded in the package)
  const senderKeyCandidates: any[] = [];
  const embeddedSenderKey = parsed.senderPublicKey || parsed.senderPublicKeyJwk || parsed.wrappingParams?.senderPublicKey;
  if (embeddedSenderKey) {
    senderKeyCandidates.push(embeddedSenderKey);
  }
  if (senderPublicKeyJwk) {
    senderKeyCandidates.push(senderPublicKeyJwk);
  }

  if (senderKeyCandidates.length === 0) {
    throw new Error(`E2EE Error: Missing senderPublicKey required to unwrap cluster group key for epoch ${epoch}.`);
  }

  const canonicalAAD = new TextEncoder().encode(`aamarva-cluster-group-key:${cId}:${epoch}`);
  const aadCandidates: Array<Uint8Array | undefined> = [canonicalAAD];
  if (typeof parsed.aad === 'string' && parsed.aad !== `aamarva-cluster-group-key:${cId}:${epoch}`) {
    aadCandidates.push(new TextEncoder().encode(parsed.aad));
  }
  if (typeof parsed.wrappingParams?.aad === 'string') {
    aadCandidates.push(new TextEncoder().encode(parsed.wrappingParams.aad));
  }
  aadCandidates.push(undefined);

  let rawBytesBuf: ArrayBuffer | null = null;
  let lastErr: any = null;

  for (const candidatePubKey of senderKeyCandidates) {
    try {
      const channelKey = await deriveChannelKey(recipientPrivateKey, candidatePubKey, cId);
      for (const candidateAAD of aadCandidates) {
        try {
          rawBytesBuf = await cryptoObj.subtle.decrypt(
            candidateAAD
              ? { name: ENC_ALGO, iv: new Uint8Array(wrapIvBuf), additionalData: candidateAAD }
              : { name: ENC_ALGO, iv: new Uint8Array(wrapIvBuf) },
            channelKey,
            wrappedBuf
          );
          if (rawBytesBuf) break;
        } catch (decErr: any) {
          lastErr = decErr;
        }
      }
      if (rawBytesBuf) break;
    } catch (keyErr: any) {
      lastErr = keyErr;
    }
  }

  if (!rawBytesBuf) {
    throw new Error(`E2EE Error: Failed to unwrap cluster group key for epoch ${epoch}: ${lastErr?.message || 'OperationError'}`);
  }

  const rawBytes = new Uint8Array(rawBytesBuf);
  const groupKey = await cryptoObj.subtle.importKey(
    'raw',
    rawBytes,
    { name: ENC_ALGO, length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  return {
    groupKey,
    rawKey: rawBytes,
    base64: bufferToBase64(rawBytesBuf)
  };
}
