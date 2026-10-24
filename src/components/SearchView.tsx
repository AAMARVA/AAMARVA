import React, { useState, useEffect, useRef } from 'react';
import { Search, Server, Wrench } from 'lucide-react';
import { NetworkTicket } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';
import { VerifiedBadge } from './VerifiedBadge';
import { useAuth } from '../context/AuthContext';

interface SearchViewProps {
  posts: NetworkTicket[];
  agents?: any[];
  query: string;
  activeTab: 'agents' | 'clusters' | 'posts';
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  posts: initialPosts,
  agents: initialAgents = [],
  query,
  activeTab,
  onOpenThread,
  onOpenConnections,
  onAddBid,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenClusterChat,
}) => {
  const { activeAccount } = useAuth();
  const [dbPosts, setDbPosts] = useState<NetworkTicket[]>([]);
  const [dbMcpServers, setDbMcpServers] = useState<any[]>([]);
  const [dbAgents, setDbAgents] = useState<any[]>([]);
  const [dbClusters, setDbClusters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const currentReqId = ++reqIdRef.current;
    const trimmed = query.trim();
    if (!trimmed) {
      setIsLoading(false);
      setHasQueried(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (activeTab === 'posts') {
          // Search MCP Servers and Tools
          try {
            const serversRes = await apiFetch('/api/floor/servers', { authType: 'human' }).catch(() => null);
            if (reqIdRef.current !== currentReqId) return;
            if (serversRes && serversRes.success && Array.isArray(serversRes.data)) {
              const q = trimmed.toLowerCase();
              const matched = serversRes.data.filter((s: any) => {
                return (
                  s.name?.toLowerCase().includes(q) ||
                  s.description?.toLowerCase().includes(q) ||
                  s.endpoint?.toLowerCase().includes(q)
                );
              });
              setDbMcpServers(matched);
            } else {
              setDbMcpServers([]);
            }
          } catch {
            setDbMcpServers([]);
          }
        } else if (activeTab === 'agents') {
          const agentsRes = await apiFetch(`/api/agents?q=${encodeURIComponent(trimmed)}&limit=30`, { authType: 'human' }).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          if (agentsRes && agentsRes.success && agentsRes.data) {
            const list = Array.isArray(agentsRes.data) ? agentsRes.data : (agentsRes.data.agents || []);
            // Filter to only show slave agents: master_id exists and is not equal to the user's ID (or own id)
            const slaveAgents = list;
            setDbAgents(slaveAgents.map((a: any) => ({
              agentId: a.agentId,
              agentName: a.name || a.agentName,
              avatar: a.avatar || undefined,
              emailVerified: a.emailVerified === true,
              verificationStatus: a.verificationStatus || (a.emailVerified ? 'verified' : 'not verified'),
            })));
          } else {
            setDbAgents([]);
          }
        } else if (activeTab === 'clusters') {
          // Add fleet filter if user is a sub-account
          const fleetId = activeAccount?.agentId || activeAccount?.id;
          const fleetFilter = fleetId ? `&fleetId=${encodeURIComponent(fleetId)}` : '';
          const clustersRes = await apiFetch(`/api/clusters/public/recent?q=${encodeURIComponent(trimmed)}${fleetFilter}`, { authType: 'human' }).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          if (clustersRes && clustersRes.success && Array.isArray(clustersRes.data)) {
            setDbClusters(clustersRes.data);
          } else {
            setDbClusters([]);
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
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeTab, activeAccount]);

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

  const displayedAgents = isQueryActive && hasQueried ? dbAgents : (() => {
    const allAgentsMap = new Map<string, any>();
    initialAgents.forEach(a => {
      if (a.agentId) {
        allAgentsMap.set(a.agentId.toUpperCase(), {
          agentId: a.agentId,
          agentName: a.name || a.agentName,
          avatar: a.avatar || undefined,
          emailVerified: a.emailVerified,
        });
      }
    });
    initialPosts.forEach(p => {
      if (p.agentId && !allAgentsMap.has(p.agentId.toUpperCase())) {
        allAgentsMap.set(p.agentId.toUpperCase(), {
          agentId: p.agentId,
          agentName: p.agentName,
          avatar: p.avatar || undefined,
          emailVerified: p.emailVerified,
        });
      }
    });
    return Array.from(allAgentsMap.values()).filter(agent => {
      if (lowerQuery === '') return true;
      return (
        (agent.agentName && agent.agentName.toLowerCase().includes(lowerQuery)) ||
        (agent.agentId && agent.agentId.toLowerCase().includes(lowerQuery))
      );
    });
  })();

  const displayedClusters = isQueryActive && hasQueried ? dbClusters : [];
  const displayedMcp = isQueryActive && hasQueried ? dbMcpServers : [];

  const totalCount = activeTab === 'posts' ? (displayedMcp.length || displayedPosts.length) : activeTab === 'agents' ? displayedAgents.length : displayedClusters.length;
  const itemLabel = activeTab === 'posts' ? 'tools & mcp' : activeTab === 'agents' ? 'agent' : 'cluster';

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 sm:py-28 min-h-[350px]">
        <BrutalistLoader text="Synchronizing" size="md" theme="dark" className="py-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {/* Results Header */}
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-gray-500 px-3">
        <span>Found {totalCount} {itemLabel} {activeTab === 'posts' ? 'results' : `result${totalCount === 1 ? '' : 's'}`}</span>
      </div>

      {/* Results List */}
      <div className="space-y-4 px-3 pb-8">
        {activeTab === 'posts' ? (
          displayedMcp.length > 0 ? (
            displayedMcp.map((srv) => (
              <div
                key={srv.id}
                className="flex items-center justify-between p-4 bg-[#161616] border border-white/10 rounded-2xl transition-all group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-mono text-white text-lg font-bold shrink-0">
                    <Server className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-mono text-sm sm:text-base font-black truncate uppercase tracking-tight">
                        <Highlight text={srv.name} query={query} />
                      </p>
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 border border-white/30 bg-white/10 text-white">
                        {srv.status || 'CONNECTED'}
                      </span>
                    </div>
                    <p className="text-gray-500 font-mono text-[10px] sm:text-xs truncate">
                      <Highlight text={srv.endpoint} query={query} />
                      {srv.description ? ` • ${srv.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-white/70 bg-white/5 border border-white/10 px-2.5 py-1 rounded inline-flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    {srv.tools_count || 0} TOOLS
                  </span>
                </div>
              </div>
            ))
          ) : displayedPosts.length > 0 ? (
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
            <div className="text-center py-12 bg-[#161616] border border-white/10 rounded-2xl p-6">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No tools & mcp match your search criteria.
              </p>
            </div>
          )
        ) : activeTab === 'agents' ? (
          displayedAgents.length > 0 ? (
            displayedAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-4 p-4 bg-[#161616] border border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all group"
                onClick={() => onOpenAgentProfile?.(agent.agentName, agent.avatar, agent.agentId)}
              >
                <AgentAvatar avatar={agent.avatar} name={agent.agentName} id={agent.agentId} className="w-12 h-12 sm:w-14 sm:h-14 group-hover:scale-105 transition-transform" />
                <div className="min-w-0">
                  <p className="text-white font-mono text-sm sm:text-base font-black truncate uppercase tracking-tight">
                    <span className="inline-block"><Highlight text={agent.agentName} query={query} /></span>
                  </p>
                  <p className="text-gray-500 font-mono text-[10px] sm:text-xs flex items-center gap-1 truncate">
                    <span>@<Highlight text={agent.agentId || ''} query={query} /></span>
                    {agent.emailVerified && <VerifiedBadge size="xs" />}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-[#161616] border border-white/10 rounded-2xl p-6">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No agents match your search.
              </p>
            </div>
          )
        ) : (
          displayedClusters.length > 0 ? (
            displayedClusters.map((cluster) => (
              <div
                key={cluster.id}
                className="flex items-center justify-between p-4 bg-[#161616] border border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all group"
                onClick={() => onOpenClusterMembers?.(cluster)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-mono text-white text-lg font-bold shrink-0">
                    {cluster.symbol || '◈'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-mono text-sm sm:text-base font-black truncate uppercase tracking-tight">
                      <Highlight text={cluster.name} query={query} />
                    </p>
                    <p className="text-gray-500 font-mono text-[10px] sm:text-xs truncate">
                      {cluster.description || `Owner: @${cluster.ownerAgentId || 'Agent'}`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenClusterChat?.({ id: cluster.id, name: cluster.name });
                    }}
                    className="text-xs font-mono text-white/70 bg-white/5 border border-white/10 px-2 py-1 rounded cursor-pointer hover:bg-white hover:text-black transition-all inline-block"
                  >
                    OPEN CLUSTER
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-[#161616] border border-white/10 rounded-2xl p-6">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No clusters match your search.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
};
