import React, { useState } from 'react';
import { 
  ArrowRight, 
  AlertCircle, 
  User, 
  Mail, 
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';

interface RegisterFormProps {
  onSuccess?: (credentials: { agentId: string; apiKey: string }) => void;
  onCancel?: () => void;
  onGoToLogin?: (email: string) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onCancel, onGoToLogin }) => {
  const { register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const emailToRegister = formData.email.trim();
      const result = await register(emailToRegister, formData.password, formData.fullName.trim());
      setCreatedEmail(emailToRegister);
      if (onSuccess) {
        onSuccess({ agentId: result.agentId, apiKey: result.apiKey });
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <div className="bg-white border-4 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] max-w-xl mx-auto space-y-6 font-mono text-xs text-[#141414]">
        <BrutalistLoader />
        <p className="text-center font-bold">Creating your account...</p>
      </div>
    );
  }

  // Instant Account Created Confirmation Page
  if (createdEmail) {
    return (
      <div className="bg-white border-2 border-black max-w-xl mx-auto flex flex-col text-black">
        <div className="p-8 border-b-2 border-black">
          <h2 className="text-xl font-bold tracking-tighter">Account Created</h2>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest">Account Confirmation</p>
            <p className="text-2xl font-bold break-all">
              {createdEmail}
            </p>
          </div>

          <div className="py-8 border-y-2 border-black text-sm">
            <p>Your account has been successfully created. You can now log in with your credentials.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onGoToLogin) {
                onGoToLogin(createdEmail);
              } else if (onCancel) {
                onCancel();
              }
            }}
            className="w-full py-4 bg-black text-white hover:bg-white hover:text-black border-2 border-black text-sm font-bold uppercase tracking-widest transition-all"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] max-w-xl mx-auto flex flex-col text-[#141414]">
      <div className="bg-[#141414] text-white p-4 font-mono uppercase border-b-2 border-[#141414]">
        <h2 className="text-xs font-black tracking-widest">Create Account</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
        {submitError && (
          <div className="p-3.5 bg-white border-2 border-[#141414] font-mono text-xs text-[#141414] font-bold flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#141414] font-bold mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Full Name *</label>
            <div className="relative flex items-center">
              <User className="absolute left-3 w-4 h-4 text-[#141414]/40" />
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Email Address *</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3 w-4 h-4 text-[#141414]/40" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Password *</label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4 text-[#141414]/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full pl-10 pr-10 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
              <button
                type="button"
                className="absolute right-3 text-[#141414]/40 hover:text-[#141414]"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Confirm Password *</label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4 text-[#141414]/40" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                className="w-full pl-10 pr-10 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
              <button
                type="button"
                className="absolute right-3 text-[#141414]/40 hover:text-[#141414]"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-[#141414] text-white text-xs font-black uppercase tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:bg-black hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Create Account</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
      
      <div className="px-8 pb-8 text-center text-xs font-mono">
        Already have an account?{' '}
        <button onClick={onCancel} className="underline font-bold">
          Log in
        </button>
      </div>
    </div>
  );
};
