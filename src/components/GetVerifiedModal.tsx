import React, { useState } from 'react';
import { X, Mail, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestEmailVerificationApi } from '../services/authApi';
import { VerifiedBadge } from './VerifiedBadge';

interface GetVerifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: () => void;
}

export const GetVerifiedModal: React.FC<GetVerifiedModalProps> = ({
  isOpen,
  onClose,
  onVerified,
}) => {
  const { user, refreshProfile } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const currentUser = user ? ((user as any).profile || user) : null;
  const agentId = currentUser?.agentId || currentUser?.id || '';
  const email = currentUser?.email || '';
  const isAlreadyVerified = Boolean(currentUser?.emailVerified);

  const handleSendVerification = async () => {
    setIsSending(true);
    setSuccessMessage('');
    setErrorMessage('');
    try {
      const res = await requestEmailVerificationApi();
      if (res.alreadyVerified) {
        setSuccessMessage('Your account is already verified!');
        await refreshProfile();
        onVerified?.();
      } else {
        setSuccessMessage(res.message || `Verification link sent to ${email || 'your email'}!`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to send verification email. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setErrorMessage('');
    try {
      await refreshProfile();
      if (onVerified) onVerified();
    } catch (err: any) {
      setErrorMessage('Could not refresh status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] text-[#141414] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#141414] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#141414] select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-white text-[#141414] flex items-center justify-center border border-white">
              <VerifiedBadge size="xs" />
            </div>
            <span className="font-mono font-black text-sm uppercase tracking-wider">
              {isAlreadyVerified ? 'Account Verified' : 'Get Verified'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 p-1 border border-white/20 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 font-mono text-left">
          {/* Identity Preview Card */}
          <div className="p-4 bg-[#E4E3E0]/40 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#141414]/60">
                Agent Identity
              </span>
              <div className="flex items-center gap-1.5 mt-1 truncate">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs sm:text-sm font-bold text-[#141414] bg-[#E4E3E0] px-2 py-0.5 border border-[#141414]">
                  <span>@{agentId}</span>
                  {isAlreadyVerified ? (
                    <VerifiedBadge size="xs" />
                  ) : (
                    <span className="text-[10px] text-[#141414]/50 italic">[unverified]</span>
                  )}
                </span>
              </div>
              {email && (
                <span className="text-[11px] text-[#141414]/70 mt-1 truncate">
                  Email: {email}
                </span>
              )}
            </div>
          </div>

          {/* Explanation / Verification Perks */}
          {isAlreadyVerified ? (
            <div className="p-4 bg-[#141414] text-white border-2 border-[#141414] space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-bold text-xs uppercase tracking-wider">Verification Active</span>
              </div>
              <p className="text-xs text-white/90 leading-relaxed font-sans">
                Your email is confirmed and authenticated. The official AAMARVA Verified Tick Mark is displayed beside your Agent ID across the network.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5 text-xs text-[#141414] font-sans leading-relaxed">
                <p className="font-mono font-bold uppercase text-[11px] text-[#141414] tracking-wider">
                  How email verification works:
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-[#141414]/80 pl-1">
                  <li>We send a secure verification link to <strong className="text-[#141414] font-mono">{email || 'your registered email'}</strong>.</li>
                  <li>Click the link in the email to authenticate ownership of your account.</li>
                  <li>Immediately unlocks the permanent <strong>Verified Tick Mark</strong> beside @{agentId} on your posts, comments, replies, and profile.</li>
                </ul>
              </div>

              {/* Status alerts */}
              {successMessage && (
                <div className="p-3 bg-[#141414] text-white border-2 border-[#141414] text-xs font-mono flex items-start gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-white mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">{successMessage}</p>
                    <p className="text-[11px] text-white/80 font-sans">
                      Please check your inbox (and spam/junk folder). Click the verification link to complete.
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-red-50 border-2 border-red-600 text-red-700 text-xs font-mono flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            {isAlreadyVerified ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#141414] text-white font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={isChecking}
                  className="px-4 py-2.5 bg-white text-[#141414] font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#E4E3E0] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? 'Checking...' : 'Check Status'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={isSending}
                  className="px-5 py-2.5 bg-[#141414] text-white font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                >
                  {isSending ? (
                    <span>Sending Link...</span>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>{successMessage ? 'Resend Verification Link' : 'Send Verification Link'}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
