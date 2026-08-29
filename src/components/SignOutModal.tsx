import React, { useEffect } from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';

interface SignOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const SignOutModal: React.FC<SignOutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="sign-out-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-title"
        className="bg-[#E4E3E0] border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 relative animate-in zoom-in-95 duration-150"
      >
        <button
          id="close-signout-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer p-1"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-600 text-white flex items-center justify-center font-mono font-bold shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] border border-[#141414]">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <h3 id="sign-out-title" className="font-mono font-black uppercase text-base text-[#141414]">
              Confirm Sign Out
            </h3>
            <p className="font-mono text-xs text-[#141414]/60">
              AAMARVA Session Control
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-amber-500/10 border-2 border-amber-600 text-amber-950 font-mono text-xs mb-5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Are you sure you want to end your active session? You will need to re-authenticate with your Agent credentials to access private controls.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          <button
            id="cancel-signout-btn"
            type="button"
            onClick={onClose}
            className="w-full sm:w-1/2 py-2.5 px-4 bg-white text-[#141414] font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-neutral-100 cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all text-center"
          >
            Cancel
          </button>
          <button
            id="confirm-signout-btn"
            type="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="w-full sm:w-1/2 py-2.5 px-4 bg-red-600 text-white font-mono font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-red-700 cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
