import React, { useState } from 'react';
import { Fingerprint, ShieldCheck, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { handleWebAuthnSetup } from '../services/webauthnClient';

interface WebAuthnEnableModalProps {
  isOpen: boolean;
  pendingToken: string;
  options: any;
  userName?: string;
  onSuccess: (userData: any) => void;
  onCancel: () => void;
}

export const WebAuthnEnableModal: React.FC<WebAuthnEnableModalProps> = ({
  isOpen,
  pendingToken,
  options,
  userName = 'User',
  onSuccess,
  onCancel,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEnableWebAuthn = async () => {
    setIsRegistering(true);
    setError(null);
    try {
      const userData = await handleWebAuthnSetup(
        pendingToken,
        options,
        `${userName}'s Device Passkey`
      );
      onSuccess(userData);
    } catch (err: any) {
      setError(err?.message || 'Device passkey registration was cancelled. A registered passkey is required to complete login.');
    } finally {
      setIsRegistering(false);
    }
  };

  const isEmbeddedIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 font-mono animate-fade-in">
      {/* Absolute Minimalist White Card with thick black border */}
      <div className="bg-white border-2 border-black max-w-lg w-full max-h-[92vh] flex flex-col shadow-none text-black relative">
        
        {/* Top Header Section */}
        <div className="p-6 border-b border-black space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="bg-black text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                CREDENTIALS VERIFIED
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-4 pt-1">
            <div className="p-3 bg-zinc-100 border border-black text-black flex-shrink-0">
              <Fingerprint className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-black uppercase">
                ENABLE WEBAUTHN SECURITY
              </h3>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Password authentication succeeded. To establish a human session and access AAMARVA controls, you must enable WebAuthn hardware biometrics.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Details Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          
          {/* Status Box */}
          <div className="p-4 bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-black font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-black" />
              <span>HARDWARE BIOMETRIC POLICY ACTIVE</span>
            </div>
            <p className="text-zinc-600 text-[11px] leading-relaxed">
              Enabling WebAuthn creates a bound cryptographic passkey using your device's Touch ID, Face ID, Windows Hello, or Security Key.
            </p>
          </div>



          {/* Error & Iframe Notice */}
          {error && (
            <div className="p-4 border-2 border-black bg-zinc-50 text-black text-xs space-y-3">
              <div className="font-bold flex items-center space-x-2 text-black uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-black" />
                <span>AUTHENTICATION NOTICE</span>
              </div>
              <p className="leading-relaxed text-[11px] text-zinc-700">{error}</p>

              {isEmbeddedIframe && (
                <div className="pt-3 border-t border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-500">
                    Embedded preview detected: If biometrics fail in iframe, open in full tab.
                  </span>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-black text-white text-xs font-black uppercase tracking-wider hover:bg-zinc-800 whitespace-nowrap self-end sm:self-auto"
                  >
                    <span>OPEN NEW TAB</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-black bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRegistering}
            className="w-full sm:w-auto px-5 py-3 border border-zinc-300 hover:border-black text-zinc-600 hover:text-black uppercase font-bold text-xs tracking-wider transition-colors disabled:opacity-50"
          >
            CANCEL LOGIN
          </button>
          
          <button
            type="button"
            onClick={handleEnableWebAuthn}
            disabled={isRegistering}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-black text-white hover:bg-zinc-850 border-2 border-black px-6 py-3 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:translate-y-0.5"
          >
            {isRegistering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>PROMPTING BIOMETRICS...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-4 h-4 text-white" />
                <span>ENABLE WEBAUTHN & PROCEED</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
