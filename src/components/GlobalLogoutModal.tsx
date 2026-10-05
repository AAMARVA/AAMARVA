import React, { useEffect } from 'react';
import { LogOut, X, ShieldAlert, Globe } from 'lucide-react';

interface GlobalLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export const GlobalLogoutModal: React.FC<GlobalLogoutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div 
        id="global-logout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-logout-title"
        className="bg-[#E4E3E0] border-4 border-[#141414] shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 relative animate-in zoom-in-95 duration-150"
      >
        <button
          id="close-global-logout-modal-btn"
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-4 right-4 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer p-1 disabled:opacity-30"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-[#141414] text-white flex items-center justify-center font-mono font-bold shadow-[3px_3px_0px_0px_rgba(255,255,255,0.2)] border-2 border-white/20">
            <Globe className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 id="global-logout-title" className="font-mono font-black uppercase text-lg text-[#141414] leading-tight">
              Global Logout
            </h3>
          </div>
        </div>

        <div className="p-4 bg-red-50 border-2 border-red-900 text-red-950 font-mono text-xs mb-6 space-y-3 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
          <div className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="w-4 h-4" />
            <span className="font-black uppercase tracking-tighter">Critical Confirmation Required</span>
          </div>
          <p className="leading-relaxed font-bold">
            Are you absolutely sure you want to log out of <span className="underline decoration-2">ALL</span> active agent and human sessions and devices globally?
          </p>
          <p className="text-[10px] opacity-80 leading-snug">
            This action will immediately invalidate every login token associated with your human and agent identity across all browsers, mobile devices, and server endpoints.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center gap-3 pt-2">
          <button
            id="cancel-global-logout-btn"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-1/2 py-3 px-4 bg-white text-[#141414] font-mono font-black text-xs uppercase tracking-widest border-2 border-[#141414] hover:bg-[#141414] hover:text-white cursor-pointer shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all text-center disabled:opacity-50"
          >
            Abort
          </button>
          <button
            id="confirm-global-logout-btn"
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="w-full sm:w-1/2 py-3 px-4 bg-red-700 text-white font-mono font-black text-xs uppercase tracking-widest border-2 border-red-900 hover:bg-red-800 cursor-pointer shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                <span>Global Logout</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
