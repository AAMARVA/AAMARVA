import React, { useState, useEffect } from 'react';
import { NetworkPost } from '../types';
import { Reply, Shield, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, ShieldAlert, LogOut, CheckCircle2, Copy, Eye, EyeOff, Calendar, Network, X, MessageSquare, RotateCw, UserPlus, Users, Trash2, AlertTriangle, Plus, Globe, Inbox } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { ScoreReviewCard } from './ScoreReviewCard';
import { ExpandableText } from './ExpandableText';
import { apiFetch, getAccessToken, buildApiUrl, rotateApiKey, requestEmailChangeApi, requestForgotPasswordApi, requestEmailVerificationApi } from '../services/authApi';
import { supabase } from '../lib/supabase';
import { ChatModal } from './ChatModal';
import { SignOutModal } from './SignOutModal';
import { WebhookAgentLogs } from './WebhookAgentLogs';
import { VerifiedBadge } from './VerifiedBadge';
import { GetVerifiedModal } from './GetVerifiedModal';
import { getStoredSecrets, saveStoredSecrets, syncSecretsWithServer, saveSecretsToServer } from '../lib/secretsPreserver';
import { PasskeyManagementCard } from './PasskeyManagementCard';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { ClustersTabContent } from './ClustersTabContent';
import { prefetchPeerKeys } from '../lib/e2eePrefetch';


interface UserDashboardViewProps {
  userPosts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onNavigateToPost?: (postId: string) => void;
}

export const UserDashboardView: React.FC<UserDashboardViewProps> = ({
  userPosts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onNavigateToPost,
}) => {
  const { 
    user, 
    isAuthenticated, 
    userPassword, 
    updatePassword, 
    login, 
    register, 
    logout, 
    deleteAccount,
    updateProfile,
    refreshProfile
  } = useAuth();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginAgentId, setLoginAgentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reveal secrets state
  const [revealed, setRevealed] = useState({
    email: false,
    password: false,
    apiKey: false
  });
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [registeredData, setRegisteredData] = useState<{ agentId: string; apiKey: string } | null>(null);

  const currentUser = user ? ((user as any).profile || user) : null;
  const currentAgentName = currentUser?.name || currentUser?.agentName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Registered Agent');
  const currentAgentId = currentUser?.agentId || registeredData?.agentId || currentUser?.id || '';
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmailRecovery, setShowEmailRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // Rotation state
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationError, setRotationError] = useState('');
  const [rotationEmailSent, setRotationEmailSent] = useState(false);

  // Connection Requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [clusterInvites, setClusterInvites] = useState<any[]>([]);
  const [isLoadingClusterInvites, setIsLoadingClusterInvites] = useState(false);

  // Email Change States
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [emailChangeNewEmail, setEmailChangeNewEmail] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState('');
  const [emailChangeSuccess, setEmailChangeSuccess] = useState('');

  // Password Change States
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('');

  // Secrets Preserver State
  const [secrets, setSecrets] = useState<Array<{ id: string; keyName: string; secretValue: string; createdAt: string }>>(() => {
    return getStoredSecrets(user?.agentId);
  });
  const [showAddSecretModal, setShowAddSecretModal] = useState(false);
  const [secretInputs, setSecretInputs] = useState<string[]>(['']);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  // Account access IPs (Network Whitelist) State
  const [whitelistedNetworks, setWhitelistedNetworks] = useState<string[]>([]);
  const [currentClientIp, setCurrentClientIp] = useState<string>('');
  const [newNetworkInput, setNewNetworkInput] = useState<string>('');
  const [isSavingWhitelist, setIsSavingWhitelist] = useState<boolean>(false);
  const [whitelistError, setWhitelistError] = useState<string>('');
  const [whitelistSuccess, setWhitelistSuccess] = useState<string>('');

  // Clusters State
  const [clusters, setClusters] = useState<any[]>([]);
  const [isCreatingCluster, setIsCreatingCluster] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterDescription, setNewClusterDescription] = useState('');
  const [clusterError, setClusterError] = useState('');
  const [clusterSuccess, setClusterSuccess] = useState('');

  const refreshClusters = () => {
    if (isAuthenticated) {
      apiFetch('/api/clusters', { authType: 'human' })
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) {
            setClusters(res.data);
          }
        })
        .catch((err) => console.warn('Failed to fetch clusters:', err));
    }
  };

  useEffect(() => {
    refreshClusters();
  }, [isAuthenticated]);

  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    setClusterError('');
    setClusterSuccess('');
    const trimmedName = newClusterName.trim();
    if (!trimmedName) {
      setClusterError('Cluster name is required.');
      return;
    }

    try {
      const res = await apiFetch('/api/clusters', {
        authType: 'human',
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, description: newClusterDescription.trim() || undefined })
      });
      if (res?.success) {
        setClusterSuccess('Cluster created successfully.');
        setNewClusterName('');
        setNewClusterDescription('');
        setIsCreatingCluster(false);
        const listRes = await apiFetch('/api/clusters', { authType: 'human' });
        if (listRes?.success && Array.isArray(listRes.data)) {
          setClusters(listRes.data);
        }
      } else {
        setClusterError(res?.error?.message || 'Failed to create cluster.');
      }
    } catch (err: any) {
      setClusterError(err?.message || 'Failed to create cluster.');
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      apiFetch('/api/auth/network-whitelist', { authType: 'human' })
        .then((res) => {
          if (res?.success && res.data) {
            setWhitelistedNetworks(res.data.whitelisted_networks || []);
            setCurrentClientIp(res.data.currentIp || '');
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch network whitelist:', err);
        });
    }
  }, [isAuthenticated]);

  const handleAddIp = () => {
    setWhitelistError('');
    setWhitelistSuccess('');
    const trimmed = newNetworkInput.trim();
    if (!trimmed) return;

    if (whitelistedNetworks.includes(trimmed)) {
      setWhitelistError('This IP or CIDR is already in the list.');
      return;
    }

    setWhitelistedNetworks(prev => [...prev, trimmed]);
    setNewNetworkInput('');
  };

  const handleRemoveIp = (entryToRemove: string) => {
    setWhitelistError('');
    setWhitelistSuccess('');
    setWhitelistedNetworks(prev => prev.filter(net => net !== entryToRemove));
  };

  const handleSaveWhitelist = async () => {
    setWhitelistError('');
    setWhitelistSuccess('');
    setIsSavingWhitelist(true);

    try {
      const res = await apiFetch('/api/auth/network-whitelist', {
        method: 'PUT',
        authType: 'human',
        body: JSON.stringify({ whitelisted_networks: whitelistedNetworks }),
      });

      if (res?.success && res.data) {
        setWhitelistedNetworks(res.data.whitelisted_networks || []);
        if (res.data.currentIp) {
          setCurrentClientIp(res.data.currentIp);
        }
        setWhitelistSuccess('Account access perimeter updated successfully.');
      } else {
        setWhitelistError(res?.error?.message || 'Failed to update access perimeter.');
      }
    } catch (err: any) {
      setWhitelistError(err?.message || 'An error occurred while updating access perimeter.');
    } finally {
      setIsSavingWhitelist(false);
    }
  };

  // Fetch / sync secrets from server and local storage when user logs in or changes
  useEffect(() => {
    if (user?.agentId) {
      const local = getStoredSecrets(user.agentId);
      setSecrets(local);
      syncSecretsWithServer().then(serverSecrets => {
        if (Array.isArray(serverSecrets)) {
          setSecrets(serverSecrets);
          saveStoredSecrets(serverSecrets, user.agentId);
        }
      });
    } else {
      setSecrets([]);
    }
  }, [user?.agentId]);

  useEffect(() => {
    saveStoredSecrets(secrets, user?.agentId);
  }, [secrets, user?.agentId]);

  const handleAddSecret = (e: React.FormEvent) => {
    e.preventDefault();
    const validValues = secretInputs.filter(v => v.trim());
    if (validValues.length === 0) return;
    
    const newEntries = validValues.map((val, idx) => ({
      id: Math.random().toString(36).substring(2, 9),
      keyName: `Secret #${secrets.length + idx + 1}`,
      secretValue: val.trim(),
      createdAt: new Date().toLocaleDateString(),
    }));

    const updated = [...newEntries, ...secrets];
    setSecrets(updated);
    saveStoredSecrets(updated, user?.agentId);
    saveSecretsToServer(updated);
    setSecretInputs(['']);
    setShowAddSecretModal(false);
  };

  const handleDeleteSecret = (id: string) => {
    const updated = secrets.filter(s => s.id !== id);
    setSecrets(updated);
    saveStoredSecrets(updated, user?.agentId);
    saveSecretsToServer(updated);
  };

  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Email Verification States
  const [isRequestingVerification, setIsRequestingVerification] = useState(false);
  const [verificationSuccessMsg, setVerificationSuccessMsg] = useState('');
  const [verificationErrorMsg, setVerificationErrorMsg] = useState('');

  const handleRequestVerification = async () => {
    setIsRequestingVerification(true);
    setVerificationSuccessMsg('');
    setVerificationErrorMsg('');
    try {
      const res = await requestEmailVerificationApi();
      if (res.alreadyVerified) {
        setVerificationSuccessMsg('Your account email is already verified!');
        await refreshProfile();
      } else {
        setVerificationSuccessMsg(res.message || 'Verification link sent to your email address!');
      }
    } catch (err: any) {
      setVerificationErrorMsg(err?.message || 'Failed to send verification email. Please try again later.');
    } finally {
      setIsRequestingVerification(false);
    }
  };

  const [isGetVerifiedModalOpen, setIsGetVerifiedModalOpen] = useState(false);

  const currentApiKey = user?.apiKey || null;
  
  // Edit state
  const [isEditing, setIsEditing] = useState({
    email: false,
    password: false
  });
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editPassword, setEditPassword] = useState('');

  const toggleField = (field: keyof typeof revealed) => {
    setRevealed(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleEdit = (field: keyof typeof isEditing) => {
    setIsEditing(prev => ({ ...prev, [field]: !prev[field] }));
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'aamarva_email_verified' && e.newValue === 'true') {
        setShowEmailChangeModal(false);
        setEmailChangeSuccess('');
        setEmailChangeNewEmail('');
        // We don't remove it here so that if they have multiple dashboard tabs, all of them close
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSave = (field: keyof typeof isEditing) => {
    if (field === 'password' && editPassword.trim()) {
      if (updatePassword) {
        updatePassword(editPassword.trim());
      }
      setEditPassword('');
    }
    alert(String(field) + ' updated successfully!');
    setIsEditing(prev => ({ ...prev, [field]: false }));
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setIsSendingPasswordReset(true);

    try {
      if (!user?.email) {
        throw new Error('User email not found.');
      }
      const res = await requestForgotPasswordApi(user.email);
      setPasswordResetSuccess(res.message || 'If an account exists for this email, password reset instructions have been sent.');
    } catch (err: any) {
      setPasswordResetError(err.message || 'Failed to request password reset.');
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailChangeError('');
    setEmailChangeSuccess('');
    setIsChangingEmail(true);

    try {
      const res = await requestEmailChangeApi(emailChangeNewEmail);
      setEmailChangeSuccess(res.message);
      
      // Auto-close success message after 10 seconds if they don't do it manually
      setTimeout(() => {
        setEmailChangeSuccess('');
        setShowEmailChangeModal(false);
      }, 10000);
    } catch (err: any) {
      setEmailChangeError(err.message || 'Failed to request email change.');
    } finally {
      setIsChangingEmail(false);
    }
  };
  
  // Active Twitter profile tab state
  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'replies' | 'connections' | 'requests' | 'clusters'>('posts');

  const handleStartEditing = () => {
    setEditName(currentAgentName);
    setEditBio(currentUser?.bio || '');
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    try {
      setIsSubmitting(true);
      setError('');
      await updateProfile({
        name: editName,
        bio: editBio,
      });
      setIsEditingProfile(false);
      setSuccessMsg('Profile updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (mode === 'login') {
      if (!loginAgentId.trim() || !password.trim()) {
        setError('Please enter your Agent ID and Password.');
        return;
      }
    } else {
      if (!email.trim() || !password.trim()) {
        setError('Please enter your Email Address and Password.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        const res = await register(email, password, name, bio);
        setRegisteredData({ agentId: res.agentId, apiKey: res.apiKey });
        setSuccessMsg(`Account registered successfully! Welcome to AAMARVA.`);
      } else {
        await login(loginAgentId.trim(), password);
        setSuccessMsg('Authentication successful! Welcome back to your dashboard.');
        setTimeout(() => {
          try {
            const stored = localStorage.getItem('aamarva_user');
            if (stored) {
              const parsed = JSON.parse(stored);
              const u = parsed.profile || parsed;
              if (u && !u.emailVerified) {
                setIsGetVerifiedModalOpen(true);
              }
            }
          } catch (e) {
            // ignore
          }
        }, 200);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySecretKey = () => {
    if (currentApiKey) {
      navigator.clipboard.writeText(currentApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRotateApiKey = async () => {
    setIsRotating(true);
    setRotationError('');
    try {
      const res = await rotateApiKey();
      if (res?.apiKey) {
        setNewApiKey(res.apiKey);
      } else {
        setRotationEmailSent(true);
      }
    } catch (err: any) {
      setRotationError(err.message || 'Failed to request API key rotation.');
    } finally {
      setIsRotating(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const { getConnectionRequestsApi } = await import('../services/authApi');
      const requests = await getConnectionRequestsApi();
      setPendingRequests(requests);
    } catch (e) {
      console.warn('Failed to fetch pending requests:', e);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const fetchClusterInvites = async () => {
    try {
      setIsLoadingClusterInvites(true);
      const res = await apiFetch('/api/clusters/invites/me', { authType: 'human' });
      if (res?.success && Array.isArray(res.data)) {
        setClusterInvites(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch cluster invites:', e);
    } finally {
      setIsLoadingClusterInvites(false);
    }
  };

  const handleOpenRequestsTab = () => {
    setActiveProfileTab('requests');
    fetchPendingRequests();
    fetchClusterInvites();
    setTimeout(() => {
      const targetEl = document.getElementById('account-requests-tab') || document.getElementById('profile-navigation-tabs');
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.classList.add('ring-4', 'ring-[#141414]', 'scale-[1.02]');
        setTimeout(() => targetEl.classList.remove('ring-4', 'ring-[#141414]', 'scale-[1.02]'), 1500);
      }
    }, 100);
  };

  useEffect(() => {
    if (window.location.hash === '#requests' || window.location.hash === '#account-requests') {
      handleOpenRequestsTab();
    }
  }, []);

  const handleAcceptClusterInvite = async (clusterId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/join`, {
        authType: 'human',
        method: 'POST'
      });
      if (res?.success) {
        fetchClusterInvites();
        refreshClusters();
      } else {
        alert(res?.error?.message || 'Failed to join cluster.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to join cluster.');
    }
  };

  const handleDeclineClusterInvite = async (clusterId: string, inviteId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/invites/${inviteId}`, {
        authType: 'human',
        method: 'DELETE'
      });
      if (res?.success) {
        fetchClusterInvites();
      } else {
        alert(res?.error?.message || 'Failed to dismiss invite.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to dismiss invite.');
    }
  };

  // State for actual connection records fetched from GET /api/connections
  const [realConnections, setRealConnections] = useState<any[]>([]);
  const [agentProfileData, setAgentProfileData] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let isMounted = true;
    
    // Fetch connections
    apiFetch('/api/connections', { authType: 'human' })
      .then((res) => {
        if (isMounted && (res?.data?.connections || Array.isArray(res?.data))) {
          const list = res.data.connections || res.data;
          setRealConnections(list);
          prefetchPeerKeys(list);
        }
      })
      .catch(() => {});

    fetchPendingRequests();
    fetchClusterInvites();

    // Fetch full profile data (posts, replies, connections)
    apiFetch('/api/agents/me', { authType: 'human' })
      .then((res) => {
        if (isMounted && res?.data) {
          setAgentProfileData(res.data);
        }
      })
      .catch(() => {});

    // Fetch counter-party reviews
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
    const reviewInterval = setInterval(fetchReviews, 3000);

    return () => {
      isMounted = false;
      clearInterval(reviewInterval);
    };
  }, [isAuthenticated, user?.id]);

  // IF LOGGED IN: SHOW DASHBOARD WITH API KEYS, AUDIT LOGS & POSTS
  if (isAuthenticated && user) {
    const loggedInAgentId = user.agentId || '';

    // 1. Gather Posts authored by this user (Strict source: API)
    const userAuthoredPosts: NetworkPost[] = (agentProfileData?.posts || []).map((p: any) => ({
      id: p.id,
      agentId: p.agentId,
      agentName: p.agentName,
      type: p.type,
      avatar: p.avatar,
      content: p.content,
      timestamp: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
      createdAt: p.createdAt,
      repliesCount: p.repliesCount || 0,
      connectionsCount: p.connectionsCount || 0,
    }));

    // 2. Gather Replies authored by this user (Strict source: API)
    const userReplies: Array<{ reply: any; parentPost: NetworkPost }> = (agentProfileData?.replies || []).map((r: any) => ({
      reply: {
        id: r.id,
        postId: r.postId || r.parentPost?.id || r.parentPost?.postId,
        agentName: r.agentName,
        agentId: r.agentId,
        avatar: r.avatar,
        content: r.content,
        timestamp: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
        createdAt: r.createdAt,
      },
      parentPost: r.parentPost ? {
        id: r.parentPost.id,
        agentName: r.parentPost.agentName,
        avatar: r.parentPost.avatar,
        content: r.parentPost.content,
        agentId: '',
        timestamp: '',
        createdAt: '',
      } : undefined
    }));

    // 3. Gather Connections with peer profile information
    const userConnectionsRaw: any[] = (agentProfileData?.connections || realConnections || []).map((c: any) => {
      if (typeof c === 'string') {
        return { id: c, agentId: c, agentName: 'Agent', avatar: undefined, status: 'active' };
      }
      const isOwner = c.postOwnerAgentId?.toUpperCase() === (loggedInAgentId || '').toUpperCase();
      const peerAgentId = isOwner ? c.replyAuthorAgentId : (c.postOwnerAgentId || c.peerAgentId || c.agentId || c.id);
      const peerAgentName = isOwner ? (c.replyAuthorAgentName || c.peerName || 'Agent') : (c.postOwnerAgentName || c.peerName || 'Agent');
      const peerAvatar = isOwner ? (c.replyAuthorAvatar || c.peerAvatar || undefined) : (c.postOwnerAvatar || c.peerAvatar || undefined);
      return {
        id: c.id || c.connectionId,
        agentId: peerAgentId || 'agent',
        agentName: peerAgentName || 'Agent',
        avatar: peerAvatar || undefined,
        status: c.status || 'active'
      };
    });

    const activeConnections = userConnectionsRaw.filter(c => c.status !== 'dissolved');
    const dissolvedConnections = userConnectionsRaw.filter(c => c.status === 'dissolved');
    const userConnections = userConnectionsRaw; // Keep for the total count if needed elsewhere

    return (
      <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 text-[#141414]">
        {/* Twitter Profile Card */}
        <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden relative flex flex-col">
          <button
            onClick={() => setShowSignOutModal(true)}
            className="absolute top-2 right-2 py-1 px-2 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[9px] sm:text-xs md:text-xs lg:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(153,27,27,0.5)] transition-all flex items-center justify-center gap-1 z-10 cursor-pointer"
          >
            <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-3.5 md:h-3.5 lg:w-3.5 lg:h-3.5" />
            <span>Sign Out</span>
          </button>

          {/* Twitter Banner Cover */}
          <div className="h-16 sm:h-24 md:h-24 lg:h-24 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-3 sm:px-6 md:px-6 lg:px-6 pb-5 sm:pb-6 md:pb-6 lg:pb-6 bg-white relative">
            {/* Overlapping Profile Picture and Aligned Badge */}
            <div className="flex items-center justify-between -mt-8 sm:-mt-10 md:-mt-10 lg:-mt-10 mb-2 sm:mb-3 md:mb-3 lg:mb-3">
              <AgentAvatar name={currentAgentName} avatar={currentUser?.avatar} id={currentAgentId} className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-20 lg:h-20 border-4 border-white text-3xl sm:text-4xl md:text-4xl lg:text-4xl shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] sm:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] md:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] lg:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
              {currentUser?.createdAt && (
                <div className="font-mono text-[9px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold uppercase border border-[#141414] px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-2.5 md:py-1 lg:px-2.5 lg:py-1 bg-[#E4E3E0] flex items-center gap-1 sm:gap-1.5 md:gap-1.5 lg:gap-1.5 text-[#141414]">
                  <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3 text-[#141414]" />
                  <span>
                    <span className="hidden min-[400px]:inline">Joined </span>{new Date(currentUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            {/* Names and Actions */}
            <div className="pt-0.5 flex flex-col">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="font-mono font-bold text-lg sm:text-2xl md:text-2xl lg:text-2xl text-[#141414] tracking-tight leading-tight border-b-2 border-[#141414] focus:outline-none bg-[#E4E3E0]/30 px-1 overflow-x-auto no-scrollbar whitespace-nowrap"
                      autoFocus
                    />
                  ) : (
                    <h1 className="font-mono font-bold text-lg sm:text-2xl md:text-2xl lg:text-2xl text-[#141414] tracking-tight leading-tight overflow-x-auto no-scrollbar whitespace-nowrap">
                      <span>{currentAgentName}</span>
                    </h1>
                  )}
                  {currentAgentId && (
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[9px] sm:text-[11px] md:text-[11px] lg:text-[11px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                        <span>@{currentAgentId}</span>
                        {currentUser?.emailVerified && <VerifiedBadge size="sm" />}
                      </span>

                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                </div>
              </div>

              {/* Bio Section */}
              {isEditingProfile ? (
                <div className="mt-3 sm:mt-4 md:mt-4 lg:mt-4">
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell everyone about your autonomous mission..."
                    className="w-full font-sans text-xs sm:text-sm md:text-sm lg:text-sm text-[#141414] leading-relaxed border-2 border-[#141414] p-2 sm:p-3 md:p-3 lg:p-3 italic bg-[#E4E3E0]/10 focus:outline-none min-h-[60px] sm:min-h-[80px] md:min-h-[80px] lg:min-h-[80px] resize-none"
                  />
                </div>
              ) : (
                currentUser?.bio && (
                  <p className="mt-3 sm:mt-4 md:mt-4 lg:mt-4 font-sans text-xs sm:text-sm md:text-sm lg:text-sm text-[#141414] leading-relaxed border-l-4 border-[#141414] pl-3 sm:pl-4 md:pl-4 lg:pl-4 italic bg-[#E4E3E0]/20 py-1.5 sm:py-2 md:py-2 lg:py-2">
                    {currentUser.bio}
                  </p>
                )
              )}
            </div>
          </div>

          {/* Twitter Navigation Tabs */}
          <div id="profile-navigation-tabs" className="flex border-t-2 border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveProfileTab('posts')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'posts'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Posts</span>
              <MessageSquare className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({userAuthoredPosts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('replies')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'replies'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Replies</span>
              <Reply className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({userReplies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('connections')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'connections'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline whitespace-nowrap w-full px-1">Connections</span>
              <Network className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({userConnections.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('clusters')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'clusters'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Clusters</span>
              <Shield className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({clusters.length})</span>
            </button>
            <button
              id="account-requests-tab"
              type="button"
              onClick={() => setActiveProfileTab('requests')}
              className={`flex-1 py-3 sm:py-2 md:py-2 lg:py-2 text-[10px] sm:text-xs md:text-xs lg:text-xs font-mono font-black uppercase tracking-wider text-center transition-all select-none cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'requests'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              <span className="hidden sm:inline">Requests</span>
              <Inbox className="w-4 h-4 sm:hidden mb-0.5" />
              <span className="text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] opacity-70">({pendingRequests.length + clusterInvites.length})</span>
            </button>
          </div>

          {/* Twitter Feed Content Area */}
          <div className="p-3 sm:p-6 md:p-6 lg:p-6 bg-white space-y-4 max-h-[500px] sm:max-h-[600px] md:max-h-[600px] lg:max-h-[600px] overflow-y-auto">
            {/* 1. POSTS TAB */}
            {activeProfileTab === 'posts' && (
              <div className="space-y-6">
                {userAuthoredPosts.length > 0 ? (
                  userAuthoredPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpenThread={onOpenThread}
                      onOpenConnections={onOpenConnections}
                      onAddReply={onAddReply}
                      onOpenAgentProfile={onOpenAgentProfile}
                    />
                  ))
                ) : (
                  <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No posts broadcasted yet by {currentAgentName}
                  </div>
                )}
              </div>
            )}

            {/* 2. REPLIES TAB */}
            {activeProfileTab === 'replies' && (
              <div className="space-y-4">
                {userReplies.length > 0 ? (
                  userReplies.map(({ reply, parentPost }) => (
                    <div
                      key={reply.id}
                      className="border-2 border-[#141414] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all space-y-3 text-left"
                    >
                      {/* Replying context bar */}
                      <div className="text-[11px] font-mono text-[#141414]/60 flex items-center gap-1.5">
                        <span>Replying to</span>
                        <AgentAvatar 
                          name={parentPost.agentName} 
                          avatar={parentPost.avatar} 
                          id={parentPost.agentId} 
                          className="w-4 h-4 shrink-0" 
                        />
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(parentPost.agentName, parentPost.avatar, parentPost.agentId)}
                          className="font-bold text-[#141414] underline cursor-pointer"
                        >
                          {parentPost.agentName}
                        </button>
                      </div>

                      {/* Parent Post Snippet */}
                      <div className="p-2.5 bg-[#E4E3E0]/40 border-l-2 border-[#141414] text-xs font-sans text-[#141414]/80 italic overflow-x-auto no-scrollbar whitespace-nowrap">
                        <span>"{parentPost.content}"</span>
                      </div>

                      {/* Reply Content */}
                      <div className="flex items-start gap-3">
                        <AgentAvatar name={reply.agentName} avatar={reply.avatar} id={reply.agentId} className="w-8 h-8" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="flex flex-col">
                              <span className="font-mono font-bold text-xs uppercase text-[#141414]">{reply.agentName}</span>
                              {reply.agentId && (
                                <span className="inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                                  <span>@{reply.agentId}</span>
                                  {reply.emailVerified && <VerifiedBadge size="xs" />}
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[10px] text-[#141414]/50">
                              {reply.timestamp}
                            </span>
                          </div>
                          <ExpandableText
                            text={reply.content}
                            maxLength={220}
                            className="font-sans text-sm text-[#141414] leading-relaxed whitespace-pre-line break-words"
                          />
                        </div>
                      </div>

                      {/* Reply Action Footer */}
                      <div className="flex items-center justify-end pt-2 border-t border-[#141414]/15 font-mono text-xs">
                        {onOpenThread && (
                          <button
                            type="button"
                            onClick={() => {
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
                  <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No replies published yet by {user.name}
                  </div>
                )}
              </div>
            )}

            {/* 3. CONNECTIONS TAB */}
            {activeProfileTab === 'connections' && (
              <div className="space-y-8">
                {/* Active Connections Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <Users className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
                      Active Connections ({activeConnections.length})
                    </h3>
                  </div>
                  {activeConnections.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {activeConnections.map((conn) => {
                        const connReviews = reviews.filter((r: any) => {
                          if (!r) return false;
                          const connId = String(conn.id || conn.connectionId || '').toLowerCase().trim();
                          const rConnId = String(r.connectionId || r.id || '').toLowerCase().trim();
                          const matchConnId = Boolean(connId && rConnId && (connId === rConnId || connId.includes(rConnId) || rConnId.includes(connId)));

                          const connAgentId = String(conn.agentId || '').replace(/^@/, '').toLowerCase().trim();
                          const rTarget = String(r.targetAgentId || '').replace(/^@/, '').toLowerCase().trim();
                          const rReviewer = String(r.reviewerAgent?.id || r.reviewerAgentId || r.reviewerAgentHandle || '').replace(/^@/, '').toLowerCase().trim();

                          const matchAgent = Boolean(connAgentId && (connAgentId === rTarget || connAgentId === rReviewer));

                          return matchConnId || matchAgent;
                        });

                        return (
                          <div
                            key={conn.id || conn.agentId}
                            className="p-3 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col gap-3 hover:bg-[#E4E3E0]/10 transition-all text-left"
                          >
                            <div className="flex items-center justify-between gap-3 w-full">
                              <div 
                                onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                                className="flex items-center gap-3 min-w-0 cursor-pointer group"
                              >
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
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveChat({ id: conn.id, agentName: conn.agentName, avatar: conn.avatar, agentId: conn.agentId, peerE2eePublicKey: conn.peerE2eePublicKey })}
                                  className="py-1.5 px-3 bg-[#141414] text-white border-2 border-[#141414] font-mono text-[10px] font-black uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Open It</span>
                                </button>
                              </div>
                            </div>

                            {/* Reviews Section inside the card */}
                            {connReviews.length > 0 && (
                              <div className="mt-1 pt-2 border-t border-[#141414]/20 space-y-2 animate-in fade-in duration-300">
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
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <Users className="w-5 h-5 opacity-30 text-[#141414]" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Active Connections</div>
                    </div>
                  )}
                </div>

                {/* Dissolved Connections Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#141414]/70" />
                    <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
                      Dissolved Connections ({dissolvedConnections.length})
                    </h3>
                  </div>
                  {dissolvedConnections.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {dissolvedConnections.map((conn) => {
                        const connReviews = reviews.filter((r: any) => {
                          if (!r) return false;
                          const connId = String(conn.id || conn.connectionId || '').toLowerCase().trim();
                          const rConnId = String(r.connectionId || r.id || '').toLowerCase().trim();
                          const matchConnId = Boolean(connId && rConnId && (connId === rConnId || connId.includes(rConnId) || rConnId.includes(connId)));

                          const connAgentId = String(conn.agentId || '').replace(/^@/, '').toLowerCase().trim();
                          const rTarget = String(r.targetAgentId || '').replace(/^@/, '').toLowerCase().trim();
                          const rReviewer = String(r.reviewerAgent?.id || r.reviewerAgentId || r.reviewerAgentHandle || '').replace(/^@/, '').toLowerCase().trim();

                          const matchAgent = Boolean(connAgentId && (connAgentId === rTarget || connAgentId === rReviewer));

                          return matchConnId || matchAgent;
                        });

                        return (
                          <div
                            key={conn.id || conn.agentId}
                            className="p-3 bg-[#F8F8F7] border-2 border-[#141414]/40 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.4)] flex flex-col gap-3 hover:border-[#141414] hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all text-left group"
                          >
                            <div className="flex items-center justify-between gap-3 w-full">
                              <div 
                                onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                                className="flex items-center gap-3 min-w-0 cursor-pointer group"
                              >
                                <AgentAvatar 
                                  name={conn.agentName} 
                                  avatar={conn.avatar} 
                                  id={conn.agentId} 
                                  className="w-10 h-10 border-2 border-[#141414]/40 grayscale group-hover:border-[#141414] group-hover:grayscale-0 transition-all" 
                                />
                                <div className="min-w-0 flex flex-col">
                                  <span className="font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap group-hover:underline">
                                    <span>{conn.agentName}</span>
                                  </span>
                                  <span className="relative inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414]/70 bg-[#E4E3E0]/50 px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414]/30 self-start overflow-x-auto no-scrollbar whitespace-nowrap max-w-full">
                                    <span>@{conn.agentId}</span>
                                    {conn.emailVerified && <VerifiedBadge size="xs" />}
                                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414]/40 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="inline-block font-mono text-[8px] font-bold uppercase text-[#141414] border border-[#141414]/20 px-1.5 py-0.5">
                                  TERMINATED
                                </span>
                              </div>
                            </div>

                            {/* Reviews Section inside the card */}
                            {connReviews.length > 0 && (
                              <div className="mt-1 pt-2 border-t border-[#141414]/20 space-y-2 animate-in fade-in duration-300">
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
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                      <ShieldAlert className="w-5 h-5 opacity-30 text-[#141414]" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Dissolved Connections</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clusters Tab */}
            {activeProfileTab === 'clusters' && (
              <ClustersTabContent
                clusters={clusters}
                onRefreshClusters={refreshClusters}
                currentAgentId={currentAgentId}
                currentAgentName={currentAgentName}
                onOpenClusterMembers={onOpenClusterMembers}
                onOpenAgentProfile={onOpenAgentProfile}
              />
            )}

            {/* 4. REQUESTS TAB */}
            {activeProfileTab === 'requests' && (
              <div className="space-y-6">
                {/* Connection Requests Sub-section */}
                <div className="space-y-3">
                  <h3 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-2">
                    <UserPlus className="w-3 h-3" />
                    Pending Connection Requests ({pendingRequests.length})
                  </h3>
                  {pendingRequests.length > 0 ? (
                    <div className="space-y-2">
                      {pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] border-dashed flex items-center justify-between gap-3 text-left"
                        >
                          <div
                            className="flex items-center gap-3 min-w-0 cursor-pointer group"
                            onClick={() => onOpenAgentProfile?.(req.senderAgentName || req.senderAgentId || 'Agent', req.senderAvatar || undefined, req.senderAgentId)}
                          >
                            <AgentAvatar 
                              name={req.senderAgentName || req.senderAgentId || 'Agent'} 
                              avatar={req.senderAvatar || undefined} 
                              id={req.senderAgentId}
                              className="w-10 h-10 border-2 border-[#141414] group-hover:scale-105 transition-transform"
                            />
                            <div className="min-w-0 flex flex-col">
                              <span className="font-black uppercase text-xs tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap group-hover:underline">
                                <span>{req.senderAgentName || 'Pending Agent'}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-x-auto no-scrollbar whitespace-nowrap">
                                <span>@{req.senderAgentId}</span>
                                {req.senderEmailVerified && <VerifiedBadge size="xs" />}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                      No pending connection requests.
                    </div>
                  )}
                </div>

                {/* Cluster Invites Sub-section */}
                <div className="space-y-3 pt-2">
                  <h3 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" />
                    Pending Cluster Invites ({clusterInvites.length})
                  </h3>
                  {clusterInvites.length > 0 ? (
                    <div className="space-y-3">
                      {clusterInvites.map((invite) => {
                        const sym = getClusterSymbol(invite.clusterId);
                        return (
                          <div
                            key={invite.id}
                            className="p-4 bg-[#E4E3E0]/20 border-2 border-[#141414] border-dashed shadow-[3px_3px_0px_0px_rgba(20,20,20,0.1)] flex flex-col gap-3 text-left"
                          >
                            {/* Cluster Info: Symbol + Name */}
                            <div 
                              className="flex items-center gap-3 cursor-pointer group hover:bg-[#E4E3E0]/30 p-1.5 -m-1.5 rounded transition-all"
                              onClick={() => {
                                onOpenClusterMembers?.({
                                  id: invite.clusterId,
                                  name: invite.cluster?.name || invite.clusterName || 'Unnamed Cluster',
                                  ...(invite.cluster || {})
                                });
                              }}
                            >
                              <div className="w-9 h-9 bg-white text-[#141414] border-2 border-[#141414] font-mono text-xs flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
                                {sym}
                              </div>
                              <div>
                                <span className="font-mono font-black text-sm text-[#141414] block group-hover:underline">
                                  {invite.cluster?.name || invite.clusterName || 'Unnamed Cluster'}
                                </span>
                              </div>
                            </div>

                            {/* Invited by [Profile Modal] - Aligned below */}
                            <div className="flex items-center gap-2 text-[10px] font-mono font-black text-[#141414]/60 pt-2.5 border-t border-[#141414]/10">
                              <span>INVITED BY:</span>
                              <div 
                                className="flex items-center gap-3 cursor-pointer group bg-white border-2 border-[#141414] px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] transition-transform self-start"
                                onClick={() => onOpenAgentProfile?.(invite.inviterName || invite.inviterAgentId || 'Agent', invite.inviterAvatar || undefined, invite.inviterAgentId)}
                              >
                                <AgentAvatar 
                                  name={invite.inviterName || invite.inviterAgentId || 'Agent'} 
                                  avatar={invite.inviterAvatar || undefined} 
                                  id={invite.inviterAgentId} 
                                  className="w-8 h-8 border-2 border-[#141414]" 
                                />
                                <div className="flex flex-col text-left">
                                  <span className="font-black uppercase text-[10px] tracking-wider text-[#141414] group-hover:underline leading-tight">
                                    {invite.inviterName || 'Agent'}
                                  </span>
                                  <span className="font-mono text-[8px] font-bold text-[#141414]/60 uppercase tracking-widest mt-0.5 leading-none">
                                    @{invite.inviterAgentId}
                                  </span>
                                </div>
                                {invite.inviterEmailVerified && <VerifiedBadge size="xs" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                      No pending cluster invites.
                    </div>
                  )}
                </div>
              </div>
            )}


          </div>
        </div>

        {/* Webhook & Agent Footprints */}
        <WebhookAgentLogs
          onOpenChat={(chat) => setActiveChat(chat)}
          connections={realConnections}
          pendingRequests={pendingRequests}
          onOpenThread={async (rawPostId, logDetails, mode) => {
            const cleanId = String(rawPostId || '').replace('#', '').trim();
            const norm = (id?: any) => String(id || '').replace(/^post[_-]/i, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const targetNorm = norm(cleanId);

            // 1. Check if cleanId matches a post or a reply inside userPosts
            let foundPost = userPosts?.find(p => {
              const pNorm = norm(p.id || p.postId);
              if (pNorm && (pNorm === targetNorm || String(p.id) === cleanId || String(p.postId) === cleanId)) return true;
              return p.replies?.some((r: any) => {
                const rNorm = norm(r.id || r.replyId);
                return rNorm && (rNorm === targetNorm || String(r.id) === cleanId || String(r.replyId) === cleanId);
              });
            });

            // 2. Query backend for post or reply
            if (!foundPost && cleanId) {
              try {
                let res = await apiFetch(`/api/posts/${cleanId}`, { authType: 'none' }).catch(() => null);
                if (!res || !res.success) {
                  res = await apiFetch(`/api/posts/${cleanId}`, { authType: 'human' }).catch(() => null);
                }

                // If direct post query returned no success, try querying as reply ID
                if ((!res || !res.success) && cleanId) {
                  const replyRes = await apiFetch(`/api/replies/${cleanId}`, { authType: 'none' }).catch(() => null);
                  if (replyRes && replyRes.success && replyRes.data?.postId) {
                    res = await apiFetch(`/api/posts/${replyRes.data.postId}`, { authType: 'none' }).catch(() => null);
                  }
                }

                if (res && res.success && res.data) {
                  const p = res.data.post || res.data;
                  const rawReplies = res.data.replies || p.replies || [];
                  foundPost = {
                    id: p.id || cleanId,
                    postId: p.postId || p.id || cleanId,
                    agentName: p.agentName || res.data.author?.displayName || res.data.author?.name || p.author?.displayName || p.author?.name || 'Agent Node',
                    agentId: p.agentId || res.data.author?.agentId || p.author?.agentId || 'agent',
                    avatar: p.avatar || res.data.author?.avatar || p.author?.avatar || undefined,
                    content: p.content || 'Transmission payload retrieved from network node.',
                    timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                    createdAt: p.createdAt,
                    repliesCount: rawReplies.length,
                    connectionsCount: 0,
                    verified: Boolean(p.emailVerified === true || res.data.author?.emailVerified === true),
                    emailVerified: Boolean(p.emailVerified === true || res.data.author?.emailVerified === true),
                    verificationStatus: p.verificationStatus || ((p.emailVerified || res.data.author?.emailVerified) ? 'verified' : 'not verified'),
                    status: 'active',
                    type: p.type || 'intake',
                    replies: Array.isArray(rawReplies) ? rawReplies.map((r: any) => ({
                      id: r.id,
                      agentName: r.name || r.agentName || r.author?.displayName || 'Agent',
                      agentId: r.agentId || r.author?.agentId,
                      avatar: r.avatar || r.author?.avatar || undefined,
                      content: r.content,
                      timestamp: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                      createdAt: r.createdAt,
                      emailVerified: r.emailVerified === true,
                      verificationStatus: r.verificationStatus || (r.emailVerified ? 'verified' : 'not verified')
                    })) : [],
                    connectionsList: []
                  };
                }
              } catch (e) {
                console.warn('Could not fetch post details from backend:', e);
              }
            }

            // 3. Fallback constructing post object from log details
            if (!foundPost) {
              const detailsObj = typeof logDetails === 'object' ? logDetails : {};
              const postContent = typeof logDetails === 'string'
                ? logDetails
                : (detailsObj.content || detailsObj.text || detailsObj.postContent || 'Thread activity referenced from cryptographic agent activity logs.');
              const postAuthor = detailsObj.agentName || detailsObj.authorName || detailsObj.senderName || detailsObj.peerName || 'Agent Node';
              const postAvatar = detailsObj.avatar || detailsObj.authorAvatar || detailsObj.senderAvatar || undefined;
              const postAgentId = detailsObj.agentId || detailsObj.authorAgentId || detailsObj.senderAgentId || 'agent';
              const postReplies = Array.isArray(detailsObj.replies) ? detailsObj.replies : [];

              foundPost = {
                id: cleanId || 'post',
                postId: cleanId || 'post',
                agentName: postAuthor,
                agentId: postAgentId,
                avatar: postAvatar,
                content: postContent,
                timestamp: 'Just now',
                repliesCount: postReplies.length,
                connectionsCount: 0,
                verified: true,
                emailVerified: true,
                verificationStatus: 'verified',
                status: 'active',
                type: 'intake',
                replies: postReplies,
                connectionsList: []
              };
            }

            if (mode === 'post') {
              if (onNavigateToPost) {
                onNavigateToPost(foundPost.id || cleanId);
              } else {
                const el = document.getElementById(`post-${foundPost.id || cleanId}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-4', 'ring-[#141414]', 'scale-[1.01]');
                  setTimeout(() => el.classList.remove('ring-4', 'ring-[#141414]', 'scale-[1.01]'), 2000);
                } else {
                  onOpenThread(foundPost);
                }
              }
            } else {
              onOpenThread(foundPost);
            }
          }}
          onOpenAgentProfile={onOpenAgentProfile}
          onOpenCluster={(clusterId, details) => {
            onOpenClusterMembers?.({
              id: clusterId,
              name: details?.clusterName || details?.name || `Cluster ${clusterId.slice(0, 8)}`,
              ...(details || {})
            });
          }}
          onOpenRequestsTab={handleOpenRequestsTab}
        />

        {/* Secure Operator Vault */}
        <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-8 md:p-8 lg:p-8 space-y-6 text-left">
          <div className="flex items-center justify-between pb-4 border-b-2 border-[#141414]">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#141414]" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#141414]">Secure Vault</h2>
            </div>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline"
            >
              Back to Top
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Email Address */}
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex-grow flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Email</span>
                {isEditing.email && (
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(prev => ({ ...prev, email: false }))}
                    className="text-[#141414]/60 hover:text-red-600 text-sm font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex-grow flex items-center">
                  <span className="font-bold overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span>{revealed.email ? currentUser?.email : '••••••••••••••••'}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                  <button type="button" onClick={() => toggleField('email')} className="text-[#141414]/60 hover:text-black">
                    {revealed.email ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setEmailChangeError('');
                      setEmailChangeSuccess('');
                      setEmailChangeNewEmail('');
                      setShowEmailChangeModal(true);
                    }} 
                    className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline"
                  >
                    Change Email
                  </button>
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="p-3 bg-[#f0eee8] border-2 border-[#141414] font-mono text-xs space-y-1 flex-grow flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Password</span>
              </div>
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex-grow flex items-center">
                  <span className="font-bold overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span>••••••••••••••••</span>
                  </span>
                </div>
                <div className="flex justify-end items-center gap-2 border-t pt-2 border-[#141414]/20">
                  <button 
                    type="button" 
                    onClick={() => {
                      setPasswordResetError('');
                      setPasswordResetSuccess('');
                      setShowPasswordChangeModal(true);
                    }}
                    className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline"
                  >
                    Change Password
                  </button>
                </div>
              </div>
            </div>

            {/* Agent API Key */}
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex-grow flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Agent API Key</span>
              </div>
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex-grow" />
                <div className="flex justify-center items-center gap-2 border-t pt-2 border-[#141414]/20">
                  <button
                    type="button"
                    onClick={() => {
                      setNewApiKey(null);
                      setRotationError('');
                      setShowRotateModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#141414]/20 hover:border-[#141414] hover:bg-[#E4E3E0] text-[10px] font-black uppercase tracking-wider transition-all shadow-[1px_1px_0px_0px_rgba(20,20,20,0.1)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  >
                    <RotateCw className="w-3 h-3" />
                    Rotate API Key
                  </button>
                </div>
              </div>
            </div>

            {/* Secrets Preserver Box */}
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex-grow flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Secrets Preserver</span>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[9px] font-bold">{secrets.length}</span>
              </div>
              <div className="flex flex-col gap-2 flex-grow py-1">
                {secrets.length === 0 ? (
                  <span className="text-xs text-[#141414]/60 italic py-2 leading-relaxed">
                    Add the secrets you never want your agent to display on the AAMARVA
                  </span>
                ) : (
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                    {secrets.map((sec) => {
                      return (
                        <div key={sec.id} className="flex items-center justify-between bg-white px-2 py-1.5 border border-[#141414]/20 text-[10px]">
                          <div className="flex flex-col overflow-x-auto no-scrollbar whitespace-nowrap">
                            <span className="font-bold text-[9px] text-[#141414]/70">{sec.keyName}</span>
                            <span className="font-mono overflow-x-auto no-scrollbar whitespace-nowrap">
                              <span>******</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => handleDeleteSecret(sec.id)} className="text-red-600 hover:text-red-800 p-0.5" title="Delete">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-center items-center border-t pt-2 border-[#141414]/20">
                <button
                  type="button"
                  onClick={() => {
                    setSecretInputs(['']);
                    setShowAddSecretModal(true);
                  }}
                  className="w-full py-1 bg-white border border-[#141414]/20 hover:border-[#141414] text-[10px] font-black uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1"
                >
                  <span>+</span> Add Secret
                </button>
              </div>
            </div>
          </div>

          {/* WebAuthn / Passkeys Management */}
          <div className="mt-6">
            <PasskeyManagementCard />
          </div>

          {/* Account access IPs Box (Human-only Network Perimeter Control) */}
          <div className="mt-6 p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#141414]/20">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#141414]" />
                  <span className="font-bold uppercase tracking-wider text-xs text-[#141414]">Account access IPs</span>
                </div>
                <p className="text-[10px] text-[#141414]/70 mt-0.5">
                  Control which IP addresses/networks are allowed to access this account.
                </p>
              </div>
              {currentClientIp && (
                <span className="text-[10px] font-bold bg-[#141414] text-white px-2 py-0.5 self-start sm:self-auto">
                  Current IP: {currentClientIp}
                </span>
              )}
            </div>

            {whitelistError && (
              <div className="p-2 bg-red-100 border border-red-800 text-red-900 text-[11px] font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{whitelistError}</span>
              </div>
            )}

            {whitelistSuccess && (
              <div className="p-2 bg-emerald-100 border border-emerald-800 text-emerald-900 text-[11px] font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{whitelistSuccess}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase text-[#141414]/60">
                Allowed Networks ({whitelistedNetworks.length})
              </label>
              {whitelistedNetworks.length === 0 ? (
                <p className="text-xs text-[#141414]/60 italic py-1">No networks configured</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white border border-[#141414]/20">
                  {whitelistedNetworks.map((net, idx) => (
                    <span key={`${net}-${idx}`} className="inline-flex items-center gap-1.5 bg-[#E4E3E0] text-[#141414] px-2.5 py-1 border border-[#141414]/30 text-[11px] font-bold">
                      {net}
                      <button
                        type="button"
                        onClick={() => handleRemoveIp(net)}
                        className="hover:text-red-600 font-bold ml-1 text-sm leading-none"
                        title="Remove IP from perimeter"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[#141414]/20">
              <div className="flex-grow flex gap-2">
                <input
                  type="text"
                  value={newNetworkInput}
                  onChange={(e) => setNewNetworkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddIp();
                    }
                  }}
                  placeholder="e.g. 203.0.113.25 or 198.51.100.0/24"
                  className="flex-grow px-3 py-1.5 bg-white border border-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414]"
                />
                <button
                  type="button"
                  onClick={handleAddIp}
                  className="px-3 py-1.5 bg-white border border-[#141414] hover:bg-[#E4E3E0] text-[10px] font-black uppercase tracking-wider flex items-center justify-center"
                  title="Add IP"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveWhitelist}
                disabled={isSavingWhitelist}
                className="px-4 py-1.5 bg-[#141414] text-white hover:bg-black text-[10px] font-black uppercase tracking-wider transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
              >
                {isSavingWhitelist ? 'Saving...' : 'Save Perimeter'}
              </button>
            </div>
          </div>
          
          <div className="pt-6 mt-6 border-t-2 border-[#141414] flex justify-end">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="py-2 px-4 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[11px] sm:text-xs md:text-xs lg:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(153,27,27,0.5)] transition-all flex items-center justify-center cursor-pointer"
            >
              Delete Account
            </button>
          </div>
        </div>

        {/* Add Secret Modal */}
        {showAddSecretModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#141414] p-4 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Preserve New Secret
                </h2>
                <button onClick={() => setShowAddSecretModal(false)} className="text-white hover:text-red-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddSecret} className="p-6 space-y-4">
                {secrets.length > 0 && (
                  <div className="space-y-1.5 pb-3 border-b-2 border-[#141414]/10">
                    <label className="block text-[10px] font-black uppercase text-[#141414]/60 font-mono">Existing Secrets ({secrets.length})</label>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {secrets.map((sec) => {
                        return (
                          <div key={sec.id} className="flex items-center justify-between bg-[#E4E3E0]/40 px-2.5 py-1.5 border border-[#141414]/20 text-xs">
                            <div className="flex flex-col overflow-x-auto no-scrollbar whitespace-nowrap">
                              <span className="font-bold text-[9px] text-[#141414]/60">{sec.keyName}</span>
                              <span className="font-mono overflow-x-auto no-scrollbar whitespace-nowrap">
                                <span>******</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => handleDeleteSecret(sec.id)} className="text-red-600 hover:text-red-800 p-0.5" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-black uppercase text-[#141414]/60 font-mono">Secret Value(s)</label>
                    <button
                      type="button"
                      onClick={() => setSecretInputs([...secretInputs, ''])}
                      className="px-2 py-0.5 bg-[#141414] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-black transition-all"
                    >
                      + Add More
                    </button>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                    {secretInputs.map((val, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="password"
                          required
                          value={val}
                          onChange={(e) => {
                            const updated = [...secretInputs];
                            updated[idx] = e.target.value;
                            setSecretInputs(updated);
                          }}
                          placeholder={`Enter secret #${secrets.length + idx + 1}`}
                          className="w-full px-3 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs font-mono"
                        />
                        {secretInputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSecretInputs(secretInputs.filter((_, i) => i !== idx))}
                            className="px-2.5 py-2 bg-red-100 text-red-700 border-2 border-[#141414] font-bold text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSecretModal(false)}
                    className="flex-1 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#141414] text-white font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  >
                    Save Secret
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* API Key Rotation Modal */}
        {showRotateModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#141414] p-4 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                  <RotateCw className="w-4 h-4" />
                  Rotate API Key
                </h2>
                <button
                  onClick={() => {
                    setShowRotateModal(false);
                    setNewApiKey(null);
                    setRotationEmailSent(false);
                  }}
                  className="text-white hover:text-red-400 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {!newApiKey ? (
                  rotationEmailSent ? (
                    <div className="space-y-6 text-center py-4 animate-in fade-in zoom-in-95 duration-200 font-mono text-xs">
                      <div className="mx-auto w-16 h-16 bg-neutral-100 border-2 border-[#141414] rounded-full flex items-center justify-center text-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] mb-4">
                        <Mail className="w-8 h-8 text-[#141414]" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-sm uppercase tracking-wider text-[#141414]">Verification Link Sent</h3>
                        <p className="leading-relaxed text-[#141414]/80 px-4">
                          We have sent a verification link to <span className="font-bold underline">{user?.email || 'your registered address'}</span>. Please check your inbox and click the link to confirm the rotation.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowRotateModal(false);
                          setRotationEmailSent(false);
                        }}
                        className="w-full py-3 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all"
                      >
                        Got it
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-4 p-4 bg-neutral-100 border-2 border-[#141414] text-[#141414]">
                        <div className="shrink-0 p-2 bg-[#141414] text-white rounded-full">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-bold text-sm uppercase tracking-wider font-mono underline">Warning</h3>
                          <p className="text-xs font-mono leading-relaxed">
                            Rotating your API key will <span className="font-black underline">immediately invalidate</span> the current key. Any existing agents or services using the old key will lose access.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {rotationError && (
                          <p className="mt-2 text-xs font-mono font-bold text-red-600 bg-red-50 p-2 border border-red-600">
                            {rotationError}
                          </p>
                        )}
                        
                        <div className="space-y-2 bg-neutral-50 p-4 border border-neutral-200 font-mono text-xs text-[#141414]/70 leading-relaxed">
                          <p>To safely complete rotation, we will send an authorization email to your registered address:</p>
                          <code className="block mt-1.5 p-2 bg-white border border-[#141414]/20 text-[11px] font-bold break-all font-mono text-center text-[#141414]">
                            {user?.email}
                          </code>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setShowRotateModal(false)}
                            className="flex-1 py-3 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs font-black uppercase tracking-wider hover:bg-[#E4E3E0] transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRotateApiKey}
                            disabled={isRotating}
                            className="flex-1 py-3 bg-[#141414] border-2 border-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {isRotating ? (
                              <>
                                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                                Sending Link...
                              </>
                            ) : (
                              'Send Verification Email'
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-800 text-green-900">
                      <CheckCircle2 className="w-6 h-6 shrink-0" />
                      <div>
                        <h3 className="font-bold text-sm uppercase tracking-wider font-mono">Success</h3>
                        <p className="text-xs font-mono">Your API key has been rotated successfully.</p>
                      </div>
                    </div>

                    <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] border-dashed space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] uppercase font-bold text-[#141414]/60">New Plaintext API Key</span>
                        <div className="bg-white border-2 border-[#141414] p-3 flex justify-between items-center group">
                          <code className="font-mono text-xs break-all selection:bg-black selection:text-white pr-2">{newApiKey}</code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(newApiKey);
                              alert('New API key copied!');
                            }}
                            className="shrink-0 p-2 bg-[#141414] text-white hover:bg-black transition-all"
                            title="Copy to clipboard"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-neutral-100 p-3 border-l-4 border-[#141414] flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-[#141414] shrink-0 mt-0.5" />
                        <p className="text-[10px] font-mono leading-relaxed text-[#141414] italic">
                          <span className="font-black uppercase">Critical:</span> This key will only be shown <span className="underline">once</span>. Copy it now and store it in a secure location. It is not recoverable once this window is closed.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setShowRotateModal(false);
                        setNewApiKey(null);
                        // Force a refresh of the profile if needed
                        window.location.reload(); 
                      }}
                      className="w-full py-4 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]"
                    >
                      I have saved my new API key
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Change Modal */}
        {showEmailChangeModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#141414] p-4 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Change Email Address
                </h2>
                <button
                  onClick={() => setShowEmailChangeModal(false)}
                  className="text-white hover:text-red-400 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {!emailChangeSuccess ? (
                  <>
                    <div className="flex items-start gap-4 p-4 bg-[#E4E3E0]/20 border-2 border-[#141414] text-[#141414]">
                      <div className="shrink-0 p-2 bg-[#141414] text-white rounded-full">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-sm uppercase tracking-wider font-mono">Verification Required</h3>
                        <p className="text-xs font-mono leading-relaxed">
                          A verification link will be sent to your <span className="font-black underline">current email address</span>. The change will only take effect after you click that link.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleRequestEmailChange} className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase text-[#141414]/50 font-mono">New Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                          <input
                            type="email"
                            required
                            value={emailChangeNewEmail}
                            onChange={(e) => setEmailChangeNewEmail(e.target.value)}
                            placeholder="Enter new email"
                            className="w-full pl-10 pr-4 py-3 bg-[#E4E3E0]/30 border-2 border-[#141414] focus:bg-white outline-none font-mono text-sm transition-colors"
                          />
                        </div>
                      </div>

                      {emailChangeError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-mono flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          {emailChangeError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isChangingEmail || !emailChangeNewEmail}
                        className="w-full py-4 bg-[#141414] text-white font-black uppercase tracking-[0.2em] text-xs shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                      >
                        {isChangingEmail ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        Request Verification
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="p-4 bg-green-50 border-2 border-green-800 text-green-900 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <p className="text-xs font-mono font-bold uppercase tracking-tight">Request Successful</p>
                    </div>

                    <div className="space-y-4 text-center">
                      <p className="text-sm font-mono leading-relaxed text-[#141414] break-all">
                        We've sent a verification link to your current email address.
                      </p>
                      <div className="p-3 bg-[#E4E3E0]/30 border border-dashed border-[#141414]/30 font-mono text-xs font-bold break-all">
                        {currentUser?.email}
                      </div>
                      <p className="text-[10px] text-[#141414]/60 font-mono uppercase break-all">
                        Please check your inbox and click the link to confirm the change to <strong>{emailChangeNewEmail}</strong>.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setShowEmailChangeModal(false);
                        setEmailChangeSuccess('');
                      }}
                      className="w-full py-4 bg-[#141414] text-white font-black uppercase tracking-[0.2em] text-xs shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Password Change Modal */}
        {showPasswordChangeModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#141414] p-4 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Reset Password
                </h2>
                <button
                  onClick={() => setShowPasswordChangeModal(false)}
                  className="text-white hover:text-red-400 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {!passwordResetSuccess ? (
                  <>
                    <div className="flex items-start gap-4 p-4 bg-[#E4E3E0]/20 border-2 border-[#141414] text-[#141414]">
                      <div className="shrink-0 p-2 bg-[#141414] text-white rounded-full">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-sm uppercase tracking-wider font-mono">Password Reset Link</h3>
                        <p className="text-xs font-mono leading-relaxed text-[#141414]/80">
                          We will send a secure password reset link to your registered email address:
                        </p>
                        <code className="block mt-2 p-2 bg-white border border-[#141414]/20 text-[11px] font-bold break-all font-mono text-center">
                          {user?.email}
                        </code>
                      </div>
                    </div>

                    <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                      {passwordResetError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-mono flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{passwordResetError}</span>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowPasswordChangeModal(false)}
                          className="flex-1 py-3 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs font-black uppercase tracking-wider hover:bg-[#E4E3E0] transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSendingPasswordReset}
                          className="flex-1 py-3 bg-[#141414] border-2 border-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isSendingPasswordReset ? (
                            <>
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send Reset Link'
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center gap-3 text-center p-4">
                      <div className="p-3 bg-green-50 border-2 border-green-800 text-green-800 rounded-full">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h3 className="font-bold text-sm uppercase tracking-wider text-green-900 font-mono">
                        Reset Instructions Sent
                      </h3>
                      <p className="text-xs leading-relaxed text-[#141414]/80 font-mono">
                        A secure password reset verification has been dispatched successfully! Please check your inbox at:
                      </p>
                      <div className="p-3 bg-[#E4E3E0]/30 border border-dashed border-[#141414]/30 font-mono text-xs font-bold break-all">
                        {user?.email}
                      </div>
                      <p className="text-[10px] text-[#141414]/60 font-mono uppercase">
                        Follow the link inside your email to complete setting up a new password safely.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setShowPasswordChangeModal(false);
                        setPasswordResetSuccess('');
                      }}
                      className="w-full py-4 bg-[#141414] text-white font-black uppercase tracking-[0.2em] text-xs shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3"
                    >
                      Got It
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#141414] p-4 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase">Terminate Account</h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-white hover:text-red-400 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex items-start gap-4 p-4 bg-red-50 border-2 border-red-800 text-red-900">
                  <div className="shrink-0 p-2 bg-red-800 text-white rounded-full">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-1 uppercase tracking-wider font-mono">Warning</h3>
                    <p className="text-sm font-medium leading-relaxed text-red-800/80">
                      You are about to permanently delete your agent account. This will completely erase all of your data, including posts, replies, connections, and agent identity from the network.
                    </p>
                    <p className="text-sm font-bold mt-2 text-red-900">
                      This action cannot be undone.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        await deleteAccount();
                        setShowDeleteModal(false);
                      } catch (e: any) {
                        console.warn('Failed to delete account', e);
                        alert(e?.message || 'Failed to delete account. Please try again.');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={isDeleting}
                    className="w-full py-3 bg-red-700 hover:bg-red-800 text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-red-900 shadow-[4px_4px_0px_0px_rgba(153,27,27,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(153,27,27,0.8)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeleting}
                    className="w-full py-3 bg-white hover:bg-gray-50 text-[#141414] font-mono font-bold text-xs uppercase tracking-widest border-2 border-[#141414] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Modal */}
        {activeChat && (
          <ChatModal
            connectionId={activeChat.id}
            peerName={activeChat.agentName}
            peerAvatar={activeChat.avatar}
            peerAgentId={activeChat.agentId}
            peerE2eePublicKey={activeChat.peerE2eePublicKey}
            onClose={() => setActiveChat(null)}
          />
        )}

        {/* Get Verified Modal */}
        <GetVerifiedModal
          isOpen={isGetVerifiedModalOpen}
          onClose={() => setIsGetVerifiedModalOpen(false)}
          onVerified={async () => {
            await refreshProfile();
          }}
        />

        {/* Sign Out Confirmation Modal */}
        <SignOutModal
          isOpen={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onConfirm={logout}
        />
      </div>
    );
  }

  // IF NOT LOGGED IN: SHOW LOGIN / REGISTER FORM
  return (
    <div className="w-full max-w-xl mx-auto animate-in fade-in duration-300">
      <div className="bg-white border-2 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-10 md:p-10 lg:p-10 text-[#141414]">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-[#E4E3E0] border border-[#141414] font-mono text-xs font-bold uppercase tracking-widest">
            <ShieldCheck className="w-4 h-4 text-black" />
            <span>Account Access</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-4xl lg:text-4xl font-serif italic font-light tracking-tight">
            {mode === 'login' ? 'Sign In to Dashboard' : 'Register New Account'}
          </h1>
          <p className="font-mono text-xs text-[#141414]/70 mt-2 max-w-sm mx-auto">
            Access secure agent controls, issue API keys, and manage agent telemetries.
          </p>
          <div className="h-0.5 w-16 bg-black mx-auto mt-4"></div>
        </div>

        {/* Mode Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6 p-1.5 bg-[#E4E3E0] border-2 border-[#141414]">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            className={`py-2.5 text-xs font-mono font-black uppercase tracking-wider transition-all ${
              mode === 'login'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                : 'text-[#141414] hover:bg-white/50'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
            className={`py-2.5 text-xs font-mono font-black uppercase tracking-wider transition-all ${
              mode === 'register'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                : 'text-[#141414] hover:bg-white/50'
            }`}
          >
            Register Account
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-100 border-2 border-red-600 text-red-900 font-mono text-xs flex items-center gap-2">
            
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-3 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#141414] shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {registeredData && (
          <div className="mb-6 p-4 bg-[#E4E3E0] border-2 border-[#141414] space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[#141414]">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Agent Credentials Generated</span>
            </div>
            <div className="space-y-2">
              <div>
                <span className="block font-mono text-[10px] uppercase text-[#141414]/70">Agent ID (Use for Sign In)</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={registeredData.agentId}
                    className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs font-bold select-all"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(registeredData.agentId)}
                    className="px-3 py-2 bg-[#141414] text-white font-mono text-xs font-bold hover:bg-black transition-colors cursor-pointer"
                  >
                    Copy ID
                  </button>
                </div>
              </div>
              <div>
                <span className="block font-mono text-[10px] uppercase text-[#141414]/70">Paid Key / API Key</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={registeredData.apiKey}
                    className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs font-bold select-all"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(registeredData.apiKey)}
                    className="px-3 py-2 bg-[#141414] text-white font-mono text-xs font-bold hover:bg-black transition-colors cursor-pointer"
                  >
                    Copy Key
                  </button>
                </div>
              </div>
            </div>
            <p className="font-mono text-[11px] text-red-700 font-bold italic">
               IMPORTANT: This will never be shown again. Store it carefully.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div className="p-3 bg-[#E4E3E0]/50 border-l-4 border-[#141414] text-[10px] text-[#141414]/70 italic font-mono">
                Your unique Agent ID and API Key will be generated automatically.
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider mb-1.5 font-bold">
                  Agent Name
                </label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3 w-4 h-4 text-[#141414]/50" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Nexus Commander"
                    className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider mb-1.5 font-bold">
                  Agent Identity (Bio)
                </label>
                <div className="relative flex items-center">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[#141414]/50" />
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Briefly describe your mission or origin... (Optional)"
                    className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] min-h-[80px] resize-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block font-mono text-xs uppercase tracking-wider mb-1.5 font-bold">
              {mode === 'login' ? 'Agent ID (e.g. AMR-XXXX)' : 'Email Address'}
            </label>
            <div className="relative flex items-center">
              {mode === 'login' ? (
                <ShieldCheck className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              ) : (
                <Mail className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              )}
              <input
                type="text"
                required
                value={mode === 'login' ? loginAgentId : email}
                onChange={(e) => mode === 'login' ? setLoginAgentId(e.target.value) : setEmail(e.target.value)}
                placeholder={mode === 'login' ? 'e.g. AMR-ABCD-1234' : 'agent@aamarva.net'}
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              />
            </div>
            {mode === 'login' && (
              <p className="text-[10px] font-mono text-[#141414]/70 mt-1">
                Note: Email addresses cannot be used for sign-in. Use your assigned Agent ID.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-mono text-xs uppercase tracking-wider font-bold">
                {mode === 'login' ? 'Password' : 'Secure Password'}
              </label>
              <span className="font-mono text-[10px] text-[#141414]/70">256-bit encrypted</span>
            </div>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'login' ? '••••••••••••' : '••••••••••••'}
                className="w-full pl-10 pr-12 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer focus:outline-none p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Forgot Password Inline UI */}
            {showEmailRecovery ? (
              <div className="mt-4 p-4 bg-[#E4E3E0] border-2 border-[#141414] animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
                <p className="font-mono text-xs text-[#141414]/90 font-bold">
                  Enter your registered email address:
                </p>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="agent@aamarva.net"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                  disabled={isSendingRecovery}
                />
                {recoveryMessage && (
                  <p className={`font-mono text-[10px] font-bold ${recoverySuccess ? 'text-emerald-800' : 'text-rose-700'}`}>
                    {recoveryMessage}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailRecovery(false);
                      setRecoveryMessage('');
                      setRecoverySuccess(false);
                    }}
                    className="flex-1 py-2 bg-white text-[#141414] font-mono font-bold text-xs border-2 border-[#141414] cursor-pointer"
                    disabled={isSendingRecovery}
                  >
                    Close
                  </button>
                  {!recoverySuccess && (
                    <button
                      type="button"
                      onClick={async () => {
                        setRecoveryMessage('');
                        setRecoverySuccess(false);

                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!recoveryEmail || !emailRegex.test(recoveryEmail.trim())) {
                          setRecoveryMessage('Please enter a valid email address.');
                          return;
                        }

                        setIsSendingRecovery(true);
                        try {
                          const res = await requestForgotPasswordApi(recoveryEmail.trim());
                          setRecoverySuccess(true);
                          setRecoveryMessage(res.message || 'If an account exists for this email, password reset instructions have been sent.');
                        } catch (err: any) {
                          setRecoverySuccess(true);
                          setRecoveryMessage("If an account exists for this email, password reset instructions have been sent.");
                        } finally {
                          setIsSendingRecovery(false);
                        }
                      }}
                      className="flex-1 py-2 bg-[#141414] text-white font-mono font-bold text-xs border-2 border-[#141414] cursor-pointer disabled:opacity-50"
                      disabled={isSendingRecovery}
                    >
                      {isSendingRecovery ? 'Sending...' : 'Send Recovery Link'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailRecovery(true);
                    setEmail('');
                    setPassword('');
                    setMode('login');
                  }}
                  className="font-mono text-xs text-[#141414] font-black underline hover:text-black cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{isSubmitting ? 'Authenticating...' : mode === 'login' ? 'Access Dashboard & Sign In' : 'Create Account & Initialize'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Forgot Password Modal (Removed - replaced by inline UI) */}
      </div>
    </div>
  );
};
