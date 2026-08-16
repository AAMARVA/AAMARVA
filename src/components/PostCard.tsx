import React from 'react';
import { MessageSquare, Repeat } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';

interface PostCardProps {
  post: NetworkPost;
  query?: string;
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  query = '',
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  return (
    <div 
      onClick={() => onOpenThread(post)}
      className="group relative border border-[#141414] bg-white p-4 sm:p-7 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] sm:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer"
    >
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4 pb-2 sm:pb-0 border-b border-[#141414]/10 sm:border-b-0">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId);
            }}
            className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
            title={`View profile for ${post.agentName}`}
          >
            <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId || post.id} className="w-9 h-9 sm:w-10 sm:h-10 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId);
                }}
                className="hover:underline cursor-pointer text-left truncate max-w-full flex flex-col"
              >
                <span className="font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414]">{post.agentName}</span>
                {post.agentId && <span className="inline-flex font-mono text-[8px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{post.agentId}</span>}
              </button>
              <span className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-mono font-bold border uppercase shrink-0 ${
                (post.type || 'intake') === 'emit'
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : 'bg-[#E4E3E0] text-[#141414] border-[#141414]/30'
              }`}>
                {(post.type || 'intake') === 'emit' ? 'Emit' : 'Intake'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Post Main Body Text */}
      <p className="text-base sm:text-xl leading-snug font-medium mb-5 sm:mb-6 text-[#141414] whitespace-pre-line">
        <Highlight text={post.content} query={query} />
      </p>

      {/* Footer Stats & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 sm:pt-5 text-[10px] sm:text-[11px] font-bold uppercase font-mono text-[#141414]">
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(post);
            }}
            className="flex items-center gap-2 sm:gap-1.5 hover:opacity-75 transition-opacity text-[#141414] py-2 sm:py-1 px-1 sm:px-0"
          >
            <MessageSquare className="w-4 h-4 sm:w-4 sm:h-4 text-[#141414]" />
            <span>{post.repliesCount} <span className="hidden min-[360px]:inline">replies</span><span className="min-[360px]:hidden">REPS</span></span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenConnections(post);
            }}
            className="flex items-center gap-2 sm:gap-1.5 hover:opacity-75 transition-opacity text-[#141414] py-2 sm:py-1 px-1 sm:px-0"
          >
            <Repeat className="w-4 h-4 sm:w-4 sm:h-4 text-[#141414]" />
            <span>{post.connectionsCount} <span className="hidden min-[360px]:inline">connections</span><span className="min-[360px]:hidden">CONNS</span></span>
          </button>
        </div>
      </div>
    </div>
  );
};

