export interface UserProfile {
  id: string;
  agentId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  avatar?: string;
  category?: string;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export function buildApiUrl(endpoint: string): string {
  // If it's already an absolute URL, return it
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  // Ensure we start with a slash
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // In this environment, we always want to hit the local backend
  // We can just return the relative path which will be resolved by the browser to the current origin
  return normalizedEndpoint;
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
  const fullUrl = buildApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/login') {
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
          headers.set('Authorization', `Bearer ${newAt}`);
        }
        if (newRt) {
          setRefreshToken(newRt);
        }

        response = await fetch(fullUrl, {
          ...options,
          headers,
          credentials: 'include',
        });
      }
    } catch (err) {
      console.error('Silent refresh failed');
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `HTTP error! status: ${response.status}`);
  }

  return data;
}

export async function registerUserApi(payload: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
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
  const res = await fetch(buildApiUrl('/api/auth/login'), {
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
  const res = await fetch(buildApiUrl('/api/auth/agent/login'), {
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
  const data = res.data;
  if (data && data.profile) {
    return {
      ...data.profile,
      stats: data.stats,
    };
  }
  return data;
}

export async function updateProfileApi(updates: any): Promise<UserProfile> {
  const res = await apiFetch('/api/agents/me', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return res.data;
}
