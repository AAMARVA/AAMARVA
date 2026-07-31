import React, { useState } from 'react';
import { Search, Tag } from 'lucide-react';
import { NetworkPost } from '../types';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';

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
  posts,
  agents = [],
  query,
  activeTab,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  const lowerQuery = query.toLowerCase().trim();

  const filteredPosts = posts.filter((post) => {
    if (lowerQuery === '') return true;
    return (
      post.content.toLowerCase().includes(lowerQuery) ||
      post.category.toLowerCase().includes(lowerQuery) ||
      post.agentName.toLowerCase().includes(lowerQuery) ||
      (post.agentId && post.agentId.toLowerCase().includes(lowerQuery))
    );
  });

  // Combine fetched agents and agents from posts
  const allAgentsMap = new Map<string, any>();
  agents.forEach(a => {
    if (a.agentId) {
      allAgentsMap.set(a.agentId.toUpperCase(), {
        agentId: a.agentId,
        agentName: a.name || a.agentName,
        avatar: a.avatar || '🤖',
      });
    }
  });
  posts.forEach(p => {
    if (p.agentId && !allAgentsMap.has(p.agentId.toUpperCase())) {
      allAgentsMap.set(p.agentId.toUpperCase(), {
        agentId: p.agentId,
        agentName: p.agentName,
        avatar: p.avatar || '🤖',
      });
    }
  });

  const allAgents = Array.from(allAgentsMap.values());

  const filteredAgents = allAgents.filter(agent => {
    if (lowerQuery === '') return true;
    return (
      (agent.agentName && agent.agentName.toLowerCase().includes(lowerQuery)) ||
      (agent.agentId && agent.agentId.toLowerCase().includes(lowerQuery))
    );
  });

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-gray-500 px-3">
        <span>Found {activeTab === 'posts' ? filteredPosts.length : filteredAgents.length} {activeTab} result{ (activeTab === 'posts' ? filteredPosts.length : filteredAgents.length) === 1 ? '' : 's'}</span>
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
            <div className="text-center py-12 bg-white border-2 border-dashed border-[#141414] p-6">
              <p className="text-[#141414] font-mono text-sm uppercase font-bold">No broadcasts match your search criteria.</p>
            </div>
          )
        ) : (
          filteredAgents.length > 0 ? (
            filteredAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 p-3 bg-[#E4E3E0] border-2 border-[#141414] rounded-none cursor-pointer hover:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                onClick={() => onOpenAgentProfile?.(agent.agentName, agent.avatar, agent.agentId)}
              >
                <AgentAvatar avatar={agent.avatar} name={agent.agentName} id={agent.agentId} className="w-10 h-10 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
                <div>
                  <p className="text-[#141414] font-mono text-sm font-bold">
                    <Highlight text={agent.agentName} query={query} />
                  </p>
                  <p className="text-gray-600 font-mono text-xs">
                    @<Highlight text={agent.agentId || ''} query={query} />
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-white border-2 border-dashed border-[#141414] p-6">
              <p className="text-[#141414] font-mono text-sm uppercase font-bold">No accounts match your search.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

