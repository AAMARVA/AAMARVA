import React, { useState, useRef } from 'react';
import { 
  ArrowRight, 
  AlertCircle, 
  User, 
  Mail, 
  Lock,
  Eye,
  EyeOff,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';
import { AgentAvatar } from './AgentAvatar';

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
    profileAvatar: '',
    password: '',
    confirmPassword: '',
    fleetId: '',
  });
  const [avatarFileName, setAvatarFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setSubmitError('Image file size must be less than 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 512;
        let width = img.width;
        let height = img.height;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setFormData(prev => ({ ...prev, profileAvatar: compressed }));
          setAvatarFileName(file.name);
          setSubmitError('');
        } else {
          setFormData(prev => ({ ...prev, profileAvatar: rawDataUrl }));
          setAvatarFileName(file.name);
          setSubmitError('');
        }
      };
      img.onerror = () => {
        setFormData(prev => ({ ...prev, profileAvatar: rawDataUrl }));
        setAvatarFileName(file.name);
        setSubmitError('');
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setSubmitError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let avatarToUse = formData.profileAvatar.trim();
    if (!avatarToUse) {
      const initial = (formData.fullName.trim() || formData.email.trim() || 'A').charAt(0).toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#141414"/><text x="50%" y="54%" font-family="monospace" font-size="56" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
      avatarToUse = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    if (formData.password !== formData.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const emailToRegister = formData.email.trim();
      const result = await register(
        emailToRegister, 
        formData.password, 
        formData.fullName.trim(), 
        undefined, 
        undefined, 
        avatarToUse, 
        formData.fleetId.trim()
      );
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
            <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Profile Avatar (Optional)</label>
            <div className="flex items-center gap-2">
              <label 
                htmlFor="register-avatar-upload"
                className="relative flex-1 flex items-center cursor-pointer group"
              >
                <ImageIcon className="absolute left-3 w-4 h-4 text-[#141414]/40 group-hover:text-[#141414] transition-colors pointer-events-none" />
                <input
                  type="text"
                  readOnly
                  value={avatarFileName}
                  placeholder="Choose image file..."
                  className="w-full pl-10 pr-24 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none cursor-pointer select-none pointer-events-none text-[#141414] placeholder:text-[#141414]/40"
                />
                <span
                  className="absolute right-1 px-2.5 py-1 bg-[#141414] text-white hover:bg-neutral-800 text-[10px] font-mono font-bold uppercase flex items-center gap-1 border border-[#141414] cursor-pointer select-none transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload</span>
                </span>
              </label>
              <input
                id="register-avatar-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileUpload}
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                }}
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', opacity: 0, width: '1px', height: '1px' }}
                tabIndex={-1}
                aria-hidden="true"
              />

              {/* Avatar Preview Box */}
              <label 
                htmlFor="register-avatar-upload"
                className="w-10 h-10 shrink-0 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-center overflow-hidden cursor-pointer hover:bg-neutral-50 transition-colors"
                title="Upload avatar image"
              >
                {formData.profileAvatar ? (
                  <AgentAvatar
                    avatar={formData.profileAvatar}
                    name={formData.fullName || 'Agent'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-[#141414]/30" />
                )}
              </label>
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
          
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Fleet I'd</label>
              <span className="font-mono text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-[#141414] text-white">
                OPTIONAL
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                value={formData.fleetId}
                onChange={e => setFormData({...formData, fleetId: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
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
