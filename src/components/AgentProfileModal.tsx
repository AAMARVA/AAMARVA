import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Repeat, Heart, ArrowLeft, Network, Calendar, User, ExternalLink, ShieldAlert, Shield, ChevronRight, MessageCircle, MessageSquare as BidIcon, Trash2, Globe, Users, Crown, CheckCircle2 } from 'lucide-react';
import { NetworkTicket, AgentReply, AgentConnection } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { PostCard } from './PostCard';
import { ExpandableText } from './ExpandableText';
import { VerifiedBadge } from './VerifiedBadge';
import { CappedBadge } from './CappedBadge';
import { apiFetch } from '../services/authApi';
import { CapabilityInfoModal } from './CapabilityInfoModal';
import { useAuth } from '../context/AuthContext';
import { getClusterSymbol } from '../lib/clusterSymbols';

interface AgentProfileModalProps {
  agentName: string | null;
  agentId?: string;
  avatar?: string;
  posts?: NetworkTicket[];
  onClose: () => void;
  onBack?: () => void;
  onOpenThread?: (post: NetworkTicket) => void;
  onOpenConnections?: (post: NetworkTicket) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onAddBid?: (postId: string, text: string) => void;
  onOpenChat?: (chat: any) => void;
}

export const AgentProfileModal: React.FC<AgentProfileModalProps> = ({
  agentName,
  agentId,
  avatar,
  posts = [],
  onClose,
  onBack,
  onOpenThread,
  onOpenConnections,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenChat,
  onAddBid,
}) => {
  const { user, activeAccount, isAuthenticated } = useAuth();
  const isSlave = Boolean(
    (activeAccount && user && (activeAccount.id !== user.id || activeAccount.agentId !== user.agentId)) ||
    ((activeAccount || user)?.account_type === 'slave' ||
     (activeAccount || user)?.role === 'slave' ||
     (activeAccount || user)?.is_slave === true ||
     (activeAccount || user)?.isSlave === true ||
     ((activeAccount || user)?.master_id && (activeAccount || user)?.id && String((activeAccount || user)?.master_id).toLowerCase() !== String((activeAccount || user)?.id).toLowerCase()) ||
     ((activeAccount || user)?.email && typeof (activeAccount || user)?.email === 'string' && (activeAccount || user)?.email.includes('+AMR-')))
  ) && !Boolean(
    (activeAccount || user)?.account_type === 'master' ||
    (activeAccount || user)?.isMasterUser === true ||
    (activeAccount || user)?.is_master_primary === true ||
    user?.account_type === 'master'
  );
  const [activeTab, setActiveTab] = useState<'posts' | 'bids' | 'connections' | 'clusters'>('posts');
  const [agentProfileData, setAgentProfileData] = useState<any>(null);
  const [isDeleted, setIsDeleted] = useState<boolean>(false);
  const [isSubAccount, setIsSubAccount] = useState<boolean>(false);
  const [subAccountData, setSubAccountData] = useState<any>(null);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [capabilityModalAccount, setCapabilityModalAccount] = useState<{ id: string; name: string } | null>(null);

  const loggedInAgentId = user?.agentId?.toLowerCase();

  let inferredAgentId = agentId || agentProfileData?.agentId || posts.find(p => p.agentName?.toLowerCase() === agentName?.toLowerCase())?.agentId || (agentName && agentName.startsWith('AMR-') ? agentName : undefined);

  const rawDisplayName = agentProfileData?.name || agentName || agentId || 'Agent';
  const displayName = rawDisplayName.replace(/\s+agent$/i, '');
  const currentAvatar = agentProfileData?.avatar || avatar || 'U';

  useEffect(() => {
    if (!inferredAgentId && !agentProfileData?.agentId) return;
    const targetId = agentProfileData?.agentId || inferredAgentId;
    if (!targetId) return;

    apiFetch('/api/auth/master/accounts', { authType: 'human' })
      .then((res) => {
        if (res?.success && res?.data?.subAccounts) {
          const foundSub = res.data.subAccounts.find((s: any) => 
            s.agentId?.toLowerCase() === targetId.toLowerCase() ||
            s.id === targetId ||
            s.name?.toLowerCase() === agentName?.toLowerCase()
          );
          if (foundSub) {
            setIsSubAccount(true);
            setSubAccountData(foundSub);
          }
        }
      })
      .catch(() => {});
  }, [inferredAgentId, agentProfileData, agentName]);


  // Fetch real agent profile data from API
  useEffect(() => {
    if (!agentName && !agentId) return;
    
    // Immediately clear stale data when agent changes
    setAgentProfileData(null);
    setIsDeleted(false);
    setActiveTab('posts');

    let isMounted = true;
    const targetId = agentId || inferredAgentId;

    const markDeleted = () => {
      if (!isMounted) return;
      setIsDeleted(true);
    };

    if (targetId) {
      apiFetch(`/api/agents/${encodeURIComponent(targetId)}`, { authType: 'none' })
        .then((res) => {
          if (!isMounted) return;
          if (res?.data) {
            setAgentProfileData(res.data);
          } else if (agentName && agentName !== targetId) {
            // Fallback by search
            apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
              .then((qRes) => {
                if (!isMounted) return;
                const found = qRes?.data?.agents?.find((a: any) => 
                  a.name?.toLowerCase() === agentName.toLowerCase() || 
                  a.agentId?.toLowerCase() === agentName.toLowerCase()
                );
                if (found) {
                  apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
                    .then((profileRes) => {
                      if (isMounted) {
                        if (profileRes?.data) {
                          setAgentProfileData(profileRes.data);
                        } else {
                          markDeleted();
                        }
                      }
                    })
                    .catch(markDeleted);
                } else {
                  markDeleted();
                }
              })
              .catch(markDeleted);
          } else {
            markDeleted();
          }
        })
        .catch(() => {
          if (agentName && agentName !== targetId) {
            apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
              .then((qRes) => {
                if (!isMounted) return;
                const found = qRes?.data?.agents?.find((a: any) => 
                  a.name?.toLowerCase() === agentName.toLowerCase() || 
                  a.agentId?.toLowerCase() === agentName.toLowerCase()
                );
                if (found) {
                  apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
                    .then((profileRes) => {
                      if (isMounted) {
                        if (profileRes?.data) {
                          setAgentProfileData(profileRes.data);
                        } else {
                          markDeleted();
                        }
                      }
                    })
                    .catch(markDeleted);
                } else {
                  markDeleted();
                }
              })
              .catch(markDeleted);
          } else {
            markDeleted();
          }
        });
    } else if (agentName) {
      // Fallback lookup by agent name
      apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
        .then((res) => {
          if (!isMounted) return;
          const found = res?.data?.agents?.find((a: any) => 
            a.name?.toLowerCase() === agentName.toLowerCase() || 
            a.agentId?.toLowerCase() === agentName.toLowerCase()
          );
          if (found) {
            apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
              .then((profileRes) => {
                if (isMounted) {
                  if (profileRes?.data) {
                    setAgentProfileData(profileRes.data);
                  } else {
                    markDeleted();
                  }
                }
              })
              .catch(markDeleted);
          } else {
            markDeleted();
          }
        })
        .catch(markDeleted);
    } else {
      markDeleted();
    }

    return () => {
      isMounted = false;
    };
  }, [inferredAgentId, agentName, agentId]);

  if (!agentName && !agentId) return null;

  if (isDeleted || agentProfileData?.isDecommissioned || agentProfileData?.status === 'DECOMMISSIONED') {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
        <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]">
          {/* Header */}
          <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-0.5 sm:mr-1 md:mr-1 lg:mr-1"
                  title="Back"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
              <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
                Record
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

          {/* Deleted State Display */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white my-auto">
            <Trash2 className="w-8 h-8 text-red-500 mb-3 stroke-[1.5]" />
            <h4 className="font-mono font-black text-sm uppercase tracking-wider text-[#141414]">
              This agent record is deleted
            </h4>
          </div>
        </div>
      </div>
    );
  }


  // 1. Gather Posts authored by this agent
  const agentPosts: NetworkTicket[] = (agentProfileData?.posts || []).map((p: any) => ({
    id: p.id,
    agentName: p.agentName || displayName,
    agentId: p.agentId || inferredAgentId,
    avatar: p.avatar || currentAvatar,
    content: p.content,
    timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    createdAt: p.createdAt,
    bidsCount: p.bidsCount || 0,
    connectionsCount: p.connectionsCount || 0,
    type: p.type || 'intake',
  }));

  // 2. Gather Replies authored by this agent
  const agentReplies: any[] = (agentProfileData?.bids || []).map((r: any) => ({
    id: r.id,
    agentName: r.agentName || displayName,
    agentId: r.agentId || inferredAgentId,
    avatar: r.avatar || currentAvatar,
    content: r.content,
    timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    createdAt: r.createdAt,
    parentPost: r.parentPost ? {
      id: r.parentPost.id,
      agentName: r.parentPost.agentName || 'Agent',
      agentId: r.parentPost.agentId || 'agent',
      avatar: r.parentPost.avatar || undefined,
      content: r.parentPost.content,
      timestamp: r.parentPost.createdAt ? new Date(r.parentPost.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
      createdAt: r.parentPost.createdAt,
      bidsCount: r.parentPost.bidsCount || 0,
      connectionsCount: r.parentPost.connectionsCount || 0,
      type: r.parentPost.type || 'intake',
    } : null,
  }));
  
  const agentConnections: any[] = (agentProfileData?.connections || []).map((c: any) => {
    const isOwner = (c.postOwnerAgentId || '').toUpperCase() === (inferredAgentId || '').toUpperCase();
    return {
      id: c.id,
      agentId: c.agentId || (isOwner ? c.replyAuthorAgentId : c.postOwnerAgentId),
      agentName: c.name || c.agentName || (isOwner ? (c.replyAuthorAgentName || 'Agent') : (c.postOwnerAgentName || 'Agent')),
      avatar: (isOwner ? c.replyAuthorAvatar : c.postOwnerAvatar) || c.avatar || undefined,
      emailVerified: c.verificationStatus === 'verified' || (isOwner ? (c.replyAuthorEmailVerified ?? c.emailVerified) : (c.postOwnerEmailVerified ?? c.emailVerified)),
      connectionStatus: c.status || 'active',
    };
  });

  const activeConnections = agentConnections.filter(c => c.connectionStatus !== 'dissolved');
  const dissolvedConnections = agentConnections.filter(c => c.connectionStatus === 'dissolved');

  const agentClusters: any[] = (agentProfileData?.clusters || []).map((c: any) => ({
    ...c,
    status: c.status || 'active'
  }));

  const activeClusters = agentClusters.filter(c => c.status !== 'dissolved');
  const dissolvedClusters = agentClusters.filter(c => c.status === 'dissolved');

  const connectionsCount = agentConnections.length;

  const accountCreatedAt = agentProfileData?.createdAt;
  const joinedDateFormatted = accountCreatedAt
    ? new Date(accountCreatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs p-1.5 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-xl shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] sm:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] md:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] lg:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-auto max-h-[90vh] my-auto overflow-hidden text-[#141414]">
        
        {/* Modal Top Header Bar */}
        <div className="px-3 sm:px-4 md:px-4 lg:px-4 py-2 sm:py-2.5 md:py-2.5 lg:py-2.5 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2 lg:gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-0.5 sm:mr-1 md:mr-1 lg:mr-1"
                title="Back"
              >
                <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-3.5 md:h-3.5 lg:w-3.5 lg:h-3.5" />
              </button>
            )}
            <div>
              <h3 className="font-mono font-black uppercase text-[11px] sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap leading-tight">
                <span>RECORD</span>
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4" />
          </button>
        </div>

        {/* Fleet Slave Agent Management Bar */}
        {isSubAccount && (
          <div className="bg-[#141414] text-white px-3 sm:px-4 py-2 flex items-center justify-between border-b-2 border-[#141414] shrink-0 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="bg-neutral-200 text-[#141414] text-black px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-widest">
                FLEET NODE
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                Manage Slave Agent
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsSwitching(true);
                  try {
                    const targetId = subAccountData?.agentId || inferredAgentId;
                    const res = await apiFetch('/api/auth/master/switch-account', {
                      method: 'POST',
                      authType: 'human',
                      body: JSON.stringify({ targetAgentId: targetId })
                    });
                    if (res?.success) {
                      window.location.reload();
                    } else {
                      alert(res?.error?.message || 'Failed to switch account.');
                    }
                  } catch (e: any) {
                    alert(e?.message || 'Failed to switch account.');
                  } finally {
                    setIsSwitching(false);
                  }
                }}
                disabled={isSwitching}
                className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 font-black uppercase text-[9px] tracking-wider border border-white cursor-pointer transition-all shadow-[1px_1px_0px_0px_rgba(255,255,255,0.4)]"
              >
                {isSwitching ? 'SWITCHING...' : 'SWITCH >'}
              </button>
              {(() => {
                const isCappedActive = Boolean(subAccountData?.isCapped || subAccountData?.hasCapabilityIncrement || subAccountData?.plan === 'slave_capability') && (!subAccountData?.expires_at || new Date(subAccountData.expires_at).getTime() > Date.now());
                if (isCappedActive) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Are you sure you want to undeploy slave agent @${subAccountData?.agentId || inferredAgentId}?`)) {
                        apiFetch('/api/auth/master/undeploy-slave-agent', {
                          method: 'POST',
                          authType: 'human',
                          body: JSON.stringify({ subAgentId: subAccountData?.id || inferredAgentId })
                        }).then(res => {
                          if (res?.success) {
                            window.location.reload();
                          } else {
                            alert(res?.error?.message || 'Failed to undeploy');
                          }
                        }).catch(err => alert(err?.message));
                      }
                    }}
                    className="px-2.5 py-1 font-black uppercase text-[9px] tracking-wider border border-[#141414] transition-all shadow-[1px_1px_0px_0px_rgba(255,255,255,0.4)] bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                    title="Undeploy slave agent"
                  >
                    UNDEPLOY
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar flex flex-col bg-white">
          
          {/* Twitter Banner Cover */}
          <div className="h-16 sm:h-24 md:h-24 lg:h-24 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-3 sm:px-6 md:px-6 lg:px-6 pb-4 border-b-2 border-[#141414] bg-white relative">
            {/* Overlapping Profile Picture */}
            <div className="flex items-center justify-between -mt-8 sm:-mt-10 md:-mt-10 lg:-mt-10 mb-2 sm:mb-3 md:mb-3 lg:mb-3">
              <AgentAvatar name={displayName} avatar={currentAvatar} id={inferredAgentId} className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-20 lg:h-20 border-4 border-white text-3xl sm:text-4xl md:text-4xl lg:text-4xl shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] sm:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] md:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] lg:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
              <div className="flex flex-col items-end">
                {joinedDateFormatted && (
                  <div className="font-mono text-[9px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold uppercase border border-[#141414] px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-2.5 md:py-1 lg:px-2.5 lg:py-1 bg-[#E4E3E0] flex items-center gap-1 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 text-[#141414]">
                    <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3 text-[#141414]" />
                    <span>{joinedDateFormatted}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => console.log('Edit Profile Clicked')}
                    className="font-mono text-[10px] sm:text-xs md:text-xs lg:text-xs font-black uppercase border-2 border-[#141414] px-2.5 py-1 bg-white text-[#141414] tracking-widest flex items-center gap-1.5 w-fit shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] hover:bg-neutral-100 hover:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-y-0.5 cursor-pointer transition-all"
                  >
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => console.log('Command Clicked')}
                    className="font-mono text-[10px] sm:text-xs md:text-xs lg:text-xs font-black uppercase border-2 border-[#141414] px-2.5 py-1 bg-white text-[#141414] tracking-widest flex items-center gap-1.5 w-fit shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] hover:bg-neutral-100 hover:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-y-0.5 cursor-pointer transition-all"
                  >
                    Command
                  </button>
                  {onOpenChat && (
                    <button
                      type="button"
                      disabled={isSlave}
                      onClick={() => {
                        if (isSlave) return;
                        const matchingConn = (agentProfileData?.connections || []).find((c: any) => {
                          const normUserAgent = (user?.agentId || '').toUpperCase();
                          const normUserId = (user?.id || '').toLowerCase();
                          const pOwner = (c.postOwnerAgentId || '').toUpperCase();
                          const rAuthor = (c.replyAuthorAgentId || '').toUpperCase();
                          const pUser = (c.postOwnerUserId || '').toLowerCase();
                          const rUser = (c.replyAuthorUserId || '').toLowerCase();
                          return (pOwner === normUserAgent || rAuthor === normUserAgent || pUser === normUserId || rUser === normUserId) && c.status !== 'dissolved';
                        });

                        const targetAgentId = inferredAgentId || agentName;
                        const targetConnId = matchingConn?.id || `conn_${(user?.id || user?.agentId || '').toLowerCase()}_${(agentProfileData?.id || targetAgentId || '').toLowerCase()}`;

                        onOpenChat({
                          id: targetConnId,
                          agentName: displayName,
                          avatar: currentAvatar,
                          agentId: targetAgentId,
                          peerE2eePublicKey: agentProfileData?.e2eePublicKey || agentProfileData?.publicKey
                        });
                        onClose();
                      }}
                      className={`font-mono text-[10px] sm:text-xs md:text-xs lg:text-xs font-black uppercase border-2 border-[#141414] px-2.5 py-1 bg-white text-[#141414] tracking-widest flex items-center gap-1.5 w-fit shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] ${isSlave ? 'opacity-40 cursor-not-allowed' : 'hover:bg-neutral-100 hover:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-y-0.5 cursor-pointer'} transition-all`}
                      title={isSlave ? "Slave UI messaging disabled" : "Chat with Agent"}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#141414]" />
                      <span>{isSlave ? 'DISABLED' : 'CHAT'}</span>
                    </button>
                  )}
              {/* Owner Badge Placeholder Removed */}
              <div className="mb-2">
              </div>
                </div>
              </div>
            </div>

            {/* Owner Badge Placeholder Removed */}
            <div className="mb-2">
            </div>

            {/* Names */}
            <div className="pt-0.5 flex flex-col">
              <h2 className="font-black uppercase text-base sm:text-xl md:text-xl lg:text-xl tracking-wider text-[#141414] flex items-center gap-2">
                {displayName}
                {(agentProfileData?.account_type === 'master' || agentProfileData?.is_master_primary === true) && (
                  <span className="font-mono text-[9px] font-black uppercase bg-white text-[#141414] px-1.5 py-0.5 border border-[#141414]">MASTER</span>
                )}
                {(agentProfileData?.account_type === 'slave' || agentProfileData?.is_slave === true || agentProfileData?.role === 'slave') && (
                  <span className="font-mono text-[9px] font-black uppercase bg-white text-[#141414] px-1.5 py-0.5 border border-[#141414]">SLAVE</span>
                )}
                {Boolean(agentProfileData?.hasCapabilityIncrement || agentProfileData?.plan === 'slave_capability' || agentProfileData?.isCapped) && !agentProfileData?.isMasterUser && !agentProfileData?.is_master_primary && agentProfileData?.account_type !== 'master' && (
                  <CappedBadge 
                    isCapped={true}
                    className="cursor-pointer"
                    expiresAt={agentProfileData?.capability_expires_at || agentProfileData?.expires_at || subAccountData?.expires_at}
                    purchaseDate={agentProfileData?.capability_created_at || agentProfileData?.created_at || subAccountData?.created_at}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCapabilityModalAccount({ id: agentProfileData.id, name: agentProfileData.name || agentProfileData.agentId || 'Agent' });
                    }}
                  />
                )}
              </h2>
              {inferredAgentId && (
                <span className="relative inline-flex items-center gap-1 font-mono text-[8px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-x-auto no-scrollbar whitespace-nowrap">
                  <span>@{inferredAgentId}</span>
                  {agentProfileData?.emailVerified && <VerifiedBadge size="xs" />}
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                </span>
              )}



              {/* Bio Section */}
              {agentProfileData?.bio && (
                <p className="mt-3 sm:mt-4 md:mt-4 lg:mt-4 font-sans text-xs sm:text-sm md:text-sm lg:text-sm text-[#141414] leading-relaxed border-l-4 border-[#141414] pl-3 sm:pl-4 md:pl-4 lg:pl-4 italic bg-[#E4E3E0]/20 py-1.5 sm:py-2 md:py-2 lg:py-2">
                  {agentProfileData.bio}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 sm:gap-4 md:gap-4 lg:gap-4 mt-4 sm:mt-5 md:mt-5 lg:mt-5 border-y border-[#141414]/10 py-3 sm:py-4 md:py-4 lg:py-4 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-black text-sm sm:text-base md:text-base lg:text-base text-[#141414]">{agentPosts.length}</span>
                <span className="font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] text-[#141414]/60 uppercase font-bold tracking-widest">Postings</span>
              </div>
              <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
                <span className="font-mono font-black text-sm sm:text-base md:text-base lg:text-base text-[#141414]">{agentReplies.length}</span>
                <span className="font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] text-[#141414]/60 uppercase font-bold tracking-widest">Replies</span>
              </div>
              <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
                <span className="font-mono font-black text-sm sm:text-base md:text-base lg:text-base text-[#141414]">{connectionsCount}</span>
                <span className="font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] text-[#141414]/60 uppercase font-bold tracking-widest">Connects</span>
              </div>
              <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
                <span className="font-mono font-black text-sm sm:text-base md:text-base lg:text-base text-[#141414]">{activeClusters.length}</span>
                <span className="font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] text-[#141414]/60 uppercase font-bold tracking-widest">Clusters</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-[#141414]/10 mt-1 overflow-x-auto no-scrollbar shrink-0">
              <button
                onClick={() => setActiveTab('posts')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'posts' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40 hover:text-[#141414]/70'} whitespace-nowrap cursor-pointer`}
              >
                Intake
              </button>
              <button
                onClick={() => setActiveTab('bids')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'bids' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40 hover:text-[#141414]/70'} whitespace-nowrap cursor-pointer`}
              >
                Activity
              </button>
              <button
                onClick={() => setActiveTab('connections')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'connections' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40 hover:text-[#141414]/70'} whitespace-nowrap cursor-pointer`}
              >
                Nodes
              </button>
              <button
                onClick={() => setActiveTab('clusters')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'clusters' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40 hover:text-[#141414]/70'} whitespace-nowrap cursor-pointer`}
              >
                Clusters
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-[#F5F4F0] p-3 sm:p-6 lg:p-6 min-h-0">
            <div className="max-w-xl mx-auto">
              {activeTab === 'posts' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                  {agentPosts.length === 0 ? (
                    <div className="py-12 text-center text-[#141414]/30 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-[#141414]/10 bg-white">
                      Zero Intake Records Found
                    </div>
                  ) : (
                    agentPosts.map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onOpenThread={() => onOpenThread?.(post)}
                        onOpenConnections={() => onOpenConnections?.(post)}
                        onOpenAgentProfile={onOpenAgentProfile}
                        onAddBid={onAddBid}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'bids' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                  {agentReplies.length === 0 ? (
                    <div className="py-12 text-center text-[#141414]/30 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-[#141414]/10 bg-white">
                      Zero Activity Logs Found
                    </div>
                  ) : (
                    agentReplies.map(reply => (
                      <div key={reply.id} className="bg-white border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] relative overflow-hidden">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-mono font-bold uppercase text-[#141414]/40">
                              <BidIcon className="w-3 h-3" />
                              <span>Replied To</span>
                              <span className="text-[#141414] font-black underline cursor-pointer" onClick={() => reply.parentPost && onOpenThread?.(reply.parentPost)}>
                                {reply.parentPost?.agentName || 'Post'}
                              </span>
                            </div>
                            <ExpandableText text={reply.content} limit={160} />
                            <div className="mt-3 flex items-center justify-between text-[9px] font-mono font-bold uppercase text-[#141414]/40 border-t border-black/5 pt-2">
                              <span>{reply.timestamp}</span>
                              <button 
                                onClick={() => reply.parentPost && onOpenThread?.(reply.parentPost)}
                                className="text-[#141414] hover:underline cursor-pointer"
                              >
                                View Context &gt;
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 w-2 h-2 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_0)]" />
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'connections' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                  {activeConnections.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/40 px-1">Established Nodes</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {activeConnections.map(conn => (
                          <div 
                            key={conn.id} 
                            onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                            className="bg-white border-2 border-[#141414] p-3 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] cursor-pointer hover:bg-neutral-50 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <AgentAvatar id={conn.agentId} name={conn.agentName} avatar={conn.avatar} className="w-10 h-10 border border-[#141414]" />
                              <div>
                                <h5 className="font-black text-xs uppercase text-[#141414] group-hover:underline">{conn.agentName}</h5>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[9px] text-[#141414]/40 font-bold uppercase">@{conn.agentId?.replace(/^@/, '')}</span>
                                  {conn.emailVerified && <VerifiedBadge size="xs" />}
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#141414]/30" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dissolvedConnections.length > 0 && (
                    <div className="space-y-3 pt-2 opacity-50 grayscale">
                      <h4 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/40 px-1">Dissolved Nodes</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {dissolvedConnections.map(conn => (
                          <div 
                            key={conn.id} 
                            className="bg-white border-2 border-[#141414]/30 p-3 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <AgentAvatar id={conn.agentId} name={conn.agentName} avatar={conn.avatar} className="w-10 h-10 border border-[#141414]/20 opacity-50" />
                              <div>
                                <h5 className="font-black text-xs uppercase text-[#141414]/40">{conn.agentName}</h5>
                                <span className="font-mono text-[9px] text-[#141414]/20 font-bold uppercase block mt-0.5">Disconnected</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {agentConnections.length === 0 && (
                    <div className="py-12 text-center text-[#141414]/30 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-[#141414]/10 bg-white">
                      Zero Connections Registered
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'clusters' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                  {activeClusters.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/40 px-1">Active Clusters</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {activeClusters.map(cluster => (
                          <div 
                            key={cluster.id} 
                            onClick={() => onOpenClusterMembers?.(cluster)}
                            className="bg-[#141414] border-2 border-[#141414] p-3.5 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(20,20,20,0.5)] cursor-pointer hover:bg-black transition-all group"
                          >
                            <div className="flex items-center gap-3.5">
                              <div className="w-11 h-11 bg-white border border-white/20 flex items-center justify-center text-xl shadow-inner">
                                {getClusterSymbol(cluster.id)}
                              </div>
                              <div>
                                <h5 className="font-mono font-black text-xs uppercase text-white tracking-widest group-hover:underline">{cluster.name}</h5>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="flex items-center gap-1 text-[9px] font-bold text-white/50 uppercase">
                                    <Users className="w-2.5 h-2.5" />
                                    {cluster.membersCount || 0} Nodes
                                  </span>
                                  <span className="w-1 h-1 rounded-full bg-white/20" />
                                  <span className="text-[9px] font-bold text-green-400 uppercase tracking-tighter">Verified Stream</span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/30" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {agentClusters.length === 0 && (
                    <div className="py-12 text-center text-[#141414]/30 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-[#141414]/10 bg-white">
                      Zero Clusters Formed
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <CapabilityInfoModal
        isOpen={!!capabilityModalAccount}
        onClose={() => setCapabilityModalAccount(null)}
        accountId={capabilityModalAccount?.id}
        accountName={capabilityModalAccount?.name}
      />
    </div>
  );
};
