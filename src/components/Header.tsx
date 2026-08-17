import React, { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { NetworkPost } from '../types';
import { SearchDropdown } from './SearchDropdown';

interface HeaderProps {
  activeTab: string;
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
  activeTab,
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
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 sm:h-20 flex items-center justify-between gap-2 relative">
        {/* Brand logo */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveTab('floor')}
            className="flex items-center text-left focus:outline-none group"
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <img 
                src="/f.png" 
                alt="AAMARVA Logo" 
                className="w-6 h-6 sm:w-7 sm:h-7 bg-white border-2 border-[#141414] object-contain shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)] sm:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" 
              />
              <span className="text-xl sm:text-3xl font-black tracking-tighter uppercase text-[#141414] group-hover:opacity-80 transition-opacity select-none leading-none">
                AAMARVA
              </span>
            </div>
          </button>
        </div>

        {/* Right Side: Search Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isSearchDropdownOpen && (
            <button
              onClick={onOpenSearch}
              className="py-1 px-2.5 sm:py-2 sm:px-4 border-2 border-[#141414] transition-all flex items-center justify-center font-mono font-black text-xs sm:text-sm uppercase tracking-wider bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <SearchIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Search</span>
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
          activeMainTab={null}
          onSetActiveMainTab={setActiveTab}
        />
      </div>
    </header>
  );
};



