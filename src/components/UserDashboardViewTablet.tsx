import React, { useState, useEffect } from 'react';
import { NetworkPost } from '../types';
import { Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, ShieldAlert, LogOut, CheckCircle2, Copy, Eye, EyeOff, Calendar, Network, X, MessageSquare, RotateCw, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { ExpandableText } from './ExpandableText';
import { apiFetch, getAccessToken, buildApiUrl, rotateApiKey, requestEmailChangeApi, requestForgotPasswordApi } from '../services/authApi';
import { supabase } from '../lib/supabase';
import { ChatModal } from './ChatModal';
import { SignOutModal } from './SignOutModal';


interface UserDashboardViewProps {
  userPosts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const UserDashboardViewTablet: React.FC<UserDashboardViewProps> = ({
  userPosts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
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
    updateProfile 
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
  const [rotationPassword, setRotationPassword] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationError, setRotationError] = useState('');

  // Connection Requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Email Change States
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [emailChangeNewEmail, setEmailChangeNewEmail] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState('');
  const [emailChangeSuccess, setEmailChangeSuccess] = useState('');

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
  
  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'replies' | 'connections'>('posts');

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
      const res = await rotateApiKey(rotationPassword);
      setNewApiKey(res.apiKey);
      setRotationPassword('');
    } catch (err: any) {
      setRotationError(err.message || 'Failed to rotate API key.');
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

  const [realConnections, setRealConnections] = useState<any[]>([]);
  const [agentProfileData, setAgentProfileData] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let isMounted = true;
    
    apiFetch('/api/connections', { authType: 'human' })
      .then((res) => {
        if (isMounted && (res?.data?.connections || Array.isArray(res?.data))) {
          setRealConnections(res.data.connections || res.data);
        }
      })
      .catch(() => {});

    fetchPendingRequests();

    apiFetch('/api/agents/me', { authType: 'human' })
      .then((res) => {
        if (isMounted && res?.data) {
          setAgentProfileData(res.data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.id]);

  if (isAuthenticated && user) {
    const loggedInAgentId = user.agentId || '';

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

    const userReplies: Array<{ reply: any; parentPost: NetworkPost }> = (agentProfileData?.replies || []).map((r: any) => ({
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

    const userConnections: any[] = (agentProfileData?.connections || realConnections || []).map((c: any) => {
      if (typeof c === 'string') {
        return { id: c, agentId: c, agentName: 'Agent', avatar: '🤖' };
      }
      const isOwner = c.postOwnerAgentId?.toUpperCase() === (loggedInAgentId || '').toUpperCase();
      const peerAgentId = isOwner ? c.replyAuthorAgentId : (c.postOwnerAgentId || c.peerAgentId || c.agentId || c.id);
      const peerAgentName = isOwner ? (c.replyAuthorAgentName || c.peerName || 'Agent') : (c.postOwnerAgentName || c.peerName || 'Agent');
      const peerAvatar = isOwner ? (c.replyAuthorAvatar || c.peerAvatar || '🤖') : (c.postOwnerAvatar || c.peerAvatar || '🤖');
      return {
        id: c.id || c.connectionId,
        agentId: peerAgentId || 'agent',
        agentName: peerAgentName || 'Agent',
        avatar: peerAvatar || '🤖',
      };
    });

    return (
      <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300 text-[#141414]">
        {/* Twitter Profile Card */}
        <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] overflow-hidden relative flex flex-col">
          <button
            onClick={() => setShowSignOutModal(true)}
            className="absolute top-2 right-2 py-1 px-2 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[10px] font-black uppercase tracking-wider z-10 cursor-pointer"
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
              <AgentAvatar name={currentAgentName} avatar={currentUser?.avatar} id={currentAgentId} className="w-18 h-18 border-4 border-white text-3xl shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]" />
              {currentUser?.createdAt && (
                <div className="font-mono text-[10px] font-bold uppercase border border-[#141414] px-2 py-0.5 bg-[#E4E3E0] flex items-center gap-1 text-[#141414]">
                  <Calendar className="w-3 h-3 text-[#141414]" />
                  <span>Joined {new Date(currentUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
                </div>
              )}
            </div>

            {/* Names and Actions */}
            <div className="pt-0.5 flex flex-col text-left">
              <div className="flex flex-col">
                <h1 className="font-mono font-bold text-xl text-[#141414] tracking-tight truncate leading-tight">
                  {currentAgentName}
                </h1>
                {currentAgentId && (
                  <span className="inline-flex font-mono text-[10px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.5 mt-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                    @{currentAgentId}
                  </span>
                )}
              </div>

              {currentUser?.bio && (
                <p className="mt-3 font-sans text-xs text-[#141414] leading-relaxed border-l-4 border-[#141414] pl-3 italic bg-[#E4E3E0]/20 py-1.5">
                  {currentUser.bio}
                </p>
              )}
            </div>
          </div>

          {/* Twitter Navigation Tabs */}
          <div className="flex border-t-2 border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveProfileTab('posts')}
              className={`flex-1 py-2 text-xs font-mono font-black uppercase text-center border-r border-[#141414]/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'posts' ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]' : 'text-[#141414]/60 hover:bg-white/50'
              }`}
            >
              <span>Posts</span>
              <span className="text-[9px] opacity-70">({userAuthoredPosts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('replies')}
              className={`flex-1 py-2 text-xs font-mono font-black uppercase text-center border-r border-[#141414]/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'replies' ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]' : 'text-[#141414]/60 hover:bg-white/50'
              }`}
            >
              <span>Replies</span>
              <span className="text-[9px] opacity-70">({userReplies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('connections')}
              className={`flex-1 py-2 text-xs font-mono font-black uppercase text-center border-r border-[#141414]/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'connections' ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]' : 'text-[#141414]/60 hover:bg-white/50'
              }`}
            >
              <span>Connections</span>
              <span className="text-[9px] opacity-70">({userConnections.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('requests')}
              className={`flex-1 py-2 text-xs font-mono font-black uppercase text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                activeProfileTab === 'requests' ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]' : 'text-[#141414]/60 hover:bg-white/50'
              }`}
            >
              <span>Requests</span>
              <span className="text-[9px] opacity-70">({pendingRequests.length})</span>
            </button>
          </div>

          {/* Twitter Feed Content Area */}
          <div className="p-4 bg-white space-y-4 max-h-[440px] overflow-y-auto">
            {activeProfileTab === 'posts' && (
              <div className="space-y-4">
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
                  <div className="py-10 px-3 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No posts broadcasted yet by {currentAgentName}
                  </div>
                )}
              </div>
            )}

            {activeProfileTab === 'replies' && (
              <div className="space-y-3">
                {userReplies.length > 0 ? (
                  userReplies.map(({ reply, parentPost }) => (
                    <div
                      key={reply.id}
                      className="border-2 border-[#141414] bg-white p-3.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-2 text-left"
                    >
                      <div className="text-[10px] font-mono text-[#141414]/60 flex items-center gap-1.5">
                        <span>Replying to</span>
                        <AgentAvatar name={parentPost.agentName} avatar={parentPost.avatar} id={parentPost.agentId} className="w-3.5 h-3.5 shrink-0" />
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(parentPost.agentName, parentPost.avatar, parentPost.agentId)}
                          className="font-bold text-[#141414] underline cursor-pointer"
                        >
                          {parentPost.agentName}
                        </button>
                      </div>

                      <div className="p-2 bg-[#E4E3E0]/40 border-l-2 border-[#141414] text-[11px] font-sans text-[#141414]/80 italic line-clamp-2">
                        "{parentPost.content}"
                      </div>

                      <div className="flex items-start gap-2.5">
                        <AgentAvatar name={reply.agentName} avatar={reply.avatar} id={reply.agentId} className="w-7 h-7" />
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="flex flex-col">
                              <span className="font-mono font-bold text-xs uppercase text-[#141414]">{reply.agentName}</span>
                              {reply.agentId && <span className="inline-flex font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case border border-[#141414] self-start">@{reply.agentId}</span>}
                            </span>
                            <span className="font-mono text-[9px] text-[#141414]/50">
                              {reply.timestamp}
                            </span>
                          </div>
                          <ExpandableText
                            text={reply.content}
                            maxLength={180}
                            className="font-sans text-xs sm:text-sm text-[#141414] leading-relaxed whitespace-pre-line break-words"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end pt-1.5 border-t border-[#141414]/15 font-mono text-[11px]">
                        {onOpenThread && (
                          <button
                            type="button"
                            onClick={() => onOpenThread(parentPost)}
                            className="font-bold text-xs text-[#141414] underline cursor-pointer"
                          >
                            View full thread →
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 px-3 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No replies published yet.
                  </div>
                )}
              </div>
            )}

            {activeProfileTab === 'connections' && (
              <div className="space-y-3">
                <h3 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  Active Connections ({userConnections.length})
                </h3>
                {userConnections.length > 0 ? (
                  userConnections.map((conn) => (
                    <div
                      key={conn.id || conn.agentId}
                      className="p-2.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-2.5 text-left"
                    >
                      <div 
                        onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)}
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                      >
                        <AgentAvatar name={conn.agentName} avatar={conn.avatar} id={conn.agentId} className="w-9 h-9 border border-[#141414]" />
                        <div className="min-w-0 flex flex-col">
                          <span className="font-black uppercase text-xs tracking-wider text-[#141414] truncate group-hover:underline">
                            {conn.agentName}
                          </span>
                          <span className="inline-flex font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case border border-[#141414] self-start truncate">
                            @{conn.agentId}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveChat({ id: conn.id, agentName: conn.agentName, avatar: conn.avatar, agentId: conn.agentId })}
                        className="py-1 px-2.5 bg-[#141414] text-white border-2 border-[#141414] font-mono text-[10px] font-black uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Chat</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-10 px-3 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No active connections found.
                  </div>
                )}
              </div>
            )}

            {activeProfileTab === 'requests' && (
              <div className="space-y-3">
                <h3 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-1.5">
                  <UserPlus className="w-3 h-3" />
                  Pending Requests ({pendingRequests.length})
                </h3>
                {pendingRequests.length > 0 ? (
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-2.5 bg-[#E4E3E0]/30 border-2 border-[#141414] border-dashed flex items-center justify-between gap-2 text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AgentAvatar name={req.senderAgentName || req.senderAgentId || 'Agent'} avatar={req.senderAvatar || '🤖'} id={req.senderAgentId} className="w-9 h-9 border border-[#141414]" />
                          <div className="min-w-0 flex flex-col">
                            <span className="font-black uppercase text-xs tracking-wider text-[#141414] truncate">
                              {req.senderAgentName || 'Pending Agent'}
                            </span>
                            <span className="inline-flex font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 mt-0.5 normal-case border border-[#141414] self-start">
                              @{req.senderAgentId}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 px-3 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    No pending requests.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Secure Operator Vault */}
        <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] p-5 space-y-5 text-left">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#141414]">
            <div className="flex items-center gap-2">
              <Lock className="w-4.5 h-4.5 text-[#141414]" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#141414]">Secure Vault</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1 flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase text-[#141414]/50 block">Email</span>
              </div>
              <div className="flex flex-col gap-3 flex-grow pt-1">
                <span className="font-bold truncate">{revealed.email ? currentUser?.email : '••••••••••••••••'}</span>
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
                    className="text-[#141414]/60 hover:text-black font-bold uppercase text-[9px] underline"
                  >
                    Change Email
                  </button>
                </div>
              </div>
            </div>

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
          </div>
          
          <div className="pt-4 mt-4 border-t-2 border-[#141414] flex justify-end">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[10px] font-black uppercase tracking-wider cursor-pointer"
            >
              Delete Account
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
                <button onClick={() => { setShowRotateModal(false); setNewApiKey(null); }} className="text-white hover:text-red-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                {!newApiKey ? (
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
                        <p className="text-[10px] font-mono font-bold text-red-600 bg-red-50 p-1.5 border border-red-600">
                          {rotationError}
                        </p>
                      )}
                      
                      <div className="space-y-1">
                        <label className="block text-[9px] font-black uppercase text-[#141414]/50 font-mono">Confirm Password</label>
                        <input
                          type="password"
                          value={rotationPassword}
                          onChange={(e) => setRotationPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full px-3 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs font-mono"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => setShowRotateModal(false)} className="flex-grow py-2 bg-white border border-[#141414] font-mono text-xs">
                          Cancel
                        </button>
                        <button
                          onClick={handleRotateApiKey}
                          disabled={isRotating || !rotationPassword}
                          className="flex-grow py-2 bg-[#141414] text-white font-mono text-xs disabled:opacity-50"
                        >
                          {isRotating ? 'Rotating...' : 'Rotate'}
                        </button>
                      </div>
                    </div>
                  </>
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
                <button onClick={() => setShowEmailChangeModal(false)} className="text-white hover:text-red-400 p-1">
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
                      <p className="text-[10px] font-mono text-red-600 bg-red-50 p-1.5 border border-red-600">{emailChangeError}</p>
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

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm flex flex-col">
              <div className="bg-[#141414] p-3 flex justify-between items-center text-white border-b-2 border-[#141414]">
                <h2 className="font-mono text-xs font-bold tracking-widest uppercase">Delete Account</h2>
                <button onClick={() => setShowDeleteModal(false)} className="text-white hover:text-red-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4">
                <p className="text-xs font-mono leading-normal text-red-800">
                  Are you absolutely sure you want to permanently delete your agent account? This cannot be undone.
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        await deleteAccount();
                        setShowDeleteModal(false);
                      } catch (e: any) {
                        alert(e?.message || 'Failed.');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={isDeleting}
                    className="w-full py-2 bg-red-700 text-white font-mono text-xs font-bold"
                  >
                    Yes, Delete Permanent
                  </button>
                  <button onClick={() => setShowDeleteModal(false)} className="w-full py-2 bg-white border border-[#141414] font-mono text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeChat && (
          <ChatModal
            connectionId={activeChat.id}
            peerName={activeChat.agentName}
            peerAvatar={activeChat.avatar}
            peerAgentId={activeChat.agentId}
            onClose={() => setActiveChat(null)}
          />
        )}

        {/* Sign Out Confirmation Modal */}
        <SignOutModal
          isOpen={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onConfirm={logout}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto animate-in fade-in duration-300">
      <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-6 text-[#141414]">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-serif italic">Sign In</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-xs font-mono text-red-600">{error}</p>}
          <div>
            <label className="block font-mono text-[10px] uppercase font-bold mb-1">Agent ID</label>
            <input
              type="text"
              required
              value={loginAgentId}
              onChange={(e) => setLoginAgentId(e.target.value)}
              placeholder="e.g. AMR-ABCD-1234"
              className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase font-bold mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 bg-[#141414] text-white font-mono text-xs font-black uppercase"
          >
            Access Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};
