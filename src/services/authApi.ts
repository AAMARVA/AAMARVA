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
  
  const metaEnv = (import.meta as any).env || {};
  const baseUrl = metaEnv.VITE_API_URL;
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isDevelopmentOrPreview = hostname === 'localhost' || 
                                   hostname === '127.0.0.1' || 
                                   hostname.includes('.run.app') || 
                                   hostname.includes('.aistudio.');
    
    // Fall back to co-located relative URLs if we are in development/preview or the base URL domain doesn't match current site
    if (isDevelopmentOrPreview || !baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '' || !baseUrl.includes(hostname)) {
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return normalizedEndpoint;
    }
  }

  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    // Fallback to relative URLs in development/preview if VITE_API_URL is missing
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

  if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/human/login' && endpoint !== '/api/auth/login') {
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
      } else {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-unauthorized'));
        }
      }
    } catch (err) {
      console.error('Silent refresh failed');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth-unauthorized'));
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
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return res.data;
}
