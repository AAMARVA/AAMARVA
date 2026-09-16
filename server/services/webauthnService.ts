import { Request } from 'express';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase';

export interface WebAuthnCredentialRecord {
  id: string;
  userId: string;
  publicKey: string; // base64url string
  counter: number;
  transports?: string[];
  deviceType?: string;
  backedUp?: boolean;
  friendlyName?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface WebAuthnChallengeRecord {
  id: string; // pendingToken
  userId: string;
  challenge: string;
  purpose: 'setup' | 'login';
  expiresAt: string;
  createdAt: string;
}

// In-memory fallback stores
const memoryCredentials = new Map<string, WebAuthnCredentialRecord>();
const memoryChallenges = new Map<string, WebAuthnChallengeRecord>();

export function getExpectedRPID(req: Request): string {
  const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const hostname = hostHeader.split(':')[0]; // strip port
  return hostname;
}

export function getExpectedOrigin(req: Request): string[] {
  const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const originFromReq = req.get('origin');

  const origins = new Set<string>();
  if (originFromReq) {
    origins.add(originFromReq.replace(/\/$/, ''));
  }
  origins.add(`${proto}://${hostHeader}`.replace(/\/$/, ''));

  // Common development / preview URLs
  if (process.env.APP_URL) {
    origins.add(process.env.APP_URL.replace(/\/$/, ''));
  }
  if (process.env.DEV_APP_URL) {
    origins.add(process.env.DEV_APP_URL.replace(/\/$/, ''));
  }

  return Array.from(origins);
}

// ---------------------------------------------------------------------------
// Database / Storage Methods
// ---------------------------------------------------------------------------

export async function getUserWebAuthnCredentials(userId: string): Promise<WebAuthnCredentialRecord[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webauthn_credentials')
        .select('*')
        .eq('userId', userId);

      if (!error && data) {
        return data as WebAuthnCredentialRecord[];
      }
    } catch (e) {
      // Fallback to memory
    }
  }

  // Memory fallback
  return Array.from(memoryCredentials.values()).filter((c) => c.userId === userId);
}

export async function getWebAuthnCredentialById(credentialId: string): Promise<WebAuthnCredentialRecord | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webauthn_credentials')
        .select('*')
        .eq('id', credentialId)
        .maybeSingle();

      if (!error && data) {
        return data as WebAuthnCredentialRecord;
      }
    } catch (e) {
      // Fallback
    }
  }

  return memoryCredentials.get(credentialId) || null;
}

export async function saveWebAuthnCredential(cred: WebAuthnCredentialRecord): Promise<void> {
  memoryCredentials.set(cred.id, cred);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('webauthn_credentials').upsert(cred);
    } catch (e) {
      // Ignore fallback warning
    }
  }
}

export async function updateWebAuthnCredentialCounter(id: string, newCounter: number): Promise<void> {
  const existing = memoryCredentials.get(id);
  const now = new Date().toISOString();

  if (existing) {
    existing.counter = newCounter;
    existing.lastUsedAt = now;
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('webauthn_credentials')
        .update({ counter: newCounter, lastUsedAt: now })
        .eq('id', id);
    } catch (e) {
      // Ignore
    }
  }
}

export async function deleteWebAuthnCredential(id: string, userId: string): Promise<void> {
  memoryCredentials.delete(id);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('webauthn_credentials').delete().eq('id', id).eq('userId', userId);
    } catch (e) {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Challenge Management
// ---------------------------------------------------------------------------

export async function createPendingChallenge(
  userId: string,
  challenge: string,
  purpose: 'setup' | 'login'
): Promise<string> {
  const pendingToken = `pnd_${crypto.randomBytes(24).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes

  const record: WebAuthnChallengeRecord = {
    id: pendingToken,
    userId,
    challenge,
    purpose,
    expiresAt,
    createdAt: now.toISOString(),
  };

  memoryChallenges.set(pendingToken, record);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('webauthn_challenges').upsert(record);
    } catch (e) {
      // Memory fallback active
    }
  }

  return pendingToken;
}

export async function getPendingChallenge(pendingToken: string): Promise<WebAuthnChallengeRecord | null> {
  let record: WebAuthnChallengeRecord | null = memoryChallenges.get(pendingToken) || null;

  if (!record && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webauthn_challenges')
        .select('*')
        .eq('id', pendingToken)
        .maybeSingle();

      if (!error && data) {
        record = data as WebAuthnChallengeRecord;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!record) return null;

  // Check expiration
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await consumePendingChallenge(pendingToken);
    return null;
  }

  return record;
}

export async function consumePendingChallenge(pendingToken: string): Promise<void> {
  memoryChallenges.delete(pendingToken);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('webauthn_challenges').delete().eq('id', pendingToken);
    } catch (e) {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Core WebAuthn Flow Generators & Verifiers
// ---------------------------------------------------------------------------

export async function generateLoginChallenge(
  user: { id: string; email: string; name: string; agentId: string },
  req: Request
): Promise<{
  status: 'WEBAUTHN_REQUIRED' | 'WEBAUTHN_SETUP_REQUIRED';
  pendingToken: string;
  options: any;
}> {
  const rpID = getExpectedRPID(req);
  const userCredentials = await getUserWebAuthnCredentials(user.id);

  if (userCredentials.length > 0) {
    // User ALREADY has WebAuthn setup -> Generate Authentication Challenge
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: userCredentials.map((c) => ({
        id: c.id,
        transports: (c.transports || ['internal']) as any,
      })),
      userVerification: 'preferred',
    });

    const pendingToken = await createPendingChallenge(user.id, options.challenge, 'login');

    return {
      status: 'WEBAUTHN_REQUIRED',
      pendingToken,
      options,
    };
  } else {
    // User DOES NOT HAVE WebAuthn setup -> Force WebAuthn Setup without granting access!
    const options = await generateRegistrationOptions({
      rpName: 'AAMARVA Protocol',
      rpID,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: user.email || user.agentId,
      userDisplayName: user.name || user.agentId,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const pendingToken = await createPendingChallenge(user.id, options.challenge, 'setup');

    return {
      status: 'WEBAUTHN_SETUP_REQUIRED',
      pendingToken,
      options,
    };
  }
}

export async function verifySetupResponse(
  pendingToken: string,
  credentialResponse: any,
  friendlyName: string | undefined,
  req: Request
): Promise<{ userId: string; credentialId: string }> {
  const pending = await getPendingChallenge(pendingToken);
  if (!pending || pending.purpose !== 'setup') {
    throw new Error('Invalid or expired WebAuthn setup session. Please log in again.');
  }

  const expectedRPID = getExpectedRPID(req);
  const expectedOrigin = getExpectedOrigin(req);

  const verification = await verifyRegistrationResponse({
    response: credentialResponse,
    expectedChallenge: pending.challenge,
    expectedOrigin,
    expectedRPID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn device credential verification failed.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  const pubKeyBase64Url = Buffer.from(credential.publicKey).toString('base64url');

  const newCredentialRecord: WebAuthnCredentialRecord = {
    id: credential.id,
    userId: pending.userId,
    publicKey: pubKeyBase64Url,
    counter: credential.counter,
    transports: credentialResponse.response?.transports || ['internal'],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    friendlyName: friendlyName || 'Device Passkey',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  await saveWebAuthnCredential(newCredentialRecord);
  await consumePendingChallenge(pendingToken);

  return { userId: pending.userId, credentialId: credential.id };
}

export async function generateRegisterOptionsForUser(
  user: { id: string; email: string; name: string; agentId: string },
  req: Request
) {
  const rpID = getExpectedRPID(req);
  const userCredentials = await getUserWebAuthnCredentials(user.id);

  const options = await generateRegistrationOptions({
    rpName: 'AAMARVA Protocol',
    rpID,
    userID: new Uint8Array(Buffer.from(user.id)),
    userName: user.email || user.agentId,
    userDisplayName: user.name || user.agentId,
    attestationType: 'none',
    excludeCredentials: userCredentials.map((c) => ({
      id: c.id,
      transports: (c.transports || ['internal']) as any,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  const pendingToken = await createPendingChallenge(user.id, options.challenge, 'setup');

  return { pendingToken, options };
}


export async function verifyLoginResponse(
  pendingToken: string,
  credentialResponse: any,
  req: Request
): Promise<{ userId: string }> {
  const pending = await getPendingChallenge(pendingToken);
  if (!pending || pending.purpose !== 'login') {
    throw new Error('Invalid or expired WebAuthn login session. Please log in again.');
  }

  const credId = credentialResponse.id;
  const storedCred = await getWebAuthnCredentialById(credId);

  if (!storedCred || storedCred.userId !== pending.userId) {
    throw new Error('Device credential is not registered to this account.');
  }

  const expectedRPID = getExpectedRPID(req);
  const expectedOrigin = getExpectedOrigin(req);

  const verification = await verifyAuthenticationResponse({
    response: credentialResponse,
    expectedChallenge: pending.challenge,
    expectedOrigin,
    expectedRPID,
    credential: {
      id: storedCred.id,
      publicKey: new Uint8Array(Buffer.from(storedCred.publicKey, 'base64url')),
      counter: storedCred.counter,
      transports: (storedCred.transports || ['internal']) as any,
    },
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('WebAuthn device authentication failed.');
  }

  // Update counter & usage timestamp
  await updateWebAuthnCredentialCounter(storedCred.id, verification.authenticationInfo.newCounter);
  await consumePendingChallenge(pendingToken);

  return { userId: pending.userId };
}
