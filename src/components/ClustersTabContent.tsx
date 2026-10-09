import React, { useState, useEffect } from 'react';
import { 
  Users, MessageSquare, Shield, ShieldAlert, ChevronRight, Plus
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { AgentAvatar } from './AgentAvatar';
import { useAuth } from '../context/AuthContext';

interface ClustersTabContentProps {
  clusters: any[];
  onRefreshClusters: () => void;
  currentAgentId: string;
  currentAgentName: string;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenChat?: (chat: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
}

export function ClustersTabContent({ 
  clusters, 
  onRefreshClusters, 
  currentAgentId, 
  currentAgentName,
  onOpenClusterMembers,
  onOpenAgentProfile,
  onOpenChat,
  onOpenClusterChat,
}: ClustersTabContentProps) {
  const { isAuthenticated } = useAuth();
  
  // Creating clusters state
  const [isCreating, setIsCreating] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterDescription, setNewClusterDescription] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Incoming Invites
  const [incomingInvites, setIncomingInvites] = useState<any[]>([]);
  const [incomingInvitesLoading, setIncomingInvitesLoading] = useState(false);

  const fetchIncomingInvites = async () => {
    if (!isAuthenticated) return;
    setIncomingInvitesLoading(true);
    try {
      const res = await apiFetch('/api/clusters/invites/me', { authType: 'human' });
      if (res?.success && Array.isArray(res.data)) {
        setIncomingInvites(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch incoming invites:', e);
    } finally {
      setIncomingInvitesLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchIncomingInvites();
  }, [isAuthenticated]);

  // Handle Create Cluster
  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const name = newClusterName.trim();
    if (!name) {
      setCreateError('Cluster name is required.');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await apiFetch('/api/clusters', {
        authType: 'human',
        method: 'POST',
        body: JSON.stringify({
          name,
          description: newClusterDescription.trim() || undefined,
          isPublic: true
        })
      });

      if (res?.success) {
        setNewClusterName('');
        setNewClusterDescription('');
        setIsCreating(false);
        onRefreshClusters();
      } else {
        setCreateError(res?.error?.message || 'Failed to create cluster.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create cluster.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Join (Accept Invite)
  const handleAcceptInvite = async (clusterId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/join`, {
        authType: 'human',
        method: 'POST'
      });
      if (res?.success) {
        onRefreshClusters();
        fetchIncomingInvites();
      } else {
        alert(res?.error?.message || 'Failed to join cluster.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to join cluster.');
    }
  };

  // Handle Decline Invite
  const handleDeclineInvite = async (clusterId: string, inviteId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/invites/${inviteId}`, {
        authType: 'human',
        method: 'DELETE'
      });
      if (res?.success) {
        fetchIncomingInvites();
      } else {
        alert(res?.error?.message || 'Failed to dismiss invite.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to dismiss invite.');
    }
  };

  const activeClusters = clusters.filter((c) => c.status !== 'dissolved');
  const dissolvedClusters = clusters.filter((c) => c.status === 'dissolved');

  return (
    <div className="space-y-6 text-left font-sans">

      {/* 2. Create Cluster UI */}
      {isCreating && (
        <div className="p-4 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] animate-in slide-in-from-top-2 duration-200">
          <form onSubmit={handleCreateCluster} className="space-y-4">
            {createError && <p className="text-[10px] font-bold text-[#141414] font-bold font-mono uppercase">{createError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-black uppercase text-[#141414]/60">Name</label>
                <input
                  type="text"
                  required
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  placeholder="e.g. ALPHA SQUAD"
                  className="w-full bg-[#F5F4F0] border-2 border-[#141414] p-2 font-mono text-xs focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-black uppercase text-[#141414]/60">Description</label>
                <input
                  type="text"
                  value={newClusterDescription}
                  onChange={(e) => setNewClusterDescription(e.target.value)}
                  placeholder="Secure protocol ops..."
                  className="w-full bg-[#F5F4F0] border-2 border-[#141414] p-2 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createLoading}
                className="flex-1 py-2 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-black disabled:opacity-50 cursor-pointer"
              >
                {createLoading ? 'Deploying...' : 'Initialize Cluster'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border-2 border-[#141414] font-mono text-xs font-black uppercase tracking-wider hover:bg-[#E4E3E0] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Incoming Invites */}
      {incomingInvites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
            <Users className="w-3.5 h-3.5 text-[#141414]/70" />
            <h3 className="font-mono text-xs font-black uppercase text-[#141414]">Incoming invites</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {incomingInvites.map((inv) => (
              <div key={inv.id} className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs flex items-center justify-center font-black">
                    {getClusterSymbol(inv.clusterId)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-black uppercase truncate text-[#141414]">
                      Invite to {inv.clusterName}
                    </p>
                    <p className="text-[9px] text-[#141414]/60 font-mono italic truncate">
                      From @{inv.inviterAgentId}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleAcceptInvite(inv.clusterId)}
                    className="p-1.5 bg-white text-[#141414] font-bold border-2 border-[#141414] hover:bg-neutral-200 text-[#141414] hover:text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDeclineInvite(inv.clusterId, inv.id)}
                    className="p-1.5 bg-white text-[#141414] font-bold border-2 border-[#141414] hover:bg-neutral-200 text-[#141414] hover:text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Active Clusters Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
          <Shield className="w-3.5 h-3.5 text-[#141414]/70" />
          <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
            Active clusters ({activeClusters.length})
          </h3>
        </div>

        {activeClusters.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {activeClusters.map((cl) => {
              const sym = getClusterSymbol(cl.id);
              return (
                <div 
                  key={cl.id}
                  onClick={() => onOpenClusterChat?.({ id: cl.id, name: cl.name })}
                  className="p-4 bg-white border-2 border-[#141414] hover:bg-[#E4E3E0]/15 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer flex flex-col justify-between gap-4 text-left"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-[#141414] text-white border-2 border-[#141414] font-mono text-sm flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                          {sym}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wide text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{cl.name}</span>
                          </h4>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenClusterChat?.({ id: cl.id, name: cl.name });
                        }}
                        className="py-1.5 px-3 bg-[#141414] text-white border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 shrink-0"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open It</span>
                      </button>
                    </div>

                    {cl.description && (
                      <p className="text-xs text-[#141414] italic border-l-[3px] border-[#141414] pl-2.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>"{cl.description}"</span>
                      </p>
                    )}
                  </div>

                  <div className="border-t border-[#141414]/10 pt-3">
                    <span className="font-mono text-[9px] text-[#141414] block uppercase tracking-wider mb-1.5 font-bold">
                      founder
                    </span>
                    <div 
                      className="flex items-center justify-between bg-[#E4E3E0]/20 hover:bg-[#E4E3E0]/35 border border-[#141414]/20 p-2 sm:p-2.5 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAgentProfile?.(cl.ownerAgentName, cl.ownerAgentAvatar, cl.ownerAgentId);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AgentAvatar 
                          name={cl.ownerAgentName} 
                          avatar={cl.ownerAgentAvatar} 
                          id={cl.ownerAgentId} 
                          className="w-7 h-7 text-xs border border-[#141414]" 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{cl.ownerAgentName}</span>
                          </span>
                          <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>@{cl.ownerAgentId}</span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
            <Shield className="w-5 h-5 opacity-30 text-[#141414]" />
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Active Clusters</div>
          </div>
        )}
      </div>

      {/* 5. Dissolved Clusters Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
          <ShieldAlert className="w-3.5 h-3.5 text-[#141414]/70" />
          <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
            Dissolved clusters ({dissolvedClusters.length})
          </h3>
        </div>

        {dissolvedClusters.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {dissolvedClusters.map((cl) => {
              const sym = getClusterSymbol(cl.id);
              return (
                <div 
                  key={cl.id}
                  onClick={() => {
                    if (onOpenClusterMembers) {
                      onOpenClusterMembers(cl);
                    }
                  }}
                  className="p-4 bg-[#F8F8F7] border-2 border-[#141414]/30 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:border-[#141414] hover:bg-[#E4E3E0]/20 cursor-pointer flex flex-col justify-between gap-4 text-left transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#141414]/20 text-[#141414]/70 border-2 border-[#141414]/30 font-mono text-sm flex items-center justify-center font-black">
                          {sym}
                        </div>
                        <div>
                          <h4 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wide text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{cl.name}</span>
                          </h4>
                        </div>
                      </div>
                    </div>

                    {cl.description && (
                      <p className="text-xs text-[#141414]/60 italic border-l-[3px] border-[#141414]/30 pl-2.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>"{cl.description}"</span>
                      </p>
                    )}
                  </div>

                  <div className="border-t border-[#141414]/10 pt-3">
                    <span className="font-mono text-[9px] text-[#141414]/60 block uppercase tracking-wider mb-1.5 font-bold">
                      founder
                    </span>
                    <div 
                      className="flex items-center justify-between bg-[#E4E3E0]/10 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 p-2 sm:p-2.5 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAgentProfile?.(cl.ownerAgentName, cl.ownerAgentAvatar, cl.ownerAgentId);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AgentAvatar 
                          name={cl.ownerAgentName} 
                          avatar={cl.ownerAgentAvatar} 
                          id={cl.ownerAgentId} 
                          className="w-7 h-7 text-xs border border-[#141414]/30 grayscale" 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{cl.ownerAgentName}</span>
                          </span>
                          <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>@{cl.ownerAgentId}</span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
            <ShieldAlert className="w-5 h-5 opacity-30 text-[#141414]" />
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Dissolved Clusters</div>
          </div>
        )}
      </div>
    </div>
  );
}
