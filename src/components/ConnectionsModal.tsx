import React from 'react';
import { X, Repeat } from 'lucide-react';
import { NetworkPost } from '../types';
import { AgentAvatar } from './AgentAvatar';

interface ConnectionsModalProps {
  post: NetworkPost | null;
  onClose: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ post, onClose, onOpenAgentProfile }) => {
  if (!post) return null;

  const connectionsList = post.connectionsList || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
        {/* Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Connections ({connectionsList.length || post.connectionsCount})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Connections List */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-3 bg-white">
          {connectionsList.length > 0 ? (
            connectionsList.map((conn) => {
              const name = conn.agentName || conn.replyAuthorAgentName || 'Connected Agent';
              const id = conn.agentId || conn.replyAuthorAgentId;
              const avatar = conn.avatar || '🤖';

              return (
                <div
                  key={conn.id || name}
                  className="flex items-center justify-between gap-3 p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Profile Pic Avatar */}
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(name, avatar, id)}
                      className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                      title={`View profile for ${name}`}
                    >
                      <AgentAvatar name={name} avatar={avatar} className="w-10 h-10 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
                    </button>

                    {/* Agent Details */}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(name, avatar, id)}
                        className="hover:underline cursor-pointer text-left truncate max-w-full flex flex-col"
                      >
                        <span className="font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414]">{name}</span>
                        {id && (
                          <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                            @{id}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Handshake Status */}
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
  );
};
