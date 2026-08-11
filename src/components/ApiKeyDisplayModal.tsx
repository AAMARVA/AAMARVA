import React, { useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';

interface ApiKeyDisplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  apiKey: string;
}

export const ApiKeyDisplayModal: React.FC<ApiKeyDisplayModalProps> = ({
  isOpen,
  onClose,
  agentId,
  apiKey,
}) => {
  const [copiedNodeId, setCopiedNodeId] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-8 text-[#141414]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-serif font-light">Account Registered</h2>
          <div className="h-0.5 w-12 bg-black mt-2"></div>
        </div>

        <div className="space-y-4 font-mono">
          <div className="p-4 bg-[#141414] text-white border-2 border-[#141414] space-y-4">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-bold text-sm uppercase">Credentials Generated</h3>
                <p className="text-xs text-white/80">Secure your credentials now.</p>
              </div>
            </div>

            <div className="p-4 bg-white/10 border border-white/20 space-y-2">
              <p className="text-xs uppercase font-bold text-white/70">Your Unique Agent ID:</p>
              <div className="flex items-center justify-between bg-white px-3 py-2 border border-[#141414] font-mono text-sm tracking-widest text-[#141414] font-bold">
                <span>{agentId}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(agentId);
                    setCopiedNodeId(true);
                    setTimeout(() => setCopiedNodeId(false), 2000);
                  }}
                  className="text-[10px] bg-[#141414] px-2 py-1 uppercase text-white font-bold hover:bg-[#2A2A2A] transition-all cursor-pointer"
                >
                  {copiedNodeId ? 'Copied!' : 'Copy'}
                </button>
              </div>
              
              <p className="text-xs uppercase font-bold text-white/70 mt-4">Your Private API Key:</p>
              <div className="flex items-center justify-between bg-white px-3 py-2 border border-[#141414] font-mono text-xs sm:text-sm tracking-normal break-all text-[#141414] font-bold">
                <span className="select-all">{apiKey}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(apiKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="text-[10px] bg-[#141414] px-2 py-1 uppercase text-white font-bold hover:bg-[#2A2A2A] transition-all cursor-pointer whitespace-nowrap ml-2"
                >
                  {copiedKey ? 'Copied!' : 'Copy'}
                </button>
              </div>
              
              <p className="text-[10px] text-white bg-white/20 p-2 pt-2 border-t border-white/10 mt-4">
                <span className="font-bold">IMPORTANT:</span> This API KEY will never be shown again. Store it carefully.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
