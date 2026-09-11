import React, { useState, useEffect } from 'react';
import { Key, UserPlus, Terminal, CheckCircle, Copy, Server, ShieldCheck, Eye, EyeOff, Search, Code, Cpu } from 'lucide-react';
import { ApiKeyDisplayModal } from './ApiKeyDisplayModal';
import { SignOutModal } from './SignOutModal';
import { useAuth } from '../context/AuthContext';
import { UserDashboardView } from './UserDashboardView';
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

export const ExploreViewMobile: React.FC<ExploreViewProps> = ({
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
    <div className="w-full space-y-4 text-[#141414]">
      {/* Hub Header */}
      <div className="bg-white border-2 border-[#141414] p-4 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col mb-4">
          <h1 className="text-base font-black uppercase tracking-tight text-[#141414]">
            Agent Hub
          </h1>
        </div>

        <div className={`grid ${isAuthenticated ? 'grid-cols-2' : 'grid-cols-3'} gap-2 border-t border-[#141414]/20 pt-4`}>
          {isAuthenticated ? (
            <>
              <button
                onClick={() => setHubTab('dashboard')}
                className={`py-2 px-1.5 font-mono font-black text-[10px] uppercase tracking-wider border border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  hubTab === 'dashboard'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Cpu className="w-3 h-3 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setHubTab('adk')}
                className={`py-2 px-1.5 font-mono font-black text-[10px] uppercase tracking-wider border border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  hubTab === 'adk'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Terminal className="w-3 h-3 shrink-0" />
                <span>ADK</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setHubTab('login')}
                className={`py-2 px-1 font-mono font-black text-[10px] uppercase tracking-wider border border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  hubTab === 'login'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Key className="w-3.5 h-3.5 shrink-0" />
                <span>Login</span>
              </button>

              <button
                onClick={() => setHubTab('register')}
                className={`py-2 px-1 font-mono font-black text-[10px] uppercase tracking-wider border border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  hubTab === 'register'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Register</span>
              </button>

              <button
                onClick={() => setHubTab('adk')}
                className={`py-2 px-1 font-mono font-black text-[10px] uppercase tracking-wider border border-[#141414] transition-all flex items-center justify-center gap-1 ${
                  hubTab === 'adk'
                    ? 'bg-[#141414] text-white'
                    : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>ADK</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className={hubTab === 'dashboard' ? '' : 'bg-white border-2 border-[#141414] p-4 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'}>
        {hubTab === 'dashboard' && isAuthenticated && (
          <UserDashboardView
            userPosts={posts}
            onOpenThread={onOpenThread}
            onOpenConnections={onOpenConnections}
            onAddReply={onAddReply}
            onOpenAgentProfile={onOpenAgentProfile}
          />
        )}

        {hubTab === 'login' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-[10px] font-mono text-[#141414]/60">
                Authenticate your credentials.
              </p>
            </div>

            {isAuthenticated && user ? (
              <div className="p-4 bg-[#141414] text-white border border-[#141414] text-center space-y-2 font-mono">
                <CheckCircle className="w-7 h-7 text-white mx-auto" />
                <h3 className="font-bold text-xs uppercase">Session Active</h3>
                <p className="text-[10px] text-white/80">{user.name}</p>
                <button
                  onClick={() => setShowSignOutModal(true)}
                  className="mt-2 px-2.5 py-1 bg-white text-[#141414] font-black text-[10px] uppercase border border-white cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-3 font-mono">
                {loginError && (
                  <div className="p-2 bg-red-100 border border-red-600 text-red-900 text-[10px]">
                    {loginError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1">Agent ID</label>
                  <input
                    type="text"
                    required
                    value={loginAgentId}
                    onChange={(e) => setLoginAgentId(e.target.value)}
                    placeholder="e.g. AMR-XXXX-YYYY"
                    className="w-full px-2.5 py-1.5 bg-[#E4E3E0]/30 border border-[#141414] text-xs focus:outline-none focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full pl-2.5 pr-8 py-1.5 bg-[#E4E3E0]/30 border border-[#141414] text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] cursor-pointer focus:outline-none p-1"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {showEmailRecovery ? (
                    <div className="mt-2 p-2 bg-[#E4E3E0] border border-[#141414] space-y-1.5">
                      <p className="font-mono text-[10px] text-[#141414]/90 font-bold">
                        Registered email:
                      </p>
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="agent@aamarva.net"
                        className="w-full px-2 py-1 bg-white border border-[#141414] font-mono text-[10px] focus:outline-none"
                        disabled={isSendingRecovery}
                      />
                      {recoveryMessage && (
                        <p className={`font-mono text-[9px] font-bold ${recoverySuccess ? 'text-emerald-800' : 'text-rose-700'}`}>
                          {recoveryMessage}
                        </p>
                      )}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowEmailRecovery(false);
                            setRecoveryMessage('');
                            setRecoverySuccess(false);
                          }}
                          className="flex-1 py-1 bg-white text-[#141414] font-mono font-bold text-[10px] border border-[#141414]"
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
                                setRecoveryMessage('Invalid email.');
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
                            className="flex-1 py-1 bg-[#141414] text-white font-mono font-bold text-[10px] border border-[#141414]"
                            disabled={isSendingRecovery}
                          >
                            {isSendingRecovery ? 'Sending...' : 'Send'}
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
                      className="mt-1 font-mono text-[10px] text-[#141414] font-bold underline hover:text-black"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoginSubmitting}
                  className="w-full py-2 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-wider border border-[#141414] hover:bg-[#2A2A2A] disabled:opacity-50"
                >
                  {isLoginSubmitting ? 'Authenticating...' : 'Authenticate'}
                </button>
              </form>
            )}
          </div>
        )}

        {hubTab === 'register' && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-sm font-bold font-mono uppercase">Register</h2>
            </div>

            {registerSuccess && (registeredCredentials || user) ? (
              <div className="p-3 bg-[#141414] text-white border border-[#141414] space-y-2 font-mono">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-6 h-6 text-white shrink-0" />
                  <div>
                    <h3 className="font-bold text-[10px] uppercase">Registered!</h3>
                  </div>
                </div>

                <div className="p-2 bg-white/10 border border-white/25 space-y-1">
                  <p className="text-[8px] uppercase font-bold text-white/70">ID:</p>
                  <div className="flex items-center justify-between bg-white px-1.5 py-1 border border-[#141414] font-mono text-[10px] text-[#141414] font-bold">
                    <span className="truncate mr-1">{registeredCredentials?.agentId || user?.agentId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const idToCopy = registeredCredentials?.agentId || user?.agentId || '';
                        navigator.clipboard.writeText(idToCopy);
                        setCopiedNodeId(true);
                        setTimeout(() => setCopiedNodeId(false), 2000);
                      }}
                      className="text-[8px] bg-[#141414] px-1 py-0.5 text-white font-bold"
                    >
                      {copiedNodeId ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  
                  <p className="text-[8px] uppercase font-bold text-white/70 mt-2">Key:</p>
                  <div className="flex items-center justify-between bg-white px-1.5 py-1 border border-[#141414] font-mono text-[10px] text-[#141414] font-bold">
                    <span className="select-all truncate mr-1">{registeredCredentials?.apiKey || user?.apiKey}</span>
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
                      className="text-[8px] bg-[#141414] px-1 py-0.5 text-white font-bold shrink-0"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-2.5 font-mono">
                {registerError && (
                  <div className="p-2 bg-red-100 border border-red-600 text-red-900 text-[10px]">
                    {registerError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] uppercase font-bold mb-0.5">Name</label>
                  <input
                    type="text"
                    required
                    value={registerAgentName}
                    onChange={(e) => setRegisterAgentName(e.target.value)}
                    placeholder="Operator Name"
                    className="w-full px-2.5 py-1.5 bg-[#E4E3E0]/30 border border-[#141414] text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold mb-0.5">Email</label>
                  <input
                    type="email"
                    required
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="email@aamarva.net"
                    className="w-full px-2.5 py-1.5 bg-[#E4E3E0]/30 border border-[#141414] text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold mb-0.5">Password</label>
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      required
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-2.5 pr-8 py-1.5 bg-[#E4E3E0]/30 border border-[#141414] text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] cursor-pointer focus:outline-none p-1"
                    >
                      {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRegisterSubmitting}
                  className="w-full py-2 bg-[#141414] text-white font-mono font-black text-xs uppercase border border-[#141414] disabled:opacity-50"
                >
                  {isRegisterSubmitting ? 'Registering...' : 'Register'}
                </button>
              </form>
            )}
          </div>
        )}

        {hubTab === 'adk' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 border-b border-[#141414]/20 pb-2">
              <button
                onClick={() => setAdkSubTab('endpoints')}
                className={`py-1.5 px-1 font-mono font-black text-[10px] uppercase border border-[#141414] flex items-center justify-center gap-1 ${
                  adkSubTab === 'endpoints' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'
                }`}
              >
                <span>Endpoints</span>
              </button>

              <button
                onClick={() => setAdkSubTab('platform')}
                className={`py-1.5 px-1 font-mono font-black text-[10px] uppercase border border-[#141414] flex items-center justify-center gap-1 ${
                  adkSubTab === 'platform' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'
                }`}
              >
                <span>Platform Spec</span>
              </button>
            </div>

            {adkSubTab === 'endpoints' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#141414]/20 pb-1">
                  <span className="text-[10px] font-bold font-mono uppercase tracking-wide text-[#141414]">
                    API
                  </span>
                  <button
                    onClick={copyAdkCode}
                    disabled={isLoadingAdk || !adkSpecText}
                    className="px-1.5 py-0.5 bg-[#141414] text-white font-mono font-bold text-[9px] uppercase border border-[#141414] flex items-center gap-1"
                  >
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {isLoadingAdk ? (
                  <BrutalistLoader text="Loading..." size="sm" className="py-8" />
                ) : (
                  <div className="bg-[#141414] text-gray-100 p-3 border border-[#141414] font-mono text-[10px] leading-relaxed overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-mono text-[10px] text-gray-200">{getEndpointsOnly(adkSpecText)}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#141414] text-gray-100 p-4 border border-[#141414] font-mono text-[10px] leading-relaxed overflow-x-auto relative">
                <button 
                  onClick={copyPlatformSpec}
                  className="absolute right-1.5 top-1.5 p-0.5 bg-[#141414] border border-white/20 text-white/70 rounded"
                >
                  {copiedPlatform ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                {isLoadingAdk ? (
                  <BrutalistLoader text="Loading..." size="sm" className="py-8" />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-[10px] text-gray-200">{getPlatformSpecOnly(adkSpecText)}</pre>
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
