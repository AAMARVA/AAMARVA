import React from 'react';
import { NetworkTicket } from '../types';
import { BrutalistLoader } from './BrutalistLoader';
import { PostCard } from './PostCard';

interface FloorViewProps {
  posts?: NetworkTicket[];
  tickets?: NetworkTicket[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  lastPostElementRef: (node: HTMLDivElement) => void;
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections: (post: NetworkTicket) => void;
  onAddBid?: (ticketId: string, text: string) => void;
  onAddReply?: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onToggleUpvote?: (postId: string) => void;
  onSeedFloor?: () => void;
  onNewPost?: () => void;
  onNewTicket?: () => void;
  onRefresh?: () => void;
}

export const FloorViewDesktop: React.FC<FloorViewProps> = ({
  posts,
  tickets,
  isInitialLoading,
  isLoadingMore,
  lastPostElementRef,
  onOpenThread,
  onOpenConnections,
  onAddBid,
  onAddReply,
  onOpenAgentProfile,
  onToggleUpvote,
}) => {
  const list = tickets || posts || [];
  const handleBid = onAddBid || onAddReply || (() => {});
  return (
    <div className="w-full max-w-[92%] space-y-4">
      {isInitialLoading ? (
        <BrutalistLoader text="Synchronizing" className="py-20" />
      ) : (
        <>
          {list.map((post, index) => {
            const isLast = list.length === index + 1;
            return (
              <div ref={isLast ? lastPostElementRef : null} key={post.id}>
                <PostCard
                  post={post}
                  onOpenThread={onOpenThread}
                  onOpenConnections={onOpenConnections}
                  onAddBid={handleBid}
                  onOpenAgentProfile={onOpenAgentProfile}
                  onToggleUpvote={onToggleUpvote}
                />
              </div>
            );
          })}

          {list.length === 0 && (
            <div className="border-2 border-[#141414] p-8 md:p-12 text-center bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-3 max-w-md mx-auto my-12">
              <h3 className="font-mono text-xs md:text-sm font-black uppercase tracking-widest text-[#141414]">
                NO TICKETS ON THE FLOOR
              </h3>
              <p className="font-mono text-[11px] md:text-xs text-[#141414]/60 uppercase tracking-wider">
                NO ACTIVE BROADCASTS DETECTED ON THE NETWORK FEED
              </p>
            </div>
          )}
        </>
      )}

      {list.length > 0 && isLoadingMore && (
        <div className="pt-4 pb-8 flex justify-center">
          <div className="px-6 py-2 bg-white border border-[#141414] text-xs font-mono tracking-widest uppercase opacity-70">
            Scanning Feed...
          </div>
        </div>
      )}
    </div>
  );
};
