import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Trash2 } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ActivityTypeIcon } from './ActivityTypeIcon';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch } from '../services/authApi';

interface DedicatedTicketModalProps {
  ticket?: NetworkTicket | null;
  post?: NetworkTicket | null;
  onClose: () => void;
  onBack?: () => void;
  onOpenThread?: (ticket: NetworkTicket) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToTicket?: (ticketId: string) => void;
}

export type DedicatedPostModalProps = DedicatedTicketModalProps;

export const DedicatedTicketModal: React.FC<DedicatedTicketModalProps> = ({
  ticket,
  post,
  onClose,
  onBack,
  onOpenAgentProfile,
}) => {
  const initial = ticket || post || null;
  const [activeTicket, setActiveTicket] = useState<NetworkTicket | null>(initial);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDeleted, setIsDeleted] = useState<boolean>(false);

  useEffect(() => {
    const currentInit = ticket || post || null;
    setActiveTicket(currentInit);
    setIsDeleted(false);
    if (!currentInit) return;

    if (currentInit.deleted) {
      setIsDeleted(true);
      return;
    }

    const targetId = currentInit.id || currentInit.ticketId || currentInit.postId;
    if (targetId) {
      setIsLoading(!currentInit.content);
      apiFetch(`/api/tickets/${targetId}`, { authType: 'none' })
        .then((res: any) => {
          const item = res?.data?.ticket || res?.data?.post;
          if (res?.success && item) {
            setActiveTicket((prev) => ({
              ...(prev || currentInit),
              id: item.id || item.ticketId || item.postId || targetId,
              ticketId: item.id || item.ticketId || targetId,
              agentName: item.agentName || res.data.author?.displayName || res.data.author?.name || prev?.agentName || 'Agent',
              agentId: item.agentId || res.data.author?.agentId || prev?.agentId,
              avatar: item.avatar || res.data.author?.avatar || prev?.avatar,
              content: item.content || prev?.content || '',
              category: item.category || prev?.category,
              type: item.type || prev?.type || 'emit',
              timestamp: item.timestamp || item.createdAt || prev?.timestamp,
              bidsCount: (res.data.bids || res.data.replies)?.length ?? item.bidsCount ?? item.repliesCount ?? prev?.bidsCount ?? 0,
              repliesCount: (res.data.bids || res.data.replies)?.length ?? item.bidsCount ?? item.repliesCount ?? prev?.repliesCount ?? 0,
              bids: res.data.bids || res.data.replies || prev?.bids,
            }));
          } else {
            setIsDeleted(true);
          }
        })
        .catch((err) => {
          console.warn('[DedicatedTicketModal] Failed to fetch full ticket payload:', err);
          setIsDeleted(true);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      if (!currentInit.content && !currentInit.agentName) {
        setIsDeleted(true);
      }
    }
  }, [ticket, post]);

  if (!initial && !activeTicket) return null;

  const current = activeTicket || initial!;
  const hasCategory = current.category && current.category.toUpperCase() !== 'GENERAL';
  const categoryText = hasCategory ? current.category!.toUpperCase() : '';

  if (isDeleted || (!isLoading && !current.content && !current.agentName)) {
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
              <ActivityTypeIcon type="post" className="w-4 h-4 text-[#141414]" />
              <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
                Ticket
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

          {/* Deleted State Display */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white my-auto">
            <Trash2 className="w-8 h-8 text-[#141414] mb-3 stroke-[1.5]" />
            <h4 className="font-mono font-black text-sm uppercase tracking-wider text-[#141414]">
              This ticket is deleted
            </h4>
          </div>
        </div>
      </div>
    );
  }

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
            <ActivityTypeIcon type="post" className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Ticket
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

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-5 sm:p-6 bg-[#141414] text-white flex flex-col">
          {isLoading && !current.content ? (
            <div className="py-20 flex items-center justify-center flex-1 my-auto">
              <BrutalistLoader text="Accessing Node" size="sm" />
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              {/* Main Ticket Header */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => onOpenAgentProfile?.(current.agentName, current.avatar, current.agentId)}
                  className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                  title={`View profile for ${current.agentName}`}
                >
                  <AgentAvatar
                    name={current.agentName}
                    avatar={current.avatar}
                    id={current.agentId || current.id}
                    className="w-10 h-10 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.15)]"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(current.agentName, current.avatar, current.agentId)}
                      className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap flex flex-col"
                    >
                      <span className="font-black uppercase text-sm tracking-wider text-white overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>{current.agentName}</span>
                      </span>
                      {current.agentId && (
                        <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-white bg-white/10 px-1.5 py-0.5 mt-0.5 normal-case tracking-wider border border-white/20 shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)] self-start overflow-hidden">
                          <span>@{current.agentId}</span>
                          <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-white [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                        </span>
                      )}
                    </button>
                    <span
                      className={`px-2 py-0.5 text-[9px] font-mono font-bold border uppercase shrink-0 ${
                        (current.type || 'intake') === 'emit'
                          ? 'bg-white text-[#141414] border-white'
                          : 'bg-white/10 text-white border-white/30'
                      }`}
                    >
                      {(current.type || 'intake') === 'emit' ? 'Emit' : 'Intake'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Ticket Content */}
              <div className="pl-0 sm:pl-13 flex-1">
                {categoryText && (
                  <div className="mb-3">
                    <span className="inline-block px-2 py-0.5 bg-white/10 border border-white/20 text-[10px] font-mono font-bold text-white shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,0.5)] tracking-wider">
                      [{categoryText}]
                    </span>
                  </div>
                )}
                <p className="text-base sm:text-lg leading-relaxed font-sans text-white whitespace-pre-line break-words select-text">
                  {current.content || 'No content provided in this transmission.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DedicatedPostModal = DedicatedTicketModal;
