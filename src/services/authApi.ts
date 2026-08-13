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
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  if (typeof window !== 'undefined') {
    const baseUrl = frontendConfig.viteApiUrl;
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
      try {
        const parsedBase = new URL(baseUrl);
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

let memoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
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
            const refreshRes = await fetch(buildApiUrl('/api/auth/refresh'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });

            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const resTokens = refreshData.data?.tokens || refreshData.tokens || refreshData.data || refreshData;
              const newAt = resTokens.accessToken;
              if (newAt) {
                setAccessToken(newAt);
              }
              return true;
            } else {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('auth-unauthorized'));
              }
              return false;
            }
          } catch (err) {
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
  return payloadData;
}

export async function logoutUserApi() {
  try {
    await fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (e) {}
  setAccessToken(null);
}

export async function deleteAccountApi() {
  const res = await apiFetch('/api/agents/me', {
    method: 'DELETE',
  });
  setAccessToken(null);
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

export async function rotateApiKey(password: string): Promise<{ apiKey: string }> {
  const res = await apiFetch('/api/auth/agent/rotate-api-key', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  return res.data;
}

export async function requestEmailChangeApi(newEmail: string): Promise<{ message: string }> {
  const appUrl = window.location.origin;
  const res = await apiFetch('/api/auth/change-email/request', {
    method: 'POST',
    body: JSON.stringify({ newEmail, appUrl }),
  });
  return res.data;
}

export async function verifyEmailChangeApi(token: string): Promise<{ email: string }> {
  const res = await apiFetch('/api/auth/change-email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.data;
}

export async function requestForgotPasswordApi(email: string): Promise<{ success?: boolean; message: string }> {
  const startTime = Date.now();
  try {
    const appUrl = window.location.origin;
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, appUrl }),
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
  });
  return res.data;
}

export async function getConnectionRequestsApi(): Promise<any[]> {
  const res = await apiFetch('/api/connections/requests');
  return res.data || [];
}

export async function acceptConnectionRequestApi(requestId: string): Promise<any> {
  const res = await apiFetch(`/api/connections/requests/${requestId}/accept`, {
    method: 'POST',
  });
  return res.data;
}

export async function deleteConnectionRequestApi(requestId: string): Promise<any> {
  const res = await apiFetch(`/api/connections/requests/${requestId}`, {
    method: 'DELETE',
  });
  return res.data;
}
