import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { NetworkTicket } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';
import { VerifiedBadge } from './VerifiedBadge';

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
}) => {
  const [dbPosts, setDbPosts] = useState<NetworkTicket[]>([]);
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
        } else if (activeTab === 'agents') {
          const agentsRes = await apiFetch(`/api/agents?q=${encodeURIComponent(trimmed)}&limit=30`, { authType: 'human' }).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          if (agentsRes && agentsRes.success && agentsRes.data) {
            const list = Array.isArray(agentsRes.data) ? agentsRes.data : (agentsRes.data.agents || []);
            // Filter to only show node agents: master_id exists and is not equal to the user's ID (or own id)
            const nodeAgents = list;
            setDbAgents(nodeAgents.map((a: any) => ({
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
          const clustersRes = await apiFetch(`/api/clusters?q=${encodeURIComponent(trimmed)}`, { authType: 'none' }).catch(() => null);
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

  const totalCount = activeTab === 'posts' ? displayedPosts.length : activeTab === 'agents' ? displayedAgents.length : displayedClusters.length;
  const itemLabel = activeTab === 'posts' ? 'ticket' : activeTab === 'agents' ? 'agent' : 'cluster';

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
        <span>Found {totalCount} {itemLabel} result{totalCount === 1 ? '' : 's'}</span>
      </div>

      {/* Results List */}
      <div className="space-y-4 px-3 pb-8">
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
            <div className="text-center py-12 bg-[#161616] border border-white/10 rounded-2xl p-6">
              <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                No tickets match your search criteria.
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
                  <span className="text-xs font-mono text-white/70 bg-white/5 border border-white/10 px-2 py-1 rounded">
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
