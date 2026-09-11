import { frontendConfig } from '../config';

export interface UserProfile {
  id: string;
  agentId: string;
  email: string;
  name: string;
  status: string;
  bio?: string;
  avatar?: string;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
  emailVerified?: boolean;
}

export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  if (typeof window !== 'undefined') {
    const baseUrl = frontendConfig.viteApiUrl;
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
      try {
        const parsedBase = new URL(baseUrl);
        // Only use absolute URL if the browser hostname matches the API hostname exactly
        if (parsedBase.hostname === window.location.hostname) {
          const cleanedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim();
          const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
          return `${cleanedBase}${normalizedEndpoint}`;
        }
      } catch (e) {}
    }
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return normalizedEndpoint;
  }

  const baseUrl = frontendConfig.viteApiUrl || (typeof process !== 'undefined' && (process.env.APP_URL || process.env.VITE_API_URL)) || '';
  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return normalizedEndpoint;
  }

  const cleanedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanedBase}${normalizedEndpoint}`;
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

export interface ApiFetchOptions extends RequestInit {
  authType?: AuthType;
}

let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}): Promise<any> {
  const fullUrl = buildApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const authType: AuthType = options.authType || 'none';

  // If a refresh is currently running, wait for it before sending an agent request
  if (authType === 'agent' && refreshPromise) {
    await refreshPromise;
  }

  if (authType === 'agent') {
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

export async function registerUserApi(payload: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
  bio?: string;
  agentId?: string;
}) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(buildApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, appUrl }),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok) {
    throw new Error(responseJson.error?.message || 'Registration failed');
  }

  // Registration establishes human management session via cookie, returns agentId, apiKey, user
  return responseJson.data;
}

export async function loginUserApi(payload: { agentId: string; password: string; }) {
  const res = await fetch(buildApiUrl('/api/auth/human/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: payload.agentId, password: payload.password }),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok) {
    throw new Error(responseJson.error?.message || 'Login failed');
  }

  // Human authentication is backed exclusively by HTTP-only cookie
  return responseJson.data;
}

export async function loginAgentApi(payload: { agentId: string; apiKey: string; }) {
  const res = await fetch(buildApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: payload.agentId, apiKey: payload.apiKey }),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok) {
    throw new Error(responseJson.error?.message || 'Agent login failed');
  }

  const payloadData = responseJson.data;
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

export async function rotateApiKey(password: string, authType: 'human' | 'agent' = 'human'): Promise<{ apiKey: string }> {
  const res = await apiFetch('/api/auth/agent/rotate-api-key', {
    method: 'POST',
    body: JSON.stringify({ password }),
    authType,
  });
  return res.data;
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

export async function verifyEmailChangeApi(token: string): Promise<{ email: string }> {
  const res = await apiFetch('/api/auth/change-email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
    authType: 'none',
  });
  return res.data;
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

export async function resetPasswordApi(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    authType: 'none',
  });
  return res.data;
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
    authType: 'none',
  });
  return res;
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
