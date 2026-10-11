import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Lock, User, Mail, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FloorRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess?: (credentials?: { agentId?: string; apiKey?: string; user?: any }) => void;
  onSwitchToLogin?: (email?: string) => void;
}

export const FloorRegistrationModal: React.FC<FloorRegistrationModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  onSuccess,
  onSwitchToLogin,
}) => {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setIsSubmitting(false);
      setFullName('');
      setPassword('');
      setConfirmPassword('');
      setCreatedEmail(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }

    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(trimmedEmail, password, trimmedName);
      setCreatedEmail(trimmedEmail);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err: any) {
      const msg = err?.message || 'Registration failed. Please try again.';
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
            {createdEmail ? 'REGISTRATION COMPLETE' : 'HUMAN OPERATOR REGISTRATION'}
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
        {createdEmail ? (
          <div className="p-6 sm:p-8 space-y-6 font-mono animate-in fade-in duration-200">
            <div className="border-b-2 border-[#141414] pb-4">
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#141414] leading-none">
                Account Created
              </h1>
              <p className="text-xs font-mono text-[#141414]/70 mt-2">
                Human operator registration completed successfully.
              </p>
            </div>

            <div className="p-5 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-3">
              <div className="text-xs font-black uppercase tracking-wider text-[#141414] flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 bg-[#141414]"></span>
                <span>Account Confirmation</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-[#141414] leading-relaxed">
                Your account has been created with{' '}
                <span className="bg-[#141414] text-white px-2 py-0.5 font-mono font-bold break-all inline-block">
                  {createdEmail}
                </span>
              </p>
            </div>

            <div className="p-4 bg-[#FAF9F5] border-2 border-[#141414] font-mono text-xs text-[#141414] space-y-2">
              <p className="font-black uppercase tracking-wider">Next Step: Log In</p>
              <p className="text-[#141414]/80 leading-relaxed">
                Please log in with your registered email and password to access the floor and orchestrate agents.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSwitchToLogin) onSwitchToLogin(createdEmail);
              }}
              className="w-full py-4 bg-[#141414] text-white hover:bg-black font-mono text-xs sm:text-sm font-black uppercase tracking-wider border-2 border-[#141414] shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] hover:shadow-[7px_7px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Log In Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="p-6 sm:p-8 space-y-6">
          
          {/* Header Block */}
          <div className="border-b-2 border-[#141414] pb-4">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#141414] leading-none">
              Create Account
            </h1>
            <p className="text-xs font-mono text-[#141414]/70 mt-2">
              Register a human operator account to orchestrate and manage autonomous AI agents.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] font-mono text-xs text-neutral-700 font-bold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#141414] font-bold shrink-0 mt-0.5" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-5 font-mono">
            
            {/* Field 01: Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">01</span>
                <span>Full Name</span>
                <span className="text-[#141414] font-bold font-black">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#141414]/50">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Operator Name"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold text-[#141414] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] transition-all placeholder:text-[#141414]/30"
                />
              </div>
            </div>

            {/* Field 02: Email Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">02</span>
                <span>Email Address</span>
                <span className="text-[#141414] font-bold font-black">*</span>
              </label>
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
            </div>

            {/* Field 03: Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">03</span>
                <span>Password</span>
                <span className="text-[#141414] font-bold font-black">*</span>
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
            </div>

            {/* Field 04: Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-[#141414] flex items-center gap-1.5">
                <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[10px] font-black">04</span>
                <span>Confirm Password</span>
                <span className="text-[#141414] font-bold font-black">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#141414]/50">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-9 pr-10 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs font-bold text-[#141414] focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] transition-all placeholder:text-[#141414]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#141414]/60 hover:text-[#141414] hover:bg-[#E4E3E0] border border-transparent hover:border-[#141414] transition-all cursor-pointer"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
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
                    <div className="w-4 h-4 border-2 border-white relative overflow-hidden">
                      <div className="absolute inset-0 bg-white animate-pulse" />
                    </div>
                    <span>CREATING ACCOUNT...</span>
                  </>
                ) : (
                  <>
                    <span>CREATE ACCOUNT</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </form>

          {/* Login switch link */}
          <div className="pt-4 border-t border-[#141414]/10 text-center font-mono text-xs">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSwitchToLogin) onSwitchToLogin();
              }}
              className="font-bold underline hover:text-black cursor-pointer"
            >
              Log in
            </button>
          </div>

        </div>
        )}

      </div>
    </div>
  );
};
