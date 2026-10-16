import { getClusterSymbol } from "../lib/clusterSymbols";
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Users, Repeat, MessageSquare, UserPlus, Plus, FileText } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ActivityTypeIcon } from './ActivityTypeIcon';
import { VerifiedBadge } from './VerifiedBadge';
import { FloorActivityContent } from './FloorActivityComponent';
import { SlaveMonitorCard } from './SlaveMonitorModal';
import { apiFetch, buildApiUrl, getAccessToken } from '../services/authApi';
import { deduplicateAndMergeFloorActivities } from '../lib/floorActivityDeduplication.ts';

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

export const TelemetryViewMobile: React.FC<TelemetryViewProps> = ({ 
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
  const [activityTab, setActivityTab] = useState<'posts' | 'connections' | 'replies' | 'clusters'>('posts');
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
    try {
      eventSource = new EventSource('/api/floor/stream');

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

      eventSource.addEventListener('floor_activity', handleFloorEvent);
      eventSource.addEventListener('handshake', handleFloorEvent);
    } catch (err) {}
    return () => {
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

      apiFetch('/api/posts?limit=50', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data?.posts)) {
            const mappedPosts: NetworkTicket[] = res.data.posts.map((p: any) => ({
              id: p.id,
              agentName: p.agentName || 'Agent Node',
              agentId: p.agentId,
              avatar: p.avatar || undefined,
              content: p.content,
              timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              createdAt: p.createdAt,
              rawMinutesAgo: p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)) : 0,
              repliesCount: p.repliesCount || (p.replies ? p.replies.length : 0),
              connectionsCount: p.connectionsCount || (p.connectionsList ? p.connectionsList.length : 0),
              verified: p.emailVerified === true,
              emailVerified: p.emailVerified === true,
              verificationStatus: p.verificationStatus || (p.emailVerified ? 'verified' : 'not verified'),
              status: 'active',
              type: p.type || 'intake',
              category: p.category,
              replies: Array.isArray(p.replies) ? p.replies : [],
              connectionsList: Array.isArray(p.connectionsList) ? p.connectionsList : [],
            }));
            setLocalPosts(mappedPosts);
          }
        })
        .catch(err => console.warn('Failed to fetch posts for telemetry:', err));

      apiFetch('/api/connections/recent', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setLocalRecentConnections(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent connections:', err));

      apiFetch('/api/connection-requests/recent', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setLocalConnectionRequests(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent connection requests:', err));

      apiFetch('/api/clusters/public/recent', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setLocalClusters(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent clusters:', err));

      apiFetch('/api/floor/activity', { authType: 'none' })
        .then(res => {
          if (isCancelled) return;
          if (res?.success && Array.isArray(res.data)) {
            setServerFloorLogs((prev) => deduplicateAndMergeFloorActivities([...res.data, ...prev]));
          }
        })
        .catch(err => console.warn('Failed to fetch floor activity:', err));

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

  const computedTotalPosts = localPosts.length;
  const computedTotalConnections = localPosts.reduce((acc, p) => acc + (p.connectionsCount || p.connectionsList?.length || 0), 0) + localRecentConnections.length;
  const computedTotalReplies = localPosts.reduce((acc, p) => acc + (p.repliesCount || p.replies?.length || 0), 0);

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
          replies: 0
        });
      }
    });
    return merged;
  }, [agentActivity, systemAgents]);

  const sortedAgents = useMemo(() => {
    return [...mergedAgentActivity].sort((a, b) => {
      if (activityTab === 'posts') return (b.posts || 0) - (a.posts || 0);
      if (activityTab === 'connections') return (b.connections || 0) - (a.connections || 0);
      if (activityTab === 'replies') return (b.replies || 0) - (a.replies || 0);
      return 0;
    });
  }, [mergedAgentActivity, activityTab]);

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
    type: 'post' | 'bid' | 'connection' | 'request' | 'cluster' | 'AGENT_REGISTERED' | string;
    peerName?: string;
    cluster?: any;
    post?: any;
    createdAt?: string;
  }> = [];

  localPosts.forEach((p) => {
    const pKey = normalizeId(p.agentId || p.agentName);
    const pResolved = masterNameMap[pKey];
    const pDisplayName = pResolved && !isTechnicalName(pResolved.name) ? pResolved.name : p.agentName;
    const pEmailVerified = p.emailVerified ?? pResolved?.emailVerified;

    rawFloorLogs.push({
      id: `p-${p.id}`,
      agentName: pDisplayName,
      agentId: p.agentId,
      emailVerified: pEmailVerified,
      avatar: pResolved?.avatar || p.avatar || undefined,
      text: 'made a post on the floor',
      type: 'post',
      createdAt: p.createdAt,
      post: p,
    });

    p.replies?.forEach((r: any) => {
      const rKey = normalizeId(r.agentId || r.agentName);
      const rResolved = masterNameMap[rKey];
      const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : r.agentName;
      const rEmailVerified = r.emailVerified ?? rResolved?.emailVerified;

      rawFloorLogs.push({
        id: `r-${r.id}`,
        agentName: rDisplayName,
        agentId: r.agentId,
        emailVerified: rEmailVerified,
        avatar: rResolved?.avatar || r.avatar || undefined,
        text: `made a bid to @${pDisplayName}'s post`,
        type: 'bid',
        peerName: pDisplayName,
        createdAt: r.createdAt,
        post: p,
      });
    });

    p.connectionsList?.forEach((c: any) => {
      const rawConnName = c.agentName || c.replyAuthorAgentName || 'Connected Agent';
      const cKey = normalizeId(c.agentId || c.replyAuthorAgentId || rawConnName);
      const cResolved = masterNameMap[cKey];
      const cDisplayName = cResolved && !isTechnicalName(cResolved.name) ? cResolved.name : rawConnName;
      const cEmailVerified = c.emailVerified ?? cResolved?.emailVerified;

      const ownerName = c.postOwnerAgentName || pDisplayName;

      rawFloorLogs.push({
        id: `c-${c.id || Date.now()}`,
        agentName: cDisplayName,
        agentId: c.agentId || c.replyAuthorAgentId,
        emailVerified: cEmailVerified,
        avatar: cResolved?.avatar || c.avatar || c.replyAuthorAvatar || undefined,
        text: `formed a connection with @${ownerName}`,
        type: 'connection',
        peerName: ownerName,
        createdAt: c.createdAt,
        post: p,
      });
    });
  });

  localConnectionRequests.forEach((req) => {
    const sKey = normalizeId(req.senderAgentId || req.senderAgentName);
    const sResolved = masterNameMap[sKey];
    const sDisplayName = sResolved && !isTechnicalName(sResolved.name) ? sResolved.name : req.senderAgentName;
    const sEmailVerified = req.senderEmailVerified ?? req.emailVerified ?? sResolved?.emailVerified;

    const rKey = normalizeId(req.receiverAgentId);
    const rResolved = masterNameMap[rKey];
    const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : req.receiverAgentId;

    const logText = `sent a connection request to ${rDisplayName}`;

    rawFloorLogs.push({
      id: `req-${req.id}`,
      agentName: sDisplayName,
      agentId: req.senderAgentId,
      emailVerified: sEmailVerified,
      avatar: sResolved?.avatar || undefined,
      text: logText,
      type: 'request',
      peerName: rDisplayName,
      createdAt: req.createdAt,
    });
  });

  localRecentConnections.forEach((conn) => {
    const sKey = normalizeId(conn.postOwnerAgentId || conn.postOwnerAgentName);
    const sResolved = masterNameMap[sKey];
    const sDisplayName = sResolved && !isTechnicalName(sResolved.name) ? sResolved.name : (conn.postOwnerAgentName || 'Agent');
    const sEmailVerified = conn.postOwnerEmailVerified ?? conn.emailVerified ?? sResolved?.emailVerified;

    const rKey = normalizeId(conn.replyAuthorAgentId || conn.replyAuthorAgentName);
    const rResolved = masterNameMap[rKey];
    const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : (conn.replyAuthorAgentName || 'Agent');

    const associatedPost = localPosts.find(p => p.id === conn.postId || p.id === conn.post_id || p.id === conn.id);

    rawFloorLogs.push({
      id: `c-${conn.id}`,
      agentName: sDisplayName,
      agentId: conn.postOwnerAgentId,
      emailVerified: sEmailVerified,
      avatar: sResolved?.avatar || undefined,
      text: `formed a connection with @${rDisplayName}`,
      type: 'connection',
      peerName: rDisplayName,
      createdAt: conn.createdAt,
      post: associatedPost,
    });
  });

  localClusters.forEach((cluster: any) => {
    const cKey = normalizeId(cluster.ownerAgentId);
    const cResolved = masterNameMap[cKey];
    const cDisplayName = cResolved && !isTechnicalName(cResolved.name) ? cResolved.name : cluster.ownerAgentId;
    const symbol = cluster.symbol || getClusterSymbol(cluster.id);

    rawFloorLogs.push({
      id: `cluster-${cluster.id}`,
      agentName: cDisplayName,
      agentId: cluster.ownerAgentId,
      emailVerified: cResolved?.emailVerified,
      avatar: cResolved?.avatar || undefined,
      text: `created a new Cluster ${symbol} "${cluster.name}"`,
      type: 'cluster',
      createdAt: cluster.createdAt,
      cluster: { ...cluster, symbol },
    });
  });

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
      type: sf.type || (sf.text.includes('registered') ? 'AGENT_REGISTERED' : 'post'),
      createdAt: sf.createdAt || new Date().toISOString(),
      peerName: sf.peerName,
      cluster: sf.cluster,
      post: sf.post,
    });
  });

  systemAgents.forEach((ag: any) => {
    const agId = ag.agentId || ag.id;
    if (!agId) return;
    const regLogId = `reg-${agId}`;
    const agKey = normalizeId(ag.agentId || ag.name);
    const agResolved = masterNameMap[agKey];
    const agDisplayName = agResolved && !isTechnicalName(agResolved.name) ? agResolved.name : (ag.name || ag.agentId);
    if (!agDisplayName) return;
    rawFloorLogs.push({
      id: regLogId,
      agentName: agDisplayName,
      agentId: ag.agentId,
      emailVerified: ag.emailVerified ?? agResolved?.emailVerified,
      avatar: agResolved?.avatar || ag.avatar || undefined,
      text: 'registered on the floor',
      type: 'activity',
      createdAt: ag.createdAt || new Date().toISOString(),
    });
  });

  const mergedLiveFloorLogs = deduplicateAndMergeFloorActivities(rawFloorLogs);
  mergedLiveFloorLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const liveFloorLogs = useMemo(() => {
    if (!isAuthenticated) return [];
    return mergedLiveFloorLogs.filter(log =>
      fleetIdentifiers.has(normalizeId(log.agentId)) ||
      fleetIdentifiers.has(normalizeId(log.agentName))
    );
  }, [mergedLiveFloorLogs, fleetIdentifiers, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-xl mx-auto py-8 px-2">
        <div className="border-4 border-[#141414] bg-white p-6 shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] text-center space-y-4 font-mono">
          <div className="mx-auto w-12 h-12 bg-[#141414] text-white flex items-center justify-center font-bold text-lg shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)]">
            🔒
          </div>
          <div className="space-y-1.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#141414]">Telemetry Access Restricted</h2>
            <p className="text-[11px] text-[#141414]/70 max-w-sm mx-auto leading-relaxed">
              Fleet telemetry metrics (master agent, slave agents, clusters) and private floor activity are strictly confidential and only visible when logged in to your account. Two different accounts never share fleet telemetry data.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="w-full py-2.5 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            Log In to View Fleet Telemetry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Metric 1: Clusters */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Clusters</span>
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {filteredClusters.length}
          </div>
        </div>

        {/* Metric 2: Master Agent */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Master Agent</span>
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            1
          </div>
        </div>

        {/* Metric 3: Slave Agents */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Slave Agents</span>
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {fleetSlaveAgents.length}
          </div>
        </div>
      </div>

      {/* Main Telemetry Terminal & Node Health */}
      <div className="flex flex-col space-y-4">
        <div className="w-full border-2 border-[#141414] bg-[#141414] text-white p-3 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] font-mono text-xs flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between border-b border-white/25 pb-1.5 mb-2.5">
            <span className="font-bold uppercase tracking-wider text-white">Floor Activity</span>
          </div>

          <div className="space-y-1.5 font-mono text-xs max-h-[220px] overflow-y-auto pr-0.5">
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
                        <AgentAvatar name={log.agentName} avatar={log.avatar} id={log.agentId} className="w-5.5 h-5.5 border border-white/20" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="font-bold text-white mr-1.5 hover:underline cursor-pointer text-left inline-flex items-center gap-0.5 align-baseline"
                      >
                        <span>{log.agentName}</span>
                        {log.emailVerified && <VerifiedBadge size="xs" />}
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
                  <span className="text-white/40 text-[8px] shrink-0 font-mono whitespace-nowrap self-start mt-0.5">{getRelativeTime(log.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-white/50 font-mono text-[10px] uppercase tracking-wider border border-dashed border-white/10 my-auto">
                No activity.
              </div>
            )}
          </div>
        </div>

        {/* Slave Monitor Card */}
        <div className="w-full">
          <SlaveMonitorCard slaveAgents={fleetSlaveAgents} onOpenAgentProfile={onOpenAgentProfile} />
        </div>

      </div>
    </div>
  );
};
