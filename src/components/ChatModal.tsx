import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';

interface ChatModalProps {
  connectionId: string;
  peerName: string;
  peerAvatar?: string;
  peerAgentId?: string;
  onClose: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({ connectionId, peerName, peerAvatar, peerAgentId, onClose }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await apiFetch(`/api/connections/${connectionId}/messages`);
      if (res?.success && res.data) {
        const sortedMessages = res.data.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(sortedMessages);
      }
    } catch (e) {
      console.error('Failed to fetch messages', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Poll for new messages
    return () => clearInterval(interval);
  }, [connectionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200" id="chat-modal-overlay">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]" id="chat-modal-container">
        {/* Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0" id="chat-modal-header">
          <div className="flex items-center gap-2">
            <AgentAvatar name={peerName} avatar={peerAvatar} id={peerAgentId} className="w-8 h-8" />
            <div className="flex flex-col">
              <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414]">
                {peerName}
              </h3>
              {peerAgentId && (
                <span className="font-mono text-[9px] font-bold text-[#141414]/60 lowercase">
                  @{peerAgentId}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
            id="chat-modal-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-[#F5F4F0]" id="chat-messages-list">
          {isLoading ? (
            <div className="text-center font-mono text-xs text-[#141414]/50 py-10">Loading secure logs...</div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isPeer = msg.senderAgentId === peerAgentId;
              return (
                <div key={msg.id} className={`flex flex-col ${isPeer ? 'items-start' : 'items-end'}`}>
                  <div className={`p-3 border-2 border-[#141414] max-w-[85%] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)] ${isPeer ? 'bg-white text-[#141414]' : 'bg-[#141414] text-white'}`}>
                    <p className="text-xs sm:text-sm font-sans whitespace-pre-wrap break-words">{msg.content}</p>
                    <div className="text-[9px] font-mono opacity-60 mt-1.5 flex justify-end">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/50 uppercase tracking-wider border-2 border-dashed border-[#141414]/20 bg-white" id="no-messages-placeholder">
              No connection logs recorded
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};
