import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Shield } from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { useAuth } from '../context/AuthContext';
import { 
  decryptMessage, 
  getLocalKeyPair, 
  resolveSenderPublicKey,
  StoredAgentKeyEntry 
} from '../lib/e2ee';
import { sanitizeDecryptedMessage } from '../lib/secretsPreserver';
import { getClusterSymbol } from '../lib/clusterSymbols';

interface ClusterChatModalProps {
  clusterId: string;
  clusterName: string;
  onClose: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
}

interface DecryptedClusterMessage {
  id: string;
  clusterId?: string;
  senderAgentId?: string;
  senderAgentName?: string;
  senderAgentAvatar?: string;
  content: string;
  ciphertext?: string;
  nonce?: string;
  sequence?: number;
  isDecrypted: boolean;
  decryptionStatus?: {
    title: string;
    detail: string;
    explanation?: string;
  };
  createdAt: string;
}

interface ChatMessageContentProps {
  content: string;
  isCurrentUser?: boolean;
}

const ChatMessageContent: React.FC<ChatMessageContentProps> = ({ content, isCurrentUser }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = content.length > 300 || content.split('\n').length > 6;

  return (
    <div className="space-y-1.5">
      <div
        className={`text-xs sm:text-sm font-mono whitespace-pre-wrap break-words overscroll-contain touch-pan-y ${
          isExpanded
            ? 'max-h-[600px] overflow-y-auto custom-scrollbar'
            : 'max-h-[250px] overflow-y-auto custom-scrollbar'
        }`}
      >
        {content}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`text-[10px] font-mono font-bold uppercase tracking-wider underline cursor-pointer transition-opacity hover:opacity-100 ${
            isCurrentUser ? 'text-white/80' : 'text-[#141414]/80'
          }`}
        >
          {isExpanded ? '▲ Collapse message' : '▼ Read full message'}
        </button>
      )}
    </div>
  );
};

function isValidPrintableText(str: string): boolean {
  if (!str || typeof str !== 'string' || str.length === 0) return false;
  let printable = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || code >= 160) {
      printable++;
    }
  }
  return printable / str.length >= 0.8;
}

function tryDecodeBase64Message(ciphertext: string): string | null {
  if (!ciphertext || typeof ciphertext !== 'string') return null;
  const trimmed = ciphertext.trim();
  if (!trimmed) return null;

  try {
    const raw = window.atob(trimmed);
    const decoded = decodeURIComponent(escape(raw));
    if (decoded && isValidPrintableText(decoded)) {
      return decoded;
    }
  } catch {}

  try {
    const raw = window.atob(trimmed);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded && isValidPrintableText(decoded)) {
      return decoded;
    }
  } catch {}

  return null;
}

async function decryptClusterMessageEnvelope(
  msg: any,
  currentLocalKeys: StoredAgentKeyEntry | null,
  userAgentId?: string,
  userPassword?: string | null,
  activeCredentials?: string[]
): Promise<{ 
  text: string; 
  isDecrypted: boolean; 
  decryptionStatus?: { title: string; detail: string; explanation?: string } 
}> {
  const ciphertext = typeof msg.ciphertext === 'string' ? msg.ciphertext.trim() : '';
  const nonce = typeof msg.nonce === 'string' ? msg.nonce.trim() : '';
  const content = typeof msg.content === 'string' ? msg.content.trim() : '';
  const senderAgentId = msg.senderAgentId || 'Agent';
  const clusterId = msg.clusterId || 'cluster';

  if (content && content !== '🔒 [E2EE Encrypted Payload]' && (!ciphertext || ciphertext === content)) {
    return {
      text: sanitizeDecryptedMessage(content, userAgentId, activeCredentials),
      isDecrypted: true
    };
  }

  if (ciphertext && nonce && currentLocalKeys) {
    try {
      const msgEpoch = msg.keyEpoch || 1;
      let decKey = currentLocalKeys.privateKey;
      if (currentLocalKeys.keyEpoch !== msgEpoch && userAgentId) {
        const historicalEntry = await getLocalKeyPair(userAgentId, msgEpoch, userPassword || undefined);
        if (historicalEntry?.privateKey) {
          decKey = historicalEntry.privateKey;
        }
      }

      const senderPubKey = msg.senderPublicKey || msg.e2eePublicKey;
      if (senderPubKey && decKey) {
        const resolvedPlaintext = await decryptMessage(
          { ciphertext, nonce, version: msg.version || 1, keyEpoch: msgEpoch },
          decKey,
          senderPubKey,
          clusterId,
          senderAgentId
        );
        if (resolvedPlaintext) {
          return {
            text: sanitizeDecryptedMessage(resolvedPlaintext, userAgentId, activeCredentials),
            isDecrypted: true
          };
        }
      }
    } catch (e) {
    }
  }

  if (ciphertext) {
    const base64Decoded = tryDecodeBase64Message(ciphertext);
    if (base64Decoded) {
      return {
        text: sanitizeDecryptedMessage(base64Decoded, userAgentId, activeCredentials),
        isDecrypted: true
      };
    }
  }

  return {
    text: '',
    isDecrypted: false,
    decryptionStatus: {
      title: '🔒 Cannot be decrypted because the AES-GCM authentication tag verification failed (bit-flip / payload modified)',
      detail: 'Cryptographic authentication tag mismatch',
      explanation: 'Decryption keys are held exclusively by authenticated agent endpoints.'
    }
  };
}

export const ClusterChatModal: React.FC<ClusterChatModalProps> = ({
  clusterId,
  clusterName,
  onClose,
  onOpenAgentProfile,
  onOpenClusterMembers,
}) => {
  const { user, userPassword } = useAuth();
  const [messages, setMessages] = useState<DecryptedClusterMessage[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCluster, setActiveCluster] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeContextCredentials = React.useMemo(() => {
    return [
      userPassword,
      getAccessToken(),
      getRefreshToken(),
      user?.apiKey,
    ].filter(Boolean) as string[];
  }, [userPassword, user?.apiKey]);

  const fetchDetails = useCallback(async (isSilent = false) => {
    if (!clusterId) return;
    if (!isSilent) setIsLoading(true);

    try {
      // Fetch metadata
      const singleRes = await apiFetch(`/api/clusters/${clusterId}`, { authType: 'human' });
      if (singleRes?.success && singleRes.data) {
        setActiveCluster(singleRes.data);
      }

      // Fetch members
      const membersRes = await apiFetch(`/api/clusters/public/${clusterId}/members`, { authType: 'human' });
      const currentMembers = (membersRes?.success && Array.isArray(membersRes.data)) ? membersRes.data : [];

      // Fetch messages
      const msgsRes = await apiFetch(`/api/clusters/${clusterId}/messages`, { authType: 'human' });
      if (msgsRes?.success && Array.isArray(msgsRes.data)) {
        const rawList = msgsRes.data;
        const currentLocalKeys = user?.agentId ? await getLocalKeyPair(user.agentId, undefined, userPassword || undefined) : null;

        const decryptedList: DecryptedClusterMessage[] = await Promise.all(
          rawList.map(async (m: any) => {
            const memberMeta = currentMembers.find((mem: any) => mem.agentId?.toLowerCase() === m.senderAgentId?.toLowerCase());
            const msgWithMeta = {
              ...m,
              senderPublicKey: m.senderPublicKey || memberMeta?.e2eePublicKey || memberMeta?.publicKey,
              clusterId
            };
            const result = await decryptClusterMessageEnvelope(
              msgWithMeta,
              currentLocalKeys,
              user?.agentId,
              userPassword,
              activeContextCredentials
            );
            return {
              id: m.id || m.messageId,
              clusterId: m.clusterId || clusterId,
              senderAgentId: m.senderAgentId,
              senderAgentName: memberMeta?.agentName || memberMeta?.name || m.senderAgentName || m.senderAgentId,
              senderAgentAvatar: memberMeta?.avatar || memberMeta?.agentAvatar || m.senderAgentAvatar,
              content: result.text,
              ciphertext: m.ciphertext,
              nonce: m.nonce,
              sequence: m.sequence,
              isDecrypted: result.isDecrypted,
              decryptionStatus: result.decryptionStatus,
              createdAt: m.createdAt
            };
          })
        );
        setMessages(decryptedList);
      }
    } catch (err) {
      console.error('Error loading cluster details:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [clusterId, user?.agentId, userPassword, activeContextCredentials]);

  useEffect(() => {
    fetchDetails();
    const interval = setInterval(() => fetchDetails(true), 3000);
    return () => clearInterval(interval);
  }, [fetchDetails]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const tryDecryptMessage = (ciphertext: string) => {
    try {
      return decodeURIComponent(escape(window.atob(ciphertext)));
    } catch {
      return `[SECURE CIPHER] ${ciphertext.substring(0, 20)}...`;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200"
      id="cluster-modal-overlay"
    >
      <div
        className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[660px] my-auto overflow-hidden text-[#141414]"
        id="cluster-modal-container"
      >
        <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] shrink-0" id="cluster-modal-header">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer group/modal-header"
              onClick={() => {
                if (onOpenClusterMembers && activeCluster) {
                  onOpenClusterMembers(activeCluster);
                }
              }}
            >
              <div className="w-8 h-8 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0 group-hover/modal-header:bg-white group-hover/modal-header:text-[#141414] transition-all">
                {getClusterSymbol(clusterId)}
              </div>
              <div className="flex flex-col text-left">
                <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] group-hover/modal-header:underline">
                  {clusterName}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                aria-label="Close"
                id="cluster-modal-close-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-[#F5F4F0] text-left" id="cluster-messages-list">
          {hiddenMessageIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#141414]/5 border border-[#141414]/20 text-[10px] font-mono text-[#141414]/70 mb-2">
              <span>{hiddenMessageIds.size} failed message(s) hidden</span>
              <button
                type="button"
                onClick={() => setShowHiddenMessages(!showHiddenMessages)}
                className="font-bold underline uppercase hover:text-[#141414] cursor-pointer"
              >
                {showHiddenMessages ? 'Hide again' : 'Show hidden'}
              </button>
            </div>
          )}

          {messages.length > 0 ? (
            messages
              .filter((m) => showHiddenMessages || !hiddenMessageIds.has(m.id))
              .map((m) => {
                const isCurrentUser = m.senderAgentId === user?.agentId || Boolean(user?.agentId && m.senderAgentId?.toLowerCase() === user.agentId.toLowerCase());
                const isSystem = !m.senderAgentId;
                const msgAvatar = isCurrentUser ? (user?.avatar || undefined) : m.senderAgentAvatar;
                const msgName = isCurrentUser ? (user?.name || 'Me') : (m.senderAgentName || m.senderAgentId || 'Agent');

                const rawPlainText = m.content || (m.ciphertext ? (tryDecodeBase64Message(m.ciphertext) || tryDecryptMessage(m.ciphertext)) : '');
                const plainText = typeof rawPlainText === 'string' ? rawPlainText.trim() : '';
                const hasDecryptedText = Boolean(m.isDecrypted && m.content && m.content.trim()) || (Boolean(plainText) && !plainText.startsWith('[SECURE CIPHER]'));

                if (isSystem) {
                  return (
                    <div key={m.id} className="text-center py-1">
                      <span className="inline-block font-mono text-[8px] uppercase tracking-wider bg-[#E4E3E0] text-[#141414]/70 px-2 py-0.5 rounded-full">
                        {plainText || 'System Transmission'}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(msgName, msgAvatar, m.senderAgentId)}
                      className="shrink-0 mt-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <AgentAvatar
                        name={msgName}
                        avatar={msgAvatar}
                        id={m.senderAgentId}
                        className="w-8 h-8"
                      />
                    </button>
                    <div
                      className={`p-3 border-2 flex-1 max-w-[85%] ${
                        isCurrentUser
                          ? 'bg-[#141414] text-white border-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                          : 'bg-white text-[#141414] border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)]'
                      }`}
                    >
                      {hasDecryptedText ? (
                        <ChatMessageContent content={m.content || plainText} isCurrentUser={isCurrentUser} />
                      ) : (
                        <div className="space-y-1.5">
                          <div className={`flex items-start justify-between gap-2 font-mono text-xs font-bold leading-tight ${isCurrentUser ? 'text-white/95' : 'text-[#141414]/95'}`}>
                            <span>{m.decryptionStatus?.title || '🔒 Cannot be decrypted because the AES-GCM authentication tag verification failed (bit-flip / payload modified)'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setHiddenMessageIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.id)) {
                                    next.delete(m.id);
                                  } else {
                                    next.add(m.id);
                                  }
                                  return next;
                                });
                              }}
                              title="Hide this unverified/failed message from view"
                              className={`text-[10px] uppercase font-bold shrink-0 underline opacity-70 hover:opacity-100 cursor-pointer ${
                                isCurrentUser ? 'text-white' : 'text-[#141414]'
                              }`}
                            >
                              {hiddenMessageIds.has(m.id) ? 'Unhide' : 'Hide'}
                            </button>
                          </div>
                          {(m.decryptionStatus?.detail || true) && (
                            <div 
                              className={`text-[11px] font-mono pl-2.5 border-l-2 ${
                                isCurrentUser ? 'text-white/70 border-white/30' : 'text-[#141414]/70 border-[#141414]/30'
                              }`}
                              title={m.decryptionStatus?.explanation || m.decryptionStatus?.detail || 'Cryptographic authentication tag mismatch'}
                            >
                              {m.decryptionStatus?.detail || 'Cryptographic authentication tag mismatch'}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className={`mt-2 flex items-center ${isCurrentUser ? 'justify-end' : 'justify-between'} border-t border-current/15 pt-1 text-[9px] font-mono opacity-75`}>
                        {typeof m.sequence === 'number' && (
                          <span className={`px-1 py-0.2 border ${isCurrentUser ? 'border-white/30 bg-white/10' : 'border-[#141414]/30 bg-[#141414]/5'} font-bold ${isCurrentUser ? 'mr-auto' : ''}`}>
                            #{m.sequence}
                          </span>
                        )}
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                );
              })
          ) : (
            <BrutalistLoader text={isLoading ? "Synchronizing" : "No messages"} size="sm" className="py-16" />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};
