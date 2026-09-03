import React, { useState, useEffect } from 'react';
import { CheckCircle2, RotateCw, ArrowRight, AlertTriangle, Mail } from 'lucide-react';
import { verifyEmailChangeApi } from '../services/authApi';

interface EmailChangeVerificationViewProps {
  token: string;
  onSuccess: (newEmail: string) => void;
  onBackToHome: () => void;
}

export const EmailChangeVerificationView: React.FC<EmailChangeVerificationViewProps> = ({ 
  token, 
  onSuccess, 
  onBackToHome 
}) => {
  const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const handleConfirm = async () => {
    if (!token) {
      setError('No verification token provided.');
      setStatus('error');
      return;
    }

    setStatus('verifying');
    try {
      const res = await verifyEmailChangeApi(token);
      setNewEmail(res.email);
      setStatus('success');
      localStorage.setItem('aamarva_email_verified', 'true');
      onSuccess(res.email);
    } catch (err: any) {
      setError(err.message || 'Verification failed. The link may be expired or invalid.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!token) {
      setError('No verification token provided.');
      setStatus('error');
    }
  }, [token]);

  return (
    <div className="w-full max-w-xl mx-auto py-12 animate-in fade-in duration-500">
      <div className="bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-8 sm:p-12 md:p-12 lg:p-12 text-[#141414]">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-[#141414] text-white rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
            <Mail className="w-8 h-8" />
          </div>
        </div>

        <div className="text-center space-y-6">
          <h1 className="text-3xl font-serif italic tracking-tight">Identity Verification</h1>
          <div className="h-0.5 w-16 bg-black mx-auto"></div>

          {status === 'pending' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <p className="font-mono text-sm uppercase tracking-widest text-[#141414]/80">Final Step Required</p>
              
              <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs leading-relaxed text-left">
                You are about to finalize the email change for your account. This action will update your primary contact email.
              </div>

              <button
                onClick={handleConfirm}
                className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Confirm Email Change
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {status === 'verifying' && (
            <div className="space-y-4 py-8">
              <RotateCw className="w-8 h-8 animate-spin mx-auto text-[#141414]" />
              <p className="font-mono text-xs uppercase tracking-widest text-[#141414]/70">Updating email record...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] text-[#141414] flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#141414] shrink-0" />
                <p className="text-sm font-mono font-bold uppercase tracking-tight text-left">Email Address Updated</p>
              </div>
              
              <div className="space-y-2">
                <p className="font-mono text-xs text-[#141414]/60 uppercase">New Registered Email</p>
                <div className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-sm font-bold">
                  {newEmail}
                </div>
              </div>

              <p className="text-xs font-mono text-[#141414]/70 leading-relaxed italic">
                Your account security is maintained. You may now sign in with your new email address for support or recovery purposes. 
                Remember: dashboard access still requires your unique Agent ID.
              </p>

              <button
                onClick={onBackToHome}
                className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2"
              >
                Return to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-red-50 border-2 border-red-800 text-red-900 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <p className="text-sm font-mono font-bold uppercase tracking-tight text-left">Verification Error</p>
              </div>

              <div className="p-4 bg-white border-2 border-[#141414] font-mono text-xs text-red-600 font-bold">
                {error}
              </div>

              <p className="text-xs font-mono text-[#141414]/70 leading-relaxed italic">
                Security tokens are single-use and expire after 30 minutes. If you need to change your email, please request a new verification link from your dashboard.
              </p>

              <button
                onClick={onBackToHome}
                className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2"
              >
                Back to Login
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
