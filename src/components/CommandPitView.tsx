import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { Plus, X, Search, Pencil, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface CommandPitViewProps {
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenChat?: (chat: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
  onOpenClusterMembers?: (cluster: any) => void;
}

export const CommandPitView: React.FC<CommandPitViewProps> = ({
  onOpenAgentProfile,
  onOpenChat,
  onOpenClusterChat,
  onOpenClusterMembers,
}) => {
  const { user, activeAccount } = useAuth();
  const [activeConnections, setActiveConnections] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState<boolean>(true);
  const [isLoadingClusters, setIsLoadingClusters] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<'connections' | 'clusters'>('connections');
  const [isNewClusterOpen, setIsNewClusterOpen] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterDescription, setNewClusterDescription] = useState('');
  
  // Edit cluster state
  const [editingCluster, setEditingCluster] = useState<any | null>(null);
  const [editClusterName, setEditClusterName] = useState('');
  const [editClusterDescription, setEditClusterDescription] = useState('');
  const [editSelectedAgentIds, setEditSelectedAgentIds] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editClusterError, setEditClusterError] = useState<string | null>(null);

  const [spogMode, setSpogMode] = useState<'connections' | 'cluster' | 'edit-cluster'>('connections');
  const [selectedSpogAgentIds, setSelectedSpogAgentIds] = useState<string[]>([]);
  const [isSpogModalOpen, setIsSpogModalOpen] = useState(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState('');
  
  const [creatingCluster, setCreatingCluster] = useState(false);
  const [createClusterError, setCreateClusterError] = useState<string | null>(null);

  const fetchClusters = useCallback(() => {
    setIsLoadingClusters(true);
    apiFetch('/api/clusters', { authType: 'human' })
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setClusters(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingClusters(false);
      });
  }, []);

  const fetchConnectionsAndFleet = useCallback(async () => {
    setIsLoadingConnections(true);
    try {
      const [connRes, masterRes] = await Promise.allSettled([
        apiFetch('/api/connections', { authType: 'human' }),
        apiFetch('/api/auth/master/accounts', { authType: 'human' }),
      ]);

      const connectionsMap = new Map<string, any>();

      if (connRes.status === 'fulfilled' && connRes.value) {
        const val = connRes.value;
        const list = val?.data?.connections || val?.data || [];
        if (Array.isArray(list)) {
          list.forEach((c: any) => {
            if (c && c.status !== 'dissolved') {
              const aid = (c.agentId || c.agentName || '').toUpperCase();
              if (aid) {
                connectionsMap.set(aid, {
                  id: c.id || c.connectionId,
                  connectionId: c.connectionId || c.id,
                  agentId: c.agentId,
                  agentName: c.agentName || c.agentId,
                  avatar: c.avatar,
                  peerE2eePublicKey: c.peerE2eePublicKey,
                  isMaster: Boolean(c.isMaster),
                  isSlave: Boolean(c.isSlave),
                  status: c.status || 'active',
                });
              }
            }
          });
        }
      }

      if (masterRes.status === 'fulfilled' && masterRes.value?.success && masterRes.value?.data) {
        const data = masterRes.value.data;
        const currentActiveId = data.activeAgentId;
        const masterAgent = data.masterAgent;
        const slaveAgents = data.subAgents || data.slaveAgents || [];

        if (Array.isArray(slaveAgents)) {
          slaveAgents.forEach((s: any) => {
            if (s && s.agentId) {
              const isCurrent = s.id === currentActiveId || s.agentId === currentActiveId;
              if (!isCurrent) {
                const sKey = s.agentId.toUpperCase();
                const existing = connectionsMap.get(sKey);
                const fallbackConnId = currentActiveId ? `conn_${currentActiveId}_${s.id}` : `conn_${s.id}_fleet`;
                connectionsMap.set(sKey, {
                  id: existing?.id || existing?.connectionId || fallbackConnId,
                  connectionId: existing?.connectionId || existing?.id || fallbackConnId,
                  agentId: s.agentId,
                  agentName: s.name || s.agentId,
                  avatar: s.avatar,
                  peerE2eePublicKey: existing?.peerE2eePublicKey,
                  isMaster: false,
                  isSlave: true,
                  status: 'active',
                });
              }
            }
          });
        }

        if (masterAgent?.agentId) {
          connectionsMap.delete(masterAgent.agentId.toUpperCase());
        }
        if (masterAgent?.id) {
          connectionsMap.delete(masterAgent.id.toUpperCase());
        }
        if (currentActiveId) {
          connectionsMap.delete(String(currentActiveId).toUpperCase());
        }
      }

      const mergedList = Array.from(connectionsMap.values());
      mergedList.sort((a, b) => {
        if (a.isMaster && !b.isMaster) return -1;
        if (!a.isMaster && b.isMaster) return 1;
        return (a.agentName || '').localeCompare(b.agentName || '');
      });

      setActiveConnections(mergedList);
    } catch (err) {
      console.warn('Failed to fetch connections and fleet:', err);
    } finally {
      setIsLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectionsAndFleet();
    fetchClusters();

    const handleAccountUpdate = () => {
      fetchConnectionsAndFleet();
      fetchClusters();
    };

    window.addEventListener('account-changed', handleAccountUpdate);
    window.addEventListener('aamarva-plan-updated', handleAccountUpdate);
    window.addEventListener('cluster-updated', handleAccountUpdate);

    return () => {
      window.removeEventListener('account-changed', handleAccountUpdate);
      window.removeEventListener('aamarva-plan-updated', handleAccountUpdate);
      window.removeEventListener('cluster-updated', handleAccountUpdate);
    };
  }, [fetchConnectionsAndFleet, fetchClusters]);

  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClusterName.trim()) {
      setCreateClusterError('Cluster name is required.');
      return;
    }
    setCreatingCluster(true);
    setCreateClusterError(null);
    try {
      const res = await apiFetch('/api/clusters', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({
          name: newClusterName.trim(),
          description: newClusterDescription.trim() || undefined,
          memberAgentIds: selectedSpogAgentIds,
        }),
      });
      if (res?.success) {
        setIsNewClusterOpen(false);
        setNewClusterName('');
        setNewClusterDescription('');
        setSelectedSpogAgentIds([]);
        fetchClusters();
      } else {
        setCreateClusterError(res?.error?.message || 'Failed to create cluster.');
      }
    } catch (err: any) {
      setCreateClusterError(err?.message || 'Failed to create cluster.');
    } finally {
      setCreatingCluster(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-175px)] sm:h-[calc(100dvh-150px)] md:h-[calc(100dvh-135px)] max-h-[calc(100dvh-135px)] flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden">
      <div className="shrink-0 mb-3 flex items-center justify-between">
        <h2 className="font-mono text-lg sm:text-xl font-black uppercase text-[#141414] inline-block border-b-2 border-[#141414] pb-1">
          Command Pit
        </h2>
      </div>

      <div className="flex md:hidden items-center border-2 border-[#141414] mb-3 shrink-0 p-0.5 bg-[#E4E3E0]/40 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
        <button
          type="button"
          onClick={() => setMobileTab('connections')}
          className={`flex-1 py-1.5 px-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer ${
            mobileTab === 'connections'
              ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
              : 'text-[#141414] hover:bg-[#141414]/10'
          }`}
        >
          Connections ({activeConnections.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('clusters')}
          className={`flex-1 py-1.5 px-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer ${
            mobileTab === 'clusters'
              ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
              : 'text-[#141414] hover:bg-[#141414]/10'
          }`}
        >
          Clusters ({clusters.length})
        </button>
      </div>

      <div className="flex-1 min-h-0 relative grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 h-full">
        <div className={`flex-col h-full min-h-0 pr-0 md:pr-6 ${mobileTab !== 'connections' ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between shrink-0 mb-2.5">
            <h3 className="font-mono text-sm font-black uppercase text-[#141414]">
              Connections ({activeConnections.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setSpogMode('connections');
                setIsSpogModalOpen(true);
              }}
              className="flex items-center gap-1 bg-[#141414] text-white px-2.5 py-1 text-xs font-mono font-bold border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
            >
              <span>SPOG</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-2 space-y-3">
            {isLoadingConnections ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <BrutalistLoader text="Synchronizing Connections" size="sm" />
              </div>
            ) : activeConnections.length > 0 ? (
              activeConnections.map((conn) => (
                <div
                  key={conn.id || conn.agentId}
                  className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                      className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 hover:opacity-85 transition-opacity"
                    >
                      <AgentAvatar
                        name={conn.agentName}
                        avatar={conn.avatar}
                        id={conn.agentId}
                        className="w-9 h-9 border border-[#141414] shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs uppercase truncate text-[#141414]">
                            {conn.agentName}
                          </span>
                        </div>
                        {conn.agentId && (
                          <span className="font-mono text-[10px] text-[#141414]/60 truncate mt-0.5">
                            @{conn.agentId.replace(/^@/, '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenChat?.({
                        id: conn.id || conn.connectionId,
                        agentName: conn.agentName,
                        avatar: conn.avatar,
                        agentId: conn.agentId,
                        peerE2eePublicKey: conn.peerE2eePublicKey,
                      })}
                      className="bg-[#141414] text-white py-1 px-3 text-[10px] font-mono font-bold hover:bg-black/80 transition-colors shrink-0 cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                      title={`Command ${conn.agentName}`}
                    >
                      COMMAND
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 border-2 border-dashed border-[#141414]/30 text-center text-[#141414]/50 font-mono text-xs">
                NO CONNECTIONS
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:block absolute left-1/2 inset-y-0 w-[2px] bg-[#141414]/30 -ml-[1px] pointer-events-none" />

        <div className={`flex-col h-full min-h-0 pl-0 md:pl-6 ${mobileTab !== 'clusters' ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between shrink-0 mb-2.5">
            <h3 className="font-mono text-sm font-black uppercase text-[#141414]">Clusters ({clusters.length})</h3>
            <button
              type="button"
              onClick={() => setIsNewClusterOpen(true)}
              className="flex items-center gap-1 bg-[#141414] text-white px-2.5 py-1 text-xs font-mono font-bold border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>NEW CLUSTER</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-2 space-y-3">
             {isLoadingClusters ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <BrutalistLoader text="Synchronizing Clusters" size="sm" />
              </div>
            ) : clusters.length > 0 ? (
              clusters.map((cluster) => {
                const symbol = cluster.symbol || getClusterSymbol(cluster.id);
                return (
                  <div
                    key={cluster.id}
                    className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div
                        onClick={() => {
                          if (onOpenClusterMembers) {
                            onOpenClusterMembers(cluster);
                          } else if (onOpenClusterChat) {
                            onOpenClusterChat({ id: cluster.id, name: cluster.name });
                          }
                        }}
                        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 hover:opacity-85 transition-opacity"
                        title="Click to view Cluster Members"
                      >
                        <div className="w-9 h-9 bg-[#141414] text-white border border-[#141414] font-mono text-xs flex items-center justify-center font-black shrink-0 select-none shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                          {symbol}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-xs uppercase truncate text-[#141414]">
                            {cluster.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenClusterMembers) {
                              onOpenClusterMembers({ ...cluster, initialEdit: true });
                            }
                          }}
                          className="bg-white text-[#141414] border-2 border-[#141414] py-1 px-2.5 text-[10px] font-mono font-bold hover:bg-[#141414] hover:text-white transition-colors shrink-0 cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                          title={`Edit Cluster ${cluster.name}`}
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenClusterChat?.({ id: cluster.id, name: cluster.name })}
                          className="bg-[#141414] text-white py-1 px-3 text-[10px] font-mono font-bold hover:bg-black/80 transition-colors shrink-0 cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                          title={`Command Cluster ${cluster.name}`}
                        >
                          COMMAND
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 border-2 border-dashed border-[#141414]/30 text-center text-[#141414]/50 font-mono text-xs">NO CLUSTERS</div>
            )}
          </div>
        </div>
      </div>

      {isNewClusterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 space-y-4">
             <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3">
              <h3 className="font-mono text-base font-black uppercase">Create New Cluster</h3>
              <button
                onClick={() => setIsNewClusterOpen(false)}
                className="p-1 hover:bg-[#141414]/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-[#141414]" />
              </button>
            </div>
            {createClusterError && (
              <div className="p-3 bg-red-100 border-2 border-red-500 text-red-700 font-mono text-xs">
                {createClusterError}
              </div>
            )}
            <form onSubmit={handleCreateCluster} className="space-y-4">
              <div className="space-y-1">
                <label className="block font-mono text-xs font-bold uppercase text-[#141414]">Cluster Name</label>
                <input
                  type="text"
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  placeholder="e.g. ALPHA ENCLAVE"
                  className="w-full border-2 border-[#141414] p-2 font-mono text-xs bg-white text-[#141414] focus:outline-none"
                  maxLength={50}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-mono text-xs font-bold uppercase text-[#141414]">Description (Optional)</label>
                <textarea
                  value={newClusterDescription}
                  onChange={(e) => setNewClusterDescription(e.target.value)}
                  placeholder="Cluster enclave purpose and directives..."
                  rows={2}
                  className="w-full border-2 border-[#141414] p-2 font-mono text-xs bg-white text-[#141414] focus:outline-none resize-none"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-xs font-bold uppercase text-[#141414]">
                    Select Agents to Add
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSpogMode('cluster');
                        setIsSpogModalOpen(true);
                      }}
                      className="px-2 py-0.5 bg-white text-[#141414] border-2 border-[#141414] text-[10px] font-mono font-bold uppercase hover:bg-[#141414] hover:text-white transition-colors cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]"
                    >
                      SPOG
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedSpogAgentIds.length === activeConnections.length && activeConnections.length > 0) {
                          setSelectedSpogAgentIds([]);
                        } else {
                          setSelectedSpogAgentIds(activeConnections.map(c => c.agentId || c.id));
                        }
                      }}
                      className="px-2 py-0.5 bg-white border-2 border-[#141414] font-mono text-[10px] font-bold uppercase text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]"
                    >
                      {selectedSpogAgentIds.length === activeConnections.length && activeConnections.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>
                <div className="max-h-36 overflow-y-auto border-2 border-[#141414] p-2 space-y-1.5 bg-[#E4E3E0]/20 custom-scrollbar">
                  {activeConnections.length > 0 ? (
                    activeConnections.map((conn) => {
                      const agentIdentifier = conn.agentId || conn.id;
                      const isSelected = selectedSpogAgentIds.includes(agentIdentifier);
                      return (
                        <div
                          key={agentIdentifier}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSpogAgentIds(selectedSpogAgentIds.filter(id => id !== agentIdentifier));
                            } else {
                              setSelectedSpogAgentIds([...selectedSpogAgentIds, agentIdentifier]);
                            }
                          }}
                          className={`flex items-center justify-between p-2 border border-[#141414] cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-[#141414]/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <AgentAvatar
                              name={conn.agentName}
                              avatar={conn.avatar}
                              id={conn.agentId}
                              className="w-6 h-6 border border-[#141414] shrink-0"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-xs truncate uppercase">{conn.agentName}</span>
                              <span className={`font-mono text-[10px] truncate ${isSelected ? 'text-white/80' : 'text-[#141414]/60'}`}>
                                @{conn.agentId || conn.id} {conn.isMaster ? '(Master)' : conn.isSlave ? '(Slave)' : ''}
                              </span>
                            </div>
                          </div>
                          <div className={`w-4 h-4 border-2 border-[#141414] flex items-center justify-center font-mono text-xs ${isSelected ? 'bg-white text-[#141414]' : 'bg-white'}`}>
                            {isSelected ? '✓' : ''}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center font-mono text-xs text-[#141414]/50 py-2">
                      No associated agents or fleet members available
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewClusterOpen(false)}
                  className="px-4 py-2 border-2 border-[#141414] font-mono text-xs font-bold uppercase hover:bg-[#141414]/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCluster}
                  className="px-4 py-2 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs font-bold uppercase hover:bg-black/80 transition-colors disabled:opacity-50 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  {creatingCluster ? 'Creating...' : 'Create Cluster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSpogModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] flex flex-col font-mono">
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">
                SPOG - FLEET OVERVIEW ({activeConnections.length} ACTIVE AGENTS)
              </span>
              <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-[#141414]">
                  {spogMode === 'cluster' ? 'Slave Selection Protocol' : 'Slave command Protocol'}
                </span>
                {spogMode === 'cluster' && (
                  <div className="flex items-center gap-1.5 p-1 bg-white border border-[#141414]/20 shadow-inner">
                    <button
                      type="button"
                      onClick={() => setSelectedSpogAgentIds(activeConnections.map(c => c.agentId || c.id))}
                      className="text-[9px] font-black uppercase border-2 border-[#141414] px-1.5 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSpogAgentIds([])}
                      className="text-[9px] font-black uppercase border-2 border-[#141414] px-1.5 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search Slave"
                  value={spogSearchQuery}
                  onChange={(e) => setSpogSearchQuery(e.target.value)}
                  className="px-2.5 py-1 text-xs font-bold uppercase bg-white border-2 border-[#141414] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {(() => {
                const filteredAgents = activeConnections.filter((conn: any) => {
                  if (!spogSearchQuery.trim()) return true;
                  const query = spogSearchQuery.toLowerCase();
                  const name = (conn.agentName || '').toLowerCase();
                  const agentId = (conn.agentId || '').toLowerCase();
                  return name.includes(query) || agentId.includes(query);
                });

                if (filteredAgents.length === 0) {
                  return (
                    <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                      No agents match search query
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredAgents.map((conn: any) => {
                      const agentId = conn.agentId || conn.id;
                      const isSelected = spogMode === 'cluster' && selectedSpogAgentIds.includes(agentId);
                      return (
                      <div
                        key={agentId}
                        onClick={() => {
                          if (spogMode === 'cluster') {
                            if (isSelected) {
                              setSelectedSpogAgentIds(selectedSpogAgentIds.filter(id => id !== agentId));
                            } else {
                              setSelectedSpogAgentIds([...selectedSpogAgentIds, agentId]);
                            }
                          } else {
                             // Original functionality
                             onOpenChat?.({
                                id: conn.id || conn.connectionId,
                                agentName: conn.agentName,
                                avatar: conn.avatar,
                                agentId: conn.agentId,
                                peerE2eePublicKey: conn.peerE2eePublicKey,
                              });
                              setIsSpogModalOpen(false);
                          }
                        }}
                        className={`p-2.5 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between gap-2 cursor-pointer ${isSelected ? 'bg-[#141414] text-white' : 'bg-white'}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <AgentAvatar
                            name={conn.agentName}
                            avatar={conn.avatar}
                            id={conn.agentId}
                            className="w-8 h-8 border border-[#141414] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase truncate">
                              {conn.agentName}
                            </p>
                            <p className={`text-[10px] font-mono truncate ${isSelected ? 'text-white/70' : 'text-[#141414]/70'}`}>
                              @{agentId}
                            </p>
                          </div>
                        </div>
                        
                        {spogMode === 'cluster' ? (
                          <div className="flex items-center justify-end pt-2 border-t border-[#141414]/15">
                             <div className={`w-4 h-4 border-2 ${isSelected ? 'border-white bg-white text-[#141414]' : 'border-[#141414]'} flex items-center justify-center font-mono text-xs`}>
                               {isSelected ? '✓' : ''}
                             </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between pt-2 border-t border-[#141414]/15">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsSpogModalOpen(false);
                                    onOpenChat?.({
                                        id: conn.id || conn.connectionId,
                                        agentName: conn.agentName,
                                        avatar: conn.avatar,
                                        agentId: conn.agentId,
                                        peerE2eePublicKey: conn.peerE2eePublicKey,
                                    });
                                }}
                                className="px-2 py-0.5 bg-[#141414] text-white text-[9px] font-bold uppercase hover:bg-black/80 transition-colors cursor-pointer"
                            >
                                Command
                            </button>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                );
              })()}
            </div>
            
            {spogMode === 'cluster' && (
                <div className="bg-[#141414] text-white p-4 shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            setIsSpogModalOpen(false);
                        }}
                        className="w-full bg-white text-[#141414] py-3 font-black uppercase text-sm tracking-widest border-2 border-white hover:bg-neutral-200 transition-colors"
                    >
                        APPLY SELECTION & CLOSE
                    </button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
