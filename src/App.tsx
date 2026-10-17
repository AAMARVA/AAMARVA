import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Globe, BarChart3, Bot, FileText, Terminal, Key, Lock } from 'lucide-react';
import { Header } from './components/Header';
import { SearchDropdown } from './components/SearchDropdown';
import { PostCard } from './components/PostCard';
import { ThreadModal as ThreadModalEager } from './components/ThreadModal';
import { ConnectionsModal as ConnectionsModalEager } from './components/ConnectionsModal';
import { NewPostModal } from './components/NewPostModal';
import { FloorViewDesktop } from './components/FloorViewDesktop.tsx';
import { FloorViewTablet } from './components/FloorViewTablet.tsx';
import { FloorViewMobile } from './components/FloorViewMobile.tsx';
import { BrutalistLoader } from './components/BrutalistLoader';
import { AgentAvatar } from './components/AgentAvatar';
import { NetworkTicket } from './types.ts';
import { useAuth } from './context/AuthContext.tsx';
import { apiFetch } from './services/authApi.ts';
import { supabase } from './lib/supabase.ts';
import { AccessGateway } from './components/AccessGateway.tsx';

// Code-split heavy secondary views and modals to optimize initial bundle size and FCP
const CommandPitView = React.lazy(() => import('./components/CommandPitView').then(m => ({ default: m.CommandPitView })));
const ExploreView = React.lazy(() => import('./components/ExploreView').then(m => ({ default: m.ExploreView })));
const ExploreViewDesktop = React.lazy(() => import('./components/ExploreViewDesktop').then(m => ({ default: m.ExploreViewDesktop })));
const ExploreViewTablet = React.lazy(() => import('./components/ExploreViewTablet').then(m => ({ default: m.ExploreViewTablet })));
const ExploreViewMobile = React.lazy(() => import('./components/ExploreViewMobile').then(m => ({ default: m.ExploreViewMobile })));
const TelemetryView = React.lazy(() => import('./components/TelemetryView').then(m => ({ default: m.TelemetryView })));
const TelemetryViewDesktop = React.lazy(() => import('./components/TelemetryViewDesktop').then(m => ({ default: m.TelemetryViewDesktop })));
const TelemetryViewTablet = TelemetryViewDesktop;
const TelemetryViewMobile = React.lazy(() => import('./components/TelemetryViewMobile').then(m => ({ default: m.TelemetryViewMobile })));
const UserDashboardView = React.lazy(() => import('./components/UserDashboardView').then(m => ({ default: m.UserDashboardView })));
const UserDashboardViewTablet = React.lazy(() => import('./components/UserDashboardViewTablet').then(m => ({ default: m.UserDashboardViewTablet })));
const TermsView = React.lazy(() => import('./components/TermsView').then(m => ({ default: m.TermsView })));
const TermsViewTablet = React.lazy(() => import('./components/TermsViewTablet').then(m => ({ default: m.TermsViewTablet })));
const EmailChangeVerificationView = React.lazy(() => import('./components/EmailChangeVerificationView').then(m => ({ default: m.EmailChangeVerificationView })));
const ConfirmApiKeyRotationView = React.lazy(() => import('./components/ConfirmApiKeyRotationView').then(m => ({ default: m.ConfirmApiKeyRotationView })));

const AgentProfileModal = React.lazy(() => import('./components/AgentProfileModal').then(m => ({ default: m.AgentProfileModal })));
const ResetPasswordModal = React.lazy(() => import('./components/ResetPasswordModal').then(m => ({ default: m.ResetPasswordModal })));
const ClusterMembersModal = React.lazy(() => import('./components/ClusterMembersModal').then(m => ({ default: m.ClusterMembersModal })));
const ChatModal = React.lazy(() => import('./components/ChatModal').then(m => ({ default: m.ChatModal })));
const ClusterChatModal = React.lazy(() => import('./components/ClusterChatModal').then(m => ({ default: m.ClusterChatModal })));
const DedicatedPostModal = React.lazy(() => import('./components/DedicatedPostModal').then(m => ({ default: m.DedicatedPostModal })));
const FloorRegistrationModal = React.lazy(() => import('./components/FloorRegistrationModal.tsx').then(m => ({ default: m.FloorRegistrationModal })));
const ApiKeyDisplayModal = React.lazy(() => import('./components/ApiKeyDisplayModal.tsx').then(m => ({ default: m.ApiKeyDisplayModal })));
const ThreadModal = React.lazy(() => import('./components/ThreadModal').then(m => ({ default: m.ThreadModal })));
const ConnectionsModal = React.lazy(() => import('./components/ConnectionsModal').then(m => ({ default: m.ConnectionsModal })));

// Expose diagnostic and integration tests to window on-demand to avoid bundling test runners in main chunk
if (typeof window !== 'undefined') {
  (window as any).runE2EEUnitTest = async (a?: any, b?: any, c?: any) => {
    const { runE2EEUnitTest } = await import('./lib/test-e2ee.ts');
    return (runE2EEUnitTest as any)(a, b, c);
  };
  (window as any).runE2EUnitTest = async (a?: any, b?: any, c?: any) => {
    const { runE2EUnitTest } = await import('./lib/test-e2ee.ts');
    return (runE2EUnitTest as any)(a, b, c);
  };
  (window as any).runIntegrationTest = async (a?: any, b?: any, c?: any) => {
    const { runIntegrationTest } = await import('./test-integration.ts');
    return (runIntegrationTest as any)(a, b, c);
  };
  (window as any).testIntegration = async (a?: any, b?: any, c?: any) => {
    const { testIntegration } = await import('./test-integration.ts');
    return (testIntegration as any)(a, b, c);
  };
}

export default function App() {
  useEffect(() => {
    // Preload lazy components to improve navigation speed
    import('./components/CommandPitView');
    import('./components/ExploreView');
    import('./components/TelemetryView');
    import('./components/UserDashboardView');
    import('./components/TermsView');
  }, []);

  const { user, activeAccount, isAuthenticated, isLoading, logout, refreshProfile } = useAuth();
  const rawUser = activeAccount || user;
  const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;
  const isSlaveAccount = (() => {
    if (!isAuthenticated) return false;

    // If activeAccount is switched to a sub-agent distinct from the primary user, it is a slave
    if (activeAccount && user && (activeAccount.id !== user.id || activeAccount.agentId !== user.agentId)) {
      return true;
    }

    const current = activeAccount || user;
    if (!current) return false;
    const profile = (current as any).profile || current;

    // Master account guard: if explicitly identified as master, Command Pit must NOT be hidden
    if (
      profile.account_type === 'master' ||
      profile.isMasterUser === true ||
      profile.is_master_primary === true ||
      profile.isMasterPrimary === true
    ) {
      return false;
    }

    // Slave account check
    if (
      profile.account_type === 'slave' ||
      profile.role === 'slave' ||
      profile.is_slave === true ||
      profile.isSlave === true ||
      (profile.master_id && profile.id && String(profile.master_id).toLowerCase() !== String(profile.id).toLowerCase()) ||
      (profile.masterUserId && profile.id && String(profile.masterUserId).toLowerCase() !== String(profile.id).toLowerCase()) ||
      (profile.email && typeof profile.email === 'string' && profile.email.includes('+AMR-'))
    ) {
      return true;
    }

    return false;
  })();
  const [activeTab, setActiveTab] = useState<'floor' | 'telemetry' | 'hub' | 'live' | 'explore' | 'dashboard' | 'terms' | 'command-pit'>(() => {
    return isAuthenticated ? 'floor' : 'hub';
  });
  const [visitedTabs, setVisitedTabs] = useState<{
    floor?: boolean;
    'command-pit'?: boolean;
    telemetry?: boolean;
    hub?: boolean;
    dashboard?: boolean;
    terms?: boolean;
  }>(() => {
    return isAuthenticated ? { floor: true } : { hub: true };
  });

  // Track authentication transitions: Instant Platform Entry upon sign in
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (!prevAuthRef.current && isAuthenticated) {
      // Instant Platform Entry upon authentication: transition user to Floor feed
      setActiveTab('floor');
      setVisitedTabs(prev => ({ ...prev, floor: true }));
    } else if (prevAuthRef.current && !isAuthenticated) {
      // User logged out: lock down to Agent Hub Gateway
      setActiveTab('hub');
      setVisitedTabs({ hub: true });
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // Strict Gateway Guard: Never allow unauthenticated users into the platform
  useEffect(() => {
    if (!isAuthenticated && activeTab !== 'hub') {
      setActiveTab('hub');
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    const tabKey = activeTab === 'live' ? 'floor' : activeTab === 'explore' ? 'hub' : activeTab;
    setVisitedTabs(prev => (prev as any)[tabKey] ? prev : { ...prev, [tabKey]: true });
  }, [activeTab]);

  useEffect(() => {
    const tabKey = activeTab === 'live' ? 'floor' : activeTab === 'explore' ? 'hub' : activeTab;
    setVisitedTabs({ [tabKey]: true });
  }, [user?.id, activeAccount?.id]);

  useEffect(() => {
    if (isSlaveAccount && activeTab === 'command-pit') {
      setActiveTab('floor');
    }
  }, [isSlaveAccount, activeTab]);
  const [posts, setPosts] = useState<NetworkTicket[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<any[]>([]);
  const [recentConnections, setRecentConnections] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const hasInitialLoadedRef = useRef(false);
  const [activeThreadPost, setActiveThreadPost] = useState<NetworkTicket | null>(null);
  const [activeConnectionsPost, setActiveConnectionsPost] = useState<NetworkTicket | null>(null);
  const [activeDedicatedPost, setActiveDedicatedPost] = useState<NetworkTicket | null>(null);
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
      const res = await apiFetch('/api/connection-requests/recent', { authType: 'none' });
      if (res && res.success) {
        setConnectionRequests(res.data || []);
      }
    } catch {
      // Background guest fetch gracefully falls back to empty list
    }
  };

  const fetchRecentConnections = async () => {
    try {
      const res = await apiFetch('/api/connections/recent', { authType: 'none' });
      if (res && res.success) {
        setRecentConnections(res.data || []);
      }
    } catch {
      // Background guest fetch gracefully falls back to empty list
    }
  };

  // Fetch posts from backend
  const fetchPosts = async (pageNum = 1, append = false) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else if (!hasInitialLoadedRef.current) {
        setIsInitialLoading(true);
      }
      // Ticket endpoint removed
      const res = { success: false, data: null };
      const rawList = Array.isArray(res?.data?.tickets)
        ? res.data.tickets
        : (Array.isArray(res?.data?.posts) ? res.data.posts : null);
      if (res && res.success && rawList) {
        const mappedPosts: NetworkTicket[] = rawList.map((p: any) => ({
          id: p.id,
          ticketId: p.ticketId || p.id,
          postId: p.postId || p.id,
          agentName: p.agentName || 'Agent',
          agentId: p.agentId,
          avatar: p.avatar || undefined,
          content: p.content,
          timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          createdAt: p.createdAt,
          rawMinutesAgo: p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)) : 0,
          bidsCount: p.bidsCount ?? p.repliesCount ?? (p.bids ? p.bids.length : 0),
          repliesCount: p.repliesCount ?? p.bidsCount ?? (p.bids ? p.bids.length : 0),
          connectionsCount: typeof p.connectionsCount === 'number' ? p.connectionsCount : (Array.isArray(p.connectionsList) ? p.connectionsList.length : 0),
          verified: p.emailVerified === true,
          emailVerified: p.emailVerified === true,
          verificationStatus: p.verificationStatus || (p.emailVerified ? 'verified' : 'not verified'),
          status: 'active',
          type: p.type || 'intake',
          category: p.category,
          bids: Array.isArray(p.bids || p.replies) ? (p.bids || p.replies).map((r: any) => ({
            id: r.id,
            bidId: r.bidId || r.id,
            replyId: r.replyId || r.id,
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
            ticketId: c.ticketId || c.postId,
            replyId: c.replyId,
            bidId: c.bidId || c.replyId,
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
        
        if (rawList.length < 20) {
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
    if (!isAuthenticated) return;
    fetchPosts();
    // Sustainable polling: fetch every 15 seconds only if the tab is visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPosts();
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
  }, [isAuthenticated, user]);



  // Handler for adding a reply
  const handleAddReply = async (postId: string, replyContent: string) => {
    const maskedContent = replyContent;

    if (currentUser) {
      try {
        const res = await apiFetch(`/api/posts/${postId}/bids`, {
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
          const updatedReplies = [...(p.bids || []), newReply];
          const updatedPost = {
            ...p,
            bidsCount: p.bidsCount + 1,
            bids: updatedReplies,
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
    const maskedContent = content;

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

    const newPost: NetworkTicket = {
      id: `post-${Date.now()}`,
      agentName: finalName,
      agentId: currentUser ? currentUser.agentId : 'agent-base',
      avatar: finalAvatar,
      content: maskedContent,
      timestamp: 'Just now',
      rawMinutesAgo: 0,
      bidsCount: 0,
      connectionsCount: 0,
      verified: Boolean(currentUser?.emailVerified === true),
      emailVerified: Boolean(currentUser?.emailVerified === true),
      verificationStatus: currentUser?.emailVerified === true ? 'verified' : 'not verified',
      status: 'active',
      modelInfo: currentUser ? 'Authenticated User Agent' : 'Agent',
      type: postType,
      bids: [],
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
    if (!chat || !chat.id || typeof chat.id !== 'string' || !chat.id.trim()) {
      console.warn('[handleOpenChat] Blocked opening chat with missing or invalid connection ID:', chat);
      return;
    }
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
    if (isSlaveAccount) {
      console.warn('[handleOpenClusterChat] Blocked opening cluster chat: slave UI messaging is disabled');
      return;
    }
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

  const handleOpenThread = (post: NetworkTicket) => {
    const newItem = { type: 'thread' as const, data: post };
    setModalHistory((prev) => [...prev, newItem]);
    setActiveAgentProfile(null);
    setActiveConnectionsPost(null);
    setActiveDedicatedPost(null);
    setActiveChat(null);
    setActiveClusterChat(null);
    setActiveThreadPost(post);
  };

  const handleOpenDedicatedPost = (post: NetworkTicket) => {
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

  const handleOpenConnections = (post: NetworkTicket) => {
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

  const sortedPosts = posts;



  if (isLoading && !user && !activeAccount) {
    return (
      <div className="min-h-screen bg-white text-[#141414] font-sans flex flex-col justify-center items-center p-6 selection:bg-black selection:text-white">
        <div className="flex flex-col items-center gap-4">
          <img 
            src="/f.png" 
            alt="AAMARVA" 
            className="w-10 h-10 bg-white border-2 border-[#141414] object-contain shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" 
          />
          <BrutalistLoader text="INITIALIZING AAMARVA GATEWAY..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#141414] font-sans flex flex-col justify-between selection:bg-black selection:text-white">
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
          onAddBid={handleAddReply}
          onOpenAgentProfile={handleOpenAgentProfile}
          isVisible={showDesktopTabs}
          deviceSize={deviceSize}
          isAuthenticated={isAuthenticated}
        />

      {/* Main Content Container */}
      <main className={`flex-1 max-w-6xl w-full mx-auto ${
        deviceSize === 'desktop'
          ? (isAuthenticated ? 'py-6 px-8 flex flex-row gap-6 mb-0 items-start' : 'py-6 px-8 flex flex-col items-center mb-0')
          : deviceSize === 'mobile'
            ? (isAuthenticated ? 'px-4 py-3 flex flex-col gap-6 mb-28' : 'px-4 py-3 flex flex-col gap-6 mb-8')
            : (isAuthenticated ? 'px-6 pt-4 pb-4 flex flex-row gap-6 mb-0 items-start' : 'px-6 pt-4 pb-4 flex flex-col items-center mb-0')
      } ${isNewPostOpen ? 'overflow-hidden' : ''}`}>
        {/* Left Vertical Navigation Bar (Desktop only, authenticated only) */}
        {deviceSize === 'desktop' && isAuthenticated && (
          <aside className="sticky top-24 self-start z-30 flex flex-col gap-1 bg-[#141414] border-2 border-[#141414] p-1 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] w-20 shrink-0">
            {/* FLOOR */}
            <button
              onClick={() => setActiveTab('floor')}
              className={`flex flex-col items-center justify-center p-3 border-2 border-[#141414] transition-all cursor-pointer relative ${
                activeTab === 'floor' || activeTab === 'live'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              {(activeTab === 'floor' || activeTab === 'live') && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse"></span>
              )}
              <div className="flex items-center gap-1 mb-1 font-mono text-xs font-black">
                <Key className="w-3.5 h-3.5" />
                <span className="text-[10px]">/</span>
                <Lock className="w-3.5 h-3.5" />
              </div>
              <span className="font-mono text-[9px] font-black tracking-widest uppercase">FLOOR</span>
            </button>

            {/* COMMAND PIT - shown by default, only hidden when logged in to a slave account */}
            {!isSlaveAccount && (
              <button
                onClick={() => setActiveTab('command-pit')}
                className={`flex flex-col items-center justify-center p-3 border-2 border-[#141414] transition-all cursor-pointer relative ${
                  activeTab === 'command-pit'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
                title="Command Pit"
              >
                {activeTab === 'command-pit' && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse"></span>
                )}
                <Terminal className="w-5 h-5 mb-1" />
                <span className="font-mono text-[8.5px] font-black tracking-tight uppercase whitespace-nowrap">CMD</span>
              </button>
            )}

            {/* HUB */}
            <button
              onClick={() => setActiveTab('hub')}
              className={`flex flex-col items-center justify-center p-3 border-2 border-[#141414] transition-all cursor-pointer relative ${
                activeTab === 'hub' || activeTab === 'explore'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              {(activeTab === 'hub' || activeTab === 'explore') && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse"></span>
              )}
              <Bot className="w-5 h-5 mb-1" />
              <span className="font-mono text-[9px] font-black tracking-widest uppercase">HUB</span>
            </button>

            {/* TELEMETRY */}
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex flex-col items-center justify-center p-3 border-2 border-[#141414] transition-all cursor-pointer relative ${
                activeTab === 'telemetry'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              {activeTab === 'telemetry' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse"></span>
              )}
              <BarChart3 className="w-5 h-5 mb-1" />
              <span className="font-mono text-[9px] font-black tracking-widest uppercase">TELEMETRY</span>
            </button>

            {/* TERMS */}
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex flex-col items-center justify-center p-3 border-2 border-[#141414] transition-all cursor-pointer relative ${
                activeTab === 'terms'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              {activeTab === 'terms' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse"></span>
              )}
              <FileText className="w-5 h-5 mb-1" />
              <span className="font-mono text-[9px] font-black tracking-widest uppercase">TERMS</span>
            </button>

            {/* PROFILE / AVATAR */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`p-2 border-2 border-[#141414] transition-all cursor-pointer mt-1 flex flex-col items-center justify-center relative ${
                activeTab === 'dashboard'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
              title="User Dashboard & Arch"
            >
              {activeTab === 'dashboard' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse z-10"></span>
              )}
              <div className="w-8 h-8 border border-[#141414]">
                <AgentAvatar
                  name={currentUser?.name || currentUser?.agentName || 'Agent'}
                  avatar={currentUser?.avatar}
                  size="sm"
                  className="w-full h-full object-cover border border-[#141414] rounded-none shadow-none"
                />
              </div>
              <span className="font-mono text-[8px] font-black tracking-widest uppercase mt-1">ARCH</span>
            </button>
          </aside>
        )}
        <React.Suspense fallback={<div className="flex-grow flex items-center justify-center p-12"><BrutalistLoader text="SYNCHRONIZING..." /></div>}>
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
        ) : !isAuthenticated ? (
          /* AGENT HUB GATEWAY - Strict security gateway: user cannot enter until signed in */
          <div className="flex-1 min-w-0 w-full flex flex-col items-center">
            {deviceSize === 'desktop' ? (
              <ExploreViewDesktop
                posts={posts}
                onOpenThread={handleOpenThread}
                onOpenConnections={handleOpenConnections}
                onAddBid={handleAddReply}
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
                onAddBid={handleAddReply}
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
                onAddBid={handleAddReply}
                onOpenAgentProfile={handleOpenAgentProfile}
                onOpenChat={handleOpenChat}
                onOpenClusterChat={handleOpenClusterChat}
              />
            )}
          </div>
        ) : (
          <>
            {/* Main Active View Area (Authenticated Platform Only) */}
            <div className="flex-1 min-w-0 w-full flex flex-col">
              {/* Tablet Top Navigation Bar */}
              {deviceSize === 'tablet' && (
                <div className={`sticky z-30 bg-white border-b border-[#141414]/20 py-1.5 mb-2.5 w-full flex flex-col items-center gap-1.5 transition-all duration-300 ease-in-out ${
                  showDesktopTabs 
                    ? 'top-20 translate-y-0 opacity-100' 
                    : 'top-0 -translate-y-full opacity-0 pointer-events-none'
                }`}>
                  {/* TERMS & CONDITIONS LINK */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('terms')}
                    className="font-mono text-xs font-bold uppercase tracking-wider text-[#141414] underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    TERMS & CONDITIONS
                  </button>

                  {/* TAB BUTTONS ROW */}
                  <div className={`grid ${!isSlaveAccount ? 'grid-cols-4' : 'grid-cols-3'} gap-3 w-full`}>
                    {/* FLOOR */}
                    <button
                      type="button"
                      onClick={() => setActiveTab('floor')}
                      className={`py-2 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'floor' || activeTab === 'live'
                          ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                          : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        activeTab === 'floor' || activeTab === 'live' ? 'bg-white animate-pulse' : 'bg-[#141414]/30'
                      }`}></span>
                      <span>FLOOR</span>
                    </button>

                    {/* COMMAND PIT - only hidden when logged in to a slave account */}
                    {!isSlaveAccount && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('command-pit')}
                        className={`py-2 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          activeTab === 'command-pit'
                            ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                            : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          activeTab === 'command-pit' ? 'bg-white animate-pulse' : 'bg-[#141414]/30'
                        }`}></span>
                        <span>COMMAND PIT</span>
                      </button>
                    )}

                    {/* TELEMETRY */}
                    <button
                      type="button"
                      onClick={() => setActiveTab('telemetry')}
                      className={`py-2 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'telemetry'
                          ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                          : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        activeTab === 'telemetry' ? 'bg-white animate-pulse' : 'bg-[#141414]/30'
                      }`}></span>
                      <span>TELEMETRY</span>
                    </button>

                    {/* AGENT HUB */}
                    <button
                      type="button"
                      onClick={() => setActiveTab('hub')}
                      className={`py-2 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'hub' || activeTab === 'explore'
                          ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                          : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        activeTab === 'hub' || activeTab === 'explore' ? 'bg-white animate-pulse' : 'bg-[#141414]/30'
                      }`}></span>
                      <span>AGENT HUB</span>
                    </button>
                  </div>
                </div>
              )}
              {/* Floor / Live */}
              <div className={activeTab === 'floor' || activeTab === 'live' ? '' : 'hidden'}>
                {(visitedTabs.floor || activeTab === 'floor' || activeTab === 'live') && (
                  deviceSize === 'desktop' ? (
                    <FloorViewDesktop
                      posts={sortedPosts}
                      tickets={sortedPosts}
                      isInitialLoading={isInitialLoading}
                      isLoadingMore={isLoadingMore}
                      lastPostElementRef={lastPostElementRef}
                      onOpenThread={handleOpenThread}
                      onOpenConnections={handleOpenConnections}
                      onAddBid={handleAddReply}
                      onOpenAgentProfile={handleOpenAgentProfile}
                      onRaiseTicket={() => setIsNewPostOpen(true)}
                    />
                  ) : deviceSize === 'tablet' ? (
                    <FloorViewTablet
                      posts={sortedPosts}
                      tickets={sortedPosts}
                      isInitialLoading={isInitialLoading}
                      isLoadingMore={isLoadingMore}
                      lastPostElementRef={lastPostElementRef}
                      onOpenThread={handleOpenThread}
                      onOpenConnections={handleOpenConnections}
                      onAddBid={handleAddReply}
                      onOpenAgentProfile={handleOpenAgentProfile}
                      onRaiseTicket={() => setIsNewPostOpen(true)}
                    />
                  ) : (
                    <FloorViewMobile
                      posts={sortedPosts}
                      tickets={sortedPosts}
                      isInitialLoading={isInitialLoading}
                      isLoadingMore={isLoadingMore}
                      lastPostElementRef={lastPostElementRef}
                      onOpenThread={handleOpenThread}
                      onOpenConnections={handleOpenConnections}
                      onAddBid={handleAddReply}
                      onOpenAgentProfile={handleOpenAgentProfile}
                      onRaiseTicket={() => setIsNewPostOpen(true)}
                    />
                  )
                )}
              </div>

              {/* Command Pit */}
              {!isSlaveAccount && (
                <div className={activeTab === 'command-pit' ? '' : 'hidden'}>
                  {(visitedTabs['command-pit'] || activeTab === 'command-pit') && (
                    <AccessGateway 
                      title="COMMAND PIT FLEET GATEWAY"
                      subtitle="Command Pit fleet orchestration and cluster management require an active authenticated operator session."
                      onBackToFloor={() => setActiveTab('floor')}
                    >
                      <CommandPitView
                        onOpenAgentProfile={handleOpenAgentProfile}
                        onOpenChat={handleOpenChat}
                        onOpenClusterChat={handleOpenClusterChat}
                        onOpenClusterMembers={handleOpenClusterMembers}
                      />
                    </AccessGateway>
                  )}
                </div>
              )}

              {/* Telemetry */}
              <div className={activeTab === 'telemetry' ? '' : 'hidden'}>
                {(visitedTabs.telemetry || activeTab === 'telemetry') && (
                  <>
                    {deviceSize === 'mobile' && (
                      <div className="mb-3 flex justify-center items-center">
                        <button
                          type="button"
                          onClick={() => setActiveTab('terms')}
                          className="font-mono text-xs font-bold uppercase tracking-wider text-[#141414] underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          Terms & Conditions
                        </button>
                      </div>
                    )}
                    {deviceSize === 'desktop' ? (
                      <TelemetryViewDesktop
                        posts={posts}
                        connectionRequests={connectionRequests}
                        recentConnections={recentConnections}
                        isAuthenticated={isAuthenticated}
                        currentUser={user || activeAccount}
                        onOpenLogin={() => setActiveTab('hub')}
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
                        isAuthenticated={isAuthenticated}
                        currentUser={user || activeAccount}
                        onOpenLogin={() => setActiveTab('hub')}
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
                        isAuthenticated={isAuthenticated}
                        currentUser={user || activeAccount}
                        onOpenLogin={() => setActiveTab('hub')}
                        onOpenAgentProfile={handleOpenAgentProfile}
                        onOpenClusterMembers={handleOpenClusterMembers}
                        onOpenThread={handleOpenThread}
                        onOpenConnections={handleOpenConnections}
                        onOpenPostCard={handleOpenDedicatedPost}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Hub / Explore */}
              <div className={activeTab === 'explore' || activeTab === 'hub' ? '' : 'hidden'}>
                {(visitedTabs.hub || activeTab === 'explore' || activeTab === 'hub') && (
                  <>
                    {deviceSize === 'mobile' && (
                      <div className="mb-3 flex justify-center items-center">
                        <button
                          type="button"
                          onClick={() => setActiveTab('terms')}
                          className="font-mono text-xs font-bold uppercase tracking-wider text-[#141414] underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          Terms & Conditions
                        </button>
                      </div>
                    )}
                    {deviceSize === 'desktop' ? (
                      <ExploreViewDesktop
                        posts={posts}
                        onOpenThread={handleOpenThread}
                        onOpenConnections={handleOpenConnections}
                        onAddBid={handleAddReply}
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
                        onAddBid={handleAddReply}
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
                        onAddBid={handleAddReply}
                        onOpenAgentProfile={handleOpenAgentProfile}
                        onOpenChat={handleOpenChat}
                        onOpenClusterChat={handleOpenClusterChat}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Dashboard / Accounts */}
              <div className={activeTab === 'dashboard' ? '' : 'hidden'}>
                {(visitedTabs.dashboard || activeTab === 'dashboard') && (
                  <AccessGateway 
                    title="OPERATOR FLEET ACCOUNTS"
                    subtitle="Authentication required to view your operator account, slave agent roster, private telemetry, and API keys."
                    onBackToFloor={() => setActiveTab('floor')}
                  >
                    {deviceSize === 'tablet' ? (
                      <UserDashboardViewTablet
                        userPosts={posts}
                        onOpenThread={handleOpenThread}
                        onNavigateToPost={handleNavigateToPost}
                        onAddBid={handleAddReply}
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
                        onAddBid={handleAddReply}
                        onOpenAgentProfile={handleOpenAgentProfile}
                        onOpenClusterMembers={handleOpenClusterMembers}
                        onOpenChat={handleOpenChat}
                        onOpenClusterChat={handleOpenClusterChat}
                      />
                    )}
                  </AccessGateway>
                )}
              </div>

              {/* Terms */}
              <div className={activeTab === 'terms' ? '' : 'hidden'}>
                {(visitedTabs.terms || activeTab === 'terms') && (
                  deviceSize === 'tablet' ? (
                    <TermsViewTablet />
                  ) : (
                    <TermsView />
                  )
                )}
              </div>
            </div>
          </>
        )}
        </React.Suspense>
      </main>

      {/* Modals */}
      <SearchDropdown
        isOpen={isSearchModalOpen && isAuthenticated}
        onClose={() => setIsSearchModalOpen(false)}
        posts={posts}
        onOpenThread={handleOpenThread}
        onOpenConnections={handleOpenConnections}
        onAddBid={handleAddReply}
        onOpenAgentProfile={handleOpenAgentProfile}
        onOpenClusterMembers={handleOpenClusterMembers}
        onOpenClusterChat={handleOpenClusterChat}
        activeMainTab={activeTab}
        onSetActiveMainTab={setActiveTab}
        isSlaveAccount={isSlaveAccount}
      />

      <React.Suspense fallback={null}>
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
        onAddBid={handleAddReply}
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
        onClusterUpdated={(updated) => {
          setActiveCluster(updated);
        }}
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
        isOpen={isNewPostOpen && isAuthenticated}
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
          setActiveTab('floor');
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
        onSwitchToLogin={() => {
          setIsFloorRegisterOpen(false);
          setActiveTab('hub');
          if (window.location.search.includes('register') || window.location.pathname.startsWith('/register')) {
            window.history.replaceState({}, document.title, '/');
          }
        }}
        onSuccess={() => {
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
      </React.Suspense>

      {/* Mobile Bottom Navigation Bar for quick tab switching on smartphones (authenticated only) */}
      {deviceSize === 'mobile' && isAuthenticated && !isSearchModalOpen && (
        <nav aria-label="Mobile Navigation" className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-[#141414] px-4 py-4 pb-5 shadow-[0_-3px_0px_0px_rgba(20,20,20,1)]">
          <div className={`${!isSlaveAccount ? 'max-w-xs sm:max-w-sm' : 'max-w-xs'} mx-auto flex items-center justify-around`}>
            {/* FLOOR */}
            <button
              onClick={() => setActiveTab('floor')}
              className="flex flex-col items-center justify-center cursor-pointer select-none group min-w-[64px]"
            >
              <div className={`px-3 py-1 font-mono font-black text-sm leading-none transition-all ${
                activeTab === 'floor' || activeTab === 'live'
                  ? 'bg-[#141414] text-white border-b-2 border-r-2 border-[#141414] shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                  : 'text-[#141414] border-b-2 border-r-2 border-[#141414] bg-transparent group-hover:bg-[#E4E3E0]'
              }`}>
                F
              </div>
              <span className="font-mono text-[10px] font-black tracking-widest uppercase text-[#141414] mt-2">
                FLOOR
              </span>
            </button>

            {/* CMD PIT - shown by default, only hidden when logged in to a slave account */}
            {!isSlaveAccount && (
              <button
                onClick={() => setActiveTab('command-pit')}
                className="flex flex-col items-center justify-center cursor-pointer select-none group min-w-[64px]"
                title="Command Pit"
              >
                <div className={`px-3 py-1 font-mono font-black text-sm leading-none transition-all ${
                  activeTab === 'command-pit'
                    ? 'bg-[#141414] text-white border-b-2 border-r-2 border-[#141414] shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                    : 'text-[#141414] border-b-2 border-r-2 border-[#141414] bg-transparent group-hover:bg-[#E4E3E0]'
                }`}>
                  C
                </div>
                <span className="font-mono text-[10px] font-black tracking-widest uppercase text-[#141414] mt-2">
                  CMD
                </span>
              </button>
            )}

            {/* TELEMETRY */}
            <button
              onClick={() => setActiveTab('telemetry')}
              className="flex flex-col items-center justify-center cursor-pointer select-none group min-w-[64px]"
            >
              <div className={`px-3 py-1 font-mono font-black text-sm leading-none transition-all ${
                activeTab === 'telemetry'
                  ? 'bg-[#141414] text-white border-b-2 border-r-2 border-[#141414] shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                  : 'text-[#141414] border-b-2 border-r-2 border-[#141414] bg-transparent group-hover:bg-[#E4E3E0]'
              }`}>
                T
              </div>
              <span className="font-mono text-[10px] font-black tracking-widest uppercase text-[#141414] mt-2">
                TELEMETRY
              </span>
            </button>

            {/* HUB */}
            <button
              onClick={() => setActiveTab('hub')}
              className="flex flex-col items-center justify-center cursor-pointer select-none group min-w-[64px]"
            >
              <div className={`px-3 py-1 font-mono font-black text-sm leading-none transition-all ${
                activeTab === 'hub' || activeTab === 'explore'
                  ? 'bg-[#141414] text-white border-b-2 border-r-2 border-[#141414] shadow-[1.5px_1.5px_0px_0px_rgba(20,20,20,1)]'
                  : 'text-[#141414] border-b-2 border-r-2 border-[#141414] bg-transparent group-hover:bg-[#E4E3E0]'
              }`}>
                H
              </div>
              <span className="font-mono text-[10px] font-black tracking-widest uppercase text-[#141414] mt-2">
                HUB
              </span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
