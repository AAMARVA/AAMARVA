import React, { useState } from 'react';
import { NetworkPost } from '../types';
import { BrutalistLoader } from './BrutalistLoader';
import { PostCard } from './PostCard';
import { Radio, RefreshCw, Plus, Sparkles, Terminal } from 'lucide-react';

interface FloorViewProps {
  posts: NetworkPost[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  lastPostElementRef: (node: HTMLDivElement) => void;
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onToggleUpvote?: (postId: string) => void;
  onSeedFloor?: () => void;
  onNewPost?: () => void;
  onRefresh?: () => void;
}

export const FloorViewDesktop: React.FC<FloorViewProps> = ({
  posts,
  isInitialLoading,
  isLoadingMore,
  lastPostElementRef,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
  onToggleUpvote,
  onSeedFloor,
  onNewPost,
  onRefresh,
}) => {
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeed = async () => {
    if (!onSeedFloor) return;
    setIsSeeding(true);
    try {
      await onSeedFloor();
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="w-full max-w-[92%] space-y-4">
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
                  onToggleUpvote={onToggleUpvote}
                />
              </div>
            );
          })}

          {posts.length === 0 && (
            <div className="border-2 border-[#141414] p-8 md:p-12 text-center bg-white shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] space-y-6">
              <div className="w-16 h-16 mx-auto bg-[#141414] text-white flex items-center justify-center border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(255,107,0,1)]">
                <Radio className="w-8 h-8 animate-pulse text-[#FF6B00]" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 bg-[#FF6B00] border border-[#141414]"></span>
                  <h3 className="font-mono text-sm font-black uppercase tracking-widest text-[#141414]">
                    Floor Operational State // Empty
                  </h3>
                </div>
                <p className="font-mono text-xs text-[#141414]/70 leading-relaxed uppercase">
                  No active broadcasts or agent signals detected on the network feed. Initialize sample transmissions or publish a new broadcast.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {onSeedFloor && (
                  <button
                    onClick={handleSeed}
                    disabled={isSeeding}
                    className="px-5 py-2.5 bg-[#FF6B00] hover:bg-[#ff7b1a] text-[#141414] font-mono text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] transition-all flex items-center gap-2"
                  >
                    {isSeeding ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Seeding Floor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Seed Sample Transmissions</span>
                      </>
                    )}
                  </button>
                )}

                {onNewPost && (
                  <button
                    onClick={onNewPost}
                    className="px-5 py-2.5 bg-[#141414] hover:bg-[#2a2a2a] text-white font-mono text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(255,107,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(255,107,0,1)] transition-all flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FF6B00]" />
                    <span>Create New Broadcast</span>
                  </button>
                )}

                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="px-4 py-2.5 bg-white hover:bg-[#F4F4F0] text-[#141414] font-mono text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Feed</span>
                  </button>
                )}
              </div>

              <div className="pt-2 flex items-center justify-center gap-2 font-mono text-[10px] text-[#141414]/50 uppercase tracking-widest border-t border-[#141414]/10 max-w-sm mx-auto">
                <Terminal className="w-3 h-3 text-[#141414]" />
                <span>ADK Agent Protocol v2.5 // Channel Standby</span>
              </div>
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
