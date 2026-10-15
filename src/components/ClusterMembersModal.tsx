import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, AlertCircle, Edit3, Check } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch } from '../services/authApi';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { useAuth } from '../context/AuthContext';

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
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!cluster) return;
    setClusterInfo(cluster);

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
          
          // Fallback if no members found: consider admin as the first member
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
        } else {
          // Fallback logic if API endpoint returns empty or error
          setMembers([
            {
              id: `admin-${clusterId}`,
              agentId: ownerAgentId,
              agentName: ownerName,
              avatar: ownerAvatar,
              role: 'admin',
              emailVerified: true,
            },
          ]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setMembers([
          {
            id: `admin-${clusterId}`,
            agentId: ownerAgentId,
            agentName: ownerName,
            avatar: ownerAvatar,
            role: 'admin',
            emailVerified: true,
          },
        ]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [cluster]);

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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Cluster name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    const clusterId = clusterInfo?.id || cluster.id || (cluster as any)?.clusterId || (cluster as any)?.cluster_id;
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}`, {
        authType: 'human',
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          description: editDescription.trim() || undefined,
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
        if (onClusterUpdated) {
          onClusterUpdated(updatedClusterData);
        }
        window.dispatchEvent(
          new CustomEvent('cluster-updated', {
            detail: {
              id: clusterId,
              name: trimmedName,
              description: editDescription.trim() || undefined,
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
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
        
        {/* Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1 shrink-0"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-[0.1em] text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
              <span>CLUSTER</span>
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

        {/* Scrollable Members Area */}
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

              {canEdit && !isEditing && !isClusterDissolved && (
                <button
                  type="button"
                  onClick={() => {
                    setEditName(clusterInfo?.name || cluster.name || '');
                    setEditDescription(clusterInfo?.description || (cluster as any)?.description || '');
                    setEditError(null);
                    setIsEditing(true);
                  }}
                  className="px-2.5 py-1 bg-white text-[#141414] border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 shrink-0"
                  title="Edit Cluster (Admin or Master only)"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>EDIT</span>
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="space-y-3 pt-2 border-t-2 border-[#141414]/20 animate-in fade-in duration-150">
                {editError && (
                  <div className="p-2 bg-red-100 border-2 border-red-500 text-red-700 font-mono text-[10px] sm:text-xs font-bold">
                    {editError}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block font-mono text-[10px] font-black uppercase text-[#141414]/70">
                    Cluster Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="CLUSTER NAME"
                    maxLength={50}
                    required
                    className="w-full bg-white border-2 border-[#141414] p-2 font-mono font-bold text-xs uppercase focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-mono text-[10px] font-black uppercase text-[#141414]/70">
                    Description (Optional)
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Cluster directives and protocols..."
                    rows={2}
                    maxLength={200}
                    className="w-full bg-white border-2 border-[#141414] p-2 font-mono text-xs focus:outline-none resize-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="px-3 py-1.5 border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white hover:bg-[#E4E3E0] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-[#141414] text-white border-2 border-[#141414] font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
            ) : (
              clusterInfo?.description && (
                <div className="pt-2">
                  <p className="font-sans text-xs sm:text-sm text-[#141414] leading-relaxed italic border-l-[3px] border-[#141414] pl-2.5">
                    "{clusterInfo.description}"
                  </p>
                </div>
              )
            )}
          </div>

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

      </div>
    </div>
  );
};
