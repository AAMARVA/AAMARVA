import React, { useState, useRef, useEffect } from 'react';
import { Search as SearchIcon, ChevronDown, Check } from 'lucide-react';
import { NetworkTicket } from '../types';

export type FeedSortOption = 'HIGHEST ENGAGEMENT' | 'MOST REPLIES' | 'MOST CONNECTIONS';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onOpenSearch: () => void;
  isSearchDropdownOpen: boolean;
  setIsSearchDropdownOpen: (isOpen: boolean) => void;
  posts: NetworkTicket[];
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  isVisible?: boolean;
  deviceSize?: 'mobile' | 'tablet' | 'desktop';
  isAuthenticated?: boolean;
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
  onAddBid,
  onOpenAgentProfile,
  isVisible = true,
  deviceSize,
  isAuthenticated = false,
}) => {
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    if (isSortDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortDropdownOpen]);

  const handleSelectOption = (option: FeedSortOption) => {
    // if (onSelectFeedSort) {
    //   onSelectFeedSort(option);
    // }
    setIsSortDropdownOpen(false);
  };

  return (
    <header className={`sticky top-0 z-40 bg-white border-b-2 border-[#141414] text-[#141414] transition-all duration-300 ease-in-out ${
      !isVisible ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100 translate-y-0'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-8 lg:px-8 h-14 sm:h-20 md:h-20 lg:h-20 flex items-center justify-between gap-2 relative">
        {/* Brand logo */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              if (isAuthenticated) {
                setActiveTab('floor');
              } else {
                setActiveTab('landing');
              }
            }}
            className="flex items-center text-left focus:outline-none group cursor-pointer"
          >
            <div className="flex items-center gap-2 sm:gap-2.5 md:gap-2.5 lg:gap-2.5">
              <img 
                src="/f.png" 
                alt="AAMARVA Logo" 
                className="w-6 h-6 sm:w-7 sm:h-7 md:w-7 md:h-7 lg:w-7 lg:h-7 bg-white border-2 border-[#141414] object-contain shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)] sm:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] md:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] lg:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" 
              />
              <span className="text-xl sm:text-3xl md:text-3xl lg:text-3xl font-black tracking-tighter uppercase text-[#141414] group-hover:opacity-80 transition-opacity select-none leading-none">
                AAMARVA
              </span>
            </div>
          </button>
        </div>

        {/* Right Side: Search Button (only if authenticated) or Gateway Clearance status */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-3 lg:gap-3">
          {isAuthenticated ? (
            !isSearchDropdownOpen && (
              <button
                onClick={onOpenSearch}
                className="py-1 px-3 sm:py-2 sm:px-4 md:py-2 md:px-5 lg:py-2 lg:px-5 border-2 border-[#141414] transition-all flex items-center justify-center font-mono font-black text-xs sm:text-sm md:text-sm lg:text-sm uppercase tracking-wider bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2 lg:gap-2">
                  <SearchIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4 shrink-0" />
                  <span>Search</span>
                </div>
              </button>
            )
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('product')}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] ${
                  activeTab === 'product' ? 'bg-[#141414] text-white' : 'bg-[#FAF9F5] text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <span>PRODUCT</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('docs')}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] ${
                  activeTab === 'docs' ? 'bg-[#141414] text-white' : 'bg-[#FAF9F5] text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <span>DOCS</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('landing')}
                className={`hidden sm:block px-2 sm:px-2.5 py-1 sm:py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] ${
                  activeTab === 'landing' ? 'bg-[#141414] text-white' : 'bg-[#FAF9F5] text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <span>HOME</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hub')}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center gap-1.5 ${
                  activeTab === 'hub' ? 'bg-[#141414] text-white' : 'bg-[#FAF9F5] text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <span>GATEWAY</span>
              </button>
            </div>
          )}
        </div>

        {/* Small Option Box removed */}

      </div>
    </header>
  );
};



