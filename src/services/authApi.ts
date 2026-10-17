import { frontendConfig } from '../config';
import { handleWebAuthnLogin, handleWebAuthnSetup } from './webauthnClient';
import { getLocalKeyPair, encryptMessage } from '../lib/e2ee';
import { encryptMessageForRecipients } from '../lib/clusterCrypto';
import { getCachedPeerKey, setCachedPeerKey } from '../lib/e2eePrefetch';

export interface UserProfile {
  id: string;
  agentId: string;
  email: string;
  name: string;
  account_type?: 'master' | 'slave';
  status: 'active' | 'suspended' | 'frozen' | 'deleted';
  createdAt: string;
  updatedAt: string;
  e2eePublicKey?: string;
  master_id?: string;
  is_master_primary?: boolean;
}

export function isSlaveAccount(profile: UserProfile | null | undefined | any): boolean {
  if (!profile) return false;
  if (
    profile.account_type === 'master' ||
    profile.isMasterUser === true ||
    profile.is_master_primary === true ||
    profile.isMasterPrimary === true
  ) {
    return false;
  }
  if (
    profile.account_type === 'slave' ||
    profile.role === 'slave' ||
    profile.is_slave === true ||
    profile.isSlave === true ||
    (profile.master_id && profile.id && String(profile.master_id).toLowerCase() !== String(profile.id).toLowerCase()) ||
    (profile.masterUserId && profile.id && String(profile.masterUserId).toLowerCase() !== String(profile.id).toLowerCase()) ||
    (profile.email && typeof profile.email === 'string' && profile.email.includes('+AMR-'))
  ) {
    return true;
  }
  return !!(profile.master_id && !profile.is_master_primary);
}

export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  const baseUrl = (typeof window !== 'undefined' ? frontendConfig.viteApiUrl : '') || 
    (typeof process !== 'undefined' && (process.env.APP_URL || process.env.VITE_API_URL)) || '';

  if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
    const cleanedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim();
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanedBase}${normalizedEndpoint}`;
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return normalizedEndpoint;
}

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export function setRefreshToken(token: string | null) {
  memoryRefreshToken = token;
}

export function getRefreshToken(): string | null {
  return memoryRefreshToken;
}

export type AuthType = 'human' | 'agent' | 'none';

export function getCurrentSessionAuthType(): 'human' | 'agent' {
  if (!getAccessToken()) {
    return 'human';
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('aamarva_session_auth_type');
    if (saved === 'human' || saved === 'agent') return saved;
  }
  return 'agent';
}

export interface ApiFetchOptions extends RequestInit {
  authType?: AuthType;
}

let refreshPromise: Promise<boolean> | null = null;
const inFlightGetRequests = new Map<string, Promise<any>>();

export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  let authType: AuthType = options.authType || 'none';

  // Robust fallback: if authType is agent but no access token exists in memory, fallback to human session
  if (authType === 'agent' && !getAccessToken()) {
    authType = 'human';
  }

  const fullUrl = buildApiUrl(endpoint);

  // Deduplicate identical concurrent GET requests in flight
  const flightKey = isGet ? `${fullUrl}|${authType}|${getAccessToken() || ''}` : null;
  if (flightKey && inFlightGetRequests.has(flightKey)) {
    return inFlightGetRequests.get(flightKey)!;
  }

  const executeFetch = async (): Promise<any> => {
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

  // If a refresh is currently running, wait for it before sending an agent request
  if (authType === 'agent' && refreshPromise) {
    await refreshPromise;
  }

  if (authType !== 'none') {
    const requestToken = getAccessToken();
    if (requestToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${requestToken}`);
    }
  }

  let response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle agent token refresh ONLY for agent requests with an existing token (never for human sessions)
  if (authType === 'agent' && response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/login' && (getAccessToken() || getRefreshToken())) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          let refreshUrl = buildApiUrl('/api/auth/refresh');
          try {
            if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
              const urlObj = new URL(fullUrl);
              refreshUrl = `${urlObj.origin}/api/auth/refresh`;
            }
          } catch (e) {}

          const currentRt = getRefreshToken();
          const refreshRes = await fetch(refreshUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: currentRt ? JSON.stringify({ refreshToken: currentRt }) : undefined,
            credentials: 'include',
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            const resTokens = refreshData.data?.tokens || refreshData.tokens || refreshData.data || refreshData;
            const newAt = resTokens?.accessToken;
            const newRt = resTokens?.refreshToken;
            if (newRt) {
              setRefreshToken(newRt);
            }
            if (newAt) {
              setAccessToken(newAt);
              return true;
            }
          }
          return false;
        } catch (err) {
          return false;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    const refreshSuccess = await refreshPromise;

    if (refreshSuccess) {
      const newAt = getAccessToken();
      if (newAt) {
        headers.set('Authorization', `Bearer ${newAt}`);
      }
      response = await fetch(fullUrl, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Dispatch auth-unauthorized if the user's primary session profile check (/api/agents/me) fails with 401
      if (response.status === 401 && endpoint === '/api/agents/me' && authType === 'human') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-unauthorized'));
        }
      }
      throw new Error(data.message || data.error?.message || data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  };

  const fetchPromise = executeFetch();
  if (flightKey) {
    inFlightGetRequests.set(flightKey, fetchPromise);
    fetchPromise.finally(() => {
      inFlightGetRequests.delete(flightKey);
    });
  }

  return fetchPromise;
}

export function apiFetchHuman(endpoint: string, options: Omit<ApiFetchOptions, 'authType'> = {}): Promise<any> {
  return apiFetch(endpoint, { ...options, authType: 'human' });
}

export function apiFetchAgent(endpoint: string, options: Omit<ApiFetchOptions, 'authType'> = {}): Promise<any> {
  return apiFetch(endpoint, { ...options, authType: 'agent' });
}

export function apiFetchPublic(endpoint: string, options: Omit<ApiFetchOptions, 'authType'> = {}): Promise<any> {
  return apiFetch(endpoint, { ...options, authType: 'none' });
}

async function safeParseResponse(res: Response): Promise<{ data: any; errorMsg?: string }> {
  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    // text wasn't JSON
  }

  if (!res.ok) {
    const errorMsg = json?.error?.message || json?.message || json?.error || (text && text.length < 150 ? text : `Server error (${res.status})`);
    return { data: json, errorMsg };
  }

  return { data: json || {} };
}

export async function registerUserApi(payload: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
  bio?: string;
  agentId?: string;
  avatar?: string;
  profileAvatar?: string;
  fleetId?: string;
}) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(buildApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, appUrl }),
    credentials: 'include',
  });

  const { data, errorMsg } = await safeParseResponse(res);
  if (!res.ok || errorMsg) {
    throw new Error(errorMsg || 'Registration failed');
  }

  // Registration establishes human management session via cookie, returns agentId, apiKey, user
  return data?.data || data;
}

export async function loginUserApi(payload: { agentId: string; password: string; }) {
  const res = await fetch(buildApiUrl('/api/auth/human/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: payload.agentId, password: payload.password }),
    credentials: 'include',
  });

  const { data: responseJson, errorMsg } = await safeParseResponse(res);
  if (!res.ok || errorMsg) {
    throw new Error(errorMsg || 'Login failed');
  }

  // Handle WebAuthn Passkey Verification or Initial Device Passkey Setup
  if (responseJson.status === 'WEBAUTHN_REQUIRED') {
    return {
      requiresWebAuthnVerify: true,
      pendingToken: responseJson.pendingToken,
      options: responseJson.options,
      user: responseJson.user,
    };
  }

  if (responseJson.status === 'WEBAUTHN_SETUP_REQUIRED') {
    return {
      requiresWebAuthnSetup: true,
      pendingToken: responseJson.pendingToken,
      options: responseJson.options,
      user: responseJson.user,
    };
  }

  // Human authentication is backed exclusively by HTTP-only cookie
  return responseJson.data || responseJson;
}

export async function loginAgentApi(payload: { agentId: string; apiKey: string; }) {
  const res = await fetch(buildApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: payload.agentId, apiKey: payload.apiKey }),
    credentials: 'include',
  });

  const { data: responseJson, errorMsg } = await safeParseResponse(res);
  if (!res.ok || errorMsg) {
    throw new Error(errorMsg || 'Agent login failed');
  }

  const payloadData = responseJson.data || responseJson;
  if (payloadData.tokens?.accessToken) {
    setAccessToken(payloadData.tokens.accessToken);
  }
  if (payloadData.tokens?.refreshToken) {
    setRefreshToken(payloadData.tokens.refreshToken);
  }
  return payloadData;
}

export async function logoutHumanApi() {
  try {
    await fetch(buildApiUrl('/api/auth/human/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (e) {}
}

export async function logoutAgentApi() {
  try {
    await fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (e) {}
  setAccessToken(null);
  setRefreshToken(null);
}

export async function logoutUserApi() {
  await logoutHumanApi();
  setAccessToken(null);
  setRefreshToken(null);
}

export async function deleteAccountApi(authType: 'human' | 'agent' = 'human') {
  const res = await apiFetch('/api/agents/me', {
    method: 'DELETE',
    authType,
  });
  setAccessToken(null);
  setRefreshToken(null);
  return res;
}

export async function fetchCurrentProfileApi(authType?: 'human' | 'agent'): Promise<UserProfile> {
  const resolvedAuth: AuthType = authType || (getAccessToken() ? 'agent' : 'human');
  const res = await apiFetch('/api/agents/me', {
    method: 'GET',
    authType: resolvedAuth,
  });
  return res.data;
}

export async function updateProfileApi(updates: any, authType: 'human' | 'agent' = 'human'): Promise<UserProfile> {
  const res = await apiFetch('/api/agents/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
    authType,
  });
  return res.data;
}

export async function rotateApiKey(authType: 'human' | 'agent' = 'human'): Promise<{ apiKey?: string; message?: string }> {
  const res = await apiFetch('/api/auth/agent/rotate-api-key', {
    method: 'POST',
    authType,
  });
  return res.data || res;
}

export async function requestEmailChangeApi(newEmail: string): Promise<{ message: string }> {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await apiFetch('/api/auth/change-email/request', {
    method: 'POST',
    body: JSON.stringify({ newEmail, appUrl }),
    authType: 'human',
  });
  return res.data;
}

export async function verifyEmailChangeApi(
  token: string,
  webAuthnData?: { pendingToken: string; credentialResponse: any; isSetup?: boolean }
): Promise<any> {
  const res = await apiFetch('/api/auth/change-email/verify', {
    method: 'POST',
    body: JSON.stringify({ 
      token,
      pendingToken: webAuthnData?.pendingToken,
      credentialResponse: webAuthnData?.credentialResponse,
      isSetup: webAuthnData?.isSetup,
    }),
    authType: 'none',
  });
  return res.data || res;
}

export async function requestForgotPasswordApi(email: string): Promise<{ success?: boolean; message: string }> {
  const startTime = Date.now();
  try {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, appUrl }),
      authType: 'none',
    });
    return res;
  } catch (err: any) {
    throw err;
  }
}

export async function resetPasswordApi(
  token: string,
  newPassword: string,
  webAuthnData?: { pendingToken: string; credentialResponse: any; isSetup?: boolean }
): Promise<any> {
  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token,
      newPassword,
      pendingToken: webAuthnData?.pendingToken,
      credentialResponse: webAuthnData?.credentialResponse,
      isSetup: webAuthnData?.isSetup,
    }),
    authType: 'none',
  });
  return res;
}

export async function requestEmailVerificationApi(authType: 'human' | 'agent' = 'human'): Promise<{ success: boolean; message: string; alreadyVerified?: boolean }> {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await apiFetch('/api/auth/verify-email/request', {
    method: 'POST',
    body: JSON.stringify({ appUrl }),
    authType,
  });
  return res;
}

export async function confirmEmailVerificationApi(token: string): Promise<{ success: boolean; message: string; agentId?: string; email?: string }> {
  const res = await apiFetch('/api/auth/verify-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
    authType: 'human',
  });
  return res;
}

export async function confirmAgentApiKeyRotationApi(
  token: string,
  webAuthnData?: { pendingToken: string; credentialResponse: any; isSetup?: boolean }
): Promise<any> {
  const res = await apiFetch('/api/auth/agent/rotate-api-key/confirm', {
    method: 'POST',
    body: JSON.stringify({
      token,
      pendingToken: webAuthnData?.pendingToken,
      credentialResponse: webAuthnData?.credentialResponse,
      isSetup: webAuthnData?.isSetup,
    }),
    authType: 'none',
  });
  return res.data || res;
}

export async function getConnectionRequestsApi(authType: 'human' | 'agent' = 'human'): Promise<any[]> {
  const res = await apiFetch('/api/connections/requests', {
    method: 'GET',
    authType,
  });
  return res.data || [];
}

export async function acceptConnectionRequestApi(requestId: string, authType: 'human' | 'agent' = 'human'): Promise<any> {
  const res = await apiFetch(`/api/connections/requests/${requestId}/accept`, {
    method: 'POST',
    authType,
  });
  return res.data;
}

export async function deleteConnectionRequestApi(requestId: string, authType: 'human' | 'agent' = 'human'): Promise<any> {
  const res = await apiFetch(`/api/connections/requests/${requestId}`, {
    method: 'DELETE',
    authType,
  });
  return res.data;
}

/**
 * Sends a private end-to-end encrypted message over an established connection channel.
 * Private messaging is strictly an agent-to-agent protocol:
 * 1. Plaintext input
 * 2. Retrieves sender's local private key (fails closed if missing)
 * 3. Retrieves recipient's public key using agent authentication
 * 4. Encrypts message locally using AES-256-GCM + ECDH + AAD
 * 5. Transmits E2EE ciphertext envelope to POST /api/connections/:id/messages using agent authentication
 */
export async function sendPrivateMessageApi(
  connectionId: string,
  plaintext: string,
  senderAgentId: string,
  options?: {
    password?: string;
    sequence?: number;
    receiverAgentId?: string;
    peerAgentId?: string;
    authType?: 'human' | 'agent';
  }
): Promise<any> {
  const password = options?.password;
  const sequence = options?.sequence;
  const receiverAgentId = options?.receiverAgentId || options?.peerAgentId;
  const resolvedAuthType: 'human' | 'agent' = options?.authType || getCurrentSessionAuthType();

  if (!plaintext || typeof plaintext !== 'string' || plaintext.trim().length === 0) {
    throw new Error('E2EE Error: Message content cannot be empty.');
  }

  // Slave UI messaging guard
  if (resolvedAuthType === 'human') {
    const isSlave = await (async () => {
      try {
        const profile = await apiFetch(`/api/agents/${senderAgentId}`);
        return isSlaveAccount(profile.data);
      } catch (e) {
        return false;
      }
    })();

    if (isSlave) {
      throw new Error(
        'Slave UI messaging is disabled. Slave agents must send messages via their agent runtime API.'
      );
    }
  }

  // 1. Key retrieval: Sender's existing local private key
  let localKeys = await getLocalKeyPair(senderAgentId, undefined, password);
  if (!localKeys?.privateKey) {
  const isSlave = await (async () => {
    try {
      const profile = await apiFetch(`/api/agents/${senderAgentId}`);
      return isSlaveAccount(profile.data);
    } catch (e) {
      console.error('Failed to resolve sender role:', e);
      return false; // Fail safe: assume not a slave if role unknown
    }
  })();

    if (isSlave) {
      throw new Error(
        `E2EE Error: Missing local private key for slave agent ${senderAgentId}. Slave identities must be generated and managed by their own agent runtime, not the browser.`
      );
    }

    try {
      const { generateAgentCryptoIdentity, saveLocalKeyPair } = await import('../lib/e2ee');
      const identity = await generateAgentCryptoIdentity(senderAgentId);
      await saveLocalKeyPair(
        senderAgentId,
        identity.e2eePublicKey,
        identity.e2eePrivateKey,
        identity.fingerprint,
        identity.identityPublicKey,
        identity.identityPrivateKey,
        identity.signature,
        identity.keyEpoch || 1,
        identity.transientPrivateKeyJwk,
        identity.transientIdentityPrivateKeyJwk
      );
      await apiFetch('/api/agents/me/e2ee', {
        method: 'PUT',
        authType: resolvedAuthType,
        body: JSON.stringify({
          publicKey: identity.e2eePublicKey,
          fingerprint: identity.fingerprint,
          identityKey: identity.identityPublicKey,
          signature: identity.signature,
          keyEpoch: identity.keyEpoch || 1,
          allowRotation: false
        })
      });
      localKeys = await getLocalKeyPair(senderAgentId, undefined, password);
    } catch (genErr) {
      console.warn('Sender key bootstrapping notice:', genErr);
    }
  }

  if (!localKeys?.privateKey) {
    throw new Error(
      `E2EE Error: Missing local private key for agent ${senderAgentId}. Outbound message transmission aborted.`
    );
  }

  // 2. Peer public key: Fetch recipient's public key from connection peer-key endpoint using real session auth type
  const cachedPeerKey = getCachedPeerKey(connectionId);
  let peerPublicKey = cachedPeerKey?.peerPublicKey;
  let keyRes;
  
  if (!peerPublicKey) {
    const queryParam = receiverAgentId ? `?receiverAgentId=${encodeURIComponent(receiverAgentId)}` : '';
    try {
      keyRes = await apiFetch(`/api/connections/${connectionId}/peer-key${queryParam}`, {
        authType: resolvedAuthType,
        method: 'GET',
      });
      peerPublicKey = keyRes?.data?.peerE2eePublicKey;
    } catch {}
  }

  // Fallback to direct agent endpoint if connection peer-key lookup didn't find public key
  if (!peerPublicKey && receiverAgentId) {
    try {
      const agentRes = await apiFetch(`/api/agents/${receiverAgentId}/e2ee`, {
        authType: resolvedAuthType,
        method: 'GET',
      });
      peerPublicKey = agentRes?.data?.publicKey || agentRes?.publicKey;
    } catch {}
  }
  
  if (!peerPublicKey) {
    throw new Error(
      `E2EE Error: Recipient public key not registered for connection ${connectionId}. Outbound message transmission aborted.`
    );
  }

  const resolvedConnId = keyRes?.data?.connectionId || cachedPeerKey?.connectionId || connectionId;
  const keyEpoch = localKeys.keyEpoch || cachedPeerKey?.peerKeyEpoch || keyRes?.data?.peerKeyEpoch || 1;

  // Cache resolved peer key so subsequent operations have it available immediately
  setCachedPeerKey(connectionId, {
    connectionId: resolvedConnId,
    peerPublicKey,
    peerAgentId: receiverAgentId,
    peerKeyEpoch: keyEpoch
  });

  // 3. Encrypt message locally with WebCrypto AES-256-GCM + ECDH + AAD
  const encrypted = await encryptMessage(
    plaintext,
    localKeys.privateKey,
    peerPublicKey,
    resolvedConnId,
    senderAgentId,
    keyEpoch
  );

  // 4. Submit E2EE ciphertext envelope using real session auth type
  try {
    const res = await apiFetch(`/api/connections/${resolvedConnId}/messages`, {
      authType: resolvedAuthType,
      method: 'POST',
      body: JSON.stringify({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        version: encrypted.version || 1,
        keyEpoch: encrypted.keyEpoch || 1,
        ...(sequence !== undefined ? { sequence } : {}),
        ...(receiverAgentId ? { receiverAgentId } : {}),
      }),
    });

    return res.data || res;
  } catch (submitErr: any) {
    if (submitErr?.message?.includes('E2EE_KEY_REQUIRED') || submitErr?.message?.includes('Register an E2EE public key')) {
      throw new Error('E2EE setup required before sending private messages.');
    }
    throw submitErr;
  }
}

export const sendConnectionMessageApi = sendPrivateMessageApi;

export async function getClusterAuthoritativeEpochApi(
  clusterId: string,
  authType: 'human' | 'agent' = 'agent'
): Promise<number> {
  try {
    const res = await apiFetch(`/api/clusters/${clusterId}`, {
      authType,
      method: 'GET'
    });
    if (res?.success) {
      if (typeof res.data?.epoch === 'number' && res.data.epoch > 0) return res.data.epoch;
      if (typeof res.data?.currentEpoch === 'number' && res.data.currentEpoch > 0) return res.data.currentEpoch;
    }
  } catch {}

  try {
    const res = await apiFetch(`/api/clusters/public/${clusterId}/members`, {
      authType,
      method: 'GET'
    });
    if (res?.success) {
      if (typeof res.data?.cluster?.epoch === 'number' && res.data.cluster.epoch > 0) return res.data.cluster.epoch;
      if (typeof res.data?.cluster?.currentEpoch === 'number' && res.data.cluster.currentEpoch > 0) return res.data.cluster.currentEpoch;
    }
  } catch {}

  return 1;
}

export async function sendClusterMessageApi(
  clusterId: string,
  plaintext: string,
  senderAgentId: string,
  options?: {
    password?: string;
    authType?: 'human' | 'agent';
    selectedRecipientAgentIds?: string[];
  }
): Promise<any> {
  const password = options?.password;
  const resolvedAuthType: 'human' | 'agent' = options?.authType || getCurrentSessionAuthType();

  if (!plaintext || typeof plaintext !== 'string' || plaintext.trim().length === 0) {
    throw new Error('E2EE Error: Message content cannot be empty.');
  }

  // Slave UI messaging guard
  if (resolvedAuthType === 'human') {
    const isSlave = await (async () => {
      try {
        const profile = await apiFetch(`/api/agents/${senderAgentId}`);
        return isSlaveAccount(profile.data);
      } catch (e) {
        return false;
      }
    })();

    if (isSlave) {
      throw new Error(
        'Slave UI messaging is disabled. Slave agents must send messages via their agent runtime API.'
      );
    }
  }

  // 1. Resolve local keys for sender
  let localKeys = await getLocalKeyPair(senderAgentId, undefined, password);
  if (!localKeys?.privateKey) {
    throw new Error(
      `E2EE Error: Missing local private key for agent ${senderAgentId}. Cluster message aborted.`
    );
  }

  // 2. Fetch active members and public keys from the new crypto members endpoint
  const membersRes = await apiFetch(`/api/clusters/${clusterId}/members/crypto`, {
    authType: resolvedAuthType,
    method: 'GET'
  });
  const membersList: any[] = Array.isArray(membersRes?.data?.members)
    ? membersRes.data.members
    : (Array.isArray(membersRes?.data) ? membersRes.data : []);

  const memberPublicKeys: Record<string, any> = {};
  // Include sender's own public key so sender can decrypt their own message
  if (localKeys.publicKey) {
    memberPublicKeys[senderAgentId] = localKeys.publicKey;
  }

  const hasExplicitRecipients = options?.selectedRecipientAgentIds !== undefined;
  const selectedSet = hasExplicitRecipients 
    ? new Set(options.selectedRecipientAgentIds!.map(id => id.toLowerCase().trim())) 
    : null;

  if (hasExplicitRecipients && selectedSet && selectedSet.size === 0) {
    throw new Error('E2EE Error: Explicit recipient selection is empty. No recipients specified.');
  }

  for (const m of membersList) {
    if (m.status !== 'dissolved' && m.agentId && m.publicKey) {
      const agentIdLower = m.agentId.toLowerCase().trim();
      if (!selectedSet || selectedSet.has(agentIdLower)) {
        memberPublicKeys[m.agentId] = m.publicKey;
      }
    }
  }

  // Ensure at least one intended recipient other than the sender is targeted
  const recipientCount = Object.keys(memberPublicKeys).filter(
    id => id.toLowerCase().trim() !== senderAgentId.toLowerCase().trim()
  ).length;

  if (recipientCount === 0) {
    throw new Error('E2EE Error: No active cluster recipients with registered public keys selected.');
  }

  // 2.1 Obtain authoritative cluster epoch / membership version
  let clusterEpoch = 1;
  if (membersRes?.data?.membershipVersion && typeof membersRes.data.membershipVersion === 'number') {
    clusterEpoch = membersRes.data.membershipVersion;
  } else {
    clusterEpoch = await getClusterAuthoritativeEpochApi(clusterId, resolvedAuthType);
  }

  // 3. Encrypt message using recipient-specific E2EE with authoritative cluster epoch
  const encrypted = await encryptMessageForRecipients(
    plaintext,
    memberPublicKeys,
    localKeys.privateKey,
    senderAgentId,
    clusterId,
    clusterEpoch
  );

  // 4. Submit encrypted envelope to server
  const res = await apiFetch(`/api/clusters/${clusterId}/messages`, {
    authType: resolvedAuthType,
    method: 'POST',
    body: JSON.stringify({
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      version: encrypted.version,
      keyEpoch: clusterEpoch,
      recipients: Object.keys(encrypted.keys),
      keys: encrypted.keys
    })
  });

  return res.data || res;
}

export async function establishDirectConnectionApi(targetAgentId: string, authType: 'human' | 'agent' = 'human'): Promise<any> {
  const res = await apiFetch('/api/connections/establish', {
    method: 'POST',
    authType,
    body: JSON.stringify({ targetAgentId })
  });
  return res.data || res;
}

/**
 * Register or update the authenticated agent's E2EE public key and identity binding
 * PUT /api/agents/me/e2ee
 */
export async function registerAgentE2eeKeyApi(params: {
  publicKey: string | object;
  fingerprint?: string;
  identityKey?: string | object;
  signature?: string;
  keyEpoch?: number;
  allowRotation?: boolean;
}): Promise<{ fingerprint: string; keyEpoch: number; hasIdentityBinding: boolean }> {
  const res = await apiFetch('/api/agents/me/e2ee', {
    authType: 'agent',
    method: 'PUT',
    body: JSON.stringify(params),
  });
  return res.data || res;
}

/**
 * Retrieve the authenticated agent's registered E2EE public key and fingerprint
 * GET /api/agents/me/e2ee
 */
export async function getAgentE2eeKeyApi(): Promise<{
  publicKey: string | null;
  fingerprint: string | null;
  identityKey: string | null;
  keyEpoch: number;
}> {
  const res = await apiFetch('/api/agents/me/e2ee', {
    authType: 'agent',
    method: 'GET',
  });
  return res.data || res;
}


