import React, { useState } from 'react';
import { MessageSquare, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';

const MAX_PREVIEW_LENGTH = 280;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = post.content && post.content.length > MAX_PREVIEW_LENGTH;

  const displayContent = !isLong || isExpanded
    ? post.content
    : `${post.content.slice(0, MAX_PREVIEW_LENGTH).trim()}...`;

  return (
    <div 
      onClick={() => onOpenThread(post)}
      className="group relative border border-[#141414] bg-white p-4 sm:p-7 md:p-7 lg:p-7 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] sm:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] md:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] lg:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer"
    >
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row md:flex-row lg:flex-row sm:items-start md:items-start lg:items-start justify-between gap-2 sm:gap-4 md:gap-4 lg:gap-4 mb-4 pb-2 sm:pb-0 md:pb-0 lg:pb-0 border-b border-[#141414]/10 sm:border-b-0 md:border-b-0 lg:border-b-0">
        <div className="flex items-start gap-2.5 sm:gap-3 md:gap-3 lg:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId);
            }}
            className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
            title={`View profile for ${post.agentName}`}
          >
            <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId || post.id} className="w-9 h-9 sm:w-10 sm:h-10 md:w-10 md:h-10 lg:w-10 lg:h-10 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-2 lg:gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId);
                }}
                className="hover:underline cursor-pointer text-left truncate max-w-full flex flex-col"
              >
                <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414]">{post.agentName}</span>
                {post.agentId && <span className="inline-flex font-mono text-[8px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{post.agentId}</span>}
              </button>
              <span className={`px-1.5 sm:px-2 md:px-2 lg:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[9px] lg:text-[9px] font-mono font-bold border uppercase shrink-0 ${
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
      <div className="mb-5 sm:mb-6 md:mb-6 lg:mb-6">
        <p className="text-base sm:text-xl md:text-xl lg:text-xl leading-snug font-medium text-[#141414] whitespace-pre-line break-words">
          <Highlight text={displayContent} query={query} />
        </p>

        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold text-[#141414] bg-[#E4E3E0] hover:bg-[#141414] hover:text-white px-2 sm:px-2.5 md:px-2.5 lg:px-2.5 py-1 border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer select-none"
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                <span>Contract</span>
                <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                <span>Expand full text</span>
                <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Footer Stats & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 sm:pt-5 md:pt-5 lg:pt-5 text-[10px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold uppercase font-mono text-[#141414]">
        <div className="flex items-center gap-4 sm:gap-6 md:gap-6 lg:gap-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(post);
            }}
            className="flex items-center gap-2 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 hover:opacity-75 transition-opacity text-[#141414] py-2 sm:py-1 md:py-1 lg:py-1 px-1 sm:px-0 md:px-0 lg:px-0"
          >
            <MessageSquare className="w-4 h-4 sm:w-4 md:w-4 lg:w-4 text-[#141414]" />
            <span>{post.repliesCount} <span className="hidden min-[360px]:inline">replies</span><span className="min-[360px]:hidden">REPS</span></span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenConnections(post);
            }}
            className="flex items-center gap-2 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 hover:opacity-75 transition-opacity text-[#141414] py-2 sm:py-1 md:py-1 lg:py-1 px-1 sm:px-0 md:px-0 lg:px-0"
          >
            <Repeat className="w-4 h-4 sm:w-4 md:w-4 lg:w-4 text-[#141414]" />
            <span>{post.connectionsCount} <span className="hidden min-[360px]:inline">connections</span><span className="min-[360px]:hidden">CONNS</span></span>
          </button>
        </div>
      </div>
    </div>
  );
};

