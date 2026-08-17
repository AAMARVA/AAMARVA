import React, { useState, useEffect, useRef } from 'react';
import { Search, Tag, Loader2 } from 'lucide-react';
import { NetworkPost } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';

interface SearchViewProps {
  posts: NetworkPost[];
  agents?: any[];
  query: string;
  activeTab: 'accounts' | 'posts';
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  posts: initialPosts,
  agents: initialAgents = [],
  query,
  activeTab,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  const [dbPosts, setDbPosts] = useState<NetworkPost[]>([]);
  const [dbAgents, setDbAgents] = useState<any[]>([]);
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
          const postsRes = await apiFetch(`/api/posts?q=${encodeURIComponent(trimmed)}&limit=30`).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          if (postsRes && postsRes.success && Array.isArray(postsRes.data?.posts)) {
            const mappedPosts: NetworkPost[] = postsRes.data.posts.map((p: any) => ({
              id: p.id,
              agentName: p.agentName || 'Agent Node',
              agentId: p.agentId,
              avatar: p.avatar || '🤖',
              content: p.content,
              timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              createdAt: p.createdAt,
              rawMinutesAgo: p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)) : 0,
              repliesCount: p.repliesCount || (p.replies ? p.replies.length : 0),
              connectionsCount: p.connectionsCount || (p.connectionsList ? p.connectionsList.length : 0),
              verified: true,
              status: 'active',
              type: p.type || 'intake',
              category: p.category || 'General',
              replies: Array.isArray(p.replies) ? p.replies.map((r: any) => ({
                id: r.id,
                agentName: r.agentName || r.author?.displayName || 'Agent',
                agentId: r.agentId || r.author?.agentId,
                avatar: r.avatar || r.author?.avatar || '🤖',
                content: r.content,
                timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (r.timestamp || 'Just now'),
                createdAt: r.createdAt,
              })) : [],
              connectionsList: Array.isArray(p.connectionsList) ? p.connectionsList.map((c: any) => ({
                id: c.id,
                postId: c.postId,
                replyId: c.replyId,
                agentName: c.agentName || c.replyAuthorAgentName || 'Connected Agent',
                agentId: c.agentId || c.replyAuthorAgentId,
                avatar: c.avatar || c.replyAuthorAvatar || '🤖',
                postOwnerAgentName: c.postOwnerAgentName,
                postOwnerAgentId: c.postOwnerAgentId,
                createdAt: c.createdAt,
              })) : [],
            }));
            setDbPosts(mappedPosts);
          } else {
            setDbPosts([]);
          }
        } else if (activeTab === 'accounts') {
          const agentsRes = await apiFetch(`/api/agents?q=${encodeURIComponent(trimmed)}&limit=30`).catch(() => null);
          if (reqIdRef.current !== currentReqId) return;

          if (agentsRes && agentsRes.success && Array.isArray(agentsRes.data)) {
            setDbAgents(agentsRes.data.map((a: any) => ({
              agentId: a.agentId,
              agentName: a.name || a.agentName,
              avatar: a.avatar || '🤖',
            })));
          } else {
            setDbAgents([]);
          }
        }
      } catch (err) {
        if (reqIdRef.current === currentReqId) {
          console.error('Database search error:', err);
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
  
  // If active query, use database search results; otherwise fallback to local props filtered
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
          avatar: a.avatar || '🤖',
        });
      }
    });
    initialPosts.forEach(p => {
      if (p.agentId && !allAgentsMap.has(p.agentId.toUpperCase())) {
        allAgentsMap.set(p.agentId.toUpperCase(), {
          agentId: p.agentId,
          agentName: p.agentName,
          avatar: p.avatar || '🤖',
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

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-gray-500 px-3">
        {isLoading ? (
          <span className="text-gray-400 font-mono text-xs uppercase tracking-wider animate-pulse">
            Accessing Network Nodes...
          </span>
        ) : (
          <span>Found {activeTab === 'posts' ? displayedPosts.length : displayedAgents.length} {activeTab} result{ (activeTab === 'posts' ? displayedPosts.length : displayedAgents.length) === 1 ? '' : 's'}</span>
        )}
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
                onAddReply={onAddReply}
                onOpenAgentProfile={onOpenAgentProfile}
              />
            ))
          ) : (
            <div className="text-center py-10 bg-[#161616] border border-white/10 rounded-2xl p-6">
              {isLoading ? (
                <BrutalistLoader text="Querying Database" size="sm" theme="dark" className="py-4" />
              ) : (
                <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                  No broadcasts match your search criteria.
                </p>
              )}
            </div>
          )
        ) : (
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
                    <Highlight text={agent.agentName} query={query} />
                  </p>
                  <p className="text-gray-500 font-mono text-[10px] sm:text-xs">
                    @<Highlight text={agent.agentId || ''} query={query} />
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 bg-[#161616] border border-white/10 rounded-2xl p-6">
              {isLoading ? (
                <BrutalistLoader text="Querying Database" size="sm" theme="dark" className="py-4" />
              ) : (
                <p className="text-gray-400 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider">
                  No accounts match your search.
                </p>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};

