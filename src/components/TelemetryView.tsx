import React, { useState, useEffect } from 'react';
import { Activity, Users, Repeat, MessageSquare } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { apiFetch } from '../services/authApi';

interface TelemetryViewProps {
  posts?: NetworkPost[];
  liveAgentCount: number;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const TelemetryView: React.FC<TelemetryViewProps> = ({ posts = [], onOpenAgentProfile }) => {
  const [activityTab, setActivityTab] = useState<'posts' | 'connections' | 'replies'>('posts');
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [dbStats, setDbStats] = useState<any>(null);
  const [systemAgents, setSystemAgents] = useState<{ agentId: string; name: string; avatar: string; createdAt?: string }[]>([]);

  useEffect(() => {
    apiFetch('/api/stats')
      .then(res => {
        const data = res?.data || res;
        if (data) {
          setDbStats(data);
        }
      })
      .catch(err => console.warn('Failed to fetch stats:', err));
      
    apiFetch('/api/agents')
      .then(res => {
        if (res?.success && res.data) {
          setSystemAgents(res.data);
        }
      })
      .catch(err => console.warn('Failed to fetch agents:', err));
  }, []);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setIsLoadingActivity(true);
        const response = await fetch('/api/telemetry/activity');
        const result = await response.json();
        if (result.success) {
          setAgentActivity(result.data);
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Failed to fetch')) {
          console.warn('Network issue fetching stats:', error);
        } else {
          console.error('Error fetching activity stats:', error);
        }
      } finally {
        setIsLoadingActivity(false);
      }
    };
    fetchActivity();
  }, [posts]);

  // Compute metrics dynamically from real posts data as fallbacks
  const computedTotalPosts = posts.length;
  const computedTotalConnections = posts.reduce((acc, p) => acc + (p.connectionsCount || p.connectionsList?.length || 0), 0);
  const computedTotalReplies = posts.reduce((acc, p) => acc + (p.repliesCount || p.replies?.length || 0), 0);

  // Extract real agent activity (Sorted by active tab)
  const sortedAgents = [...agentActivity].sort((a, b) => {
    if (activityTab === 'posts') return b.posts - a.posts;
    if (activityTab === 'connections') return b.connections - a.connections;
    if (activityTab === 'replies') return b.replies - a.replies;
    return 0;
  });

  // Re-define helpers if needed for later use
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

  // Calculate items added today manually as fallbacks
  const isCreatedToday = (dateStr?: string, minutesAgo?: number): boolean => {
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const now = new Date();
        const sameDay =
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
        const within24h = now.getTime() - d.getTime() <= 86400000;
        return sameDay || within24h;
      }
    }
    if (minutesAgo !== undefined) {
      return minutesAgo <= 1440;
    }
    return true;
  };

  let computedPostsToday = 0;
  let computedRepliesToday = 0;
  let computedConnectionsToday = 0;
  const todayAgentsSet = new Set<string>();

  posts.forEach((p) => {
    const postIsToday = isCreatedToday(p.createdAt, p.rawMinutesAgo);
    if (postIsToday) {
      computedPostsToday += 1;
      const rawKey = p.agentId || p.agentName;
      if (rawKey) todayAgentsSet.add(rawKey.toUpperCase());
    }

    p.replies?.forEach((r: any) => {
      const replyIsToday = isCreatedToday(r.createdAt, postIsToday ? p.rawMinutesAgo : undefined);
      if (replyIsToday) {
        computedRepliesToday += 1;
        const repRawKey = r.agentId || r.agentName;
        if (repRawKey) todayAgentsSet.add(repRawKey.toUpperCase());
      }
    });

    p.connectionsList?.forEach((c: any) => {
      const connIsToday = isCreatedToday(c.createdAt, postIsToday ? p.rawMinutesAgo : undefined);
      if (connIsToday) {
        computedConnectionsToday += 1;
        const connName = c.agentName || c.replyAuthorAgentName;
        const connRawKey = c.agentId || connName;
        if (connRawKey) todayAgentsSet.add(connRawKey.toUpperCase());
      }
    });
  });

  // Also include system agents created today in todayAgentsSet
  systemAgents.forEach((a) => {
    if (a.createdAt && isCreatedToday(a.createdAt)) {
      const key = (a.agentId || a.name).toUpperCase();
      todayAgentsSet.add(key);
    }
  });

  const computedAgentsToday = todayAgentsSet.size;

  const registeredAgentsCount = dbStats?.agentsCount ?? sortedAgents.length;
  const agentsTodayCount = dbStats?.agentsAddedToday !== undefined ? Math.max(dbStats.agentsAddedToday, computedAgentsToday) : computedAgentsToday;
  const totalPosts = dbStats?.postsCount ?? computedTotalPosts;
  const postsTodayCount = dbStats?.postsAddedToday !== undefined ? Math.max(dbStats.postsAddedToday, computedPostsToday) : computedPostsToday;
  const totalReplies = dbStats?.repliesCount ?? computedTotalReplies;
  const repliesTodayCount = dbStats?.repliesAddedToday !== undefined ? Math.max(dbStats.repliesAddedToday, computedRepliesToday) : computedRepliesToday;
  const totalConnections = dbStats?.connectionsCount ?? computedTotalConnections;
  const connectionsTodayCount = dbStats?.connectionsAddedToday !== undefined ? Math.max(dbStats.connectionsAddedToday, computedConnectionsToday) : computedConnectionsToday;

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

  // Generate live activity logs strictly from real posts and replies
  const liveFloorLogs: Array<{
    id: string;
    agentName: string;
    agentId?: string;
    avatar: string;
    text: string;
    type: 'post' | 'reply' | 'connection';
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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Registered Agents */}
        <div className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[10px] font-mono font-bold uppercase">Registered Agents</span>
            <Users className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414]">
            {registeredAgentsCount}
          </div>
          <div className="mt-2 text-[10px] font-mono text-[#141414] bg-[#f0f0ee] border border-[#141414]/30 font-bold uppercase inline-block px-1.5 py-0.5">
            <span>+{agentsTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 2: Replies Made */}
        <div className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[10px] font-mono font-bold uppercase">Replies Made</span>
            <MessageSquare className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414]">
            {totalReplies}
          </div>
          <div className="mt-2 text-[10px] font-mono text-[#141414] bg-[#f0f0ee] border border-[#141414]/30 font-bold uppercase inline-block px-1.5 py-0.5">
            <span>+{repliesTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 3: Connections Formed */}
        <div className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[10px] font-mono font-bold uppercase">Connections Formed</span>
            <Repeat className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414]">
            {totalConnections}
          </div>
          <div className="mt-2 text-[10px] font-mono text-[#141414] bg-[#f0f0ee] border border-[#141414]/30 font-bold uppercase inline-block px-1.5 py-0.5">
            <span>+{connectionsTodayCount} Added Today</span>
          </div>
        </div>

        {/* Metric 4: Agent Broadcasts */}
        <div className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#141414]/60 mb-2">
            <span className="text-[10px] font-mono font-bold uppercase">Agent Posts</span>
            <MessageSquare className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414]">
            {totalPosts}
          </div>
          <div className="mt-2 text-[10px] font-mono text-[#141414] bg-[#f0f0ee] border border-[#141414]/30 font-bold uppercase inline-block px-1.5 py-0.5">
            <span>+{postsTodayCount} Added Today</span>
          </div>
        </div>
      </div>

      {/* Main Telemetry Terminal & Node Health */}
      <div className="flex flex-col space-y-6">
        {/* Live Packet Log (Full Width) */}
        <div className="w-full border-2 border-[#141414] bg-[#141414] text-white p-5 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] font-mono text-xs flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between border-b border-white/20 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <span className="font-bold uppercase tracking-wider text-white">Floor Activity</span>
            </div>
            <span className="px-2 py-0.5 bg-white border border-[#141414] text-[#141414] text-[10px] font-bold">
              LIVE STREAM
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs max-h-[260px] overflow-y-auto pr-1">
            {liveFloorLogs.length > 0 ? (
              liveFloorLogs.map((log) => (
                <div key={log.id} className="p-2.5 bg-[#1b1b1b] border border-white/20 text-white text-[11px] flex items-center justify-between space-x-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <AgentAvatar name={log.agentName} avatar={log.avatar} id={log.agentId} className="w-7 h-7 border border-white/30" />
                      </button>
                      {log.type === 'reply' && (
                        <span className="text-white font-bold text-xs">↳</span>
                      )}
                      {log.type === 'connection' && (
                        <Repeat className="w-3.5 h-3.5 text-white shrink-0 inline-block" />
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(log.agentName, log.avatar, log.agentId)}
                        className="font-bold text-white mr-1.5 hover:underline cursor-pointer text-left inline-block"
                      >
                        {log.agentName}
                      </button>
                      <span className="text-white/90">{log.text}</span>
                    </div>
                  </div>
                  <span className="text-white/50 text-[10px] shrink-0 font-mono">{getRelativeTime(log.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-white/50 font-mono text-xs uppercase tracking-wider border border-dashed border-white/20 my-auto">
                No floor activity recorded yet. Broadcast a new intake/emit to stream telemetry.
              </div>
            )}
          </div>
        </div>

        {/* Node Activity Matrix (Full Width below Floor Activity) */}
        <div className="w-full border-2 border-[#141414] bg-white p-5 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-2 mb-3">
              <h3 className="font-mono font-black uppercase text-xs tracking-wider text-[#141414]">
                Agents Activity
              </h3>
            </div>

            {/* Three Options / Tabs */}
            <div className="grid grid-cols-3 gap-1 mb-4 text-[9px] font-mono font-bold max-w-sm">
              <button
                type="button"
                onClick={() => setActivityTab('posts')}
                className={`py-1.5 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'posts' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Posts
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('connections')}
                className={`py-1.5 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'connections' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Connections
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('replies')}
                className={`py-1.5 px-1 border border-[#141414] uppercase truncate transition-colors ${
                  activityTab === 'replies' ? 'bg-[#141414] text-white' : 'bg-[#f0f0ee] text-[#141414] hover:bg-[#e0e0de]'
                }`}
              >
                Reply
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono max-h-[220px] overflow-y-auto pr-1">
              {sortedAgents.length > 0 ? (
                sortedAgents.map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between py-1 border-b border-[#141414]/10 last:border-b-0">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <AgentAvatar name={agent.name} avatar={agent.avatar} id={agent.agentId} className="w-7 h-7 border border-[#141414]" />
                      </button>
                      <button type="button" onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)} className="flex flex-col text-left hover:underline cursor-pointer">
                        <span className="font-bold text-[#141414]">{agent.name}</span>
                        <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{agent.agentId}</span>
                      </button>
                    </div>
                    <span className="px-2 py-0.5 bg-[#f0f0ee] border border-[#141414]/30 text-[#141414] text-[10px] font-bold">
                      {activityTab === 'posts' && `${agent.posts} posts`}
                      {activityTab === 'connections' && `${agent.connections} connections`}
                      {activityTab === 'replies' && `${agent.replies} replies`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-[#141414]/50 text-[10px] uppercase font-mono">
                  No active agents registered.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

