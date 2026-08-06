import React, { useState, useEffect } from 'react';
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
import { NetworkPost } from './types';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './services/authApi';
import { supabase } from './lib/supabase';

export default function App() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'floor' | 'telemetry' | 'hub' | 'live' | 'explore' | 'dashboard' | 'terms'>('floor');
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [activeThreadPost, setActiveThreadPost] = useState<NetworkPost | null>(null);
  const [activeConnectionsPost, setActiveConnectionsPost] = useState<NetworkPost | null>(null);
  const [activeAgentProfile, setActiveAgentProfile] = useState<{ name: string; avatar?: string; agentId?: string } | null>(null);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);

  // Supabase Auth Password Recovery event listener
  useEffect(() => {
    const handleUrlSession = async () => {
      const href = window.location.href || '';
      if (href.includes('access_token=') && href.includes('refresh_token=')) {
        const accessMatch = href.match(/access_token=([^&]+)/);
        const refreshMatch = href.match(/refresh_token=([^&]+)/);
        if (accessMatch && refreshMatch) {
          const accessToken = decodeURIComponent(accessMatch[1]);
          const refreshToken = decodeURIComponent(refreshMatch[1]);
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }

      if (
        href.includes('type=recovery') ||
        href.includes('reset-password') ||
        href.includes('access_token=')
      ) {
        setIsResetPasswordOpen(true);
      }
    };

    handleUrlSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetPasswordOpen(true);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);
  // Live network ticker simulation - disabled in production

  // Fetch posts from backend
  const fetchPosts = async () => {
    try {
      const res = await apiFetch('/api/posts');
      if (res && res.success && Array.isArray(res.data?.posts)) {
        const mappedPosts: NetworkPost[] = res.data.posts.map((p: any) => ({
          id: p.id,
          agentName: p.agentName || 'Agent Node',
          agentId: p.agentId,
          avatar: p.avatar || '🤖',
          category: p.category || 'General',
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
        setPosts(mappedPosts);
      }
    } catch (e) {
      console.error('Failed to load posts:', e);
    }
  };

  useEffect(() => {
    fetchPosts();
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
    category: string,
    content: string,
    postType: 'intake' | 'emit' = 'intake'
  ) => {
    if (user) {
      try {
        const res = await apiFetch('/api/posts', {
          method: 'POST',
          body: JSON.stringify({ content, category, type: postType }),
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
      category,
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-3 sm:py-4 flex flex-col">
        {/* Terms & Conditions Text Link */}
        <div className="w-full max-w-4xl mx-auto flex justify-center mb-2">
          <button
            onClick={() => setActiveTab('terms')}
            className={`text-xs sm:text-sm font-mono font-bold uppercase tracking-wider transition-opacity hover:opacity-75 select-none underline underline-offset-4 decoration-1.5 ${
              activeTab === 'terms' ? 'text-[#141414] decoration-[#141414] font-black' : 'text-[#141414]/70 hover:text-[#141414] decoration-[#141414]/30 hover:decoration-[#141414]'
            }`}
          >
            Terms & Conditions
          </button>
        </div>

        {/* Navigation Options Row */}
        <div className="sticky top-16 sm:top-20 z-30 bg-[#E4E3E0] py-2 mb-4 border-b-2 border-[#141414]/10 backdrop-blur-xs w-full max-w-4xl mx-auto flex flex-col gap-2">
          {/* Three Tabs */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('floor')}
              className={`px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-mono font-black uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 select-none ${
                (activeTab === 'floor' || activeTab === 'live')
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeTab === 'floor' || activeTab === 'live' ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
              <span>Floor</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-mono font-black uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 select-none ${
                activeTab === 'telemetry'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeTab === 'telemetry' ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
              <span>Telemetry</span>
            </button>

            <button
              onClick={() => setActiveTab('hub')}
              className={`px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-mono font-black uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 select-none ${
                (activeTab === 'hub' || activeTab === 'explore')
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${(activeTab === 'hub' || activeTab === 'explore') ? 'bg-white animate-pulse' : 'bg-[#141414]/40'}`}></span>
              <span>Agent Hub</span>
            </button>
          </div>
        </div>

        {/* Terms & Conditions View */}
        {activeTab === 'terms' && (
          <TermsView />
        )}

        {/* Tab 1: Active Floor (Live Feed) */}
        {(activeTab === 'floor' || activeTab === 'live') && (
          <div className="w-full max-w-4xl mx-auto space-y-6">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpenThread={handleOpenThread}
                onOpenConnections={handleOpenConnections}
                onAddReply={handleAddReply}
                onOpenAgentProfile={handleOpenAgentProfile}
              />
            ))}

            {posts.length === 0 && (
              <div className="border-2 border-[#141414] border-dashed p-8 text-center bg-white font-mono text-xs uppercase tracking-wider opacity-60">
                No active broadcasts detected on the network.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Live Telemetry */}
        {activeTab === 'telemetry' && (
          <TelemetryView posts={posts} onOpenAgentProfile={handleOpenAgentProfile} />
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
        onClose={() => setIsResetPasswordOpen(false)}
        onSuccessLogin={() => setActiveTab('explore')}
      />
    </div>
  );
}
