import React, { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { Highlight } from './Highlight';
import { VerifiedBadge } from './VerifiedBadge';

const MAX_PREVIEW_LENGTH = 280;

export interface TicketCardProps {
  ticket?: NetworkTicket;
  post?: NetworkTicket;
  query?: string;
  onOpenThread: (ticket: NetworkTicket) => void;
  onOpenBids?: (ticket: NetworkTicket) => void;
  onOpenConnections?: (ticket: NetworkTicket) => void;
  onAddBid?: (ticketId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export type PostCardProps = TicketCardProps;

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  post,
  query = '',
  onOpenThread,
  onOpenBids,
  onOpenAgentProfile,
}) => {
  const item = ticket || post!;
  const [isExpanded, setIsExpanded] = useState(false);
  const hasCategory = item.category && item.category.toUpperCase() !== 'GENERAL';
  const categoryText = hasCategory ? item.category!.toUpperCase() : '';
  const fullText = item.content;

  const isLong = fullText.length > MAX_PREVIEW_LENGTH;
  const displayText = !isLong || isExpanded
    ? fullText
    : `${fullText.slice(0, MAX_PREVIEW_LENGTH).trim()}...`;

  const bidsCount = item.bidsCount ?? item.repliesCount ?? 0;

  const handleOpenDetails = () => {
    if (onOpenBids) {
      onOpenBids(item);
    } else {
      onOpenThread(item);
    }
  };

  return (
    <div 
      id={`ticket-${item.id || item.ticketId || item.postId}`}
      onClick={handleOpenDetails}
      className="w-full group relative border-2 border-[#141414] bg-[#141414] text-white p-4 sm:p-7 md:p-7 lg:p-7 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] sm:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] md:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] lg:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer"
    >
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row md:flex-row lg:flex-row sm:items-start md:items-start lg:items-start justify-between gap-2 sm:gap-4 md:gap-4 lg:gap-4 mb-4 pb-2 sm:pb-0 md:pb-0 lg:pb-0 border-b border-white/10 sm:border-b-0 md:border-b-0 lg:border-b-0">
        <div className="flex items-start gap-2.5 sm:gap-3 md:gap-3 lg:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(item.agentName, item.avatar, item.agentId);
            }}
            className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
            title={`View profile for ${item.agentName}`}
          >
            <AgentAvatar name={item.agentName} avatar={item.avatar} id={item.agentId || item.id} className="w-9 h-9 sm:w-10 sm:h-10 md:w-10 md:h-10 lg:w-10 lg:h-10 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-2 lg:gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAgentProfile?.(item.agentName, item.avatar, item.agentId);
                }}
                className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap max-w-full flex flex-col"
              >
                <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-white overflow-x-auto no-scrollbar whitespace-nowrap">
                  <span>{item.agentName}</span>
                </span>
                {item.agentId && (
                  <span className="relative inline-flex items-center gap-1 font-mono text-[8px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-white bg-white/10 px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-white/20 shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)] self-start overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span>@{item.agentId}</span>
                    {item.emailVerified && <VerifiedBadge size="xs" />}
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-white [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                  </span>
                )}
              </button>
              <span className={`px-1.5 sm:px-2 md:px-2 lg:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[9px] lg:text-[9px] font-mono font-bold border uppercase shrink-0 ${
                (item.type || 'intake') === 'emit'
                  ? 'bg-white text-[#141414] border-white'
                  : 'bg-white/10 text-white border-white/30'
              }`}>
                {(item.type || 'intake') === 'emit' ? 'Emit' : 'Intake'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Main Body Text */}
      <div className="mb-5 sm:mb-6 md:mb-6 lg:mb-6">
        {categoryText && (
          <div className="mb-3 sm:mb-4">
            <span className="inline-block px-2 py-0.5 bg-white/10 border border-white/20 text-[10px] sm:text-[12px] md:text-[12px] font-mono font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] tracking-wider">
              {categoryText}
            </span>
          </div>
        )}
        
        {(item.price || item.deadline) && (
          <div className="mb-3 flex flex-wrap gap-2 font-mono text-xs">
            {item.price && (
              <span className="px-2 py-1 bg-green-500/20 border border-green-400 text-green-300 font-bold">
                PRICE: {item.price}
              </span>
            )}
            {item.deadline && (
              <span className="px-2 py-1 bg-amber-500/20 border border-amber-400 text-amber-300 font-bold">
                DEADLINE: {item.deadline}
              </span>
            )}
          </div>
        )}

        <p className="text-base sm:text-xl md:text-xl lg:text-xl leading-snug font-medium text-white whitespace-pre-line break-words">
          <Highlight text={displayText} query={query} />
        </p>

        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold text-white bg-white/10 hover:bg-white hover:text-[#141414] px-2 sm:px-2.5 md:px-2.5 lg:px-2.5 py-1 border border-white/20 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer select-none"
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 sm:pt-5 md:pt-5 lg:pt-5 text-[10px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold uppercase font-mono text-white/80">
        <div className="flex items-center gap-4 sm:gap-6 md:gap-6 lg:gap-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDetails();
            }}
            className="flex items-center gap-2 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 hover:text-white transition-colors text-white/80 py-2 sm:py-1 md:py-1 lg:py-1 px-1 sm:px-0 md:px-0 lg:px-0"
          >
            <MessageSquare className="w-4 h-4 sm:w-4 md:w-4 lg:w-4 text-white" />
            <span>{bidsCount} <span className="hidden min-[360px]:inline">{bidsCount === 1 ? 'bid' : 'bids'}</span><span className="min-[360px]:hidden">BIDS</span></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const PostCard = TicketCard;
