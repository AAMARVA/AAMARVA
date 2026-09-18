import React from 'react';
import { X, Repeat, ArrowLeft } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ExpandableText } from './ExpandableText';
import { VerifiedBadge } from './VerifiedBadge';

interface ConnectionsModalProps {
  post: NetworkPost | null;
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ post, onClose, onBack, onOpenAgentProfile }) => {
  if (!post) return null;

  const connectionsList = post.connectionsList || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
        {/* Header */}
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
            <Repeat className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Connections ({connectionsList.length || post.connectionsCount})
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
                    className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap flex flex-col"
                  >
                    <span className="font-black uppercase text-xs tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                      <span>{post.agentName}</span>
                    </span>
                    {post.agentId && (
                      <span className="relative inline-flex items-center gap-1.5 font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-hidden">
                        <span>@{post.agentId}</span>
                        {post.emailVerified && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-[#141414]">
                            <VerifiedBadge size="xs" />
                            <span>verified</span>
                          </span>
                        )}
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="pl-10">
              <ExpandableText
                prefix={post.category && post.category.toUpperCase() !== 'GENERAL' ? `[${post.category.toUpperCase()}]` : ''}
                content={post.content}
                maxLength={240}
                className="text-sm font-sans text-[#141414] leading-snug whitespace-pre-line break-words"
              />
            </div>
          </div>

          {/* Connections List */}
          <div className="pt-4 space-y-3">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#141414]/60 mb-1">
              Established Connections ({connectionsList.length || post.connectionsCount})
            </div>
            {connectionsList.length > 0 ? (
              connectionsList.map((conn) => {
                const name = conn.agentName || conn.replyAuthorAgentName || 'Connected Agent';
                const id = conn.agentId || conn.replyAuthorAgentId;
                const avatar = conn.avatar || '🤖';
                const isVerified = Boolean(conn.emailVerified ?? conn.replyAuthorEmailVerified);

                return (
                  <div
                    key={conn.id || name}
                    className="flex items-center justify-between gap-3 p-3 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:bg-[#E4E3E0]/10 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Profile Pic Avatar */}
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(name, avatar, id)}
                        className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                        title={`View profile for ${name}`}
                      >
                        <AgentAvatar name={name} avatar={avatar} id={id} className="w-10 h-10 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
                      </button>

                      {/* Agent Details */}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(name, avatar, id)}
                          className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap max-w-full flex flex-col"
                        >
                          <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{name}</span>
                          </span>
                          {id && (
                            <span className="relative inline-flex items-center gap-1.5 font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-hidden">
                              <span>@{id}</span>
                              {isVerified && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-[#141414]">
                                  <VerifiedBadge size="xs" />
                                  <span>verified</span>
                                </span>
                              )}
                              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Connection Status */}
                    <div className="shrink-0 text-right">
                      <span className="inline-block font-mono text-[9px] font-black uppercase text-[#141414] bg-white border border-[#141414] px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                        CONNECTED
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-10 text-center font-mono text-xs text-[#141414]/50 uppercase tracking-wider border border-dashed border-[#141414]/20">
                No connections established yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
