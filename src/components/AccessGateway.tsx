import React, { useState } from 'react';
import { 
  Lock, 
  Key, 
  UserPlus, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  ArrowLeft,
  Mail
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RegisterForm } from './RegisterForm';
import { requestForgotPasswordApi } from '../services/authApi';

interface AccessGatewayProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  defaultMode?: 'login' | 'register';
  onBackToFloor?: () => void;
  onSuccess?: () => void;
}

/**
 * AccessGateway
 * Enforces authentication as a security gateway before accessing accounts,
 * fleet management, API keys, or private architecture settings.
 */
export const AccessGateway: React.FC<AccessGatewayProps> = ({
  children,
  title = 'OPERATOR GATEWAY',
  subtitle = 'Authentication required. Sign in or register your operator identity to access the platform.',
  defaultMode = 'login',
  onBackToFloor,
  onSuccess,
}) => {
  const { isAuthenticated, login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot password recovery state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // If user is already authenticated, allow through to the accounts
  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setLoginError('Please enter your account email or agent identifier and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(loginIdentifier.trim(), loginPassword.trim());
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendRecovery = async () => {
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
      setRecoveryMessage(res.message || 'If an account exists for this email, password recovery instructions have been dispatched.');
    } catch (err: any) {
      setRecoverySuccess(false);
      setRecoveryMessage(err?.message || 'Failed to dispatch recovery link. Please try again later.');
    } finally {
      setIsSendingRecovery(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 px-4 animate-in fade-in duration-300">
      <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] text-[#141414] overflow-hidden">
        
        {/* Security Clearance Header Strip */}
        <div className="bg-[#141414] text-white px-5 py-3 flex items-center justify-between border-b-2 border-[#141414]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-white" />
            <span className="font-mono text-xs font-black uppercase tracking-widest">
              AAMARVA SECURITY GATEWAY
            </span>
          </div>
          <span className="px-2 py-0.5 bg-white text-[#141414] font-mono text-[9px] font-black uppercase tracking-wider">
            CLEARANCE REQUIRED
          </span>
        </div>

        {/* Gateway Heading & Context */}
        <div className="p-6 sm:p-8 border-b-2 border-[#141414] bg-[#FAF9F5]">
          <div className="flex items-center gap-2 mb-2 text-[#141414]/70">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-mono text-[10px] uppercase font-black tracking-widest">
              IDENTITY ACCESS MANAGEMENT
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-sans tracking-tight text-[#141414] uppercase mb-2">
            {title}
          </h1>
          <p className="font-mono text-xs text-[#141414]/80 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-2 bg-[#E4E3E0] border-b-2 border-[#141414] gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setLoginError('');
            }}
            className={`py-3 px-4 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mode === 'login'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>SIGN IN</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setLoginError('');
            }}
            className={`py-3 px-4 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mode === 'register'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>REGISTER</span>
          </button>
        </div>

        {/* Gateway Content Body */}
        <div className="p-6 sm:p-8">
          {mode === 'login' ? (
            <div className="space-y-6">
              {loginError && (
                <div className="p-3 bg-red-50 border-2 border-red-600 text-red-700 font-mono text-xs font-bold flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <label className="block font-mono text-xs font-black uppercase tracking-wider mb-1.5 text-[#141414]">
                    Email / Agent Node ID <span className="text-red-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="operator@aamarva.net or AMR-..."
                      className="w-full px-4 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-mono text-xs font-black uppercase tracking-wider text-[#141414]">
                      Password <span className="text-red-600">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRecovery(!showRecovery);
                        setRecoveryMessage('');
                      }}
                      className="font-mono text-[11px] text-[#141414] font-bold underline hover:text-black cursor-pointer"
                    >
                      {showRecovery ? 'Hide recovery' : 'Forgot password?'}
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-4 pr-12 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-[#141414]/60 hover:text-[#141414] cursor-pointer p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Inline Forgot Password UI */}
                {showRecovery && (
                  <div className="p-4 bg-[#E4E3E0] border-2 border-[#141414] space-y-3 animate-in fade-in duration-200">
                    <p className="font-mono text-xs font-bold text-[#141414]">
                      Enter registered email to receive password recovery:
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-[#141414]/50" />
                        <input
                          type="email"
                          value={recoveryEmail}
                          onChange={(e) => setRecoveryEmail(e.target.value)}
                          placeholder="operator@aamarva.net"
                          className="w-full pl-10 pr-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                          disabled={isSendingRecovery}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendRecovery}
                        disabled={isSendingRecovery}
                        className="px-4 py-2 bg-[#141414] text-white font-mono text-xs font-black uppercase border-2 border-[#141414] cursor-pointer disabled:opacity-50"
                      >
                        {isSendingRecovery ? 'Sending...' : 'Send Link'}
                      </button>
                    </div>
                    {recoveryMessage && (
                      <p className={`font-mono text-xs font-bold ${recoverySuccess ? 'text-green-700' : 'text-red-600'}`}>
                        {recoveryMessage}
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-[#141414] hover:bg-black text-white font-mono text-xs font-black uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <span>{isSubmitting ? 'AUTHENTICATING CLEARANCE...' : 'SIGN IN & ENTER PLATFORM'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="pt-4 border-t border-[#141414]/20 text-center font-mono text-xs">
                <span>Need to register a new operator identity? </span>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="font-black underline text-[#141414] hover:text-black cursor-pointer ml-1"
                >
                  Register here
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <RegisterForm
                onGoToLogin={(email) => {
                  setLoginIdentifier(email);
                  setMode('login');
                }}
                onCancel={() => setMode('login')}
                onSuccess={(credentials) => {
                  setLoginIdentifier(credentials.agentId);
                  setMode('login');
                  if (onSuccess) {
                    onSuccess();
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Footer with Return to Public Floor navigation */}
        {onBackToFloor && (
          <div className="p-4 bg-[#FAF9F5] border-t-2 border-[#141414] flex justify-center">
            <button
              type="button"
              onClick={onBackToFloor}
              className="font-mono text-xs font-black text-[#141414] hover:opacity-80 transition-opacity flex items-center gap-2 cursor-pointer uppercase tracking-wider"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO WATCHTOWER FEED</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
