import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { useAuth } from '../context/AuthContext';

interface ChatModalProps {
  connectionId: string;
  peerName: string;
  peerAvatar?: string;
  peerAgentId?: string;
  onClose: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({ connectionId, peerName, peerAvatar, peerAgentId, onClose }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const responseData = await apiFetch(`/api/connections/${connectionId}/messages`);
      const data = responseData.data || responseData; // Handle both direct array and {success: true, data: [...]}
      if (Array.isArray(data)) {
        setMessages(data);
        setFetchError(null);
      } else {
        setFetchError(`Data is not an array: ${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Failed to fetch')) {
        console.warn('Network issue fetching messages:', e);
      } else {
        console.warn('Failed to fetch messages', e);
      }
      setFetchError(`Fetch failed: ${e.message}`);
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
  }, [messages.length]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200" id="chat-modal-overlay">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[640px] my-auto overflow-hidden text-[#141414]" id="chat-modal-container">
        {/* Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0" id="chat-modal-header">
          <div className="flex items-center gap-2">
            <AgentAvatar name={peerName} avatar={peerAvatar} id={peerAgentId} className="w-8 h-8" />
            <div className="flex flex-col">
              <h3 className="font-mono font-black uppercase text-xs sm:text-sm md:text-sm lg:text-sm tracking-wider text-[#141414]">
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
            <BrutalistLoader text="Accessing Secure Logs" size="sm" className="py-12" />
          ) : messages.length > 0 ? (
            messages.map((line, idx) => {
              const isString = typeof line === 'string';
              const match = isString ? line.match(/^([^:]+):\s*([\s\S]*)$/) : null;
              let senderId = '';
              let content = line;
              
              if (isString) {
                if (match) {
                  senderId = match[1];
                  content = match[2];
                }
              } else if (line && typeof line === 'object') {
                senderId = line.senderAgentId || 'Agent';
                content = line.content || '';
              }

              const isCurrentUser = senderId === user?.agentId;
              const msgAvatar = isCurrentUser ? user?.avatar : peerAvatar;
              const msgName = isCurrentUser ? (user?.name || senderId) : (peerName || senderId);

              return (
                <div key={idx} className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                  <AgentAvatar 
                    name={msgName} 
                    avatar={msgAvatar} 
                    id={senderId} 
                    className="w-8 h-8 shrink-0 mt-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]" 
                  />
                  <div className={`p-3 border-2 flex-1 max-w-[85%] ${isCurrentUser ? 'bg-[#141414] text-white border-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-white text-[#141414] border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)]'}`}>
                    <p className="text-xs sm:text-sm md:text-sm lg:text-sm font-mono whitespace-pre-wrap break-words">{content}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/50 uppercase tracking-wider border-2 border-dashed border-[#141414]/20 bg-white" id="no-messages-placeholder">
              {fetchError ? <span className="text-red-500 font-bold">{fetchError}</span> : "No connection logs recorded"}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};
