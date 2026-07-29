export interface UserProfile {
  id: string;
  agentId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  agentName: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  details?: string;
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
  return memoryRefreshToken;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Includes HttpOnly cookies automatically
  });

  // If 401 Unauthorized, attempt HttpOnly cookie or localStorage refresh token rotation
  if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/login') {
    try {
      const rToken = getRefreshToken();
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rToken }),
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAccessToken(refreshData.accessToken);
        if (refreshData.refreshToken) {
          setRefreshToken(refreshData.refreshToken);
        }

        // Retry original request with new in-memory access token
        headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        response = await fetch(endpoint, {
          ...options,
          headers,
          credentials: 'include',
        });
      } else {
        // Do not automatically set tokens to null to prevent forced logout on temporary network glitch
      }
    } catch (err) {
      // Do not automatically set tokens to null
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return data;
}

export async function registerUserApi(payload: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
  agentId?: string;
  autoVerify?: boolean;
}) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok || responseJson.success === false) {
    const errorMsg = responseJson.error?.message || responseJson.error || 'Registration failed';
    throw new Error(errorMsg);
  }

  const payloadData = responseJson.data || responseJson;
  if (payloadData.accessToken) {
    setAccessToken(payloadData.accessToken);
  }
  return payloadData;
}

export async function verifyEmailApi(token: string) {
  const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Email verification failed');
  }

  return data;
}

export async function loginUserApi(payload: { identifier?: string; agentId?: string; email?: string; password: string }) {
  const bodyPayload = {
    identifier: payload.identifier || payload.agentId || payload.email,
    password: payload.password,
  };

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
    credentials: 'include',
  });

  const responseJson = await res.json();
  if (!res.ok || responseJson.success === false) {
    const errorMsg = responseJson.error?.message || responseJson.error || 'Login failed';
    throw new Error(errorMsg);
  }

  const payloadData = responseJson.data || responseJson;
  if (payloadData.accessToken) {
    setAccessToken(payloadData.accessToken);
  }
  return payloadData;
}

export async function logoutUserApi() {
  try {
    const rToken = getRefreshToken();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rToken }),
      credentials: 'include',
    });
  } catch (e) {
    // Ignore network errors on logout
  }
  setAccessToken(null);
  setRefreshToken(null);
}

export async function fetchCurrentProfileApi(): Promise<UserProfile> {
  const data = await apiFetch('/api/auth/me');
  return data.user;
}

export async function fetchAuditLogsApi(): Promise<AuditLog[]> {
  const data = await apiFetch('/api/auth/audit-logs');
  return data.logs;
}

export async function fetchApiKeysApi(): Promise<ApiKey[]> {
  const data = await apiFetch('/api/auth/keys');
  return data.keys;
}

export async function createApiKeyApi(agentName: string): Promise<{ key: ApiKey; secretKey: string }> {
  const data = await apiFetch('/api/auth/keys', {
    method: 'POST',
    body: JSON.stringify({ agentName }),
  });
  return data;
}

export async function revokeApiKeyApi(keyId: string) {
  return await apiFetch(`/api/auth/keys/${keyId}`, {
    method: 'DELETE',
  });
}
