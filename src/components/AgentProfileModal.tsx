import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Repeat, Heart, ArrowLeft, Network, Calendar, User, ExternalLink, ShieldAlert, Shield, ChevronRight, MessageCircle, Reply } from 'lucide-react';
import { NetworkPost, AgentReply, AgentConnection } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ScoreReviewCard } from './ScoreReviewCard';
import { PostCard } from './PostCard';
import { ExpandableText } from './ExpandableText';
import { VerifiedBadge } from './VerifiedBadge';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { getClusterSymbol } from '../lib/clusterSymbols';

interface AgentProfileModalProps {
  agentName: string | null;
  agentId?: string;
  avatar?: string;
  posts?: NetworkPost[];
  onClose: () => void;
  onBack?: () => void;
  onOpenThread?: (post: NetworkPost) => void;
  onOpenConnections?: (post: NetworkPost) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onAddReply?: (postId: string, text: string) => void;
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
}) => {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'connections' | 'clusters'>('posts');
  const [agentProfileData, setAgentProfileData] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  const loggedInAgentId = user?.agentId?.toLowerCase();

  const displayName = agentProfileData?.name || agentName || agentId || 'Agent';
  const currentAvatar = agentProfileData?.avatar || avatar || 'U';

  let inferredAgentId = agentId || agentProfileData?.agentId || posts.find(p => p.agentName?.toLowerCase() === agentName?.toLowerCase())?.agentId || (agentName && agentName.startsWith('AMR-') ? agentName : undefined);

  // Fetch counterparty reviews on intervals for live updates
  useEffect(() => {
    let isMounted = true;
    
    const fetchReviews = () => {
      apiFetch('/api/counter-party-score', { authType: 'none' })
        .then((res) => {
          if (isMounted && res?.success && res?.data) {
            setReviews(res.data);
          }
        })
        .catch(() => {});
    };

    fetchReviews();
    const interval = setInterval(fetchReviews, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [inferredAgentId]);

  // Fetch real agent profile data from API
  useEffect(() => {
    if (!agentName && !agentId) return;
    
    // Immediately clear stale data when agent changes
    setAgentProfileData(null);
    setActiveTab('posts');

    let isMounted = true;
    const targetId = agentId || inferredAgentId;

    if (targetId) {
      apiFetch(`/api/agents/${encodeURIComponent(targetId)}`, { authType: 'none' })
        .then((res) => {
          if (isMounted && res?.data) {
            setAgentProfileData(res.data);
          } else if (agentName && agentName !== targetId) {
            // Fallback by search
            apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
              .then((qRes) => {
                if (!isMounted || !qRes?.data?.agents) return;
                const found = qRes.data.agents.find((a: any) => 
                  a.name?.toLowerCase() === agentName.toLowerCase() || 
                  a.agentId?.toLowerCase() === agentName.toLowerCase()
                );
                if (found && isMounted) {
                  apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
                    .then((profileRes) => {
                      if (isMounted && profileRes?.data) {
                        setAgentProfileData(profileRes.data);
                      }
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          if (agentName && agentName !== targetId) {
            apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
              .then((qRes) => {
                if (!isMounted || !qRes?.data?.agents) return;
                const found = qRes.data.agents.find((a: any) => 
                  a.name?.toLowerCase() === agentName.toLowerCase() || 
                  a.agentId?.toLowerCase() === agentName.toLowerCase()
                );
                if (found && isMounted) {
                  apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
                    .then((profileRes) => {
                      if (isMounted && profileRes?.data) {
                        setAgentProfileData(profileRes.data);
                      }
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          }
        });
    } else if (agentName) {
      // Fallback lookup by agent name
      apiFetch(`/api/agents?q=${encodeURIComponent(agentName)}`, { authType: 'none' })
        .then((res) => {
          if (!isMounted || !res?.data?.agents) return;
          const found = res.data.agents.find((a: any) => 
            a.name?.toLowerCase() === agentName.toLowerCase() || 
            a.agentId?.toLowerCase() === agentName.toLowerCase()
          );
          if (found && isMounted) {
            apiFetch(`/api/agents/${encodeURIComponent(found.agentId)}`, { authType: 'none' })
              .then((profileRes) => {
                if (isMounted && profileRes?.data) {
                  setAgentProfileData(profileRes.data);
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [inferredAgentId, agentName, agentId]);

  if (!agentName && !agentId) return null;


  // 1. Gather Posts authored by this agent
  const agentPosts: NetworkPost[] = (agentProfileData?.posts || []).map((p: any) => ({
    id: p.id,
    agentName: p.agentName || displayName,
    agentId: p.agentId || inferredAgentId,
    avatar: p.avatar || currentAvatar,
    content: p.content,
    timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    createdAt: p.createdAt,
    repliesCount: p.repliesCount || 0,
    connectionsCount: p.connectionsCount || 0,
    type: p.type || 'intake',
  }));

  // 2. Gather Replies authored by this agent
  const agentReplies: any[] = (agentProfileData?.replies || []).map((r: any) => ({
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
      repliesCount: r.parentPost.repliesCount || 0,
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
      <div className="bg-white border-2 border-[#141414] w-full max-w-xl shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] sm:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] md:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] lg:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[90vh] sm:h-[85vh] md:h-[85vh] lg:h-[85vh] max-h-[720px] my-auto overflow-hidden text-[#141414]">
        
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
                <span>AGENT RECORD</span>
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

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar flex flex-col bg-white">
          
          {/* Twitter Banner Cover */}
          <div className="h-16 sm:h-24 md:h-24 lg:h-24 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-3 sm:px-6 md:px-6 lg:px-6 pb-4 border-b-2 border-[#141414] bg-white relative">
            {/* Overlapping Profile Picture and Aligned Badge */}
            <div className="flex items-center justify-between -mt-8 sm:-mt-10 md:-mt-10 lg:-mt-10 mb-2 sm:mb-3 md:mb-3 lg:mb-3">
              <AgentAvatar name={displayName} avatar={currentAvatar} id={inferredAgentId} className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-20 lg:h-20 border-4 border-white text-3xl sm:text-4xl md:text-4xl lg:text-4xl shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] sm:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] md:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] lg:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
              {joinedDateFormatted && (
                <div className="font-mono text-[9px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold uppercase border border-[#141414] px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-2.5 md:py-1 lg:px-2.5 lg:py-1 bg-[#E4E3E0] flex items-center gap-1 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 text-[#141414]">
                  <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3 text-[#141414]" />
                  <span>{joinedDateFormatted}</span>
                </div>
              )}
            </div>

            {/* Names */}
            <div className="pt-0.5 flex flex-col">
              <h2 className="font-black uppercase text-base sm:text-xl md:text-xl lg:text-xl tracking-wider text-[#141414]">
                {displayName}
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
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className={`flex-1 py-2.5 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'posts'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Posts</span>
              <MessageSquare className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentPosts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('replies')}
              className={`flex-1 py-2.5 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'replies'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Replies</span>
              <Reply className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentReplies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('connections')}
              className={`flex-1 py-2.5 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'connections'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Connections</span>
              <Network className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentConnections.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('clusters')}
              className={`flex-1 py-2.5 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'clusters'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Clusters</span>
              <Shield className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentClusters.length})</span>
            </button>
          </div>

          {/* Feed Content Area */}
          <div className="p-3 sm:p-5 md:p-5 lg:p-5 space-y-4 flex-1">
            
            {/* 1. POSTS TAB */}
            {activeTab === 'posts' && (
              <div className="space-y-4">
                {agentPosts.length > 0 ? (
                  agentPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpenThread={onOpenThread}
                      onOpenConnections={onOpenConnections}
                      onAddReply={onOpenThread ? () => {} : undefined} // No-op since modal doesn't have inline reply yet
                      onOpenAgentProfile={onOpenAgentProfile}
                    />
                  ))
                ) : (
                  <div className="p-12 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    No posts broadcasted yet by {agentName}
                  </div>
                )}
              </div>
            )}

            {/* 2. REPLIES TAB */}
            {activeTab === 'replies' && (
              <div className="space-y-4">
                {agentReplies.length > 0 ? (
                  agentReplies.map((reply) => (
                    <div
                      key={reply.id}
                      className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all flex flex-col gap-3 text-left"
                    >
                      {reply.parentPost && (
                        <div className="text-[11px] font-mono text-[#141414]/60 flex flex-col gap-1.5 mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>Replying to</span>
                            <AgentAvatar 
                              name={reply.parentPost.agentName} 
                              avatar={reply.parentPost.avatar} 
                              id={reply.parentPost.agentId} 
                              className="w-4 h-4 shrink-0" 
                            />
                            <button
                              type="button"
                              onClick={() => reply.parentPost && onOpenAgentProfile?.(reply.parentPost.agentName, reply.parentPost.avatar, reply.parentPost.agentId)}
                              className="font-bold text-[#141414] underline hover:opacity-70 transition-opacity cursor-pointer flex items-center gap-1"
                            >
                              {reply.parentPost.agentName}
                            </button>
                          </div>
                          <div
                            onClick={() => reply.parentPost && onOpenThread?.(reply.parentPost)}
                            className="p-2 bg-[#E4E3E0]/30 border-l-2 border-[#141414] italic overflow-x-auto no-scrollbar whitespace-nowrap cursor-pointer hover:bg-[#E4E3E0]/60 transition-colors"
                            title="Click to view full post"
                          >
                            <span>"{reply.parentPost.content}"</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-start gap-3">
                        <AgentAvatar 
                          name={reply.agentName || agentName} 
                          avatar={reply.avatar || currentAvatar} 
                          id={reply.agentId || inferredAgentId} 
                          className="w-8 h-8 shrink-0" 
                        />
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs uppercase text-[#141414]">{reply.agentName || agentName}</span>
                              {(reply.agentId || inferredAgentId) && (
                                <span className="inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                                  <span>@{reply.agentId || inferredAgentId}</span>
                                  {Boolean(reply.emailVerified ?? agentProfileData?.emailVerified) && <VerifiedBadge size="xs" />}
                                </span>
                              )}
                            </span>
                          </div>
                          <ExpandableText
                            text={reply.content}
                            maxLength={220}
                            className="text-sm leading-relaxed text-[#141414] whitespace-pre-line break-words"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-start pt-2 border-t border-[#141414]/10 font-mono text-[10px]">
                        {reply.parentPost && onOpenThread ? (
                          <button
                            type="button"
                            onClick={() => onOpenThread(reply.parentPost)}
                            className="font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] bg-white hover:bg-[#141414] hover:text-white border border-[#141414] px-2 py-0.5 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Full Reply</span>
                          </button>
                        ) : (
                          <span className="text-[#141414]/40 font-bold uppercase">Reply Record</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    No replies published yet by {agentName}
                  </div>
                )}
              </div>
            )}{/* 3. CLUSTERS TAB */}
            {activeTab === 'clusters' && (
              <div className="space-y-6">
                {/* Active Clusters Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <Shield className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h4 className="font-mono font-black uppercase text-[10px] tracking-wider text-[#141414]/80">
                      Active Clusters ({activeClusters.length})
                    </h4>
                  </div>
                  
                  {activeClusters.length > 0 ? (
                    <div className="space-y-4">
                      {activeClusters.map((cluster) => (
                        <div key={cluster.id} className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => onOpenClusterMembers?.(cluster)}
                            className="flex flex-col p-3 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:bg-[#E4E3E0]/30 hover:border-black cursor-pointer group transition-all text-left w-full"
                            title={`Cluster: ${cluster.name} - Click to view members`}
                          >
                            <div className="flex items-center gap-3 min-w-0 mb-2">
                              <div className="flex items-center justify-center w-10 h-10 border-2 border-[#141414] bg-[#141414] text-white shrink-0 font-mono text-sm tracking-widest font-black">
                                <span className="grayscale [font-variant-emoji:text] select-none text-white">{getClusterSymbol(cluster.id)}</span>
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                                  <span>{cluster.name}</span>
                                </span>
                                <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-x-auto no-scrollbar whitespace-nowrap max-w-full">
                                  <span>Role: {cluster.role}</span>
                                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                </span>
                              </div>
                            </div>
                            
                            {cluster.description && (
                              <p className="text-xs text-[#141414] italic border-l-[3px] border-[#141414] pl-2.5 mb-2 overflow-x-auto no-scrollbar whitespace-nowrap">
                                <span>"{cluster.description}"</span>
                              </p>
                            )}

                            <div className="border-t border-[#141414]/10 pt-3 w-full" onClick={(e) => e.stopPropagation()}>
                              <span className="font-mono text-[9px] text-[#141414] block uppercase tracking-wider mb-1.5 font-bold">
                                founder
                              </span>
                              <div 
                                className="flex items-center justify-between bg-[#E4E3E0]/20 hover:bg-[#E4E3E0]/35 border border-[#141414]/20 p-2 sm:p-2.5 transition-all cursor-pointer"
                                onClick={() => {
                                  const fName = cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent';
                                  const fAvatar = cluster.founderAgentAvatar || cluster.founderAvatar || cluster.ownerAgentAvatar;
                                  const fId = cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId;
                                  onOpenAgentProfile?.(fName, fAvatar, fId);
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <AgentAvatar 
                                    name={cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent'} 
                                    avatar={cluster.founderAgentAvatar || cluster.founderAvatar || cluster.ownerAgentAvatar} 
                                    id={cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId} 
                                    className="w-7 h-7 text-xs border border-[#141414]" 
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                                      <span>{cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent'}</span>
                                    </span>
                                    <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                                      <span>@{cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId}</span>
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <Shield className="w-5 h-5 opacity-30" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Active Clusters</div>
                    </div>
                  )}
                </div>

                {/* Dissolved Clusters Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h4 className="font-mono font-black uppercase text-[10px] tracking-wider text-[#141414]/80">
                      Dissolved Clusters ({dissolvedClusters.length})
                    </h4>
                  </div>
                  
                  {dissolvedClusters.length > 0 ? (
                    <div className="space-y-4">
                      {dissolvedClusters.map((cluster) => (
                        <div key={cluster.id} className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => onOpenClusterMembers?.(cluster)}
                            className="flex flex-col p-3 bg-[#F8F8F7] border-2 border-[#141414]/30 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:border-[#141414] hover:bg-[#E4E3E0]/20 cursor-pointer text-left w-full transition-all group"
                            title={`Cluster: ${cluster.name} (Dissolved) - Click to view members`}
                          >
                            <div className="flex items-center justify-between gap-3 min-w-0 mb-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex items-center justify-center w-10 h-10 border-2 border-[#141414]/30 bg-[#141414]/20 text-[#141414]/70 shrink-0 font-mono text-sm tracking-widest font-black grayscale">
                                  <span>{getClusterSymbol(cluster.id)}</span>
                                </div>
                                <div className="min-w-0 flex flex-col">
                                  <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414]/80">
                                    <span>{cluster.name}</span>
                                  </span>
                                  <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] font-bold text-[#141414]/70 bg-[#E4E3E0]/50 px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414]/20 self-start">
                                    <span>Role: {cluster.role}</span>
                                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414]/30 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                  </span>
                                </div>
                              </div>
                              <span className="inline-block font-mono text-[8px] font-bold uppercase text-[#141414]/70 border border-[#141414]/20 px-1.5 py-0.5 shrink-0">
                                DISSOLVED
                              </span>
                            </div>
                            
                            {cluster.description && (
                              <p className="text-xs text-[#141414]/60 italic border-l-[3px] border-[#141414]/30 pl-2.5 mb-2">
                                <span>"{cluster.description}"</span>
                              </p>
                            )}

                            <div className="border-t border-[#141414]/10 pt-3 w-full">
                              <span className="font-mono text-[9px] text-[#141414]/60 block uppercase tracking-wider mb-1.5 font-bold">
                                founder
                              </span>
                              <div 
                                className="flex items-center justify-between bg-[#E4E3E0]/10 border border-[#141414]/10 p-2 sm:p-2.5 transition-all cursor-pointer hover:bg-[#E4E3E0]/30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const fName = cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent';
                                  const fAvatar = cluster.founderAgentAvatar || cluster.founderAvatar || cluster.ownerAgentAvatar;
                                  const fId = cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId;
                                  onOpenAgentProfile?.(fName, fAvatar, fId);
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <AgentAvatar 
                                    name={cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent'} 
                                    avatar={cluster.founderAgentAvatar || cluster.founderAvatar || cluster.ownerAgentAvatar} 
                                    id={cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId} 
                                    className="w-7 h-7 text-xs border border-[#141414]/30 grayscale" 
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                                      <span>{cluster.founderAgentName || cluster.founderName || cluster.ownerAgentName || cluster.founderAgentId || cluster.ownerAgentId || 'Agent'}</span>
                                    </span>
                                    <span className="font-mono text-[9px] text-[#141414]/50 overflow-x-auto no-scrollbar whitespace-nowrap">
                                      <span>@{cluster.founderAgentId || cluster.founderId || cluster.ownerAgentId}</span>
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <ShieldAlert className="w-5 h-5 opacity-30" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Dissolved Clusters</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. CONNECTIONS TAB */}
            {activeTab === 'connections' && (
              <div className="space-y-6">
                
                {/* Active Connections Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <Network className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h4 className="font-mono font-black uppercase text-[10px] tracking-wider text-[#141414]/80">
                      Active Connections ({activeConnections.length})
                    </h4>
                  </div>
                  
                  {activeConnections.length > 0 ? (
                    <div className="space-y-4">
                      {activeConnections.map((conn) => {
                        const connReviews = reviews.filter((r: any) => 
                          String(r.connectionId).toLowerCase() === String(conn.id).toLowerCase()
                        );

                        return (
                          <div key={conn.id} className="flex flex-col">
                            <div
                              onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                              className="flex flex-col p-3 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:bg-[#E4E3E0]/30 hover:border-black cursor-pointer group transition-all text-left"
                              title={`Visit @${conn.agentId} (${conn.agentName})`}
                            >
                              <div className="flex items-center justify-between gap-3 w-full">
                                <div className="flex items-center gap-3 min-w-0">
                                  <AgentAvatar 
                                    name={conn.agentName} 
                                    avatar={conn.avatar} 
                                    id={conn.agentId}
                                    className="w-10 h-10 border-2 border-[#141414] group-hover:scale-105 transition-transform"
                                  />
                                  <div className="min-w-0 flex flex-col">
                                    <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap group-hover:underline">
                                      <span>{conn.agentName}</span>
                                    </span>
                                    <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-x-auto no-scrollbar whitespace-nowrap max-w-full">
                                      <span>@{conn.agentId}</span>
                                      {conn.emailVerified && <VerifiedBadge size="xs" />}
                                      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <span className="inline-block font-mono text-[9px] font-black uppercase text-[#141414] bg-white border border-[#141414] px-2 py-1 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] group-hover:bg-[#141414] group-hover:text-white transition-colors">
                                    VIEW PROFILE →
                                  </span>
                                </div>
                              </div>

                              {connReviews.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-[#141414]/20 space-y-3">
                                  {connReviews.map((r: any) => (
                                    <ScoreReviewCard
                                      key={r.id || r.reviewId}
                                      review={r}
                                      onOpenAgentProfile={onOpenAgentProfile}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <Network className="w-5 h-5 opacity-30" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Active Connections</div>
                    </div>
                  )}
                </div>

                {/* Dissolved Connections Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h4 className="font-mono font-black uppercase text-[10px] tracking-wider text-[#141414]/80">
                      Dissolved Connections ({dissolvedConnections.length})
                    </h4>
                  </div>
                  
                  {dissolvedConnections.length > 0 ? (
                    <div className="space-y-4">
                      {dissolvedConnections.map((conn) => {
                        const connReviews = reviews.filter((r: any) => 
                          String(r.connectionId).toLowerCase() === String(conn.id).toLowerCase()
                        );

                        return (
                          <div key={conn.id} className="flex flex-col">
                            <div
                              onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                              className="flex flex-col p-3 bg-[#F8F8F7] border-2 border-[#141414]/40 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.4)] hover:border-black cursor-pointer group transition-all text-left"
                            >
                              <div className="flex items-center justify-between gap-3 w-full">
                                <div className="flex items-center gap-3 min-w-0">
                                  <AgentAvatar 
                                    name={conn.agentName} 
                                    avatar={conn.avatar} 
                                    id={conn.agentId}
                                    className="w-10 h-10 border-2 border-[#141414]/40 grayscale group-hover:grayscale-0 transition-all"
                                  />
                                  <div className="min-w-0 flex flex-col">
                                    <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] group-hover:underline">
                                      {conn.agentName}
                                    </span>
                                    <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0]/50 px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414]/20 self-start overflow-x-auto no-scrollbar whitespace-nowrap max-w-full overflow-hidden">
                                      <span>@{conn.agentId}</span>
                                      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414]/30 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <span className="inline-block font-mono text-[8px] font-bold uppercase text-[#141414] border border-[#141414]/20 px-1.5 py-0.5">
                                    TERMINATED
                                  </span>
                                </div>
                              </div>

                              {connReviews.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-[#141414]/10 space-y-3">
                                  {connReviews.map((r: any) => (
                                    <ScoreReviewCard
                                      key={r.id || r.reviewId}
                                      review={r}
                                      onOpenAgentProfile={onOpenAgentProfile}
                                      isDissolved
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <ShieldAlert className="w-5 h-5 opacity-30" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Dissolved Connections</div>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};
