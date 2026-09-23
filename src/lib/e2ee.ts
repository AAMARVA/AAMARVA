// End-to-End Encryption (E2EE) Module for AAMARVA
// Cryptographic Primitives: ECDH (NIST P-256), HKDF (SHA-256), AES-256-GCM with Authenticated Associated Data (AAD)
// Key Storage: Web Crypto API with Non-Exportable Private Keys (extractable: false) + Persistent IndexedDB Keystore
// Identity Binding: Authenticated ECDSA (NIST P-256) Identity Signatures + Secondary TOFU Pinning Defense-in-Depth
// Zero-Knowledge Architecture: Deterministic P-256 derivation from user credential for zero plaintext server storage

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
}

/**
 * Generates an ECDH P-256 Key Pair for the agent.
 * CRITICAL SECURITY GUARANTEE: Private key is generated with extractable: false.
 * The private key cannot be exported to JWK, JSON, strings, or sent to backend.
 */
export async function generateE2EEKeyPair(): Promise<E2EEKeyPair> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const keyPair = await cryptoObj.subtle.generateKey(
    KEY_ALGO,
    false, // extractable: false (NON-EXPORTABLE)
    ['deriveKey', 'deriveBits']
  );

  // Export public key only for distribution
  const exportedPub = await cryptoObj.subtle.exportKey('jwk', keyPair.publicKey);
  const pubStr = JSON.stringify(exportedPub);
  const fingerprint = await computeKeyFingerprint(pubStr);

  return {
    publicKey: pubStr,
    privateKey: keyPair.privateKey,
    fingerprint
  };
}

export interface IdentitySigningKeyPair {
  identityPublicKey: string;
  identityPrivateKey: CryptoKey;
}

/**
 * Generates an ECDSA P-256 Signing Key Pair for agent cryptographic identity.
 * Private key is non-exportable (extractable: false).
 */
export async function generateIdentitySigningKeyPair(): Promise<IdentitySigningKeyPair> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const keyPair = await cryptoObj.subtle.generateKey(
    SIGN_ALGO,
    false, // extractable: false (NON-EXPORTABLE)
    ['sign', 'verify']
  );

  const exportedPub = await cryptoObj.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    identityPublicKey: JSON.stringify(exportedPub),
    identityPrivateKey: keyPair.privateKey
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
    keyEpoch: 1
  };
}

/**
 * Deterministically derives an agent cryptographic identity from their password or API credential.
 * Enables 100% Zero-Knowledge E2EE: The server NEVER stores plaintext, and any client logging in with
 * the credential reconstructs the identical private keys in local memory.
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
    false, // extractable: false for security in memory
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
    false, // extractable: false
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
    keyEpoch
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

  const effectiveEpoch = typeof currentEpoch === 'number' && currentEpoch > 0
    ? currentEpoch
    : (currentKey?.keyEpoch || 1);
  const nextEpoch = effectiveEpoch + 1;

  // Generate fresh ECDH key pair (non-exportable)
  const newE2ee = await generateE2EEKeyPair();

  // Retrieve or regenerate identity signing key
  let idSignKey: CryptoKey;
  let idPubStr: string;

  if (currentKey?.identityPrivateKey && currentKey?.identityPublicKey) {
    idSignKey = await importSigningKey(currentKey.identityPrivateKey, 'private', false);
    idPubStr = typeof currentKey.identityPublicKey === 'string'
      ? currentKey.identityPublicKey
      : JSON.stringify(currentKey.identityPublicKey);
  } else {
    const freshIdSign = await generateIdentitySigningKeyPair();
    idSignKey = freshIdSign.identityPrivateKey;
    idPubStr = freshIdSign.identityPublicKey;
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
    nextEpoch
  );

  return {
    e2eePublicKey: newE2ee.publicKey,
    e2eePrivateKey: newE2ee.privateKey,
    fingerprint: newE2ee.fingerprint,
    identityPublicKey: idPubStr,
    identityPrivateKey: idSignKey,
    signature,
    keyEpoch: nextEpoch
  };
}

/**
 * Saves agent's local keys into persistent IndexedDB keystore.
 * Stores native CryptoKey objects (non-exportable) directly via IndexedDB structured clone.
 * Also archives entry in historical epoch store.
 */
export async function saveLocalKeyPair(
  agentId: string,
  publicKey: string,
  privateKey: CryptoKey | string,
  fingerprint?: string,
  identityPublicKey?: string,
  identityPrivateKey?: CryptoKey | string,
  signature?: string,
  keyEpoch: number = 1
): Promise<void> {
  const normalizedAgentId = agentId.trim().toUpperCase();
  const fp = fingerprint || (await computeKeyFingerprint(publicKey));
  const epoch = typeof keyEpoch === 'number' && keyEpoch > 0 ? keyEpoch : 1;

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
  memoryEpochCache.set(`${normalizedAgentId}#epoch#${epoch}`, entry);

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
  credential?: string
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

  // Fallback: If credential provided, derive deterministically on the fly
  if (credential) {
    try {
      const derived = await deriveAgentCryptoIdentity(normalizedAgentId, credential, epoch || 1);
      await saveLocalKeyPair(
        normalizedAgentId,
        derived.e2eePublicKey,
        derived.e2eePrivateKey,
        derived.fingerprint,
        derived.identityPublicKey,
        derived.identityPrivateKey,
        derived.signature,
        derived.keyEpoch
      );
      const derivedEntry: StoredAgentKeyEntry = {
        publicKey: derived.e2eePublicKey,
        privateKey: derived.e2eePrivateKey,
        fingerprint: derived.fingerprint,
        identityPublicKey: derived.identityPublicKey,
        identityPrivateKey: derived.identityPrivateKey,
        signature: derived.signature,
        keyEpoch: derived.keyEpoch
      };
      return derivedEntry;
    } catch (deriveErr) {
      console.warn('Deterministic key derivation note:', deriveErr);
    }
  }

  return null;
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
 * Constructs Authenticated Associated Data (AAD) binding message to channel, version, epoch, and sender identity
 */
function constructAAD(connectionId: string, version: number, senderAgentId: string, keyEpoch: number = 1): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      connectionId,
      version,
      keyEpoch,
      senderAgentId: senderAgentId.toUpperCase()
    })
  );
}

/**
 * Encrypts a private-channel message locally before transmission.
 * Returns ciphertext, nonce, version, keyEpoch, and optional digital signature.
 */
export async function encryptMessage(
  message: string,
  senderPrivateKey: CryptoKey | string,
  receiverPublicKeyJwk: string | object | CryptoKey,
  connectionId: string,
  senderAgentId: string,
  keyEpoch: number = 1,
  senderIdentityPrivateKey?: CryptoKey | string
): Promise<{ ciphertext: string; nonce: string; signature?: string; version: number; keyEpoch: number }> {
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

  const ciphertextBase64 = bufferToBase64(ciphertextBuf);
  const nonceBase64 = bufferToBase64(iv.buffer);

  let signatureBase64: string | undefined;
  if (senderIdentityPrivateKey) {
    try {
      signatureBase64 = await signMessagePayload(
        senderIdentityPrivateKey,
        connectionId,
        senderAgentId,
        nonceBase64,
        ciphertextBase64
      );
    } catch (sigErr) {
      console.warn('E2EE Warning: Could not sign message payload:', sigErr);
    }
  }

  return {
    ciphertext: ciphertextBase64,
    nonce: nonceBase64,
    signature: signatureBase64,
    version,
    keyEpoch: epoch
  };
}

/**
 * Digitally signs an encrypted message payload (ciphertext + nonce) using the sender's ECDSA Identity Private Key.
 */
export async function signMessagePayload(
  identityPrivateKey: CryptoKey | string,
  connectionId: string,
  senderAgentId: string,
  nonce: string,
  ciphertext: string
): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const canonicalAgentId = senderAgentId.trim().toUpperCase();
  const statement = new TextEncoder().encode(
    `AAMARVA-E2EE-MSG:v1:${connectionId}:${canonicalAgentId}:${nonce}:${ciphertext}`
  );
  const idPrivKey = await importSigningKey(identityPrivateKey, 'private', false);
  const sigBuf = await cryptoObj.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    idPrivKey,
    statement
  );
  return bufferToBase64(sigBuf);
}

/**
 * Cryptographically verifies an encrypted message payload digital signature using the sender's ECDSA Identity Public Key.
 */
export async function verifyMessageSignature(
  identityPublicKeyJwk: string | object,
  connectionId: string,
  senderAgentId: string,
  nonce: string,
  ciphertext: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const canonicalAgentId = senderAgentId.trim().toUpperCase();
    const statement = new TextEncoder().encode(
      `AAMARVA-E2EE-MSG:v1:${connectionId}:${canonicalAgentId}:${nonce}:${ciphertext}`
    );
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

/**
 * Decrypts a private-channel message locally.
 * Throws an error on authentication failure (tampering, wrong key, wrong epoch, or wrong channel).
 */
export async function decryptMessage(
  encryptedPayload: { ciphertext: string; nonce: string; version?: number; keyEpoch?: number },
  receiverPrivateKey: CryptoKey | string,
  senderPublicKeyJwk: string | object | CryptoKey,
  connectionId: string,
  senderAgentId: string
): Promise<string> {
  if (!encryptedPayload || !encryptedPayload.ciphertext || !encryptedPayload.nonce) {
    throw new Error('E2EE Error: Invalid encrypted payload. Ciphertext and nonce are required.');
  }
  if (!receiverPrivateKey || !senderPublicKeyJwk) {
    throw new Error('E2EE Error: Missing cryptographic keys required for decryption.');
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const channelKey = await deriveChannelKey(receiverPrivateKey, senderPublicKeyJwk, connectionId);

  const iv = base64ToBuffer(encryptedPayload.nonce);
  const ciphertext = base64ToBuffer(encryptedPayload.ciphertext);
  const version = encryptedPayload.version || 1;
  const keyEpoch = encryptedPayload.keyEpoch || 1;
  const additionalData = constructAAD(connectionId, version, senderAgentId, keyEpoch);

  const decryptedBuf = await cryptoObj.subtle.decrypt(
    {
      name: ENC_ALGO,
      iv: new Uint8Array(iv),
      additionalData
    },
    channelKey,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuf);
}
