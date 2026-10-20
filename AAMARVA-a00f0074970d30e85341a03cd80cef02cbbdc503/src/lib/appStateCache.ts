// Application-wide state preservation and cache management
// Scoped by authenticated account identity for 100% security and isolation

export interface LogItem {
  id: string;
  category?: 'footprint' | 'event';
  action?: string;
  endpoint?: string;
  details?: any;
  type?: string;
  senderId?: string;
  target?: string;
  targetId?: string;
  targetAgentId?: string;
  targetAgentName?: string;
  targetAvatar?: string;
  requestId?: string;
  timestamp: string;
  createdAt?: string;
  created_at?: string;
}

export interface ActivityCacheItem {
  footprints: LogItem[];
  webhooks: LogItem[];
  activeTab: 'footprints' | 'webhooks';
  lastFetchedFootprints?: number;
  lastFetchedWebhooks?: number;
}

export interface GenericCacheEntry<T = any> {
  data: T;
  timestamp: number;
}

// In-memory store keyed by account identity (e.g. "usr_123:slave_456" or "usr_123")
const activityCacheMap = new Map<string, ActivityCacheItem>();
const queryCacheMap = new Map<string, GenericCacheEntry>();
const uiStateCacheMap = new Map<string, Map<string, any>>();

export function getAccountKey(userId?: string | null, activeAccountId?: string | null): string {
  const u = (userId || 'anon').trim();
  const a = (activeAccountId || u).trim();
  return `${u}::${a}`;
}

// Activity Logs (Footprints & Webhooks)
export function getActivityCache(accountKey: string): ActivityCacheItem {
  const existing = activityCacheMap.get(accountKey);
  if (existing) return existing;
  const initial: ActivityCacheItem = {
    footprints: [],
    webhooks: [],
    activeTab: 'footprints',
  };
  activityCacheMap.set(accountKey, initial);
  return initial;
}

export function setActivityCache(
  accountKey: string, 
  partial: Partial<ActivityCacheItem>
): ActivityCacheItem {
  const current = getActivityCache(accountKey);
  const updated: ActivityCacheItem = {
    ...current,
    ...partial,
  };
  activityCacheMap.set(accountKey, updated);
  return updated;
}

// Generic Query Response Cache (stale-while-revalidate / TTL)
export function getQueryCache<T = any>(
  accountKey: string, 
  endpoint: string, 
  ttlMs: number = 30000
): { data: T; isStale: boolean } | null {
  const key = `${accountKey}@@${endpoint}`;
  const entry = queryCacheMap.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  return {
    data: entry.data as T,
    isStale: age > ttlMs,
  };
}

export function setQueryCache<T = any>(
  accountKey: string, 
  endpoint: string, 
  data: T
): void {
  const key = `${accountKey}@@${endpoint}`;
  queryCacheMap.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function invalidateQuery(endpointPrefix: string): void {
  for (const key of Array.from(queryCacheMap.keys())) {
    if (key.includes(`@@${endpointPrefix}`)) {
      queryCacheMap.delete(key);
    }
  }
}

// UI State Cache (subtabs, filters, forms, scroll values)
export function getUiState<T = any>(accountKey: string, stateKey: string, defaultValue: T): T {
  const accountMap = uiStateCacheMap.get(accountKey);
  if (!accountMap) return defaultValue;
  const val = accountMap.get(stateKey);
  return val !== undefined ? (val as T) : defaultValue;
}

export function setUiState(accountKey: string, stateKey: string, value: any): void {
  let accountMap = uiStateCacheMap.get(accountKey);
  if (!accountMap) {
    accountMap = new Map<string, any>();
    uiStateCacheMap.set(accountKey, accountMap);
  }
  accountMap.set(stateKey, value);
}

// Security: Full clearance on logout
export function clearAllAppCaches(): void {
  activityCacheMap.clear();
  queryCacheMap.clear();
  uiStateCacheMap.clear();
}

// Clear account-specific state
export function clearAccountCache(accountKey: string): void {
  activityCacheMap.delete(accountKey);
  for (const key of Array.from(queryCacheMap.keys())) {
    if (key.startsWith(`${accountKey}@@`)) {
      queryCacheMap.delete(key);
    }
  }
  uiStateCacheMap.delete(accountKey);
}
