import React from 'react';
import { X } from 'lucide-react';
import { RegisterForm } from './RegisterForm';

interface FloorRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess: (credentials: { agentId: string; apiKey: string }) => void;
}

export const FloorRegistrationModal: React.FC<FloorRegistrationModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  onSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] overflow-y-auto">
        
        {/* Top Bar */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
          <span className="font-mono text-xs font-black uppercase tracking-widest">
            FLOOR ENROLLMENT
          </span>
          <button
            onClick={onClose}
            className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          <RegisterForm onSuccess={onSuccess} onCancel={onClose} initialEmail={initialEmail} />
        </div>
      </div>
    </div>
  );
};
