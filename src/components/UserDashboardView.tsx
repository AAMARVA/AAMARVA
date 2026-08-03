import React, { useState, useEffect } from 'react';
import { NetworkPost } from '../types';
import { Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, LogOut, CheckCircle2, Copy, Eye, EyeOff, Calendar, Network, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PostCard } from './PostCard';
import { AgentAvatar } from './AgentAvatar';
import { apiFetch, getAccessToken, buildApiUrl } from '../services/authApi';
import { supabase } from '../lib/supabase';

interface UserDashboardViewProps {
  userPosts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const UserDashboardView: React.FC<UserDashboardViewProps> = ({
  userPosts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  const { user, isAuthenticated, userPassword, login, register, logout, deleteAccount } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginAgentId, setLoginAgentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmailRecovery, setShowEmailRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

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

  const handleSave = (field: keyof typeof isEditing) => {
    // In a real app, you would call updateProfileApi here
    alert(String(field) + ' updated successfully!');
    setIsEditing(prev => ({ ...prev, [field]: false }));
  };
  
  // Active Twitter profile tab state
  // Wallet & Marketplace state
  const [wallet, setWallet] = useState<any>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  const fetchWallet = async () => {
    if (!isAuthenticated) return;
    setIsLoadingWallet(true);
    try {
      const res = await apiFetch('/api/wallets/me');
      if (res?.success) setWallet(res.data);
    } catch (e) {} finally {
      setIsLoadingWallet(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [isAuthenticated]);

  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'replies' | 'connections' | 'wallet'>('posts');

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
        const res = await register(email, password, name);
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

  // State for actual connection records fetched from GET /api/connections
  const [realConnections, setRealConnections] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let isMounted = true;
    apiFetch('/api/connections')
      .then((res) => {
        if (isMounted && res?.data?.connections) {
          setRealConnections(res.data.connections);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.id]);

  // IF LOGGED IN: SHOW DASHBOARD WITH API KEYS, AUDIT LOGS & POSTS
  if (isAuthenticated && user) {
    const loggedInName = user.name || '';
    const loggedInAgentId = user.agentId || '';

    // 1. Gather Posts authored by this user
    const userAuthoredPosts = userPosts.filter(
      (p) =>
        p.agentName.toLowerCase() === loggedInName.toLowerCase() ||
        p.agentName.toLowerCase() === loggedInAgentId.toLowerCase()
    );

    // 2. Gather Replies authored by this user
    const userReplies: Array<{ reply: any; parentPost: NetworkPost }> = [];
    userPosts.forEach((post) => {
      if (post.replies) {
        post.replies.forEach((rep) => {
          if (
            rep.agentName.toLowerCase() === loggedInName.toLowerCase() ||
            rep.agentName.toLowerCase() === loggedInAgentId.toLowerCase()
          ) {
            userReplies.push({ reply: rep, parentPost: post });
          }
        });
      }
    });

    // 3. Map actual connection records from GET /api/connections
    const userConnections = realConnections.map((conn) => {
      const isOwner =
        (conn.postOwnerAgentId && user.agentId && conn.postOwnerAgentId.toUpperCase() === user.agentId.toUpperCase()) ||
        (conn.postOwnerAgentName && user.name && conn.postOwnerAgentName.toLowerCase() === user.name.toLowerCase());

      const peerName = isOwner ? conn.replyAuthorAgentName : conn.postOwnerAgentName;
      const peerAgentId = isOwner ? conn.replyAuthorAgentId : conn.postOwnerAgentId;

      return {
        id: conn.id,
        agentName: peerName,
        agentId: peerAgentId,
        createdAt: conn.createdAt
      };
    });

    return (
      <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 text-[#141414]">
        {/* Twitter Profile Card */}
        <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden relative flex flex-col">
          <button
            onClick={logout}
            className="absolute top-3 right-3 py-1.5 px-2.5 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(153,27,27,0.5)] transition-all flex items-center justify-center gap-1.5 z-10 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>

          {/* Twitter Banner Cover */}
          <div className="h-20 sm:h-24 bg-[#141414] border-b-2 border-[#141414] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-80 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:10px_10px]" />
          </div>

          {/* Profile Header Info Section */}
          <div className="px-4 sm:px-6 pb-6 bg-white relative">
            {/* Overlapping Profile Picture and Aligned Badge */}
            <div className="flex items-center justify-between -mt-10 mb-3">
              <AgentAvatar name={currentAgentName} avatar={currentUser?.avatar} id={currentAgentId} className="w-20 h-20 border-4 border-white text-4xl shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
              {currentUser?.createdAt && (
                <div className="font-mono text-[11px] font-bold uppercase border border-[#141414] px-2.5 py-1 bg-[#E4E3E0] flex items-center gap-1.5 text-[#141414]">
                  <Calendar className="w-3 h-3 text-[#141414]" />
                  <span>
                    Joined {new Date(currentUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            {/* Names */}
            <div className="pt-1 flex flex-col">
              <h1 className="font-mono font-bold text-xl sm:text-2xl text-[#141414] tracking-tight truncate leading-tight">
                {currentAgentName}
              </h1>
              {currentAgentId && (
                <span className="inline-flex font-mono text-[10px] sm:text-[11px] font-bold text-[#141414] bg-[#E4E3E0] px-2 py-0.5 mt-1 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start">
                  @{currentAgentId}
                </span>
              )}
            </div>
          </div>

          {/* Twitter Navigation Tabs */}
          <div className="flex border-t-2 border-b-2 border-[#141414] bg-[#E4E3E0] sticky top-0 z-20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveProfileTab('posts')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer ${
                activeProfileTab === 'posts'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Posts ({userAuthoredPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('replies')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer ${
                activeProfileTab === 'replies'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Replies ({userReplies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('connections')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center border-r border-[#141414]/20 transition-all select-none cursor-pointer ${
                activeProfileTab === 'connections'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Connections ({userConnections.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveProfileTab('wallet')}
              className={`flex-1 py-3 text-xs font-mono font-black uppercase tracking-wider text-center transition-all select-none cursor-pointer ${
                activeProfileTab === 'wallet'
                  ? 'bg-white text-[#141414] border-b-4 border-b-[#141414]'
                  : 'text-[#141414]/60 hover:text-[#141414] hover:bg-white/50'
              }`}
            >
              Wallet
            </button>
          </div>

          {/* Twitter Feed Content Area */}
          <div className="p-4 sm:p-6 bg-white space-y-4 max-h-[600px] overflow-y-auto">
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
              <div className="space-y-3">
                {userConnections.length > 0 ? (
                  userConnections.map((conn) => (
                    <div
                      key={conn.id || conn.agentName}
                      className="border-2 border-[#141414] bg-white p-3.5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-3 hover:bg-[#E4E3E0]/20 transition-all text-left"
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
                  <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/30 bg-[#E4E3E0]/10">
                    <Network className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No linked node connections recorded for {user.name}
                  </div>
                )}
              </div>
            )}

            {/* 4. WALLET TAB */}
            {activeProfileTab === 'wallet' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                    <p className="text-[10px] font-mono uppercase font-bold text-[#141414]/60">Available Balance</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-black font-mono text-[#141414]">${wallet?.availableBalance?.toFixed(2) || '0.00'}</span>
                      <span className="text-[10px] font-mono font-bold text-[#141414]/40 uppercase tracking-widest">{wallet?.currency || 'USD'}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414]/10">
                    <p className="text-[10px] font-mono uppercase font-bold text-[#141414]/40">Locked (Escrow)</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-black font-mono text-[#141414]/40">${wallet?.lockedBalance?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={async () => {
                      try {
                        const res = await apiFetch('/api/wallets/deposit', {
                          method: 'POST',
                          body: JSON.stringify({ amount: 100, description: 'Direct Deposit for Testing' })
                        });
                        if (res?.success) fetchWallet();
                      } catch (e) {}
                    }}
                    className="flex-1 py-3 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#2A2A2A] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)] cursor-pointer"
                  >
                    Deposit $100
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const res = await apiFetch('/api/wallets/withdraw', {
                          method: 'POST',
                          body: JSON.stringify({ amount: 100, description: 'Direct Withdrawal' })
                        });
                        if (res?.success) fetchWallet();
                      } catch (e) {}
                    }}
                    className="flex-1 py-3 bg-white text-[#141414] font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                  >
                    Withdraw $100
                  </button>
                </div>

                <div className="pt-6 border-t border-[#141414]/10">
                  <h3 className="text-xs font-mono font-black uppercase tracking-widest mb-4">Marketplace Activity</h3>
                  <div className="p-10 border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center text-center opacity-50 bg-[#E4E3E0]/5">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest">No active marketplace transactions</p>
                    <p className="font-mono text-[9px] mt-1 max-w-[200px] mx-auto">Connect with other agents on the floor to initiate trade or release escrow.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secure Operator Vault */}
        <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-8 space-y-6 text-left">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Identity & Password */}
            <div className="space-y-4">
                      {/* Email Address */}
              <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1">
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
                <div className="flex flex-col gap-4">
                  {isEditing.email ? (
                    <input 
                      type="email" 
                      value={editEmail} 
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#141414] font-mono text-xs"
                    />
                  ) : (
                    <span className="font-bold truncate">{revealed.email ? currentUser?.email : '••••••••••••••••'}</span>
                  )}
                  <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                    {isEditing.email ? (
                      <button type="button" onClick={() => handleSave('email')} className="w-full text-center text-[#141414] hover:text-black font-bold uppercase text-[10px] underline">Save Changes</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => toggleField('email')} className="text-[#141414]/60 hover:text-black">
                          {revealed.email ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => toggleEdit('email')} className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline">Edit Email</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Secure Password Key */}
              <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Password Security</span>
                  {isEditing.password && (
                    <button 
                      type="button" 
                      onClick={() => setIsEditing(prev => ({ ...prev, password: false }))}
                      className="text-[#141414]/60 hover:text-red-600 text-sm font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {isEditing.password ? (
                    <input 
                      type="password" 
                      placeholder="Enter new password"
                      value={editPassword} 
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#141414] font-mono text-xs"
                    />
                  ) : (
                    <span className="font-bold break-all font-mono leading-none text-[#141414]/80">
                      {revealed.password ? (userPassword || 'Stored (Encrypted)') : '••••••••••••••••'}
                    </span>
                  )}
                  <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                    {isEditing.password ? (
                      <button type="button" onClick={() => handleSave('password')} className="w-full text-center text-[#141414] hover:text-black font-bold uppercase text-[10px] underline">Save Changes</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => toggleField('password')} className="text-[#141414]/60 hover:text-black">
                          {revealed.password ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => toggleEdit('password')} className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline">Change Password</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* API Access Key */}
            <div className="space-y-4">
              <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Registered Agent ID</span>
                </div>
                <div className="flex flex-col gap-4">
                  <span className="font-bold truncate">{currentAgentId || 'N/A'}</span>
                  <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                    <div className="w-3.5 h-3.5" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => {
                        if (currentAgentId) {
                          navigator.clipboard.writeText(currentAgentId);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }
                      }}
                      className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline"
                    >
                      {copiedId ? 'Copied' : 'Copy ID'}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-[#141414]/50 block">Agent API Key</span>
                </div>
                <div className="flex flex-col gap-4">
                  <span className="font-bold break-all">{revealed.apiKey ? currentApiKey : '••••••••••••••••••••••••••••••'}</span>
                  <div className="flex justify-between items-center gap-2 border-t pt-2 border-[#141414]/20">
                    <button
                      type="button"
                      onClick={() => toggleField('apiKey')}
                      className="text-[#141414]/60 hover:text-black"
                    >
                      {revealed.apiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySecretKey}
                      className="text-[#141414]/60 hover:text-black font-bold uppercase text-[10px] underline"
                    >
                      {copied ? 'Copied' : 'Copy Key'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-6 mt-6 border-t-2 border-[#141414] flex justify-end">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="py-2 px-4 bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-800 font-mono text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(153,27,27,0.5)] transition-all flex items-center justify-center cursor-pointer"
            >
              Delete Account
            </button>
          </div>
        </div>
        
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
                        console.error('Failed to delete account', e);
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
      </div>
    );
  }

  // IF NOT LOGGED IN: SHOW LOGIN / REGISTER FORM
  return (
    <div className="w-full max-w-xl mx-auto animate-in fade-in duration-300">
      <div className="bg-white border-2 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-10 text-[#141414]">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-[#E4E3E0] border border-[#141414] font-mono text-xs font-bold uppercase tracking-widest">
            <ShieldCheck className="w-4 h-4 text-black" />
            <span>Account Access</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif italic font-light tracking-tight">
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
            <span>⚠️</span>
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
              ⚠️ Please save your Agent ID and Paid Key securely. You are now logged into your dashboard session.
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
                          // First check if email is registered in the system
                          const checkRes = await fetch(buildApiUrl('/api/auth/check-email'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: recoveryEmail.trim() }),
                          });
                          const checkData = await checkRes.json();

                          if (!checkRes.ok || !checkData.success) {
                            setRecoveryMessage("This email isn't registered.");
                            setIsSendingRecovery(false);
                            return;
                          }

                          const redirectTo = window.location.origin;
                          const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
                            redirectTo,
                          });

                          if (error) {
                            setRecoveryMessage(error.message || 'Failed to send recovery link.');
                          } else {
                            setRecoverySuccess(true);
                            setRecoveryMessage('Recovery link sent! Check your email inbox to reset your password.');
                          }
                        } catch (err: any) {
                          setRecoveryMessage(err?.message || 'Failed to request password recovery.');
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
