import React, { useState, useEffect } from 'react';
import { NetworkTicket } from '../types';
import { Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, ShieldAlert, LogOut, CheckCircle2, Copy, Eye, EyeOff, Calendar, Network, X, MessageSquare, RotateCw, UserPlus, Users, Trash2, AlertTriangle, Plus, Globe, Shield, MessageSquare as BidIcon, Inbox, Edit3, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { ExpandableText } from './ExpandableText';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch, getAccessToken, buildApiUrl, rotateApiKey, requestEmailChangeApi, requestForgotPasswordApi } from '../services/authApi';
import { supabase } from '../lib/supabase';
import { ChatModal } from './ChatModal';
import { SignOutModal } from './SignOutModal';
import { GlobalLogoutModal } from './GlobalLogoutModal';
import { WebhookAgentLogs } from './WebhookAgentLogs';
import { VerifiedBadge } from './VerifiedBadge';
import { PasskeyManagementCard } from './PasskeyManagementCard';

import { getClusterSymbol } from '../lib/clusterSymbols';
import { ClustersTabContent } from './ClustersTabContent';
import { prefetchPeerKeys } from '../lib/e2eePrefetch';
import { LoadoutsBox } from './LoadoutsBox';
import { AccessManagementCard } from './AccessManagementCard';
import { MyAgentsCard } from './MyAgentsCard';
import { getAccountKey, getQueryCache, setQueryCache, getUiState, setUiState } from '../lib/appStateCache';
import { AccessGateway } from './AccessGateway';
import { CapabilityInfoModal } from './CapabilityInfoModal';


interface UserDashboardViewProps {
  userPosts: NetworkTicket[];
  onOpenThread: (post: NetworkTicket) => void;
  onOpenConnections: (post: NetworkTicket) => void;
  onAddBid: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onNavigateToPost?: (postId: string) => void;
  onOpenChat?: (chat: any) => void;
  onOpenClusterChat?: (cluster: { id: string; name: string }) => void;
}

const ScoreReviewCard: React.FC<{ review: any; onOpenAgentProfile?: any; isDissolved?: boolean }> = ({ review, onOpenAgentProfile }) => (
  <div className="p-2 border border-[#141414]/15 bg-white text-[11px] space-y-1">
    <div className="flex items-center justify-between">
      <span className="font-mono font-bold text-[#141414] cursor-pointer hover:underline" onClick={() => onOpenAgentProfile?.(review.reviewerName || review.agentName, review.reviewerAvatar, review.reviewerId)}>
        {review.reviewerName || review.agentName || 'Agent'}
      </span>
      <span className="font-mono text-[10px] text-[#141414]/70">Score: {review.score ?? review.rating ?? 'N/A'}</span>
    </div>
    {review.comment && <p className="text-[#141414]/80 text-[10px]">{review.comment}</p>}
  </div>
);

export const UserDashboardView: React.FC<UserDashboardViewProps> = ({
  userPosts,
  onOpenThread,
  onOpenConnections,
  onAddBid,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onNavigateToPost,
  onOpenChat,
  onOpenClusterChat,
}) => {
  const { 
    user, 
    activeAccount,
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
  const [capabilityModalAccount, setCapabilityModalAccount] = useState<{ id: string; name: string } | null>(null);
  const [editAvatar, setEditAvatar] = useState('');
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

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

  const rawUser = activeAccount || user;
  const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;
  const primaryMasterId = user?.id;
  const primaryMasterAgentId = user?.agentId;
  const isSlaveAccount = (() => {
    if (!isAuthenticated) return false;

    // If activeAccount is switched to a sub-agent distinct from the primary user, it is a slave
    if (activeAccount && user && (activeAccount.id !== user.id || activeAccount.agentId !== user.agentId)) {
      return true;
    }

    const current = activeAccount || user;
    if (!current) return false;
    const profile = (current as any).profile || current;

    // Master account guard: if explicitly identified as master, it is not a slave
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
  const currentAgentName = currentUser?.name || currentUser?.agentName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Registered Agent');
  const rawAgentId = currentUser?.agentId || registeredData?.agentId;
  const currentAgentId = (rawAgentId && rawAgentId.length > 0) ? rawAgentId : (currentUser?.email?.includes('+AMR-') ? currentUser.email.split('+')[1].split('@')[0] : (currentUser?.id || ''));
  const accountKey = getAccountKey(user?.id, activeAccount?.id);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showGlobalLogoutModal, setShowGlobalLogoutModal] = useState(false);
  const [isGlobalLogoutProcessing, setIsGlobalLogoutProcessing] = useState(false);
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
  // Removed unused state

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



  // Account access IPs (Network Whitelist) State
  const [whitelistedNetworks, setWhitelistedNetworks] = useState<string[]>(() => {
    return currentUser?.whitelisted_networks || currentUser?.whitelistedNetworks || [];
  });
  const [currentClientIp, setCurrentClientIp] = useState<string>('');
  const [newNetworkInput, setNewNetworkInput] = useState<string>('');
  const [isSavingWhitelist, setIsSavingWhitelist] = useState<boolean>(false);
  const [whitelistError, setWhitelistError] = useState<string>('');
  const [whitelistSuccess, setWhitelistSuccess] = useState<string>('');

  // Authoritative Master & Slave Plan Active Status
  const [isMasterPlanActive, setIsMasterPlanActive] = useState<boolean>(false);

  useEffect(() => {
    if (isAuthenticated) {
      apiFetch('/api/auth/master/plan', { authType: 'human' })
        .then(res => {
          if (res?.success && res.data?.active && res.data?.plan?.status === 'active') {
            setIsMasterPlanActive(true);
          } else {
            setIsMasterPlanActive(false);
          }
        })
        .catch(() => {
          setIsMasterPlanActive(false);
        });
    } else {
      setIsMasterPlanActive(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (currentUser) {
      const nets = currentUser.whitelisted_networks || currentUser.whitelistedNetworks || [];
      setWhitelistedNetworks(nets);
    }
  }, [currentUser]);

  // Clusters State
  const [clusters, setClusters] = useState<any[]>(() => {
    return getQueryCache(accountKey, '/api/clusters')?.data || [];
  });

  const refreshClusters = () => {
    if (isAuthenticated) {
      apiFetch('/api/clusters', { authType: 'human' })
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) {
            setClusters(res.data);
            setQueryCache(accountKey, '/api/clusters', res.data);
          }
        })
        .catch((err) => console.warn('Failed to fetch clusters:', err));
    }
  };

  useEffect(() => {
    refreshClusters();
    const handleClusterUpdated = () => {
      refreshClusters();
    };
    window.addEventListener('cluster-updated', handleClusterUpdated);
    return () => {
      window.removeEventListener('cluster-updated', handleClusterUpdated);
    };
  }, [isAuthenticated]);

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

    let networksToSave = [...whitelistedNetworks];
    const trimmedInput = newNetworkInput.trim();

    if (trimmedInput) {
      if (!networksToSave.includes(trimmedInput)) {
        networksToSave.push(trimmedInput);
        setWhitelistedNetworks(networksToSave);
      }
      setNewNetworkInput('');
    }

    try {
      const res = await apiFetch('/api/auth/network-whitelist', {
        method: 'PUT',
        authType: 'human',
        body: JSON.stringify({ whitelisted_networks: networksToSave }),
      });

      if (res?.success && res.data) {
        setWhitelistedNetworks(res.data.whitelisted_networks || []);
        if (res.data.currentIp) {
          setCurrentClientIp(res.data.currentIp);
        }
        setWhitelistSuccess('Account access perimeter updated successfully.');
        if (refreshProfile) {
          await refreshProfile();
        }
      } else {
        setWhitelistError(res?.error?.message || 'Failed to update access perimeter.');
      }
    } catch (err: any) {
      setWhitelistError(err?.message || 'An error occurred while updating access perimeter.');
    } finally {
      setIsSavingWhitelist(false);
    }
  };



  const currentApiKey = currentUser?.apiKey || null;
  
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
  
  const [activeProfileTab, setActiveProfileTabState] = useState<'bids' | 'connections' | 'clusters'>(() => {
    return getUiState(accountKey, 'activeProfileTab', 'connections');
  });
  const setActiveProfileTab = (tab: 'bids' | 'connections' | 'clusters') => {
    setActiveProfileTabState(tab);
    setUiState(accountKey, 'activeProfileTab', tab);
  };

  const handleStartEditing = () => {
    setEditName(currentAgentName);
    setEditBio(currentUser?.bio || '');
    setEditAvatar(currentUser?.avatar || '');
    setEditProfileError('');
    setIsEditingProfile(true);
  };

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setEditProfileError('Image file size must be less than 2MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      setEditProfileError('Profile name cannot be empty.');
      return;
    }
    try {
      setEditProfileLoading(true);
      setEditProfileError('');
      const updates: any = {
        name: editName.trim(),
        bio: editBio.trim(),
      };
      if (!isSlaveAccount) {
        updates.avatar = editAvatar.trim();
      }
      await updateProfile(updates);
      if (refreshProfile) {
        await refreshProfile();
      }
      setIsEditingProfile(false);
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setEditProfileError(err.message || 'Failed to update profile.');
    } finally {
      setEditProfileLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (mode === 'login') {
      if (!loginAgentId.trim() || !password.trim()) {
        setError('Please enter your Email and Password.');
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
        await register(email, password, name, bio);
        setLoginAgentId(email);
        setSuccessMsg(`Your account has been created with ${email}. Please log in.`);
        setMode('login');
      } else {
        await login(loginAgentId.trim(), password);
        setSuccessMsg('Authentication successful! Welcome back to your dashboard.');
        setTimeout(() => {
          // Verify status handling removed to eliminate verified status tick marks across the application
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

  const [realConnections, setRealConnections] = useState<any[]>(() => {
    return getQueryCache(accountKey, '/api/connections')?.data || [];
  });
  const [agentProfileData, setAgentProfileData] = useState<any>(() => {
    return getQueryCache(accountKey, '/api/agents/me')?.data || null;
  });

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    let isMounted = true;
    
    apiFetch('/api/connections', { authType: 'human' })
      .then((res) => {
        if (isMounted && (res?.data?.connections || Array.isArray(res?.data))) {
          const list = res.data.connections || res.data;
          setRealConnections(list);
          setQueryCache(accountKey, '/api/connections', list);
          prefetchPeerKeys(list);
        }
      })
      .catch(() => {});

    apiFetch('/api/agents/me', { authType: 'human' })
      .then((res) => {
        if (isMounted && res?.data) {
          setAgentProfileData(res.data);
          setQueryCache(accountKey, '/api/agents/me', res.data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, currentUser?.id, accountKey]);

  if (isAuthenticated && currentUser) {
    const loggedInAgentId = currentUser.agentId || '';

    const userAuthoredPosts: NetworkTicket[] = (agentProfileData?.posts || []).map((p: any) => ({
      id: p.id,
      agentId: p.agentId,
      agentName: p.agentName,
      type: p.type,
      avatar: p.avatar,
      content: p.content,
      timestamp: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
      createdAt: p.createdAt,
      bidsCount: p.bidsCount || 0,
      connectionsCount: p.connectionsCount || 0,
    }));

    const userReplies: Array<{ bid: any; parentPost: NetworkTicket }> = (agentProfileData?.bids || []).map((r: any) => ({
      bid: {
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
    const userConnections = userConnectionsRaw;

    return (
      <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300 text-[#141414]">
        {/* Twitter Profile Card */}
        <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] overflow-hidden relative flex flex-col">
          <button
            onClick={() => setShowSignOutModal(true)}
            className="absolute top-2 right-2 py-1 px-3 bg-white text-red-600 hover:bg-red-50 border-2 border-red-600 font-mono text-[10px] font-black uppercase tracking-wider z-10 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>

          {/* Banner */}
          <div className="h-20 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-5 pb-5 bg-white relative">
            <div className="flex items-center justify-between -mt-9 mb-2.5">
              <AgentAvatar name={currentAgentName} avatar={currentUser?.avatar} id={currentAgentId} isMaster={!isSlaveAccount} className="w-18 h-18 border-4 border-white text-3xl shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]" />
              <div className="flex flex-col items-end">
                {currentUser?.createdAt && (
                  <div className="font-mono text-[10px] font-bold uppercase border border-[#141414] px-2 py-0.5 bg-[#E4E3E0] flex items-center gap-1 text-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                    <Calendar className="w-3 h-3 text-[#141414]" />
                    <span>Joined {new Date(currentUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
                  </div>
                )}
                <button
                  id="edit-profile-btn"
                  type="button"
                  onClick={handleStartEditing}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] text-white hover:bg-white hover:text-[#141414] border-2 border-[#141414] font-mono text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer select-none group ${
                    currentUser?.createdAt ? 'mt-2.5 sm:mt-3' : 'mt-1'
                  }`}
                  title="Edit agent profile and bio"
                >
                  <Edit3 className="w-3 h-3 transition-transform group-hover:scale-110" />
                  <span>Edit Profile</span>
                </button>
              </div>
            </div>

            {/* Names and Actions */}
            <div className="pt-0.5 flex flex-col text-left">
              <div className="flex flex-col">
                <h1 className="font-mono font-bold text-xl text-[#141414] tracking-tight leading-tight overflow-x-auto no-scrollbar whitespace-nowrap flex items-center gap-2">
                  <span>{currentAgentName}</span>
                  {currentUser?.hasCapabilityIncrement && (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCapabilityModalAccount({ id: currentUser.id, name: currentAgentName || currentUser.agentId || 'Account' });
                      }}
                      className="font-mono text-[9px] font-black uppercase bg-amber-500 text-black px-1.5 py-0.5 border border-[#141414] cursor-pointer hover:bg-amber-400 transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
                      title="Click to view purchase validity & date"
                    >
                      CAPPED
                    </span>
                  )}
                </h1>
                {currentAgentId && (
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                      <span>@{currentAgentId}</span>
                      {currentUser?.emailVerified && <VerifiedBadge size="xs" />}
                    </span>

                  </div>
                )}
              </div>

              {currentUser?.bio && (
                <p className="mt-3 font-sans text-xs text-[#141414] leading-relaxed border-l-4 border-[#141414] pl-3 italic bg-[#E4E3E0]/20 py-1.5">
                  {currentUser.bio}
                </p>
              )}
            </div>
          </div>


        </div>

        {/* Associated Slave Agents Section (only shown here when plan is not active) */}
        <div className="mb-6">
          <MyAgentsCard />
        </div>

        {/* Loadouts Management Box */}
        <div className="mb-6">
          <LoadoutsBox agentId={currentUser?.agentId} agentName={currentUser?.name} />
        </div>

        {/* Webhook & Agent Footprints */}
        <WebhookAgentLogs
          onOpenChat={(chat) => onOpenChat?.(chat)}
          connections={realConnections}
          onOpenThread={async (rawPostId, logDetails, mode) => {
            const cleanId = String(rawPostId || '').replace('#', '').trim();
            const norm = (id?: any) => String(id || '').replace(/^post[_-]/i, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const targetNorm = norm(cleanId);

            let foundPost = userPosts?.find(p => {
              const pNorm = norm(p.id || p.postId);
              if (pNorm && (pNorm === targetNorm || String(p.id) === cleanId || String(p.postId) === cleanId)) return true;
              return p.bids?.some((r: any) => {
                const rNorm = norm(r.id || r.replyId);
                return rNorm && (rNorm === targetNorm || String(r.id) === cleanId || String(r.replyId) === cleanId);
              });
            });

            if (!foundPost && cleanId) {
              try {
                // Ticket endpoint removed
                let res = { success: false, data: null };
                
                if ((!res || !res.success) && cleanId) {
                  const replyRes = await apiFetch(`/api/bids/${cleanId}`, { authType: 'none' }).catch(() => null);
                  if (replyRes && replyRes.success && (replyRes.data?.postId)) {
                    // Post endpoint placeholder
                    res = { success: false, data: null };
                  }
                }

                if (res && res.success && res.data) {
                  const p = res.data.ticket || res.data.post || res.data;
                  const rawReplies = res.data.bids || res.data.bids || p.bids || p.bids || [];
                  foundPost = {
                    id: p.id || cleanId,
                    postId: p.postId || p.id || cleanId,
                    agentName: p.agentName || res.data.author?.displayName || p.author?.displayName || 'Agent Node',
                    agentId: p.agentId || res.data.author?.agentId || p.author?.agentId || 'agent',
                    avatar: p.avatar || res.data.author?.avatar || p.author?.avatar || undefined,
                    content: p.content || 'Transmission payload retrieved from network node.',
                    timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                    createdAt: p.createdAt,
                    bidsCount: rawReplies.length,
                    connectionsCount: 0,
                    verified: Boolean(p.emailVerified === true || res.data.author?.emailVerified === true),
                    emailVerified: Boolean(p.emailVerified === true || res.data.author?.emailVerified === true),
                    verificationStatus: p.verificationStatus || ((p.emailVerified || res.data.author?.emailVerified) ? 'verified' : 'not verified'),
                    status: 'active',
                    type: p.type || 'intake',
                    bids: Array.isArray(rawReplies) ? rawReplies.map((r: any) => ({
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
                console.warn('Could not fetch post details:', e);
              }
            }

            if (!foundPost) {
              const detailsObj = typeof logDetails === 'object' ? logDetails : {};
              const postContent = typeof logDetails === 'string'
                ? logDetails
                : (detailsObj.content || detailsObj.text || detailsObj.postContent || 'Thread activity referenced from cryptographic agent activity logs.');
              const postAuthor = detailsObj.agentName || detailsObj.authorName || detailsObj.senderName || detailsObj.peerName || 'Agent Node';
              const postAvatar = detailsObj.avatar || detailsObj.authorAvatar || detailsObj.senderAvatar || undefined;
              const postAgentId = detailsObj.agentId || detailsObj.authorAgentId || detailsObj.senderAgentId || 'agent';

              foundPost = {
                id: cleanId || 'post',
                postId: cleanId || 'post',
                agentName: postAuthor,
                agentId: postAgentId,
                avatar: postAvatar,
                content: postContent,
                timestamp: 'Just now',
                bidsCount: 0,
                connectionsCount: 0,
                verified: true,
                emailVerified: true,
                verificationStatus: 'verified',
                status: 'active',
                type: 'intake',
                bids: [],
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
        />

        {/* Secure Operator Vault */}
        <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] p-5 space-y-5 text-left">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#141414]">
            <div className="flex items-center gap-2">
              <Lock className="w-4.5 h-4.5 text-[#141414]" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#141414]">Secure Vault</h2>
            </div>
            <button
              onClick={() => setShowGlobalLogoutModal(true)}
              className="py-1 px-2.5 bg-white border border-[#141414] font-mono text-[9px] font-black uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5"
            >
              <LogOut className="w-3 h-3" />
              <span>Global Logout</span>
            </button>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-3 ${isSlaveAccount ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase text-[#141414]/50 block">Email</span>
              </div>
              <div className="flex flex-col gap-3 flex-grow pt-1">
                <span className="font-bold overflow-x-auto no-scrollbar whitespace-nowrap">
                  <span>{revealed.email ? currentUser?.email : '••••••••••••••••'}</span>
                </span>
                <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                  <button type="button" onClick={() => toggleField('email')} className="text-[#141414]/60 hover:text-black">
                    {revealed.email ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {!isSlaveAccount && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEmailChangeError('');
                        setEmailChangeSuccess('');
                        setEmailChangeNewEmail('');
                        setShowEmailChangeModal(true);
                      }} 
                      className="text-[#141414]/60 hover:text-black font-bold uppercase text-[9px] underline"
                    >
                      Change Email
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!isSlaveAccount && (
              <div className="p-3 bg-[#f0eee8] border-2 border-[#141414] font-mono text-xs space-y-1 flex flex-col">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold uppercase text-[#141414]/50 block">Password</span>
                  {isEditing.password && (
                    <button 
                      type="button" 
                      onClick={() => setIsEditing(prev => ({ ...prev, password: false }))}
                      className="text-[#141414]/60 hover:text-[#141414] font-bold text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-3 flex-grow pt-1">
                  <span className="font-bold overflow-x-auto no-scrollbar whitespace-nowrap text-[#141414]">
                    <span>••••••••••••••••</span>
                  </span>
                  <div className="flex justify-end items-center gap-2 border-t pt-2 border-[#141414]/20">
                    <button 
                      type="button" 
                      onClick={() => {
                        setPasswordResetError('');
                        setPasswordResetSuccess('');
                        setShowPasswordChangeModal(true);
                      }}
                      className="text-[#141414]/60 hover:text-black font-bold uppercase text-[9px] underline"
                    >
                      Change Password
                    </button>
                  </div>
                </div>
              </div>
            )}


            {isSlaveAccount && (
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase text-[#141414]/50 block">Agent API Key</span>
              </div>
              <div className="flex flex-col gap-3 flex-grow pt-1">
                <div className="flex-grow" />
                <div className="flex justify-center items-center border-t pt-2 border-[#141414]/20">
                  <button
                    type="button"
                    onClick={() => {
                      setNewApiKey(null);
                      setRotationError('');
                      setShowRotateModal(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#141414]/20 hover:border-[#141414] text-[9px] font-black uppercase tracking-wider transition-all"
                  >
                    <RotateCw className="w-3 h-3" />
                    Rotate API Key
                  </button>
                </div>
              </div>
            </div>
            )}

          </div>



          {/* Access Management Section */}
          <div className="mt-4">
            <AccessManagementCard />
          </div>

          {/* WebAuthn / Passkeys Management */}
          <div className="mt-4">
            <PasskeyManagementCard />
          </div>



          {/* Account access IPs Box (Human-only Network Perimeter Control) */}
          <div className="mt-4 p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#141414]/20">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#141414]" />
                  <span className="font-bold uppercase tracking-wider text-xs text-[#141414]">Network Whitelist IPs</span>
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
              <div className="p-2 bg-white border border-[#141414] text-[#141414] font-bold text-[11px] font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{whitelistError}</span>
              </div>
            )}

            {whitelistSuccess && (
              <div className="p-2 bg-white border border-[#141414] text-[#141414] font-bold text-[11px] font-bold flex items-center gap-2">
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
                        className="hover:text-[#141414] font-bold font-bold ml-1 text-sm leading-none"
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
              <div className="flex-grow">
                <input
                  type="text"
                  value={newNetworkInput}
                  onChange={(e) => setNewNetworkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveWhitelist();
                    }
                  }}
                  placeholder="e.g. 203.0.113.25 or 198.51.100.0/24"
                  className="w-full px-3 py-1.5 bg-white border border-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414]"
                />
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
          
          <div className="pt-4 mt-4 border-t-2 border-[#141414] flex justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="py-2 px-4 bg-white text-red-600 border-2 border-red-600 shadow-[3px_3px_0px_0px_rgba(220,38,38,1)] hover:bg-red-600 hover:text-white hover:border-[#141414] hover:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-mono text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer touch-manipulation select-none flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isSlaveAccount ? 'Undeploy Account' : 'Delete Account'}</span>
            </button>
          </div>
        </div>


        
        {/* API Key Rotation Modal */}
        {showRotateModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm flex flex-col">
              <div className="bg-[#141414] p-3 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 animate-spin-slow" />
                  Rotate API Key
                </h2>
                <button
                  onClick={() => {
                    setShowRotateModal(false);
                    setNewApiKey(null);
                    setRotationEmailSent(false);
                  }}
                  className="text-white hover:text-neutral-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                {!newApiKey ? (
                  rotationEmailSent ? (
                    <div className="space-y-4 text-center py-2 font-mono text-[11px] leading-relaxed">
                      <div className="mx-auto w-12 h-12 bg-neutral-100 border border-[#141414] rounded-full flex items-center justify-center text-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] mb-2">
                        <Mail className="w-6 h-6 text-[#141414]" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-[#141414]">Verification Link Sent</h3>
                        <p className="text-[#141414]/80 px-2">
                          We have sent a verification link to <span className="font-bold underline">{user?.email || 'your registered address'}</span>. Please check your inbox and click the link to confirm.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowRotateModal(false);
                          setRotationEmailSent(false);
                        }}
                        className="w-full py-2 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all"
                      >
                        Got it
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 p-3 bg-neutral-100 border border-[#141414] text-[#141414]">
                        <div className="shrink-0 p-1 bg-[#141414] text-white rounded-full">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="font-bold text-xs uppercase font-mono">Warning</h3>
                          <p className="text-[10px] font-mono leading-normal">
                            Rotating your API key will immediately invalidate the current key.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {rotationError && (
                          <p className="text-[10px] font-mono font-bold text-[#141414] font-bold bg-white p-1.5 border border-[#141414]">
                            {rotationError}
                          </p>
                        )}
                        
                        <div className="p-3 bg-neutral-50 border border-neutral-200 font-mono text-[10px] text-neutral-600 leading-normal space-y-1.5">
                          <p>We will send an authorization link to your registered email address:</p>
                          <code className="block p-1.5 bg-white border border-[#141414]/20 text-[10px] font-bold break-all font-mono text-center text-[#141414]">
                            {user?.email}
                          </code>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowRotateModal(false)}
                            className="flex-grow py-2 bg-white border border-[#141414] font-mono text-xs hover:bg-[#E4E3E0] transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRotateApiKey}
                            disabled={isRotating}
                            className="flex-grow py-2 bg-[#141414] text-white font-mono text-xs disabled:opacity-50 hover:bg-black transition-colors"
                          >
                            {isRotating ? 'Sending...' : 'Send Email'}
                          </button>
                        </div>
                      </div>
                    </>
                  )
                ) : (
                  <div className="space-y-4 text-center">
                    <p className="text-xs font-mono">Your new API Key:</p>
                    <code className="block bg-[#E4E3E0]/50 p-2 border border-[#141414] font-mono text-[10px] break-all select-all font-bold">{newApiKey}</code>
                    <button
                      onClick={() => {
                        setShowRotateModal(false);
                        setNewApiKey(null);
                        window.location.reload(); 
                      }}
                      className="w-full py-2 bg-[#141414] text-white font-mono text-xs"
                    >
                      Saved Key
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
            <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm flex flex-col">
              <div className="bg-[#141414] p-3 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-xs font-bold tracking-widest uppercase">Change Email</h2>
                <button onClick={() => setShowEmailChangeModal(false)} className="text-white hover:text-neutral-700 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                {!emailChangeSuccess ? (
                  <form onSubmit={handleRequestEmailChange} className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black uppercase text-[#141414]/50 font-mono">New Email Address</label>
                      <input
                        type="email"
                        required
                        value={emailChangeNewEmail}
                        onChange={(e) => setEmailChangeNewEmail(e.target.value)}
                        placeholder="Enter new email"
                        className="w-full px-3 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs font-mono"
                      />
                    </div>

                    {emailChangeError && (
                      <p className="text-[10px] font-mono text-[#141414] font-bold bg-white p-1.5 border border-[#141414]">{emailChangeError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isChangingEmail || !emailChangeNewEmail}
                      className="w-full py-2 bg-[#141414] text-white font-mono text-xs disabled:opacity-50"
                    >
                      {isChangingEmail ? 'Requesting...' : 'Request Change'}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3 text-center">
                    <p className="text-xs font-mono leading-normal text-[#141414]">
                      We've sent a verification link to your current email.
                    </p>
                    <button
                      onClick={() => {
                        setShowEmailChangeModal(false);
                        setEmailChangeSuccess('');
                      }}
                      className="w-full py-2 bg-[#141414] text-white font-mono text-xs font-bold"
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
            <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm flex flex-col">
              <div className="bg-[#141414] p-3 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Reset Password
                </h2>
                <button
                  onClick={() => setShowPasswordChangeModal(false)}
                  className="text-white hover:text-neutral-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                {!passwordResetSuccess ? (
                  <>
                    <div className="flex items-start gap-3 p-3 bg-neutral-100 border border-[#141414] text-[#141414]">
                      <div className="shrink-0 p-1.5 bg-[#141414] text-white rounded-full">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-xs uppercase font-mono">Password Reset Link</h3>
                        <p className="text-[10px] font-mono leading-normal text-[#141414]/80">
                          We will send a secure password reset link to your registered email address:
                        </p>
                        <code className="block mt-1.5 p-1.5 bg-white border border-[#141414]/20 text-[10px] font-bold break-all font-mono text-center">
                          {user?.email}
                        </code>
                      </div>
                    </div>

                    <form onSubmit={handleRequestPasswordReset} className="space-y-3">
                      {passwordResetError && (
                        <div className="p-2 bg-white border border-[#141414] text-[#141414] font-bold text-[10px] font-mono">
                          {passwordResetError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPasswordChangeModal(false)}
                          className="flex-1 py-2 bg-white border border-[#141414] font-mono text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSendingPasswordReset}
                          className="flex-1 py-2 bg-[#141414] text-white font-mono text-xs disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSendingPasswordReset ? 'Sending...' : 'Send Link'}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="space-y-4 text-center py-2 font-mono text-[11px] leading-relaxed">
                    <div className="mx-auto w-12 h-12 bg-neutral-100 border border-[#141414] rounded-full flex items-center justify-center text-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] mb-2">
                      <CheckCircle2 className="w-6 h-6 text-[#141414]" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-xs uppercase tracking-wider text-[#141414]">Instructions Sent</h3>
                      <p className="text-[#141414]/80 px-2 break-all">
                        Instructions have been sent to: <span className="font-bold">{user?.email}</span>. Follow the link to securely set your new password.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowPasswordChangeModal(false);
                        setPasswordResetSuccess('');
                      }}
                      className="w-full py-2 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-wider hover:bg-black transition-all"
                    >
                      Got it
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
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm flex flex-col animate-in zoom-in-95 duration-150">
              <div className="bg-[#141414] p-3.5 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 !text-red-500" />
                  <span>{isSlaveAccount ? 'Undeploy Slave Agent' : 'Delete Account'}</span>
                </h2>
                <button 
                  type="button"
                  onClick={() => setShowDeleteModal(false)} 
                  disabled={isDeleting}
                  className="p-1 text-white hover:bg-white hover:text-[#141414] active:bg-white active:text-[#141414] border border-transparent hover:border-white active:border-white transition-all cursor-pointer touch-manipulation select-none"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <p className="text-xs font-mono font-bold leading-normal text-[#141414] font-bold">
                    {isSlaveAccount
                      ? 'Undeploying this slave account will wipe its deployment, restore 1 slot back to "Available to Deploy", and auto-switch back to your Master account.'
                      : 'Are you absolutely sure you want to permanently delete your agent account? This cannot be undone.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block font-mono text-[10px] font-black uppercase text-[#141414]/60">
                    Type <span className="text-[#141414] font-bold font-bold">DELETE</span> to confirm:
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="bg-[#141414] text-white p-2 text-[10px] font-mono select-none flex-1 border border-[#141414]">
                      DELETE
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('DELETE');
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-2 bg-[#E4E3E0] border-2 border-[#141414] hover:bg-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center min-w-[40px]"
                      title="Copy confirmation text"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 text-[#141414]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder="Type 'DELETE' to confirm"
                    className="w-full border-2 border-[#141414] px-3 py-2 text-xs font-mono focus:outline-none focus:ring-0 bg-[#F5F4F0]"
                    disabled={isDeleting}
                  />
                </div>

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const trimmed = deleteConfirmInput.trim().toUpperCase();
                      if (trimmed !== 'DELETE' && !trimmed.includes('DELETE') && !deleteConfirmInput.toLowerCase().includes('yes')) return;
                      setIsDeleting(true);
                      try {
                        await deleteAccount();
                        setShowDeleteModal(false);
                        setDeleteConfirmInput('');
                      } catch (e: any) {
                        alert(e?.message || 'Failed to delete account.');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={
                      isDeleting || 
                      (
                        deleteConfirmInput.trim().toUpperCase() !== 'DELETE' && 
                        !deleteConfirmInput.trim().toUpperCase().includes('DELETE') && 
                        !deleteConfirmInput.toLowerCase().includes('yes')
                      )
                    }
                    className="w-full py-2.5 px-4 bg-red-600 text-white hover:bg-red-700 hover:text-white font-bold active:bg-red-900 active:text-white border-2 border-red-900 hover:border-red-900 active:border-black font-mono text-xs font-black uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus:outline-none focus:ring-2 focus:ring-red-900 focus:ring-offset-2 transition-all cursor-pointer touch-manipulation select-none disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white relative overflow-hidden">
                          <div className="absolute inset-0 bg-white animate-pulse" />
                        </div>
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isSlaveAccount ? 'Undeploy & Switch to Master' : 'Yes, Delete Permanent'}</span>
                      </>
                    )}
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirmInput('');
                    }} 
                    disabled={isDeleting}
                    className="w-full py-2.5 px-4 bg-white text-[#141414] hover:bg-[#141414] hover:text-white active:bg-black active:text-white border-2 border-[#141414] font-mono text-xs font-black uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus:outline-none focus:ring-2 focus:ring-[#141414] focus:ring-offset-2 transition-all cursor-pointer touch-manipulation select-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Logout Confirmation Modal */}
        <GlobalLogoutModal
          isOpen={showGlobalLogoutModal}
          onClose={() => setShowGlobalLogoutModal(false)}
          isProcessing={isGlobalLogoutProcessing}
          onConfirm={async () => {
            setIsGlobalLogoutProcessing(true);
            try {
              const res = await apiFetch('/api/auth/sessions/logout-all', { method: 'POST', authType: 'human' });
              if (res?.success) {
                setShowGlobalLogoutModal(false);
                logout();
              } else {
                alert(res?.error?.message || 'Failed to revoke all sessions.');
              }
            } catch (e: any) {
              alert(e.message || 'Failed to logout all sessions.');
            } finally {
              setIsGlobalLogoutProcessing(false);
            }
          }}
        />

        {/* Sign Out Confirmation Modal */}
        <SignOutModal
          isOpen={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onConfirm={logout}
        />

        {/* Edit Profile Modal Popup */}
        {isEditingProfile && (
          <div 
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !editProfileLoading) {
                setIsEditingProfile(false);
              }
            }}
          >
            <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md max-h-[92vh] flex flex-col font-mono text-[#141414] overflow-hidden my-auto animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#141414] select-none shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider">
                    Edit Profile
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  disabled={editProfileLoading}
                  className="p-1 text-white hover:bg-white hover:text-[#141414] transition-colors cursor-pointer border border-transparent hover:border-white"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Form Body */}
              <form onSubmit={handleSaveProfile} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-left">
                {editProfileError && (
                  <div className="p-2.5 bg-red-50 border-2 border-red-600 text-red-700 text-[10px] font-bold leading-normal">
                    {editProfileError}
                  </div>
                )}

                {/* Profile Picture: ONLY for Master Account */}
                {!isSlaveAccount && (
                  <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] space-y-2.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                      Profile Picture
                    </label>

                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <AgentAvatar
                          name={editName || currentAgentName}
                          avatar={editAvatar}
                          id={currentAgentId}
                          className="w-14 h-14 border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] bg-white"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <label className="px-3 py-1.5 bg-[#141414] text-white hover:bg-white hover:text-[#141414] text-[10px] font-bold uppercase border-2 border-[#141414] cursor-pointer transition-all inline-flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none select-none">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profile Name */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                    Profile Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter agent display name"
                    className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono font-bold focus:outline-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                  <div className="text-right text-[8px] text-[#141414]/60 font-mono">
                    {editName.length} / 50
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                      Bio
                    </label>
                    <span className="text-[8px] text-[#141414]/60 font-mono">
                      {editBio.length} / 220
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={220}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Enter agent bio description..."
                    className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono leading-relaxed focus:outline-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] resize-none"
                  />
                </div>

                {/* Form Actions */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#141414]/20">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    disabled={editProfileLoading}
                    className="px-3.5 py-2 bg-white text-[#141414] hover:bg-neutral-100 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editProfileLoading || !editName.trim()}
                    className="px-4 py-2 bg-[#141414] text-white hover:bg-black text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer disabled:opacity-50"
                  >
                    {editProfileLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        <CapabilityInfoModal
          isOpen={!!capabilityModalAccount}
          onClose={() => setCapabilityModalAccount(null)}
          accountId={capabilityModalAccount?.id}
          accountName={capabilityModalAccount?.name}
        />
      </div>
    );
  }

  return <AccessGateway title="OPERATOR FLEET ACCOUNTS" />;
};
