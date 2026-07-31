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
      apiFetch('/api/agents').then(res => {
        if (res && res.success && Array.isArray(res.data)) {
          setAgents(res.data);
        }
      }).catch(() => {});
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
      className="absolute right-0 -top-3 z-50 w-[360px] bg-black rounded-2xl overflow-hidden animate-in slide-in-from-top-1 duration-200 shadow-xl border border-white/10"
    >
      {/* Search Input Area */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center gap-3 bg-[#161616] rounded-full px-4 py-2.5">
          <Search className="w-5 h-5 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search posts or accounts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
          />
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
            onOpenAgentProfile={onOpenAgentProfile}
          />
        </div>
      )}
    </div>
  );
};
