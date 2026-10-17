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
  clusterId: string = 'general',
  keyEpoch?: number
): Promise<{
  ciphertext: string;
  nonce: string;
  version: number;
  keyEpoch: number;
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
  if (keyEpoch === undefined || keyEpoch === null || typeof keyEpoch !== 'number' || !Number.isFinite(keyEpoch) || !Number.isInteger(keyEpoch) || keyEpoch < 1) {
    throw new Error('E2EE Error: Missing or invalid keyEpoch. keyEpoch must be a positive integer (>= 1).');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const version = 2;
  const sId = normalizeAgentId(senderAgentId);
  const cId = (clusterId || '').trim();
  const epoch = keyEpoch;

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
  const bodyAAD = constructAAD(cId, version, sId, epoch);
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
    const wrapAAD = new TextEncoder().encode(`aamarva-envelope-wrap:${cId}:${recipientId}:${epoch}`);

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
    keyEpoch: epoch,
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
    keyEpoch: epoch,
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
  senderAgentId: string = '',
  keyEpoch?: number
): Promise<string> {
  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim().length === 0) {
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

  // Enforce protocol version 2 (fail closed: reject missing, non-numeric, or unsupported versions)
  if (envelopeOrKeys && typeof envelopeOrKeys === 'object' && envelopeOrKeys.version !== undefined && envelopeOrKeys.version !== null) {
    if (typeof envelopeOrKeys.version !== 'number' || envelopeOrKeys.version !== 2) {
      throw new Error(`E2EE Error: Unsupported protocol version (${envelopeOrKeys.version}). Only recipient-envelope protocol version 2 is supported.`);
    }
  }
  if (envelope && envelope.version !== undefined && envelope.version !== null) {
    if (typeof envelope.version !== 'number' || envelope.version !== 2) {
      throw new Error(`E2EE Error: Unsupported protocol version (${envelope.version}). Only recipient-envelope protocol version 2 is supported.`);
    }
  }
  const rawVersion = envelope?.version ?? (envelopeOrKeys && typeof envelopeOrKeys === 'object' ? envelopeOrKeys.version : undefined);
  if (rawVersion === undefined || rawVersion === null || typeof rawVersion !== 'number' || rawVersion !== 2) {
    throw new Error(`E2EE Error: Missing or unsupported protocol version (${rawVersion}). Only recipient-envelope protocol version 2 is supported.`);
  }
  const version = 2;

  // Enforce keyEpoch (fail closed on missing or invalid epoch)
  const rawEpoch = (keyEpoch !== undefined && keyEpoch !== null) 
    ? keyEpoch 
    : (envelopeOrKeys && typeof envelopeOrKeys === 'object' && envelopeOrKeys.keyEpoch !== undefined && envelopeOrKeys.keyEpoch !== null)
      ? envelopeOrKeys.keyEpoch
      : envelope?.keyEpoch;
  if (rawEpoch === undefined || rawEpoch === null || typeof rawEpoch !== 'number' || !Number.isFinite(rawEpoch) || !Number.isInteger(rawEpoch) || rawEpoch < 1) {
    throw new Error('E2EE Error: Missing or invalid keyEpoch in message payload.');
  }
  const epoch = rawEpoch;

  const keysMap = envelope?.keys || envelopeOrKeys?.keys || (envelopeOrKeys && typeof envelopeOrKeys === 'object' && !envelopeOrKeys.version && !envelopeOrKeys.keys ? envelopeOrKeys : null);
  const actualCiphertext = envelope?.ciphertext || ciphertext;
  const actualNonce = envelope?.nonce || nonce;
  const actualSenderId = envelope?.senderAgentId || sId;

  if (!actualCiphertext || typeof actualCiphertext !== 'string' || actualCiphertext.trim().length === 0) {
    throw new Error('E2EE Error: Missing or invalid ciphertext in message payload.');
  }

  if (!actualNonce || typeof actualNonce !== 'string' || actualNonce.trim().length === 0) {
    throw new Error('E2EE Error: Missing or invalid nonce in message payload.');
  }

  if (!keysMap || typeof keysMap !== 'object' || Array.isArray(keysMap) || Object.keys(keysMap).length === 0) {
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

  if (!matchedKeyEntry.iv || !matchedKeyEntry.key || typeof matchedKeyEntry.iv !== 'string' || typeof matchedKeyEntry.key !== 'string') {
    throw new Error(`E2EE Error: Recipient envelope for agent ${rId} is malformed.`);
  }

  if (matchedKeyEntry.iv.trim().length === 0 || matchedKeyEntry.key.trim().length === 0) {
    throw new Error(`E2EE Error: Recipient envelope for agent ${rId} contains empty iv or key.`);
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

  const wrapAAD = new TextEncoder().encode(`aamarva-envelope-wrap:${cId}:${rId}:${epoch}`);

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

  const bodyAAD = constructAAD(cId, version, actualSenderId, epoch);

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
