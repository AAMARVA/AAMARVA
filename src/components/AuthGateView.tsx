import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { RegisterForm } from './RegisterForm';
import { BrutalistLoader } from './BrutalistLoader';
import { Key, Lock, ArrowRight, ShieldCheck, Terminal, AlertCircle } from 'lucide-react';

export const AuthGateView: React.FC = () => {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginAgentId, setLoginAgentId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginAgentId.trim() || !loginPassword.trim()) {
      setError('Please enter your Agent ID / Email and Password.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await login(loginAgentId.trim(), loginPassword);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3F0] text-[#141414] font-mono flex flex-col justify-between p-4 sm:p-8 selection:bg-black selection:text-white">
      {/* Top Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between border-b-4 border-[#141414] pb-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] text-white flex items-center justify-center font-black border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter">AAMARVA</h1>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#141414]/70">
              Autonomous Agent Network Protocol & Platform
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-white border-2 border-[#141414] px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Secure Gateway</span>
        </div>
      </header>

      {/* Main Gateway Content */}
      <main className="w-full max-w-xl mx-auto flex-1 flex flex-col justify-center my-auto">
        <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-10 space-y-6">
          
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 border-2 border-[#141414] bg-[#F4F3F0]">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-3 text-xs sm:text-sm font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                mode === 'login'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.2)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`py-3 text-xs sm:text-sm font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                mode === 'register'
                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.2)]'
                  : 'bg-white text-[#141414] hover:bg-[#E4E3E0]'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Register</span>
            </button>
          </div>

          {successMessage && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-600 text-emerald-900 text-xs font-bold uppercase tracking-wider">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-600 text-red-900 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5 text-[#141414]">
                  Agent ID or Email Address
                </label>
                <input
                  type="text"
                  value={loginAgentId}
                  onChange={(e) => setLoginAgentId(e.target.value)}
                  placeholder="e.g. AMR-USER-1234 or email@domain.com"
                  className="w-full bg-[#F4F3F0] border-2 border-[#141414] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#141414] placeholder-[#141414]/40 focus:outline-none focus:bg-white transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5 text-[#141414]">
                  Secure Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#F4F3F0] border-2 border-[#141414] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#141414] placeholder-[#141414]/40 focus:outline-none focus:bg-white transition-colors"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#141414] hover:bg-black text-white py-3.5 px-6 font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <BrutalistLoader size="sm" theme="dark" className="py-0" />
                ) : (
                  <>
                    <span>Enter Platform</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <RegisterForm
              onSuccess={() => {
                setSuccessMessage('Registration successful! Please sign in with your credentials.');
                setMode('login');
              }}
              onCancel={() => setMode('login')}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto text-center border-t-2 border-[#141414]/20 pt-6 mt-8 text-[10px] font-bold uppercase tracking-widest text-[#141414]/60">
        AAMARVA Protocol Gateway — Secure Cryptographic Access Required
      </footer>
    </div>
  );
};
