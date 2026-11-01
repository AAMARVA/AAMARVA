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

// Prepared Account Context Cache (Master & Slave profiles indexed by id and agentId)
const preparedAccountProfilesMap = new Map<string, GenericCacheEntry<any>>();

export function setPreparedAccountProfile(profile: any): void {
  if (!profile || typeof profile !== 'object') return;
  const now = Date.now();
  if (profile.id) {
    preparedAccountProfilesMap.set(String(profile.id).trim().toLowerCase(), { data: profile, timestamp: now });
  }
  if (profile.agentId) {
    preparedAccountProfilesMap.set(String(profile.agentId).trim().toUpperCase(), { data: profile, timestamp: now });
  }
}

export function getPreparedAccountProfile(identifier?: string | null, ttlMs: number = 60000): { data: any; isStale: boolean } | null {
  if (!identifier) return null;
  const trimmed = String(identifier).trim();
  const entry = preparedAccountProfilesMap.get(trimmed.toLowerCase()) || preparedAccountProfilesMap.get(trimmed.toUpperCase());
  if (!entry) return null;
  return {
    data: entry.data,
    isStale: Date.now() - entry.timestamp > ttlMs,
  };
}

export function seedFleetAccountsCache(masterAccountsData: any): void {
  if (!masterAccountsData || typeof masterAccountsData !== 'object') return;
  setQueryCache('master_accounts', '/api/auth/master/accounts', masterAccountsData);
  if (masterAccountsData.masterAgent) {
    setPreparedAccountProfile({
      ...masterAccountsData.masterAgent,
      account_type: 'master',
      isMasterUser: true,
      is_master_primary: true,
      isMasterPrimary: true,
      is_slave: false,
      isSlave: false,
    });
  }
  const slaves = masterAccountsData.subAgents || masterAccountsData.slaveAgents || [];
  if (Array.isArray(slaves)) {
    for (const s of slaves) {
      if (s && typeof s === 'object') {
        setPreparedAccountProfile({
          ...s,
          account_type: 'slave',
          role: 'slave',
          is_slave: true,
          isSlave: true,
          isMasterUser: false,
          is_master_primary: false,
          isMasterPrimary: false,
        });
      }
    }
  }
}

export function buildCommandPitFleetList(connList: any[], masterAccountsData: any): any[] {
  const connectionsMap = new Map<string, any>();

  if (Array.isArray(connList)) {
    connList.forEach((c: any) => {
      if (c && c.status !== 'dissolved') {
        const aid = (c.agentId || c.agentName || '').toUpperCase();
        if (aid) {
          connectionsMap.set(aid, {
            id: c.id || c.connectionId,
            connectionId: c.connectionId || c.id,
            agentId: c.agentId,
            agentName: c.agentName || c.agentId,
            avatar: c.avatar,
            peerE2eePublicKey: c.peerE2eePublicKey,
            isMaster: Boolean(c.isMaster),
            isSlave: Boolean(c.isSlave),
            status: c.status || 'active',
          });
        }
      }
    });
  }

  if (masterAccountsData && typeof masterAccountsData === 'object') {
    const currentActiveId = masterAccountsData.activeAgentId;
    const masterAgent = masterAccountsData.masterAgent;
    const slaveAgents = masterAccountsData.subAgents || masterAccountsData.slaveAgents || [];

    if (Array.isArray(slaveAgents)) {
      slaveAgents.forEach((s: any) => {
        if (s && s.agentId) {
          const isCurrent = s.id === currentActiveId || s.agentId === currentActiveId;
          if (!isCurrent) {
            const sKey = s.agentId.toUpperCase();
            const existing = connectionsMap.get(sKey);
            const fallbackConnId = currentActiveId ? `conn_${currentActiveId}_${s.id}` : `conn_${s.id}_fleet`;
            connectionsMap.set(sKey, {
              id: existing?.id || existing?.connectionId || fallbackConnId,
              connectionId: existing?.connectionId || existing?.id || fallbackConnId,
              agentId: s.agentId,
              agentName: s.name || s.agentId,
              avatar: s.avatar,
              peerE2eePublicKey: existing?.peerE2eePublicKey,
              isMaster: false,
              isSlave: true,
              status: 'active',
            });
          }
        }
      });
    }

    if (masterAgent?.agentId) {
      connectionsMap.delete(masterAgent.agentId.toUpperCase());
    }
    if (masterAgent?.id) {
      connectionsMap.delete(masterAgent.id.toUpperCase());
    }
    if (currentActiveId) {
      connectionsMap.delete(String(currentActiveId).toUpperCase());
    }
  }

  const mergedList = Array.from(connectionsMap.values());
  mergedList.sort((a, b) => {
    if (a.isMaster && !b.isMaster) return -1;
    if (!a.isMaster && b.isMaster) return 1;
    return (a.agentName || '').localeCompare(b.agentName || '');
  });
  return mergedList;
}

// Security: Full clearance on logout
export function clearAllAppCaches(): void {
  activityCacheMap.clear();
  queryCacheMap.clear();
  uiStateCacheMap.clear();
  preparedAccountProfilesMap.clear();
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
