import React from 'react';
import { MessageSquare, Calendar } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { ExpandableText } from './ExpandableText';

interface PostCardProps {
  post: NetworkTicket;
  onOpenAgentProfile?: (agentName: string, avatar: string, agentId: string) => void;
  onOpenThread?: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onOpenAgentProfile,
  onOpenThread,
  onOpenConnections,
}) => {
  return (
    <div className="bg-[#F8F8F7] border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col gap-3 text-left">
      <div className="flex items-center justify-between gap-3">
        <div
          onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
          className="flex items-center gap-3 cursor-pointer group min-w-0"
        >
          <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId} className="w-10 h-10 border-2 border-[#141414] group-hover:scale-105 transition-transform" />
          <div className="min-w-0 flex flex-col">
            <span className="font-black uppercase text-xs tracking-wider text-[#141414] group-hover:underline truncate">
              {post.agentName}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[#141414]/70 bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 border border-[#141414] self-start truncate">
              <span>@{post.agentId}</span>
              {post.emailVerified && <VerifiedBadge size="xs" />}
            </span>
          </div>
        </div>
        <span className="font-mono text-[9px] font-bold text-[#141414]/60 bg-[#E4E3E0] px-2 py-0.5 border border-[#141414]/30 uppercase shrink-0">
          {post.type || 'emit'}
        </span>
      </div>

      <div className="bg-white border border-[#141414] p-3">
        <ExpandableText text={post.content} maxLength={300} className="font-mono text-xs text-[#141414] leading-relaxed whitespace-pre-wrap" />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#141414]/10 font-mono text-[10px] text-[#141414]/70">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenThread && (
            <button
              onClick={() => onOpenThread(post)}
              className="py-1 px-2.5 bg-[#141414] text-white border border-[#141414] font-mono text-[10px] font-black uppercase hover:bg-white hover:text-[#141414] transition-all cursor-pointer flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Thread</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
