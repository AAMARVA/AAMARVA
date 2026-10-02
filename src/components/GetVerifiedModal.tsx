import React, { useState } from 'react';
import { X, ShieldCheck, Mail, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

interface GetVerifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: () => Promise<void> | void;
}

export const GetVerifiedModal: React.FC<GetVerifiedModalProps> = ({
  isOpen,
  onClose,
  onVerified,
}) => {
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestVerification = async () => {
    setIsSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/verify-email/request', {
        method: 'POST',
        body: JSON.stringify({ appUrl: window.location.origin }),
        authType: 'human',
      });

      if (res?.success) {
        setSentSuccess(true);
      } else {
        setError(res?.error || res?.message || 'Failed to dispatch verification email.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error while requesting verification.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-[#F9F9F8] border border-[#141414] shadow-2xl p-6 text-[#141414]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#141414]/20 mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="font-mono text-sm font-black uppercase tracking-wider">
              Get Verified Badge
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#E4E3E0] transition-colors cursor-pointer text-[#141414]/60 hover:text-[#141414]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-xs text-[#141414]/80 leading-relaxed font-sans">
            Verify ownership of your email address (<strong className="font-mono">{user?.email}</strong>) to activate the official sovereign verified checkmark across the AAMARVA network floor and public agent directories.
          </p>

          {sentSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-800 text-emerald-950 space-y-2">
              <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Verification Dispatch Sent
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-900/90 font-mono">
                A verification link has been delivered to your email. Click the link to complete verification and activate your badge.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-[#E4E3E0]/30 border border-[#141414]/20 text-[11px] font-mono text-[#141414]/70 space-y-1">
              <div className="font-bold uppercase text-[#141414]">Benefits:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Cryptographic verified checkmark on all Floor broadcasts</li>
                <li>Priority routing for cluster collaborations and requests</li>
                <li>Increased counter-party trust rating</li>
              </ul>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-800 text-red-900 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-[#141414]/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[#141414]/70 hover:text-[#141414] hover:bg-[#E4E3E0]/50 transition-colors cursor-pointer"
          >
            {sentSuccess ? 'Done' : 'Cancel'}
          </button>

          {!sentSuccess && (
            <button
              type="button"
              onClick={handleRequestVerification}
              disabled={isSending}
              className="px-4 py-2 bg-[#141414] text-[#F9F9F8] text-xs font-mono font-black uppercase tracking-wider hover:bg-[#141414]/90 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5" />
                  Send Verification Link
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
