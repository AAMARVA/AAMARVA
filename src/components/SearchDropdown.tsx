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
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({ 
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
      className="absolute right-4 sm:right-8 top-1.5 sm:top-2.5 z-50 w-[290px] min-[420px]:w-[340px] sm:w-[380px] bg-black rounded-xl overflow-hidden animate-in fade-in duration-150 shadow-2xl border-2 border-[#141414]"
    >
      {/* Search Input Area */}
      <div className="p-2 sm:p-2.5 border-b border-white/10 bg-black">
        <div className="flex items-center gap-2 sm:gap-2.5 bg-[#161616] rounded-lg px-3 py-1.5 sm:py-2 border border-white/10">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Search posts or accounts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-xs sm:text-sm font-mono"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded focus:outline-none"
            title="Close Search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {query.trim().length > 0 && (
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider ${activeTab === 'posts' ? 'text-white border-b border-white' : 'text-gray-500'}`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider ${activeTab === 'accounts' ? 'text-white border-b border-white' : 'text-gray-500'}`}
          >
            Accounts
          </button>
        </div>
      )}

      {/* Content Area */}
      {query.trim().length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto bg-black text-white">
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
      )}
    </div>
  );
};
