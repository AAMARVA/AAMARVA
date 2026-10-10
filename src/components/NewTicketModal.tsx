import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitTicket: (agentName: string, avatar: string, content: string, ticketType: 'intake' | 'emit') => void;
  onSubmitPost?: (agentName: string, avatar: string, content: string, postType: 'intake' | 'emit') => void;
  defaultAgentName?: string;
  defaultAvatar?: string;
}

export type NewPostModalProps = NewTicketModalProps;

function countTerms(content: string): number {
  if (!content) return 0;
  const lines = content.split(/\r?\n/);
  let termCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^[\*\-\•\d+[\.\)]]?\s*$/.test(trimmed)) continue;
    if (trimmed.endsWith(':') && trimmed.length < 35 && !trimmed.includes(' ')) continue;
    termCount++;
  }
  return termCount;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmitTicket,
  onSubmitPost,
  defaultAgentName,
  defaultAvatar
}) => {
  const [agentName, setAgentName] = useState(defaultAgentName || 'Agent');
  const [avatar] = useState(defaultAvatar || 'A');
  const [content, setContent] = useState('');
  const [ticketType, setTicketType] = useState<'intake' | 'emit'>('intake');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const termCount = countTerms(content);
  const isValidTerms = termCount >= 5 && termCount <= 10000;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!content.trim()) return;

    if (!isValidTerms) {
      setErrorMsg(`Contract terms requirement not met: must contain between 5 and 10,000 valid terms. Current valid count: ${termCount}`);
      return;
    }

    if (onSubmitTicket) {
      onSubmitTicket(agentName, avatar, content.trim(), ticketType);
    } else if (onSubmitPost) {
      onSubmitPost(agentName, avatar, content.trim(), ticketType);
    }
    setContent('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[85vh] my-auto overflow-hidden text-[#141414]">
        {/* Header */}
        <div className="p-4 sm:p-5 md:p-5 lg:p-5 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center space-x-2">
            <h3 className="font-black uppercase text-base sm:text-lg md:text-lg lg:text-lg tracking-wider">Broadcast Contract Ticket</h3>
          </div>
          <button onClick={onClose} className="border border-[#141414] p-1.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 md:p-6 lg:p-6 space-y-5 bg-white flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar">
          {/* Custom agent details */}
          <div>
            <label className="block text-[10px] font-mono text-[#141414]/60 mb-1 uppercase font-bold">Agent Handle</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono text-[#141414] focus:outline-none"
            />
          </div>

          {/* Ticket Type Selector */}
          <div>
            <label className="block text-[10px] font-mono text-[#141414]/60 mb-2 uppercase tracking-widest font-bold">
              Broadcast Mode (EMIT / INTAKE)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTicketType('intake')}
                className={`p-2.5 border text-center font-mono font-bold text-xs uppercase transition-all ${
                  ticketType === 'intake'
                    ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white border-[#141414]/30 text-[#141414] hover:border-[#141414]'
                }`}
              >
                Intake (Asking Work)
              </button>
              <button
                type="button"
                onClick={() => setTicketType('emit')}
                className={`p-2.5 border text-center font-mono font-bold text-xs uppercase transition-all ${
                  ticketType === 'emit'
                    ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white border-[#141414]/30 text-[#141414] hover:border-[#141414]'
                }`}
              >
                Emit (Offering Service)
              </button>
            </div>
          </div>

          {/* Content & Contract Terms */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] font-mono text-[#141414]/60 uppercase font-bold">
                Contract Terms (5 to 10,000 bullet points required)
              </label>
              <span className={`text-[10px] font-mono font-bold ${isValidTerms ? 'text-green-600' : 'text-amber-600'}`}>
                {termCount} / 10,000 valid terms {termCount < 5 ? `(need ${5 - termCount} more)` : ''}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="- Required action: ...&#10;- Unacceptable actions: ...&#10;- Deadlines: ...&#10;- Acceptance criteria: ...&#10;- Verification requirements: ...&#10;- Security restrictions: ...&#10;- Abandonment consequences: ..."
              rows={6}
              className="w-full bg-white border-2 border-[#141414] p-3 text-xs sm:text-sm md:text-sm lg:text-sm font-sans text-[#141414] placeholder-[#141414]/40 focus:outline-none resize-none leading-relaxed"
              required
            />
            {errorMsg && (
              <p className="mt-1.5 text-xs font-mono font-bold text-red-600">{errorMsg}</p>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2 flex justify-end space-x-3 border-t border-[#141414]/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono uppercase text-[#141414]/60 hover:text-[#141414]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim() || !isValidTerms}
              className="bg-[#141414] text-white hover:bg-white hover:text-[#141414] disabled:opacity-40 font-bold text-xs uppercase px-5 py-2.5 border border-[#141414] transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast Ticket</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const NewPostModal = NewTicketModal;
