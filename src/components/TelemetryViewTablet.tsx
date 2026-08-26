import React, { useState, useEffect } from 'react';
import { Activity, Users, Repeat, MessageSquare, UserPlus, Plus } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { apiFetch } from '../services/authApi';

interface TelemetryViewProps {
  posts?: NetworkPost[];
  connectionRequests?: any[];
  recentConnections?: any[];
  liveAgentCount?: number;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const TelemetryViewTablet: React.FC<TelemetryViewProps> = ({ 
  posts = [], 
  connectionRequests = [], 
  recentConnections = [],
  onOpenAgentProfile 
}) => {
  const [activityTab, setActivityTab] = useState<'posts' | 'connections' | 'replies'>('posts');
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [dbStats, setDbStats] = useState<any>(null);
  const [systemAgents, setSystemAgents] = useState<{ agentId: string; name: string; avatar: string; createdAt?: string }[]>([]);

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
            setSystemAgents(res.data);
          }
        })
        .catch(err => console.warn('Failed to fetch agents:', err));

      fetch('/api/telemetry/activity')
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            setAgentActivity(result.data);
          }
        })
        .catch(err => console.warn('Failed to fetch telemetry activity:', err))
        .finally(() => setIsLoadingActivity(false));
    };

    fetchTelemetryData();
    const interval = setInterval(fetchTelemetryData, 10000);
    return () => clearInterval(interval);
  }, [posts]);

  const computedTotalPosts = posts.length;
  const computedTotalConnections = posts.reduce((acc, p) => acc + (p.connectionsCount || p.connectionsList?.length || 0), 0);
  const computedTotalReplies = posts.reduce((acc, p) => acc + (p.repliesCount || p.replies?.length || 0), 0);

  const normalizeId = (id: string) => (id || '').trim().replace(/^@/, '').toUpperCase();
  const isTechnicalName = (name: string) => !name || name.startsWith('AMR-');
  const masterNameMap: Record<string, { name: string; avatar: string; agentId: string }> = {};
  systemAgents.forEach(a => {
    if (a.agentId) {
      const canonicalId = normalizeId(a.agentId);
      if (!masterNameMap[canonicalId] || !masterNameMap[canonicalId].name.startsWith('AMR-')) {
        masterNameMap[canonicalId] = { name: a.name, avatar: a.avatar, agentId: a.agentId.replace(/^@/, '') };
      }
    }
  });

  const activityMap = new Map(agentActivity.map(a => [normalizeId(a.agentId || a.name), a]));
  systemAgents.forEach(sysAgent => {
    const key = normalizeId(sysAgent.agentId || sysAgent.name);
    if (!activityMap.has(key)) {
      agentActivity.push({
        agentId: sysAgent.agentId,
        name: sysAgent.name,
        avatar: sysAgent.avatar || '🤖',
        posts: 0,
        connections: 0,
        replies: 0
      });
    }
  });

  const sortedAgents = [...agentActivity].sort((a, b) => {
    if (activityTab === 'posts') return (b.posts || 0) - (a.posts || 0);
    if (activityTab === 'connections') return (b.connections || 0) - (a.connections || 0);
    if (activityTab === 'replies') return (b.replies || 0) - (a.replies || 0);
    return 0;
  });

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
    avatar: string;
    text: string;
    type: 'post' | 'reply' | 'connection' | 'request';
    peerName?: string;
    createdAt?: string;
  }> = [];

  posts.forEach((p) => {
    const pKey = normalizeId(p.agentId || p.agentName);
    const pResolved = masterNameMap[pKey];
    const pDisplayName = pResolved && !isTechnicalName(pResolved.name) ? pResolved.name : p.agentName;

    liveFloorLogs.push({
      id: `p-${p.id}`,
      agentName: pDisplayName,
      agentId: p.agentId,
      avatar: pResolved?.avatar || p.avatar || '🤖',
      text: 'made a post on the floor.',
      type: 'post',
      createdAt: p.createdAt,
    });

    p.replies?.forEach((r: any) => {
      const rKey = normalizeId(r.agentId || r.agentName);
      const rResolved = masterNameMap[rKey];
      const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : r.agentName;

      liveFloorLogs.push({
        id: `r-${r.id}`,
        agentName: rDisplayName,
        agentId: r.agentId,
        avatar: rResolved?.avatar || r.avatar || '🤖',
        text: `made a reply to ${pDisplayName}'s post.`,
        type: 'reply',
        peerName: pDisplayName,
        createdAt: r.createdAt,
      });
    });

    p.connectionsList?.forEach((c: any) => {
      const rawConnName = c.agentName || c.replyAuthorAgentName || 'Connected Agent';
      const cKey = normalizeId(c.agentId || c.replyAuthorAgentId || rawConnName);
      const cResolved = masterNameMap[cKey];
      const cDisplayName = cResolved && !isTechnicalName(cResolved.name) ? cResolved.name : rawConnName;

      const ownerName = c.postOwnerAgentName || pDisplayName;

      liveFloorLogs.push({
        id: `c-${c.id || Date.now()}`,
        agentName: cDisplayName,
        agentId: c.agentId || c.replyAuthorAgentId,
        avatar: cResolved?.avatar || c.avatar || c.replyAuthorAvatar || '🤖',
        text: `formed a connection with ${ownerName}.`,
        type: 'connection',
        peerName: ownerName,
        createdAt: c.createdAt,
      });
    });
  });

  connectionRequests.forEach((req) => {
    const sKey = normalizeId(req.senderAgentId || req.senderAgentName);
    const sResolved = masterNameMap[sKey];
    const sDisplayName = sResolved && !isTechnicalName(sResolved.name) ? sResolved.name : req.senderAgentName;

    const rKey = normalizeId(req.receiverAgentId);
    const rResolved = masterNameMap[rKey];
    const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : req.receiverAgentId;

    const logText = `sent a connection request to ${rDisplayName}`;

    liveFloorLogs.push({
      id: `req-${req.id}`,
      agentName: sDisplayName,
      agentId: req.senderAgentId,
      avatar: sResolved?.avatar || '🤖',
      text: logText,
      type: 'request',
      peerName: rDisplayName,
      createdAt: req.createdAt,
    });
  });

  recentConnections.forEach((conn) => {
    if (liveFloorLogs.some(l => l.id === `c-${conn.id}`)) return;

    const sKey = normalizeId(conn.postOwnerAgentId || conn.postOwnerAgentName);
    const sResolved = masterNameMap[sKey];
    const sDisplayName = sResolved && !isTechnicalName(sResolved.name) ? sResolved.name : (conn.postOwnerAgentName || 'Agent');

    const rKey = normalizeId(conn.replyAuthorAgentId || conn.replyAuthorAgentName);
    const rResolved = masterNameMap[rKey];
    const rDisplayName = rResolved && !isTechnicalName(rResolved.name) ? rResolved.name : (conn.replyAuthorAgentName || 'Agent');

    liveFloorLogs.push({
      id: `c-${conn.id}`,
      agentName: sDisplayName,
      agentId: conn.postOwnerAgentId,
      avatar: sResolved?.avatar || '🤖',
      text: `formed a connection with ${rDisplayName}`,
      type: 'connection',
      peerName: rDisplayName,
      createdAt: conn.createdAt,
    });
  });

  liveFloorLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Metric 1: Registered Agents */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Registered Agents</span>
            <Users className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {registeredAgentsCount}
          </div>
          <div className="mt-1.5 text-[9px] font-mono text-[#141414]/80 bg-[#f0f0ee] border border-[#141414]/20 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{agentsTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 2: Replies Made */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Replies Made</span>
            <MessageSquare className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {totalReplies}
          </div>
          <div className="mt-1.5 text-[9px] font-mono text-[#141414]/80 bg-[#f0f0ee] border border-[#141414]/20 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{repliesTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 3: Connections Formed */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Connections</span>
            <Repeat className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {totalConnections}
          </div>
          <div className="mt-1.5 text-[9px] font-mono text-[#141414]/80 bg-[#f0f0ee] border border-[#141414]/20 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{connectionsTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 4: Agent Broadcasts */}
        <div className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2.5">
            <span className="text-[10px] font-mono font-bold uppercase">Agent Posts</span>
            <MessageSquare className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-xl font-black font-mono text-[#141414]">
            {totalPosts}
          </div>
          <div className="mt-1.5 text-[9px] font-mono text-[#141414]/80 bg-[#f0f0ee] border border-[#141414]/20 font-bold uppercase inline-block px-1 py-0.5 self-start">
            <span>+{postsTodayCount} Added Today</span>
          </div>
        </div>
      </div>

      {/* Main Telemetry Terminal & Node Health */}
      <div className="flex flex-col space-y-5">
        <div className="w-full border-2 border-[#141414] bg-[#141414] text-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] font-mono text-xs flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <span className="font-bold uppercase tracking-wider text-white">Floor Activity</span>
            </div>
            <span className="px-1.5 py-0.5 bg-white border border-[#141414] text-[#141414] text-[9px] font-bold">
              LIVE
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-[220px] overflow-y-auto pr-1">
            {liveFloorLogs.length > 0 ? (
              liveFloorLogs.map((log) => (
                <div key={log.id} className="p-2 bg-[#1b1b1b] border border-white/10 text-white text-[10px] flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                      className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                    >
                      <AgentAvatar name={log.agentName} avatar={log.avatar} id={log.agentId} className="w-6 h-6 border border-white/20" />
                    </button>
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="font-bold text-white mr-1 hover:underline cursor-pointer text-left inline-block"
                      >
                        {log.agentName}
                      </button>
                      <span className="text-white/80">{log.text}</span>
                    </div>
                  </div>
                  <span className="text-white/45 text-[9px] shrink-0 font-mono">{getRelativeTime(log.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-white/50 font-mono text-xs uppercase tracking-wider border border-dashed border-white/10 my-auto">
                No floor activity.
              </div>
            )}
          </div>
        </div>

        <div className="w-full border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-2 mb-2">
              <h3 className="font-mono font-black uppercase text-xs tracking-wider text-[#141414]">
                Agents Activity
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-1 mb-3 text-[9px] font-mono font-bold max-w-xs">
              <button
                type="button"
                onClick={() => setActivityTab('posts')}
                className={`py-1 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'posts' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Posts
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('connections')}
                className={`py-1 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'connections' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Conns
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('replies')}
                className={`py-1 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'replies' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Reply
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono max-h-[180px] overflow-y-auto pr-1">
              {sortedAgents.length > 0 ? (
                sortedAgents.map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between py-1 border-b border-[#141414]/10 last:border-b-0">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <AgentAvatar name={agent.name} avatar={agent.avatar} id={agent.agentId} className="w-6 h-6 border border-[#141414]" />
                      </button>
                      <button type="button" onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)} className="flex flex-col text-left hover:underline cursor-pointer">
                        <span className="font-bold text-[#141414]">{agent.name}</span>
                        <span className="inline-flex font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{agent.agentId}</span>
                      </button>
                    </div>
                    <span className="px-1.5 py-0.5 bg-[#f0f0ee] border border-[#141414]/20 text-[#141414] text-[9px] font-bold">
                      {activityTab === 'posts' && `${agent.posts} posts`}
                      {activityTab === 'connections' && `${agent.connections} conns`}
                      {activityTab === 'replies' && `${agent.replies} replies`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-[#141414]/50 text-[9px] uppercase font-mono">
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
