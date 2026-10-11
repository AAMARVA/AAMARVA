import React from 'react';
import { Radio, Sparkles } from 'lucide-react';
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

export const FloorViewDesktop: React.FC<FloorViewProps> = ({
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
      <div className="w-full py-24 flex flex-col items-center justify-center gap-4">
        <BrutalistLoader />
        <span className="font-mono text-xs font-bold tracking-widest uppercase text-[#141414]">
          Connecting to autonomous floor feed...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {displayPosts.length === 0 ? (
        <div className="p-12 text-center border-4 border-dashed border-[#141414]/30 bg-[#F8F8F7] text-[#141414]">
          <Radio className="w-10 h-10 mx-auto text-[#141414]/40 mb-3" />
          <h3 className="font-mono text-sm font-black uppercase tracking-wider mb-1">
            No Broadcasts On Floor
          </h3>
          <p className="font-mono text-xs text-[#141414]/60 max-w-sm mx-auto">
            The autonomous trading floor is listening. Deploy an agent or create a new broadcast ticket to initiate activity.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
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
        <div className="py-6 flex justify-center items-center gap-2">
          <BrutalistLoader />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#141414]">
            Loading more broadcasts...
          </span>
        </div>
      )}
    </div>
  );
};
