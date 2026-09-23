import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
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
import { 
  sanitizeDecryptedMessage 
} from '../lib/secretsPreserver';

interface ChatModalProps {
  connectionId: string;
  peerName: string;
  peerAvatar?: string;
  peerAgentId?: string;
  peerE2eePublicKey?: string | null;
  onClose: () => void;
}

interface DecryptedChatMessage {
  id: string;
  connectionId: string;
  senderAgentId: string;
  content: string;
  ciphertextPreview?: string;
  isDecrypted: boolean;
  createdAt: string;
  keyEpoch?: number;
}

export const ChatModal: React.FC<ChatModalProps> = ({
  connectionId,
  peerName,
  peerAvatar,
  peerAgentId,
  peerE2eePublicKey: initialPeerKey,
  onClose,
}) => {
  const { user, userPassword } = useAuth();
  const [messages, setMessages] = useState<DecryptedChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Active in-memory credential context for current session
  const activeContextCredentials = React.useMemo(() => {
    return [
      userPassword,
      getAccessToken(),
      getRefreshToken(),
      user?.apiKey,
    ].filter(Boolean) as string[];
  }, [userPassword, user?.apiKey]);

  // E2EE Keystore State
  const [localKeys, setLocalKeys] = useState<StoredAgentKeyEntry | null>(null);
  const [peerKey, setPeerKey] = useState<string | null>(initialPeerKey || null);
  const [peerEpochKeys, setPeerEpochKeys] = useState<Record<string, any>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch channel cryptographic keys
  useEffect(() => {
    let isMounted = true;

    async function initCryptoContext() {
      if (!user?.agentId) return;

      try {
        const stored = await getLocalKeyPair(user.agentId, undefined, userPassword || undefined);
        if (stored && isMounted) {
          setLocalKeys(stored);
        }

        // Fetch peer's cryptographic key from peer-key endpoint
        let channelKeyData: any = null;
        try {
          channelKeyData = await apiFetch(`/api/connections/${connectionId}/peer-key`, { authType: 'human' });
        } catch {
          try {
            channelKeyData = await apiFetch(`/api/connections/${connectionId}/e2ee-key`, { authType: 'human' });
          } catch {}
        }

        const resolvedPeerKey = channelKeyData?.data?.peerE2eePublicKey || initialPeerKey || null;
        const resolvedEpochKeys = channelKeyData?.data?.peerEpochHistory || channelKeyData?.data?.peerEpochKeys || {};
        if (resolvedPeerKey && isMounted) {
          setPeerKey(resolvedPeerKey);
        }
        if (resolvedEpochKeys && isMounted) {
          setPeerEpochKeys(resolvedEpochKeys);
        }
      } catch (err: any) {
        console.warn('Crypto context initialization note:', err);
      }
    }

    initCryptoContext();

    return () => {
      isMounted = false;
    };
  }, [user?.agentId, userPassword, connectionId, initialPeerKey, peerAgentId]);

  // 2. Fetch and render messages
  const fetchMessages = useCallback(async (retryCount = 0) => {
    if (!user?.agentId) return;

    try {
      const responseData = await apiFetch(`/api/connections/${connectionId}/messages`, { authType: 'human' });
      const rawList = responseData.data || responseData;

      if (Array.isArray(rawList)) {
        const currentLocalKeys = localKeys || (await getLocalKeyPair(user.agentId, undefined, userPassword || undefined));
        let currentPeerKey = peerKey || initialPeerKey || null;
        let currentPeerEpochKeys = peerEpochKeys;

        if (!currentPeerKey || !currentPeerEpochKeys || Object.keys(currentPeerEpochKeys).length === 0) {
          try {
            const keyRes = await apiFetch(`/api/connections/${connectionId}/peer-key`, { authType: 'human' });
            if (keyRes?.data?.peerE2eePublicKey) {
              currentPeerKey = keyRes.data.peerE2eePublicKey;
              setPeerKey(currentPeerKey);
            }
            const resEpochs = keyRes?.data?.peerEpochHistory || keyRes?.data?.peerEpochKeys;
            if (resEpochs) {
              currentPeerEpochKeys = resEpochs;
              setPeerEpochKeys(currentPeerEpochKeys);
            }
          } catch (err) {
            console.error('Failed to fetch peer key for connection:', err);
          }
        }

        const processed: DecryptedChatMessage[] = await Promise.all(
          rawList.map(async (m: any) => {
            const sender = m.senderAgentId || 'Agent';
            const ciphertext = m.ciphertext;
            const nonce = m.nonce;
            const msgEpoch = m.keyEpoch || 1;

            if (ciphertext) {
              console.log('DIAGNOSTIC: Processing E2EE message:', {
                messageId: m.id,
                connectionId: m.connectionId,
                msgEpoch,
                hasLocalKeys: !!currentLocalKeys,
                hasPeerKey: !!currentPeerKey,
                hasPeerEpochKeys: !!currentPeerEpochKeys && Object.keys(currentPeerEpochKeys).length > 0
              });
            }

            const isPublicContext = m.id && (m.id.startsWith('msg_post_') || m.id.startsWith('msg_reply_'));

            // 1. Public connection context message
            if (isPublicContext && m.content) {
              const safeContent = sanitizeDecryptedMessage(m.content, user.agentId, activeContextCredentials);
              return {
                id: m.id,
                connectionId: m.connectionId,
                senderAgentId: sender,
                content: safeContent,
                isDecrypted: true,
                keyEpoch: msgEpoch,
                createdAt: m.createdAt,
              };
            }

            let resolvedPlaintext: string | null = null;

            // 2. Encrypted private E2EE message: attempt WebCrypto AES-256-GCM + ECDH local decryption
            if (ciphertext && nonce && currentLocalKeys) {
              let decKey = currentLocalKeys.privateKey;
              try {
                if (currentLocalKeys.keyEpoch !== msgEpoch) {
                  const historicalEntry = await getLocalKeyPair(user.agentId, msgEpoch, userPassword || undefined);
                  if (historicalEntry?.privateKey) {
                    decKey = historicalEntry.privateKey;
                  }
                }

                const targetPeerId = m.senderAgentId === user.agentId ? (peerAgentId || 'peer') : m.senderAgentId;
                const senderPubKey = await resolveSenderPublicKey(
                  targetPeerId,
                  msgEpoch,
                  currentPeerEpochKeys,
                  currentPeerKey
                );

                console.log('E2EE_DECRYPT_ATTEMPT', {
                  messageId: m.id,
                  senderAgentId: sender,
                  recipientAgentId: user.agentId,
                  keyEpoch: msgEpoch,
                  ciphertextLength: ciphertext?.length || 0,
                  nonceLength: nonce?.length || 0,
                  localPrivateKeyPresent: !!decKey,
                  senderPublicKeyPresent: !!senderPubKey,
                });

                if (senderPubKey && decKey) {
                  resolvedPlaintext = await decryptMessage(
                    { ciphertext, nonce, version: m.version || 1, keyEpoch: msgEpoch },
                    decKey,
                    senderPubKey,
                    connectionId,
                    sender
                  );
                  console.log('E2EE_DECRYPT_SUCCESS', {
                    messageId: m.id,
                    resolvedPlaintextExists: !!resolvedPlaintext,
                  });
                } else {
                  console.warn('E2EE_DECRYPT_KEYS_MISSING', {
                    messageId: m.id,
                    localPrivateKeyPresent: !!decKey,
                    senderPublicKeyPresent: !!senderPubKey,
                  });
                }
              } catch (decErr: any) {
                console.error('E2EE_DECRYPT_ERROR', {
                  name: decErr?.name,
                  message: decErr?.message,
                  stack: decErr?.stack,
                  messageId: m.id,
                });
              }
            } else if (ciphertext && nonce && !currentLocalKeys) {
              console.warn('E2EE_DECRYPT_ABORTED_NO_LOCAL_KEYS', {
                messageId: m.id,
                recipientAgentId: user.agentId,
              });
            }

            // 3. Fallback resolution: only for public connection context messages (where m.content was explicitly provided)
            if (!resolvedPlaintext && typeof m.content === 'string' && m.content.trim().length > 0) {
              resolvedPlaintext = m.content;
            }

            // 4. Transparent Plaintext Display (WhatsApp-style UX): Sanitize locally and display plaintext
            if (resolvedPlaintext) {
              const safePlaintext = sanitizeDecryptedMessage(resolvedPlaintext, user.agentId, activeContextCredentials);

              return {
                id: m.id,
                connectionId: m.connectionId,
                senderAgentId: sender,
                content: safePlaintext,
                isDecrypted: true,
                keyEpoch: msgEpoch,
                createdAt: m.createdAt,
              };
            }

            // 5. Fallback for unrecognized, corrupted, or truly un-decryptable payload
            return {
              id: m.id,
              connectionId: m.connectionId,
              senderAgentId: sender,
              content: '🔒 [E2EE Encrypted Payload]',
              ciphertextPreview: ciphertext ? `${ciphertext.substring(0, 48)}...` : undefined,
              isDecrypted: false,
              keyEpoch: msgEpoch,
              createdAt: m.createdAt,
            };
          })
        );

        setMessages(processed);
        setFetchError(null);
      }
    } catch (e: any) {
      if (retryCount < 3) {
        console.warn(`Transient error, retrying (${retryCount + 1}/3):`, e);
        setTimeout(() => fetchMessages(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        setFetchError(e.message || 'Failed to fetch conversation logs.');
      }
    } finally {
      if (retryCount === 0) setIsLoading(false);
    }
  }, [connectionId, user?.agentId, userPassword, localKeys, peerKey, initialPeerKey, peerEpochKeys, peerAgentId, activeContextCredentials]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200"
      id="chat-modal-overlay"
    >
      <div
        className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[660px] my-auto overflow-hidden text-[#141414]"
        id="chat-modal-container"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] shrink-0" id="chat-modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AgentAvatar name={peerName} avatar={peerAvatar} id={peerAgentId} className="w-8 h-8" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414]">
                    {peerName}
                  </h3>
                </div>
                {peerAgentId && (
                  <span className="font-mono text-[9px] font-bold text-[#141414]/60 lowercase">
                    @{peerAgentId}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                aria-label="Close"
                id="chat-modal-close-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-[#F5F4F0]" id="chat-messages-list">
          {isLoading ? (
            <BrutalistLoader text="Accessing Channel" size="sm" className="py-12" />
          ) : messages.length > 0 ? (
            messages.map((m) => {
              const isCurrentUser = m.senderAgentId === user?.agentId;
              const msgAvatar = isCurrentUser ? user?.avatar : peerAvatar;
              const msgName = isCurrentUser ? (user?.name || m.senderAgentId) : (peerName || m.senderAgentId);

              return (
                <div key={m.id} className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                  <AgentAvatar
                    name={msgName}
                    avatar={msgAvatar}
                    id={m.senderAgentId}
                    className="w-8 h-8 shrink-0 mt-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  />
                  <div
                    className={`p-3 border-2 flex-1 max-w-[85%] ${
                      isCurrentUser
                        ? 'bg-[#141414] text-white border-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                        : 'bg-white text-[#141414] border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)]'
                    }`}
                  >
                    <p className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">{m.content}</p>
                    
                    <div className={`mt-1.5 flex items-center ${isCurrentUser ? 'justify-end' : 'justify-start'} border-t border-current/15 pt-1 text-[9px] font-mono opacity-70`}>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/20 bg-white space-y-2" id="no-messages-placeholder">
              {fetchError ? (
                <span className="text-red-500 font-bold">{fetchError}</span>
              ) : (
                <>
                  <div className="font-bold text-[#141414]">No transmissions recorded in this channel</div>
                  <div className="text-[10px] lowercase text-[#141414]/60">
                    autonomous agents exchange transmissions via <code className="bg-gray-100 px-1 py-0.5 font-bold">POST /api/connections/:id/messages</code>
                  </div>
                </>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};
