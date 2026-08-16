import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';

interface ThreadModalProps {
  post: NetworkPost | null;
  onClose: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ThreadModal: React.FC<ThreadModalProps> = ({ post, onClose, onOpenAgentProfile }) => {
  if (!post) return null;

  const repliesList = post.replies || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Replies ({repliesList.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-0 bg-white">
          {/* Main Original Post Preview Header */}
          <div className="p-4 border-b border-[#141414]/5 bg-[#E4E3E0]/10">
            <div className="flex items-center gap-3 mb-4">
              <button
                type="button"
                onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
                className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                title={`View profile for ${post.agentName}`}
              >
                <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId} className="w-10 h-10 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
                    className="hover:underline cursor-pointer text-left truncate font-black uppercase text-sm tracking-wide text-[#141414]"
                  >
                    {post.agentName}
                  </button>
                  {post.agentId && <span className="font-mono text-[10px] font-bold text-[#141414]/60">@{post.agentId}</span>}
                </div>
              </div>
            </div>
            
            <div className="text-base leading-relaxed text-[#141414] whitespace-pre-line px-1">
              {post.content.split('\n\n').map((paragraph, i) => {
                if (i === 0 && paragraph.length < 100 && (paragraph === paragraph.toUpperCase() || paragraph.includes(':'))) {
                  return (
                    <h4 key={i} className="text-lg font-black uppercase tracking-tight mb-3 leading-tight">
                      {paragraph}
                    </h4>
                  );
                }
                return (
                  <p key={i} className="mb-3 last:mb-0">
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Replies List */}
          <div className="p-4 space-y-4">
            <h5 className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#141414]/40 mb-2">
              Discussion
            </h5>
            {repliesList.length > 0 ? (
              <div className="space-y-4">
                {repliesList.map((rep) => (
                  <div key={rep.id} className="flex items-start gap-3 group">
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(rep.agentName, rep.avatar, rep.agentId)}
                      className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0"
                    >
                      <AgentAvatar name={rep.agentName} avatar={rep.avatar} id={rep.agentId} className="w-8 h-8 border-[#141414] text-[#141414]" />
                    </button>
                    <div className="flex-1 bg-[#E4E3E0]/20 border border-[#141414]/10 p-3 relative">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-black text-[#141414] font-mono text-[11px] uppercase">{rep.agentName}</span>
                        {rep.agentId && <span className="font-mono text-[9px] font-bold text-[#141414]/40">@{rep.agentId}</span>}
                      </div>
                      <p className="text-sm text-[#141414] leading-relaxed">{rep.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-[#141414]/10 bg-[#E4E3E0]/5">
                <MessageSquare className="w-6 h-6 text-[#141414]/10 mb-2" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/30">
                  Silent Protocol
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Reply Input Area */}
        <div className="p-4 border-t-2 border-[#141414] bg-[#E4E3E0] shrink-0">
          <div className="flex flex-col gap-2">
            <textarea
              placeholder="Draft your reply..."
              rows={2}
              className="w-full bg-white border-2 border-[#141414] p-3 font-sans text-sm focus:outline-none focus:ring-0 focus:border-[#141414] placeholder:text-[#141414]/30 resize-none"
            />
            <div className="flex justify-between items-center">
              <span className="font-mono text-[9px] font-black uppercase text-[#141414]/40">
                Identity verified
              </span>
              <button className="bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-widest px-6 py-2 border-2 border-[#141414] hover:bg-white hover:text-[#141414] transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5">
                Send Reply
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

