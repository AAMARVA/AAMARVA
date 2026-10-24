import React, { useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { NetworkTicket } from '../types';
import { SearchView } from './SearchView';

interface SearchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  posts: NetworkTicket[];
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
  onOpenMcpServer?: (server: any) => void;
  activeMainTab?: string;
  onSetActiveMainTab?: (tab: any) => void;
  isSlaveAccount?: boolean;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({ 
  isOpen, 
  onClose, 
  posts,
  onOpenThread,
  onOpenConnections,
  onAddBid,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenClusterChat,
  onOpenMcpServer,
  activeMainTab,
  onSetActiveMainTab,
  isSlaveAccount = false
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'agents' | 'clusters' | 'posts'>('agents');
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
          {/* Top Navigation Options Row matching navigation tabs */}
          {onSetActiveMainTab && (
            <div className="pt-4 px-3 sm:px-4 pb-0 bg-black">
              <div className={`grid ${!isSlaveAccount ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 sm:gap-3 pb-3 border-b border-white`}>
                <button
                  onClick={() => { onSetActiveMainTab('floor'); onClose(); }}
                  className={`py-2 px-1 sm:px-2 text-[9.5px] sm:text-xs font-mono font-bold tracking-tight sm:tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 ${
                    (activeMainTab === 'floor' || activeMainTab === 'live')
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none shrink-0">•</span>
                  <span className="uppercase whitespace-nowrap">FLOOR</span>
                </button>

                {!isSlaveAccount && (
                  <button
                    onClick={() => { onSetActiveMainTab('command-pit'); onClose(); }}
                    className={`py-2 px-1 sm:px-2 text-[9.5px] sm:text-xs font-mono font-bold tracking-tight sm:tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 ${
                      activeMainTab === 'command-pit'
                        ? 'bg-black text-white border border-white shadow-sm'
                        : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                    }`}
                    title="Command Pit"
                  >
                    <span className="text-white text-xs leading-none shrink-0">•</span>
                    <span className="uppercase whitespace-nowrap">
                      <span className="hidden sm:inline">COMMAND PIT</span>
                      <span className="sm:hidden">CMD PIT</span>
                    </span>
                  </button>
                )}

                <button
                  onClick={() => { onSetActiveMainTab('telemetry'); onClose(); }}
                  className={`py-2 px-1 sm:px-2 text-[9.5px] sm:text-xs font-mono font-bold tracking-tight sm:tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 ${
                    activeMainTab === 'telemetry'
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none shrink-0">•</span>
                  <span className="uppercase whitespace-nowrap">TELEMETRY</span>
                </button>

                <button
                  onClick={() => { onSetActiveMainTab('hub'); onClose(); }}
                  className={`py-2 px-1 sm:px-2 text-[9.5px] sm:text-xs font-mono font-bold tracking-tight sm:tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 ${
                    (activeMainTab === 'hub' || activeMainTab === 'explore')
                      ? 'bg-black text-white border border-white shadow-sm'
                      : 'bg-black text-white/90 border border-white/80 hover:border-white hover:text-white'
                  }`}
                >
                  <span className="text-white text-xs leading-none shrink-0">•</span>
                  <span className="uppercase whitespace-nowrap">
                    <span className="hidden sm:inline">AGENT HUB</span>
                    <span className="sm:hidden">HUB</span>
                  </span>
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
                placeholder="Search agent, cluster, or tools & mcp"
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

        {/* Search Filter Tabs when typing: Agent, Cluster, Tools & MCP */}
        {query.trim().length > 0 && (
          <div className="flex border-b border-white/10 bg-black shrink-0 px-4 sm:px-6">
            <div className="flex w-full justify-start gap-6 sm:gap-12">
              <button
                onClick={() => setActiveTab('agents')}
                className={`py-2.5 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all cursor-pointer ${activeTab === 'agents' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Agent
              </button>
              <button
                onClick={() => setActiveTab('clusters')}
                className={`py-2.5 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all cursor-pointer ${activeTab === 'clusters' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Cluster
              </button>
              <button
                onClick={() => setActiveTab('posts')}
                className={`py-2.5 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-black transition-all cursor-pointer ${activeTab === 'posts' ? 'text-white border-b-2 border-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Tools & MCP
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-black text-white px-4 pb-28 sm:px-6 flex flex-col">
          {query.trim().length > 0 ? (
            <div className="pt-4 flex-1 flex flex-col">
              <SearchView
                posts={posts}
                agents={agents}
                query={query}
                activeTab={activeTab}
                onOpenThread={(p) => { onClose(); onOpenThread(p); }}
                onOpenConnections={(p) => { onClose(); onOpenConnections?.(p); }}
                onAddBid={onAddBid}
                onOpenAgentProfile={(name, avatar, id) => { onClose(); onOpenAgentProfile?.(name, avatar, id); }}
                onOpenClusterMembers={(cluster) => { onClose(); onOpenClusterMembers?.(cluster); }}
                onOpenClusterChat={(cluster) => { onClose(); onOpenClusterChat?.(cluster); }}
                onOpenMcpServer={(server) => { onClose(); onOpenMcpServer?.(server); }}
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
