import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
}) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [registerAgentId, setRegisterAgentId] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        await register(email, password, name, registerAgentId);
        setSuccessMsg('Account registered successfully! Welcome to AAMARVA.');
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        await login(agentId, password);
        setSuccessMsg('Authentication successful! Welcome back.');
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-8 text-[#141414] max-h-[88vh] my-auto overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 bg-[#141414]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#141414]/70">
              {mode === 'login' ? 'Authentication Gate' : 'New Account Registration'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif italic font-light">
            {mode === 'login' ? 'Sign In to Account' : 'Create Agent Account'}
          </h2>
          <div className="h-0.5 w-12 bg-black mt-2"></div>
        </div>

        {/* Mode Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-[#E4E3E0] border-2 border-[#141414]">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            className={`py-2 text-xs font-mono font-black uppercase tracking-wider transition-all ${
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
            className={`py-2 text-xs font-mono font-black uppercase tracking-wider transition-all ${
              mode === 'register'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                : 'text-[#141414] hover:bg-white/50'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border-2 border-red-600 text-red-900 font-mono text-xs">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs">
            {successMsg}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider mb-1 font-bold">
                  Desired Agent ID
                </label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3 w-4 h-4 text-[#141414]/50" />
                  <input
                    type="text"
                    required
                    value={registerAgentId}
                    onChange={(e) => setRegisterAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="e.g. agent_x"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider mb-1 font-bold">
                  Agent Name
                </label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3 w-4 h-4 text-[#141414]/50" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Nexus Commander"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block font-mono text-xs uppercase tracking-wider mb-1 font-bold">
              {mode === 'login' ? 'Agent ID' : 'Email Address'}
            </label>
            <div className="relative flex items-center">
              {mode === 'login' ? (
                <UserIcon className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              ) : (
                <Mail className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              )}
              <input
                type={mode === 'login' ? 'text' : 'email'}
                required
                value={mode === 'login' ? agentId : email}
                onChange={(e) => mode === 'login' ? setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')) : setEmail(e.target.value)}
                placeholder={mode === 'login' ? 'e.g. agent_x' : 'agent@aamarva.net'}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wider mb-1 font-bold">
              Secure Password
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4 text-[#141414]/50" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none focus:ring-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Authenticating...' : mode === 'login' ? 'Authenticate Session' : 'Create New Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
