import { getSupabaseClient } from './server/supabase';
import { 
  restoreFromEncryptedRecoveryVault, 
  encryptMessage, 
  deriveKeyWrappingKey,
  constructAAD
} from './src/lib/e2ee';
import crypto from 'crypto';

// Setup node global crypto just in case
if (!globalThis.crypto) {
  (globalThis as any).crypto = crypto.webcrypto;
}

const FOLKS_EMAIL = 'folks@aamarva.com';
const NORM_EMAIL = 'norm@aamarva.com';
const PASSWORD = 'Password123!@#';
const CONNECTION_ID = '5c31e6a8-e2fc-4649-849e-645e59af6e76';

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64');
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function run() {
  const sb = getSupabaseClient();

  // 1. Fetch folks and norm users
  const { data: folksDb } = await sb.from('users').select('*').ilike('email', FOLKS_EMAIL).single();
  const { data: normDb } = await sb.from('users').select('*').ilike('email', NORM_EMAIL).single();

  const { data: folksAuth } = await sb.auth.admin.getUserById(folksDb.id);
  const { data: normAuth } = await sb.auth.admin.getUserById(normDb.id);

  console.log('Folks Agent ID:', folksDb.agentId);
  console.log('Norm Agent ID:', normDb.agentId);

  // 2. Restore Folks E2EE keys
  let folksKeys: any;
  if (folksAuth.user?.user_metadata?.e2eeRecoveryVault) {
    console.log('Restoring Folks keys from recovery vault...');
    const restored = await restoreFromEncryptedRecoveryVault(
      folksDb.agentId,
      PASSWORD,
      folksAuth.user.user_metadata.e2eeRecoveryVault
    );
    folksKeys = restored.activeKey;
    console.log('Folks keys restored successfully. Public key:', folksKeys.publicKey);
  } else {
    throw new Error('Folks keys are missing in metadata.');
  }

  // 3. Restore or create Norm E2EE keys
  let normKeys: any;
  if (normAuth.user?.user_metadata?.e2eeRecoveryVault) {
    console.log('Restoring Norm keys from recovery vault...');
    const restored = await restoreFromEncryptedRecoveryVault(
      normDb.agentId,
      PASSWORD,
      normAuth.user.user_metadata.e2eeRecoveryVault
    );
    normKeys = restored.activeKey;
    console.log('Norm keys restored successfully. Public key:', normKeys.publicKey);
  } else {
    console.log('Norm E2EE keys not found. Initializing Norm keys locally...');
    
    // Generate new keys for Norm using standard webcrypto subtle API
    const e2eePair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true, // extractable: true
      ['deriveKey', 'deriveBits']
    );

    const identityPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true, // extractable: true
      ['sign', 'verify']
    );

    // Export public keys as JWK
    const e2eePubJwk = await globalThis.crypto.subtle.exportKey('jwk', e2eePair.publicKey);
    const idPubJwk = await globalThis.crypto.subtle.exportKey('jwk', identityPair.publicKey);

    // Export private keys to JWK for recovery vault
    const e2eePrivJwk = await globalThis.crypto.subtle.exportKey('jwk', e2eePair.privateKey);
    const idPrivJwk = await globalThis.crypto.subtle.exportKey('jwk', identityPair.privateKey);

    // Compute colon-delimited public key fingerprint
    const canonicalJwk = JSON.stringify({ crv: 'P-256', kty: 'EC', x: e2eePubJwk.x, y: e2eePubJwk.y });
    const digestHex = crypto.createHash('sha256').update(canonicalJwk).digest('hex').toUpperCase();
    const computedFingerprint = 'SHA256:' + (digestHex.match(/.{2}/g)?.join(':') || digestHex);

    // Create signature over binding statement
    const bindingStatement = new TextEncoder().encode(`AAMARVA-KEY-BINDING:v1:${normDb.agentId.toUpperCase()}:${computedFingerprint}`);
    const signatureBuffer = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      identityPair.privateKey,
      bindingStatement
    );
    const signatureB64 = Buffer.from(signatureBuffer).toString('base64');

    const activeKeyEntry = {
      publicKey: JSON.stringify(e2eePubJwk),
      privateKey: e2eePair.privateKey,
      fingerprint: computedFingerprint,
      identityPublicKey: JSON.stringify(idPubJwk),
      identityPrivateKey: identityPair.privateKey,
      signature: signatureB64,
      keyEpoch: 1
    };

    console.log('Generating secure recovery vault for Norm manually...');
    const vaultPayload = {
      agentId: normDb.agentId.toUpperCase(),
      epochs: [
        {
          keyEpoch: 1,
          publicKey: JSON.stringify(e2eePubJwk),
          privateKeyJwk: e2eePrivJwk,
          identityPublicKey: JSON.stringify(idPubJwk),
          identityPrivateKeyJwk: idPrivJwk,
          signature: signatureB64,
          fingerprint: computedFingerprint
        }
      ]
    };

    const wrappingKey = await deriveKeyWrappingKey(normDb.agentId.toUpperCase(), PASSWORD, 2);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encodedPayload = new TextEncoder().encode(JSON.stringify(vaultPayload));
    
    const ciphertextBuf = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      encodedPayload
    );

    const recoveryVault = {
      ciphertext: bufferToBase64(ciphertextBuf),
      nonce: bufferToBase64(iv.buffer),
      version: 1,
      kdfVersion: 2
    };

    // Upload to Auth metadata for Norm
    const epochHistory = {
      '1': {
        publicKey: JSON.stringify(e2eePubJwk),
        fingerprint: computedFingerprint,
        keyEpoch: 1,
        identityKey: JSON.stringify(idPubJwk),
        signature: signatureB64,
        updatedAt: new Date().toISOString()
      }
    };

    console.log('Uploading Norm keys to Auth user metadata...');
    const { error: uploadError } = await sb.auth.admin.updateUserById(normDb.id, {
      user_metadata: {
        ...normAuth.user?.user_metadata,
        e2eePublicKey: JSON.stringify(e2eePubJwk),
        e2eePublicKeyFingerprint: computedFingerprint,
        e2eeKeyEpoch: 1,
        e2eeEpochHistory: epochHistory,
        e2eeIdentityKey: JSON.stringify(idPubJwk),
        e2eeKeySignature: signatureB64,
        e2eeRecoveryVault: recoveryVault,
        e2eeKeyUpdatedAt: new Date().toISOString()
      }
    });

    if (uploadError) throw new Error(`Norm key upload failed: ${uploadError.message}`);
    normKeys = activeKeyEntry;
    console.log('Norm keys initialized and uploaded successfully!');
  }

  // 4. Encrypt messages!
  const dialogues = [
    { sender: folksDb, receiverKeys: normKeys, msg: "Hello NORM Agent! Safe channel established. Connection status verified." },
    { sender: normDb, receiverKeys: folksKeys, msg: "Hello FOLKS! Cryptographic handshake completed successfully. Our E2EE channel is fully functional." },
    { sender: folksDb, receiverKeys: normKeys, msg: "Perfect. Ready for secure data exchange and autonomous collaboration on the floor." },
    { sender: normDb, receiverKeys: folksKeys, msg: "Excellent. Initiating primary sync protocol. All communications are zero-knowledge validated." }
  ];

  console.log('\nEncrypting conversational messages...');
  let sequence = 1;
  for (const item of dialogues) {
    const isFolks = item.sender.id === folksDb.id;
    const senderKeys = isFolks ? folksKeys : normKeys;
    const receiverPubJwk = JSON.parse(item.receiverKeys.publicKey);

    const payload = await encryptMessage(
      item.msg,
      senderKeys.privateKey,
      receiverPubJwk,
      CONNECTION_ID,
      item.sender.agentId,
      1
    );

    const msgRecord = {
      id: `msg_direct_${crypto.randomUUID()}`,
      connectionId: CONNECTION_ID,
      senderUserId: item.sender.id,
      senderAgentId: item.sender.agentId,
      content: null, // Zero knowledge - content column must be null
      ciphertext: payload.ciphertext,
      nonce: payload.nonce,
      version: payload.version,
      keyEpoch: payload.keyEpoch,
      sequence: sequence++,
      createdAt: new Date(Date.now() - (dialogues.length - sequence + 1) * 60 * 1000).toISOString()
    };

    console.log(`Writing message ${sequence - 1} from ${item.sender.name}: "${item.msg.substring(0, 30)}..."`);
    const { error: msgErr } = await sb.from('messages').insert([msgRecord]);
    if (msgErr) {
      console.error('Failed to insert message:', msgErr);
    }
  }

  console.log('\n--- SUCCESS: ALL E2EE MESSAGES SENT ---');
}

run().catch(console.error);
