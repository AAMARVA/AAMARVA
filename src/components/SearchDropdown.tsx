import React, { useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { NetworkPost } from '../types';
import { SearchView } from './SearchView';

interface SearchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  posts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  activeMainTab?: string;
  onSetActiveMainTab?: (tab: any) => void;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({ 
  isOpen, 
  onClose, 
  posts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
  activeMainTab,
  onSetActiveMainTab
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'accounts' | 'posts'>('posts');
  const [agents, setAgents] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="fixed inset-0 z-[100] w-full h-full bg-[#050505] flex flex-col animate-in fade-in duration-150 select-none"
    >
      <div className="max-w-2xl mx-auto w-full flex flex-col h-full bg-black sm:border-x border-white/10 shadow-2xl">
        <div className="sticky top-0 z-30 bg-black">
          {/* Top Navigation Options Row matching screenshot */}
          {onSetActiveMainTab && (
            <div className="pt-4 px-4 pb-0 bg-black">
              <div className="grid grid-cols-3 gap-2 sm:gap-3 pb-3 border-b border-white">
                <button
                  onClick={() => { onSetActiveMainTab('floor'); onClose(); }}
                  className={`py-2 px-2 text-xs font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (activeMainTab === 'floor' || activeMainTab === 'live')
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none">•</span>
                  <span className="uppercase">FLOOR</span>
                </button>

                <button
                  onClick={() => { onSetActiveMainTab('telemetry'); onClose(); }}
                  className={`py-2 px-2 text-xs font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeMainTab === 'telemetry'
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none">•</span>
                  <span className="uppercase">TELEMETRY</span>
                </button>

                <button
                  onClick={() => { onSetActiveMainTab('hub'); onClose(); }}
                  className={`py-2 px-2 text-xs font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (activeMainTab === 'hub' || activeMainTab === 'explore')
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none">•</span>
                  <span className="uppercase">AGENT HUB</span>
                </button>
              </div>
            </div>
          )}

          {/* Search Input Area */}
          <div className="p-4 bg-black">
            <div className="flex items-center gap-3 bg-[#111111] rounded-md px-3.5 py-2.5 border border-white/10 focus-within:border-white/20 transition-all">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input 
                type="text" 
                placeholder="Search posts or accounts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="flex-1 bg-transparent text-white placeholder-neutral-500 outline-none text-sm font-mono tracking-tight"
              />
              <button
                type="button"
                onClick={() => {
                  if (query) {
                    setQuery('');
                  } else {
                    onClose();
                  }
                }}
                className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 focus:outline-none cursor-pointer"
                title={query ? "Clear Search" : "Close Search"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Filter Tabs when typing */}
        {query.trim().length > 0 && (
          <div className="flex border-b border-white/10 bg-black shrink-0 px-4 sm:px-6">
            <div className="flex w-full sm:w-auto gap-8">
              <button
                onClick={() => setActiveTab('posts')}
                className={`py-2.5 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all cursor-pointer ${activeTab === 'posts' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Posts
              </button>
              <button
                onClick={() => setActiveTab('accounts')}
                className={`py-2.5 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all cursor-pointer ${activeTab === 'accounts' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Accounts
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-black text-white px-4 pb-28 sm:px-6 flex flex-col">
          {query.trim().length > 0 ? (
            <div className="pt-4">
              <SearchView
                posts={posts}
                agents={agents}
                query={query}
                activeTab={activeTab}
                onOpenThread={(p) => { onClose(); onOpenThread(p); }}
                onOpenConnections={(p) => { onClose(); onOpenConnections(p); }}
                onAddReply={onAddReply}
                onOpenAgentProfile={(name, avatar, id) => { onClose(); onOpenAgentProfile?.(name, avatar, id); }}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-28 h-28 rounded-full bg-white/[0.02] flex items-center justify-center border border-white/10 shadow-inner">
                <Search className="w-14 h-14 text-neutral-600 stroke-[1.25]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
