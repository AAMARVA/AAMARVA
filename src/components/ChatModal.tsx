import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Shield } from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { useAuth } from '../context/AuthContext';
import { 
  decryptMessage, 
  getLocalKeyPair, 
  resolveSenderPublicKey,
  normalizeAgentId,
  formatDecryptionErrorStatus,
  FormattedDecryptionStatus,
  StoredAgentKeyEntry
} from '../lib/e2ee';
import { 
  getCachedPeerKey, 
  setCachedPeerKey 
} from '../lib/e2eePrefetch';
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
  decryptionStatus?: FormattedDecryptionStatus;
  isDecrypted: boolean;
  createdAt: string;
  keyEpoch?: number;
  sequence?: number;
}

interface ChatMessageContentProps {
  content: string;
  isCurrentUser: boolean;
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

export const ChatModal: React.FC<ChatModalProps> = ({
  connectionId,
  peerName,
  peerAvatar,
  peerAgentId,
  peerE2eePublicKey: initialPeerKey,
  onClose,
}) => {
  const { user, userPassword, e2eeStatus, ensureE2EEKeys } = useAuth();
  const [messages, setMessages] = useState<DecryptedChatMessage[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Recovery input state if recovery_required on new browser without stored password
  const [recoveryPasswordInput, setRecoveryPasswordInput] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

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
  const [peerKeyEpoch, setPeerKeyEpoch] = useState<number>(1);
  const [peerEpochKeys, setPeerEpochKeys] = useState<Record<string, any>>({});
  const [resolvedPeerAgentId, setResolvedPeerAgentId] = useState<string | undefined>(peerAgentId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle manual password submission if recovery_required state is triggered
  const handlePerformRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.agentId || !recoveryPasswordInput.trim()) return;

    setRecoverySubmitting(true);
    setRecoveryError(null);
    try {
      const success = await ensureE2EEKeys(user.agentId, false, recoveryPasswordInput.trim());
      if (!success) {
        setRecoveryError('Recovery failed. Please check your account password.');
      } else {
        await fetchAndDecryptMessages();
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'Recovery failed.');
    } finally {
      if (isMountedRef.current) {
        setRecoverySubmitting(false);
      }
    }
  };

  // Synchronized message fetch and decryption
  const fetchAndDecryptMessages = useCallback(async () => {
    if (!user?.agentId) return;

    try {
      // 1. If E2EE initialization or recovery is actively in progress in AuthContext, wait for it
      if (e2eeStatus === 'initializing' || e2eeStatus === 'recovery_in_progress') {
        await ensureE2EEKeys(user.agentId, false, userPassword || undefined);
      }

      // 2. Resolve local cryptographic keys
      let currentLocalKeys = localKeys;
      if (!currentLocalKeys) {
        currentLocalKeys = await getLocalKeyPair(user.agentId, undefined, userPassword || undefined);
        if (currentLocalKeys && isMountedRef.current) {
          setLocalKeys(currentLocalKeys);
        }
      }

      // 3. Resolve peer's cryptographic keys from prefetch cache or fetch if not available
      let currentPeerKey = peerKey || initialPeerKey || null;
      let currentPeerEpochKeys = peerEpochKeys;
      let currentPeerId = resolvedPeerAgentId || peerAgentId;

      // Check prefetch cache first for instant key availability
      const cachedPeer = getCachedPeerKey(connectionId);
      if (cachedPeer) {
        if (!currentPeerKey && cachedPeer.peerPublicKey) {
          currentPeerKey = cachedPeer.peerPublicKey;
          if (isMountedRef.current) setPeerKey(currentPeerKey);
        }
        if (cachedPeer.peerKeyEpoch && isMountedRef.current) {
          setPeerKeyEpoch(cachedPeer.peerKeyEpoch);
        }
        if (Object.keys(currentPeerEpochKeys).length === 0 && cachedPeer.peerEpochKeys) {
          currentPeerEpochKeys = cachedPeer.peerEpochKeys;
          if (isMountedRef.current) setPeerEpochKeys(currentPeerEpochKeys);
        }
        if (!currentPeerId && cachedPeer.peerAgentId) {
          currentPeerId = cachedPeer.peerAgentId;
          if (isMountedRef.current) setResolvedPeerAgentId(currentPeerId);
        }
      }

      if (!currentPeerKey || !currentPeerId || Object.keys(currentPeerEpochKeys).length === 0) {
        try {
          const keyRes = await apiFetch(`/api/connections/${connectionId}/peer-key`, { authType: 'human' });
          if (keyRes?.data) {
            if (keyRes.data.peerE2eePublicKey) {
              currentPeerKey = keyRes.data.peerE2eePublicKey;
              if (isMountedRef.current) setPeerKey(currentPeerKey);
            }
            if (keyRes.data.peerKeyEpoch && isMountedRef.current) {
              setPeerKeyEpoch(keyRes.data.peerKeyEpoch);
            }
            if (keyRes.data.peerEpochKeys) {
              currentPeerEpochKeys = keyRes.data.peerEpochKeys;
              if (isMountedRef.current) setPeerEpochKeys(currentPeerEpochKeys);
            }
            if (keyRes.data.peerAgentId) {
              currentPeerId = keyRes.data.peerAgentId;
              if (isMountedRef.current) setResolvedPeerAgentId(currentPeerId);
            }
            // Update cache
            setCachedPeerKey(connectionId, {
              connectionId,
              peerUserId: keyRes.data.peerUserId,
              peerAgentId: keyRes.data.peerAgentId,
              peerPublicKey: keyRes.data.peerE2eePublicKey || null,
              peerKeyFingerprint: keyRes.data.peerKeyFingerprint,
              peerIdentityKey: keyRes.data.peerIdentityKey,
              peerKeySignature: keyRes.data.peerKeySignature,
              peerKeyEpoch: keyRes.data.peerKeyEpoch,
              peerEpochKeys: keyRes.data.peerEpochKeys
            });
          }
        } catch {
          try {
            const legRes = await apiFetch(`/api/connections/${connectionId}/e2ee-key`, { authType: 'human' });
            if (legRes?.data?.peerE2eePublicKey) {
              currentPeerKey = legRes.data.peerE2eePublicKey;
              if (isMountedRef.current) setPeerKey(currentPeerKey);
            }
          } catch {}
        }
      }

      // 4. Fetch raw messages from server
      const responseData = await apiFetch(`/api/connections/${connectionId}/messages`, { authType: 'human' });
      const rawList = responseData.data || responseData;

      if (Array.isArray(rawList)) {
        const processed: DecryptedChatMessage[] = await Promise.all(
          rawList.map(async (m: any) => {
            const sender = m.senderAgentId || 'Agent';
            const ciphertext = m.ciphertext;
            const nonce = m.nonce;
            const msgEpoch = m.keyEpoch || 1;

            const isPublicContext = m.id && (m.id.startsWith('msg_post_') || m.id.startsWith('msg_reply_'));

            // Public connection context message
            if (isPublicContext && m.content) {
              const safeContent = sanitizeDecryptedMessage(m.content, user.agentId, activeContextCredentials);
              return {
                id: m.id,
                connectionId: m.connectionId,
                senderAgentId: sender,
                content: safeContent,
                isDecrypted: true,
                keyEpoch: msgEpoch,
                sequence: typeof m.sequence === 'number' ? m.sequence : undefined,
                createdAt: m.createdAt,
              };
            }

            let resolvedPlaintext: string | null = null;
            let decryptionErrorReason: string | null = null;

            // Encrypted private E2EE message: attempt WebCrypto AES-256-GCM + ECDH local decryption
            if (ciphertext && nonce) {
              if (!currentLocalKeys) {
                decryptionErrorReason = 'MISSING_RECIPIENT_PRIVATE_KEY';
                if (process.env.NODE_ENV !== 'production') {
                  console.debug(`[E2EE Decrypt Diagnostic] Failure [MISSING_RECIPIENT_PRIVATE_KEY] on msg ${m.id}`);
                }
              } else {
                try {
                  let decKey = currentLocalKeys.privateKey;
                  if (currentLocalKeys.keyEpoch !== msgEpoch) {
                    const historicalEntry = await getLocalKeyPair(user.agentId, msgEpoch, userPassword || undefined);
                    if (historicalEntry?.privateKey) {
                      decKey = historicalEntry.privateKey;
                    } else {
                      decryptionErrorReason = 'KEY_EPOCH_NOT_FOUND';
                      if (process.env.NODE_ENV !== 'production') {
                        console.debug(`[E2EE Decrypt Diagnostic] Warning [KEY_EPOCH_NOT_FOUND] for epoch ${msgEpoch}`);
                      }
                    }
                  }

                  const isMyMessage = normalizeAgentId(m.senderAgentId) === normalizeAgentId(user.agentId);
                  const targetPeer = isMyMessage ? (currentPeerId || peerAgentId || 'peer') : m.senderAgentId;
                  
                  const senderPubKey = await resolveSenderPublicKey(
                    targetPeer,
                    msgEpoch,
                    currentPeerEpochKeys,
                    currentPeerKey,
                    peerKeyEpoch
                  );

                  if (!senderPubKey) {
                    decryptionErrorReason = 'MISSING_SENDER_PUBLIC_KEY';
                    if (process.env.NODE_ENV !== 'production') {
                      console.debug(`[E2EE Decrypt Diagnostic] Failure [MISSING_SENDER_PUBLIC_KEY] on msg ${m.id} for peer ${targetPeer}`);
                    }
                  } else if (!decKey) {
                    decryptionErrorReason = (currentLocalKeys.keyEpoch !== msgEpoch) ? 'KEY_EPOCH_NOT_FOUND' : 'MISSING_RECIPIENT_PRIVATE_KEY';
                    if (process.env.NODE_ENV !== 'production') {
                      console.debug(`[E2EE Decrypt Diagnostic] Failure [${decryptionErrorReason}] on msg ${m.id}`);
                    }
                  } else {
                    resolvedPlaintext = await decryptMessage(
                      { ciphertext, nonce, version: m.version || 1, keyEpoch: msgEpoch },
                      decKey,
                      senderPubKey,
                      connectionId,
                      sender
                    );
                  }
                } catch (decErr: any) {
                  // AES-GCM authentication/decryption failure: fail closed, do not expose plaintext
                  decryptionErrorReason = decErr?.code || 'AUTHENTICATION_TAG_FAILED';
                  if (process.env.NODE_ENV !== 'production') {
                    console.debug(`[E2EE Decrypt Diagnostic] Failure [${decryptionErrorReason}] on msg ${m.id}:`, decErr?.message);
                  }
                  resolvedPlaintext = null;
                }
              }
            }

            // Transparent Plaintext Display: Sanitize locally and display plaintext only after successful decryption
            if (typeof resolvedPlaintext === 'string') {
              const safePlaintext = sanitizeDecryptedMessage(resolvedPlaintext, user.agentId, activeContextCredentials);

              return {
                id: m.id,
                connectionId: m.connectionId,
                senderAgentId: sender,
                content: safePlaintext,
                isDecrypted: true,
                keyEpoch: msgEpoch,
                sequence: typeof m.sequence === 'number' ? m.sequence : undefined,
                createdAt: m.createdAt,
              };
            }

            // Safe failure state with informative status: Never treat encoding as decryption, never expose raw ciphertext
            const failureStatus = formatDecryptionErrorStatus(decryptionErrorReason);
            return {
              id: m.id,
              connectionId: m.connectionId,
              senderAgentId: sender,
              content: failureStatus.title,
              decryptionStatus: failureStatus,
              isDecrypted: false,
              keyEpoch: msgEpoch,
              sequence: typeof m.sequence === 'number' ? m.sequence : undefined,
              createdAt: m.createdAt,
            };
          })
        );

        // Sort messages deterministically by sequence first, then creation timestamp, then ID
        processed.sort((a, b) => {
          if (typeof a.sequence === 'number' && typeof b.sequence === 'number' && a.sequence !== b.sequence) {
            return a.sequence - b.sequence;
          }
          const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (timeDiff !== 0) return timeDiff;
          if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
            return a.sequence - b.sequence;
          }
          return String(a.id).localeCompare(String(b.id));
        });

        if (isMountedRef.current) {
          setMessages(processed);
          setFetchError(null);
        }
      }
    } catch (e: any) {
      if (isMountedRef.current) {
        setFetchError(e.message || 'Failed to fetch conversation logs.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [connectionId, user?.agentId, userPassword, e2eeStatus, ensureE2EEKeys, localKeys, peerKey, initialPeerKey, peerEpochKeys, resolvedPeerAgentId, peerAgentId, activeContextCredentials]);

  useEffect(() => {
    fetchAndDecryptMessages();
    const interval = setInterval(fetchAndDecryptMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchAndDecryptMessages]);

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
          {isLoading || e2eeStatus === 'recovery_in_progress' ? (
            <BrutalistLoader 
              text={e2eeStatus === 'recovery_in_progress' ? "Restoring secure messages..." : "Accessing Channel"} 
              size="sm" 
              className="py-12" 
            />
          ) : e2eeStatus === 'recovery_required' ? (
            <div className="p-4 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] my-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#141414]" />
                <h4 className="font-mono font-black uppercase text-xs tracking-wider text-[#141414]">
                  Restoring Secure Messages
                </h4>
              </div>
              <p className="text-xs text-[#141414]/70 font-sans leading-relaxed">
                Your encrypted identity could not be restored on this device. Your existing encrypted identity has not been replaced. Complete recovery to access encrypted messages.
              </p>
              <form onSubmit={handlePerformRecovery} className="space-y-2">
                <input
                  type="password"
                  placeholder="Enter account password"
                  value={recoveryPasswordInput}
                  onChange={(e) => setRecoveryPasswordInput(e.target.value)}
                  className="w-full border-2 border-[#141414] px-3 py-2 text-xs font-mono focus:outline-none bg-[#F5F4F0]"
                  required
                />
                {recoveryError && (
                  <p className="text-[11px] font-mono text-red-600 font-bold">{recoveryError}</p>
                )}
                <button
                  type="submit"
                  disabled={recoverySubmitting}
                  className="w-full border-2 border-[#141414] bg-[#141414] text-white py-2 text-xs font-mono font-bold uppercase tracking-wider hover:bg-black transition-colors cursor-pointer disabled:opacity-50"
                >
                  {recoverySubmitting ? 'Restoring secure messages...' : 'Restore Messages'}
                </button>
              </form>
            </div>
          ) : messages.length > 0 ? (
            <>
              {/* Optional Hidden Messages Banner */}
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
              {messages
                .filter((m) => showHiddenMessages || !hiddenMessageIds.has(m.id))
                .map((m) => {
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
                        {m.isDecrypted ? (
                          <ChatMessageContent content={m.content} isCurrentUser={isCurrentUser} />
                        ) : (
                          <div className="space-y-1.5">
                            <div className={`flex items-start justify-between gap-2 font-mono text-xs font-bold leading-tight ${isCurrentUser ? 'text-white/95' : 'text-[#141414]/95'}`}>
                              <span>{m.decryptionStatus?.title || '🔒 Cannot be decrypted because cryptographic verification failed'}</span>
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
                            {m.decryptionStatus?.detail && (
                              <div 
                                className={`text-[11px] font-mono pl-2.5 border-l-2 ${
                                  isCurrentUser ? 'text-white/70 border-white/30' : 'text-[#141414]/70 border-[#141414]/30'
                                }`}
                                title={m.decryptionStatus?.explanation || m.decryptionStatus?.detail}
                              >
                                {m.decryptionStatus.detail}
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className={`mt-2 flex items-center ${isCurrentUser ? 'justify-end' : 'justify-between'} border-t border-current/15 pt-1 text-[9px] font-mono opacity-75`}>
                          {typeof m.sequence === 'number' && (
                            <span className={`px-1 py-0.2 border ${isCurrentUser ? 'border-white/30 bg-white/10' : 'border-[#141414]/30 bg-[#141414]/5'} font-bold`}>
                              #{m.sequence}
                            </span>
                          )}
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </>
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

