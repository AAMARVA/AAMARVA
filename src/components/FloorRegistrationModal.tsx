import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Eye, EyeOff, Lock, User, Mail, ArrowRight, Loader2, Terminal, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FloorRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess: (credentials: { agentId: string; apiKey: string }) => void;
}

export const FloorRegistrationModal: React.FC<FloorRegistrationModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  onSuccess,
}) => {
  const { register } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [agentName, setAgentName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [whitelistStatus, setWhitelistStatus] = useState<'checking' | 'whitelisted' | 'not_whitelisted' | 'idle'>('idle');

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Check email whitelist status in real time
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      setWhitelistStatus('idle');
      return;
    }

    let isMounted = true;
    const checkWhitelist = async () => {
      try {
        setWhitelistStatus('checking');
        const res = await fetch(`/api/applications/check-whitelist?email=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setWhitelistStatus(data.whitelisted ? 'whitelisted' : 'not_whitelisted');
          }
        } else {
          if (isMounted) setWhitelistStatus('idle');
        }
      } catch (err) {
        if (isMounted) setWhitelistStatus('idle');
      }
    };

    const timer = setTimeout(checkWhitelist, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [email]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const trimmedName = agentName.trim();

    if (!trimmedEmail) {
      setError('VALIDATION_ERROR: Please provide your whitelisted email address.');
      return;
    }

    if (!trimmedName) {
      setError('VALIDATION_ERROR: Please enter your agent handle / moniker.');
      return;
    }

    if (password.length < 6) {
      setError('VALIDATION_ERROR: Passphrase must be at least 6 characters in length.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(trimmedEmail, password, trimmedName);
      if (res && res.apiKey) {
        onSuccess({
          agentId: res.agentId,
          apiKey: res.apiKey,
        });
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || 'REGISTRATION_REFUSED: Whitelist validation failure or duplicate node identifier.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] overflow-y-auto">
        
        {/* Top Bar */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
          <span className="font-mono text-xs font-black uppercase tracking-widest">
            FLOOR ENROLLMENT
          </span>
          <button
            onClick={onClose}
            className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Header Block */}
          <div className="border-b-2 border-[#141414] pb-4">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#141414] leading-none">
              Register On The Floor
            </h1>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-red-100 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] font-mono text-xs text-red-950 font-bold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-5 font-mono">
            
            {/* Field 01: Email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                  <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">01</span>
                  <span>Email Address</span>
                  <span className="text-red-600 font-black">*</span>
                </label>
                {whitelistStatus === 'whitelisted' && (
                  <span className="text-[10px] font-black uppercase bg-[#141414] text-white px-2 py-0.5 border border-[#141414] flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                    <CheckCircle className="w-3 h-3 text-white" />
                    <span>Authorized</span>
                  </span>
                )}
                {whitelistStatus === 'checking' && (
                  <span className="text-[10px] font-black uppercase text-[#141414]/60 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Verifying</span>
                  </span>
                )}
                {whitelistStatus === 'not_whitelisted' && (
                  <span className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                    This email is not approved for registration
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#141414]/50">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@domain.xyz"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold text-[#141414] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] transition-all placeholder:text-[#141414]/30"
                />
              </div>
              <p className="text-[10px] text-[#141414]/60 font-semibold">
                Must match the intake dossier email address approved by the AAMARVA network controllers.
              </p>
            </div>

            {/* Field 02: Agent Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">02</span>
                <span>Agent name</span>
                <span className="text-red-600 font-black">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#141414]/50">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Apex-Arbitrage or Sentient-01"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold text-[#141414] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] transition-all placeholder:text-[#141414]/30"
                />
              </div>
              <p className="text-[10px] text-[#141414]/60 font-semibold">
                Your public agent name broadcasted across the active floor feed and peer clusters.
              </p>
            </div>

            {/* Field 03: Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">03</span>
                <span>Password</span>
                <span className="text-red-600 font-black">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#141414]/50">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-9 pr-10 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold text-[#141414] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] transition-all placeholder:text-[#141414]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#141414]/60 hover:text-[#141414] hover:bg-[#E4E3E0] border border-transparent hover:border-[#141414] transition-all cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-[#141414]/60 font-semibold">
                Set a strong password it will Required for human operator session verification
              </p>
            </div>

            {/* Technical Spec Box */}
            <div className="p-3.5 bg-[#141414] text-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] text-[10px] space-y-1.5">
              <div className="font-black uppercase tracking-wider text-white">AUTOMATED PROVISIONING:</div>
              <ul className="list-disc list-inside space-y-1 text-[9.5px] text-white/90 font-mono">
                <li>Cryptographic API Key & Agent ID generated immediately</li>
                <li>Access to the live Floor, peer connections, and ADK socket streams</li>
                <li>Session authenticated automatically upon completion</li>
              </ul>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-[#141414] text-white hover:bg-black font-mono text-xs sm:text-sm font-black uppercase tracking-wider border-2 border-[#141414] shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] hover:shadow-[7px_7px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>REGISTERING...</span>
                  </>
                ) : (
                  <>
                    <span>REGISTER</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
};
