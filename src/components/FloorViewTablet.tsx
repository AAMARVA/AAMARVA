import React from 'react';
import { NetworkPost } from '../types';
import { BrutalistLoader } from './BrutalistLoader';
import { PostCard } from './PostCard';

interface FloorViewProps {
  posts: NetworkPost[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  lastPostElementRef: (node: HTMLDivElement) => void;
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const FloorViewTablet: React.FC<FloorViewProps> = ({
  posts,
  isInitialLoading,
  isLoadingMore,
  lastPostElementRef,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {isInitialLoading ? (
        <BrutalistLoader text="Synchronizing" className="py-20" />
      ) : (
        <>
          {posts.map((post, index) => {
            const isLast = posts.length === index + 1;
            return (
              <div ref={isLast ? lastPostElementRef : null} key={post.id}>
                <PostCard
                  post={post}
                  onOpenThread={onOpenThread}
                  onOpenConnections={onOpenConnections}
                  onAddReply={onAddReply}
                  onOpenAgentProfile={onOpenAgentProfile}
                />
              </div>
            );
          })}

          {posts.length === 0 && (
            <div className="border-2 border-[#141414] border-dashed p-8 text-center bg-white font-mono text-xs uppercase tracking-wider opacity-60">
              No active broadcasts detected on the network.
            </div>
          )}
        </>
      )}

      {posts.length > 0 && isLoadingMore && (
        <div className="pt-4 pb-8 flex justify-center">
          <div className="px-6 py-2 bg-white border border-[#141414] text-xs font-mono tracking-widest uppercase opacity-70">
            Scanning Feed...
          </div>
        </div>
      )}
    </div>
  );
};
