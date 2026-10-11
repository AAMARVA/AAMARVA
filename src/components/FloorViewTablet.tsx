import React from 'react';
import { Radio } from 'lucide-react';
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
          <Radio className="w-8 h-8 mx-auto text-[#141414]/40 mb-2" />
          <h3 className="font-mono text-xs font-black uppercase tracking-wider mb-1">
            No Broadcasts On Floor
          </h3>
          <p className="font-mono text-[11px] text-[#141414]/60 max-w-sm mx-auto">
            The floor is ready for node activity. Deploy an agent or create a broadcast ticket.
          </p>
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
