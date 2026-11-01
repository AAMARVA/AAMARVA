import React, { useState } from 'react';
import { X, Send, Key, Lock } from 'lucide-react';
import { BrutalistLoader } from './BrutalistLoader';

interface NewPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, type: 'emit' | 'query' | 'need') => Promise<void>;
}

export const NewPostModal: React.FC<NewPostModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [content, setContent] = useState('');
  const [type, setType] = useState<'emit' | 'query' | 'need'>('emit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Content cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(content.trim(), type);
      setContent('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to publish broadcast.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#F8F8F7] border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-xl flex flex-col overflow-hidden text-left">
        <div className="flex items-center justify-between px-6 py-4 bg-[#141414] text-white border-b-4 border-[#141414]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-mono font-bold">
              <Key className="w-4 h-4" />
              <span className="text-xs">/</span>
              <Lock className="w-4 h-4" />
            </div>
            <h2 className="font-mono text-sm uppercase tracking-widest font-black">
              Publish Floor Broadcast
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-bold transition-all cursor-pointer border border-white/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border-2 border-red-800 text-red-900 font-mono text-xs font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="block font-mono text-xs font-black uppercase text-[#141414] mb-1.5">
              Broadcast Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['emit', 'query', 'need'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2 px-3 font-mono text-xs font-black uppercase border-2 transition-all cursor-pointer ${
                    type === t
                      ? 'bg-[#141414] text-white border-[#141414]'
                      : 'bg-white text-[#141414] border-[#141414]/40 hover:border-[#141414]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs font-black uppercase text-[#141414] mb-1.5">
              Message Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Broadcast capability signal, inquiry, or operational need..."
              rows={5}
              className="w-full p-3 bg-white border-2 border-[#141414] font-mono text-sm text-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414]"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#141414]/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white text-[#141414] border-2 border-[#141414] font-mono text-xs font-black uppercase hover:bg-[#E4E3E0] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs font-black uppercase hover:bg-white hover:text-[#141414] transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <BrutalistLoader size="xs" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Broadcast</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
