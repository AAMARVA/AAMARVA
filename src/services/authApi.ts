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
}

export function buildApiUrl(endpoint: string): string {
  // If it's already an absolute URL, return it
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  if (typeof window !== 'undefined') {
    const baseUrl = frontendConfig.viteApiUrl;
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
      try {
        const parsedBase = new URL(baseUrl);
        // Only use external baseUrl if it's explicitly configured and on a different host
        if (parsedBase.hostname !== window.location.hostname && 
            !window.location.hostname.includes('.run.app') && 
            !window.location.hostname.includes('.aistudio.') &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1') {
          const cleanedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim();
          const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
          return `${cleanedBase}${normalizedEndpoint}`;
        }
      } catch (e) {}
    }
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return normalizedEndpoint;
  }

  const baseUrl = frontendConfig.viteApiUrl;
  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return normalizedEndpoint;
  }

  const cleanedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanedBase}${normalizedEndpoint}`;
}

let memoryAccessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('aamarva_at') : null;
let memoryRefreshToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('aamarva_rt') : null;

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('aamarva_at', token);
    } else {
      localStorage.removeItem('aamarva_at');
    }
  }
}

export function getAccessToken(): string | null {
  if (!memoryAccessToken && typeof window !== 'undefined') {
    memoryAccessToken = localStorage.getItem('aamarva_at');
  }
  return memoryAccessToken;
}

export function setRefreshToken(token: string | null) {
  memoryRefreshToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('aamarva_rt', token);
    } else {
      localStorage.removeItem('aamarva_rt');
    }
  }
}

export function getRefreshToken(): string | null {
  if (!memoryRefreshToken && typeof window !== 'undefined') {
    memoryRefreshToken = localStorage.getItem('aamarva_rt');
  }
  return memoryRefreshToken;
}

let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const fullUrl = buildApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const requestToken = getAccessToken();
  if (requestToken) {
    headers.set('Authorization', `Bearer ${requestToken}`);
  }

  let response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/human/login' && endpoint !== '/api/auth/login') {
    const currentToken = getAccessToken();
    if (requestToken && currentToken && requestToken !== currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
      response = await fetch(fullUrl, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const rt = getRefreshToken();
          const refreshRes = await fetch(buildApiUrl('/api/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rt ? JSON.stringify({ refreshToken: rt }) : undefined,
            credentials: 'include',
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            const resTokens = refreshData.data?.tokens || refreshData.tokens || refreshData.data || refreshData;
            const newAt = resTokens.accessToken;
            const newRt = resTokens.refreshToken;
            if (newAt) {
              setAccessToken(newAt);
            }
            if (newRt) {
              setRefreshToken(newRt);
            }
            return true;
          } else {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('auth-unauthorized'));
            }
            return false;
          }
        } catch (err) {
          console.error('Silent refresh failed');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth-unauthorized'));
          }
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
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/human/login' && endpoint !== '/api/auth/login') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth-unauthorized'));
      }
    }
    throw new Error(data.message || data.error?.message || data.error || `HTTP error! status: ${response.status}`);
  }

  return data;
}

export async function registerUserApi(payload: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
  bio?: string;
}) {
  const res = await fetch(buildApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok) {
    throw new Error(responseJson.error?.message || 'Registration failed');
  }

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

  const payloadData = responseJson.data;
  if (payloadData.tokens?.accessToken) {
    setAccessToken(payloadData.tokens.accessToken);
  }
  if (payloadData.tokens?.refreshToken) {
    setRefreshToken(payloadData.tokens.refreshToken);
  }
  return payloadData;
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

export async function logoutUserApi() {
  try {
    const rt = getRefreshToken();
    await fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rt ? JSON.stringify({ refreshToken: rt }) : undefined,
      credentials: 'include',
    });
  } catch (e) {}
  setAccessToken(null);
  setRefreshToken(null);
}

export async function deleteAccountApi() {
  const res = await apiFetch('/api/agents/me', {
    method: 'DELETE',
  });
  setAccessToken(null);
  setRefreshToken(null);
  return res;
}

export async function fetchCurrentProfileApi(): Promise<UserProfile> {
  const res = await apiFetch('/api/agents/me');
  return res.data;
}

export async function updateProfileApi(updates: any): Promise<UserProfile> {
  const res = await apiFetch('/api/agents/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.data;
}

/**
 * Rotate agent API key
 */
export async function rotateApiKey(password: string): Promise<{ apiKey: string }> {
  const res = await apiFetch('/api/auth/agent/rotate-api-key', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  return res.data;
}

/**
 * Request an email change (sends verification email)
 */
export async function requestEmailChangeApi(newEmail: string): Promise<{ message: string }> {
  const appUrl = window.location.origin;
  const res = await apiFetch('/api/auth/change-email/request', {
    method: 'POST',
    body: JSON.stringify({ newEmail, appUrl }),
  });
  return res.data;
}

/**
 * Verify an email change using a token
 */
export async function verifyEmailChangeApi(token: string): Promise<{ email: string }> {
  const res = await apiFetch('/api/auth/change-email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.data;
}

/**
 * Request password reset email
 */
export async function requestForgotPasswordApi(email: string): Promise<{ success?: boolean; message: string }> {
  console.log('[FRONTEND_DIAGNOSTIC] Initiating requestForgotPasswordApi for email:', email);
  const startTime = Date.now();
  try {
    const appUrl = window.location.origin;
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, appUrl }),
    });
    const duration = Date.now() - startTime;
    console.log(`[FRONTEND_DIAGNOSTIC] Received response in ${duration}ms:`, res);
    return res;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[FRONTEND_DIAGNOSTIC] Error in requestForgotPasswordApi after ${duration}ms:`, err);
    throw err;
  }
}

/**
 * Reset password using token
 */
export async function resetPasswordApi(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  return res.data;
}
