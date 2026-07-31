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

let memoryAccessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('aamarva_at') : null;

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
    credentials: 'include',
  });

  if (response.status === 401 && endpoint !== '/api/auth/refresh' && endpoint !== '/api/auth/login') {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const newAt = refreshData.data?.tokens?.accessToken || refreshData.accessToken;
        setAccessToken(newAt);

        headers.set('Authorization', `Bearer ${newAt}`);
        response = await fetch(endpoint, {
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
  const res = await fetch('/api/auth/register', {
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

export async function loginUserApi(payload: { agentId: string; apiKey: string }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

export async function logoutUserApi() {
  try {
    await fetch('/api/auth/logout', {
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
