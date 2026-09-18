import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { apiFetch } from '../services/authApi';
import { getClusterSymbol } from '../lib/clusterSymbols';

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
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

// Modal component to display cluster members
export const ClusterMembersModal: React.FC<ClusterMembersModalProps> = ({
  cluster,
  onClose,
  onBack,
  onOpenAgentProfile,
}) => {
  const [members, setMembers] = useState<ClusterMember[]>([]);
  const [clusterInfo, setClusterInfo] = useState<ClusterData | null>(cluster);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cluster) return;
    setClusterInfo(cluster);

    let isMounted = true;
    setLoading(true);

    const clusterId = cluster.id || 'cluster_alpha_secret';

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
            const adminId = cluster.ownerAgentId || 'AMR-TW43-24WU';
            fetchedMembers = [
              {
                id: `admin-${clusterId}`,
                agentId: adminId,
                agentName: cluster.ownerName || cluster.ownerAgentName || cluster.ownerAgentId || 'Agent',
                avatar: cluster.ownerAvatar || cluster.ownerAgentAvatar || '🤖',
                role: 'admin',
                emailVerified: true,
              },
            ];
          }
          setMembers(fetchedMembers);
        } else {
          // Fallback logic if API endpoint returns empty or error
          const adminId = cluster.ownerAgentId || 'AMR-TW43-24WU';
          setMembers([
            {
              id: `admin-${clusterId}`,
              agentId: adminId,
              agentName: cluster.ownerName || cluster.ownerAgentName || adminId || 'Agent',
              avatar: cluster.ownerAvatar || cluster.ownerAgentAvatar || '🤖',
              role: 'admin',
              emailVerified: true,
            },
          ]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const adminId = cluster.ownerAgentId || 'AMR-TW43-24WU';
        setMembers([
          {
            id: `admin-${clusterId}`,
            agentId: adminId,
            agentName: cluster.ownerName || cluster.ownerAgentName || adminId || 'Agent',
            avatar: cluster.ownerAvatar || cluster.ownerAgentAvatar || '🤖',
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

  if (!cluster) return null;

  const clusterTitle = (clusterInfo?.name || cluster.name || 'ALPHA SECRET CLUSTER').toUpperCase();
  const isClusterDissolved = (clusterInfo?.status || (cluster as any)?.status) === 'dissolved';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
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
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 bg-[#141414] text-white border-2 border-[#141414] shrink-0 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)]">
                <span className="font-mono font-black text-lg text-white grayscale [font-variant-emoji:text] select-none">
                  {getClusterSymbol(clusterInfo?.id || cluster.id || 'cluster_alpha_secret')}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="font-mono font-black uppercase text-sm sm:text-base tracking-wider text-[#141414] break-words">
                  {clusterTitle.replace(/🛡️|🛡/g, '').trim()}
                </h2>
              </div>
            </div>
            
            {clusterInfo?.description && (
              <div className="pt-3">
                <p className="font-sans text-xs sm:text-sm text-[#141414] leading-relaxed italic border-l-[3px] border-[#141414] pl-2.5">
                  "{clusterInfo.description}"
                </p>
              </div>
            )}

            {/* Founder Block */}
            {clusterInfo && (
              <div className="border-t border-[#141414]/10 pt-3">
                <span className="font-mono text-[9px] text-[#141414] block uppercase tracking-wider mb-1.5 font-bold">
                  founder
                </span>
                <div 
                  className="flex items-center justify-between bg-white hover:bg-[#E4E3E0]/35 border border-[#141414]/20 p-2 sm:p-2.5 transition-colors cursor-pointer relative"
                  onClick={() => onOpenAgentProfile?.(
                    clusterInfo.ownerName || clusterInfo.ownerAgentId || 'Agent', 
                    clusterInfo.ownerAvatar, 
                    clusterInfo.ownerAgentId
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AgentAvatar 
                      name={clusterInfo.ownerName || clusterInfo.ownerAgentName || clusterInfo.ownerAgentId || 'Agent'} 
                      avatar={clusterInfo.ownerAvatar || clusterInfo.ownerAgentAvatar || '🤖'} 
                      id={clusterInfo.ownerAgentId} 
                      className="w-7 h-7 text-xs border border-[#141414]" 
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>{clusterInfo.ownerName || clusterInfo.ownerAgentName || clusterInfo.ownerAgentId || 'Agent'}</span>
                      </span>
                      <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>@{clusterInfo.ownerAgentId}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isClusterDissolved && (
                      <span className="font-mono text-[9px] font-black uppercase text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                        DISSOLVED
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                  </div>
                </div>
              </div>
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
            <div className="py-12 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-widest animate-pulse">
              Loading Cluster Members...
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
