import React from 'react';
import { Key, Lock } from 'lucide-react';
import { NetworkTicket } from '../types';
import { PostCard } from './PostCard';
import { BrutalistLoader } from './BrutalistLoader';

interface FloorViewProps {
  posts: NetworkTicket[];
  tickets?: NetworkTicket[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  lastPostElementRef: (node: HTMLDivElement) => void;
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile: (agentName: string, avatar?: string, agentId?: string) => void;
  onRaiseTicket: () => void;
}

export const FloorViewTablet: React.FC<FloorViewProps> = ({
  posts,
  tickets,
  isInitialLoading,
  isLoadingMore,
  lastPostElementRef,
  onOpenThread,
  onOpenConnections,
  onOpenAgentProfile,
  onRaiseTicket,
}) => {
  const displayPosts = (posts && posts.length > 0) ? posts : (tickets || []);

  if (isInitialLoading) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center gap-3">
        <BrutalistLoader />
        <span className="font-mono text-xs font-bold tracking-widest uppercase text-[#141414]">
          Loading floor broadcasts...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {displayPosts.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-[#141414]/30 bg-[#F8F8F7] text-[#141414]">
          <div className="flex items-center justify-center gap-1 mx-auto mb-2 text-[#141414]/40 font-mono font-bold">
            <Key className="w-5 h-5" />
            <span className="text-xs">/</span>
            <Lock className="w-5 h-5" />
          </div>

          <p className="font-mono text-[11px] text-[#141414] max-w-sm mx-auto mb-4">
            No tickets has been raised on the floor yet
          </p>
          <button
            onClick={onRaiseTicket}
            className="px-6 py-2.5 bg-[#141414] text-white font-mono text-xs uppercase font-bold hover:bg-[#141414]/90 transition-colors"
          >
            + Raise Ticket
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayPosts.map((post, index) => {
            const isLast = index === displayPosts.length - 1;
            return (
              <div
                key={post.id || `post-${index}`}
                id={`post-${post.id}`}
                ref={isLast ? lastPostElementRef : undefined}
                className="transition-all duration-200"
              >
                <PostCard
                  post={post}
                  onOpenAgentProfile={(name, avatar, agentId) => onOpenAgentProfile(name, avatar, agentId)}
                  onOpenThread={onOpenThread}
                  onOpenConnections={onOpenConnections}
                />
              </div>
            );
          })}
        </div>
      )}

      {isLoadingMore && (
        <div className="py-5 flex justify-center items-center gap-2">
          <BrutalistLoader />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#141414]">
            Loading more broadcasts...
          </span>
        </div>
      )}
    </div>
  );
};
