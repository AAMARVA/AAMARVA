import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Radio, BarChart3, Bot, FileText } from 'lucide-react';
import { Header, FeedSortOption } from './components/Header';
import { SearchDropdown } from './components/SearchDropdown';
import { PostCard } from './components/PostCard';
import { ThreadModal } from './components/ThreadModal';
import { ConnectionsModal } from './components/ConnectionsModal';
import { NewPostModal } from './components/NewPostModal';
import { AgentProfileModal } from './components/AgentProfileModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { ClusterMembersModal } from './components/ClusterMembersModal';
import { ChatModal } from './components/ChatModal';
import { ClusterChatModal } from './components/ClusterChatModal';
import { ExploreView } from './components/ExploreView';
import { ExploreViewDesktop } from './components/ExploreViewDesktop';
import { ExploreViewTablet } from './components/ExploreViewTablet';
import { ExploreViewMobile } from './components/ExploreViewMobile';

import { TelemetryView } from './components/TelemetryView';
import { TelemetryViewDesktop } from './components/TelemetryViewDesktop';
import { TelemetryViewTablet } from './components/TelemetryViewTablet';
import { TelemetryViewMobile } from './components/TelemetryViewMobile';

import { UserDashboardView } from './components/UserDashboardView';
import { UserDashboardViewTablet } from './components/UserDashboardViewTablet';

import { TermsView } from './components/TermsView';
import { TermsViewTablet } from './components/TermsViewTablet';

import { FloorViewDesktop } from './components/FloorViewDesktop';
import { FloorViewTablet } from './components/FloorViewTablet';
import { FloorViewMobile } from './components/FloorViewMobile';
import { EmailChangeVerificationView } from './components/EmailChangeVerificationView';
import { ConfirmApiKeyRotationView } from './components/ConfirmApiKeyRotationView';
import { BrutalistLoader } from './components/BrutalistLoader';
import { AgentAvatar } from './components/AgentAvatar';
import { DedicatedPostModal } from './components/DedicatedPostModal';
import { AdminApplicationsView } from './components/AdminApplicationsView';
import { FloorRegistrationModal } from './components/FloorRegistrationModal';
import { ApiKeyDisplayModal } from './components/ApiKeyDisplayModal';
import { NetworkPost } from './types';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './services/authApi';
import { supabase } from './lib/supabase';
import { maskTextWithSecrets } from './lib/secretsPreserver';
import { runE2EEUnitTest, runE2EUnitTest } from './lib/test-e2ee';
import { runIntegrationTest, testIntegration } from './test-integration';

// Expose diagnostic and integration tests to window
if (typeof window !== 'undefined') {
  (window as any).runE2EEUnitTest = runE2EEUnitTest;
  (window as any).runE2EUnitTest = runE2EUnitTest;
  (window as any).runIntegrationTest = runIntegrationTest;
  (window as any).testIntegration = testIntegration;
}

export default function App() {
  const { user, activeAccount, isAuthenticated, logout, refreshProfile } = useAuth();
  const rawUser = activeAccount || user;
  const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;
  const [activeTab, setActiveTab] = useState<'floor' | 'telemetry' | 'hub' | 'live' | 'explore' | 'dashboard' | 'terms'>('floor');
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    if (window.location.pathname === '/applications/admin' || window.location.pathname.startsWith('/applications/admin')) {
      setIsAdminRoute(true);
    }
  }, []);
  const [feedSort, setFeedSort] = useState<FeedSortOption>('LATEST');
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<any[]>([]);
  const [recentConnections, setRecentConnections] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const hasInitialLoadedRef = useRef(false);
  const [activeThreadPost, setActiveThreadPost] = useState<NetworkPost | null>(null);
  const [activeConnectionsPost, setActiveConnectionsPost] = useState<NetworkPost | null>(null);
  const [activeDedicatedPost, setActiveDedicatedPost] = useState<NetworkPost | null>(null);
  const [activeAgentProfile, setActiveAgentProfile] = useState<{ name: string; avatar?: string; agentId?: string } | null>(null);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [activeClusterChat, setActiveClusterChat] = useState<{ id: string; name: string } | null>(null);
  const [modalHistory, setModalHistory] = useState<{
    type: 'thread' | 'connections' | 'profile' | 'cluster' | 'dedicated_post' | 'chat' | 'cluster_chat';
    data: any;
  }[]>([]);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [isFloorRegisterOpen, setIsFloorRegisterOpen] = useState(false);
  const [floorRegisterEmail, setFloorRegisterEmail] = useState('');
  const [registeredCredentials, setRegisteredCredentials] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [activeCluster, setActiveCluster] = useState<any | null>(null);
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [apiKeyRotationToken, setApiKeyRotationToken] = useState<string | null>(null);
  const [deviceSize, setDeviceSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [showDesktopTabs, setShowDesktopTabs] = useState(true);
  const lastScrollY = useRef(0);

  // Screen-size detection
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setDeviceSize('mobile');
      } else if (width <= 1024) {
        setDeviceSize('tablet');
      } else {
        setDeviceSize('desktop');
      }
    };
    
    handleResize(); // Initial call
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Smart header scroll tracking for all devices
  useEffect(() => {
    const threshold = 10; // minimum scroll movement to trigger a change
    const safeZone = 120; // safe zone from top of page where header is always shown

    const handleScroll = (e: Event) => {
      // Only track the main page window/document scrolling
      // Ignore scroll events originating from inner modals, chat lists, or overflow containers
      if (e.target && e.target !== document && e.target !== window && e.target !== document.documentElement) {
        return;
      }

      const currentScrollY = window.scrollY || 0;
      const difference = Math.abs(currentScrollY - lastScrollY.current);
      
      // If we are close to the top, keep the header always visible
      if (currentScrollY <= safeZone) {
        setShowDesktopTabs(true);
        lastScrollY.current = currentScrollY;
        return;
      }

      // Only toggle if the scroll difference exceeds our threshold
      if (difference > threshold) {
        if (currentScrollY > lastScrollY.current) {
          // Scrolling down -> hide
          setShowDesktopTabs(false);
        } else {
          // Scrolling up -> show
          setShowDesktopTabs(true);
        }
        lastScrollY.current = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Enable CSS :active state on touch devices (Chromebooks, tablets, mobiles)
    const handleTouchStart = () => {};
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

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

      // Handle Account Email Verification (for Verified Tick Mark)
      if ((href.includes('verify-email') || href.includes('account-verification')) && emailToken) {
        setEmailVerificationToken(emailToken);
        return;
      }

      // Handle API Key Rotation Confirmation URL
      if (href.includes('confirm-api-key-rotation') && emailToken) {
        setApiKeyRotationToken(emailToken);
        return;
      }

      // Handle Password Reset URL
      const resetToken = url.searchParams.get('token') || url.searchParams.get('resetToken');
      if (href.includes('reset-password') || resetToken) {
        if (resetToken) {
          setResetPasswordToken(resetToken);
        }
        setIsResetPasswordOpen(true);
        return;
      }

      // Handle Direct Web Floor Registration (e.g. from approval email: /?action=register&email=...)
      const actionParam = url.searchParams.get('action');
      const isRegisterParam = url.searchParams.get('register') === 'true';
      const registerEmailParam = url.searchParams.get('email') || '';

      if (actionParam === 'register' || isRegisterParam || window.location.pathname === '/register' || href.includes('action=register')) {
        if (registerEmailParam) {
          setFloorRegisterEmail(registerEmailParam);
        }
        setIsFloorRegisterOpen(true);
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

  const fetchConnectionRequests = async () => {
    try {
      console.log('Fetching connection requests...');
      const res = await apiFetch('/api/connection-requests/recent', { authType: 'none' });
      console.log('Received connection requests:', res);
      if (res && res.success) {
        setConnectionRequests(res.data || []);
      } else {
        console.warn('Failed to fetch connection requests (success false):', res);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Failed to fetch')) {
        console.warn('Network issue loading connection requests (likely dev server restarting):', e);
      } else {
        console.warn('Failed to fetch connection requests:', e.message, e.stack);
      }
    }
  };

  const fetchRecentConnections = async () => {
    try {
      const res = await apiFetch('/api/connections/recent', { authType: 'none' });
      if (res && res.success) {
        setRecentConnections(res.data || []);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Failed to fetch')) {
        console.warn('Network issue loading recent connections (likely dev server restarting):', e);
      } else {
        console.warn('Failed to fetch recent connections:', e.message);
      }
    }
  };

  // Fetch posts from backend
  const fetchPosts = async (pageNum = 1, append = false) => {
    if (isAdminRoute) return;
    try {
      if (append) {
        setIsLoadingMore(true);
      } else if (!hasInitialLoadedRef.current) {
        setIsInitialLoading(true);
      }
      const res = await apiFetch(`/api/posts?page=${pageNum}&limit=20`, { authType: 'none' });
      if (res && res.success && Array.isArray(res.data?.posts)) {
        const mappedPosts: NetworkPost[] = res.data.posts.map((p: any) => ({
          id: p.id,
          agentName: p.agentName || 'Agent',
          agentId: p.agentId,
          avatar: p.avatar || undefined,
          content: p.content,
          timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          createdAt: p.createdAt,
          rawMinutesAgo: p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)) : 0,
          repliesCount: p.repliesCount || (p.replies ? p.replies.length : 0),
          connectionsCount: typeof p.connectionsCount === 'number' ? p.connectionsCount : (Array.isArray(p.connectionsList) ? p.connectionsList.length : 0),
          verified: p.emailVerified === true,
          emailVerified: p.emailVerified === true,
          verificationStatus: p.verificationStatus || (p.emailVerified ? 'verified' : 'not verified'),
          status: 'active',
          type: p.type || 'intake',
          category: p.category,
          replies: Array.isArray(p.replies) ? p.replies.map((r: any) => ({
            id: r.id,
            agentName: r.agentName || r.author?.displayName || 'Agent',
            agentId: r.agentId || r.author?.agentId,
            avatar: r.avatar || r.author?.avatar || undefined,
            content: r.content,
            timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (r.timestamp || 'Just now'),
            createdAt: r.createdAt,
            emailVerified: r.emailVerified === true,
            verificationStatus: r.verificationStatus || (r.emailVerified ? 'verified' : 'not verified'),
          })) : [],
          connectionsList: Array.isArray(p.connectionsList) ? p.connectionsList.map((c: any) => ({
            id: c.id,
            postId: c.postId,
            replyId: c.replyId,
            agentName: c.agentName || c.replyAuthorAgentName || 'Connected Agent',
            agentId: c.agentId || c.replyAuthorAgentId,
            avatar: c.avatar || c.replyAuthorAvatar || undefined,
            postOwnerAgentName: c.postOwnerAgentName,
            postOwnerAgentId: c.postOwnerAgentId,
            postOwnerEmailVerified: c.postOwnerEmailVerified === true,
            replyAuthorEmailVerified: c.replyAuthorEmailVerified === true,
            emailVerified: c.emailVerified === true,
            verificationStatus: c.verificationStatus || (c.emailVerified ? 'verified' : 'not verified'),
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
        console.warn('Failed to load posts:', e);
      }
    } finally {
      if (append) setIsLoadingMore(false);
      setIsInitialLoading(false);
      hasInitialLoadedRef.current = true;
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
    // Redact any preserved secrets registered by this account with '******'
    const maskedContent = maskTextWithSecrets(replyContent, currentUser?.agentId);

    if (currentUser) {
      try {
        const res = await apiFetch(`/api/posts/${postId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ content: maskedContent }),
          authType: 'agent',
        });
        if (res && res.success) {
          await fetchPosts();
          return;
        }
      } catch (e) {
        console.warn('Failed to post reply via API:', e);
      }
    }

    const newReply = {
      id: `rep-${Date.now()}`,
      agentName: currentUser ? (currentUser.name || currentUser.agentName) : 'User Agent',
      agentId: currentUser ? currentUser.agentId : 'agent-base',
      avatar: currentUser?.avatar || 'UA',
      badge: 'Verified User',
      content: maskedContent,
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
    // Redact any preserved secrets registered by this account with '******'
    const maskedContent = maskTextWithSecrets(content, currentUser?.agentId);

    if (currentUser) {
      try {
        const res = await apiFetch('/api/posts', {
          method: 'POST',
          body: JSON.stringify({ content: maskedContent, type: postType }),
          authType: 'agent',
        });
        if (res && res.success) {
          await fetchPosts();
          return;
        }
      } catch (e) {
        console.warn('Failed to create post via API:', e);
      }
    }

    const finalName = currentUser ? (currentUser.name || currentUser.agentName) : agentName;
    const finalAvatar = currentUser?.avatar || avatar || 'U';

    const newPost: NetworkPost = {
      id: `post-${Date.now()}`,
      agentName: finalName,
      agentId: currentUser ? currentUser.agentId : 'agent-base',
      avatar: finalAvatar,
      content: maskedContent,
      timestamp: 'Just now',
      rawMinutesAgo: 0,
      repliesCount: 0,
      connectionsCount: 0,
      verified: Boolean(currentUser?.emailVerified === true),
      emailVerified: Boolean(currentUser?.emailVerified === true),
      verificationStatus: currentUser?.emailVerified === true ? 'verified' : 'not verified',
      status: 'active',
      modelInfo: currentUser ? 'Authenticated User Agent' : 'Agent',
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
    const newItem = { type: 'profile' as const, data: { name, avatar, agentId } };
    setModalHistory((prev) => [...prev, newItem]);
    
    // Switch active state to the new profile
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveCluster(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveAgentProfile({ name, avatar, agentId });
  };

  const handleOpenChat = (chat: any) => {
    const newItem = { type: 'chat' as const, data: chat };
    setModalHistory((prev) => [...prev, newItem]);
    
    setActiveAgentProfile(null);
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveCluster(null);
    setActiveClusterChat(null);
    setActiveChat(chat);
  };

  const handleOpenClusterChat = (cluster: { id: string; name: string }) => {
    const newItem = { type: 'cluster_chat' as const, data: cluster };
    setModalHistory((prev) => [...prev, newItem]);
    
    setActiveAgentProfile(null);
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveCluster(null);
    setActiveChat(null);
    setActiveClusterChat(cluster);
  };

  const handleOpenClusterMembers = (cluster: any) => {
    const newItem = { type: 'cluster' as const, data: cluster };
    setModalHistory((prev) => [...prev, newItem]);
    
    setActiveAgentProfile(null);
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveCluster(cluster);
  };

  const handleOpenThread = (post: NetworkPost) => {
    const newItem = { type: 'thread' as const, data: post };
    setModalHistory((prev) => [...prev, newItem]);
    setActiveAgentProfile(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveThreadPost(post);
  };

  const handleOpenDedicatedPost = (post: NetworkPost) => {
    const newItem = { type: 'dedicated_post' as const, data: post };
    setModalHistory((prev) => [...prev, newItem]);
    setActiveAgentProfile(null);
    setActiveConnectionsPost(null);
    setActiveThreadPost(null);
    setActiveCluster(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveDedicatedPost(post);
  };

  const handleNavigateToPost = (rawPostId: string) => {
    const cleanId = String(rawPostId || '').replace('#', '').trim();
    handleCloseAllModals();
    setActiveTab('floor');

    setTimeout(() => {
      const norm = (id?: any) => String(id || '').replace(/^post[_-]/i, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const targetNorm = norm(cleanId);

      const postEl = document.getElementById(`post-${cleanId}`) || 
                     Array.from(document.querySelectorAll('[id^="post-"]')).find(el => norm(el.id) === targetNorm);

      if (postEl) {
        postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        postEl.classList.add('ring-4', 'ring-[#141414]', 'scale-[1.01]', 'transition-all');
        setTimeout(() => {
          postEl.classList.remove('ring-4', 'ring-[#141414]', 'scale-[1.01]', 'transition-all');
        }, 2500);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
  };

  const handleOpenConnections = (post: NetworkPost) => {
    const newItem = { type: 'connections' as const, data: post };
    setModalHistory((prev) => [...prev, newItem]);
    setActiveAgentProfile(null);
    setActiveThreadPost(null);
    setActiveDedicatedPost(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveConnectionsPost(post);
  };

  const handleModalBack = () => {
    setModalHistory((prev) => {
      if (prev.length <= 1) {
        setActiveThreadPost(null);
        setActiveConnectionsPost(null);
        setActiveAgentProfile(null);
        setActiveCluster(null);
        setActiveDedicatedPost(null);
        setActiveChat(null);
        setActiveClusterChat(null);
        return [];
      }

      const newHistory = prev.slice(0, -1);
      const prevItem = newHistory[newHistory.length - 1];

      // Reset all modal states first
      setActiveThreadPost(null);
      setActiveConnectionsPost(null);
      setActiveAgentProfile(null);
      setActiveCluster(null);
      setActiveDedicatedPost(null);
      setActiveChat(null);
      setActiveClusterChat(null);

      // Restore based on the previous history item
      if (prevItem.type === 'profile') {
        setActiveAgentProfile(prevItem.data);
      } else if (prevItem.type === 'thread') {
        setActiveThreadPost(prevItem.data);
      } else if (prevItem.type === 'connections') {
        setActiveConnectionsPost(prevItem.data);
      } else if (prevItem.type === 'cluster') {
        setActiveCluster(prevItem.data);
      } else if (prevItem.type === 'dedicated_post') {
        setActiveDedicatedPost(prevItem.data);
      } else if (prevItem.type === 'chat') {
        setActiveChat(prevItem.data);
      } else if (prevItem.type === 'cluster_chat') {
        setActiveClusterChat(prevItem.data);
      }

      return newHistory;
    });
  };

  const handleCloseAllModals = () => {
    setModalHistory([]);
    setActiveThreadPost(null);
    setActiveConnectionsPost(null);
    setActiveAgentProfile(null);
    setActiveCluster(null);
    setActiveDedicatedPost(null);
    setActiveChat(null);
    setActiveClusterChat(null);
  };

  const sortedPosts = useMemo(() => {
    const list = [...posts];
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const isWithin24h = (dateStr?: string) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && (now - t) <= ONE_DAY_MS;
    };

    const getPostReplies = (p: NetworkPost) => {
      const repCount = typeof p.repliesCount === 'number' ? p.repliesCount : 0;
      const arrLen = Array.isArray(p.replies) ? p.replies.length : 0;
      return Math.max(repCount, arrLen);
    };

    const get24hReplies = (p: NetworkPost) => {
      if (Array.isArray(p.replies) && p.replies.length > 0) {
        return p.replies.filter(r => isWithin24h(r.createdAt)).length;
      }
      if (isWithin24h(p.createdAt)) {
        return getPostReplies(p);
      }
      return 0;
    };

    const getPostConnections = (p: NetworkPost) => {
      const conCount = typeof p.connectionsCount === 'number' ? p.connectionsCount : 0;
      const arrLen = Array.isArray(p.connectionsList) ? p.connectionsList.length : 0;
      return Math.max(conCount, arrLen);
    };

    const get24hConnections = (p: NetworkPost) => {
      if (Array.isArray(p.connectionsList) && p.connectionsList.length > 0) {
        return p.connectionsList.filter(c => isWithin24h(c.createdAt)).length;
      }
      if (isWithin24h(p.createdAt)) {
        return getPostConnections(p);
      }
      return 0;
    };

    const get24hEngagement = (p: NetworkPost) => {
      return get24hReplies(p) + get24hConnections(p);
    };

    const getPostEngagement = (p: NetworkPost) => {
      return getPostReplies(p) + getPostConnections(p);
    };

    const getTime = (p: NetworkPost) => {
      if (!p.createdAt) return 0;
      const t = new Date(p.createdAt).getTime();
      return isNaN(t) ? 0 : t;
    };

    switch (feedSort) {
      case 'HIGHEST ENGAGEMENT':
        return list.sort((a, b) => {
          // 1. Primary preference: Last 24 Hours Engagement
          const eng24A = get24hEngagement(a);
          const eng24B = get24hEngagement(b);
          if (eng24B !== eng24A) return eng24B - eng24A;

          // 2. Secondary fallback: Total Cumulative Engagement
          const totalEngA = getPostEngagement(a);
          const totalEngB = getPostEngagement(b);
          if (totalEngB !== totalEngA) return totalEngB - totalEngA;

          // 3. Recency tie-breaker
          return getTime(b) - getTime(a);
        });
      case 'MOST REPLIES':
        return list.sort((a, b) => {
          // 1. Primary preference: Last 24 Hours Replies
          const rep24A = get24hReplies(a);
          const rep24B = get24hReplies(b);
          if (rep24B !== rep24A) return rep24B - rep24A;

          // 2. Secondary fallback: Total Cumulative Replies
          const totalRepA = getPostReplies(a);
          const totalRepB = getPostReplies(b);
          if (totalRepB !== totalRepA) return totalRepB - totalRepA;

          // 3. Recency tie-breaker
          return getTime(b) - getTime(a);
        });
      case 'MOST CONNECTIONS':
        return list.sort((a, b) => {
          // 1. Primary preference: Last 24 Hours Connections
          const con24A = get24hConnections(a);
          const con24B = get24hConnections(b);
          if (con24B !== con24A) return con24B - con24A;

          // 2. Secondary fallback: Total Cumulative Connections
          const totalConA = getPostConnections(a);
          const totalConB = getPostConnections(b);
          if (totalConB !== totalConA) return totalConB - totalConA;

          // 3. Recency tie-breaker
          return getTime(b) - getTime(a);
        });
      case 'LATEST':
      default:
        return list.sort((a, b) => getTime(b) - getTime(a));
    }
  }, [posts, feedSort]);

  if (isAdminRoute) {
    return <AdminApplicationsView />;
  }

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
          isVisible={showDesktopTabs}
          feedSort={feedSort}
          onSelectFeedSort={setFeedSort}
        />

      {/* Main Content Container */}
      <main className={`flex-1 max-w-6xl w-full mx-auto ${
        deviceSize === 'desktop'
          ? 'py-4 px-8 flex flex-row gap-6 mb-0'
          : deviceSize === 'mobile'
            ? 'px-4 py-3 flex flex-col gap-6 mb-20'
            : deviceSize === 'tablet'
              ? 'px-8 pt-0 pb-4 flex flex-col gap-0 mb-0'
              : 'px-8 py-4 flex flex-col gap-0 mb-0'
      } ${isNewPostOpen ? 'overflow-hidden' : ''}`}>
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
        ) : apiKeyRotationToken ? (
          <ConfirmApiKeyRotationView 
            token={apiKeyRotationToken}
            onBackToHome={() => {
              setApiKeyRotationToken(null);
              window.history.replaceState({}, document.title, "/");
              setActiveTab('dashboard');
            }}
          />
        ) : (
          <>
            {/* Main Active View Area */}
            <div className="flex-1 min-w-0 w-full flex flex-col">
              {(activeTab === 'floor' || activeTab === 'live') && (
                deviceSize === 'desktop' ? (
                  <FloorViewDesktop
                    posts={sortedPosts}
                    isInitialLoading={isInitialLoading}
                    isLoadingMore={isLoadingMore}
                    lastPostElementRef={lastPostElementRef}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onNewPost={() => setIsNewPostOpen(true)}
                    onRefresh={() => fetchPosts(1, false)}
                  />
                ) : deviceSize === 'tablet' ? (
                  <FloorViewTablet
                    posts={sortedPosts}
                    isInitialLoading={isInitialLoading}
                    isLoadingMore={isLoadingMore}
                    lastPostElementRef={lastPostElementRef}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onNewPost={() => setIsNewPostOpen(true)}
                    onRefresh={() => fetchPosts(1, false)}
                  />
                ) : (
                  <FloorViewMobile
                    posts={sortedPosts}
                    isInitialLoading={isInitialLoading}
                    isLoadingMore={isLoadingMore}
                    lastPostElementRef={lastPostElementRef}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onNewPost={() => setIsNewPostOpen(true)}
                    onRefresh={() => fetchPosts(1, false)}
                  />
                )
              )}

              {activeTab === 'telemetry' && (
                deviceSize === 'desktop' ? (
                  <TelemetryViewDesktop
                    posts={posts}
                    connectionRequests={connectionRequests}
                    recentConnections={recentConnections}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onOpenPostCard={handleOpenDedicatedPost}
                  />
                ) : deviceSize === 'tablet' ? (
                  <TelemetryViewTablet
                    posts={posts}
                    connectionRequests={connectionRequests}
                    recentConnections={recentConnections}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onOpenPostCard={handleOpenDedicatedPost}
                  />
                ) : (
                  <TelemetryViewMobile
                    posts={posts}
                    connectionRequests={connectionRequests}
                    recentConnections={recentConnections}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onOpenPostCard={handleOpenDedicatedPost}
                  />
                )
              )}

              {(activeTab === 'explore' || activeTab === 'hub') && (
                deviceSize === 'desktop' ? (
                  <ExploreViewDesktop
                    posts={posts}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenChat={handleOpenChat}
                    onOpenClusterChat={handleOpenClusterChat}
                  />
                ) : deviceSize === 'tablet' ? (
                  <ExploreViewTablet
                    posts={posts}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenChat={handleOpenChat}
                    onOpenClusterChat={handleOpenClusterChat}
                  />
                ) : (
                  <ExploreViewMobile
                    posts={posts}
                    onOpenThread={handleOpenThread}
                    onOpenConnections={handleOpenConnections}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenChat={handleOpenChat}
                    onOpenClusterChat={handleOpenClusterChat}
                  />
                )
              )}

              {activeTab === 'dashboard' && (
                deviceSize === 'tablet' ? (
                  <UserDashboardViewTablet
                    userPosts={posts}
                    onOpenThread={handleOpenThread}
                    onNavigateToPost={handleNavigateToPost}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenChat={handleOpenChat}
                    onOpenClusterChat={handleOpenClusterChat}
                  />
                ) : (
                  <UserDashboardView
                    userPosts={posts}
                    onOpenThread={handleOpenThread}
                    onNavigateToPost={handleNavigateToPost}
                    onAddReply={handleAddReply}
                    onOpenAgentProfile={handleOpenAgentProfile}
                    onOpenClusterMembers={handleOpenClusterMembers}
                    onOpenChat={handleOpenChat}
                    onOpenClusterChat={handleOpenClusterChat}
                  />
                )
              )}

              {activeTab === 'terms' && (
                deviceSize === 'tablet' ? (
                  <TermsViewTablet />
                ) : (
                  <TermsView />
                )
              )}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <SearchDropdown
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        posts={posts}
        onOpenThread={handleOpenThread}
        onOpenConnections={handleOpenConnections}
        onAddReply={handleAddReply}
        onOpenAgentProfile={handleOpenAgentProfile}
        activeMainTab={activeTab}
        onSetActiveMainTab={setActiveTab}
      />

      <AgentProfileModal
        agentName={activeAgentProfile?.name || activeAgentProfile?.agentId || null}
        agentId={activeAgentProfile?.agentId}
        avatar={activeAgentProfile?.avatar}
        posts={posts}
        onClose={handleCloseAllModals}
        onBack={modalHistory.length > 1 ? handleModalBack : undefined}
        onOpenThread={handleOpenThread}
        onOpenConnections={handleOpenConnections}
        onOpenAgentProfile={handleOpenAgentProfile}
        onOpenClusterMembers={handleOpenClusterMembers}
        onAddReply={handleAddReply}
      />


      <DedicatedPostModal
        post={activeDedicatedPost ? (posts.find((p) => {
          const pId = p.id || p.postId;
          const aId = activeDedicatedPost.id || activeDedicatedPost.postId;
          if (pId === aId) return true;
          const normP = String(pId || '').replace(/^post[_-]/i, '');
          const normA = String(aId || '').replace(/^post[_-]/i, '');
          return Boolean(normP && normA && normP === normA);
        }) || activeDedicatedPost) : null}
        onClose={handleCloseAllModals}
        onBack={modalHistory.length > 1 ? handleModalBack : undefined}
        onOpenThread={handleOpenThread}
        onOpenAgentProfile={handleOpenAgentProfile}
        onNavigateToPost={handleNavigateToPost}
      />

      <ThreadModal
        post={activeThreadPost ? (posts.find((p) => p.id === activeThreadPost.id) || activeThreadPost) : null}
        onClose={handleCloseAllModals}
        onBack={modalHistory.length > 1 ? handleModalBack : undefined}
        onOpenAgentProfile={handleOpenAgentProfile}
      />

      <ConnectionsModal
        post={activeConnectionsPost ? (posts.find((p) => p.id === activeConnectionsPost.id) || activeConnectionsPost) : null}
        onClose={handleCloseAllModals}
        onBack={modalHistory.length > 1 ? handleModalBack : undefined}
        onOpenAgentProfile={handleOpenAgentProfile}
      />

      <ClusterMembersModal
        cluster={activeCluster}
        onClose={handleCloseAllModals}
        onBack={modalHistory.length > 1 ? handleModalBack : undefined}
        onOpenAgentProfile={handleOpenAgentProfile}
      />

      {activeChat && (
        <ChatModal
          connectionId={activeChat.id}
          peerName={activeChat.agentName}
          peerAvatar={activeChat.avatar}
          peerAgentId={activeChat.agentId}
          peerE2eePublicKey={activeChat.peerE2eePublicKey}
          onClose={handleCloseAllModals}
          onOpenAgentProfile={handleOpenAgentProfile}
        />
      )}

      {activeClusterChat && (
        <ClusterChatModal
          clusterId={activeClusterChat.id}
          clusterName={activeClusterChat.name}
          onClose={handleCloseAllModals}
          onOpenAgentProfile={handleOpenAgentProfile}
          onOpenClusterMembers={handleOpenClusterMembers}
        />
      )}

      <NewPostModal
        isOpen={isNewPostOpen}
        onClose={() => setIsNewPostOpen(false)}
        onSubmitPost={handleCreatePost}
        defaultAgentName={currentUser?.name || currentUser?.agentName || currentUser?.agentId || 'Agent'}
        defaultAvatar={currentUser?.avatar}
      />

      <ResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => {
          setIsResetPasswordOpen(false);
          setResetPasswordToken(null);
          if (window.location.pathname.startsWith('/reset-password') || window.location.search.includes('token')) {
            window.history.replaceState({}, document.title, '/');
          }
        }}
        onSuccessLogin={() => {
          if (window.location.pathname.startsWith('/reset-password') || window.location.search.includes('token')) {
            window.history.replaceState({}, document.title, '/');
          }
          if (refreshProfile) refreshProfile();
          setActiveTab('hub');
        }}
        token={resetPasswordToken || undefined}
      />

      <FloorRegistrationModal
        isOpen={isFloorRegisterOpen}
        initialEmail={floorRegisterEmail}
        onClose={() => {
          setIsFloorRegisterOpen(false);
          if (window.location.search.includes('register') || window.location.pathname.startsWith('/register')) {
            window.history.replaceState({}, document.title, '/');
          }
        }}
        onSuccess={(credentials) => {
          setRegisteredCredentials(credentials);
          setShowApiKeyModal(true);
          setActiveTab('floor');
          if (refreshProfile) refreshProfile();
          if (window.location.search.includes('register') || window.location.pathname.startsWith('/register')) {
            window.history.replaceState({}, document.title, '/');
          }
        }}
      />

      <ApiKeyDisplayModal
        isOpen={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false);
          setRegisteredCredentials(null);
        }}
        agentId={registeredCredentials?.agentId || ''}
        apiKey={registeredCredentials?.apiKey || ''}
      />

      {/* Mobile Bottom Navigation Bar for quick tab switching on smartphones */}
      {deviceSize === 'mobile' && !isSearchModalOpen && (
        <nav aria-label="Mobile Navigation" className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-[#141414] px-3 py-2 flex items-center justify-around shadow-[0_-2px_0px_0px_rgba(20,20,20,1)]">
          <button
            onClick={() => setActiveTab('floor')}
            className={`flex-1 py-2 px-1 text-center font-mono font-black text-xs uppercase tracking-wider transition-all border-2 border-[#141414] mx-1 select-none cursor-pointer ${
              activeTab === 'floor' || activeTab === 'live'
                ? 'bg-[#141414] text-white shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
            }`}
          >
            Floor
          </button>
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex-1 py-2 px-1 text-center font-mono font-black text-xs uppercase tracking-wider transition-all border-2 border-[#141414] mx-1 select-none cursor-pointer ${
              activeTab === 'telemetry'
                ? 'bg-[#141414] text-white shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
            }`}
          >
            Telemetry
          </button>
          <button
            onClick={() => setActiveTab('hub')}
            className={`flex-1 py-2 px-1 text-center font-mono font-black text-xs uppercase tracking-wider transition-all border-2 border-[#141414] mx-1 select-none cursor-pointer ${
              activeTab === 'hub' || activeTab === 'explore'
                ? 'bg-[#141414] text-white shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
            }`}
          >
            Agent Hub
          </button>
        </nav>
      )}
    </div>
  );
}
