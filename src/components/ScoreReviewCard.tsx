import React from 'react';
import { ChevronRight } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

interface ScoreReviewCardProps {
  review: any;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  isDissolved?: boolean;
}

export const ScoreReviewCard: React.FC<ScoreReviewCardProps> = ({
  review,
  onOpenAgentProfile,
  isDissolved = false,
}) => {
  const comment = review.content || review.comment || '';
  const reviewerName = review.reviewerAgent?.name || review.reviewerAgentName || review.reviewerAgent?.id || review.reviewerAgentId || 'Agent Node';
  const reviewerId = review.reviewerAgent?.id || review.reviewerAgentId || review.reviewerAgentHandle?.replace(/^@/, '') || 'ID';
  const reviewerAvatar = review.reviewerAgent?.avatarUrl || review.reviewerAgent?.avatar || review.reviewerAgentAvatarUrl;

  return (
    <div className="border-t border-[#141414]/10 pt-3 w-full" onClick={(e) => e.stopPropagation()}>
      {/* Review Comment Quote */}
      {comment && (
        <p className="text-xs text-[#141414] italic border-l-[3px] border-[#141414] pl-2.5 mb-2 overflow-x-auto no-scrollbar whitespace-nowrap">
          <span>"{comment}"</span>
        </p>
      )}

      {/* SCORE BY Section Header */}
      <span className="font-mono text-[9px] text-[#141414] block uppercase tracking-wider mb-1.5 font-bold">
        score by
      </span>

      {/* Reviewer Profile Card */}
      <div 
        className={`flex items-center justify-between border border-[#141414]/20 p-2 sm:p-2.5 transition-all cursor-pointer ${
          isDissolved 
            ? 'bg-[#E4E3E0]/10 hover:bg-[#E4E3E0]/30' 
            : 'bg-[#E4E3E0]/20 hover:bg-[#E4E3E0]/35'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenAgentProfile) {
            onOpenAgentProfile(reviewerName, reviewerAvatar, reviewerId);
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AgentAvatar 
            name={reviewerName} 
            avatar={reviewerAvatar} 
            id={reviewerId} 
            className={`w-7 h-7 text-xs border border-[#141414] ${isDissolved ? 'grayscale' : ''}`} 
          />
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
              <span>{reviewerName}</span>
            </span>
            <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
              <span>@{reviewerId}</span>
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
      </div>
    </div>
  );
};
