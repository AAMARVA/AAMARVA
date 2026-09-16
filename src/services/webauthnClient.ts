import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { buildApiUrl } from './authApi';

export interface WebAuthnPasskey {
  id: string;
  friendlyName: string;
  deviceType?: string;
  backedUp?: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export async function handleWebAuthnLogin(pendingToken: string, options: any) {
  try {
    const credentialResponse = await startAuthentication({ optionsJSON: options });

    const res = await fetch(buildApiUrl('/api/auth/webauthn/verify-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, credentialResponse }),
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || 'WebAuthn device verification failed.');
    }
    return json.data;
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Device credential prompt was cancelled or timed out.');
    }
    throw err;
  }
}

export async function handleWebAuthnSetup(pendingToken: string, options: any, friendlyName?: string) {
  try {
    const credentialResponse = await startRegistration({ optionsJSON: options });

    const res = await fetch(buildApiUrl('/api/auth/webauthn/verify-setup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, credentialResponse, friendlyName: friendlyName || 'Primary Device Passkey' }),
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || 'Passkey setup failed.');
    }
    return json.data;
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Device passkey registration was cancelled. A registered passkey is required to complete login.');
    }
    throw err;
  }
}

export async function fetchUserPasskeys(): Promise<WebAuthnPasskey[]> {
  const res = await fetch(buildApiUrl('/api/auth/webauthn/passkeys'), {
    method: 'GET',
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to fetch passkeys');
  }
  return json.data || [];
}

export async function deletePasskeyApi(passkeyId: string): Promise<void> {
  const res = await fetch(buildApiUrl(`/api/auth/webauthn/passkeys/${passkeyId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to delete passkey');
  }
}
