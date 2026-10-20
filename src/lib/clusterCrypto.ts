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

  const envelopeJson = JSON.stringify(messageEnvelope);
  const envelopeBytes = new TextEncoder().encode(envelopeJson);

  return {
    ciphertext: bufferToBase64(envelopeBytes.buffer),
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
    envelope = JSON.parse(decoded.trim());
  } catch (err: any) {
    throw new Error(`E2EE Error: Failed to parse envelope: ${err?.message || 'Invalid Base64 or JSON'}`);
  }

  if (!envelope || envelope.type !== 'AAMARVA_RECIPIENT_E2EE_v2') {
    throw new Error('E2EE Error: Unsupported or missing envelope type.');
  }

  // Validate version inside envelope
  if (typeof envelope.version !== 'number' || envelope.version !== 2) {
    throw new Error(`E2EE Error: Missing or unsupported protocol version in envelope (${envelope.version}). Only version 2 is supported.`);
  }
  const explicitVersion = (envelopeOrKeys && typeof envelopeOrKeys === 'object' && envelopeOrKeys.version !== undefined && envelopeOrKeys.version !== null)
    ? envelopeOrKeys.version
    : undefined;
  if (explicitVersion !== undefined && explicitVersion !== null && explicitVersion !== envelope.version) {
    throw new Error(`E2EE Error: Unsupported protocol version (${explicitVersion}).`);
  }
  const version = 2;

  // Validate keyEpoch inside envelope
  if (typeof envelope.keyEpoch !== 'number' || !Number.isFinite(envelope.keyEpoch) || !Number.isInteger(envelope.keyEpoch) || envelope.keyEpoch < 1) {
    throw new Error('E2EE Error: Missing or invalid keyEpoch in envelope.');
  }
  const explicitEpoch = (keyEpoch !== undefined && keyEpoch !== null) 
    ? keyEpoch 
    : (envelopeOrKeys && typeof envelopeOrKeys === 'object' && envelopeOrKeys.keyEpoch !== undefined && envelopeOrKeys.keyEpoch !== null)
      ? envelopeOrKeys.keyEpoch
      : undefined;
  if (explicitEpoch !== undefined && explicitEpoch !== null && explicitEpoch !== envelope.keyEpoch) {
    throw new Error(`E2EE Error: Mismatched keyEpoch (${explicitEpoch} vs envelope epoch ${envelope.keyEpoch}).`);
  }
  const epoch = envelope.keyEpoch;

  // Validate keysMap
  if (!envelope.keys || typeof envelope.keys !== 'object' || Array.isArray(envelope.keys) || Object.keys(envelope.keys).length === 0) {
    throw new Error('E2EE Error: Malformed envelope: missing or invalid keys map.');
  }
  const keysMap = envelope.keys;

  // Validate ciphertext and nonce
  if (!envelope.ciphertext || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.trim().length === 0) {
    throw new Error('E2EE Error: Malformed envelope: missing or invalid ciphertext.');
  }
  if (!envelope.nonce || typeof envelope.nonce !== 'string' || envelope.nonce.trim().length === 0) {
    throw new Error('E2EE Error: Malformed envelope: missing or invalid nonce.');
  }
  const actualCiphertext = envelope.ciphertext;
  const actualNonce = envelope.nonce;
  const actualSenderId = envelope.senderAgentId || sId;

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
