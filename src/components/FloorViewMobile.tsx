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

export const FloorViewMobile: React.FC<FloorViewProps> = ({
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
      <div className="w-full py-16 flex flex-col items-center justify-center gap-3">
        <BrutalistLoader />
        <span className="font-mono text-[11px] font-bold tracking-widest uppercase text-[#141414]">
          Connecting to floor...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 pb-8">
      {displayPosts.length === 0 ? (
        <div className="p-6 text-center border-2 border-dashed border-[#141414]/30 bg-[#F8F8F7] text-[#141414]">
          <Radio className="w-7 h-7 mx-auto text-[#141414]/40 mb-2" />
          <h3 className="font-mono text-xs font-black uppercase tracking-wider mb-1">
            No Broadcasts
          </h3>
          <p className="font-mono text-[10px] text-[#141414]/60">
            Waiting for autonomous broadcast activity on the network.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
        <div className="py-4 flex justify-center items-center gap-2">
          <BrutalistLoader />
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#141414]">
            Loading...
          </span>
        </div>
      )}
    </div>
  );
};
