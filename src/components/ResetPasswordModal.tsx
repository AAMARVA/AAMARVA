import React, { useState } from 'react';
import { KeyRound, CheckCircle, AlertCircle, Eye, EyeOff, X, Fingerprint, ShieldCheck, Loader2 } from 'lucide-react';
import { resetPasswordApi } from '../services/authApi';
import { executeWebAuthnAssertion } from '../services/webauthnClient';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin?: () => void;
  token?: string;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  token: propToken,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [webAuthnPrompt, setWebAuthnPrompt] = useState<{
    pendingToken: string;
    options: any;
    isSetup: boolean;
    userName?: string;
  } | null>(null);
  const [isVerifyingPasskey, setIsVerifyingPasskey] = useState(false);

  if (!isOpen) return null;

  const triggerPasskeyAssertion = async (
    token: string,
    passwordVal: string,
    challengeData: { pendingToken: string; options: any; isSetup: boolean }
  ) => {
    setIsVerifyingPasskey(true);
    setError('');
    try {
      const credentialResponse = await executeWebAuthnAssertion(challengeData.options, challengeData.isSetup);
      
      const finalRes = await resetPasswordApi(token, passwordVal, {
        pendingToken: challengeData.pendingToken,
        credentialResponse,
        isSetup: challengeData.isSetup,
      });

      if (finalRes?.error) {
        throw new Error(finalRes.error?.message || finalRes.error);
      }

      setSuccess(true);
      setWebAuthnPrompt(null);

      // Clean up URL parameters after successful password reset
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err: any) {
      setError(err?.message || 'Biometric / security key verification failed. Please try again.');
    } finally {
      setIsVerifyingPasskey(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Field validations
    if (!newPassword || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    // Extract token from prop or URL
    let effectiveToken = propToken;
    if (!effectiveToken) {
      const urlParams = new URLSearchParams(window.location.search);
      effectiveToken = urlParams.get('token') || urlParams.get('resetToken') || undefined;
    }

    if (!effectiveToken) {
      setError('Reset token is missing or invalid. Please request a new password reset link.');
      return;
    }

    setLoading(true);

    try {
      const initRes = await resetPasswordApi(effectiveToken, newPassword);

      if (initRes?.error) {
        throw new Error(initRes.error?.message || initRes.error);
      }

      if (initRes?.requiresWebAuthn) {
        const challengeData = {
          pendingToken: initRes.pendingToken,
          options: initRes.options,
          isSetup: initRes.status === 'WEBAUTHN_SETUP_REQUIRED',
          userName: initRes.userName,
        };
        setWebAuthnPrompt(challengeData);
        setLoading(false);

        // Immediately launch the biometric prompt
        await triggerPasskeyAssertion(effectiveToken, newPassword, challengeData);
        return;
      }

      setSuccess(true);
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while resetting password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-[#E4E3E0] border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 relative font-mono">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer p-1"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#141414] text-white flex items-center justify-center font-bold">
            {webAuthnPrompt ? <Fingerprint className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-black uppercase text-base text-[#141414]">
              {webAuthnPrompt ? 'Hardware Passkey Required' : 'Reset Password'}
            </h3>
            <p className="text-xs text-[#141414]/60">
              AAMARVA Human Security Vault
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-emerald-500/10 border-2 border-emerald-600 text-emerald-950 text-xs flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase mb-1">Password & Passkey Verified</p>
                <p className="text-emerald-900/80">
                  Your password has been successfully reset and authenticated via WebAuthn hardware assertion. Your human session is active.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                if (onSuccessLogin) onSuccessLogin();
              }}
              className="w-full py-3 bg-[#141414] text-white font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
            >
              Continue to Dashboard
            </button>
          </div>
        ) : webAuthnPrompt ? (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-500/10 border-2 border-amber-600 text-amber-950 text-xs flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase mb-1">
                  {webAuthnPrompt.isSetup ? 'Passkey Enrollment Required' : 'Biometric Passkey Required'}
                </p>
                <p className="text-amber-900/90 text-[11px] leading-relaxed">
                  To protect your account against automated agents and unauthorized takeovers, password resets require physical biometric verification (Touch ID, Face ID, or Security Key).
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border-2 border-rose-600 text-rose-950 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-4 bg-white border-2 border-[#141414] text-center space-y-2">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center border border-black/20">
                  {isVerifyingPasskey ? (
                    <Loader2 className="w-6 h-6 text-[#141414] animate-spin" />
                  ) : (
                    <Fingerprint className="w-6 h-6 text-[#141414]" />
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-[#141414] uppercase">
                {isVerifyingPasskey ? 'Waiting for Biometric Touch...' : 'Ready for Hardware Confirmation'}
              </p>
              <p className="text-[11px] text-[#141414]/70">
                Touch your fingerprint sensor or insert your security key to finalize the password reset.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setWebAuthnPrompt(null);
                  setError('');
                }}
                className="flex-1 py-2.5 bg-white text-[#141414] font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-gray-100 cursor-pointer"
                disabled={isVerifyingPasskey}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  let effectiveToken = propToken;
                  if (!effectiveToken) {
                    const urlParams = new URLSearchParams(window.location.search);
                    effectiveToken = urlParams.get('token') || urlParams.get('resetToken') || undefined;
                  }
                  if (effectiveToken && webAuthnPrompt) {
                    triggerPasskeyAssertion(effectiveToken, newPassword, webAuthnPrompt);
                  }
                }}
                className="flex-1 py-2.5 bg-[#141414] text-white font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] disabled:opacity-50 flex items-center justify-center gap-1.5"
                disabled={isVerifyingPasskey}
              >
                {isVerifyingPasskey ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Authorize Passkey</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-xs text-[#141414]/80">
              Enter your new secure password below. Biometric passkey verification will follow to cryptographically confirm human identity.
            </p>

            {error && (
              <div className="p-3 bg-rose-500/10 border-2 border-rose-600 text-rose-950 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase mb-1 text-[#141414]">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] text-xs focus:outline-none"
                  disabled={loading}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] p-1"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1 text-[#141414]">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] text-xs focus:outline-none"
                  disabled={loading}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/60 hover:text-[#141414] p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-white text-[#141414] font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-gray-100 cursor-pointer"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#141414] text-white font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] disabled:opacity-50 flex items-center justify-center gap-1.5"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
