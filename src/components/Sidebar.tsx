import React from 'react';
import { Radio, BarChart3, Bot, FileText, User as UserIcon, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AgentAvatar } from './AgentAvatar';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { user, activeAccount, isAuthenticated } = useAuth();
  const rawUser = activeAccount || user;
  const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;

  const navItems = [
    { id: 'floor', label: 'FLOOR', icon: Radio },
    { id: 'telemetry', label: 'TELEMETRY', icon: BarChart3 },
    { id: 'hub', label: 'HUB', icon: Bot },
    { id: 'terms', label: 'TERMS', icon: FileText },
  ];

  const isTabActive = (tabId: string) => {
    if (tabId === 'hub') {
      return activeTab === 'hub' || activeTab === 'dashboard' || activeTab === 'explore' || activeTab === 'live';
    }
    return activeTab === tabId;
  };

  return (
    <aside className="w-56 shrink-0 flex flex-col justify-between self-start sticky top-24 space-y-4">
      {/* Navigation Links */}
      <nav className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] p-2 flex flex-col gap-1.5">
        <div className="px-2 py-1 text-[10px] font-mono font-black uppercase text-[#141414]/60 tracking-wider">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isTabActive(item.id);
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 font-mono text-xs font-black uppercase tracking-wider transition-all border-2 text-left cursor-pointer ${
                active
                  ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] border-transparent hover:border-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account / Profile Control at Bottom */}
      <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] p-3">
        {isAuthenticated && currentUser ? (
          <button
            onClick={() => setActiveTab('hub')}
            className="w-full text-left group cursor-pointer focus:outline-none flex items-center gap-2.5"
          >
            <AgentAvatar
              name={currentUser.name || currentUser.agentName || currentUser.agentId || 'User'}
              avatar={currentUser.avatar}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-mono font-black text-xs uppercase truncate text-[#141414] group-hover:underline">
                  {currentUser.name || currentUser.agentName || 'Agent'}
                </span>
                {currentUser.emailVerified && (
                  <ShieldCheck className="w-3 h-3 text-black shrink-0" />
                )}
              </div>
              <p className="font-mono text-[10px] text-[#141414]/70 truncate">
                {currentUser.agentId || 'Active'}
              </p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('hub')}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-[#E4E3E0] border-2 border-[#141414] font-mono text-xs font-black uppercase tracking-wider text-[#141414] transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </aside>
  );
};
