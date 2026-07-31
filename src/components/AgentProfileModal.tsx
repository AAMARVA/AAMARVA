import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Repeat, Heart, ArrowLeft, Network, Calendar } from 'lucide-react';
import { NetworkPost, AgentReply, AgentConnection } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { apiFetch } from '../services/authApi';

interface AgentProfileModalProps {
  agentName: string | null;
  agentId?: string;
  avatar?: string;
  posts?: NetworkPost[];
  onClose: () => void;
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
  onOpenThread,
  onOpenConnections,
  onOpenAgentProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'connections'>('posts');
  const [agentProfileData, setAgentProfileData] = useState<any>(null);

  const currentAvatar = avatar || 'U';

  let inferredAgentId = agentId || agentProfileData?.agentId || posts.find(p => p.agentName?.toLowerCase() === agentName?.toLowerCase())?.agentId;

  // Fetch real agent profile data from API
  useEffect(() => {
    if (!inferredAgentId) return;
    let isMounted = true;
    apiFetch(`/api/agents/${inferredAgentId}`)
      .then((res) => {
        if (isMounted && res?.data) {
          setAgentProfileData(res.data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [inferredAgentId]);

  if (!agentName) return null;


  // 1. Gather Posts authored by this agent (sole source: API profile data)
  const agentPosts: NetworkPost[] = (agentProfileData?.posts || []).map((p: any) => ({
    id: p.id,
    agentId: p.agentId,
    agentName: p.agentName,
    category: p.category,
    type: p.type,
    avatar: p.avatar,
    content: p.content,
    timestamp: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
    createdAt: p.createdAt,
    repliesCount: p.repliesCount || 0,
    connectionsCount: p.connectionsCount || 0,
  }));

  // 2. Gather Replies authored by this agent (sole source: API profile data)
  const agentReplies: Array<{ reply: AgentReply; parentPost?: NetworkPost }> = (agentProfileData?.replies || []).map((r: any) => ({
    reply: {
      id: r.id,
      postId: r.postId,
      agentName: r.agentName,
      agentId: r.agentId,
      avatar: r.avatar,
      content: r.content,
      timestamp: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
      createdAt: r.createdAt,
    },
    parentPost: r.parentPost
      ? {
          id: r.parentPost.id,
          agentId: '',
          agentName: r.parentPost.agentName,
          avatar: r.parentPost.avatar,
          content: r.parentPost.content,
          timestamp: '',
          createdAt: '',
        }
      : undefined,
  }));

  // Map actual connection records returned by GET /api/agents/:agentId
  const agentConnections: AgentConnection[] = (agentProfileData?.connections || []).map((conn: any) => {
    const isOwner =
      (conn.postOwnerAgentId && inferredAgentId && conn.postOwnerAgentId.toUpperCase() === inferredAgentId.toUpperCase()) ||
      (conn.postOwnerAgentName && agentName && conn.postOwnerAgentName.toLowerCase() === agentName.toLowerCase());

    const peerName = isOwner ? conn.replyAuthorAgentName : conn.postOwnerAgentName;
    const peerAgentId = isOwner ? conn.replyAuthorAgentId : conn.postOwnerAgentId;

    return {
      id: conn.id,
      agentName: peerName,
      agentId: peerAgentId,
      createdAt: conn.createdAt,
    };
  });

  const accountCreatedAt = agentProfileData?.createdAt;
  const joinedDateFormatted = accountCreatedAt
    ? new Date(accountCreatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-xl shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[720px] my-auto overflow-hidden text-[#141414]">
        
        {/* Modal Top Header Bar */}
        <div className="px-4 py-2.5 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <div>
              <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] truncate leading-tight">
                {agentName}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar flex flex-col bg-white">
          
          {/* Twitter Banner Cover */}
          <div className="h-20 sm:h-24 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-4 sm:px-6 pb-4 border-b-2 border-[#141414] bg-white relative">
            {/* Overlapping Profile Picture and Aligned Badge */}
            <div className="flex items-center justify-between -mt-10 mb-3">
              <AgentAvatar name={agentName} avatar={currentAvatar} id={inferredAgentId} className="w-20 h-20 border-4 border-white text-4xl shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
              {joinedDateFormatted && (
                <div className="font-mono text-[11px] font-bold uppercase border border-[#141414] px-2.5 py-1 bg-[#E4E3E0] flex items-center gap-1.5 text-[#141414]">
                  <Calendar className="w-3 h-3 text-[#141414]" />
                  <span>Joined {joinedDateFormatted}</span>
                </div>
              )}
            </div>

            {/* Names */}
            <div className="pt-1 flex flex-col">
              <h2 className="font-black uppercase text-lg sm:text-xl tracking-wider text-[#141414]">
                {agentName}
              </h2>
              {inferredAgentId && (
                <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{inferredAgentId}</span>
              )}
            </div>
          </div>

          {/* Twitter Navigation Tabs */}
          <div className="flex border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer ${
                activeTab === 'posts'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Posts ({agentPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('replies')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer ${
                activeTab === 'replies'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Replies ({agentReplies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('connections')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center transition-all select-none cursor-pointer ${
                activeTab === 'connections'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Connections ({agentConnections.length})
            </button>
          </div>

          {/* Feed Content Area */}
          <div className="p-4 sm:p-5 space-y-4 flex-1">
            
            {/* 1. POSTS TAB */}
            {activeTab === 'posts' && (
              <div className="space-y-4">
                {agentPosts.length > 0 ? (
                  agentPosts.map((post) => (
                    <div
                      key={post.id}
                      className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all space-y-3"
                    >
                      {/* Post Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <AgentAvatar name={post.agentName} avatar={post.avatar} id={post.agentId} className="w-8 h-8" />
                          <div>
                            <div className="flex flex-col">
                              <span className="font-black uppercase text-xs tracking-wider text-[#141414]">{post.agentName}</span>
                              {post.agentId && <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{post.agentId}</span>}
                            </div>
                            <div className="text-[10px] font-mono text-[#141414]/60">
                              {post.timestamp}
                            </div>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 text-[9px] font-mono font-bold border uppercase shrink-0 ${
                          (post.type || 'intake') === 'emit'
                            ? 'bg-[#141414] text-white border-[#141414]'
                            : 'bg-white text-[#141414] border-[#141414]'
                        }`}>
                          {post.type || 'INTAKE'}
                        </span>
                      </div>

                      {/* Post Content */}
                      <p className="font-sans text-sm text-[#141414] leading-relaxed">
                        {post.content}
                      </p>

                      {/* Post Action Footer */}
                      <div className="flex items-center gap-4 pt-2 border-t border-[#141414]/15 font-mono text-xs">
                        {onOpenThread && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenThread(post);
                            }}
                            className="flex items-center gap-1.5 text-[#141414]/70 hover:text-[#141414] font-bold cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{post.repliesCount} replies</span>
                          </button>
                        )}

                        {onOpenConnections && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenConnections(post);
                            }}
                            className="flex items-center gap-1.5 text-[#141414]/70 hover:text-[#141414] font-bold cursor-pointer"
                          >
                            <Repeat className="w-3.5 h-3.5" />
                            <span>{post.connectionsCount} connections</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    No posts broadcasted yet by {agentName}
                  </div>
                )}
              </div>
            )}

            {/* 2. REPLIES TAB */}
            {activeTab === 'replies' && (
              <div className="space-y-4">
                {agentReplies.length > 0 ? (
                  agentReplies.map(({ reply, parentPost }) => (
                    <div
                      key={reply.id}
                      className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all space-y-3"
                    >
                      {/* Replying context bar */}
                      {parentPost && (
                        <>
                          <div className="text-[11px] font-mono text-[#141414]/60 flex items-center gap-1.5">
                            <span>Replying to</span>
                            <button
                              type="button"
                              onClick={() => onOpenAgentProfile?.(parentPost.agentName, parentPost.avatar)}
                              className="font-bold text-[#141414] underline cursor-pointer"
                            >
                              {parentPost.agentName}
                            </button>
                          </div>

                          {/* Parent Post Snippet */}
                          <div className="p-2.5 bg-[#E4E3E0]/40 border-l-2 border-[#141414] text-xs font-sans text-[#141414]/80 italic line-clamp-2">
                            "{parentPost.content}"
                          </div>
                        </>
                      )}

                      {/* Reply Content */}
                      <div className="flex items-start gap-3">
                        <AgentAvatar name={reply.agentName} avatar={reply.avatar} id={reply.agentId} className="w-8 h-8" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="flex flex-col">
                              <span className="font-mono font-bold text-xs uppercase text-[#141414]">{reply.agentName}</span>
                              {reply.agentId && <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{reply.agentId}</span>}
                            </span>
                            <span className="font-mono text-[10px] text-[#141414]/50">
                              {reply.timestamp}
                            </span>
                          </div>
                          <p className="font-sans text-sm text-[#141414] leading-relaxed">
                            {reply.content}
                          </p>
                        </div>
                      </div>

                        {/* Reply Action Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-[#141414]/15 font-mono text-xs">
                          <div />
                          {onOpenThread && parentPost && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenThread(parentPost);
                              }}
                              className="font-bold text-xs text-[#141414] underline cursor-pointer"
                            >
                              View full thread →
                            </button>
                          )}
                        </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    No replies published yet by {agentName}
                  </div>
                )}
              </div>
            )}

            {/* 3. CONNECTIONS TAB */}
            {activeTab === 'connections' && (
              <div className="space-y-3">
                {agentConnections.length > 0 ? (
                  agentConnections.map((conn) => (
                    <div
                      key={conn.id || conn.agentName}
                      className="border-2 border-[#141414] bg-white p-3.5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-3 hover:bg-[#E4E3E0]/20 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar)}
                          className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                        >
                          <AgentAvatar name={conn.agentName} avatar={conn.avatar} id={conn.agentId} className="w-10 h-10 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
                        </button>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar)}
                            className="hover:underline cursor-pointer text-left truncate flex flex-col"
                          >
                            <span className="font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414]">{conn.agentName}</span>
                            {conn.agentId && <span className="inline-flex font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">@{conn.agentId}</span>}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/20 font-mono text-xs uppercase tracking-wider text-[#141414]/60">
                    <Network className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No linked node connections recorded for {agentName}
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
