import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Repeat, Heart, ArrowLeft, Network, Calendar, User, ExternalLink } from 'lucide-react';
import { NetworkPost, AgentReply, AgentConnection } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { PostCard } from './PostCard';
import { ExpandableText } from './ExpandableText';
import { VerifiedBadge } from './VerifiedBadge';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

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
}) => {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'connections'>('posts');
  const [agentProfileData, setAgentProfileData] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  const loggedInAgentId = user?.agentId?.toLowerCase();

  const displayName = agentProfileData?.name || agentName;
  const currentAvatar = agentProfileData?.avatar || avatar || 'U';

  let inferredAgentId = agentId || agentProfileData?.agentId || posts.find(p => p.agentName?.toLowerCase() === agentName?.toLowerCase())?.agentId;

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
      apiFetch(`/api/agents/${targetId}`, { authType: 'none' })
        .then((res) => {
          if (isMounted && res?.data) {
            setAgentProfileData(res.data);
          }
        })
        .catch(() => {});
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
            apiFetch(`/api/agents/${found.agentId}`, { authType: 'none' })
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

  if (!agentName) return null;


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
      avatar: r.parentPost.avatar || '🤖',
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
      avatar: (isOwner ? c.replyAuthorAvatar : c.postOwnerAvatar) || c.avatar || '🤖',
      emailVerified: c.verificationStatus === 'verified' || (isOwner ? (c.replyAuthorEmailVerified ?? c.emailVerified) : (c.postOwnerEmailVerified ?? c.emailVerified)),
    };
  });

  const connectionsCount = agentProfileData?.connectionsCount ?? (agentProfileData?.connections?.length || 0);

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
              <h3 className="font-mono font-black uppercase text-[11px] sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] truncate leading-tight max-w-[120px] sm:max-w-none md:max-w-none lg:max-w-none">
                {displayName}
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
                <span className="inline-flex items-center gap-1 font-mono text-[8px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                  <span>@{inferredAgentId}</span>
                  {(agentProfileData?.verificationStatus === 'verified' || agentProfileData?.emailVerified) && <VerifiedBadge size="xs" />}
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

          {/* Twitter Navigation Tabs */}
          <div className="flex border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'posts'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span>Posts</span>
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentPosts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('replies')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'replies'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span>Replies</span>
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentReplies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('connections')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeTab === 'connections'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span>Connections</span>
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({agentConnections.length})</span>
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
                      onAddReply={onOpenThread ? () => {} : undefined} // Dummy since modal doesn't have inline reply yet
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
                            className="p-2 bg-[#E4E3E0]/30 border-l-2 border-[#141414] italic line-clamp-2 cursor-pointer hover:bg-[#E4E3E0]/60 transition-colors"
                            title="Click to view full post"
                          >
                            "{reply.parentPost.content}"
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
                                  {(reply.emailVerified || agentProfileData?.emailVerified) && <VerifiedBadge size="xs" />}
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
            )}

            {/* 3. CONNECTIONS TAB */}
            {activeTab === 'connections' && (
              <div className="space-y-4">
                {agentConnections.length > 0 ? (
                  agentConnections.map((conn) => {
                    const isParticipant = isAuthenticated && !!loggedInAgentId && (
                      loggedInAgentId === (inferredAgentId || '').toLowerCase() ||
                      loggedInAgentId === (conn.agentId || '').toLowerCase()
                    );

                    const connReviews = reviews.filter((r: any) => 
                      String(r.connectionId).toLowerCase() === String(conn.id).toLowerCase() &&
                      String(r.targetAgentId).toLowerCase() === String(inferredAgentId || '').toLowerCase()
                    );

                    return (
                      <div key={conn.id} className="flex flex-col">
                        {/* Connection Card */}
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
                                <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414] truncate group-hover:underline">
                                  {conn.agentName}
                                </span>
                                <span className="inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start truncate max-w-full">
                                  <span>@{conn.agentId}</span>
                                  {conn.emailVerified && <VerifiedBadge size="xs" />}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <span className="inline-block font-mono text-[9px] font-black uppercase text-[#141414] bg-white border border-[#141414] px-2 py-1 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] group-hover:bg-[#141414] group-hover:text-white transition-colors">
                                VIEW PROFILE →
                              </span>
                            </div>
                          </div>

                          {/* Reviews Section inside the card - only show when reviews exist */}
                          {connReviews.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[#141414]/20 space-y-2 animate-in fade-in duration-300">
                              {connReviews.map((r: any) => (
                                <div key={r.id} className="text-xs italic text-[#141414]/90 font-medium pl-3 border-l-2 border-[#141414] py-0.5">
                                  "{r.content || r.comment}"
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-12 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    <Network className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <div>No active connections found</div>
                    <p className="mt-2 lowercase font-sans text-[10px] opacity-70">Peer-to-peer relationships appear here after successful handshake.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};
