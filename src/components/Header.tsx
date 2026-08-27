import React, { useState, useRef, useEffect } from 'react';
import { Search as SearchIcon, ChevronDown, Check } from 'lucide-react';
import { NetworkPost } from '../types';

export type FeedSortOption = 'LATEST' | 'HIGHEST ENGAGEMENT' | 'MOST REPLIES' | 'MOST CONNECTIONS';

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
  isVisible?: boolean;
  feedSort?: FeedSortOption;
  onSelectFeedSort?: (sort: FeedSortOption) => void;
}

const SORT_OPTIONS: { id: FeedSortOption; label: string; description: string }[] = [
  { id: 'LATEST', label: 'LATEST', description: 'Real-time broadcast order' },
  { id: 'HIGHEST ENGAGEMENT', label: 'HIGHEST ENGAGEMENT', description: 'Total replies & connections [ 24 hrs ]' },
  { id: 'MOST REPLIES', label: 'MOST REPLIES', description: 'Most discussed posts [ 24 hrs ]' },
  { id: 'MOST CONNECTIONS', label: 'MOST CONNECTIONS', description: 'Most connected posts [ 24 hrs ]' },
];

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
  isVisible = true,
  feedSort = 'LATEST',
  onSelectFeedSort,
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
    if (onSelectFeedSort) {
      onSelectFeedSort(option);
    }
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
            onClick={() => setActiveTab('floor')}
            className="flex items-center text-left focus:outline-none group"
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

        {/* Right Side: Search Button */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-3 lg:gap-3">
          {!isSearchDropdownOpen && (
            <button
              onClick={onOpenSearch}
              className="py-1 px-2.5 sm:py-2 sm:px-4 md:py-2 md:px-4 lg:py-2 lg:px-4 border-2 border-[#141414] transition-all flex items-center justify-center font-mono font-black text-xs sm:text-sm md:text-sm lg:text-sm uppercase tracking-wider bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2 lg:gap-2">
                <SearchIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4 shrink-0" />
                <span>Search</span>
              </div>
            </button>
          )}
        </div>

        {/* Small Option Box located directly flush below the header (only shown on the Floor tab) */}
        {activeTab === 'floor' && (
          <div ref={dropdownRef} className="absolute right-4 sm:right-8 md:right-8 lg:right-8 top-full z-30 pointer-events-auto">
            <button
              onClick={() => setIsSortDropdownOpen(prev => !prev)}
              aria-expanded={isSortDropdownOpen}
              className="flex items-center justify-center gap-1.5 min-w-[100px] sm:min-w-[120px] md:min-w-[130px] border-x-2 border-b-2 border-t-0 border-[#141414] px-3 py-1 sm:px-4 sm:py-1.5 md:py-1.5 font-mono text-[10px] sm:text-xs md:text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer bg-[#141414] text-white hover:bg-[#2c2c2c] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              <span>{SORT_OPTIONS.find(opt => opt.id === feedSort)?.label || feedSort}</span>
              <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3] transition-transform duration-200 ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isSortDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 sm:w-72 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 divide-y-2 divide-[#141414]">
                {SORT_OPTIONS.map(option => {
                  const isSelected = feedSort === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleSelectOption(option.id)}
                      className={`w-full text-left px-3 py-2.5 sm:px-3.5 sm:py-2.5 transition-colors flex items-center justify-between group cursor-pointer ${
                        isSelected 
                          ? 'bg-[#141414] text-white' 
                          : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-mono font-black text-[11px] sm:text-xs uppercase tracking-wider">
                          {option.label}
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-mono font-bold leading-tight mt-0.5 ${
                          isSelected ? 'text-white/90' : 'text-[#141414]'
                        }`}>
                          {option.description}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 shrink-0 stroke-[3] text-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};



