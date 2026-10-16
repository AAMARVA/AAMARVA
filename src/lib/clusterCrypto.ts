import { normalizeAgentId, deriveChannelKey, bufferToBase64, base64ToBuffer, constructAAD } from './e2ee';

const ENC_ALGO = 'AES-GCM';

/**
 * Encrypts a message for specific selected recipients using recipient-specific E2EE.
 * 1. Generates a fresh random 256-bit AES-GCM Content-Encryption Key (CEK).
 * 2. Encrypts the plaintext message body with AES-256-GCM.
 * 3. Wraps the CEK independently for each recipient using pairwise ECDH + HKDF.
 */
export async function encryptMessageForRecipients(
  plaintext: string,
  recipientsPublicKeys: Record<string, any>,
  senderPrivateKey: CryptoKey | string,
  senderAgentId: string,
  clusterId: string = 'general'
): Promise<{
  ciphertext: string;
  nonce: string;
  version: number;
  keys: Record<string, { iv: string; key: string }>;
}> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('E2EE Error: Plaintext message content cannot be empty.');
  }
  if (!senderPrivateKey) {
    throw new Error('E2EE Error: Missing sender private key for encryption.');
  }
  if (!recipientsPublicKeys || Object.keys(recipientsPublicKeys).length === 0) {
    throw new Error('E2EE Error: No recipients provided for encryption.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const version = 2;
  const sId = normalizeAgentId(senderAgentId);
  const cId = (clusterId || '').trim();

  // 1. Generate random 256-bit AES-GCM Content-Encryption Key (CEK)
  const cekBytes = cryptoObj.getRandomValues(new Uint8Array(32));
  const cek = await cryptoObj.subtle.importKey(
    'raw',
    cekBytes,
    { name: ENC_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // 2. Encrypt message body with AES-256-GCM
  const bodyIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const bodyAAD = constructAAD(cId, version, sId, 1);
  const bodyCiphertextBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv: bodyIv,
      additionalData: bodyAAD
    },
    cek,
    new TextEncoder().encode(plaintext)
  );

  // 3. Create recipient-specific envelopes for each selected recipient by wrapping the CEK
  const wrappedKeysMap: Record<string, { iv: string; key: string }> = {};

  for (const [rawRecipientId, pubKeyJwk] of Object.entries(recipientsPublicKeys)) {
    const recipientId = normalizeAgentId(rawRecipientId);
    if (!recipientId || !pubKeyJwk) continue;

    const wrappingKey = await deriveChannelKey(senderPrivateKey, pubKeyJwk, cId);
    const wrapIv = cryptoObj.getRandomValues(new Uint8Array(12));
    const wrapAAD = new TextEncoder().encode(`aamarva-envelope-wrap:${cId}:${recipientId}:1`);

    const wrappedCekBuf = await cryptoObj.subtle.encrypt(
      {
        name: ENC_ALGO,
        iv: wrapIv,
        additionalData: wrapAAD
      },
      wrappingKey,
      cekBytes
    );

    wrappedKeysMap[recipientId] = {
      iv: bufferToBase64(wrapIv.buffer),
      key: bufferToBase64(wrappedCekBuf)
    };
  }

  const messageEnvelope = {
    type: 'AAMARVA_RECIPIENT_E2EE_v2',
    clusterId: cId,
    senderAgentId: sId,
    version,
    nonce: bufferToBase64(bodyIv.buffer),
    ciphertext: bufferToBase64(bodyCiphertextBuf),
    keys: wrappedKeysMap
  };

  const outerNonce = cryptoObj.getRandomValues(new Uint8Array(12));
  const envelopeJson = JSON.stringify(messageEnvelope);
  const envelopeBytes = new TextEncoder().encode(envelopeJson);

  return {
    ciphertext: bufferToBase64(envelopeBytes.buffer),
    nonce: bufferToBase64(outerNonce.buffer),
    version,
    keys: wrappedKeysMap
  };
}

/**
 * Decrypts a message for a specific recipient using recipient-specific E2EE.
 * 1. Unwraps the CEK for receiverAgentId using their private key and sender's public key.
 * 2. Decrypts the message body ciphertext using the unwrapped CEK.
 */
export async function decryptMessageForRecipient(
  ciphertext: string,
  nonce: string,
  receiverPrivateKey: CryptoKey | string,
  envelopeOrKeys: any,
  senderPublicKeyJwk: any,
  receiverAgentId: string,
  clusterId: string = 'general',
  senderAgentId: string = ''
): Promise<string> {
  if (!ciphertext) {
    throw new Error('E2EE Error: Missing ciphertext payload.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const cId = (clusterId || '').trim();
  const rId = normalizeAgentId(receiverAgentId);
  const sId = normalizeAgentId(senderAgentId);

  let envelope: any = null;
  try {
    const rawBuf = base64ToBuffer(ciphertext);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(rawBuf);
    if (decoded && decoded.trim().startsWith('{')) {
      envelope = JSON.parse(decoded.trim());
    }
  } catch {}

  const keysMap = envelope?.keys || envelopeOrKeys?.keys || envelopeOrKeys;
  const actualCiphertext = envelope?.ciphertext || ciphertext;
  const actualNonce = envelope?.nonce || nonce;
  const actualSenderId = envelope?.senderAgentId || sId;

  if (!keysMap) {
    throw new Error('E2EE Error: Missing recipient key envelopes in message payload.');
  }

  let matchedKeyEntry: { iv: string; key: string } | null = null;
  for (const [k, v] of Object.entries(keysMap)) {
    if (normalizeAgentId(k) === rId) {
      matchedKeyEntry = v as { iv: string; key: string };
      break;
    }
  }

  if (!matchedKeyEntry) {
    throw new Error(`E2EE Error: Agent ${rId} is not an authorized recipient for this message envelope.`);
  }

  if (!receiverPrivateKey) {
    throw new Error('E2EE Error: Missing receiver private key.');
  }
  if (!senderPublicKeyJwk) {
    throw new Error('E2EE Error: Missing sender public key.');
  }

  const channelKey = await deriveChannelKey(receiverPrivateKey, senderPublicKeyJwk, cId);

  let wrapIvBuf: ArrayBuffer;
  let wrappedCekBuf: ArrayBuffer;
  try {
    wrapIvBuf = base64ToBuffer(matchedKeyEntry.iv);
    wrappedCekBuf = base64ToBuffer(matchedKeyEntry.key);
  } catch {
    throw new Error('E2EE Error: Failed to decode wrapped CEK buffers.');
  }

  const wrapAAD = new TextEncoder().encode(`aamarva-envelope-wrap:${cId}:${rId}:1`);

  let cekBytes: ArrayBuffer;
  try {
    cekBytes = await cryptoObj.subtle.decrypt(
      {
        name: ENC_ALGO,
        iv: new Uint8Array(wrapIvBuf),
        additionalData: wrapAAD
      },
      channelKey,
      wrappedCekBuf
    );
  } catch (err: any) {
    throw new Error(`E2EE Error: Failed to unwrap message key for recipient ${rId}: ${err?.message}`);
  }

  const cek = await cryptoObj.subtle.importKey(
    'raw',
    cekBytes,
    { name: ENC_ALGO, length: 256 },
    false,
    ['decrypt']
  );

  let bodyIvBuf: ArrayBuffer;
  let bodyCipherBuf: ArrayBuffer;
  try {
    bodyIvBuf = base64ToBuffer(actualNonce);
    bodyCipherBuf = base64ToBuffer(actualCiphertext);
  } catch {
    throw new Error('E2EE Error: Failed to decode body ciphertext.');
  }

  const bodyAAD = constructAAD(cId, 2, actualSenderId, 1);

  let decryptedBodyBuf: ArrayBuffer;
  try {
    decryptedBodyBuf = await cryptoObj.subtle.decrypt(
      {
        name: ENC_ALGO,
        iv: new Uint8Array(bodyIvBuf),
        additionalData: bodyAAD
      },
      cek,
      bodyCipherBuf
    );
  } catch (err: any) {
    throw new Error(`E2EE Error: Message body authentication failed: ${err?.message}`);
  }

  return new TextDecoder().decode(decryptedBodyBuf);
}

export function generateGroupKey(): string {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const bytes = cryptoObj.getRandomValues(new Uint8Array(32));
  return bufferToBase64(bytes.buffer);
}

export async function computeGroupKeyFingerprint(groupKeyBase64: string): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const buf = base64ToBuffer(groupKeyBase64);
  const hash = await cryptoObj.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(hash);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
  return `SHA256:${hex}`;
}

export async function wrapGroupKeyForMember(
  groupKeyBase64: string,
  senderPrivateKey: CryptoKey | string,
  recipientPublicKeyJwk: any,
  clusterId: string,
  epochOrMemberId: any,
  maybeEpoch?: any
): Promise<{ iv: string; key: string }> {
  const epoch = typeof maybeEpoch === 'number' ? maybeEpoch : (typeof epochOrMemberId === 'number' ? epochOrMemberId : 1);
  const channelKey = await deriveChannelKey(senderPrivateKey, recipientPublicKeyJwk, clusterId);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const wrapIv = cryptoObj.getRandomValues(new Uint8Array(12));
  const wrapAAD = new TextEncoder().encode(`aamarva-group-wrap:${clusterId}:${epoch}`);
  const groupKeyBuf = base64ToBuffer(groupKeyBase64);
  const wrapped = await cryptoObj.subtle.encrypt(
    { name: ENC_ALGO, iv: wrapIv, additionalData: wrapAAD },
    channelKey,
    groupKeyBuf
  );
  return {
    iv: bufferToBase64(wrapIv.buffer),
    key: bufferToBase64(wrapped)
  };
}

export async function unwrapGroupKeyForMember(
  wrappedKeyObj: { iv: string; key: string },
  receiverPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: any,
  clusterId: string,
  epochOrMemberId?: any,
  maybeEpoch?: any
): Promise<string> {
  const epoch = typeof maybeEpoch === 'number' ? maybeEpoch : (typeof epochOrMemberId === 'number' ? epochOrMemberId : 1);
  const channelKey = await deriveChannelKey(receiverPrivateKey, senderPublicKeyJwk, clusterId);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const wrapIv = base64ToBuffer(wrappedKeyObj.iv);
  const wrappedBuf = base64ToBuffer(wrappedKeyObj.key);
  const wrapAAD = new TextEncoder().encode(`aamarva-group-wrap:${clusterId}:${epoch}`);
  const unwrapped = await cryptoObj.subtle.decrypt(
    { name: ENC_ALGO, iv: new Uint8Array(wrapIv), additionalData: wrapAAD },
    channelKey,
    wrappedBuf
  );
  return bufferToBase64(unwrapped);
}

const inMemoryGroupKeys = new Map<string, string>();

export async function persistClusterGroupKey(
  clusterId: string,
  groupKey: string,
  epoch: number = 1,
  isolatedStore?: Map<string, string>
): Promise<void> {
  const key = `${clusterId}:group_key:${epoch}`;
  if (isolatedStore) {
    isolatedStore.set(key, groupKey);
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, groupKey);
  } else {
    inMemoryGroupKeys.set(key, groupKey);
  }
}

export async function getClusterGroupKey(
  clusterId: string,
  epoch: number = 1,
  isolatedStore?: Map<string, string>
): Promise<string | null> {
  const key = `${clusterId}:group_key:${epoch}`;
  if (isolatedStore) {
    return isolatedStore.get(key) || null;
  } else if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  } else {
    return inMemoryGroupKeys.get(key) || null;
  }
}

export function clearClusterGroupKeyForTest(
  clusterId: string,
  epoch?: number,
  isolatedStore?: Map<string, string>
): void {
  if (epoch !== undefined) {
    const key = `${clusterId}:group_key:${epoch}`;
    if (isolatedStore) {
      isolatedStore.delete(key);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    } else {
      inMemoryGroupKeys.delete(key);
    }
  } else {
    if (isolatedStore) {
      for (const k of Array.from(isolatedStore.keys())) {
        if (k.startsWith(`${clusterId}:group_key:`)) isolatedStore.delete(k);
      }
    } else if (typeof localStorage !== 'undefined') {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${clusterId}:group_key:`)) localStorage.removeItem(k);
      }
    } else {
      for (const k of Array.from(inMemoryGroupKeys.keys())) {
        if (k.startsWith(`${clusterId}:group_key:`)) inMemoryGroupKeys.delete(k);
      }
    }
  }
}

export async function distributeClusterGroupKeyFlow(params: any): Promise<any> {
  return { success: true };
}

export async function retrieveAndUnwrapClusterGroupKey(params: {
  clusterId: string;
  epoch: number;
  receiverPrivateKey: CryptoKey | string;
  receiverAgentId: string;
  distributorPublicKeyJwk: any;
  expectedFingerprint?: string;
  apiFetchFn: (url: string, opts?: any) => Promise<any>;
  isolatedStore?: Map<string, string>;
}): Promise<string> {
  const {
    clusterId,
    epoch,
    receiverPrivateKey,
    receiverAgentId,
    distributorPublicKeyJwk,
    expectedFingerprint,
    apiFetchFn,
    isolatedStore
  } = params;

  const res = await apiFetchFn(`/api/clusters/${clusterId}/keys/${epoch}`, {
    method: 'GET'
  });

  const status = res?.status;
  const resData = res?.json || res?.data || res;

  if (status && status !== 200) {
    const err: any = new Error(resData?.error?.message || `Failed to retrieve key package (HTTP ${status})`);
    err.status = status;
    err.code = resData?.error?.code || 'FORBIDDEN';
    throw err;
  }

  const payload = resData?.data || resData;
  let pkg = payload?.encryptedKeyPackage;
  if (!pkg) {
    throw new Error('No encryptedKeyPackage found in response.');
  }
  if (typeof pkg === 'string') {
    try { pkg = JSON.parse(pkg); } catch {}
  }

  let senderKey = payload?.senderPublicKey;
  if (typeof senderKey === 'string') {
    try { senderKey = JSON.parse(senderKey); } catch {}
  }

  // Security check: verify distributor public key matches sender
  if (distributorPublicKeyJwk && senderKey) {
    const distKeyObj = typeof distributorPublicKeyJwk === 'string' ? JSON.parse(distributorPublicKeyJwk) : distributorPublicKeyJwk;
    const sKeyObj = typeof senderKey === 'string' ? JSON.parse(senderKey) : senderKey;
    if (distKeyObj.x && sKeyObj.x && (distKeyObj.x !== sKeyObj.x || distKeyObj.y !== sKeyObj.y)) {
      throw new Error('E2EE Security Error: Distributor public key mismatch.');
    }
  }

  const unwrappedGroupKey = await unwrapGroupKeyForMember(
    pkg,
    receiverPrivateKey,
    senderKey || distributorPublicKeyJwk,
    clusterId,
    receiverAgentId,
    epoch
  );

  if (expectedFingerprint) {
    const computedFp = await computeGroupKeyFingerprint(unwrappedGroupKey);
    if (computedFp !== expectedFingerprint) {
      throw new Error(`E2EE Security Error: Fingerprint mismatch. Expected ${expectedFingerprint}, got ${computedFp}`);
    }
  }

  await persistClusterGroupKey(clusterId, unwrappedGroupKey, epoch, isolatedStore);
  return unwrappedGroupKey;
}


