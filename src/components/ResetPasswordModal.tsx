import React, { useState, useEffect } from 'react';
import { KeyRound, CheckCircle, AlertCircle, Eye, EyeOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin?: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const ensureSession = async () => {
        const href = window.location.href || '';
        if (href.includes('access_token=') && href.includes('refresh_token=')) {
          const accessMatch = href.match(/access_token=([^&]+)/);
          const refreshMatch = href.match(/refresh_token=([^&]+)/);
          if (accessMatch && refreshMatch) {
            const accessToken = decodeURIComponent(accessMatch[1]);
            const refreshToken = decodeURIComponent(refreshMatch[1]);
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        }
      };
      ensureSession();
    }
  }, [isOpen]);

  if (!isOpen) return null;

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

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // Ensure session is active from URL parameters before updating
      const href = window.location.href || '';
      if (href.includes('access_token=') && href.includes('refresh_token=')) {
        const accessMatch = href.match(/access_token=([^&]+)/);
        const refreshMatch = href.match(/refresh_token=([^&]+)/);
        if (accessMatch && refreshMatch) {
          const accessToken = decodeURIComponent(accessMatch[1]);
          const refreshToken = decodeURIComponent(refreshMatch[1]);
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }

      // Native Supabase Auth password update
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update password. Link may be expired.');
      } else {
        setSuccess(true);
        // Clear recovery session cleanly
        await supabase.auth.signOut().catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while resetting password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-[#E4E3E0] border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer p-1"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#141414] text-white flex items-center justify-center font-mono font-bold">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-mono font-black uppercase text-base text-[#141414]">
              Reset Password
            </h3>
            <p className="font-mono text-xs text-[#141414]/60">
              AAMARVA Security Vault
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-emerald-500/10 border-2 border-emerald-600 text-emerald-950 font-mono text-xs flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase mb-1">Password Updated Successfully</p>
                <p className="text-emerald-900/80">
                  Your password has been changed via Supabase Auth. You can now log in with your new password.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                if (onSuccessLogin) onSuccessLogin();
              }}
              className="w-full py-3 bg-[#141414] text-white font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="font-mono text-xs text-[#141414]/80">
              Enter your new secure password below to complete the account recovery process.
            </p>

            {error && (
              <div className="p-3 bg-rose-500/10 border-2 border-rose-600 text-rose-950 font-mono text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block font-mono text-xs font-bold uppercase mb-1 text-[#141414]">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                  disabled={loading}
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
              <label className="block font-mono text-xs font-bold uppercase mb-1 text-[#141414]">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                  disabled={loading}
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
                className="flex-1 py-2.5 bg-white text-[#141414] font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-gray-100 cursor-pointer"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#141414] text-white font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
