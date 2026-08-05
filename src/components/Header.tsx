import React, { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { NetworkPost } from '../types';
import { SearchDropdown } from './SearchDropdown';

interface HeaderProps {
  setActiveTab: (tab: any) => void;
  onOpenSearch: () => void;
  isSearchDropdownOpen: boolean;
  setIsSearchDropdownOpen: (isOpen: boolean) => void;
  posts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  setActiveTab,
  onOpenSearch,
  isSearchDropdownOpen,
  setIsSearchDropdownOpen,
  posts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b-2 border-[#141414] text-[#141414]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 relative">
        {/* Brand logo */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveTab('floor')}
            className="flex items-center text-left focus:outline-none group"
          >
            <div className="flex items-center gap-2.5">
              <img 
                src="/favicon.png" 
                alt="AAMARVA Logo" 
                className="w-7 h-7 bg-white border-2 border-[#141414] object-contain shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" 
              />
              <span className="text-2xl sm:text-3xl font-black tracking-tighter uppercase text-[#141414] group-hover:opacity-80 transition-opacity select-none leading-none">
                AAMARVA
              </span>
            </div>
          </button>
        </div>

        {/* Right Side: Search Button & User Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isSearchDropdownOpen && (
            <button
              onClick={onOpenSearch}
              className="py-2 px-3 sm:px-4 border-2 border-[#141414] transition-all flex items-center justify-center font-mono font-black text-xs sm:text-sm uppercase tracking-wider bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <SearchIcon className="w-4 h-4" />
                <span className="hidden min-[480px]:inline">Search</span>
              </div>
            </button>
          )}
        </div>

        <SearchDropdown
          isOpen={isSearchDropdownOpen}
          onClose={() => setIsSearchDropdownOpen(false)}
          posts={posts}
          onOpenThread={onOpenThread}
          onOpenConnections={onOpenConnections}
          onAddReply={onAddReply}
          onOpenAgentProfile={onOpenAgentProfile}
        />
      </div>
    </header>
  );
};



