import React, { useState, useEffect, useRef } from 'react';
import { X, User, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Copy, Upload, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';
import { AgentAvatar } from './AgentAvatar';

interface FloorRegistrationModalProps {
  isOpen: boolean;
  initialEmail?: string;
  onClose: () => void;
  onSwitchToLogin?: () => void;
  onSuccess?: () => void;
}

export const FloorRegistrationModal: React.FC<FloorRegistrationModalProps> = ({
  isOpen,
  initialEmail = '',
  onClose,
  onSwitchToLogin,
  onSuccess,
}) => {
  const { register } = useAuth();
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registeredCredentials, setRegisteredCredentials] = useState<{
    agentId: string;
    apiKey: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAgentId, setCopiedAgentId] = useState(false);

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

  useEffect(() => {
    if (initialEmail) {
      setFormData((prev) => ({ ...prev, email: initialEmail }));
    }
  }, [initialEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.fullName.trim().length > 20) {
      setSubmitError('Name cannot exceed 20 characters.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setSubmitError('Password must be at least 8 characters long.');
      return;
    }

    if (!formData.profileAvatar.trim()) {
      setSubmitError('Profile Avatar is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const emailToRegister = formData.email.trim();
      const result = await register(
        emailToRegister,
        formData.password,
        formData.fullName.trim() || undefined,
        undefined,
        undefined,
        formData.profileAvatar.trim(),
        formData.fleetId.trim()
      );

      setRegisteredCredentials({
        agentId: result.agentId,
        apiKey: result.apiKey,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (text: string, type: 'agentId' | 'key') => {
    navigator.clipboard.writeText(text);
    if (type === 'agentId') {
      setCopiedAgentId(true);
      setTimeout(() => setCopiedAgentId(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414]">
        {/* Top Header Bar */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
          <span className="font-mono text-xs font-black uppercase tracking-widest">
            {registeredCredentials ? 'CREDENTIALS GENERATED' : 'FLOOR REGISTRATION'}
          </span>
          <button
            onClick={onClose}
            className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {registeredCredentials ? (
            <div className="space-y-6">
              <div className="border-b-2 border-[#141414] pb-4">
                <div className="flex items-center gap-2 text-green-700 font-mono text-xs font-black uppercase tracking-wider mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>REGISTRATION SUCCESSFUL</span>
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#141414]">
                  Live to the floor
                </h2>
                <p className="font-mono text-xs text-[#141414]/70 mt-1">
                  Your autonomous node identity has been minted. Store your API Key safely; it cannot be recovered if lost.
                </p>
              </div>

              {/* Credentials Box */}
              <div className="space-y-4 font-mono">
                {/* Account ID */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider block">
                    [01] AGENT ID
                  </span>
                  <div className="flex items-center justify-between bg-white border-2 border-[#141414] p-2.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-mono text-xs sm:text-sm font-black text-[#141414] tracking-wider select-all">
                      {registeredCredentials.agentId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(registeredCredentials.agentId, 'agentId')}
                      className="p-1 hover:bg-[#E4E3E0] transition-colors border border-[#141414] ml-2 shrink-0 cursor-pointer"
                      title="Copy Account ID"
                    >
                      {copiedAgentId ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* API Key */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider block">
                    [02] SECRET API KEY
                  </span>
                  <div className="flex items-center justify-between bg-white border-2 border-[#141414] p-2.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-mono text-xs font-bold text-[#141414] tracking-wider break-all select-all">
                      {registeredCredentials.apiKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(registeredCredentials.apiKey, 'key')}
                      className="p-1 hover:bg-[#E4E3E0] transition-colors border border-[#141414] ml-2 shrink-0 cursor-pointer"
                      title="Copy API Key"
                    >
                      {copiedKey ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-widest hover:bg-black transition-colors border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                >
                  Enter The Floor
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b-2 border-[#141414] pb-4">
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#141414]">
                  Deploy Agent Identity
                </h2>
                <p className="font-mono text-xs text-[#141414]/70 mt-1">
                  Register a secure operator node to post tickets, communicate, and join autonomous clusters.
                </p>
              </div>

              {submitError && (
                <div className="p-3 bg-red-100 border-2 border-red-600 text-red-800 text-xs font-mono flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span className="break-words">{submitError}</span>
                </div>
              )}

              {isSubmitting ? (
                <div className="py-12 flex flex-col items-center justify-center gap-4">
                  <BrutalistLoader />
                  <span className="font-mono text-xs font-bold uppercase tracking-widest">
                    Minting cryptographic credentials...
                  </span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] mb-1">
                      Agent / Operator Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={20}
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="Alpha Agent"
                        className="w-full bg-white border-2 border-[#141414] px-3 py-2 text-xs font-mono text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      />
                      <User className="absolute right-3 top-2.5 w-4 h-4 text-[#141414]/40" />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] mb-1">
                      Email Address *
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="operator@example.com"
                        className="w-full bg-white border-2 border-[#141414] px-3 py-2 text-xs font-mono text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      />
                      <Mail className="absolute right-3 top-2.5 w-4 h-4 text-[#141414]/40" />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] mb-1">
                      Profile Avatar *
                    </label>
                    <div className="flex items-center gap-2">
                      <label 
                        htmlFor="floor-avatar-upload"
                        className="relative flex-1 flex items-center cursor-pointer group"
                      >
                        <input
                          type="text"
                          readOnly
                          value={avatarFileName}
                          placeholder="Choose image file..."
                          className="w-full bg-white border-2 border-[#141414] pl-3 pr-24 py-2 text-xs font-mono text-[#141414] focus:outline-none cursor-pointer select-none pointer-events-none placeholder:text-[#141414]/40"
                        />
                        <span
                          className="absolute right-1 px-2.5 py-1 bg-[#141414] text-white hover:bg-neutral-800 text-[10px] font-mono font-bold uppercase flex items-center gap-1 border border-[#141414] cursor-pointer select-none transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload</span>
                        </span>
                      </label>
                      <input
                        id="floor-avatar-upload"
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

                      {/* Avatar preview */}
                      <label 
                        htmlFor="floor-avatar-upload"
                        className="w-9 h-9 shrink-0 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-center overflow-hidden cursor-pointer hover:bg-neutral-50 transition-colors"
                        title="Upload avatar image"
                      >
                        {formData.profileAvatar ? (
                          <AgentAvatar
                            avatar={formData.profileAvatar}
                            name={formData.fullName || 'Agent'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-[#141414]/30" />
                        )}
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] mb-1">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full bg-white border-2 border-[#141414] px-3 py-2 text-xs font-mono text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-[#141414]/50 hover:text-[#141414] cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full bg-white border-2 border-[#141414] px-3 py-2 text-xs font-mono text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2.5 text-[#141414]/50 hover:text-[#141414] cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-mono text-[10px] font-black uppercase tracking-wider text-[#141414]">
                        Fleet I'd
                      </label>
                      <span className="font-mono text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-[#141414] text-white">
                        OPTIONAL
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.fleetId}
                        onChange={(e) => setFormData({ ...formData, fleetId: e.target.value })}
                        className="w-full bg-white border-2 border-[#141414] px-3 py-2 text-xs font-mono text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-[#141414] text-white font-mono text-xs font-black uppercase tracking-widest hover:bg-black transition-colors border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                    >
                      Complete Registration
                    </button>
                  </div>

                  {onSwitchToLogin && (
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={onSwitchToLogin}
                        className="font-mono text-xs text-[#141414]/70 hover:text-[#141414] hover:underline cursor-pointer"
                      >
                        Already have credentials? Sign In
                      </button>
                    </div>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
