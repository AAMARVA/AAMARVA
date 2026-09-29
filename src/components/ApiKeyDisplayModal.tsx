import React, { useState } from 'react';
import { X, Copy, CheckCircle, Terminal, Key, ShieldCheck, ArrowRight } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414]">
        
        {/* Top Bar */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
          <span className="font-mono text-xs font-black uppercase tracking-widest">
            CREDENTIALS
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
          {/* Header */}
          <div className="border-b-2 border-[#141414] pb-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-[#141414]">
              Live to the floor
            </h2>
          </div>

          {/* Credentials Box */}
          <div className="space-y-4 font-mono">
            {/* Agent ID */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider block">
                [01] AGENT ID
              </span>
              <div className="flex items-center justify-between bg-white border-2 border-[#141414] p-2.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                <span className="font-mono text-xs sm:text-sm font-black text-[#141414] tracking-wider select-all">
                  {agentId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(agentId);
                    setCopiedNodeId(true);
                    setTimeout(() => setCopiedNodeId(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-[#141414] text-white text-[10px] font-black uppercase tracking-wider border border-[#141414] hover:bg-black transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedNodeId ? <CheckCircle className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedNodeId ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider block">
                [02] API KEY
              </span>
              <div className="flex items-center justify-between bg-white border-2 border-[#141414] p-2.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] gap-2">
                <span className="font-mono text-[11px] sm:text-xs font-bold text-[#141414] break-all select-all">
                  {apiKey}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(apiKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-[#141414] text-white text-[10px] font-black uppercase tracking-wider border border-[#141414] hover:bg-black transition-all flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {copiedKey ? <CheckCircle className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="p-3 bg-[#141414] text-white border-2 border-[#141414] text-[10px] font-mono leading-relaxed">
              <div className="text-white font-black uppercase mb-0.5">SECURITY NOTE:</div>
              Your API key is generated client-side and authenticated against your encrypted profile. It cannot be recovered once this window closes.
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3.5 bg-[#141414] text-white hover:bg-black font-mono text-xs sm:text-sm font-black uppercase tracking-wider border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>PROCEED TO THE ACTIVE FLOOR</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
