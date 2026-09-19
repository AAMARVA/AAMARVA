import React, { useState, useEffect } from 'react';
import { CheckCircle2, RotateCw, ArrowRight, AlertTriangle, Key, ShieldCheck, Copy, Check } from 'lucide-react';
import { confirmAgentApiKeyRotationApi } from '../services/authApi';
import { executeWebAuthnAssertion } from '../services/webauthnClient';

interface ConfirmApiKeyRotationViewProps {
  token: string;
  onBackToHome: () => void;
}

export const ConfirmApiKeyRotationView: React.FC<ConfirmApiKeyRotationViewProps> = ({ 
  token, 
  onBackToHome 
}) => {
  const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');
  const [error, setError] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [requiresWebAuthn, setRequiresWebAuthn] = useState(false);
  const [webAuthnData, setWebAuthnData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleConfirm = async (webAuthnOverride?: any) => {
    if (!token) {
      setError('No rotation token provided.');
      setStatus('error');
      return;
    }

    setStatus('verifying');
    try {
      const res = await confirmAgentApiKeyRotationApi(token, webAuthnOverride);
      
      if (res.requiresWebAuthn) {
        setWebAuthnData(res);
        setRequiresWebAuthn(true);
        setStatus('pending');
        return;
      }

      setNewApiKey(res.apiKey);
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Rotation failed. The link may be expired or invalid.');
      setStatus('error');
    }
  };

  const handleWebAuthnAssertion = async () => {
    if (!webAuthnData) return;
    
    setStatus('verifying');
    try {
      const isSetup = webAuthnData.status === 'WEBAUTHN_SETUP_REQUIRED';
      const credentialResponse = await executeWebAuthnAssertion(webAuthnData.options, isSetup);
      
      await handleConfirm({
        pendingToken: webAuthnData.pendingToken,
        credentialResponse,
        isSetup
      });
    } catch (err: any) {
      setError(err.message || 'Biometric hardware verification failed.');
      setStatus('error');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!token) {
      setError('No rotation token provided.');
      setStatus('error');
    }
  }, [token]);

  return (
    <div className="w-full max-w-xl mx-auto py-12 animate-in fade-in duration-500">
      <div className="bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-8 sm:p-12 text-[#141414]">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-[#141414] text-white rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
            <Key className="w-8 h-8" />
          </div>
        </div>

        <div className="text-center space-y-6">
          <h1 className="text-3xl font-serif italic tracking-tight">API Key Security</h1>
          <div className="h-0.5 w-16 bg-black mx-auto"></div>

          {status === 'pending' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <p className="font-mono text-sm uppercase tracking-widest text-[#141414]/80">
                {requiresWebAuthn ? 'Hardware Proof Required' : 'Final Step Required'}
              </p>
              
              <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] font-mono text-xs leading-relaxed text-left">
                {requiresWebAuthn 
                  ? 'AAMARVA security protocols require a cryptographic hardware assertion to rotate your API key. Please use your device passkey or security key.' 
                  : 'You are about to rotate your agent API key. This will invalidate the existing key and generate a new one immediately.'}
              </div>

              {requiresWebAuthn ? (
                <button
                  onClick={handleWebAuthnAssertion}
                  className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 animate-pulse" />
                  Verify with Passkey
                </button>
              ) : (
                <button
                  onClick={() => handleConfirm()}
                  className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Confirm Rotation
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {status === 'verifying' && (
            <div className="space-y-4 py-8">
              <RotateCw className="w-8 h-8 animate-spin mx-auto text-[#141414]" />
              <p className="font-mono text-xs uppercase tracking-widest text-[#141414]/70">Generating new key...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-[#E4E3E0]/30 border-2 border-[#141414] text-[#141414] flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#141414] shrink-0" />
                <p className="text-sm font-mono font-bold uppercase tracking-tight text-left">New API Key Generated</p>
              </div>
              
              <div className="space-y-2">
                <p className="font-mono text-xs text-[#141414]/60 uppercase text-left">Your New Secret Key</p>
                <div className="relative group">
                  <div className="p-4 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs font-bold break-all pr-12">
                    {newApiKey}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-sm transition-colors text-white"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-4 border-l-4 border-[#141414] bg-yellow-50 text-left">
                <p className="text-[10px] font-mono font-black uppercase text-[#141414] mb-1">Critical Security Notice</p>
                <p className="text-xs font-mono text-[#141414]/80 leading-relaxed italic">
                  Store this key securely. It will never be shown again. All existing agent instances using the old key will now fail authentication and must be updated.
                </p>
              </div>

              <button
                onClick={onBackToHome}
                className="w-full py-4 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center gap-2"
              >
                Return to Home
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-red-50 border-2 border-red-800 text-red-900 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <p className="text-sm font-mono font-bold uppercase tracking-tight text-left">Rotation Error</p>
              </div>

              <div className="p-4 bg-white border-2 border-[#141414] font-mono text-xs text-red-600 font-bold">
                {error}
              </div>

              <p className="text-xs font-mono text-[#141414]/70 leading-relaxed italic text-left">
                Security tokens are single-use and expire after 30 minutes. If you need to rotate your key, please request a new link from your dashboard.
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
