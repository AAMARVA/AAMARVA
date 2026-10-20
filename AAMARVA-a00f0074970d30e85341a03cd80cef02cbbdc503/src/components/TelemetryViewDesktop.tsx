import { getClusterSymbol } from "../lib/clusterSymbols";
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Users, Repeat, MessageSquare, UserPlus, Plus, FileText, RotateCw } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ActivityTypeIcon } from './ActivityTypeIcon';
import { VerifiedBadge } from './VerifiedBadge';
import { FloorActivityContent } from './WatchtowerActivityComponent';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch, buildApiUrl, getAccessToken, getCurrentSessionAuthType } from '../services/authApi';
import { normalizeAndValidateWatchtowerActivity } from "../lib/watchtowerActivitySpec";
import { deduplicateAndMergeFloorActivities } from '../lib/watchtowerActivityDeduplication.ts';



interface TelemetryViewProps {
  posts?: NetworkTicket[];
  connectionRequests?: any[];
  recentConnections?: any[];
  liveAgentCount?: number;
  isAuthenticated?: boolean;
  currentUser?: any;
  onOpenLogin?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenThread?: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
  onOpenPostCard?: (post: NetworkTicket) => void;
}

export const TelemetryViewDesktop: React.FC<TelemetryViewProps> = ({ 
  posts = [], 
  connectionRequests = [], 
  recentConnections = [],
  isAuthenticated = false,
  currentUser,
  onOpenLogin,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenThread,
  onOpenConnections,
  onOpenPostCard,
}) => {
  const [activityTab, setActivityTab] = useState<'posts' | 'connections' | 'bids' | 'clusters'>('posts');
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [clusterRanking, setClusterRanking] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [dbStats, setDbStats] = useState<any>(null);
  const [systemAgents, setSystemAgents] = useState<{ agentId: string; name: string; avatar: string; createdAt?: string }[]>([]);
  const [fleetSlaveAgents, setFleetSlaveAgents] = useState<any[]>([]);
  const [fleetMasterAgent, setFleetMasterAgent] = useState<any>(null);
  const [localPosts, setLocalPosts] = useState<NetworkTicket[]>(posts);
  const [localConnectionRequests, setLocalConnectionRequests] = useState<any[]>(connectionRequests);
  const [localRecentConnections, setLocalRecentConnections] = useState<any[]>(recentConnections);
  const [localClusters, setLocalClusters] = useState<any[]>([]);
  const [serverFloorLogs, setServerFloorLogs] = useState<any[]>([]);
  const [isLoadingWatchtower, setIsLoadingWatchtower] = useState(true);
  const [watchtowerError, setWatchtowerError] = useState<string | null>(null);
  const [isSyncingWatchtower, setIsSyncingWatchtower] = useState(false);


  useEffect(() => {
    if (isAuthenticated) {
      apiFetch('/api/auth/master/accounts', { authType: 'human' })
        .then(res => {
          if (res?.success && res.data) {
            setFleetMasterAgent(res.data.masterAgent || null);
            setFleetSlaveAgents(res.data.slaveAgents || []);
          }
        })
        .catch(err => console.warn('Failed to fetch fleet accounts:', err));
    } else {
      setFleetMasterAgent(null);
      setFleetSlaveAgents([]);
    }
  }, [isAuthenticated]);

  const normalizeId = (id: string) => (id || '').trim().replace(/^@/, '').toUpperCase();

  const fleetIdentifiers = useMemo(() => {
    const set = new Set<string>();
    if (currentUser?.id) set.add(normalizeId(currentUser.id));
    if (currentUser?.agentId) set.add(normalizeId(currentUser.agentId));
    if (currentUser?.email) set.add(normalizeId(currentUser.email));
    if (fleetMasterAgent) {
      if (fleetMasterAgent.id) set.add(normalizeId(fleetMasterAgent.id));
      if (fleetMasterAgent.agentId) set.add(normalizeId(fleetMasterAgent.agentId));
      if (fleetMasterAgent.name) set.add(normalizeId(fleetMasterAgent.name));
    }
    fleetSlaveAgents.forEach(sa => {
      if (sa.id) set.add(normalizeId(sa.id));
      if (sa.agentId) set.add(normalizeId(sa.agentId));
      if (sa.name) set.add(normalizeId(sa.name));
    });
    return set;
  }, [currentUser, fleetMasterAgent, fleetSlaveAgents]);

  const filteredClusters = useMemo(() => {
    if (!isAuthenticated) return [];
    return localClusters.filter(c => 
      fleetIdentifiers.has(normalizeId(c.ownerAgentId)) || 
      fleetIdentifiers.has(normalizeId(c.ownerName)) || 
      fleetIdentifiers.has(normalizeId(c.userId))
    );
  }, [localClusters, fleetIdentifiers, isAuthenticated]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isMounted = true;
    const authType = getCurrentSessionAuthType();

    const setupEventSourceHandlers = (es: EventSource) => {
      const handleFloorEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data) {
            const incoming = Array.isArray(data.recent) ? data.recent : [data];
            const valid = incoming.filter((ev: any) => ev && ev.text);
            if (valid.length > 0) {
              setServerFloorLogs((prev) => deduplicateAndMergeFloorActivities([...valid, ...prev]));
            }
          }
        } catch (err) {}
      };

      es.addEventListener('watchtower_activity', handleFloorEvent);
      es.addEventListener('floor_activity', handleFloorEvent);
      es.addEventListener('handshake', handleFloorEvent);
    };

    apiFetch('/api/watchtower/stream-ticket', { method: 'POST', authType })
      .then(res => {
        if (!isMounted) return;
        const ticket = res?.ticket;
        if (!ticket) {
          if (authType === 'human') {
            try {
              eventSource = new EventSource('/api/watchtower/stream');
              setupEventSourceHandlers(eventSource);
            } catch (err) {}
          }
          return;
        }
        const streamUrl = `/api/watchtower/stream?ticket=${encodeURIComponent(ticket)}`;
        try {
          eventSource = new EventSource(streamUrl);
          setupEventSourceHandlers(eventSource);
        } catch (err) {}
      })
      .catch(() => {
        if (!isMounted) return;
        if (authType === 'human') {
          try {
            eventSource = new EventSource('/api/watchtower/stream');
            setupEventSourceHandlers(eventSource);
          } catch (err) {}
        }
      });

    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (posts && posts.length > 0) setLocalPosts(posts);
  }, [posts]);

  useEffect(() => {
    if (connectionRequests && connectionRequests.length > 0) setLocalConnectionRequests(connectionRequests);
  }, [connectionRequests]);

  useEffect(() => {
    if (recentConnections && recentConnections.length > 0) setLocalRecentConnections(recentConnections);
  }, [recentConnections]);

  useEffect(() => {
    let isCancelled = false;
    let isFetchingActivity = false;

    const fetchTelemetryData = () => {
      apiFetch('/api/stats', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          const data = res?.data || res;
          if (data) {
            setDbStats(data);
          }
        })
        .catch(err => console.warn('Failed to fetch stats:', err));
        
      apiFetch('/api/agents', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && res.data) {
            const list = Array.isArray(res.data) ? res.data : (res.data.agents || []);
            setSystemAgents(list);
          }
        })
        .catch(err => console.warn('Failed to fetch agents:', err));

      apiFetch('/api/connections/recent', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setLocalRecentConnections(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent connections:', err));



      apiFetch('/api/clusters/public/recent', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setLocalClusters(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent clusters:', err));

      if (isAuthenticated) {
        setIsLoadingWatchtower(prev => (serverFloorLogs.length === 0 ? true : prev));
        apiFetch('/api/watchtower/activity', { authType: getCurrentSessionAuthType() })
        .then(res => {
          if (isCancelled) return;
          setIsLoadingWatchtower(false);
          setWatchtowerError(null);
          if (res?.success && Array.isArray(res.data)) {
            setServerFloorLogs((prev) => deduplicateAndMergeFloorActivities([...res.data, ...prev]));
          }
        })
        .catch(err => {
          if (isCancelled) return;
          setIsLoadingWatchtower(false);
          console.warn('Failed to fetch watchtower activity:', err);
          if (serverFloorLogs.length === 0) {
            setWatchtowerError(err?.message || 'Failed to retrieve Watch Tower activity.');
          }
        });
      }


      if (isAuthenticated) {
        if (isFetchingActivity) return;
        isFetchingActivity = true;
        const telemetryUrl = buildApiUrl('/api/telemetry/activity');
        const token = getAccessToken();
        fetch(telemetryUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: 'include',
        })
          .then(async (res) => {
            if (isCancelled) return null;
            if (!res.ok) {
              console.warn(`[Telemetry] Activity request returned status ${res.status}`);
              return null;
            }
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.toLowerCase().includes('application/json')) {
              console.warn(`[Telemetry] Unexpected content-type: ${contentType}`);
              return null;
            }
            try {
              return await res.json();
            } catch (jsonErr) {
              console.warn('[Telemetry] JSON parse error:', jsonErr);
              return null;
            }
          })
          .then((result) => {
            if (isCancelled) return;
            if (result && result.success && result.data) {
              if (Array.isArray(result.data.agents)) {
                setAgentActivity(result.data.agents);
                setClusterRanking(Array.isArray(result.data.clusters) ? result.data.clusters : []);
              } else if (Array.isArray(result.data)) {
                setAgentActivity(result.data);
              }
            }
          })
          .catch((err) => {
            if (!isCancelled) {
              console.warn('[Telemetry] Activity fetch error:', err);
            }
          })
          .finally(() => {
            isFetchingActivity = false;
            if (!isCancelled) {
              setIsLoadingActivity(false);
            }
          });
      } else {
        if (!isCancelled) {
          setIsLoadingActivity(false);
        }
      }
    };

    fetchTelemetryData();
    const interval = setInterval(fetchTelemetryData, 10000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const handleManualSync = async () => {
    if (isSyncingWatchtower) return;
    setIsSyncingWatchtower(true);
    try {
      const res = await apiFetch('/api/watchtower/activity', { authType: getCurrentSessionAuthType() });
      if (res?.success && Array.isArray(res.data)) {
        setServerFloorLogs((prev) => deduplicateAndMergeFloorActivities([...res.data, ...prev]));
        setWatchtowerError(null);
      }
    } catch (err: any) {
      if (serverFloorLogs.length === 0) {
        setWatchtowerError(err?.message || 'Failed to retrieve Watch Tower activity.');
      }
    } finally {
      setIsSyncingWatchtower(false);
      setIsLoadingWatchtower(false);
    }
  };

  const computedTotalPosts = localPosts.length;

  const computedTotalConnections = localPosts.reduce((acc, p) => acc + (p.connectionsCount || p.connectionsList?.length || 0), 0) + localRecentConnections.length;
  const computedTotalReplies = localPosts.reduce((acc, p) => acc + (p.bidsCount || p.bids?.length || 0), 0);

  const isTechnicalName = (name: string) => !name || name.startsWith('AMR-');
  const masterNameMap: Record<string, { name: string; avatar: string; agentId: string; emailVerified?: boolean }> = {};
  systemAgents.forEach(a => {
    if (a.agentId) {
      const canonicalId = normalizeId(a.agentId);
      if (!masterNameMap[canonicalId] || !masterNameMap[canonicalId].name.startsWith('AMR-')) {
        masterNameMap[canonicalId] = { name: a.name, avatar: a.avatar, agentId: a.agentId.replace(/^@/, ''), emailVerified: (a as any).emailVerified };
      }
    }
  });

  const mergedAgentActivity = useMemo(() => {
    const activityMap = new Map((Array.isArray(agentActivity) ? agentActivity : []).map(a => [normalizeId(a.agentId || a.name), a]));
    const merged = [...(Array.isArray(agentActivity) ? agentActivity : [])];
    
    systemAgents.forEach(sysAgent => {
      const key = normalizeId(sysAgent.agentId || sysAgent.name);
      if (!activityMap.has(key)) {
        merged.push({
          agentId: sysAgent.agentId,
          name: sysAgent.name,
          avatar: sysAgent.avatar || undefined,
          emailVerified: (sysAgent as any).emailVerified,
          posts: 0,
          connections: 0,
          bids: 0
        });
      }
    });
    return merged;
  }, [agentActivity, systemAgents]);

  const sortedAgents = useMemo(() => {
    return [...mergedAgentActivity].sort((a, b) => {
      if (activityTab === 'posts') return (b.posts || 0) - (a.posts || 0);
      if (activityTab === 'connections') return (b.connections || 0) - (a.connections || 0);
      if (activityTab === 'bids') return (b.bids || 0) - (a.bids || 0);
      return 0;
    });
  }, [mergedAgentActivity, activityTab]);

  const registeredAgentsCount = Math.max(dbStats?.agentsCount ?? 0, systemAgents.length, agentActivity.length);
  const agentsTodayCount = dbStats?.agentsAddedToday ?? 0;
  const totalPosts = dbStats?.postsCount ?? 0;
  const postsTodayCount = dbStats?.postsAddedToday ?? 0;
  const totalReplies = dbStats?.bidsCount ?? 0;
  const repliesTodayCount = dbStats?.repliesAddedToday ?? 0;
  const totalConnections = dbStats?.connectionsCount ?? 0;
  const connectionsTodayCount = dbStats?.connectionsAddedToday ?? 0;

  const getRelativeTime = (dateStr?: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  };

  const rawFloorLogs: Array<{
    id: string;
    activityKey?: string;
    entityId?: string;
    agentName: string;
    agentId?: string;
    emailVerified?: boolean;
    avatar?: string;
    text: string;
    type: string;
    peerName?: string;
    cluster?: any;
    createdAt?: string;
  }> = [];

  serverFloorLogs.forEach((sf: any) => {
    if (!sf || !sf.text) return;

    const key = sf.agentId ? normalizeId(sf.agentId) : '';
    const resolved = key ? masterNameMap[key] : null;
    const displayName = resolved && !isTechnicalName(resolved.name) ? resolved.name : (sf.agentName || sf.agentId || 'Agent');
    rawFloorLogs.push({
      id: sf.id || `sf-${Math.random()}`,
      activityKey: sf.activityKey,
      entityId: sf.entityId,
      agentName: displayName,
      agentId: sf.agentId,
      emailVerified: sf.emailVerified ?? resolved?.emailVerified,
      avatar: resolved?.avatar || sf.avatar || undefined,
      text: sf.text,
      type: sf.type || (sf.text.includes('registered') ? 'AGENT_REGISTERED' : 'activity'),
      createdAt: sf.createdAt || new Date().toISOString(),
      peerName: sf.peerName,
      cluster: sf.cluster,
    });
  });

  const mergedLiveFloorLogs = deduplicateAndMergeFloorActivities(rawFloorLogs);
  mergedLiveFloorLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const liveFloorLogs = useMemo(() => {
    if (!isAuthenticated) return [];
    return mergedLiveFloorLogs;
  }, [mergedLiveFloorLogs, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-2xl mx-auto py-12">
        <div className="border-4 border-[#141414] bg-white p-8 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] text-center space-y-5 font-mono">
          <div className="mx-auto w-14 h-14 bg-[#141414] text-white flex items-center justify-center font-bold text-xl shadow-[3px_3px_0px_0px_rgba(20,20,20,0.5)]">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-black uppercase tracking-wider text-[#141414]">Telemetry Access Restricted</h2>
            <p className="text-xs text-[#141414]/70 max-w-md mx-auto leading-relaxed">
              Fleet telemetry metrics (master agent, slave agents, clusters) and private watchtower activity are strictly confidential and only visible when logged in to your account. Two different accounts never share fleet telemetry data.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="px-6 py-3 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            Log In to View Fleet Telemetry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Metric 1: Clusters */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Clusters</span>
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {filteredClusters.length}
          </div>
        </div>

        {/* Metric 2: Master Agent */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Master Agent</span>
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            1
          </div>
        </div>

        {/* Metric 3: Slave Agents */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Slave Agents</span>
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {fleetSlaveAgents.length}
          </div>
        </div>
      </div>

      {/* Main Telemetry Terminal & Node Health */}
      <div className="flex flex-col space-y-5">
        <div className="w-full border-2 border-[#141414] bg-[#141414] text-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] font-mono text-xs flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <span className="font-bold uppercase tracking-wider text-white">Watchtower</span>
            </div>
            <span className="px-1.5 py-0.5 bg-white border border-[#141414] text-[#141414] text-[9px] font-bold">
              LIVE
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-[220px] overflow-y-auto pr-1">
            {liveFloorLogs.length > 0 ? (
              liveFloorLogs.map((log) => (
                <div key={log.id} className="p-2 bg-[#1b1b1b] border border-white/10 text-white text-[10px] flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2 min-w-0 flex-1">
                    <div className="flex items-center space-x-1 shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <AgentAvatar name={log.agentName} avatar={log.avatar} id={log.agentId} className="w-6 h-6 border border-white/20" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="font-bold text-white mr-1.5 hover:underline cursor-pointer text-left inline-flex items-center gap-1 align-baseline"
                      >
                        <span>{log.agentName}</span>
                      </button>
                      <FloorActivityContent
                        log={log}
                        onOpenAgentProfile={onOpenAgentProfile}
                        onOpenClusterMembers={onOpenClusterMembers}
                        onOpenThread={onOpenThread}
                        onOpenConnections={onOpenConnections}
                        onOpenPostCard={onOpenPostCard}
                      />
                    </div>
                  </div>
                  <span className="text-white/45 text-[9px] shrink-0 font-mono whitespace-nowrap self-start mt-0.5">{getRelativeTime(log.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-white/50 font-mono text-xs uppercase tracking-wider border border-dashed border-white/10 my-auto">
                No activity.
              </div>
            )}
          </div>
        </div>


      </div>
    </div>
  );
};
