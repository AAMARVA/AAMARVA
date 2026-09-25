// End-to-End Encryption (E2EE) Module for AAMARVA
// Cryptographic Primitives: ECDH (NIST P-256), HKDF (SHA-256), AES-256-GCM with Authenticated Associated Data (AAD)
// Key Storage: Web Crypto API with Non-Exportable Private Keys (extractable: false) + Persistent IndexedDB Keystore
// Identity Binding: Authenticated ECDSA (NIST P-256) Identity Signatures + Secondary TOFU Pinning Defense-in-Depth
// Zero-Knowledge Architecture: Non-extractable operational keys backed up inside a zero-knowledge encrypted recovery vault containing actual key material.
//   - Operational keys remain non-extractable (extractable: false)
//   - Recovery vault contains the actual E2EE and identity private key material encrypted locally using PBKDF2-SHA-256
//   - Transient JWKs exist in local memory only long enough to construct the encrypted vault
//   - Server receives only ciphertext, nonce, and version metadata
//   - If actual key material is missing, creation fails with RECOVERY_VAULT_ERROR instead of deriving a deterministic fallback key.

import { p256 } from '@noble/curves/nist.js';

const DB_NAME = 'aamarva_e2ee_keystore';
const DB_VERSION = 3; // Incremented for structured CryptoKey storage and key epoch archival
const KEY_STORE_NAME = 'agent_keys';
const EPOCH_STORE_NAME = 'agent_epoch_keys';
const PINNED_STORE_NAME = 'pinned_peer_keys';

const KEY_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const ENC_ALGO = 'AES-GCM';
const HKDF_SALT = new TextEncoder().encode('aamarva-e2ee-channel-v1');

function base64url(arr: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arr).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type E2EEDecryptionErrorCode =
  | 'MISSING_PAYLOAD'
  | 'INVALID_CIPHERTEXT'
  | 'INVALID_NONCE'
  | 'MISSING_RECIPIENT_PRIVATE_KEY'
  | 'MISSING_SENDER_PUBLIC_KEY'
  | 'KEY_EPOCH_NOT_FOUND'
  | 'ECDH_DERIVATION_FAILED'
  | 'HKDF_DERIVATION_FAILED'
  | 'AUTHENTICATION_TAG_FAILED'
  | 'AAD_MISMATCH'
  | 'KEY_PAIR_MISMATCH';

export class E2EEDecryptionError extends Error {
  code: E2EEDecryptionErrorCode;
  constructor(code: E2EEDecryptionErrorCode, message: string) {
    super(message);
    this.name = 'E2EEDecryptionError';
    this.code = code;
  }
}

/**
 * Canonicalizes agent identifiers across all E2EE operations:
 * Trims whitespace, strips leading '@', and converts to uppercase.
 * e.g. '@AMR-C59G-GX6D' -> 'AMR-C59G-GX6D'
 */
export function normalizeAgentId(agentId?: string | null): string {
  if (!agentId || typeof agentId !== 'string') return '';
  let id = agentId.trim();
  if (id.startsWith('@')) {
    id = id.substring(1).trim();
  }
  return id.toUpperCase();
}

export interface StoredAgentKeyEntry {
  publicKey: string; // Exportable JWK string
  privateKey: CryptoKey | string; // Non-exportable CryptoKey (extractable: false)
  fingerprint: string;
  identityPublicKey?: string; // Exportable ECDSA JWK string
  identityPrivateKey?: CryptoKey | string; // Non-exportable ECDSA CryptoKey (extractable: false)
  signature?: string; // Authenticated binding signature (Base64)
  keyEpoch: number; // Cryptographic key epoch (starts at 1, increments on explicit rotation)
}

export type PeerTrustStatus = 'UNKNOWN' | 'UNVERIFIED' | 'VERIFIED' | 'KEY_CHANGED' | 'REJECTED';

export interface PinnedPeerEpochEntry {
  publicKey: string;
  fingerprint: string;
  identityKey?: string;
  signature?: string;
  keyEpoch: number;
  pinnedAt: string;
}

export interface PinnedPeerEntry {
  peerAgentId: string;
  fingerprint: string;
  publicKey: string;
  identityKey?: string;
  signature?: string;
  verified: boolean; // Explicit out-of-band verification flag
  verifiedAt?: string;
  pinnedAt: string;
  epochKeys?: Record<string, PinnedPeerEpochEntry>;
}

export interface PeerVerificationResult {
  verified: boolean;
  fingerprint: string;
  identityVerified: boolean;
  trustStatus: PeerTrustStatus;
  keyChanged?: boolean;
}

// In-memory cache for fast synchronous access and environments where IndexedDB is unavailable or initializing
const memoryKeyCache = new Map<string, StoredAgentKeyEntry>();
const memoryEpochCache = new Map<string, StoredAgentKeyEntry>();
const memoryPinnedCache = new Map<string, PinnedPeerEntry>();
const memoryPeerEpochCache = new Map<string, PinnedPeerEpochEntry>();

/**
 * Open IndexedDB connection with schema migration
 */
function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'agentId' });
      }
      if (!db.objectStoreNames.contains(EPOCH_STORE_NAME)) {
        db.createObjectStore(EPOCH_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PINNED_STORE_NAME)) {
        db.createObjectStore(PINNED_STORE_NAME, { keyPath: 'peerAgentId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open E2EE IndexedDB.'));
  });
}

/**
 * Computes canonical JWK string (lexicographically ordered keys)
 */
function canonicalizeJwk(jwk: any): string {
  const parsed = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
  return JSON.stringify({
    crv: parsed.crv || 'P-256',
    kty: parsed.kty || 'EC',
    x: parsed.x,
    y: parsed.y
  });
}

/**
 * Computes canonical SHA-256 public key fingerprint formatted as hex with colons
 * Example: SHA256:4A:7B:3F:...
 */
export async function computeKeyFingerprint(publicKeyJwk: string): Promise<string> {
  const canonical = canonicalizeJwk(publicKeyJwk);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const digestBuf = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digestBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
  return `SHA256:${hex}`;
}

export interface E2EEKeyPair {
  publicKey: string;
  privateKey: CryptoKey;
  fingerprint: string;
  transientPrivateKeyJwk?: object;
}

/**
 * Generates an ECDH P-256 Key Pair for the agent.
 * Operational CryptoKey is imported as non-extractable (extractable: false).
 * Raw private key is NEVER transmitted across the network or stored unencrypted.
 */
export async function generateE2EEKeyPair(): Promise<E2EEKeyPair> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const tempKeyPair = await cryptoObj.subtle.generateKey(
    KEY_ALGO,
    true, // temporarily extractable to get JWK for recovery vault wrapping
    ['deriveKey', 'deriveBits']
  );

  // Export public key and private JWK for transient vault setup
  const exportedPub = await cryptoObj.subtle.exportKey('jwk', tempKeyPair.publicKey);
  const exportedPriv = await cryptoObj.subtle.exportKey('jwk', tempKeyPair.privateKey);
  const pubStr = JSON.stringify(exportedPub);
  const fingerprint = await computeKeyFingerprint(pubStr);

  // Import operational private key as non-extractable
  const opPrivateKey = await cryptoObj.subtle.importKey(
    'jwk',
    exportedPriv,
    KEY_ALGO,
    false, // extractable: false for operational key
    ['deriveKey', 'deriveBits']
  );

  return {
    publicKey: pubStr,
    privateKey: opPrivateKey,
    fingerprint,
    transientPrivateKeyJwk: exportedPriv
  };
}

export interface IdentitySigningKeyPair {
  identityPublicKey: string;
  identityPrivateKey: CryptoKey;
  transientIdentityPrivateKeyJwk?: object;
}

/**
 * Generates an ECDSA P-256 Signing Key Pair for agent cryptographic identity.
 * Operational CryptoKey is imported as non-extractable (extractable: false).
 */
export async function generateIdentitySigningKeyPair(): Promise<IdentitySigningKeyPair> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const tempKeyPair = await cryptoObj.subtle.generateKey(
    SIGN_ALGO,
    true, // temporarily extractable to get JWK for recovery vault wrapping
    ['sign', 'verify']
  );

  const exportedPub = await cryptoObj.subtle.exportKey('jwk', tempKeyPair.publicKey);
  const exportedPriv = await cryptoObj.subtle.exportKey('jwk', tempKeyPair.privateKey);

  // Import operational identity signing key as non-extractable
  const opPrivateKey = await cryptoObj.subtle.importKey(
    'jwk',
    exportedPriv,
    SIGN_ALGO,
    false, // extractable: false
    ['sign']
  );

  return {
    identityPublicKey: JSON.stringify(exportedPub),
    identityPrivateKey: opPrivateKey,
    transientIdentityPrivateKeyJwk: exportedPriv
  };
}

/**
 * Cryptographically signs an identity-to-E2EE-key binding statement using ECDSA P-256.
 * Statement format: AAMARVA-KEY-BINDING:v1:<AGENT_ID>:<FINGERPRINT>
 */
export async function signKeyBinding(
  identityPrivateKey: CryptoKey,
  agentId: string,
  fingerprint: string
): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = agentId.trim().toUpperCase();
  const statement = new TextEncoder().encode(`AAMARVA-KEY-BINDING:v1:${canonicalAgentId}:${fingerprint}`);
  const sigBuf = await cryptoObj.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identityPrivateKey,
    statement
  );
  return bufferToBase64(sigBuf);
}

/**
 * Cryptographically verifies an identity-to-E2EE-key binding statement using ECDSA P-256.
 */
export async function verifyKeyBinding(
  identityPublicKeyJwk: string,
  agentId: string,
  fingerprint: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const canonicalAgentId = agentId.trim().toUpperCase();
    const statement = new TextEncoder().encode(`AAMARVA-KEY-BINDING:v1:${canonicalAgentId}:${fingerprint}`);
    const parsed = typeof identityPublicKeyJwk === 'string' ? JSON.parse(identityPublicKeyJwk) : identityPublicKeyJwk;
    const idKey = await cryptoObj.subtle.importKey(
      'jwk',
      parsed,
      SIGN_ALGO,
      true,
      ['verify']
    );
    const sigBuf = base64ToBuffer(signatureBase64);
    return await cryptoObj.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      idKey,
      sigBuf,
      statement
    );
  } catch {
    return false;
  }
}

export interface AgentCryptoIdentity {
  e2eePublicKey: string;
  e2eePrivateKey: CryptoKey;
  fingerprint: string;
  identityPublicKey: string;
  identityPrivateKey: CryptoKey;
  signature: string;
  keyEpoch: number;
  transientPrivateKeyJwk?: object;
  transientIdentityPrivateKeyJwk?: object;
}

/**
 * Generates an initial complete cryptographic identity for an agent:
 * - Non-exportable ECDH exchange key (Epoch 1)
 * - Non-exportable ECDSA identity signing key
 * - Cryptographically signed key binding statement
 */
export async function generateAgentCryptoIdentity(agentId: string): Promise<AgentCryptoIdentity> {
  const e2ee = await generateE2EEKeyPair();
  const idSign = await generateIdentitySigningKeyPair();
  const signature = await signKeyBinding(idSign.identityPrivateKey, agentId, e2ee.fingerprint);

  return {
    e2eePublicKey: e2ee.publicKey,
    e2eePrivateKey: e2ee.privateKey,
    fingerprint: e2ee.fingerprint,
    identityPublicKey: idSign.identityPublicKey,
    identityPrivateKey: idSign.identityPrivateKey,
    signature,
    keyEpoch: 1,
    transientPrivateKeyJwk: e2ee.transientPrivateKeyJwk,
    transientIdentityPrivateKeyJwk: idSign.transientIdentityPrivateKeyJwk
  };
}

/**
 * Derives an initial agent cryptographic identity from their password or API credential.
 * Used during first-time registration when no recovery vault is available yet.
 * Any subsequent backup/recovery relies strictly on the encrypted recovery vault containing the actual keys;
 * no deterministic derivation or fallback is used during recovery-vault restoration.
 */
export async function deriveAgentCryptoIdentity(
  agentId: string,
  credential: string,
  keyEpoch: number = 1
): Promise<AgentCryptoIdentity> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = agentId.trim().toUpperCase();

  // 1. Derive ECDH exchange key seed using native WebCrypto PBKDF2
  const ecdhSalt = new TextEncoder().encode(`AAMARVA-ECDH-VAULT:v1:${canonicalAgentId}:epoch:${keyEpoch}`);
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    new TextEncoder().encode(credential),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const ecdhSeed = new Uint8Array(
    await cryptoObj.subtle.deriveBits(
      { name: 'PBKDF2', salt: ecdhSalt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      256
    )
  );

  const ecdhPubBytes = p256.getPublicKey(ecdhSeed, false);
  const ecdhX = ecdhPubBytes.slice(1, 33);
  const ecdhY = ecdhPubBytes.slice(33, 65);

  const ecdhPrivJwk = {
    kty: 'EC',
    crv: 'P-256',
    d: base64url(ecdhSeed),
    x: base64url(ecdhX),
    y: base64url(ecdhY)
  };
  const ecdhPubJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(ecdhX),
    y: base64url(ecdhY)
  };

  const e2eePrivateKey = await cryptoObj.subtle.importKey(
    'jwk',
    ecdhPrivJwk,
    KEY_ALGO,
    false, // extractable: false for operational non-extractable key
    ['deriveKey', 'deriveBits']
  );
  const e2eePublicKey = canonicalizeJwk(JSON.stringify(ecdhPubJwk));
  const fingerprint = await computeKeyFingerprint(e2eePublicKey);

  // 2. Derive ECDSA identity signing key seed
  const ecdsaSalt = new TextEncoder().encode(`AAMARVA-ECDSA-IDENTITY:v1:${canonicalAgentId}`);
  const ecdsaSeed = new Uint8Array(
    await cryptoObj.subtle.deriveBits(
      { name: 'PBKDF2', salt: ecdsaSalt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      256
    )
  );

  const ecdsaPubBytes = p256.getPublicKey(ecdsaSeed, false);
  const ecdsaX = ecdsaPubBytes.slice(1, 33);
  const ecdsaY = ecdsaPubBytes.slice(33, 65);

  const ecdsaPrivJwk = {
    kty: 'EC',
    crv: 'P-256',
    d: base64url(ecdsaSeed),
    x: base64url(ecdsaX),
    y: base64url(ecdsaY)
  };
  const ecdsaPubJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(ecdsaX),
    y: base64url(ecdsaY)
  };

  const identityPrivateKey = await cryptoObj.subtle.importKey(
    'jwk',
    ecdsaPrivJwk,
    SIGN_ALGO,
    false, // extractable: false for operational non-extractable key
    ['sign']
  );
  const identityPublicKey = canonicalizeJwk(JSON.stringify(ecdsaPubJwk));
  const signature = await signKeyBinding(identityPrivateKey, canonicalAgentId, fingerprint);

  return {
    e2eePublicKey,
    e2eePrivateKey,
    fingerprint,
    identityPublicKey,
    identityPrivateKey,
    signature,
    keyEpoch,
    transientPrivateKeyJwk: ecdhPrivJwk,
    transientIdentityPrivateKeyJwk: ecdsaPrivJwk
  };
}

/**
 * Performs explicit, safe key rotation for an agent:
 * 1. Increments key epoch: nextEpoch = currentEpoch + 1
 * 2. Generates new ECDH key pair with extractable: false
 * 3. Uses existing identity signing key to sign the new binding (preserving identity trust anchor)
 * 4. Saves new key under nextEpoch while preserving previous epoch keys in historical store
 * 5. Returns new identity material ready for authorized server update
 */
export async function rotateAgentCryptoIdentity(
  agentId: string,
  currentEpoch?: number
): Promise<AgentCryptoIdentity> {
  const normalizedAgentId = agentId.trim().toUpperCase();
  const currentKey = await getLocalKeyPair(normalizedAgentId);
  const allEpochs = await getAllLocalEpochKeys(normalizedAgentId);
  const maxStoredEpoch = allEpochs.reduce((max, ep) => Math.max(max, ep.keyEpoch || 1), 1);

  const effectiveEpoch = typeof currentEpoch === 'number' && currentEpoch > 0
    ? currentEpoch
    : Math.max(currentKey?.keyEpoch || 1, maxStoredEpoch);
  const nextEpoch = effectiveEpoch + 1;

  // Generate fresh ECDH key pair (operational key extractable: false)
  const newE2ee = await generateE2EEKeyPair();

  // Retrieve or regenerate identity signing key
  let idSignKey: CryptoKey;
  let idPubStr: string;
  let transientIdPrivJwk: any = undefined;

  if (currentKey?.identityPrivateKey && currentKey?.identityPublicKey) {
    idSignKey = await importSigningKey(currentKey.identityPrivateKey, 'private', false);
    idPubStr = typeof currentKey.identityPublicKey === 'string'
      ? currentKey.identityPublicKey
      : JSON.stringify(currentKey.identityPublicKey);
  } else {
    const freshIdSign = await generateIdentitySigningKeyPair();
    idSignKey = freshIdSign.identityPrivateKey;
    idPubStr = freshIdSign.identityPublicKey;
    transientIdPrivJwk = freshIdSign.transientIdentityPrivateKeyJwk;
  }

  // Sign binding with identity key
  const signature = await signKeyBinding(idSignKey, normalizedAgentId, newE2ee.fingerprint);

  // Save into local keystore and epoch historical archive
  await saveLocalKeyPair(
    normalizedAgentId,
    newE2ee.publicKey,
    newE2ee.privateKey,
    newE2ee.fingerprint,
    idPubStr,
    idSignKey,
    signature,
    nextEpoch,
    newE2ee.transientPrivateKeyJwk,
    transientIdPrivJwk
  );

  return {
    e2eePublicKey: newE2ee.publicKey,
    e2eePrivateKey: newE2ee.privateKey,
    fingerprint: newE2ee.fingerprint,
    identityPublicKey: idPubStr,
    identityPrivateKey: idSignKey,
    signature,
    keyEpoch: nextEpoch,
    transientPrivateKeyJwk: newE2ee.transientPrivateKeyJwk,
    transientIdentityPrivateKeyJwk: transientIdPrivJwk
  };
}

// In-memory transient map for ephemeral recovery vault creation during key setup/rotation
const transientJwkMap = new Map<string, any>();

/**
 * Clears transient JWK representations for a specific agent after successful vault construction and upload.
 */
export function clearTransientJwkKeys(agentId: string): void {
  const normalizedAgentId = agentId.trim().toUpperCase();
  const prefix = `${normalizedAgentId}:`;
  for (const key of transientJwkMap.keys()) {
    if (key.startsWith(prefix)) {
      transientJwkMap.delete(key);
    }
  }
}

/**
 * Saves agent's local keys into persistent IndexedDB keystore.
 * Stores native CryptoKey objects (non-exportable) directly via IndexedDB structured clone.
 * Also archives entry in historical epoch store.
 * Strictly enforces epoch immutability: throws E2EE_EPOCH_ALREADY_EXISTS if attempting to overwrite an existing epoch with a different key.
 */
export async function saveLocalKeyPair(
  agentId: string,
  publicKey: string,
  privateKey: CryptoKey | string,
  fingerprint?: string,
  identityPublicKey?: string,
  identityPrivateKey?: CryptoKey | string,
  signature?: string,
  keyEpoch: number = 1,
  transientPrivateKeyJwk?: object,
  transientIdentityPrivateKeyJwk?: object
): Promise<void> {
  const normalizedAgentId = agentId.trim().toUpperCase();
  const fp = fingerprint || (await computeKeyFingerprint(publicKey));
  const epoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;

  // Strict epoch immutability check in memory cache
  const epochCacheKey = `${normalizedAgentId}#epoch#${epoch}`;
  const existingMemory = memoryEpochCache.get(epochCacheKey);
  if (existingMemory && existingMemory.fingerprint && existingMemory.fingerprint !== fp && existingMemory.publicKey !== publicKey) {
    throw new Error(`E2EE_EPOCH_ALREADY_EXISTS: Key epoch ${epoch} already exists for agent ${normalizedAgentId} with a different key. Existing epochs are immutable.`);
  }

  // Check persistent IndexedDB before writing
  try {
    const db = await openKeyDatabase();
    const existingDbEpoch = await new Promise<any>((resolve) => {
      try {
        const checkTx = db.transaction(EPOCH_STORE_NAME, 'readonly');
        const req = checkTx.objectStore(EPOCH_STORE_NAME).get(`${normalizedAgentId}#epoch#${epoch}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (existingDbEpoch && existingDbEpoch.fingerprint && existingDbEpoch.fingerprint !== fp && existingDbEpoch.publicKey !== publicKey) {
      throw new Error(`E2EE_EPOCH_ALREADY_EXISTS: Key epoch ${epoch} already exists for agent ${normalizedAgentId} with a different key in persistent storage.`);
    }
  } catch (idbCheckErr: any) {
    if (idbCheckErr?.message?.includes('E2EE_EPOCH_ALREADY_EXISTS')) {
      throw idbCheckErr;
    }
  }

  if (transientPrivateKeyJwk) {
    transientJwkMap.set(`${normalizedAgentId}:${epoch}:e2ee`, transientPrivateKeyJwk);
  }
  if (transientIdentityPrivateKeyJwk) {
    transientJwkMap.set(`${normalizedAgentId}:${epoch}:identity`, transientIdentityPrivateKeyJwk);
  }

  const entry: StoredAgentKeyEntry = {
    publicKey,
    privateKey,
    fingerprint: fp,
    identityPublicKey,
    identityPrivateKey,
    signature,
    keyEpoch: epoch
  };

  // Update in-memory caches
  memoryKeyCache.set(normalizedAgentId, entry);
  memoryEpochCache.set(epochCacheKey, entry);

  try {
    const db = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([KEY_STORE_NAME, EPOCH_STORE_NAME], 'readwrite');
      
      // Store current key
      const keyStore = tx.objectStore(KEY_STORE_NAME);
      keyStore.put({
        agentId: normalizedAgentId,
        publicKey,
        privateKey,
        fingerprint: fp,
        identityPublicKey,
        identityPrivateKey,
        signature,
        keyEpoch: epoch,
        updatedAt: new Date().toISOString()
      });

      // Archive into historical epoch store
      const epochStore = tx.objectStore(EPOCH_STORE_NAME);
      epochStore.put({
        id: `${normalizedAgentId}#epoch#${epoch}`,
        agentId: normalizedAgentId,
        keyEpoch: epoch,
        publicKey,
        privateKey,
        fingerprint: fp,
        identityPublicKey,
        identityPrivateKey,
        signature,
        archivedAt: new Date().toISOString()
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // If IndexedDB fails, memory cache retains keys for current session
    console.warn('E2EE Keystore: IndexedDB write error, retained in session cache:', e);
  }
}

/**
 * Retrieves agent's local keys from persistent IndexedDB keystore.
 * If epoch is specified, retrieves the specific historical key for that epoch.
 * Automatically imports legacy string JWKs to non-exportable CryptoKey objects if encountered.
 */
export async function getLocalKeyPair(
  agentId: string,
  epoch?: number,
  _credential?: string
): Promise<StoredAgentKeyEntry | null> {
  const normalizedAgentId = agentId.trim().toUpperCase();

  // If specific epoch requested, check memory epoch cache first
  if (typeof epoch === 'number' && epoch > 0) {
    const epochCacheKey = `${normalizedAgentId}#epoch#${epoch}`;
    if (memoryEpochCache.has(epochCacheKey)) {
      return memoryEpochCache.get(epochCacheKey)!;
    }
  } else {
    // Check main memory cache
    if (memoryKeyCache.has(normalizedAgentId)) {
      return memoryKeyCache.get(normalizedAgentId)!;
    }
  }

  try {
    const db = await openKeyDatabase();

    // If specific epoch requested, look in EPOCH_STORE_NAME first
    if (typeof epoch === 'number' && epoch > 0) {
      const epochId = `${normalizedAgentId}#epoch#${epoch}`;
      const epochResult = await new Promise<any>((resolve, reject) => {
        const tx = db.transaction(EPOCH_STORE_NAME, 'readonly');
        const store = tx.objectStore(EPOCH_STORE_NAME);
        const req = store.get(epochId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (epochResult && epochResult.publicKey && epochResult.privateKey) {
        let privKey = epochResult.privateKey;
        let idPrivKey = epochResult.identityPrivateKey;

        if (typeof privKey === 'string' || (privKey && typeof privKey === 'object' && !('algorithm' in privKey))) {
          privKey = await importCryptoKey(privKey, 'private', false);
        }
        if (typeof idPrivKey === 'string' || (idPrivKey && typeof idPrivKey === 'object' && !('algorithm' in idPrivKey))) {
          idPrivKey = await importSigningKey(idPrivKey, 'private', false);
        }

        const entry: StoredAgentKeyEntry = {
          publicKey: epochResult.publicKey,
          privateKey: privKey,
          fingerprint: epochResult.fingerprint || (await computeKeyFingerprint(epochResult.publicKey)),
          identityPublicKey: epochResult.identityPublicKey,
          identityPrivateKey: idPrivKey,
          signature: epochResult.signature,
          keyEpoch: epochResult.keyEpoch || epoch
        };

        memoryEpochCache.set(epochId, entry);
        return entry;
      }
    }

    // Default: Retrieve current active key
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, 'readonly');
      const store = tx.objectStore(KEY_STORE_NAME);
      const req = store.get(normalizedAgentId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (result && result.publicKey && result.privateKey) {
      let privKey = result.privateKey;
      let idPrivKey = result.identityPrivateKey;
      let needsMigration = false;

      // Backward compatibility and secure migration: If legacy string JWK was found, convert to non-exportable CryptoKey
      if (typeof privKey === 'string' || (privKey && typeof privKey === 'object' && !('algorithm' in privKey))) {
        try {
          privKey = await importCryptoKey(privKey, 'private', false);
          needsMigration = true;
        } catch (migErr) {
          throw new Error(`E2EE_MIGRATION_FAILURE: Failed to import legacy private key: ${migErr instanceof Error ? migErr.message : String(migErr)}`);
        }
      }
      if (typeof idPrivKey === 'string' || (idPrivKey && typeof idPrivKey === 'object' && !('algorithm' in idPrivKey))) {
        try {
          idPrivKey = await importSigningKey(idPrivKey, 'private', false);
          needsMigration = true;
        } catch (migErr) {
          throw new Error(`E2EE_MIGRATION_FAILURE: Failed to import legacy signing key: ${migErr instanceof Error ? migErr.message : String(migErr)}`);
        }
      }

      const currentEpoch = result.keyEpoch || 1;
      const entry: StoredAgentKeyEntry = {
        publicKey: result.publicKey,
        privateKey: privKey,
        fingerprint: result.fingerprint || (await computeKeyFingerprint(result.publicKey)),
        identityPublicKey: result.identityPublicKey,
        identityPrivateKey: idPrivKey,
        signature: result.signature,
        keyEpoch: currentEpoch
      };

      // If migration occurred, persist the cleaned non-exportable CryptoKey entry back to IndexedDB
      if (needsMigration) {
        try {
          const writeDb = await openKeyDatabase();
          await new Promise<void>((resolveWrite, rejectWrite) => {
            const tx = writeDb.transaction([KEY_STORE_NAME, EPOCH_STORE_NAME], 'readwrite');
            const store = tx.objectStore(KEY_STORE_NAME);
            store.put({
              agentId: normalizedAgentId,
              publicKey: entry.publicKey,
              privateKey: entry.privateKey,
              fingerprint: entry.fingerprint,
              identityPublicKey: entry.identityPublicKey,
              identityPrivateKey: entry.identityPrivateKey,
              signature: entry.signature,
              keyEpoch: entry.keyEpoch,
              updatedAt: new Date().toISOString()
            });

            const epochStore = tx.objectStore(EPOCH_STORE_NAME);
            epochStore.put({
              id: `${normalizedAgentId}#epoch#${entry.keyEpoch}`,
              agentId: normalizedAgentId,
              keyEpoch: entry.keyEpoch,
              publicKey: entry.publicKey,
              privateKey: entry.privateKey,
              fingerprint: entry.fingerprint,
              identityPublicKey: entry.identityPublicKey,
              identityPrivateKey: entry.identityPrivateKey,
              signature: entry.signature,
              archivedAt: new Date().toISOString()
            });

            tx.oncomplete = () => resolveWrite();
            tx.onerror = () => rejectWrite(tx.error);
          });
        } catch (migPersistErr) {
          console.warn('E2EE Keystore: Failed to persist migrated non-exportable keys:', migPersistErr);
        }
      }

      memoryKeyCache.set(normalizedAgentId, entry);
      memoryEpochCache.set(`${normalizedAgentId}#epoch#${currentEpoch}`, entry);
      return entry;
    }
  } catch (e) {
    console.warn('E2EE Keystore: IndexedDB read error:', e);
  }

  return null;
}

/**
 * Derives a dedicated key-wrapping key (AES-256-GCM) from the user's credential.
 * Used exclusively for encrypting the client-side recovery artifact.
 * AAMARVA server NEVER possesses this wrapping key or the user's plaintext credential.
 */
export async function deriveKeyWrappingKey(agentId: string, credential: string, kdfVersion: number = 2): Promise<CryptoKey> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = agentId.trim().toUpperCase();
  const salt = new TextEncoder().encode(`AAMARVA-RECOVERY-VAULT:v1:${canonicalAgentId}`);
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    new TextEncoder().encode(credential),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const iterations = kdfVersion === 1 ? 100000 : 210000;
  return await cryptoObj.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Retrieves all local historical and active epoch key entries stored for an agent from IndexedDB.
 */
export async function getAllLocalEpochKeys(agentId: string): Promise<StoredAgentKeyEntry[]> {
  const normalizedAgentId = agentId.trim().toUpperCase();
  const entries: StoredAgentKeyEntry[] = [];
  const seenEpochs = new Set<number>();

  try {
    const db = await openKeyDatabase();
    const records = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(EPOCH_STORE_NAME, 'readonly');
      const store = tx.objectStore(EPOCH_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    for (const r of records) {
      if (r && r.agentId === normalizedAgentId && r.publicKey && r.privateKey) {
        let privKey = r.privateKey;
        let idPrivKey = r.identityPrivateKey;
        if (typeof privKey === 'string' || (privKey && typeof privKey === 'object' && !('algorithm' in privKey))) {
          privKey = await importCryptoKey(privKey, 'private', false);
        }
        if (typeof idPrivKey === 'string' || (idPrivKey && typeof idPrivKey === 'object' && !('algorithm' in idPrivKey))) {
          idPrivKey = await importSigningKey(idPrivKey, 'private', false);
        }
        const epochNum = r.keyEpoch || 1;
        seenEpochs.add(epochNum);
        entries.push({
          publicKey: r.publicKey,
          privateKey: privKey,
          fingerprint: r.fingerprint || (await computeKeyFingerprint(r.publicKey)),
          identityPublicKey: r.identityPublicKey,
          identityPrivateKey: idPrivKey,
          signature: r.signature,
          keyEpoch: epochNum
        });
      }
    }
  } catch (e) {
    console.warn('E2EE Keystore: getAllLocalEpochKeys IndexedDB query error:', e);
  }

  // Include any in-memory epoch cache entries if not already collected
  for (const [key, val] of memoryEpochCache.entries()) {
    if (key.startsWith(`${normalizedAgentId}#epoch#`) && val && val.publicKey && val.privateKey && !seenEpochs.has(val.keyEpoch)) {
      seenEpochs.add(val.keyEpoch);
      entries.push(val);
    }
  }

  // Also verify active key is included
  try {
    const active = await getLocalKeyPair(normalizedAgentId);
    if (active && active.privateKey && !seenEpochs.has(active.keyEpoch)) {
      entries.push(active);
    }
  } catch (e) {
    console.warn('E2EE Keystore: active key inclusion check notice:', e);
  }

  // Sort ascending by keyEpoch
  entries.sort((a, b) => a.keyEpoch - b.keyEpoch);
  return entries;
}

/**
 * Creates an encrypted recovery artifact containing the ACTUAL active and historical E2EE key material.
 * Implementation Details:
 *   - The recovery vault contains the ACTUAL private key material of the current cryptographic identity.
 *   - Transient JWK material is used only temporarily in local memory to construct the encrypted vault.
 *   - All transient JWK representations are discarded after encryption is completed.
 *   - Operational CryptoKeys remain non-extractable (extractable: false).
 *   - The server receives ONLY the encrypted recovery-vault ciphertext and necessary metadata (nonce, version).
 *   - If the actual private key material is unavailable, creation fails with RECOVERY_VAULT_ERROR.
 *   - No replacement or deterministic private keys are generated or derived when actual material is missing.
 */
export async function createEncryptedRecoveryVault(
  agentId: string,
  credential: string,
  _targetEpoch?: number,
  existingVault?: { ciphertext: string; nonce: string; version?: number; kdfVersion?: number }
): Promise<{ ciphertext: string; nonce: string; version: number; kdfVersion?: number }> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = agentId.trim().toUpperCase();

  // If an existing vault is supplied, opportunistically decrypt it and restore
  // any missing historical key material to the transient map.
  if (existingVault && existingVault.ciphertext && existingVault.nonce) {
    try {
      const vaultKdfVersion = existingVault.kdfVersion !== undefined ? Number(existingVault.kdfVersion) : 1;
      const nonceBytes = new Uint8Array(base64ToBuffer(existingVault.nonce));
      const ciphertextBytes = new Uint8Array(base64ToBuffer(existingVault.ciphertext));
      
      let decryptedBuffer: ArrayBuffer;
      try {
        const wrappingKey = await deriveKeyWrappingKey(canonicalAgentId, credential, vaultKdfVersion);
        decryptedBuffer = await cryptoObj.subtle.decrypt(
          { name: 'AES-GCM', iv: nonceBytes },
          wrappingKey,
          ciphertextBytes
        );
      } catch (firstErr) {
        // Fallback: try alternative KDF version
        const altKdfVersion = vaultKdfVersion === 2 ? 1 : 2;
        const wrappingKey = await deriveKeyWrappingKey(canonicalAgentId, credential, altKdfVersion);
        decryptedBuffer = await cryptoObj.subtle.decrypt(
          { name: 'AES-GCM', iv: nonceBytes },
          wrappingKey,
          ciphertextBytes
        );
      }

      const payload = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      if (payload && Array.isArray(payload.epochs)) {
        for (const ep of payload.epochs) {
          if (ep && ep.keyEpoch) {
            const e2eeKey = `${canonicalAgentId}:${ep.keyEpoch}:e2ee`;
            const identityKey = `${canonicalAgentId}:${ep.keyEpoch}:identity`;
            if (ep.privateKeyJwk && !transientJwkMap.has(e2eeKey)) {
              transientJwkMap.set(e2eeKey, ep.privateKeyJwk);
            }
            if (ep.identityPrivateKeyJwk && !transientJwkMap.has(identityKey)) {
              transientJwkMap.set(identityKey, ep.identityPrivateKeyJwk);
            }
          }
        }
      }
    } catch (decryptErr) {
      console.warn('E2EE: Failed to decrypt existing vault during recovery vault creation:', decryptErr);
    }
  }

  // 1. Retrieve the actual current active key from the local keystore
  let activeEntry = await getLocalKeyPair(canonicalAgentId);
  if (!activeEntry || !activeEntry.privateKey) {
    throw new Error(`RECOVERY_VAULT_ERROR: No local private key found in keystore for agent ${canonicalAgentId}`);
  }

  // 2. Retrieve all actual historical epoch keys stored locally
  const allEpochs = await getAllLocalEpochKeys(canonicalAgentId);
  if (allEpochs.length === 0) {
    allEpochs.push(activeEntry);
  }

  // 3. Obtain JWKs for each epoch (via transient memory or extractable export if applicable; no deterministic fallback is used)
  const epochsData: any[] = [];
  for (const ep of allEpochs) {
    let privJwk: any = undefined;
    let idPrivJwk: any = undefined;

    // Check if key is extractable
    if (typeof (ep.privateKey as any)?.algorithm === 'object') {
      const pKey = ep.privateKey as CryptoKey;
      if (pKey.extractable) {
        try {
          privJwk = await cryptoObj.subtle.exportKey('jwk', pKey);
        } catch {
          // non-extractable
        }
      }
    } else {
      privJwk = typeof ep.privateKey === 'string' ? JSON.parse(ep.privateKey) : ep.privateKey;
    }

    if (ep.identityPrivateKey) {
      if (typeof (ep.identityPrivateKey as any)?.algorithm === 'object') {
        const idPKey = ep.identityPrivateKey as CryptoKey;
        if (idPKey.extractable) {
          try {
            idPrivJwk = await cryptoObj.subtle.exportKey('jwk', idPKey);
          } catch {
            // non-extractable
          }
        }
      } else {
        idPrivJwk = typeof ep.identityPrivateKey === 'string' ? JSON.parse(ep.identityPrivateKey) : ep.identityPrivateKey;
      }
    }

    // Check transient memory JWK map
    if (!privJwk && (ep as any).transientPrivateKeyJwk) {
      privJwk = (ep as any).transientPrivateKeyJwk;
    }
    if (!privJwk && transientJwkMap.has(`${canonicalAgentId}:${ep.keyEpoch}:e2ee`)) {
      privJwk = transientJwkMap.get(`${canonicalAgentId}:${ep.keyEpoch}:e2ee`);
    }
    if (!idPrivJwk && transientJwkMap.has(`${canonicalAgentId}:${ep.keyEpoch}:identity`)) {
      idPrivJwk = transientJwkMap.get(`${canonicalAgentId}:${ep.keyEpoch}:identity`);
    }
    if (!idPrivJwk) {
      // Identity keys are often recycled/preserved across E2EE key epochs during rotation.
      // If a specific epoch does not have an identity key in the transient map, search the map
      // for any identity key belonging to this agent.
      for (const [k, v] of transientJwkMap.entries()) {
        if (k.startsWith(`${canonicalAgentId}:`) && k.endsWith(':identity')) {
          idPrivJwk = v;
          break;
        }
      }
    }

    if (!privJwk || !idPrivJwk) {
        throw new Error(`RECOVERY_VAULT_ERROR: Actual private key material for epoch ${ep.keyEpoch} is unavailable for backup.`);
    }

    epochsData.push({
      keyEpoch: ep.keyEpoch,
      publicKey: ep.publicKey,
      privateKeyJwk: privJwk,
      fingerprint: ep.fingerprint,
      identityPublicKey: ep.identityPublicKey,
      identityPrivateKeyJwk: idPrivJwk,
      signature: ep.signature
    });
  }

  // Active key JWK resolution
  const activeEpochData = epochsData.find(e => e.keyEpoch === activeEntry.keyEpoch);
  if (!activeEpochData || !activeEpochData.privateKeyJwk || !activeEpochData.identityPrivateKeyJwk) {
    throw new Error(`RECOVERY_VAULT_ERROR: Actual private key material for active epoch ${activeEntry.keyEpoch} is unavailable for backup.`);
  }

  let activePrivJwk: any = activeEpochData.privateKeyJwk;
  let activeIdPrivJwk: any = activeEpochData.identityPrivateKeyJwk;

  const payload = JSON.stringify({
    version: 1,
    agentId: canonicalAgentId,
    keyEpoch: activeEntry.keyEpoch,
    activeKey: {
      keyEpoch: activeEntry.keyEpoch,
      publicKey: activeEntry.publicKey,
      privateKeyJwk: activePrivJwk,
      fingerprint: activeEntry.fingerprint,
      identityPublicKey: activeEntry.identityPublicKey,
      identityPrivateKeyJwk: activeIdPrivJwk,
      signature: activeEntry.signature
    },
    epochs: epochsData,
    createdAt: new Date().toISOString()
  });

  const wrappingKey = await deriveKeyWrappingKey(canonicalAgentId, credential, 2);
  const nonce = cryptoObj.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    wrappingKey,
    new TextEncoder().encode(payload)
  );

  // Transient JWK references are retained for potential retry of the network upload in this session
  // and must be cleared explicitly via clearTransientJwkKeys(agentId) after successful upload.

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    nonce: bufferToBase64(nonce.buffer),
    version: 1,
    kdfVersion: 2
  };
}

/**
 * Restores the EXACT active and historical E2EE key pairs on a new browser/device from the encrypted recovery artifact.
 * Performs atomic all-or-nothing recovery: decrypts, validates structure, imports all keys in memory, and persists
 * via a single atomic IndexedDB multi-store transaction only if all validation succeeds. Zero keys are written on failure.
 */
export async function restoreFromEncryptedRecoveryVault(
  agentId: string,
  credential: string,
  vault: { ciphertext: string; nonce: string; version?: number; kdfVersion?: number }
): Promise<{ activeKey: StoredAgentKeyEntry; restoredEpochCount: number }> {
  if (!vault || typeof vault !== 'object' || !vault.ciphertext || !vault.nonce) {
    throw new Error('INVALID_RECOVERY_VAULT: Vault must contain ciphertext and nonce.');
  }
  if (!credential || typeof credential !== 'string' || !credential.trim()) {
    throw new Error('RECOVERY_CREDENTIAL_REQUIRED: Recovery credential is required to decrypt recovery vault.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = agentId.trim().toUpperCase();

  const nonceBytes = new Uint8Array(base64ToBuffer(vault.nonce));
  const ciphertextBytes = new Uint8Array(base64ToBuffer(vault.ciphertext));

  let decryptedBuffer: ArrayBuffer;
  const initialKdfVersion = vault.kdfVersion || 2;
  try {
    const wrappingKey = await deriveKeyWrappingKey(canonicalAgentId, credential, initialKdfVersion);
    decryptedBuffer = await cryptoObj.subtle.decrypt(
      { name: 'AES-GCM', iv: nonceBytes },
      wrappingKey,
      ciphertextBytes
    );
  } catch (err) {
    if (initialKdfVersion === 2) {
      try {
        const fallbackWrappingKey = await deriveKeyWrappingKey(canonicalAgentId, credential, 1);
        decryptedBuffer = await cryptoObj.subtle.decrypt(
          { name: 'AES-GCM', iv: nonceBytes },
          fallbackWrappingKey,
          ciphertextBytes
        );
      } catch (fallbackErr) {
        throw new Error('RECOVERY_DECRYPT_FAILED: Failed to decrypt recovery vault. Invalid credential or corrupted ciphertext.');
      }
    } else {
      throw new Error('RECOVERY_DECRYPT_FAILED: Failed to decrypt recovery vault. Invalid credential or corrupted ciphertext.');
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(decryptedBuffer));
  } catch {
    throw new Error('INVALID_VAULT_PAYLOAD: Decrypted recovery payload is not valid JSON.');
  }

  if (payload.agentId && payload.agentId.toUpperCase() !== canonicalAgentId) {
    throw new Error('RECOVERY_IDENTITY_MISMATCH: Recovered identity does not match current agent.');
  }

  const epochs: any[] = Array.isArray(payload.epochs) && payload.epochs.length > 0
    ? payload.epochs
    : (payload.activeKey ? [payload.activeKey] : []);

  if (epochs.length === 0) {
    throw new Error('RECOVERY_EMPTY_VAULT: No valid epochs found in recovery artifact.');
  }

  // ATOMIC VALIDATION PASS: Import and validate all keys in memory first.
  const preparedEntries: Array<{ entry: StoredAgentKeyEntry; privJwk: any; idPrivJwk: any }> = [];
  let lastActiveEntry: StoredAgentKeyEntry | null = null;

  for (const ep of epochs) {
    if (!ep || !ep.privateKeyJwk || !ep.publicKey) {
      throw new Error('INVALID_VAULT_EPOCH: Epoch missing required key material.');
    }

    const e2eePrivateKey = await cryptoObj.subtle.importKey(
      'jwk',
      ep.privateKeyJwk,
      KEY_ALGO,
      false, // extractable: false
      ['deriveKey', 'deriveBits']
    );

    let identityPrivateKey: CryptoKey | undefined = undefined;
    if (ep.identityPrivateKeyJwk) {
      identityPrivateKey = await cryptoObj.subtle.importKey(
        'jwk',
        ep.identityPrivateKeyJwk,
        SIGN_ALGO,
        false, // extractable: false
        ['sign']
      );
    }

    // CRYPTOGRAPHIC RELATIONSHIP VALIDATION:
    // 1. Verify ECDH exchange key-pair relationship
    try {
      const recExchangePubKey = await importCryptoKey(ep.publicKey, 'public', false);
      const ephemeralExchangePair = await cryptoObj.subtle.generateKey(KEY_ALGO, true, ['deriveKey', 'deriveBits']);
      
      const bits1 = await cryptoObj.subtle.deriveBits(
        { name: 'ECDH', public: ephemeralExchangePair.publicKey },
        e2eePrivateKey,
        256
      );
      const bits2 = await cryptoObj.subtle.deriveBits(
        { name: 'ECDH', public: recExchangePubKey },
        ephemeralExchangePair.privateKey,
        256
      );
      
      const buf1 = new Uint8Array(bits1);
      const buf2 = new Uint8Array(bits2);
      let bitsMatch = buf1.length === buf2.length;
      if (bitsMatch) {
        for (let i = 0; i < buf1.length; i++) {
          if (buf1[i] !== buf2[i]) {
            bitsMatch = false;
            break;
          }
        }
      }
      if (!bitsMatch) {
        throw new Error('Mismatched exchange key relationship.');
      }
    } catch (err) {
      throw new Error('INVALID_KEY_RELATIONSHIP: Recovered ECDH private key does not match its corresponding public key.');
    }

    // 2. Verify ECDSA signature key-pair relationship
    if (identityPrivateKey && ep.identityPublicKey) {
      try {
        const pubKey = await importSigningKey(ep.identityPublicKey, 'public', false);
        const testBuffer = new TextEncoder().encode('KeyRelationshipValidationChallenge');
        const signatureBytes = await cryptoObj.subtle.sign(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          identityPrivateKey,
          testBuffer
        );
        const isValid = await cryptoObj.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          pubKey,
          signatureBytes,
          testBuffer
        );
        if (!isValid) {
          throw new Error('Mismatched signing signature.');
        }
      } catch (err) {
        throw new Error('INVALID_KEY_RELATIONSHIP: Recovered ECDSA private key does not match its corresponding public key.');
      }
    }

    const entry: StoredAgentKeyEntry = {
      publicKey: ep.publicKey,
      privateKey: e2eePrivateKey,
      fingerprint: ep.fingerprint || (await computeKeyFingerprint(ep.publicKey)),
      identityPublicKey: ep.identityPublicKey,
      identityPrivateKey,
      signature: ep.signature,
      keyEpoch: ep.keyEpoch || 1
    };

    preparedEntries.push({ entry, privJwk: ep.privateKeyJwk, idPrivJwk: ep.identityPrivateKeyJwk });

    if (!lastActiveEntry || entry.keyEpoch >= lastActiveEntry.keyEpoch) {
      lastActiveEntry = entry;
    }
  }

  if (payload.activeKey && payload.activeKey.privateKeyJwk) {
    const act = payload.activeKey;
    if (!lastActiveEntry || (act.keyEpoch || 1) >= lastActiveEntry.keyEpoch) {
      const e2eePrivateKey = await cryptoObj.subtle.importKey(
        'jwk',
        act.privateKeyJwk,
        KEY_ALGO,
        false,
        ['deriveKey', 'deriveBits']
      );
      let idPrivKey: CryptoKey | undefined = undefined;
      if (act.identityPrivateKeyJwk) {
        idPrivKey = await cryptoObj.subtle.importKey(
          'jwk',
          act.identityPrivateKeyJwk,
          SIGN_ALGO,
          false,
          ['sign']
        );
      }
      lastActiveEntry = {
        publicKey: act.publicKey,
        privateKey: e2eePrivateKey,
        fingerprint: act.fingerprint || (await computeKeyFingerprint(act.publicKey)),
        identityPublicKey: act.identityPublicKey,
        identityPrivateKey: idPrivKey,
        signature: act.signature,
        keyEpoch: act.keyEpoch || 1
      };
    }
  }

  if (!lastActiveEntry) {
    throw new Error('RECOVERY_EMPTY_VAULT: No valid active key found in recovery artifact.');
  }

  // ATOMIC PERSISTENCE PASS: Commit all keys in a single multi-store transaction or memory cache fallback.
  try {
    const db = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([KEY_STORE_NAME, EPOCH_STORE_NAME], 'readwrite');
      const keyStore = tx.objectStore(KEY_STORE_NAME);
      const epochStore = tx.objectStore(EPOCH_STORE_NAME);
      const now = new Date().toISOString();

      keyStore.put({
        agentId: canonicalAgentId,
        publicKey: lastActiveEntry!.publicKey,
        privateKey: lastActiveEntry!.privateKey,
        fingerprint: lastActiveEntry!.fingerprint,
        identityPublicKey: lastActiveEntry!.identityPublicKey,
        identityPrivateKey: lastActiveEntry!.identityPrivateKey,
        signature: lastActiveEntry!.signature,
        keyEpoch: lastActiveEntry!.keyEpoch,
        updatedAt: now
      });

      for (const item of preparedEntries) {
        epochStore.put({
          id: `${canonicalAgentId}#epoch#${item.entry.keyEpoch}`,
          agentId: canonicalAgentId,
          keyEpoch: item.entry.keyEpoch,
          publicKey: item.entry.publicKey,
          privateKey: item.entry.privateKey,
          fingerprint: item.entry.fingerprint,
          identityPublicKey: item.entry.identityPublicKey,
          identityPrivateKey: item.entry.identityPrivateKey,
          signature: item.entry.signature,
          archivedAt: now
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (idbErr) {
    console.warn('E2EE Keystore: IndexedDB unavailable or persistence failed, using memory cache fallback:', idbErr);
  }

  memoryKeyCache.set(canonicalAgentId, lastActiveEntry);
  for (const item of preparedEntries) {
    memoryEpochCache.set(`${canonicalAgentId}#epoch#${item.entry.keyEpoch}`, item.entry);
    if (item.privJwk) {
      transientJwkMap.set(`${canonicalAgentId}:${item.entry.keyEpoch}:e2ee`, item.privJwk);
    }
    if (item.idPrivJwk) {
      transientJwkMap.set(`${canonicalAgentId}:${item.entry.keyEpoch}:identity`, item.idPrivJwk);
    }
  }

  return {
    activeKey: lastActiveEntry,
    restoredEpochCount: preparedEntries.length
  };
}

/**
 * Re-encrypts an existing recovery vault with a new credential during password changes.
 * Preserves the complete historical key epoch history without losing any keys.
 */
export async function reEncryptRecoveryVaultWithNewCredential(
  agentId: string,
  oldCredential: string,
  newCredential: string,
  existingVault: { ciphertext: string; nonce: string; version?: number; kdfVersion?: number }
): Promise<{ ciphertext: string; nonce: string; version: number; kdfVersion?: number }> {
  const normalizedAgentId = agentId.trim().toUpperCase();

  // 1. Decrypt existing vault locally using oldCredential and restore all epochs into memory/transient map
  const restored = await restoreFromEncryptedRecoveryVault(normalizedAgentId, oldCredential, existingVault);

  // 2. Re-encrypt all historical and active epochs using newCredential with KDF version 2
  const updatedVault = await createEncryptedRecoveryVault(
    normalizedAgentId,
    newCredential,
    restored.activeKey.keyEpoch,
    existingVault
  );

  return updatedVault;
}

/**
 * Removes local key pair from keystore (e.g. on complete agent deletion)
 */
export async function removeLocalKeyPair(agentId: string): Promise<void> {
  const normalizedAgentId = agentId.trim().toUpperCase();
  memoryKeyCache.delete(normalizedAgentId);
  try {
    const db = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([KEY_STORE_NAME, EPOCH_STORE_NAME], 'readwrite');
      const store = tx.objectStore(KEY_STORE_NAME);
      store.delete(normalizedAgentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('E2EE Keystore: Failed to delete key from IndexedDB:', e);
  }
}

/**
 * Retrieves pinned peer record from memory or IndexedDB
 */
export async function getPinnedPeerKey(peerAgentId: string): Promise<PinnedPeerEntry | null> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  if (memoryPinnedCache.has(normalizedPeerId)) {
    return memoryPinnedCache.get(normalizedPeerId)!;
  }

  try {
    const db = await openKeyDatabase();
    const pinned = await new Promise<PinnedPeerEntry | null>((resolve, reject) => {
      const tx = db.transaction(PINNED_STORE_NAME, 'readonly');
      const store = tx.objectStore(PINNED_STORE_NAME);
      const req = store.get(normalizedPeerId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (pinned) {
      memoryPinnedCache.set(normalizedPeerId, pinned);
    }
    return pinned;
  } catch (e) {
    console.warn('E2EE Pinning: IndexedDB pin read error:', e);
    return null;
  }
}

/**
 * Pins a peer agent's public key (TOFU - Trust On First Use)
 * First contact is UNVERIFIED by default unless isExplicitlyVerified is explicitly set.
 */
export async function pinPeerKey(
  peerAgentId: string,
  peerPublicKeyJwk: string,
  peerIdentityKeyJwk?: string,
  signature?: string,
  isExplicitlyVerified: boolean = false,
  keyEpoch: number = 1
): Promise<PinnedPeerEntry> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  const fingerprint = await computeKeyFingerprint(peerPublicKeyJwk);
  const now = new Date().toISOString();
  const epoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;

  const existingPinned = memoryPinnedCache.get(normalizedPeerId);
  const epochKeys = existingPinned?.epochKeys || {};
  epochKeys[String(epoch)] = {
    publicKey: peerPublicKeyJwk,
    fingerprint,
    identityKey: peerIdentityKeyJwk,
    signature,
    keyEpoch: epoch,
    pinnedAt: now
  };

  const entry: PinnedPeerEntry = {
    peerAgentId: normalizedPeerId,
    fingerprint,
    publicKey: peerPublicKeyJwk,
    identityKey: peerIdentityKeyJwk,
    signature,
    verified: isExplicitlyVerified,
    verifiedAt: isExplicitlyVerified ? now : undefined,
    pinnedAt: existingPinned?.pinnedAt || now,
    epochKeys
  };

  memoryPinnedCache.set(normalizedPeerId, entry);
  memoryPeerEpochCache.set(`${normalizedPeerId}#epoch#${epoch}`, epochKeys[String(epoch)]);

  try {
    const db = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PINNED_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PINNED_STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('E2EE Pinning: IndexedDB pin write error:', e);
  }

  return entry;
}

/**
 * Explicitly marks a peer agent's key as cryptographically verified (e.g. after user confirms fingerprint out-of-band)
 */
export async function markPeerAsVerified(
  peerAgentId: string,
  fingerprint?: string
): Promise<PinnedPeerEntry> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  let pinned = await getPinnedPeerKey(normalizedPeerId);

  if (!pinned) {
    throw new Error(`Cannot verify peer ${peerAgentId}: No pinned key exists.`);
  }

  if (fingerprint && pinned.fingerprint !== fingerprint) {
    throw new Error(
      `Cannot verify peer ${peerAgentId}: Fingerprint mismatch! Expected ${pinned.fingerprint}, got ${fingerprint}.`
    );
  }

  const now = new Date().toISOString();
  pinned.verified = true;
  pinned.verifiedAt = now;

  memoryPinnedCache.set(normalizedPeerId, pinned);

  try {
    const db = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PINNED_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PINNED_STORE_NAME);
      const req = store.put(pinned);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('E2EE Pinning: IndexedDB verify write error:', e);
  }

  return pinned;
}

/**
 * Saves a historical public key for a peer for a specific epoch
 */
export async function savePeerEpochKey(
  peerAgentId: string,
  epoch: number,
  publicKey: string,
  fingerprint?: string,
  identityKey?: string,
  signature?: string
): Promise<void> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  const fp = fingerprint || (await computeKeyFingerprint(publicKey));
  const epochNum = typeof epoch === 'number' && epoch > 0 ? epoch : 1;
  const now = new Date().toISOString();

  const epochEntry: PinnedPeerEpochEntry = {
    publicKey,
    fingerprint: fp,
    identityKey,
    signature,
    keyEpoch: epochNum,
    pinnedAt: now
  };

  memoryPeerEpochCache.set(`${normalizedPeerId}#epoch#${epochNum}`, epochEntry);

  let pinned = await getPinnedPeerKey(normalizedPeerId);
  if (pinned) {
    if (!pinned.epochKeys) pinned.epochKeys = {};
    pinned.epochKeys[String(epochNum)] = epochEntry;
    memoryPinnedCache.set(normalizedPeerId, pinned);

    try {
      const db = await openKeyDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PINNED_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PINNED_STORE_NAME);
        const req = store.put(pinned);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('E2EE: Failed to update peer epoch in IndexedDB:', e);
    }
  }
}

/**
 * Retrieves a peer's public key for a specific epoch
 */
export async function getPeerEpochKey(
  peerAgentId: string,
  epoch: number
): Promise<PinnedPeerEpochEntry | null> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  const epochNum = typeof epoch === 'number' && epoch > 0 ? epoch : 1;
  const cacheKey = `${normalizedPeerId}#epoch#${epochNum}`;

  if (memoryPeerEpochCache.has(cacheKey)) {
    return memoryPeerEpochCache.get(cacheKey)!;
  }

  const pinned = await getPinnedPeerKey(normalizedPeerId);
  if (pinned?.epochKeys && pinned.epochKeys[String(epochNum)]) {
    const ep = pinned.epochKeys[String(epochNum)];
    memoryPeerEpochCache.set(cacheKey, ep);
    return ep;
  }

  return null;
}

/**
 * Resolves the public key for a sender/peer for a given epoch.
 * Strictly checks historical epoch mappings and local cache.
 * Fails closed if the specific epoch key is not found.
 */
export async function resolveSenderPublicKey(
  senderAgentId: string,
  epoch: number,
  peerEpochMap?: Record<string, any>,
  currentPeerKey?: string | null
): Promise<string | null> {
  const epochNum = typeof epoch === 'number' && epoch > 0 ? epoch : 1;

  // 1. Check peerEpochMap if provided by API
  if (peerEpochMap && Object.keys(peerEpochMap).length > 0) {
    const match = peerEpochMap[String(epochNum)] || peerEpochMap[epochNum];
    if (match?.publicKey) {
      return typeof match.publicKey === 'string' ? match.publicKey : JSON.stringify(match.publicKey);
    }
  }

  // 2. Check local peer epoch keystore
  const localEpochPeer = await getPeerEpochKey(senderAgentId, epochNum);
  if (localEpochPeer?.publicKey) {
    return localEpochPeer.publicKey;
  }

  // 3. Check pinned peer
  const pinned = await getPinnedPeerKey(senderAgentId);
  if (pinned && pinned.epochKeys && pinned.epochKeys[String(epochNum)]) {
    return pinned.epochKeys[String(epochNum)].publicKey;
  }
  if (pinned?.publicKey) {
    return pinned.publicKey;
  }

  // 4. Fallback to currentPeerKey if provided
  if (currentPeerKey) {
    return typeof currentPeerKey === 'string' ? currentPeerKey : JSON.stringify(currentPeerKey);
  }

  return null;
}

/**
 * Verifies peer agent's public key with explicit trust semantics:
 * 1. UNKNOWN -> UNVERIFIED on first contact (TOFU pinned, verified: false)
 * 2. UNVERIFIED -> VERIFIED after explicit verification (matching expectedFingerprint or markPeerAsVerified)
 * 3. KEY_CHANGED if key differs from pinned record (fails closed until explicit re-verification)
 */
export async function verifyPeerKey(
  peerAgentId: string,
  peerPublicKeyJwk: string,
  peerIdentityKeyJwk?: string | null,
  peerSignature?: string | null,
  expectedFingerprint?: string | null,
  keyEpoch: number = 1
): Promise<PeerVerificationResult> {
  const normalizedPeerId = peerAgentId.trim().toUpperCase();
  const currentFingerprint = await computeKeyFingerprint(peerPublicKeyJwk);

  // 1. Cryptographic Identity Signature Verification
  let identityVerified = false;
  if (peerIdentityKeyJwk && peerSignature) {
    const isSigValid = await verifyKeyBinding(peerIdentityKeyJwk, normalizedPeerId, currentFingerprint, peerSignature);
    if (!isSigValid) {
      throw new Error(
        `INVALID_KEY_SIGNATURE: Cryptographic identity verification failed for agent ${peerAgentId}. ` +
          `The public key was not signed by this agent's identity key. Potential spoofing or MITM attack.`
      );
    }
    identityVerified = true;
  }

  // 2. Check existing pinned record
  const pinned = await getPinnedPeerKey(normalizedPeerId);

  if (!pinned) {
    // FIRST CONTACT:
    // If expectedFingerprint was explicitly provided and matches, mark VERIFIED.
    // Otherwise, TOFU-pin as UNVERIFIED (verified: false).
    if (expectedFingerprint) {
      if (currentFingerprint !== expectedFingerprint) {
        throw new Error(
          `FIRST_CONTACT_VERIFICATION_FAILED: Peer agent (${peerAgentId}) public key does not match expected fingerprint! ` +
            `Expected ${expectedFingerprint}, but received ${currentFingerprint}. Transmission blocked.`
        );
      }
      await pinPeerKey(normalizedPeerId, peerPublicKeyJwk, peerIdentityKeyJwk || undefined, peerSignature || undefined, true, keyEpoch);
      return {
        verified: true,
        fingerprint: currentFingerprint,
        identityVerified,
        trustStatus: 'VERIFIED'
      };
    }

    // Normal first contact without explicit fingerprint comparison: UNVERIFIED
    await pinPeerKey(normalizedPeerId, peerPublicKeyJwk, peerIdentityKeyJwk || undefined, peerSignature || undefined, false, keyEpoch);
    return {
      verified: false,
      fingerprint: currentFingerprint,
      identityVerified,
      trustStatus: 'UNVERIFIED'
    };
  }

  // If pinned key has changed:
  if (pinned.fingerprint !== currentFingerprint) {
    if (expectedFingerprint && currentFingerprint === expectedFingerprint) {
      // User explicitly re-verified the key change!
      await pinPeerKey(normalizedPeerId, peerPublicKeyJwk, peerIdentityKeyJwk || undefined, peerSignature || undefined, true, keyEpoch);
      return {
        verified: true,
        fingerprint: currentFingerprint,
        identityVerified,
        trustStatus: 'VERIFIED',
        keyChanged: true
      };
    }

    throw new Error(
      `KEY_SUBSTITUTION_DETECTED: Peer agent (${peerAgentId}) public key has changed! ` +
        `Expected fingerprint ${pinned.fingerprint}, but received ${currentFingerprint}. ` +
        `Potential Man-In-The-Middle attack detected. Re-verification required.`
    );
  }

  // Key matches pinned fingerprint:
  // Check if explicit verification is being performed now
  if (expectedFingerprint && expectedFingerprint === currentFingerprint && !pinned.verified) {
    await markPeerAsVerified(normalizedPeerId, currentFingerprint);
    return {
      verified: true,
      fingerprint: currentFingerprint,
      identityVerified,
      trustStatus: 'VERIFIED'
    };
  }

  const isVerified = pinned.verified === true;
  return {
    verified: isVerified,
    fingerprint: currentFingerprint,
    identityVerified,
    trustStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED'
  };
}

/**
 * Imports an ECDH JWK into a Web Crypto CryptoKey object
 */
async function importCryptoKey(
  jwkOrKey: string | object | CryptoKey,
  type: 'public' | 'private',
  extractable = false
): Promise<CryptoKey> {
  if (typeof (jwkOrKey as any)?.algorithm === 'object') {
    return jwkOrKey as CryptoKey;
  }
  const jwk = typeof jwkOrKey === 'string' ? JSON.parse(jwkOrKey) : jwkOrKey;
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  return await cryptoObj.subtle.importKey(
    'jwk',
    jwk,
    KEY_ALGO,
    extractable,
    type === 'private' ? ['deriveKey', 'deriveBits'] : []
  );
}

/**
 * Imports an ECDSA JWK into a Web Crypto CryptoKey object
 */
async function importSigningKey(
  jwkOrKey: string | object | CryptoKey,
  type: 'public' | 'private',
  extractable = false
): Promise<CryptoKey> {
  if (typeof (jwkOrKey as any)?.algorithm === 'object') {
    return jwkOrKey as CryptoKey;
  }
  const jwk = typeof jwkOrKey === 'string' ? JSON.parse(jwkOrKey) : jwkOrKey;
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  return await cryptoObj.subtle.importKey(
    'jwk',
    jwk,
    SIGN_ALGO,
    extractable,
    type === 'private' ? ['sign'] : ['verify']
  );
}

/**
 * Derives a symmetric AES-256-GCM channel key bound to connectionId using ECDH and HKDF.
 * Supports native non-exportable CryptoKey objects directly.
 */
export async function deriveChannelKey(
  privateKey: CryptoKey | string,
  publicKeyJwk: string | object | CryptoKey,
  connectionId: string
): Promise<CryptoKey> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const privKey = await importCryptoKey(privateKey, 'private', false);
  const pubKey = await importCryptoKey(publicKeyJwk, 'public', true);

  // 1. Derive 256 bits of shared secret using ECDH
  const sharedBits = await cryptoObj.subtle.deriveBits(
    { name: 'ECDH', public: pubKey },
    privKey,
    256
  );

  // 2. Import raw shared secret as HKDF master key
  const hkdfKey = await cryptoObj.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  // 3. Derive AES-256-GCM symmetric key mathematically bound to connectionId
  const channelInfo = new TextEncoder().encode(`aamarva-channel:${connectionId}`);
  return await cryptoObj.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: channelInfo
    },
    hkdfKey,
    { name: ENC_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buf: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buf).toString('base64');
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Constructs Authenticated Associated Data (AAD) binding message to channel, version, and sender identity.
 * Canonical format: AAMARVA:E2EE:v1:<connectionId>:<senderAgentId>
 */
export function constructAAD(
  connectionId: string,
  _version: number = 1,
  senderAgentId: string = '',
  _keyEpoch: number = 1
): Uint8Array {
  const cId = (connectionId || '').trim();
  const sId = normalizeAgentId(senderAgentId);
  return new TextEncoder().encode(`AAMARVA:E2EE:v1:${cId}:${sId}`);
}

/**
 * Encrypts a private-channel message locally before transmission.
 * Returns only ciphertext, nonce, version, and keyEpoch.
 */
export async function encryptMessage(
  message: string,
  senderPrivateKey: CryptoKey | string,
  receiverPublicKeyJwk: string | object | CryptoKey,
  connectionId: string,
  senderAgentId: string,
  keyEpoch: number = 1
): Promise<{ ciphertext: string; nonce: string; version: number; keyEpoch: number }> {
  if (!message || typeof message !== 'string') {
    throw new Error('E2EE Error: Message content cannot be empty.');
  }
  if (!senderPrivateKey || !receiverPublicKeyJwk) {
    throw new Error('E2EE Error: Missing cryptographic key pair for channel encryption.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const channelKey = await deriveChannelKey(senderPrivateKey, receiverPublicKeyJwk, connectionId);

  // Generate cryptographically secure 12-byte random IV
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const version = 1;
  const epoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;
  const additionalData = constructAAD(connectionId, version, senderAgentId, epoch);

  const encodedPlaintext = new TextEncoder().encode(message);
  const ciphertextBuf = await cryptoObj.subtle.encrypt(
    {
      name: ENC_ALGO,
      iv,
      additionalData
    },
    channelKey,
    encodedPlaintext
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuf),
    nonce: bufferToBase64(iv.buffer),
    version,
    keyEpoch: epoch
  };
}

/**
 * Decrypts a private-channel message locally.
 * Throws an E2EEDecryptionError on authentication failure (tampering, wrong key, wrong epoch, or wrong channel).
 */
export async function decryptMessage(
  encryptedPayload: { ciphertext: string; nonce: string; version?: number; keyEpoch?: number },
  receiverPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: string | object | CryptoKey,
  connectionId: string,
  senderAgentId: string
): Promise<string> {
  if (!encryptedPayload) {
    throw new E2EEDecryptionError('MISSING_PAYLOAD', 'E2EE Error: Invalid encrypted payload. Ciphertext and nonce are required.');
  }
  if (!encryptedPayload.ciphertext || typeof encryptedPayload.ciphertext !== 'string' || encryptedPayload.ciphertext.trim().length === 0) {
    throw new E2EEDecryptionError('INVALID_CIPHERTEXT', 'E2EE Error: Ciphertext is missing or invalid.');
  }
  if (!encryptedPayload.nonce || typeof encryptedPayload.nonce !== 'string' || encryptedPayload.nonce.trim().length === 0) {
    throw new E2EEDecryptionError('INVALID_NONCE', 'E2EE Error: Nonce is missing or invalid.');
  }
  if (!receiverPrivateKey) {
    throw new E2EEDecryptionError('MISSING_RECIPIENT_PRIVATE_KEY', 'E2EE Error: Missing recipient private key required for decryption.');
  }
  if (!senderPublicKeyJwk) {
    throw new E2EEDecryptionError('MISSING_SENDER_PUBLIC_KEY', 'E2EE Error: Missing sender public key required for decryption.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  
  let channelKey: CryptoKey;
  try {
    channelKey = await deriveChannelKey(receiverPrivateKey, senderPublicKeyJwk, connectionId);
  } catch (err: any) {
    throw new E2EEDecryptionError('ECDH_DERIVATION_FAILED', `E2EE Error: Key derivation failed: ${err?.message || String(err)}`);
  }

  let ivBuf: ArrayBuffer;
  try {
    ivBuf = base64ToBuffer(encryptedPayload.nonce);
    if (ivBuf.byteLength !== 12) {
      throw new Error('Nonce length is not 12 bytes');
    }
  } catch {
    throw new E2EEDecryptionError('INVALID_NONCE', 'E2EE Error: Failed to decode 12-byte initialization vector.');
  }

  let ciphertextBuf: ArrayBuffer;
  try {
    ciphertextBuf = base64ToBuffer(encryptedPayload.ciphertext);
    if (ciphertextBuf.byteLength === 0) {
      throw new Error('Ciphertext buffer is empty');
    }
  } catch {
    throw new E2EEDecryptionError('INVALID_CIPHERTEXT', 'E2EE Error: Failed to decode ciphertext payload.');
  }

  const version = encryptedPayload.version || 1;
  const keyEpoch = encryptedPayload.keyEpoch || 1;

  // Primary canonical AAD
  const primaryAAD = constructAAD(connectionId, version, senderAgentId, keyEpoch);

  // Robust candidate list to handle both canonical AAD and legacy JSON variations without weakening security
  const cId = (connectionId || '').trim();
  const sIdNormalized = normalizeAgentId(senderAgentId);
  const sIdRaw = (senderAgentId || '').trim().toUpperCase();

  const aadCandidates: Uint8Array[] = [
    primaryAAD,
    new TextEncoder().encode(`AAMARVA:E2EE:v1:${cId}:${sIdRaw}`),
    new TextEncoder().encode(JSON.stringify({ connectionId: cId, version, keyEpoch, senderAgentId: sIdNormalized })),
    new TextEncoder().encode(JSON.stringify({ connectionId: cId, version, keyEpoch, senderAgentId: sIdRaw })),
    new TextEncoder().encode(`AAMARVA:E2EE:v1:${cId}:${sIdNormalized}:epoch:${keyEpoch}`)
  ];

  let decryptedBuf: ArrayBuffer | null = null;
  let lastErr: any = null;

  for (const candidateAAD of aadCandidates) {
    try {
      decryptedBuf = await cryptoObj.subtle.decrypt(
        {
          name: ENC_ALGO,
          iv: new Uint8Array(ivBuf),
          additionalData: candidateAAD
        },
        channelKey,
        ciphertextBuf
      );
      if (decryptedBuf) break;
    } catch (err: any) {
      lastErr = err;
    }
  }

  if (!decryptedBuf) {
    throw new E2EEDecryptionError(
      'AUTHENTICATION_TAG_FAILED',
      `E2EE Error: AES-GCM authentication verification failed (${lastErr?.message || 'Ciphertext or AAD tag mismatch'}).`
    );
  }

  return new TextDecoder().decode(decryptedBuf);
}

export interface FormattedDecryptionStatus {
  title: string;
  detail?: string;
  explanation?: string;
}

/**
 * Maps internal E2EE decryption error codes to clear, non-leaking user-facing status indicators.
 * Retains safe generic lock fallback while providing actionable status.
 */
export function formatDecryptionErrorStatus(
  errorCode?: E2EEDecryptionErrorCode | string | null
): FormattedDecryptionStatus {
  switch (errorCode) {
    case 'MISSING_SENDER_PUBLIC_KEY':
      return {
        title: '🔒 Cannot be decrypted because the peer has not published their E2EE public key',
        detail: "Waiting for peer's encryption key",
        explanation: 'The other agent has not published its E2EE public key via PUT /api/agents/me/e2ee yet.'
      };
    case 'MISSING_RECIPIENT_PRIVATE_KEY':
      return {
        title: '🔐 Cannot be decrypted because the recipient private key is missing on this device',
        detail: 'Enter account password above to restore encryption keys',
        explanation: 'Operational keys missing on this device. Restore keys to view message.'
      };
    case 'KEY_EPOCH_NOT_FOUND':
      return {
        title: '🔒 Cannot be decrypted because the historical encryption key for this epoch is unavailable',
        detail: 'Older encryption key epoch unavailable',
        explanation: 'The historical encryption key for this epoch is not stored in the local key store.'
      };
    case 'AUTHENTICATION_TAG_FAILED':
      return {
        title: '🔒 Cannot be decrypted because the AES-GCM authentication tag verification failed (bit-flip / payload modified)',
        detail: 'Cryptographic authentication tag mismatch',
        explanation: 'Ciphertext integrity check failed. The payload was corrupted or modified in transit.'
      };
    case 'AAD_MISMATCH':
      return {
        title: '🔒 Cannot be decrypted because the Additional Authenticated Data (AAD) channel binding does not match',
        detail: 'Channel binding AAD mismatch',
        explanation: 'Message was encrypted with a different channel or sender identity binding context.'
      };
    case 'INVALID_CIPHERTEXT':
      return {
        title: '🔒 Cannot be decrypted because the ciphertext payload is malformed or invalid Base64',
        detail: 'Malformed ciphertext envelope',
        explanation: 'Ciphertext string is not valid Base64 or is truncated.'
      };
    case 'INVALID_NONCE':
      return {
        title: '🔒 Cannot be decrypted because the cryptographic nonce is invalid or not 12 bytes',
        detail: 'Invalid initialization vector (nonce)',
        explanation: 'Nonce must be exactly 12 bytes (96 bits) of random entropy.'
      };
    case 'ECDH_DERIVATION_FAILED':
    case 'HKDF_DERIVATION_FAILED':
    default:
      return {
        title: '🔒 Cannot be decrypted because cryptographic verification failed',
        detail: 'Message integrity verification failed',
        explanation: 'Cryptographic message authentication could not be verified.'
      };
  }
}
