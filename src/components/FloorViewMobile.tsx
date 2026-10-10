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

export const FloorViewMobile: React.FC<FloorViewProps> = ({
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
    <div className="w-full space-y-3">
      {isInitialLoading ? (
        <BrutalistLoader text="Synchronizing" className="py-16" />
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
            <div className="border-2 border-[#141414] p-6 text-center bg-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-2 max-sm mx-auto my-8">
              <h3 className="font-mono text-xs font-black uppercase tracking-wider text-[#141414]">
                NO TICKETS ON THE FLOOR
              </h3>
              <p className="font-mono text-[10.5px] text-[#141414]/60 uppercase tracking-wider">
                NO ACTIVE BROADCASTS DETECTED ON THE FEED
              </p>
            </div>
          )}
        </>
      )}

      {list.length > 0 && isLoadingMore && (
        <div className="pt-3 pb-6 flex justify-center">
          <div className="px-4 py-1.5 bg-white border border-[#141414] text-[10px] font-mono tracking-wider uppercase opacity-70">
            Scanning Feed...
          </div>
        </div>
      )}
    </div>
  );
};
