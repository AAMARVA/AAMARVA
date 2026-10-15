import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowLeft, AlertCircle, Edit3, Check, Users, Plus } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch } from '../services/authApi';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { useAuth } from '../context/AuthContext';

export interface SpogAgent {
  id: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  role?: string;
  isSlave?: boolean;
}

export interface ClusterMember {
  id: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  role?: string;
  status?: string;
  emailVerified?: boolean;
}

export interface ClusterData {
  id: string;
  name: string;
  description?: string;
  ownerAgentId: string;
  ownerName?: string;
  ownerAvatar?: string;
  ownerAgentName?: string;
  ownerAgentAvatar?: string;
  status?: string;
  createdAt?: string;
  members?: ClusterMember[];
}

interface ClusterMembersModalProps {
  cluster: ClusterData | null;
  isOpen?: boolean;
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onClusterUpdated?: (updatedCluster: ClusterData) => void;
}

// Modal component to display cluster members
export const ClusterMembersModal: React.FC<ClusterMembersModalProps> = ({
  cluster,
  isOpen,
  onClose,
  onBack,
  onOpenAgentProfile,
  onClusterUpdated,
}) => {
  const { user, activeAccount, isAuthenticated } = useAuth();
  const [members, setMembers] = useState<ClusterMember[]>([]);
  const [clusterInfo, setClusterInfo] = useState<ClusterData | null>(cluster);
  const [loading, setLoading] = useState(false);

  // Edit cluster state (admin or master only)
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // SPOG state for cluster edit
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isSpogModalOpen, setIsSpogModalOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<SpogAgent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState('');
  const [agentToRemove, setAgentToRemove] = useState<{ agentId: string; agentName?: string } | null>(null);

  // Option called Add below SPOG
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');

  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const fetchClusterMembers = useCallback(async (cId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/public/${cId}/members`, { authType: 'none' });
      if (res?.success && res?.data) {
        if (res.data.cluster) {
          setClusterInfo((prev) => ({ ...prev, ...res.data.cluster }));
        }
        if (Array.isArray(res.data.members)) {
          setMembers(res.data.members);
        }
      }
    } catch (e) {
      console.warn('Failed to refresh cluster members:', e);
    }
  }, []);

  const fetchAvailableAgents = useCallback(async () => {
    // Immediately seed with existing cluster members so the UI is responsive without waiting
    const map = new Map<string, SpogAgent>();
    membersRef.current.forEach((m) => {
      if (m.agentId) {
        map.set(m.agentId.toUpperCase(), {
          id: m.id || m.agentId,
          agentId: m.agentId,
          agentName: m.agentName || m.agentId,
          avatar: m.avatar,
          role: m.role,
        });
      }
    });

    if (map.size > 0) {
      setAvailableAgents((prev) => {
        const merged = new Map(map);
        prev.forEach((p) => {
          if (!merged.has(p.agentId.toUpperCase())) {
            merged.set(p.agentId.toUpperCase(), p);
          }
        });
        return Array.from(merged.values());
      });
    }

    // Only display full-screen loader if we have zero available agents to display
    setAvailableAgents((curr) => {
      if (curr.length === 0 && map.size === 0) {
        setIsLoadingAgents(true);
      }
      return curr;
    });

    try {
      // Safe fetch helper with 1.5s timeout guarantee to avoid hanging
      const safeFetchWithTimeout = async (url: string) => {
        try {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
          const fetchCall = apiFetch(url, { authType: 'human' }).catch(() => null);
          return await Promise.race([fetchCall, timeout]);
        } catch {
          return null;
        }
      };

      const [connRes, masterRes] = await Promise.all([
        safeFetchWithTimeout('/api/connections'),
        safeFetchWithTimeout('/api/auth/master/accounts'),
      ]);

      // Active connections
      if (connRes && (connRes.data?.connections || connRes.data)) {
        const list = connRes.data?.connections || connRes.data || [];
        if (Array.isArray(list)) {
          list.forEach((c: any) => {
            if (c && c.status !== 'dissolved' && (c.agentId || c.agentName)) {
              const aid = (c.agentId || c.agentName).toUpperCase();
              if (!map.has(aid)) {
                map.set(aid, {
                  id: c.id || c.connectionId || aid,
                  agentId: c.agentId || aid,
                  agentName: c.agentName || c.agentId || aid,
                  avatar: c.avatar,
                  role: c.role || 'member',
                  isSlave: Boolean(c.isSlave),
                });
              }
            }
          });
        }
      }

      // Sub-agents / fleet from master accounts
      if (masterRes && masterRes.success && masterRes.data) {
        const data = masterRes.data;
        const subAgents = data.subAgents || data.slaveAgents || [];
        if (Array.isArray(subAgents)) {
          subAgents.forEach((s: any) => {
            if (s && s.agentId) {
              const aid = s.agentId.toUpperCase();
              if (!map.has(aid)) {
                map.set(aid, {
                  id: s.id || aid,
                  agentId: s.agentId,
                  agentName: s.name || s.agentId,
                  avatar: s.avatar,
                  role: 'member',
                  isSlave: true,
                });
              }
            }
          });
        }
      }

      setAvailableAgents(Array.from(map.values()));
    } catch (e) {
      console.warn('Failed to load fleet agents for SPOG:', e);
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (agentToRemove) {
          setAgentToRemove(null);
        } else if (isSpogModalOpen) {
          setIsSpogModalOpen(false);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, agentToRemove, isSpogModalOpen, isEditing]);

  useEffect(() => {
    if (!cluster) return;
    setClusterInfo(cluster);

    const isInitialEdit = Boolean((cluster as any)?.initialEdit);
    if (isInitialEdit) {
      setIsEditing(true);
      setEditName(cluster.name || '');
      setEditDescription(cluster.description || (cluster as any)?.description || '');
      setEditError(null);
      fetchAvailableAgents();
    } else {
      setIsEditing(false);
    }

    let isMounted = true;
    setLoading(true);

    const clusterId = cluster.id || (cluster as any)?.clusterId || (cluster as any)?.cluster_id || 'cluster_alpha_secret';
    const ownerAgentId = cluster.ownerAgentId || (cluster as any)?.owner_agent_id || 'AMR-TW43-24WU';
    const ownerName = cluster.ownerName || cluster.ownerAgentName || (cluster as any)?.owner_name || (cluster as any)?.owner_agent_name || ownerAgentId || 'Agent';
    const ownerAvatar = cluster.ownerAvatar || cluster.ownerAgentAvatar || (cluster as any)?.owner_avatar || (cluster as any)?.owner_agent_avatar || undefined;

    apiFetch(`/api/clusters/public/${clusterId}/members`, { authType: 'none' })
      .then((res) => {
        if (!isMounted) return;
        if (res?.success && res?.data) {
          if (res.data.cluster) {
            setClusterInfo((prev) => ({ ...prev, ...res.data.cluster }));
          }
          let fetchedMembers: ClusterMember[] = res.data.members || [];
          
          if (fetchedMembers.length === 0) {
            fetchedMembers = [
              {
                id: `admin-${clusterId}`,
                agentId: ownerAgentId,
                agentName: ownerName,
                avatar: ownerAvatar,
                role: 'admin',
                emailVerified: true,
              },
            ];
          }
          setMembers(fetchedMembers);
          const currentMemberIds = fetchedMembers
            .filter((m) => m.status !== 'dissolved')
            .map((m) => m.agentId)
            .filter(Boolean);
          if (!isEditingRef.current) setSelectedAgentIds(currentMemberIds);
        } else {
          const fallbackMembers = [
            {
              id: `admin-${clusterId}`,
              agentId: ownerAgentId,
              agentName: ownerName,
              avatar: ownerAvatar,
              role: 'admin',
              emailVerified: true,
            },
          ];
          setMembers(fallbackMembers);
          if (!isEditingRef.current) setSelectedAgentIds([ownerAgentId]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const fallbackMembers = [
          {
            id: `admin-${clusterId}`,
            agentId: ownerAgentId,
            agentName: ownerName,
            avatar: ownerAvatar,
            role: 'admin',
            emailVerified: true,
          },
        ];
        setMembers(fallbackMembers);
        if (!isEditingRef.current) setSelectedAgentIds([ownerAgentId]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [cluster, fetchAvailableAgents]);

  const current = activeAccount || user;
  const currentProfile = current ? ((current as any).profile || current) : null;
  const currentAgentId = (currentProfile?.agentId || (currentProfile as any)?.agent_id || '').toLowerCase();
  const currentUserId = (currentProfile?.id || '').toLowerCase();

  const isMaster = Boolean(
    currentProfile?.account_type === 'master' ||
    currentProfile?.isMasterUser === true ||
    currentProfile?.is_master_primary === true ||
    currentProfile?.isMasterPrimary === true ||
    user?.account_type === 'master' ||
    (user as any)?.isMasterUser === true ||
    (user as any)?.is_master_primary === true ||
    (user as any)?.isMasterPrimary === true
  );

  const ownerAgentId = (
    clusterInfo?.ownerAgentId || 
    (clusterInfo as any)?.owner_agent_id || 
    cluster?.ownerAgentId || 
    (cluster as any)?.owner_agent_id || 
    ''
  ).toLowerCase();

  const ownerUserId = (
    (clusterInfo as any)?.ownerUserId || 
    (clusterInfo as any)?.owner_user_id || 
    (cluster as any)?.ownerUserId || 
    (cluster as any)?.owner_user_id || 
    ''
  ).toLowerCase();

  const isOwner = Boolean(
    (ownerAgentId && currentAgentId && ownerAgentId === currentAgentId) ||
    (ownerUserId && currentUserId && ownerUserId === currentUserId)
  );

  const isAdminMember = members.some((m) => {
    const mAgentId = (m.agentId || '').toLowerCase();
    const mUserId = (m.id || '').toLowerCase();
    const matchesUser = (mAgentId && currentAgentId && mAgentId === currentAgentId) ||
                        (mUserId && currentUserId && mUserId === currentUserId);
    return matchesUser && (m.role === 'admin' || m.role === 'owner');
  });

  const canEdit = isAuthenticated && (isMaster || isOwner || isAdminMember || (clusterInfo as any)?.role === 'admin' || (cluster as any)?.role === 'admin');

  const startEditing = useCallback(() => {
    setEditName(clusterInfo?.name || cluster?.name || '');
    setEditDescription(clusterInfo?.description || (cluster as any)?.description || '');
    setEditError(null);
    const currentMemberIds = members
      .filter((m) => m.status !== 'dissolved')
      .map((m) => m.agentId)
      .filter(Boolean);
    setSelectedAgentIds(currentMemberIds);
    fetchAvailableAgents();
    setIsEditing(true);
  }, [clusterInfo, cluster, members, fetchAvailableAgents]);

  const handleConfirmRemove = () => {
    if (!agentToRemove) return;
    if (agentToRemove.agentId === 'ALL') {
      setSelectedAgentIds([]);
    } else {
      setSelectedAgentIds((prev) =>
        prev.filter((id) => id.toLowerCase() !== agentToRemove.agentId.toLowerCase())
      );
    }
    setAgentToRemove(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Cluster name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    const clusterId = clusterInfo?.id || cluster?.id || (cluster as any)?.clusterId || (cluster as any)?.cluster_id;
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}`, {
        authType: 'human',
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          description: editDescription.trim() || undefined,
          memberAgentIds: selectedAgentIds,
        }),
      });

      if (res?.success) {
        const updatedClusterData: ClusterData = {
          ...cluster,
          ...clusterInfo,
          name: trimmedName,
          description: editDescription.trim() || undefined,
        } as ClusterData;

        setClusterInfo(updatedClusterData);
        setIsEditing(false);
        fetchClusterMembers(clusterId);
        if (onClusterUpdated) {
          onClusterUpdated(updatedClusterData);
        }
        window.dispatchEvent(
          new CustomEvent('cluster-updated', {
            detail: {
              id: clusterId,
              name: trimmedName,
              description: editDescription.trim() || undefined,
              memberAgentIds: selectedAgentIds,
            },
          })
        );
      } else {
        setEditError(res?.error?.message || 'Failed to update cluster.');
      }
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update cluster.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isOpen === false || !cluster) return null;

  const clusterTitle = (clusterInfo?.name || cluster.name || 'ALPHA SECRET CLUSTER').toUpperCase();
  const isClusterDissolved = (clusterInfo?.status || (cluster as any)?.status) === 'dissolved';

  return (
    <>
      <div 
        className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (isEditing) {
              setIsEditing(false);
            } else {
              onClose();
            }
          }
        }}
      >
        <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
          
          {/* Header */}
          <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditError(null);
                  }}
                  className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1 shrink-0"
                  title="Cancel Edit"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              ) : onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1 shrink-0"
                  title="Back"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              ) : null}
              <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-[0.1em] text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                <span>{isEditing ? 'EDIT CLUSTER' : 'CLUSTER'}</span>
              </h3>
            </div>
            <button
              onClick={onClose}
              className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          {isEditing ? (
            /* ========================================================= */
            /* EDIT CLUSTER OPTION: ONLY NAME, DESCRIPTION, AND SPOG     */
            /* ========================================================= */
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 sm:p-5 bg-white">
              <form onSubmit={handleSaveEdit} className="space-y-4">
                {editError && (
                  <div className="p-2.5 bg-red-100 border-2 border-red-500 text-red-700 font-mono text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* 1. Name */}
                <div className="space-y-1.5">
                  <label className="block font-mono text-xs font-black uppercase tracking-wider text-[#141414]">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="CLUSTER NAME"
                    maxLength={50}
                    required
                    className="w-full bg-white border-2 border-[#141414] p-2.5 font-mono font-bold text-xs uppercase focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>

                {/* 2. Description */}
                <div className="space-y-1.5">
                  <label className="block font-mono text-xs font-black uppercase tracking-wider text-[#141414]">
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Cluster description..."
                    rows={3}
                    maxLength={200}
                    className="w-full bg-white border-2 border-[#141414] p-2.5 font-mono text-xs focus:outline-none resize-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] leading-relaxed"
                  />
                </div>

                {/* 3. SPOG */}
                <div className="space-y-2.5 border-2 border-[#141414] p-3.5 bg-[#E4E3E0]/20 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <div>
                    <label className="block font-mono text-xs font-black uppercase tracking-wider text-[#141414]">
                      SPOG to evaluate agents
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      fetchAvailableAgents();
                      setIsSpogModalOpen(true);
                    }}
                    className="w-full py-2.5 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
                    title="Open SPOG to select or remove agents"
                  >
                    <span>SPOG</span>
                  </button>

                  {/* Selected Agents in SPOG with option to remove */}
                  {selectedAgentIds.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setAgentToRemove({ agentId: 'ALL', agentName: 'All Agents' })}
                          className="font-mono text-[9px] font-black uppercase text-red-600 hover:underline cursor-pointer"
                        >
                          Remove All
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar border-2 border-[#141414] p-1.5 bg-white space-y-1">
                        {selectedAgentIds.map((aid) => {
                          // Isolate data lookup to current members only for this view
                          const agentObj = members.find((m) => m.agentId.toLowerCase() === aid.toLowerCase());
                          const displayName = agentObj?.agentName || aid;
                          return (
                            <div
                              key={aid}
                              onClick={() => setAgentToRemove({ agentId: aid, agentName: displayName })}
                              className="flex items-center justify-between p-2 bg-[#F5F4F0] border border-[#141414] hover:bg-red-50 hover:border-red-500 transition-colors cursor-pointer group"
                              title="Click or select to remove from cluster"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <AgentAvatar
                                  name={displayName}
                                  avatar={agentObj?.avatar}
                                  id={aid}
                                  className="w-6 h-6 border border-[#141414] shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-mono text-xs font-black uppercase truncate text-[#141414]">
                                    {displayName}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#141414]/60 truncate">
                                    @{aid}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAgentToRemove({ agentId: aid, agentName: displayName });
                                }}
                                className="px-2 py-0.5 bg-red-600 text-white font-mono text-[9px] font-black uppercase border border-red-700 hover:bg-red-700 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 shrink-0 flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                                <span>Remove</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 4. Option called ADD below SPOG */}
                <div className="space-y-2 border-2 border-[#141414] p-3.5 bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <button
                    type="button"
                    onClick={() => {
                      fetchAvailableAgents();
                      setIsSpogModalOpen(true);
                    }}
                    className="w-full py-2.5 bg-white text-[#141414] border-2 border-[#141414] font-mono text-xs font-black uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
                    title="Add agents to cluster"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Save & Cancel */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-[#141414]">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="px-3.5 py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white hover:bg-[#E4E3E0] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 bg-[#141414] text-white border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Cluster</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ========================================================= */
            /* NORMAL VIEW: CLUSTER CARD + ASSEMBLY MEMBERS DIRECTORY    */
            /* ========================================================= */
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-white">
              {/* Cluster Header Section */}
              <div className="border-2 border-[#141414] bg-[#E4E3E0]/30 p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 bg-[#141414] text-white border-2 border-[#141414] shrink-0 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)]">
                      <span className="font-mono font-black text-lg text-white grayscale [font-variant-emoji:text] select-none">
                        {getClusterSymbol(clusterInfo?.id || cluster.id || 'cluster_alpha_secret')}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-mono font-black uppercase text-sm sm:text-base tracking-wider text-[#141414] break-words">
                        {clusterTitle.replace(/🛡️|🛡/g, '').trim()}
                      </h2>
                    </div>
                  </div>

                  {canEdit && !isClusterDissolved && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="px-2.5 py-1 bg-white text-[#141414] border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 shrink-0"
                      title="Edit Cluster (Admin or Master only)"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>EDIT</span>
                    </button>
                  )}
                </div>

                {clusterInfo?.description && (
                  <div className="pt-2">
                    <p className="font-sans text-xs sm:text-sm text-[#141414] leading-relaxed italic border-l-[3px] border-[#141414] pl-2.5">
                      "{clusterInfo.description}"
                    </p>
                  </div>
                )}
              </div>

              {/* Assembly Header */}
              <div className="pt-3 pb-2">
                <div className="border-l-4 border-[#141414] pl-3 py-1 flex items-center justify-between">
                  <span className="font-mono font-black uppercase text-2xl sm:text-3xl tracking-widest text-[#141414]">
                    ASSEMBLY
                  </span>
                  <span className="font-mono text-[10px] sm:text-xs font-bold uppercase bg-[#141414] text-white px-2 py-0.5 border border-[#141414]">
                    MEMBERS DIRECTORY
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="py-20 flex items-center justify-center">
                  <BrutalistLoader text="Accessing Assembly" size="sm" />
                </div>
              ) : members.length > 0 ? (
                members.map((member) => (
                  <div
                    key={member.id || member.agentId}
                    className="flex items-center justify-between gap-3 p-3 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:bg-[#E4E3E0]/20 transition-all relative"
                  >
                    {(member.status === 'dissolved' || isClusterDissolved) && (
                      <span className="absolute top-2.5 right-2.5 font-mono text-[9px] font-black uppercase text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                        DISSOLVED
                      </span>
                    )}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(member.agentName, member.avatar, member.agentId)}
                        className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                        title={`View profile for ${member.agentName}`}
                      >
                        <AgentAvatar
                          name={member.agentName}
                          avatar={member.avatar}
                          id={member.agentId}
                          className="w-10 h-10 border-2 border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]"
                        />
                      </button>

                      {/* Agent Info & Badge */}
                      <div className="min-w-0 flex-1 pr-16">
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(member.agentName, member.avatar, member.agentId)}
                          className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap max-w-full flex flex-col"
                        >
                          <span className="font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span>{member.agentName}</span>
                          </span>
                          
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-hidden">
                              <span>@{member.agentId}</span>
                              {member.emailVerified && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-[#141414]">
                                  <VerifiedBadge size="xs" />
                                </span>
                              )}
                              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                            </span>

                            {member.role === 'admin' ? (
                              <span className="font-mono text-[9px] font-black uppercase text-white bg-[#141414] px-1.5 py-0.5 border border-[#141414]">
                                ADMIN
                              </span>
                            ) : (
                              <span className="font-mono text-[9px] font-black uppercase text-[#141414] bg-white px-1.5 py-0.5 border border-[#141414]">
                                MEMBER
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                  No cluster members found.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* SPOG - Slave Selection Protocol Modal for Cluster Members */}
      {isSpogModalOpen && (
        <div className="fixed inset-0 z-70 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[90vh] flex flex-col font-mono">
            {/* Header */}
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <div className="flex items-center gap-2">
                <span className="bg-white text-[#141414] px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                  SPOG
                </span>
                <span className="text-xs font-black uppercase tracking-widest">
                  SLAVE SELECTION PROTOCOL ({availableAgents.length} FLEET AGENTS)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Controls bar */}
            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-[#141414] mr-1">
                  Cluster Member Selection ({selectedAgentIds.length} Selected)
                </span>
                {isLoadingAgents && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#141414]/60 animate-pulse px-1.5 py-0.5 bg-[#E4E3E0] border border-[#141414]/20">
                    Syncing...
                  </span>
                )}
                {/* Header Actions */}
                {(() => {
                  const isAllSelected = availableAgents.length > 0 && selectedAgentIds.length === availableAgents.length;
                  const allIds = availableAgents.map((a) => a.agentId).filter(Boolean);
                  return (
                    <div className="flex items-center gap-1.5 p-1 bg-white border border-[#141414]/20 shadow-inner">
                      <button
                        type="button"
                        onClick={() => {
                          if (isAllSelected) {
                            setSelectedAgentIds([]);
                          } else {
                            setSelectedAgentIds(allIds);
                          }
                        }}
                        className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                      >
                        {isAllSelected ? 'Deselect All' : 'Select All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAgentToRemove({ agentId: 'ALL', agentName: 'All Selected Agents' });
                        }}
                        className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white text-red-600 hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="SEARCH AGENT / ID..."
                  value={spogSearchQuery}
                  onChange={(e) => setSpogSearchQuery(e.target.value)}
                  className="px-2.5 py-1 text-xs font-bold uppercase bg-white border-2 border-[#141414] focus:outline-none"
                />
              </div>
            </div>

            {/* Selected Agent Quick Bar with Removal Options */}
            {selectedAgentIds.length > 0 && (
              <div className="bg-white px-4 py-2 border-b-2 border-[#141414] flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0">
                <span className="text-[9px] font-black uppercase text-[#141414]/60 shrink-0 mr-1">
                  Selected:
                </span>
                {selectedAgentIds.map((aid) => {
                  const agentObj = availableAgents.find((a) => a.agentId.toLowerCase() === aid.toLowerCase());
                  const displayName = agentObj?.agentName || aid;
                  return (
                    <span
                      key={aid}
                      onClick={() => setAgentToRemove({ agentId: aid, agentName: displayName })}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#141414] text-white text-[9px] font-bold uppercase shrink-0 border border-[#141414] cursor-pointer hover:bg-red-600 hover:border-red-700 transition-colors"
                      title="Click to remove"
                    >
                      <span>@{aid}</span>
                      <X className="w-2.5 h-2.5 hover:text-white" />
                    </span>
                  );
                })}
              </div>
            )}

            {/* Agent Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
              {isLoadingAgents && availableAgents.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <BrutalistLoader text="Accessing Fleet Protocols" size="sm" />
                </div>
              ) : (() => {
                const filteredAgents = availableAgents.filter((agent) => {
                  if (!spogSearchQuery.trim()) return true;
                  const query = spogSearchQuery.toLowerCase();
                  const name = (agent.agentName || '').toLowerCase();
                  const id = (agent.agentId || '').toLowerCase();
                  return name.includes(query) || id.includes(query);
                });

                if (filteredAgents.length === 0) {
                  return (
                    <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                      No matching fleet agents found
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredAgents.map((agent) => {
                      const isSelected = selectedAgentIds.some(
                        (id) => id.toLowerCase() === agent.agentId.toLowerCase()
                      );
                      return (
                        <div
                          key={agent.agentId}
                          onClick={() => {
                            if (isSelected) {
                              // Deselect agent
                              setSelectedAgentIds((prev) =>
                                prev.filter((id) => id.toLowerCase() !== agent.agentId.toLowerCase())
                              );
                            } else {
                              // Select agent into cluster
                              setSelectedAgentIds((prev) => [...prev, agent.agentId]);
                            }
                          }}
                          className={`p-3 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#141414] text-white ring-2 ring-[#141414]'
                              : 'bg-white text-[#141414] hover:bg-[#E4E3E0]/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AgentAvatar
                              name={agent.agentName}
                              avatar={agent.avatar}
                              id={agent.agentId}
                              className="w-8 h-8 border border-[#141414] shrink-0"
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-bold text-xs uppercase truncate">
                                {agent.agentName}
                              </span>
                              <span
                                className={`text-[10px] truncate ${
                                  isSelected ? 'text-white/80' : 'text-[#141414]/60'
                                }`}
                              >
                                @{agent.agentId}
                              </span>
                            </div>
                            <div
                              className={`w-4 h-4 border-2 border-[#141414] flex items-center justify-center font-mono text-[10px] shrink-0 ${
                                isSelected ? 'bg-white text-[#141414]' : 'bg-white'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </div>
                          </div>

                          {/* Action area: if selected, display Remove option */}
                          {isSelected ? (
                            <div className="pt-2 border-t border-white/20 flex items-center justify-between">
                              <span className="text-[9px] font-black uppercase text-white/80">
                                In Cluster
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAgentToRemove({
                                    agentId: agent.agentId,
                                    agentName: agent.agentName || agent.agentId,
                                  });
                                }}
                                className="px-2 py-0.5 bg-red-600 text-white font-mono text-[9px] font-black uppercase border border-white hover:bg-red-700 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.4)] transition-all cursor-pointer flex items-center gap-1"
                              >
                                <X className="w-2.5 h-2.5" />
                                <span>Remove</span>
                              </button>
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-[#141414]/15 flex items-center justify-between">
                              <span className="text-[9px] font-black uppercase text-[#141414]/60">
                                Available
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="bg-[#E4E3E0] px-4 py-3 border-t-4 border-[#141414] flex items-center justify-between shrink-0">
              <span className="text-[10px] font-black uppercase text-[#141414]/70">
                {selectedAgentIds.length} AGENTS SELECTED FOR THIS CLUSTER
              </span>
              <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="px-4 py-1.5 bg-[#141414] text-white border-2 border-[#141414] text-xs font-black uppercase tracking-wider hover:bg-black transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                Confirm Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Option Dialog */}
      {agentToRemove && (
        <div className="fixed inset-0 z-80 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-5 max-w-sm w-full font-mono space-y-4 text-[#141414]">
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-2">
              <span className="font-black text-xs uppercase tracking-wider text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Remove Option
              </span>
              <button
                type="button"
                onClick={() => setAgentToRemove(null)}
                className="p-1 hover:bg-[#141414]/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase text-[#141414]">
                {agentToRemove.agentId === 'ALL'
                  ? 'Remove all agents from cluster?'
                  : 'Remove agent from cluster?'}
              </p>
              <div className="text-[11px] text-[#141414]/80 break-words bg-[#E4E3E0]/40 p-2 border border-[#141414]/20 space-y-0.5">
                {agentToRemove.agentId === 'ALL' ? (
                  <span className="font-black text-red-600">ALL SELECTED AGENTS</span>
                ) : (
                  <>
                    <div>
                      Agent: <span className="font-black">@{agentToRemove.agentId}</span>
                    </div>
                    {agentToRemove.agentName && agentToRemove.agentName !== agentToRemove.agentId && (
                      <div className="text-[10px] text-[#141414]/70 uppercase">
                        {agentToRemove.agentName}
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="text-[10px] text-[#141414]/60">
                This will remove the agent from this cluster configuration.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#141414]/20">
              <button
                type="button"
                onClick={() => setAgentToRemove(null)}
                className="px-3 py-1.5 bg-white border-2 border-[#141414] text-[10px] font-black uppercase hover:bg-[#E4E3E0] transition-colors cursor-pointer"
              >
                Cancel / Keep
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-3.5 py-1.5 bg-red-600 text-white border-2 border-[#141414] text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-red-700 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Confirm Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

