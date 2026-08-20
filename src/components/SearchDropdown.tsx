import React, { useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { NetworkPost } from '../types';
import { SearchView } from './SearchView';
import { apiFetch } from '../services/authApi';

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
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="fixed inset-0 z-50 w-full h-full bg-[#0F0F0F] flex flex-col animate-in fade-in duration-200"
    >
      <div className="max-w-xl mx-auto w-full flex flex-col h-full bg-black sm:border-x md:border-x lg:border-x border-white/5">
        <div className="sticky top-0 z-30">
          {/* Desktop Navigation Options Row (Hidden on Mobile) */}
          {onSetActiveMainTab && (
            <div className="hidden md:flex lg:flex flex-col gap-2 p-3 border-b border-white/10 bg-black">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { onSetActiveMainTab('floor'); onClose(); }}
                  className={`px-3 py-2 text-xs font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    (activeMainTab === 'floor' || activeMainTab === 'live')
                      ? 'bg-white text-black border-2 border-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
                      : 'bg-black text-white border-b-2 border-r-2 border-white hover:bg-white/10'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeMainTab === 'floor' || activeMainTab === 'live' ? 'bg-black animate-pulse' : 'bg-white/40'}`}></span>
                  <span>Floor</span>
                </button>

                <button
                  onClick={() => { onSetActiveMainTab('telemetry'); onClose(); }}
                  className={`px-3 py-2 text-xs font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    activeMainTab === 'telemetry'
                      ? 'bg-white text-black border-2 border-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
                      : 'bg-black text-white border-b-2 border-r-2 border-white hover:bg-white/10'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeMainTab === 'telemetry' ? 'bg-white animate-pulse' : 'bg-white/40'}`}></span>
                  <span>Telemetry</span>
                </button>

                <button
                  onClick={() => { onSetActiveMainTab('hub'); onClose(); }}
                  className={`px-3 py-2 text-xs font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    (activeMainTab === 'hub' || activeMainTab === 'explore')
                      ? 'bg-white text-black border-2 border-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
                      : 'bg-black text-white border-b-2 border-r-2 border-white hover:bg-white/10'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(activeMainTab === 'hub' || activeMainTab === 'explore') ? 'bg-black animate-pulse' : 'bg-white/40'}`}></span>
                  <span>Agent Hub</span>
                </button>
              </div>
            </div>
          )}

          {/* Search Input Area */}
          <div className="p-2 sm:p-3 md:p-3 lg:p-3 border-b border-white/10 bg-black">
          <div className="flex items-center gap-3 bg-[#161616] rounded-lg px-3 py-1.5 border border-white/10 shadow-xl">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Search posts or accounts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 focus:outline-none"
              title="Clear Search"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4" />
            </button>
          </div>
        </div>
      </div>

        {/* Tabs */}
        {query.trim().length > 0 && (
          <div className="flex border-b border-white/10 bg-black shrink-0 px-4 sm:px-8 md:px-8 lg:px-8">
            <div className="flex w-full sm:w-auto md:w-auto lg:w-auto gap-8">
              <button
                onClick={() => setActiveTab('posts')}
                className={`py-2 text-xs sm:text-sm md:text-sm lg:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all ${activeTab === 'posts' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Posts
              </button>
              <button
                onClick={() => setActiveTab('accounts')}
                className={`py-2 text-xs sm:text-sm md:text-sm lg:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all ${activeTab === 'accounts' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Accounts
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-black text-white px-3 pt-4 pb-28 sm:px-8 md:px-8 lg:px-8 sm:py-6 md:py-6 lg:py-6">
          {query.trim().length > 0 ? (
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
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 opacity-40">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                <Search className="w-12 h-12 text-white" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
