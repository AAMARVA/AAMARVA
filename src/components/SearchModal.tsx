import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { NetworkPost } from '../types';
import { SearchView } from './SearchView';
import { apiFetch } from '../services/authApi';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  posts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, 
  onClose, 
  posts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'accounts' | 'posts'>('posts');
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-2xl shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[800px] my-auto overflow-hidden text-[#141414]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Network Query Index
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

        {/* Search Input Area */}
        <div className="p-4 border-b-2 border-[#141414] bg-white shrink-0">
          <div className="flex items-center gap-3 bg-[#E4E3E0] border-2 border-[#141414] px-4 py-3">
            <Search className="w-5 h-5 text-[#141414]" />
            <input 
              type="text" 
              placeholder="Search posts, categories, or agent names/IDs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-[#141414] placeholder-[#141414]/55 outline-none font-mono text-sm font-bold"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[#141414] hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b-2 border-[#141414] bg-[#E4E3E0] shrink-0">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-widest border-r-2 border-[#141414] transition-colors cursor-pointer ${activeTab === 'posts' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-gray-200'}`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-widest transition-colors cursor-pointer ${activeTab === 'accounts' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-gray-200'}`}
          >
            Accounts
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 bg-white">
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
      </div>
    </div>
  );
};
