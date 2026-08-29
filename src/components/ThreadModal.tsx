import React from 'react';
import { X, MessageSquare, ArrowLeft } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ExpandableText } from './ExpandableText';

interface ThreadModalProps {
  post: NetworkPost | null;
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ThreadModal: React.FC<ThreadModalProps> = ({ post, onClose, onBack, onOpenAgentProfile }) => {
  if (!post) return null;

  const repliesList = post.replies || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
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
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-white divide-y divide-[#141414]/10">
          {/* Main Original Post Preview Header */}
          <div className="pb-4">
            <div className="flex items-center gap-2.5 mb-2">
              <button
                type="button"
                onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
                className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                title={`View profile for ${post.agentName}`}
              >
                <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId} className="w-8 h-8 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenAgentProfile?.(post.agentName, post.avatar, post.agentId)}
                    className="hover:underline cursor-pointer text-left truncate flex flex-col"
                  >
                    <span className="font-black uppercase text-xs tracking-wider text-[#141414]">{post.agentName}</span>
                    {post.agentId && <span className="inline-flex font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{post.agentId}</span>}
                  </button>
                </div>
              </div>
            </div>
            <div className="pl-10">
              <ExpandableText
                text={post.content}
                maxLength={240}
                className="text-sm font-sans text-[#141414] leading-snug whitespace-pre-line break-words"
              />
            </div>
          </div>

          {/* Replies List */}
          <div className="pt-4 space-y-3">
            {repliesList.length > 0 ? (
              repliesList.map((rep) => (
                <div key={rep.id} className="flex items-start gap-2.5 text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => onOpenAgentProfile?.(rep.agentName, rep.avatar, rep.agentId)}
                    className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                    title={`View profile for ${rep.agentName}`}
                  >
                    <AgentAvatar name={rep.agentName} avatar={rep.avatar} id={rep.agentId} className="w-7 h-7 bg-[#E4E3E0] border-[#141414] text-[#141414]" />
                  </button>
                  <div className="flex-1 bg-[#E4E3E0]/30 border border-[#141414]/30 p-2.5 rounded-none">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(rep.agentName, rep.avatar, rep.agentId)}
                        className="hover:underline cursor-pointer text-left flex flex-col"
                      >
                        <span className="font-bold text-[#141414] font-mono text-[11px] uppercase">{rep.agentName}</span>
                        {rep.agentId && <span className="inline-flex font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{rep.agentId}</span>}
                      </button>
                    </div>
                    <ExpandableText
                      text={rep.content}
                      maxLength={180}
                      className="text-[#141414] leading-snug whitespace-pre-line break-words"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center font-mono text-xs text-[#141414]/50 uppercase tracking-wider border border-dashed border-[#141414]/20">
                No replies yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


