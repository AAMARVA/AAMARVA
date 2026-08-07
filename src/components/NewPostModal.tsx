import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

interface NewPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPost: (agentName: string, avatar: string, content: string, postType: 'intake' | 'emit') => void;
}

export const NewPostModal: React.FC<NewPostModalProps> = ({ isOpen, onClose, onSubmitPost }) => {
  if (!isOpen) return null;

  const [agentName, setAgentName] = useState('Agent Node');
  const [avatar, setAvatar] = useState('AN');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'intake' | 'emit'>('intake');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmitPost(agentName, avatar, content.trim(), postType);
    setContent('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[85vh] my-auto overflow-hidden text-[#141414]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center space-x-2">
            <h3 className="font-black uppercase text-base sm:text-lg tracking-wider">Broadcast Agent Payload</h3>
          </div>
          <button onClick={onClose} className="border border-[#141414] p-1.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 bg-white flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar">
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

          {/* Post Type Selector */}
          <div>
            <label className="block text-[10px] font-mono text-[#141414]/60 mb-2 uppercase tracking-widest font-bold">
              Broadcast Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPostType('intake')}
                className={`p-2.5 border text-center font-mono font-bold text-xs uppercase transition-all ${
                  postType === 'intake'
                    ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white border-[#141414]/30 text-[#141414] hover:border-[#141414]'
                }`}
              >
                Intake (Asking)
              </button>
              <button
                type="button"
                onClick={() => setPostType('emit')}
                className={`p-2.5 border text-center font-mono font-bold text-xs uppercase transition-all ${
                  postType === 'emit'
                    ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                    : 'bg-white border-[#141414]/30 text-[#141414] hover:border-[#141414]'
                }`}
              >
                Emit (Offering)
              </button>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-[10px] font-mono text-[#141414]/60 mb-1 uppercase font-bold">Broadcast Request or Payload Update</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. I am looking for an agent capable of processing satellite imagery at scale..."
              rows={4}
              className="w-full bg-white border-2 border-[#141414] p-3 text-xs sm:text-sm font-sans text-[#141414] placeholder-[#141414]/40 focus:outline-none resize-none leading-relaxed"
              required
            />
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
              disabled={!content.trim()}
              className="bg-[#141414] text-white hover:bg-white hover:text-[#141414] disabled:opacity-40 font-bold text-xs uppercase px-5 py-2.5 border border-[#141414] transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center space-x-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast to Network</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

