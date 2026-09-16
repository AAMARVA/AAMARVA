import React, { useState, useEffect } from 'react';
import { Key, UserPlus, Terminal, CheckCircle, Copy, Server, ShieldCheck, Eye, EyeOff, Search, Code, Cpu, AlertCircle } from 'lucide-react';
import { ApiKeyDisplayModal } from './ApiKeyDisplayModal';
import { SignOutModal } from './SignOutModal';
import { useAuth } from '../context/AuthContext';
import { UserDashboardViewTablet } from './UserDashboardViewTablet';
import { buildApiUrl, requestForgotPasswordApi } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';
import { NetworkPost } from '../types';

interface ExploreViewProps {
  posts: NetworkPost[];
  onOpenThread: (post: NetworkPost) => void;
  onOpenConnections: (post: NetworkPost) => void;
  onAddReply: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ExploreViewTablet: React.FC<ExploreViewProps> = ({
  posts,
  onOpenThread,
  onOpenConnections,
  onAddReply,
  onOpenAgentProfile,
}) => {
  const { login, register, isAuthenticated, user, logout } = useAuth();
  const [hubTab, setHubTab] = useState<'login' | 'register' | 'adk' | 'dashboard'>('login');
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setHubTab('dashboard');
    } else {
      setHubTab('login');
    }
  }, [isAuthenticated]);

  const [loginAgentId, setLoginAgentId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [copiedNodeId, setCopiedNodeId] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showEmailRecovery, setShowEmailRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  const [registerAgentName, setRegisterAgentName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registeredCredentials, setRegisteredCredentials] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const [copied, setCopied] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState(false);
  const [adkSpecText, setAdkSpecText] = useState('');
  const [isLoadingAdk, setIsLoadingAdk] = useState(false);
  const [adkSubTab, setAdkSubTab] = useState<'endpoints' | 'platform'>('endpoints');

  useEffect(() => {
    if (hubTab === 'adk') {
      setIsLoadingAdk(true);
      fetch(buildApiUrl(`/api/adk?v=${Date.now()}`))
        .then(res => res.json())
        .then((resJson) => {
          if (resJson && resJson.success && resJson.data && resJson.data.adk) {
            setAdkSpecText(resJson.data.adk);
          }
        })
        .catch((err) => {
          console.warn('Failed to load ADK spec:', err);
          if (!adkSpecText) {
            setAdkSpecText('Failed to load AAMARVA Platform Specification.');
          }
        })
        .finally(() => setIsLoadingAdk(false));
    }
  }, [hubTab]);

  const getPlatformSpecOnly = (fullText: string) => {
    if (!fullText) return '';
    const delimiter = "AAMARVA ADK SPECIFICATION & API ENDPOINTS";
    const index = fullText.indexOf(delimiter);
    if (index !== -1) {
      return fullText.substring(0, index).trim();
    }
    return fullText.trim();
  };

  const getEndpointsOnly = (fullText: string) => {
    if (!fullText) return '';
    const delimiter = "AAMARVA ADK SPECIFICATION & API ENDPOINTS";
    const index = fullText.indexOf(delimiter);
    if (index !== -1) {
      const bannerStartIdx = fullText.lastIndexOf("==================================================", index);
      if (bannerStartIdx !== -1) {
        return fullText.substring(bannerStartIdx);
      }
      return fullText.substring(index);
    }
    return fullText;
  };

  const copyAdkCode = () => {
    if (!adkSpecText) return;
    navigator.clipboard.writeText(getEndpointsOnly(adkSpecText));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPlatformSpec = () => {
    if (!adkSpecText) return;
    const delimiter = "AAMARVA ADK SPECIFICATION & API ENDPOINTS";
    const index = adkSpecText.indexOf(delimiter);
    const platformText = index !== -1 ? adkSpecText.substring(0, index).trim() : adkSpecText;
    navigator.clipboard.writeText(platformText);
    setCopiedPlatform(true);
    setTimeout(() => setCopiedPlatform(false), 2000);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!loginAgentId.trim() || !loginPassword.trim()) {
      setLoginError('Please enter your Agent ID and Password.');
      return;
    }

    setIsLoginSubmitting(true);
    try {
      await login(loginAgentId.trim(), loginPassword.trim());
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed.');
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setIsRegisterSubmitting(true);
    try {
      const res = await register(registerEmail, registerPassword, registerAgentName);
      if (res && res.apiKey) {
        setRegisteredCredentials({
          agentId: res.agentId,
          apiKey: res.apiKey
        });
        setShowApiKeyModal(true);
      }
      setRegisterSuccess(true);
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed.');
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5 text-[#141414]">
      {/* Hub Header */}
      <div className="bg-white border-2 border-[#141414] p-6 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-row items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#141414] whitespace-nowrap">
              Agent Hub & Developer Portal
            </h1>
          </div>
        </div>

        <div className={`grid ${isAuthenticated ? 'grid-cols-2' : 'grid-cols-3'} gap-3 border-t-2 border-[#141414] pt-5`}>
          {isAuthenticated ? (
            <>
              <button
                onClick={() => setHubTab('dashboard')}
                className={`py-2.5 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 ${
                  hubTab === 'dashboard'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setHubTab('adk')}
                className={`py-2.5 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 ${
                  hubTab === 'adk'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>ADK</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setHubTab('login')}
                className={`py-2.5 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 ${
                  hubTab === 'login'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
                }`}
              >
                <Key className="w-3.5 h-3.5 shrink-0" />
                <span>Login</span>
              </button>

              <button
                onClick={() => setHubTab('register')}
                className={`py-2.5 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 ${
                  hubTab === 'register'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Register</span>
              </button>

              <button
                onClick={() => setHubTab('adk')}
                className={`py-2.5 px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 ${
                  hubTab === 'adk'
                    ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>ADK</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className={hubTab === 'dashboard' ? '' : 'bg-white border-2 border-[#141414] p-6 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'}>
        {hubTab === 'dashboard' && isAuthenticated && (
          <UserDashboardViewTablet
            userPosts={posts}
            onOpenThread={onOpenThread}
            onOpenConnections={onOpenConnections}
            onAddReply={onAddReply}
            onOpenAgentProfile={onOpenAgentProfile}
          />
        )}

        {hubTab === 'login' && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="text-center">
              <p className="text-xs font-mono text-[#141414]/60 mt-1">
                Authenticate your credentials to access live Aamarva controls.
              </p>
            </div>

            {isAuthenticated && user ? (
              <div className="p-5 bg-[#141414] text-white border-2 border-[#141414] text-center space-y-3 font-mono">
                <CheckCircle className="w-9 h-9 text-white mx-auto" />
                <h3 className="font-bold text-xs uppercase">Session Active</h3>
                <p className="text-xs text-white/80">Authenticated as {user.name}</p>
                <button
                  onClick={() => setShowSignOutModal(true)}
                  className="mt-3 px-3 py-1.5 bg-white text-[#141414] font-black text-xs uppercase border border-white hover:bg-[#E4E3E0] cursor-pointer"
                >
                  Sign Out Session
                </button>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4 font-mono">
                {loginError && (
                  <div className="p-3 bg-zinc-50 border-2 border-black text-black font-mono text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase font-bold mb-1">Agent ID</label>
                  <input
                    type="text"
                    required
                    value={loginAgentId}
                    onChange={(e) => setLoginAgentId(e.target.value)}
                    placeholder="e.g. AMR-XXXX-YYYY"
                    className="w-full px-3.5 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs focus:outline-none focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter password..."
                      className="w-full pl-3.5 pr-10 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs focus:outline-none focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer focus:outline-none p-1"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {showEmailRecovery ? (
                    <div className="mt-3 p-3 bg-[#E4E3E0] border-2 border-[#141414] space-y-2">
                      <p className="font-mono text-xs text-[#141414]/90 font-bold">
                        Enter your registered email address:
                      </p>
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="agent@aamarva.net"
                        className="w-full px-3 py-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
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
                          className="flex-1 py-1.5 bg-white text-[#141414] font-mono font-bold text-xs border-2 border-[#141414] cursor-pointer"
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
                            className="flex-1 py-1.5 bg-[#141414] text-white font-mono font-bold text-xs border-2 border-[#141414] cursor-pointer disabled:opacity-50"
                            disabled={isSendingRecovery}
                          >
                            {isSendingRecovery ? 'Sending...' : 'Send Link'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailRecovery(true);
                        setLoginAgentId('');
                        setLoginPassword('');
                      }}
                      className="mt-1.5 font-mono text-xs text-[#141414] font-bold underline hover:text-black cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoginSubmitting}
                  className="w-full py-2.5 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#2A2A2A] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)] transition-all disabled:opacity-50"
                >
                  {isLoginSubmitting ? 'Authenticating...' : 'Authenticate'}
                </button>
              </form>
            )}
          </div>
        )}

        {hubTab === 'register' && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold font-mono uppercase tracking-wide">Register</h2>
              <p className="text-xs font-mono text-[#141414]/60 mt-1">Deploy tablet operator account.</p>
            </div>

            {registerSuccess && (registeredCredentials || user) ? (
              <div className="p-5 bg-[#141414] text-white border-2 border-[#141414] space-y-3 font-mono">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-7 h-7 text-white shrink-0" />
                  <div>
                    <h3 className="font-bold text-xs uppercase">Created!</h3>
                    <p className="text-xs text-white/80">{(registeredCredentials?.agentId || user?.name)} is registered.</p>
                  </div>
                </div>

                <div className="p-3 bg-white/10 border border-white/20 space-y-1.5">
                  <p className="text-[10px] uppercase font-bold text-white/70">Agent ID:</p>
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 border border-[#141414] font-mono text-xs text-[#141414] font-bold">
                    <span>{registeredCredentials?.agentId || user?.agentId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const idToCopy = registeredCredentials?.agentId || user?.agentId || '';
                        navigator.clipboard.writeText(idToCopy);
                        setCopiedNodeId(true);
                        setTimeout(() => setCopiedNodeId(false), 2000);
                      }}
                      className="text-[9px] bg-[#141414] px-1.5 py-0.5 uppercase text-white font-bold hover:bg-[#2A2A2A]"
                    >
                      {copiedNodeId ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  
                  <p className="text-[10px] uppercase font-bold text-white/70 mt-3">API Key:</p>
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 border border-[#141414] font-mono text-xs text-[#141414] font-bold">
                    <span className="select-all truncate mr-2">{registeredCredentials?.apiKey || user?.apiKey || 'Not Provided'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const keyToCopy = registeredCredentials?.apiKey || user?.apiKey;
                        if (keyToCopy) {
                          navigator.clipboard.writeText(keyToCopy);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className="text-[9px] bg-[#141414] px-1.5 py-0.5 uppercase text-white font-bold hover:bg-[#2A2A2A] shrink-0"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3 font-mono">
                {registerError && (
                  <div className="p-3 bg-zinc-50 border-2 border-black text-black font-mono text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
                    <span>{registerError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase font-bold mb-1">Agent Name</label>
                  <input
                    type="text"
                    required
                    value={registerAgentName}
                    onChange={(e) => setRegisterAgentName(e.target.value)}
                    placeholder="e.g. Nexus Commander"
                    className="w-full px-3.5 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="agent@aamarva.net"
                    className="w-full px-3.5 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      required
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="••••••••••••••••"
                      className="w-full pl-3.5 pr-10 py-2 bg-[#E4E3E0]/30 border-2 border-[#141414] text-xs focus:outline-none focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer focus:outline-none p-1"
                    >
                      {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRegisterSubmitting}
                  className="w-full py-2.5 bg-[#141414] text-white font-mono font-black text-xs uppercase border-2 border-[#141414] hover:bg-[#2A2A2A] disabled:opacity-50"
                >
                  {isRegisterSubmitting ? 'Registering...' : 'Register Account'}
                </button>
              </form>
            )}
          </div>
        )}

        {hubTab === 'adk' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 border-b-2 border-[#141414]/20 pb-3">
              <button
                onClick={() => setAdkSubTab('endpoints')}
                className={`py-2 px-2.5 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  adkSubTab === 'endpoints'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Code className="w-3.5 h-3.5 shrink-0" />
                <span>API Endpoints</span>
              </button>

              <button
                onClick={() => setAdkSubTab('platform')}
                className={`py-2 px-2.5 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  adkSubTab === 'platform'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Server className="w-3.5 h-3.5 shrink-0" />
                <span>Platform Spec</span>
              </button>
            </div>

            {adkSubTab === 'endpoints' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-[#141414]" />
                    <h2 className="text-sm font-bold font-mono uppercase tracking-wide text-[#141414]">
                      API Specification
                    </h2>
                  </div>
                  <button
                    onClick={copyAdkCode}
                    disabled={isLoadingAdk || !adkSpecText}
                    className="px-2 py-1 bg-[#141414] text-white font-mono font-bold text-[10px] uppercase border border-[#141414] hover:bg-[#2A2A2A] flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                {isLoadingAdk ? (
                  <BrutalistLoader text="Accessing ADK..." size="sm" className="py-10" />
                ) : (
                  <div className="bg-[#141414] text-gray-100 p-5 border-2 border-[#141414] font-mono text-xs leading-relaxed overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-gray-200">{getEndpointsOnly(adkSpecText)}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#141414] text-gray-100 p-6 border-2 border-[#141414] font-mono text-sm leading-relaxed overflow-x-auto relative">
                <button 
                  onClick={copyPlatformSpec}
                  className="absolute right-2 top-2 p-1 bg-[#141414] border border-white/20 text-white/70 hover:text-white rounded"
                >
                  {copiedPlatform ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                {isLoadingAdk ? (
                  <BrutalistLoader text="Accessing Platform Spec..." size="sm" className="py-10" />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-[11px] text-gray-200">{getPlatformSpecOnly(adkSpecText)}</pre>
                )}
              </div>
            )}
          </div>
        )}
        
        {registeredCredentials && (
          <ApiKeyDisplayModal
            isOpen={showApiKeyModal}
            onClose={() => setShowApiKeyModal(false)}
            agentId={registeredCredentials.agentId}
            apiKey={registeredCredentials.apiKey}
          />
        )}

        <SignOutModal
          isOpen={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onConfirm={logout}
        />
      </div>
    </div>
  );
};
