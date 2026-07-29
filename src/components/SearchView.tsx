import React, { useState } from 'react';
import { Search, Tag } from 'lucide-react';
import { NetworkPost } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';

interface SearchViewProps {
  posts: NetworkPost[];
  query: string; // Add query prop
  activeTab: 'accounts' | 'posts';
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  posts,
  query, // Receive query prop
  activeTab,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  const filteredPosts = posts.filter((post) => {
    const lowerQuery = query.toLowerCase();
    
    let matchesQuery = false;
    if (activeTab === 'posts') {
      matchesQuery = query.trim() === '' ||
        post.content.toLowerCase().includes(lowerQuery) ||
        post.category.toLowerCase().includes(lowerQuery);
    } else {
      matchesQuery = query.trim() === '' ||
        post.agentName.toLowerCase().includes(lowerQuery) ||
        (post.agentId && post.agentId.toLowerCase().includes(lowerQuery));
    }

    return matchesQuery;
  });

  // For accounts tab, get unique agents
  const agentMap = new Map<string, NetworkPost>();
  filteredPosts.forEach(post => {
    if (post.agentId && !agentMap.has(post.agentId)) {
      agentMap.set(post.agentId, post);
    }
  });
  const uniqueAgents: NetworkPost[] = Array.from(agentMap.values());

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-gray-400 px-3">
        <span>Found {activeTab === 'posts' ? filteredPosts.length : uniqueAgents.length} {activeTab} result{ (activeTab === 'posts' ? filteredPosts.length : uniqueAgents.length) === 1 ? '' : 's'}</span>
      </div>

      {/* Results List */}
      <div className="space-y-4 px-3 pb-3">
        {activeTab === 'posts' ? (
          filteredPosts.length > 0 ? (
            filteredPosts.map((post) => (
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
            <div className="text-center py-12 bg-[#141414] border border-dashed border-white/20 p-6">
              <p className="text-white font-mono text-sm uppercase font-bold">No agent broadcasts match your search criteria.</p>
            </div>
          )
        ) : (
          uniqueAgents.length > 0 ? (
            uniqueAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 p-3 bg-[#141414] border border-white/10 rounded-xl cursor-pointer hover:border-white/30 transition-all"
                onClick={() => onOpenAgentProfile?.(agent.agentName, agent.avatar, agent.agentId)}
              >
                <AgentAvatar src={agent.avatar} name={agent.agentName} size="md" />
                <div>
                  <p className="text-white font-mono text-sm font-bold">
                    <Highlight text={agent.agentName} query={query} />
                  </p>
                  <p className="text-gray-400 font-mono text-xs">
                    @<Highlight text={agent.agentId || ''} query={query} />
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-[#141414] border border-dashed border-white/20 p-6">
              <p className="text-white font-mono text-sm uppercase font-bold">No accounts match your search.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

