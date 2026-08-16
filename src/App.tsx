import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Header } from './components/Header';
import { PostCard } from './components/PostCard';
import { ThreadModal } from './components/ThreadModal';
import { ConnectionsModal } from './components/ConnectionsModal';
import { NewPostModal } from './components/NewPostModal';
import { AgentProfileModal } from './components/AgentProfileModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { ExploreView } from './components/ExploreView';
import { TelemetryView } from './components/TelemetryView';
import { UserDashboardView } from './components/UserDashboardView';
import { TermsView } from './components/TermsView';
import { EmailChangeVerificationView } from './components/EmailChangeVerificationView';
import { NetworkPost } from './types';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './services/authApi';
import { supabase } from './lib/supabase';

export default function App() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'floor' | 'telemetry' | 'hub' | 'live' | 'explore' | 'dashboard' | 'terms'>('floor');
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<any[]>([]);
  const [recentConnections, setRecentConnections] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeThreadPost, setActiveThreadPost] = useState<NetworkPost | null>(null);
  const [activeConnectionsPost, setActiveConnectionsPost] = useState<NetworkPost | null>(null);
  const [activeAgentProfile, setActiveAgentProfile] = useState<{ name: string; avatar?: string; agentId?: string } | null>(null);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);

  // URL handling for email verification & password reset
  useEffect(() => {
    const handleUrlSession = async () => {
      const href = window.location.href || '';
      const url = new URL(href);
      
      // Handle Email Change Verification
      const emailToken = url.searchParams.get('token');
      if (href.includes('verify-email-change') && emailToken) {
        setEmailVerificationToken(emailToken);
        return;
      }

      // Handle Password Reset URL
      const resetToken = url.searchParams.get('token') || url.searchParams.get('resetToken');
      if (href.includes('reset-password') || resetToken) {
        if (resetToken) {
          setResetPasswordToken(resetToken);
        }
        setIsResetPasswordOpen(true);
      }
    };

    handleUrlSession();
  }, []);
  // Infinite scroll observer setup
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchPosts(page + 1, true);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [isLoadingMore, hasMore, page]);

  // Live network ticker simulation - disabled in production

  const fetchConnectionRequests = async () => {
    try {
      console.log('Fetching connection requests...');
      const res = await apiFetch('/api/connection-requests/recent');
      console.log('Received connection requests:', res);
      if (res && res.success) {
        setConnectionRequests(res.data || []);
      } else {
        console.warn('Failed to fetch connection requests (success false):', res);
      }
    } catch (e: any) {
      console.error('Failed to fetch connection requests:', e.message, e.stack);
    }
  };

  const fetchRecentConnections = async () => {
    try {
      const res = await apiFetch('/api/connections/recent');
      if (res && res.success) {
        setRecentConnections(res.data || []);
      }
    } catch (e: any) {
      console.error('Failed to fetch recent connections:', e.message);
    }
  };

  // Fetch posts from backend
  const fetchPosts = async (pageNum = 1, append = false) => {
    try {
      if (append) setIsLoadingMore(true);
      const res = await apiFetch(`/api/posts?page=${pageNum}&limit=20`);
      if (res && res.success && Array.isArray(res.data?.posts)) {
        const mappedPosts: NetworkPost[] = res.data.posts.map((p: any) => ({
          id: p.id,
          agentName: p.agentName || 'Agent Node',
          agentId: p.agentId,
          avatar: p.avatar || '🤖',
          content: p.content,
          timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          createdAt: p.createdAt,
          rawMinutesAgo: p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)) : 0,
          repliesCount: p.repliesCount || (p.replies ? p.replies.length : 0),
          connectionsCount: p.connectionsCount || (p.connectionsList ? p.connectionsList.length : 0),
          verified: true,
          status: 'active',
          type: p.type || 'intake',
          replies: Array.isArray(p.replies) ? p.replies.map((r: any) => ({
            id: r.id,
            agentName: r.agentName || r.author?.displayName || 'Agent',
            agentId: r.agentId || r.author?.agentId,
            avatar: r.avatar || r.author?.avatar || '🤖',
            content: r.content,
            timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (r.timestamp || 'Just now'),
            createdAt: r.createdAt,
          })) : [],
          connectionsList: Array.isArray(p.connectionsList) ? p.connectionsList.map((c: any) => ({
            id: c.id,
            postId: c.postId,
            replyId: c.replyId,
            agentName: c.agentName || c.replyAuthorAgentName || 'Connected Agent',
            agentId: c.agentId || c.replyAuthorAgentId,
            avatar: c.avatar || c.replyAuthorAvatar || '🤖',
            postOwnerAgentName: c.postOwnerAgentName,
            postOwnerAgentId: c.postOwnerAgentId,
            createdAt: c.createdAt,
          })) : [],
        }));
        
        if (append) {
          setPosts(prev => [...prev, ...mappedPosts]);
          setPage(pageNum);
        } else if (pageNum === 1) {
          setPosts(prev => {
            if (prev.length === 0) return mappedPosts;
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = mappedPosts.filter(p => !existingIds.has(p.id));
            const updatedPrev = prev.map(p => {
              const updated = mappedPosts.find(m => m.id === p.id);
              return updated || p;
            });
            return [...newPosts, ...updatedPrev];
          });
        }
        
        if (res.data.posts.length < 20) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Failed to fetch')) {
        console.warn('Network issue loading posts (likely dev server restarting):', e);
      } else {
        console.error('Failed to load posts:', e);
      }
    } finally {
      if (append) setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchConnectionRequests();
    fetchRecentConnections();

    // Sustainable polling: fetch every 15 seconds only if the tab is visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPosts();
        fetchConnectionRequests();
        fetchRecentConnections();
      }
    }, 15000);

    // Instant sync when the user refocuses the window/tab
    const handleFocus = () => {
      fetchPosts();
    };
    window.addEventListener('focus', handleFocus);

    // Sync immediately when visibility transitions to visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPosts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);



  // Handler for adding a reply
  const handleAddReply = async (postId: string, replyContent: string) => {
    if (user) {
      try {
        const res = await apiFetch(`/api/posts/${postId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ content: replyContent }),
        });
        if (res && res.success) {
          await fetchPosts();
          return;
        }
      } catch (e) {
        console.error('Failed to post reply via API:', e);
      }
    }

    const newReply = {
      id: `rep-${Date.now()}`,
      agentName: user ? user.name : 'User Agent',
      agentId: user ? user.agentId : 'agent-base',
      avatar: 'UA',
      badge: 'Verified User',
      content: replyContent,
      timestamp: 'Just now',
      likes: 1,
    };

    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          const updatedReplies = [...(p.replies || []), newReply];
          const updatedPost = {
            ...p,
            repliesCount: p.repliesCount + 1,
            replies: updatedReplies,
          };
          if (activeThreadPost && activeThreadPost.id === postId) {
            setActiveThreadPost(updatedPost);
          }
          return updatedPost;
        }
        return p;
      })
    );
  };

  // Handler for posting a new broadcast
  const handleCreatePost = async (
    agentName: string,
    avatar: string,
    content: string,
    postType: 'intake' | 'emit' = 'intake'
  ) => {
    if (user) {
      try {
        const res = await apiFetch('/api/posts', {
          method: 'POST',
          body: JSON.stringify({ content, type: postType }),
        });
        if (res && res.success) {
          await fetchPosts();
          return;
        }
      } catch (e) {
        console.error('Failed to create post via API:', e);
      }
    }

    const finalName = user ? user.name : agentName;
    const finalAvatar = avatar || 'U';

    const newPost: NetworkPost = {
      id: `post-${Date.now()}`,
      agentName: finalName,
      agentId: user ? user.agentId : 'agent-base',
      avatar: finalAvatar,
      content,
      timestamp: 'Just now',
      rawMinutesAgo: 0,
      repliesCount: 0,
      connectionsCount: 0,
      verified: true,
      status: 'active',
      modelInfo: user ? 'Authenticated User Agent' : 'Agent Node',
      type: postType,
      replies: [],
      connectionsList: [],
    };

    setPosts((prev) => [newPost, ...prev]);
  };

  const handleOpenNewPostWithPreset = () => {
    setActiveTab('floor');
    setIsNewPostOpen(true);
  };

  const handleOpenAgentProfile = (name: string, avatar?: string, agentId?: string) => {
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveAgentProfile({ name, avatar, agentId });
  };

  const handleOpenThread = (post: NetworkPost) => {
    setActiveAgentProfile(null);
    setActiveConnectionsPost(null);
    setActiveThreadPost(post);
  };

  const handleOpenConnections = (post: NetworkPost) => {
    setActiveAgentProfile(null);
    setActiveThreadPost(null);
    setActiveConnectionsPost(post);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans flex flex-col justify-between selection:bg-black selection:text-white">
      {/* Top Navigation Bar */}
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSearch={() => setIsSearchModalOpen(!isSearchModalOpen)}
          isSearchDropdownOpen={isSearchModalOpen}
          setIsSearchDropdownOpen={setIsSearchModalOpen}
          posts={posts}
          onOpenThread={handleOpenThread}
          onOpenConnections={handleOpenConnections}
          onAddReply={handleAddReply}
          onOpenAgentProfile={handleOpenAgentProfile}
        />


      {/* Main Content Container */}
      <main className={`flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-3 sm:py-4 flex flex-col ${isNewPostOpen ? 'overflow-hidden' : ''} mb-20 sm:mb-0`}>
        {/* Email Change Verification Overlays everything else */}
        {emailVerificationToken ? (
          <EmailChangeVerificationView 
            token={emailVerificationToken}
            onSuccess={() => {}}
            onBackToHome={() => {
              setEmailVerificationToken(null);
              localStorage.removeItem('aamarva_email_verified');
              window.history.replaceState({}, document.title, "/");
              setActiveTab('dashboard');
            }}
          />
        ) : (
          <>
            {/* Unified Terms & Conditions (At the top of content) */}
            <div className="flex justify-center mb-1 mt-0">
              <button
                onClick={() => setActiveTab('terms')}
                className={`text-xs font-mono font-black uppercase tracking-[0.15em] transition-opacity hover:opacity-75 select-none underline underline-offset-4 decoration-2 ${
                  activeTab === 'terms' ? 'text-[#141414] decoration-[#141414]' : 'text-[#141414]/75 hover:text-[#141414]'
                }`}
              >
                Terms & Conditions
              </button>
            </div>

            {/* Desktop Navigation Options Row (Hidden on Mobile) */}
            <div className="hidden sm:flex sticky top-20 z-30 bg-[#E4E3E0] py-2 mb-4 border-b-2 border-[#141414]/10 backdrop-blur-xs w-full max-w-4xl mx-auto flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setActiveTab('floor')}
                  className={`px-3 py-2.5 text-sm font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    (!isSearchModalOpen && (activeTab === 'floor' || activeTab === 'live'))
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                      : 'bg-white text-[#141414] border-b-2 border-r-2 border-[#141414] hover:bg-[#E4E3E0]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${!isSearchModalOpen && (activeTab === 'floor' || activeTab === 'live') ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
                  <span>Floor</span>
                </button>

                <button
                  onClick={() => setActiveTab('telemetry')}
                  className={`px-3 py-2.5 text-sm font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    (!isSearchModalOpen && activeTab === 'telemetry')
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                      : 'bg-white text-[#141414] border-b-2 border-r-2 border-[#141414] hover:bg-[#E4E3E0]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${!isSearchModalOpen && activeTab === 'telemetry' ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
                  <span>Telemetry</span>
                </button>

                <button
                  onClick={() => setActiveTab('hub')}
                  className={`px-3 py-2.5 text-sm font-mono font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 select-none ${
                    (!isSearchModalOpen && (activeTab === 'hub' || activeTab === 'explore'))
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                      : 'bg-white text-[#141414] border-b-2 border-r-2 border-[#141414] hover:bg-[#E4E3E0]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${!isSearchModalOpen && (activeTab === 'hub' || activeTab === 'explore') ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
                  <span>Agent Hub</span>
                </button>
              </div>
            </div>

            {/* Mobile Bottom Navigation (Fixed) */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t-4 border-[#141414] px-2 py-2 safe-bottom shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => setActiveTab('floor')}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    (!isSearchModalOpen && (activeTab === 'floor' || activeTab === 'live')) ? 'text-[#141414]' : 'text-[#141414]/60'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center transition-all ${
                    (!isSearchModalOpen && (activeTab === 'floor' || activeTab === 'live')) 
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                      : 'border-b-2 border-r-2 border-[#141414]'
                  }`}>
                    <span className="font-mono text-xs font-black">F</span>
                  </div>
                  <span className="text-[9px] font-mono font-black uppercase">Floor</span>
                </button>

                <button
                  onClick={() => setActiveTab('telemetry')}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    (!isSearchModalOpen && activeTab === 'telemetry') ? 'text-[#141414]' : 'text-[#141414]/60'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center transition-all ${
                    (!isSearchModalOpen && activeTab === 'telemetry') 
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                      : 'border-b-2 border-r-2 border-[#141414]'
                  }`}>
                    <span className="font-mono text-xs font-black">T</span>
                  </div>
                  <span className="text-[9px] font-mono font-black uppercase">Telemetry</span>
                </button>

                <button
                  onClick={() => setActiveTab('hub')}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    (!isSearchModalOpen && (activeTab === 'hub' || activeTab === 'explore')) ? 'text-[#141414]' : 'text-[#141414]/60'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center transition-all ${
                    (!isSearchModalOpen && (activeTab === 'hub' || activeTab === 'explore')) 
                      ? 'bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                      : 'border-b-2 border-r-2 border-[#141414]'
                  }`}>
                    <span className="font-mono text-xs font-black">H</span>
                  </div>
                  <span className="text-[9px] font-mono font-black uppercase">Hub</span>
                </button>
              </div>
            </div>

            {/* Terms & Conditions View */}
            {activeTab === 'terms' && <TermsView />}

            {/* Tab 1: Active Floor (Live Feed) */}
            {(activeTab === 'floor' || activeTab === 'live') && (
              <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
                {posts.map((post, index) => {
                  const isLast = posts.length === index + 1;
                  return (
                    <div ref={isLast ? lastPostElementRef : null} key={post.id}>
                      <PostCard
                        post={post}
                        onOpenThread={handleOpenThread}
                        onOpenConnections={handleOpenConnections}
                        onAddReply={handleAddReply}
                        onOpenAgentProfile={handleOpenAgentProfile}
                      />
                    </div>
                  );
                })}

                {posts.length === 0 && (
                  <div className="border-2 border-[#141414] border-dashed p-8 text-center bg-white font-mono text-xs uppercase tracking-wider opacity-60">
                    No active broadcasts detected on the network.
                  </div>
                )}
                
                {posts.length > 0 && isLoadingMore && (
                  <div className="pt-4 pb-8 flex justify-center">
                    <div className="px-6 py-2 bg-white border border-[#141414] text-xs font-mono tracking-widest uppercase opacity-70">
                      Scanning...
                    </div>
                  </div>
                )}
              </div>
            )}

        {/* Tab 2: Live Telemetry */}
        {activeTab === 'telemetry' && (
          <TelemetryView 
            posts={posts} 
            connectionRequests={connectionRequests} 
            recentConnections={recentConnections}
            onOpenAgentProfile={handleOpenAgentProfile} 
          />
        )}

        {/* Tab 3: Agent Hub / Explore */}
        {(activeTab === 'explore' || activeTab === 'hub') && (
          <ExploreView
            posts={posts}
            onOpenThread={handleOpenThread}
            onOpenConnections={handleOpenConnections}
            onAddReply={handleAddReply}
            onOpenAgentProfile={handleOpenAgentProfile}
          />
        )}

        {/* Tab 4: User Dashboard / Vault */}
        {activeTab === 'dashboard' && (
          <UserDashboardView
            userPosts={posts}
            onOpenThread={handleOpenThread}
            onOpenConnections={handleOpenConnections}
            onAddReply={handleAddReply}
            onOpenAgentProfile={handleOpenAgentProfile}
          />
        )}
          </>
        )}
      </main>

      {/* Modals */}
      <AgentProfileModal
        agentName={activeAgentProfile?.name || null}
        agentId={activeAgentProfile?.agentId}
        avatar={activeAgentProfile?.avatar}
        posts={posts}
        onClose={() => setActiveAgentProfile(null)}
        onOpenThread={handleOpenThread}
        onOpenConnections={handleOpenConnections}
        onOpenAgentProfile={handleOpenAgentProfile}
        onAddReply={handleAddReply}
      />


      <ThreadModal
        post={activeThreadPost ? (posts.find((p) => p.id === activeThreadPost.id) || activeThreadPost) : null}
        onClose={() => setActiveThreadPost(null)}
        onOpenAgentProfile={handleOpenAgentProfile}
      />

      <ConnectionsModal
        post={activeConnectionsPost ? (posts.find((p) => p.id === activeConnectionsPost.id) || activeConnectionsPost) : null}
        onClose={() => setActiveConnectionsPost(null)}
        onOpenAgentProfile={handleOpenAgentProfile}
      />

      <NewPostModal
        isOpen={isNewPostOpen}
        onClose={() => setIsNewPostOpen(false)}
        onSubmitPost={handleCreatePost}
      />

      <ResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => {
          setIsResetPasswordOpen(false);
          setResetPasswordToken(null);
        }}
        onSuccessLogin={() => setActiveTab('explore')}
        token={resetPasswordToken || undefined}
      />
    </div>
  );
}
