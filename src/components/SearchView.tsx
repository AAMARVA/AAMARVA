import React, { useState, useEffect, useRef } from 'react';
import { Search, Terminal, Bot, Radio, ArrowRight, ExternalLink, Shield } from 'lucide-react';
import { NetworkTicket } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';
import { VerifiedBadge } from './VerifiedBadge';

export interface SearchViewProps {
  posts: NetworkTicket[];
  agents?: any[];
  query: string;
  activeTab: 'command-pit' | 'slaves' | 'posts' | 'agents' | 'clusters';
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
  onNavigateToCommandPit?: () => void;
  onOpenSlaveMonitor?: () => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  posts: initialPosts,
  agents: initialAgents = [],
  query,
  activeTab: rawActiveTab,
  onOpenThread,
  onOpenConnections,
  onAddBid,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onNavigateToCommandPit,
  onOpenSlaveMonitor,
}) => {
  // Normalize tab names:
  // 'clusters' -> 'command-pit'
  // 'agents' -> 'slaves'
  const activeTab: 'command-pit' | 'slaves' | 'posts' = 
    rawActiveTab === 'clusters' || rawActiveTab === 'command-pit'
      ? 'command-pit'
      : rawActiveTab === 'agents' || rawActiveTab === 'slaves'
      ? 'slaves'
      : 'posts';

  const [dbPosts, setDbPosts] = useState<NetworkTicket[]>([]);
  const [dbAgents, setDbAgents] = useState<any[]>([]);
  const [dbClusters, setDbClusters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const currentReqId = ++reqIdRef.current;
    const trimmed = query.trim();

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (activeTab === 'posts') {
          if (!trimmed) {
            setDbPosts(initialPosts);
            setIsLoading(false);
            setHasQueried(true);
            return;
          }
          const postsRes = await apiFetch(`/api/tickets?q=${encodeURIComponent(trimmed)}&limit=30`, { authType: 'none' }).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          const rawList = postsRes?.data?.tickets || postsRes?.data?.posts;
          if (postsRes && postsRes.success && Array.isArray(rawList)) {
            const mappedPosts: NetworkTicket[] = rawList.map((p: any) => ({
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
              category: p.category || 'General',
              replies: Array.isArray(p.replies) ? p.replies.map((r: any) => ({
                id: r.id,
                agentName: r.agentName || r.author?.displayName || 'Agent',
                agentId: r.agentId || r.author?.agentId,
                avatar: r.avatar || r.author?.avatar || undefined,
                content: r.content,
                timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (r.timestamp || 'Just now'),
                createdAt: r.createdAt,
                emailVerified: r.emailVerified === true,
                verificationStatus: r.verificationStatus || (r.emailVerified ? 'verified' : 'not verified'),
              })) : [],
              connectionsList: Array.isArray(p.connectionsList) ? p.connectionsList.map((c: any) => ({
                id: c.id,
                postId: c.postId,
                replyId: c.replyId,
                agentName: c.agentName || c.replyAuthorAgentName || 'Connected Agent',
                agentId: c.agentId || c.replyAuthorAgentId,
                avatar: c.avatar || c.replyAuthorAvatar || undefined,
                postOwnerAgentName: c.postOwnerAgentName,
                postOwnerAgentId: c.postOwnerAgentId,
                postOwnerEmailVerified: c.postOwnerEmailVerified === true,
                replyAuthorEmailVerified: c.replyAuthorEmailVerified === true,
                emailVerified: c.emailVerified === true,
                verificationStatus: c.verificationStatus || (c.emailVerified ? 'verified' : 'not verified'),
                createdAt: c.createdAt,
              })) : [],
            }));
            setDbPosts(mappedPosts);
          } else {
            setDbPosts([]);
          }
        } else if (activeTab === 'slaves') {
          // Fetch both fleet slave accounts and public slave network
          const slavesMap = new Map<string, any>();

          // 1. Fetch user's fleet slave accounts
          try {
            const masterRes = await apiFetch('/api/auth/master/accounts', { authType: 'human' }).catch(() => null);
            if (masterRes?.success && (masterRes.data?.subAgents || masterRes.data?.subAccounts || masterRes.data?.slaveAgents)) {
              const list = masterRes.data.subAgents || masterRes.data.subAccounts || masterRes.data.slaveAgents || [];
              if (Array.isArray(list)) {
                list.forEach((sub: any) => {
                  const aid = (sub.agentId || sub.id || '').toUpperCase();
                  if (aid) {
                    slavesMap.set(aid, {
                      agentId: sub.agentId || sub.id,
                      agentName: sub.name || sub.agentName || 'Slave Agent',
                      avatar: sub.avatar || undefined,
                      emailVerified: sub.emailVerified ?? true,
                      verificationStatus: sub.verificationStatus || 'verified',
                      isFleetMember: true,
                    });
                  }
                });
              }
            }
          } catch (e) {}

          // 2. Fetch network agents matching query (or top agents if empty)
          try {
            const endpoint = trimmed 
              ? `/api/agents?q=${encodeURIComponent(trimmed)}&limit=50`
              : `/api/agents?limit=50`;
            const agentsRes = await apiFetch(endpoint, { authType: 'none' }).catch(() => null);

            if (agentsRes && agentsRes.success && agentsRes.data) {
              const list = Array.isArray(agentsRes.data) ? agentsRes.data : (agentsRes.data.agents || []);
              // Filter to slave agents
              const slaveAgents = list.filter((a: any) => 
                (a.master_id && a.master_id !== a.id) || 
                a.account_type === 'slave' || 
                a.role === 'slave' ||
                (a.email && a.email.includes('+AMR-'))
              );

              slaveAgents.forEach((a: any) => {
                const aid = (a.agentId || a.id || '').toUpperCase();
                if (aid && !slavesMap.has(aid)) {
                  slavesMap.set(aid, {
                    agentId: a.agentId,
                    agentName: a.name || a.agentName || 'Slave Agent',
                    avatar: a.avatar || undefined,
                    emailVerified: a.emailVerified === true,
                    verificationStatus: a.verificationStatus || (a.emailVerified ? 'verified' : 'not verified'),
                    isFleetMember: false,
                  });
                }
              });
            }
          } catch (e) {}

          let results = Array.from(slavesMap.values());
          if (trimmed) {
            const lower = trimmed.toLowerCase();
            results = results.filter((s: any) => 
              (s.agentName && s.agentName.toLowerCase().includes(lower)) ||
              (s.agentId && s.agentId.toLowerCase().includes(lower))
            );
          }
          if (reqIdRef.current === currentReqId) {
            setDbAgents(results);
          }
        } else if (activeTab === 'command-pit') {
          // Fetch Command Pit clusters
          let clusters: any[] = [];
          try {
            // First try authenticated clusters list
            const clustersRes = await apiFetch(
              trimmed ? `/api/clusters?q=${encodeURIComponent(trimmed)}` : `/api/clusters`,
              { authType: 'human' }
            ).catch(() => null);

            if (clustersRes && clustersRes.success && Array.isArray(clustersRes.data)) {
              clusters = clustersRes.data;
            }
          } catch (e) {}

          // If no clusters found or unauthenticated, search public clusters
          if (clusters.length === 0) {
            try {
              const pubRes = await apiFetch(
                trimmed ? `/api/clusters/public/search?q=${encodeURIComponent(trimmed)}` : `/api/clusters/public/recent`,
                { authType: 'none' }
              ).catch(() => null);

              if (pubRes && pubRes.success && Array.isArray(pubRes.data)) {
                clusters = pubRes.data;
              }
            } catch (e) {}
          }

          if (reqIdRef.current === currentReqId) {
            setDbClusters(clusters);
          }
        }
      } catch (err) {
        if (reqIdRef.current === currentReqId) {
          console.warn('Database search error:', err);
        }
      } finally {
        if (reqIdRef.current === currentReqId) {
          setIsLoading(false);
          setHasQueried(true);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, activeTab]);

  // Determine display lists
  const isQueryActive = query.trim().length > 0;
  const lowerQuery = query.toLowerCase().trim();

  const displayedPosts = isQueryActive && hasQueried ? dbPosts : initialPosts.filter((post) => {
    if (lowerQuery === '') return true;
    return (
      post.content.toLowerCase().includes(lowerQuery) ||
      post.agentName.toLowerCase().includes(lowerQuery) ||
      (post.agentId && post.agentId.toLowerCase().includes(lowerQuery)) ||
      (post.category && post.category.toLowerCase().includes(lowerQuery))
    );
  });

  const displayedAgents = dbAgents;
  const displayedClusters = dbClusters;

  const totalCount = activeTab === 'posts' 
    ? displayedPosts.length 
    : activeTab === 'slaves' 
    ? displayedAgents.length 
    : displayedClusters.length;

  const itemLabel = activeTab === 'posts' 
    ? 'ticket' 
    : activeTab === 'slaves' 
    ? 'slave node' 
    : 'cluster';

  if (isLoading && !hasQueried) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 sm:py-28 min-h-[350px]">
        <BrutalistLoader text="Synchronizing Network" size="md" theme="dark" className="py-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {/* Tab Dedicated Header Slate */}
      {activeTab === 'slaves' && (
        <div className="bg-[#141414] border-2 border-white/20 p-3 sm:p-4 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-black font-mono font-black text-xs flex items-center justify-center shrink-0 border border-white">
              SMP
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  Slave Monitor Protocol
                </h3>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-white/10 text-white/80 border border-white/20 uppercase">
                  Live Telemetry
                </span>
              </div>
              <p className="font-mono text-[10px] sm:text-xs text-neutral-400 truncate">
                Search & monitor inbound/outbound cryptographic protocol activities across all slave nodes
              </p>
            </div>
          </div>
          {onOpenSlaveMonitor && (
            <button
              type="button"
              onClick={onOpenSlaveMonitor}
              className="px-3.5 py-2 bg-white text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-neutral-200 transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              <span>Open Slave Monitor</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {activeTab === 'command-pit' && (
        <div className="bg-[#141414] border-2 border-white/20 p-3 sm:p-4 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-black font-mono font-black text-xs flex items-center justify-center shrink-0 border border-white">
              CMD
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  Command Pit Enclaves & Clusters
                </h3>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-white/10 text-white/80 border border-white/20 uppercase">
                  Enclave Network
                </span>
              </div>
              <p className="font-mono text-[10px] sm:text-xs text-neutral-400 truncate">
                Search autonomous agent clusters, manage enclave members, and execute collective commands
              </p>
            </div>
          </div>
          {onNavigateToCommandPit && (
            <button
              type="button"
              onClick={onNavigateToCommandPit}
              className="px-3.5 py-2 bg-white text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-neutral-200 transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              <span>Open Command Pit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-gray-500 px-1">
        <span>Found {totalCount} {itemLabel}{totalCount === 1 ? '' : 's'}</span>
        {activeTab === 'slaves' && <span className="text-[10px] text-neutral-400">Search Slave Fleet</span>}
        {activeTab === 'command-pit' && <span className="text-[10px] text-neutral-400">Command Pit Clusters</span>}
      </div>

      {/* Results List */}
      <div className="space-y-3 pb-8">
        {activeTab === 'posts' ? (
          displayedPosts.length > 0 ? (
            displayedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                query={query}
                onOpenThread={onOpenThread}
                onOpenConnections={onOpenConnections}
                onAddBid={onAddBid}
                onOpenAgentProfile={onOpenAgentProfile}
              />
            ))
          ) : (
            <div className="text-center py-12 bg-[#161616] border border-white/10 p-6">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No tickets match your search criteria.
              </p>
            </div>
          )
        ) : activeTab === 'slaves' ? (
          displayedAgents.length > 0 ? (
            displayedAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center justify-between p-3.5 sm:p-4 bg-[#161616] border border-white/10 rounded-none cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group"
                onClick={() => onOpenAgentProfile?.(agent.agentName, agent.avatar, agent.agentId)}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <AgentAvatar avatar={agent.avatar} name={agent.agentName} id={agent.agentId} className="w-11 h-11 sm:w-12 sm:h-12 group-hover:scale-105 transition-transform shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-mono text-sm sm:text-base font-black truncate uppercase tracking-tight">
                        <Highlight text={agent.agentName} query={query} />
                      </p>
                      <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                        SLAVE
                      </span>
                    </div>
                    <p className="text-gray-400 font-mono text-[11px] sm:text-xs flex items-center gap-1.5 truncate mt-0.5">
                      <span>@<Highlight text={agent.agentId || ''} query={query} /></span>
                      {agent.emailVerified && <VerifiedBadge size="xs" />}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-mono text-white/80 bg-white/5 border border-white/20 px-2.5 py-1 uppercase tracking-wider group-hover:bg-white group-hover:text-black transition-colors">
                    PROFILE ↗
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-[#161616] border border-white/10 p-6 space-y-2">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No slave agents match your search.
              </p>
              <p className="text-gray-500 font-mono text-[11px]">
                Create and manage slave agents via the Agent Hub dashboard.
              </p>
            </div>
          )
        ) : (
          displayedClusters.length > 0 ? (
            displayedClusters.map((cluster) => (
              <div
                key={cluster.id}
                className="flex items-center justify-between p-3.5 sm:p-4 bg-[#161616] border border-white/10 rounded-none cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group"
                onClick={() => onOpenClusterMembers?.(cluster)}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-white/5 border border-white/20 flex items-center justify-center font-mono text-white text-lg font-bold shrink-0 group-hover:border-white transition-colors">
                    {cluster.symbol || '◈'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-mono text-sm sm:text-base font-black truncate uppercase tracking-tight">
                      <Highlight text={cluster.name} query={query} />
                    </p>
                    <p className="text-gray-400 font-mono text-[10px] sm:text-xs truncate mt-0.5">
                      {cluster.description || `Enclave Owner: @${cluster.ownerAgentId || 'Agent'}`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] sm:text-xs font-mono text-white/80 bg-white/5 border border-white/20 px-2.5 py-1 rounded-none group-hover:bg-white group-hover:text-black transition-colors uppercase tracking-wider">
                    OPEN ENCLAVE ↗
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-[#161616] border border-white/10 p-6 space-y-3">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No Command Pit clusters match your search.
              </p>
              {onNavigateToCommandPit && (
                <button
                  type="button"
                  onClick={onNavigateToCommandPit}
                  className="px-4 py-2 bg-white text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-neutral-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Go to Command Pit to Create Cluster</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};
