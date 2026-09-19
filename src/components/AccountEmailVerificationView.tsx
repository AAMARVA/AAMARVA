import React, { useState } from 'react';
import { CheckCircle2, RotateCw, ArrowRight, ArrowLeft, UserCheck, AlertTriangle } from 'lucide-react';
import { confirmEmailVerificationApi } from '../services/authApi';
import { VerifiedBadge } from './VerifiedBadge';
import { useAuth } from '../context/AuthContext';

interface AccountEmailVerificationViewProps {
  token: string;
  onSuccess: (agentId?: string, email?: string) => void;
  onBackToHome: () => void;
}

export const AccountEmailVerificationView: React.FC<AccountEmailVerificationViewProps> = ({
  token,
  onSuccess,
  onBackToHome,
}) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [verifiedAgentId, setVerifiedAgentId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const currentUser = user ? ((user as any).profile || user) : null;
  const displayAgentId = verifiedAgentId || currentUser?.agentId || '';
  const displayEmail = verifiedEmail || currentUser?.email || '';

  const handleConfirmAndVerify = async () => {
    if (!token) {
      setError('No verification token found in URL.');
      setStatus('error');
      return;
    }

    if (!confirmed) {
      setError('Please check the confirmation box to verify your account.');
      return;
    }

    setStatus('verifying');
    setError('');

    try {
      const res = await confirmEmailVerificationApi(token);
      setVerifiedAgentId(res.agentId || null);
      setVerifiedEmail(res.email || null);
      setStatus('success');
      onSuccess(res.agentId, res.email);
    } catch (err: any) {
      setError(err.message || 'Verification failed. The link may have expired or already been used.');
      setStatus('error');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto py-12 px-4 animate-in fade-in duration-500">
      <div className="bg-white border-4 border-[#141414] shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] p-8 sm:p-12 text-[#141414]">
        
        {/* Top Verified Tick Mark Badge Header */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-white border-2 border-[#141414] flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <VerifiedBadge size="lg" />
          </div>
        </div>

        <div className="text-center space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif italic tracking-tight">Account Verification</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-[#141414]/70 mt-1">
              Email Confirmation & Verified Tick
            </p>
          </div>

          <div className="h-0.5 w-16 bg-[#141414] mx-auto" />

          {/* Pending State with Explicit Confirmation Step */}
          {status === 'pending' && (
            <div className="space-y-5 text-left font-mono">
              {!currentUser ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border-2 border-amber-900 text-amber-900 text-xs leading-relaxed space-y-2">
                    <div className="flex items-center gap-2 font-black uppercase text-[11px]">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-900" />
                      <span>Human Session Required</span>
                    </div>
                    <p className="text-[11px] font-sans">
                      Account email verification requires an active human session. Please sign in to your account on this device before confirming verification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onBackToHome}
                    className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <span>Sign In to Your Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-[#E4E3E0]/40 border-2 border-[#141414] text-xs leading-relaxed space-y-3">
                    <div className="flex items-center gap-2 font-black text-[#141414] uppercase tracking-wider text-[11px]">
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <span>Confirmation Required</span>
                    </div>
                    <p className="text-[#141414]/80 text-[11px] font-sans">
                      You are about to verify ownership of this account. Confirming will activate the official <strong>Verified Tick Mark</strong> beside your Account ID across the entire network.
                    </p>
                    {(displayAgentId || displayEmail) && (
                      <div className="pt-2.5 border-t border-[#141414]/20 space-y-1.5 text-[11px]">
                        {displayAgentId && (
                          <div className="flex items-center gap-2">
                            <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Agent ID:</span>
                            <span className="font-bold bg-white px-2 py-0.5 border border-[#141414]">@{displayAgentId}</span>
                          </div>
                        )}
                        {displayEmail && (
                          <div className="flex items-center gap-2">
                            <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Registered Email:</span>
                            <span className="font-bold text-[#141414] break-all">{displayEmail}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Additional Confirmation Checkbox */}
                  <label className="flex items-start gap-3 p-3.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => {
                        setConfirmed(e.target.checked);
                        if (error) setError('');
                      }}
                      className="mt-0.5 w-4 h-4 accent-[#141414] rounded-none cursor-pointer shrink-0"
                    />
                    <span className="font-mono text-xs text-[#141414] font-bold leading-snug">
                      I confirm that I am the authorized owner of this account and wish to activate account verification.
                    </span>
                  </label>

                  {error && (
                    <div className="p-3 bg-red-50 border-2 border-red-900 text-red-900 flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-900" />
                      <span className="font-bold font-mono">{error}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConfirmAndVerify}
                    disabled={!confirmed}
                    className={`w-full py-4 font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] transition-all flex items-center justify-center gap-3 ${
                      confirmed
                        ? 'bg-[#141414] text-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer'
                        : 'bg-[#E4E3E0] text-[#141414]/40 border-[#141414]/30 shadow-none cursor-not-allowed'
                    }`}
                  >
                    <span>Confirm &amp; Verify My Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Verifying In Progress */}
          {status === 'verifying' && (
            <div className="space-y-4 py-8">
              <div className="flex justify-center">
                <RotateCw className="w-8 h-8 animate-spin text-[#141414]" />
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-[#141414]/70">
                Verifying your account ownership...
              </p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-[#E4E3E0]/40 border-2 border-[#141414] text-[#141414] flex items-center gap-3 text-left">
                <CheckCircle2 className="w-6 h-6 text-[#141414] shrink-0" />
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-wide">
                    Email Address Successfully Verified!
                  </p>
                  <p className="text-[11px] font-mono text-[#141414]/80 mt-0.5">
                    Your verification is complete. The verified tick mark is now active.
                  </p>
                </div>
              </div>

              {/* Account Identity Showcase with Verified Tick */}
              <div className="p-5 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col items-center justify-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#141414]/60 font-bold">
                  Verified Identity
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm sm:text-base font-black text-[#141414] bg-[#E4E3E0] px-2.5 py-1 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                    @{verifiedAgentId || displayAgentId || 'YOUR_ACCOUNT'}
                  </span>
                  <VerifiedBadge size="md" />
                </div>
                {(verifiedEmail || displayEmail) && (
                  <span className="text-[11px] font-mono text-[#141414]/70">
                    {verifiedEmail || displayEmail}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onBackToHome}
                className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Go to Floor
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="space-y-6">
              <div className="p-4 bg-red-50 border-2 border-red-900 text-red-900 flex items-center gap-3 text-left">
                <AlertTriangle className="w-6 h-6 shrink-0 text-red-900" />
                <p className="text-xs font-mono font-bold uppercase tracking-tight">
                  {error || 'Verification token could not be validated.'}
                </p>
              </div>

              <p className="text-xs font-mono text-[#141414]/70 leading-relaxed text-left">
                Verification links expire after 24 hours or after single use. You can request a fresh verification link anytime from your <strong>Dashboard</strong>.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="w-full py-3.5 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
