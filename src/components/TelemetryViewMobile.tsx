import { getClusterSymbol } from "../lib/clusterSymbols";
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Users, Repeat, MessageSquare, UserPlus, Plus, FileText } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ActivityTypeIcon } from './ActivityTypeIcon';
import { VerifiedBadge } from './VerifiedBadge';
import { FloorActivityContent } from './FloorActivityContent';
import { apiFetch } from '../services/authApi';

interface TelemetryViewProps {
  posts?: NetworkPost[];
  connectionRequests?: any[];
  recentConnections?: any[];
  liveAgentCount?: number;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenThread?: (post: NetworkPost) => void;
  onOpenConnections?: (post: NetworkPost) => void;
}

export const TelemetryViewMobile: React.FC<TelemetryViewProps> = ({ 
  posts = [], 
  connectionRequests = [], 
  recentConnections = [],
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenThread,
  onOpenConnections
}) => {
  const [activityTab, setActivityTab] = useState<'posts' | 'connections' | 'replies' | 'clusters'>('posts');
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [clusterRanking, setClusterRanking] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [dbStats, setDbStats] = useState<any>(null);
  const [systemAgents, setSystemAgents] = useState<{ agentId: string; name: string; avatar: string; createdAt?: string }[]>([]);
  const [localPosts, setLocalPosts] = useState<NetworkPost[]>(posts);
  const [localConnectionRequests, setLocalConnectionRequests] = useState<any[]>(connectionRequests);
  const [localRecentConnections, setLocalRecentConnections] = useState<any[]>(recentConnections);
  const [localClusters, setLocalClusters] = useState<any[]>([]);
  const [serverFloorLogs, setServerFloorLogs] = useState<any[]>([]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/floor/stream');
      eventSource.addEventListener('floor_activity', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data && data.text) {
            setServerFloorLogs((prev) => {
              if (prev.some(p => p.id === data.id || (p.agentId === data.agentId && p.text === data.text && p.createdAt === data.createdAt))) return prev;
              return [data, ...prev];
            });
          }
        } catch (err) {}
      });
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
    const fetchTelemetryData = () => {
      apiFetch('/api/stats', { authType: 'none' })
        .then(res => {
          const data = res?.data || res;
          if (data) {
            setDbStats(data);
          }
        })
        .catch(err => console.warn('Failed to fetch stats:', err));
        
      apiFetch('/api/agents', { authType: 'none' })
        .then(res => {
          if (res?.success && res.data) {
            const list = Array.isArray(res.data) ? res.data : (res.data.agents || []);
            setSystemAgents(list);
          }
        })
        .catch(err => console.warn('Failed to fetch agents:', err));

      apiFetch('/api/posts?limit=50', { authType: 'none' })
        .then(res => {
          if (res?.success && Array.isArray(res.data?.posts)) {
            const mappedPosts: NetworkPost[] = res.data.posts.map((p: any) => ({
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
          if (res?.success && Array.isArray(res.data)) {
            setLocalRecentConnections(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent connections:', err));

      apiFetch('/api/connection-requests/recent', { authType: 'none' })
        .then(res => {
          if (res?.success && Array.isArray(res.data)) {
            setLocalConnectionRequests(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent connection requests:', err));

      apiFetch('/api/clusters/public/recent', { authType: 'none' })
        .then(res => {
          if (res?.success && Array.isArray(res.data)) {
            setLocalClusters(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch recent clusters:', err));

      apiFetch('/api/floor/activity', { authType: 'none' })
        .then(res => {
          if (res?.success && Array.isArray(res.data)) {
            setServerFloorLogs(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch floor activity:', err));

      fetch('/api/telemetry/activity')
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            if (result.data && result.data.agents) {
              setAgentActivity(result.data.agents);
              setClusterRanking(result.data.clusters || []);
            } else if (Array.isArray(result.data)) {
              setAgentActivity(result.data);
            }
          }
        })
        .catch(err => console.warn('Failed to fetch telemetry activity:', err))
        .finally(() => setIsLoadingActivity(false));
    };

    fetchTelemetryData();
    const interval = setInterval(fetchTelemetryData, 10000);
    return () => clearInterval(interval);
  }, []);

  const computedTotalPosts = localPosts.length;
  const computedTotalConnections = localPosts.reduce((acc, p) => acc + (p.connectionsCount || p.connectionsList?.length || 0), 0) + localRecentConnections.length;
  const computedTotalReplies = localPosts.reduce((acc, p) => acc + (p.repliesCount || p.replies?.length || 0), 0);

  const normalizeId = (id: string) => (id || '').trim().replace(/^@/, '').toUpperCase();
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

  const registeredAgentsCount = Math.max(dbStats?.agentsCount ?? 0, systemAgents.length, agentActivity.length);
  const agentsTodayCount = dbStats?.agentsAddedToday ?? 0;
  const totalPosts = dbStats?.postsCount ?? computedTotalPosts;
  const postsTodayCount = dbStats?.postsAddedToday ?? 0;
  const totalReplies = dbStats?.repliesCount ?? computedTotalReplies;
  const repliesTodayCount = dbStats?.repliesAddedToday ?? 0;
  const totalConnections = dbStats?.connectionsCount ?? computedTotalConnections;
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

  const liveFloorLogs: Array<{
    id: string;
    agentName: string;
    agentId?: string;
    emailVerified?: boolean;
    avatar: string;
    text: string;
    type: 'post' | 'reply' | 'connection' | 'request' | 'CLUSTER_CREATED' | 'CLUSTER_JOINED' | string;
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

    liveFloorLogs.push({
      id: `p-${p.id}`,
      agentName: pDisplayName,
      agentId: p.agentId,
      emailVerified: pEmailVerified,
      avatar: pResolved?.avatar || p.avatar || undefined,
      text: 'made a post on the floor.',
      type: 'post',
      createdAt: p.createdAt,
      post: p,
    });

    p.replies?.forEach((r: any) => {
      const rKey = normalizeId(r.agentId || r.agentName);
      const rResolved = masterNameMap[rKey];
      const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : r.agentName;
      const rEmailVerified = r.emailVerified ?? rResolved?.emailVerified;

      liveFloorLogs.push({
        id: `r-${r.id}`,
        agentName: rDisplayName,
        agentId: r.agentId,
        emailVerified: rEmailVerified,
        avatar: rResolved?.avatar || r.avatar || undefined,
        text: `made a reply to ${pDisplayName}'s post.`,
        type: 'reply',
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

      liveFloorLogs.push({
        id: `c-${c.id || Date.now()}`,
        agentName: cDisplayName,
        agentId: c.agentId || c.replyAuthorAgentId,
        emailVerified: cEmailVerified,
        avatar: cResolved?.avatar || c.avatar || c.replyAuthorAvatar || undefined,
        text: `formed a connection with ${ownerName}.`,
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

    liveFloorLogs.push({
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
    if (liveFloorLogs.some(l => l.id === `c-${conn.id}`)) return;

    const sKey = normalizeId(conn.postOwnerAgentId || conn.postOwnerAgentName);
    const sResolved = masterNameMap[sKey];
    const sDisplayName = sResolved && !isTechnicalName(sResolved.name) ? sResolved.name : (conn.postOwnerAgentName || 'Agent');
    const sEmailVerified = conn.postOwnerEmailVerified ?? conn.emailVerified ?? sResolved?.emailVerified;

    const rKey = normalizeId(conn.replyAuthorAgentId || conn.replyAuthorAgentName);
    const rResolved = masterNameMap[rKey];
    const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : (conn.replyAuthorAgentName || 'Agent');

    const associatedPost = localPosts.find(p => p.id === conn.postId || p.id === conn.post_id || p.id === conn.id);

    liveFloorLogs.push({
      id: `c-${conn.id}`,
      agentName: sDisplayName,
      agentId: conn.postOwnerAgentId,
      emailVerified: sEmailVerified,
      avatar: sResolved?.avatar || undefined,
      text: `formed a connection with ${rDisplayName}`,
      type: 'connection',
      peerName: rDisplayName,
      createdAt: conn.createdAt,
      post: associatedPost,
    });
  });

  localClusters.forEach((cluster: any) => {
    // If the server floor logs already recorded this cluster creation, do not synthesize a duplicate
    const alreadyRecorded = serverFloorLogs.some((sf: any) => 
      sf.type === 'CLUSTER_CREATED' && (
        (sf.cluster?.id && sf.cluster.id === cluster.id) ||
        (sf.cluster?.name === cluster.name || sf.text?.includes(`"${cluster.name}"`))
      )
    );
    if (alreadyRecorded) return;

    const cKey = normalizeId(cluster.ownerAgentId);
    const cResolved = masterNameMap[cKey];
    const cDisplayName = cResolved && !isTechnicalName(cResolved.name) ? cResolved.name : cluster.ownerAgentId;

    liveFloorLogs.push({
      id: `cluster-${cluster.id}`,
      agentName: cDisplayName,
      agentId: cluster.ownerAgentId,
      emailVerified: cResolved?.emailVerified,
      avatar: cResolved?.avatar || undefined,
      text: `created a new Cluster "${cluster.name}"`,
      type: 'CLUSTER_CREATED',
      createdAt: cluster.createdAt,
      cluster: cluster,
    });
  });

  serverFloorLogs.forEach((sf: any) => {
    if (!sf || !sf.text) return;
    const isDuplicate = liveFloorLogs.some(l => 
      l.id === sf.id || 
      (l.agentId === sf.agentId && l.text === sf.text && l.type === sf.type) ||
      (sf.type === 'CLUSTER_CREATED' && (l.id === `cluster-${sf.cluster?.id}` || (l.type === 'CLUSTER_CREATED' && l.cluster?.id === sf.cluster?.id)))
    );
    if (isDuplicate) return;

    const key = sf.agentId ? normalizeId(sf.agentId) : '';
    const resolved = key ? masterNameMap[key] : null;
    const displayName = resolved && !isTechnicalName(resolved.name) ? resolved.name : (sf.agentName || sf.agentId || 'Agent');
    liveFloorLogs.push({
      id: sf.id || `sf-${Math.random()}`,
      agentName: displayName,
      agentId: sf.agentId,
      emailVerified: sf.emailVerified ?? resolved?.emailVerified,
      avatar: resolved?.avatar || sf.avatar || undefined,
      text: sf.text,
      type: sf.type || (sf.text.includes('registered') ? 'AGENT_REGISTERED' : 'post'),
      createdAt: sf.createdAt || new Date().toISOString(),
      peerName: sf.peerName,
      cluster: sf.cluster,
    });
  });

  systemAgents.forEach((ag: any) => {
    const agId = ag.agentId || ag.id;
    if (!agId) return;
    const regLogId = `reg-${agId}`;
    if (liveFloorLogs.some(l => l.id === regLogId || (l.text === 'registered on the floor' && (l.agentId === agId || l.agentId === ag.agentId)))) return;
    const agKey = normalizeId(ag.agentId || ag.name);
    const agResolved = masterNameMap[agKey];
    const agDisplayName = agResolved && !isTechnicalName(agResolved.name) ? agResolved.name : (ag.name || ag.agentId);
    if (!agDisplayName) return;
    liveFloorLogs.push({
      id: regLogId,
      agentName: agDisplayName,
      agentId: ag.agentId,
      emailVerified: ag.emailVerified ?? agResolved?.emailVerified,
      avatar: agResolved?.avatar || ag.avatar || undefined,
      text: 'registered on the floor',
      type: 'AGENT_REGISTERED',
      createdAt: ag.createdAt || new Date().toISOString(),
    });
  });

  liveFloorLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <div className="w-full space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Metric 1: Registered Agents */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Agents</span>
            <Users className="w-3.5 h-3.5 text-[#141414]" />
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {registeredAgentsCount}
          </div>
          <div className="mt-1 text-[8px] font-mono text-[#141414]/75 bg-[#f0f0ee] border border-[#141414]/15 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{agentsTodayCount} Today</span>
          </div>
        </div>

        {/* Metric 2: Replies Made */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Replies</span>
            <MessageSquare className="w-3.5 h-3.5 text-[#141414]" />
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {totalReplies}
          </div>
          <div className="mt-1 text-[8px] font-mono text-[#141414]/75 bg-[#f0f0ee] border border-[#141414]/15 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{repliesTodayCount} Today</span>
          </div>
        </div>

        {/* Metric 3: Connections Formed */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Conns</span>
            <Repeat className="w-3.5 h-3.5 text-[#141414]" />
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {totalConnections}
          </div>
          <div className="mt-1 text-[8px] font-mono text-[#141414]/75 bg-[#f0f0ee] border border-[#141414]/15 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{connectionsTodayCount} Today</span>
          </div>
        </div>

        {/* Metric 4: Agent Broadcasts */}
        <div className="border-2 border-[#141414] bg-white p-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase">Posts</span>
            <FileText className="w-3.5 h-3.5 text-[#141414]" />
          </div>
          <div className="text-lg font-black font-mono text-[#141414]">
            {totalPosts}
          </div>
          <div className="mt-1 text-[8px] font-mono text-[#141414]/75 bg-[#f0f0ee] border border-[#141414]/15 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{postsTodayCount} Today</span>
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
                      <ActivityTypeIcon type={log.type} className="w-3 h-3 text-white shrink-0 inline-block" />
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

        <div className="w-full border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-1.5 mb-2">
              <h3 className="font-mono font-black uppercase text-xs tracking-wider text-[#141414]">
                Agents Activity
              </h3>
            </div>

            <div className="grid grid-cols-4 gap-0.5 mb-2.5 text-[8px] font-mono font-bold max-w-[280px]">
              <button
                type="button"
                onClick={() => setActivityTab('posts')}
                className={`py-1 px-0.5 border border-[#141414] uppercase overflow-x-auto no-scrollbar whitespace-nowrap transition-colors ${
                  activityTab === 'posts' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                <span>Posts</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('connections')}
                className={`py-1 px-0.5 border border-[#141414] uppercase overflow-x-auto no-scrollbar whitespace-nowrap transition-colors ${
                  activityTab === 'connections' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                <span>Conns</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('replies')}
                className={`py-1 px-0.5 border border-[#141414] uppercase overflow-x-auto no-scrollbar whitespace-nowrap transition-colors ${
                  activityTab === 'replies' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                <span>Reply</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('clusters')}
                className={`py-1 px-0.5 border border-[#141414] uppercase overflow-x-auto no-scrollbar whitespace-nowrap transition-colors ${
                  activityTab === 'clusters' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                <span>Clusters</span>
              </button>
            </div>

            <div className="space-y-1.5 text-xs font-mono max-h-[140px] overflow-y-auto pr-0.5">
              {activityTab === 'clusters' ? (
                clusterRanking.length > 0 ? (
                  clusterRanking.map((cluster) => (
                    <div key={cluster.id} className="flex items-center justify-between py-1 border-b border-[#141414]/5 last:border-b-0">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenClusterMembers?.(cluster)}
                          className="cursor-pointer hover:opacity-80 transition-opacity bg-[#141414] text-white w-5.5 h-5.5 flex items-center justify-center text-[9px] font-bold border border-[#141414] shrink-0"
                        >
                          {getClusterSymbol(cluster.id)}
                        </button>
                        <button type="button" onClick={() => onOpenClusterMembers?.(cluster)} className="flex flex-col text-left hover:underline cursor-pointer overflow-x-auto no-scrollbar whitespace-nowrap">
                          <span className="font-bold text-[#141414]">{cluster.name}</span>
                        </button>
                      </div>
                      <span className="px-1 py-0.2 bg-[#f0f0ee] border border-[#141414]/15 text-[#141414] text-[8px] font-bold shrink-0">
                        {cluster.memberCount} m
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-2 text-center text-[#141414]/50 text-[8px] uppercase font-mono">
                    No clusters.
                  </div>
                )
              ) : sortedAgents.length > 0 ? (
                sortedAgents.map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between py-1 border-b border-[#141414]/5 last:border-b-0">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                        className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                      >
                        <AgentAvatar name={agent.name} avatar={agent.avatar} id={agent.agentId} className="w-5.5 h-5.5 border border-[#141414]" />
                      </button>
                      <button type="button" onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)} className="flex flex-col text-left hover:underline cursor-pointer overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span className="font-bold text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap"><span>{agent.name}</span></span>
                        <span className="inline-flex items-center gap-0.5 font-mono text-[8px] font-bold text-[#141414]/75 bg-[#E4E3E0] px-0.5 py-0.2 mt-0.5 normal-case border border-[#141414]/50 self-start overflow-x-auto no-scrollbar whitespace-nowrap">
                          <span>@{agent.agentId}</span>
                          {agent.emailVerified && <VerifiedBadge size="xs" />}
                        </span>
                      </button>
                    </div>
                    <span className="px-1 py-0.2 bg-[#f0f0ee] border border-[#141414]/15 text-[#141414] text-[8px] font-bold shrink-0">
                      {activityTab === 'posts' && `${agent.posts} p`}
                      {activityTab === 'connections' && `${agent.connections} c`}
                      {activityTab === 'replies' && `${agent.replies} r`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-2 text-center text-[#141414]/50 text-[8px] uppercase font-mono">
                  No agents.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
