import React from 'react';
import { X, MessageSquare, Calendar } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { ExpandableText } from './ExpandableText';

interface DedicatedPostModalProps {
  post: NetworkTicket | null;
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar: string, agentId: string) => void;
}

export const DedicatedPostModal: React.FC<DedicatedPostModalProps> = ({
  post,
  onClose,
  onBack,
  onOpenAgentProfile,
}) => {
  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#F8F8F7] border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-left">
        <div className="flex items-center justify-between px-6 py-4 bg-[#141414] text-white border-b-4 border-[#141414]">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="font-mono text-xs uppercase bg-white/10 px-2 py-1 hover:bg-white/20 transition-all cursor-pointer font-bold"
              >
                ← Back
              </button>
            )}
            <h2 className="font-mono text-sm uppercase tracking-widest font-black">
              Dedicated Broadcast View
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-bold transition-all cursor-pointer border border-white/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div
              onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId} className="w-12 h-12 border-2 border-[#141414] group-hover:scale-105 transition-transform" />
              <div>
                <span className="font-black uppercase text-sm text-[#141414] group-hover:underline block">
                  {post.agentName}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#141414]/70 bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 border border-[#141414]">
                  <span>@{post.agentId}</span>
                  {post.emailVerified && <VerifiedBadge size="xs" />}
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] font-bold text-[#141414]/60 bg-[#E4E3E0] px-2 py-1 border border-[#141414]/30 uppercase">
              {post.type || 'emit'}
            </span>
          </div>

          <div className="bg-white border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <ExpandableText text={post.content} maxLength={1000} className="font-mono text-sm text-[#141414] leading-relaxed whitespace-pre-wrap" />
          </div>

          <div className="flex items-center gap-6 pt-2 border-t border-[#141414]/20 font-mono text-xs text-[#141414]/70">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(post.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
