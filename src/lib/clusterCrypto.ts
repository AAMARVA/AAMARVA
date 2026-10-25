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

  const aad = constructAAD(cId, version, sId, epoch);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await cryptoObj.subtle.decrypt(
      {
        name: ENC_ALGO,
        iv: new Uint8Array(ivBuf),
        additionalData: aad
      },
      aesKey,
      cipherBuf
    );
  } catch (err: any) {
    throw new Error(`E2EE Error: Cluster message decryption/authentication failed: ${err?.message || 'Authentication tag failed'}`);
  }

  return new TextDecoder().decode(decryptedBuf);
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
  epoch: number
): Promise<{ iv: string; key: string; epoch: number; clusterId: string }> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();
  const rawBytes = typeof rawGroupKeyBytes === 'string' ? new Uint8Array(base64ToBuffer(rawGroupKeyBytes)) : rawGroupKeyBytes;

  const channelKey = await deriveChannelKey(senderPrivateKey, recipientPublicKeyJwk, cId);
  const wrapIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const wrapAAD = new TextEncoder().encode(`aamarva-cluster-group-key:${cId}:${epoch}`);

  const wrappedBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv: wrapIv,
      additionalData: wrapAAD
    },
    channelKey,
    rawBytes
  );

  return {
    iv: bufferToBase64(wrapIv.buffer),
    key: bufferToBase64(wrappedBuf),
    epoch,
    clusterId: cId
  };
}

/**
 * Unwraps an encrypted group key distribution package using the recipient member's private key.
 */
export async function unwrapClusterGroupKeyFromPackage(
  packageData: { iv: string; key: string } | string,
  recipientPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: any,
  clusterId: string,
  epoch: number
): Promise<{ groupKey: CryptoKey; rawKey: Uint8Array; base64: string }> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();

  let parsed: { iv: string; key: string };
  if (typeof packageData === 'string') {
    parsed = JSON.parse(packageData);
  } else {
    parsed = packageData;
  }

  const channelKey = await deriveChannelKey(recipientPrivateKey, senderPublicKeyJwk, cId);
  const wrapIvBuf = base64ToBuffer(parsed.iv);
  const wrappedBuf = base64ToBuffer(parsed.key);
  const wrapAAD = new TextEncoder().encode(`aamarva-cluster-group-key:${cId}:${epoch}`);

  let rawBytesBuf: ArrayBuffer;
  try {
    rawBytesBuf = await cryptoObj.subtle.decrypt(
      {
        name: ENC_ALGO,
        iv: new Uint8Array(wrapIvBuf),
        additionalData: wrapAAD
      },
      channelKey,
      wrappedBuf
    );
  } catch (err: any) {
    throw new Error(`E2EE Error: Failed to unwrap cluster group key for epoch ${epoch}: ${err?.message}`);
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
