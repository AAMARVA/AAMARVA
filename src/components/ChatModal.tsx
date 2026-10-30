import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Shield, ChevronUp, Lock } from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken, sendPrivateMessageApi } from '../services/authApi';
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
  setCachedPeerKey,
  fetchConnectionPeerKey
} from '../lib/e2eePrefetch';
import {
  getCachedDecryptedMessage,
  cacheDecryptedMessage,
  isDecryptionErrorPlaceholder
} from '../lib/decryptedMessageStore';


interface ChatModalProps {
  connectionId: string;
  peerName: string;
  peerAvatar?: string;
  peerAgentId?: string;
  peerE2eePublicKey?: string | null;
  onClose: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
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
  onOpenAgentProfile,
}) => {
  const { user, activeAccount, userPassword, e2eeStatus, ensureE2EEKeys, sessionAuthType } = useAuth();
  const isSlave = Boolean(
    (activeAccount && user && (activeAccount.id !== user.id || activeAccount.agentId !== user.agentId)) ||
    ((activeAccount || user)?.account_type === 'slave' ||
     (activeAccount || user)?.role === 'slave' ||
     (activeAccount || user)?.is_slave === true ||
     (activeAccount || user)?.isSlave === true ||
     ((activeAccount || user)?.master_id && (activeAccount || user)?.id && String((activeAccount || user)?.master_id).toLowerCase() !== String((activeAccount || user)?.id).toLowerCase()) ||
     ((activeAccount || user)?.email && typeof (activeAccount || user)?.email === 'string' && (activeAccount || user)?.email.includes('+AMR-')))
  ) && !Boolean(
    (activeAccount || user)?.account_type === 'master' ||
    (activeAccount || user)?.isMasterUser === true ||
    (activeAccount || user)?.is_master_primary === true ||
    user?.account_type === 'master'
  );
  const effectiveAuthType: 'human' | 'agent' = sessionAuthType || (getAccessToken() ? 'agent' : 'human');
  const [messages, setMessages] = useState<DecryptedChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sentPlaintextsRef = useRef<Map<string, string>>(new Map());
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

  const [isActivatingPeer, setIsActivatingPeer] = useState(false);
  const handleActivatePeerKey = async (): Promise<boolean> => {
    const targetAgentId = resolvedPeerAgentId || peerAgentId;
    if (!targetAgentId) return false;
    setIsActivatingPeer(true);
    try {
      const res = await apiFetch(`/api/agents/${targetAgentId}/e2ee`, { authType: sessionAuthType });
      const pubKey = res?.data?.publicKey || res?.publicKey;
      if (pubKey) {
        setPeerKey(pubKey);
        await fetchAndDecryptMessages(pubKey);
        return true;
      } else {
        setSendError('Slave agent manages its own cryptographic identity via its own runtime. Please ensure the slave agent has started and registered its public key.');
        return false;
      }
    } catch (err: any) {
      setSendError(`Failed to fetch agent public key: ${err?.message || err}`);
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsActivatingPeer(false);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSlave) {
      setSendError('Slave UI messaging is disabled. Slave agents must send messages via their agent runtime API.');
      return;
    }
    const text = newMessage.trim();
    if (!text || !user?.agentId || isSending) return;

    setIsSending(true);
    setSendError(null);

    // Optimistic message placeholder so the message shows immediately to the sender
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMsg: DecryptedChatMessage = {
      id: tempId,
      connectionId,
      senderAgentId: user.agentId,
      content: text,
      isDecrypted: true,
      keyEpoch: peerKeyEpoch || 1,
      createdAt: new Date().toISOString(),
    };

    sentPlaintextsRef.current.set(tempId, text);
    try { sessionStorage.setItem(`aamarva_plain_${connectionId}_${tempId}`, text); } catch {}
    cacheDecryptedMessage(text, [tempId, `${connectionId}_${tempId}`]);
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage('');

    try {
      const targetReceiver = resolvedPeerAgentId || peerAgentId;
      const sentRes = await sendPrivateMessageApi(connectionId, text, user.agentId, { 
        password: userPassword || undefined,
        receiverAgentId: targetReceiver,
        authType: effectiveAuthType
      });

      const keysToCache: (string | undefined | null)[] = [];
      if (sentRes?.id) {
        sentPlaintextsRef.current.set(sentRes.id, text);
        try { sessionStorage.setItem(`aamarva_plain_${connectionId}_${sentRes.id}`, text); } catch {}
        keysToCache.push(sentRes.id, `${connectionId}_${sentRes.id}`);
      }
      if (sentRes?.messageId) {
        keysToCache.push(sentRes.messageId, `${connectionId}_${sentRes.messageId}`);
      }
      if (sentRes?.nonce) {
        sentPlaintextsRef.current.set(sentRes.nonce, text);
        try { sessionStorage.setItem(`aamarva_plain_${connectionId}_${sentRes.nonce}`, text); } catch {}
        keysToCache.push(sentRes.nonce, `${connectionId}_${sentRes.nonce}`);
      }
      if (sentRes?.ciphertext) {
        sentPlaintextsRef.current.set(sentRes.ciphertext, text);
        try { sessionStorage.setItem(`aamarva_plain_${connectionId}_${sentRes.ciphertext}`, text); } catch {}
        keysToCache.push(sentRes.ciphertext, `${connectionId}_${sentRes.ciphertext}`);
      }
      if (keysToCache.length > 0) {
        cacheDecryptedMessage(text, keysToCache);
      }

      // Re-fetch and decrypt canonical messages from server
      await fetchAndDecryptMessages();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Remove optimistic message on failure and restore text to input
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      sentPlaintextsRef.current.delete(tempId);
      setNewMessage(text);
      setSendError(err?.message || 'Failed to send message');
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  };

  // Synchronized message fetch and decryption
  const fetchAndDecryptMessages = useCallback(async (forcedPeerKey?: string) => {
    if (!user?.agentId) return;

    if (!connectionId || !connectionId.trim()) {
      setFetchError('Connection not found: Missing or invalid connection ID.');
      setIsLoading(false);
      return;
    }

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
      let currentPeerKey = forcedPeerKey || peerKey || initialPeerKey || null;
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

      const targetPeerId = resolvedPeerAgentId || peerAgentId;
      const peerQuery = targetPeerId ? `?receiverAgentId=${encodeURIComponent(targetPeerId)}` : '';

      if (!currentPeerKey || !currentPeerId || Object.keys(currentPeerEpochKeys).length === 0) {
        try {
          const cachedData = await fetchConnectionPeerKey(connectionId, {
            receiverAgentId: targetPeerId,
            authType: effectiveAuthType
          });
          if (cachedData) {
            if (cachedData.peerPublicKey) {
              currentPeerKey = cachedData.peerPublicKey;
              if (isMountedRef.current) setPeerKey(currentPeerKey);
            }
            if (cachedData.peerKeyEpoch && isMountedRef.current) {
              setPeerKeyEpoch(cachedData.peerKeyEpoch);
            }
            if (cachedData.peerEpochKeys) {
              currentPeerEpochKeys = cachedData.peerEpochKeys;
              if (isMountedRef.current) setPeerEpochKeys(currentPeerEpochKeys);
            }
            if (cachedData.peerAgentId) {
              currentPeerId = cachedData.peerAgentId;
              if (isMountedRef.current) setResolvedPeerAgentId(currentPeerId);
            }
          }
        } catch (keyErr: any) {
          const errMsg = String(keyErr?.message || '').toLowerCase();
          if (errMsg.includes('connection not found') || errMsg.includes('404')) {
            throw keyErr;
          }
          try {
            const legRes = await apiFetch(`/api/connections/${connectionId}/e2ee-key${peerQuery}`, { authType: effectiveAuthType });
            if (legRes?.data?.peerE2eePublicKey) {
              currentPeerKey = legRes.data.peerE2eePublicKey;
              if (isMountedRef.current) setPeerKey(currentPeerKey);
            }
          } catch {}
        }
      }

      // 4. Fetch raw messages from server using real session auth type
      const responseData = await apiFetch(`/api/connections/${connectionId}/messages${peerQuery}`, { authType: effectiveAuthType });
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
              const safeContent = m.content;
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

            // 1. Check persistent decrypted cache FIRST: Once decrypted, never go back to encrypted
            const cachedPlain = getCachedDecryptedMessage([
              m.id,
              m.messageId,
              m.nonce,
              m.ciphertext,
              `${connectionId}_${m.id}`,
              `${connectionId}_${m.nonce}`,
              `${connectionId}_${m.ciphertext}`,
              `aamarva_plain_${connectionId}_${m.id}`,
              `aamarva_plain_${connectionId}_${m.nonce}`,
              `aamarva_plain_${connectionId}_${m.ciphertext}`,
            ]);

            if (cachedPlain && !isDecryptionErrorPlaceholder(cachedPlain)) {
              return {
                id: m.id,
                connectionId: m.connectionId || connectionId,
                senderAgentId: sender,
                content: cachedPlain,
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
                  
                  let senderPubKey = await resolveSenderPublicKey(
                    targetPeer,
                    msgEpoch,
                    currentPeerEpochKeys,
                    currentPeerKey,
                    peerKeyEpoch
                  );

                  // If sender public key not yet resolved, try fetching from peer connection or direct agent endpoint
                  if (!senderPubKey && targetPeer && targetPeer !== 'peer') {
                    try {
                      const peerInfo = await fetchConnectionPeerKey(connectionId, {
                        receiverAgentId: targetPeer,
                        authType: effectiveAuthType
                      });
                      if (peerInfo?.peerPublicKey) {
                        senderPubKey = peerInfo.peerPublicKey;
                        if (isMountedRef.current) setPeerKey(peerInfo.peerPublicKey);
                      }
                    } catch {}
                    if (!senderPubKey) {
                      try {
                        const agentKeyRes = await apiFetch(`/api/agents/${targetPeer}/e2ee`, { authType: effectiveAuthType });
                        const pubKey = agentKeyRes?.data?.publicKey || agentKeyRes?.publicKey;
                        if (pubKey) {
                          senderPubKey = pubKey;
                          if (isMountedRef.current) setPeerKey(pubKey);
                        }
                      } catch {}
                    }
                  }

                  // Robust candidate peer keys list: senderPubKey first, then peerKey, initialPeerKey, cachedPeer
                  const candidatePeerKeys: any[] = [];
                  if (senderPubKey) candidatePeerKeys.push(senderPubKey);
                  if (currentPeerKey && !candidatePeerKeys.includes(currentPeerKey)) candidatePeerKeys.push(currentPeerKey);
                  if (initialPeerKey && !candidatePeerKeys.includes(initialPeerKey)) candidatePeerKeys.push(initialPeerKey);
                  if (cachedPeer?.peerPublicKey && !candidatePeerKeys.includes(cachedPeer.peerPublicKey)) candidatePeerKeys.push(cachedPeer.peerPublicKey);

                  if (candidatePeerKeys.length === 0) {
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
                    // Try candidate connection IDs: canonical m.connectionId first, then connectionId prop
                    const candidateConnIds = Array.from(new Set([m.connectionId, connectionId].filter(Boolean)));
                    for (const keyCandidate of candidatePeerKeys) {
                      if (resolvedPlaintext) break;
                      for (const cid of candidateConnIds) {
                        try {
                          resolvedPlaintext = await decryptMessage(
                            { ciphertext, nonce, version: m.version || 1, keyEpoch: msgEpoch },
                            decKey,
                            keyCandidate,
                            cid,
                            m.senderAgentId || 'AGENT'
                          );
                          if (resolvedPlaintext) break;
                        } catch (decErr: any) {
                          decryptionErrorReason = decErr?.code || 'AUTHENTICATION_TAG_FAILED';
                        }
                      }
                    }
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

            // Fallback for our own sent messages if plaintext was preserved in session or sessionStorage or localStorage
            if (!resolvedPlaintext && normalizeAgentId(m.senderAgentId) === normalizeAgentId(user.agentId)) {
              const localCached = (m.id && sentPlaintextsRef.current.get(m.id)) ||
                                  (m.nonce && sentPlaintextsRef.current.get(m.nonce)) ||
                                  (m.ciphertext && sentPlaintextsRef.current.get(m.ciphertext)) ||
                                  (m.id && sessionStorage.getItem(`aamarva_plain_${connectionId}_${m.id}`)) ||
                                  (m.nonce && sessionStorage.getItem(`aamarva_plain_${connectionId}_${m.nonce}`)) ||
                                  (m.ciphertext && sessionStorage.getItem(`aamarva_plain_${connectionId}_${m.ciphertext}`)) ||
                                  getCachedDecryptedMessage([m.id, m.nonce, m.ciphertext, `${connectionId}_${m.id}`]);
              if (localCached && !isDecryptionErrorPlaceholder(localCached)) {
                resolvedPlaintext = localCached;
              } else if (!resolvedPlaintext) {
                resolvedPlaintext = '[Your encrypted message]';
              }
            }

            // Transparent Plaintext Display: Sanitize locally and display plaintext only after successful decryption
            if (typeof resolvedPlaintext === 'string' && !isDecryptionErrorPlaceholder(resolvedPlaintext)) {
              const safePlaintext = resolvedPlaintext;

              // Cache immediately in persistent store so it stays decrypted forever
              cacheDecryptedMessage(safePlaintext, [
                m.id,
                m.messageId,
                m.nonce,
                m.ciphertext,
                `${connectionId}_${m.id}`,
                `${connectionId}_${m.nonce}`,
                `${connectionId}_${m.ciphertext}`,
              ]);

              return {
                id: m.id,
                connectionId: m.connectionId || connectionId,
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

        if (isMountedRef.current) {
          // Reconcile server messages with any in-flight optimistic messages and PREVIOUSLY decrypted messages
          setMessages((prev) => {
            // CRITICAL: "once decrypted for the ui we never wanna go back to the encrypted phase"
            const prevDecryptedMap = new Map<string, DecryptedChatMessage>();
            for (const p of prev) {
              if (p.isDecrypted && p.content && !isDecryptionErrorPlaceholder(p.content)) {
                prevDecryptedMap.set(p.id, p);
                if (p.sequence !== undefined) {
                  prevDecryptedMap.set(`seq_${p.sequence}`, p);
                }
              }
            }

            const merged = processed.map((newMsg) => {
              if (!newMsg.isDecrypted) {
                const prevMsg = prevDecryptedMap.get(newMsg.id) || (newMsg.sequence !== undefined ? prevDecryptedMap.get(`seq_${newMsg.sequence}`) : undefined);
                if (prevMsg && prevMsg.isDecrypted && !isDecryptionErrorPlaceholder(prevMsg.content)) {
                  cacheDecryptedMessage(prevMsg.content, [
                    newMsg.id,
                    `${connectionId}_${newMsg.id}`,
                    (newMsg as any).nonce,
                    (newMsg as any).ciphertext
                  ]);
                  return {
                    ...newMsg,
                    content: prevMsg.content,
                    isDecrypted: true,
                    decryptionStatus: undefined
                  };
                }
              }
              return newMsg;
            });

            const inFlightOptimistic = prev.filter(
              (p) => p.id.startsWith('temp_') && !merged.some((m) => m.content === p.content && m.senderAgentId === p.senderAgentId)
            );
            const combined = [...merged, ...inFlightOptimistic];
            combined.sort((a, b) => {
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
            return combined;
          });
          setFetchError(null);
        }

      }
    } catch (e: any) {
      if (isMountedRef.current) {
        const isNewDirectChat = connectionId.startsWith('conn_') || connectionId.startsWith('fleet_conn_');
        if (isNewDirectChat && (e?.message?.toLowerCase().includes('not found') || e?.message?.includes('404'))) {
          setMessages([]);
          setFetchError(null);
        } else {
          setFetchError(e.message || 'Failed to fetch conversation logs.');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [connectionId, user?.agentId, userPassword, e2eeStatus, ensureE2EEKeys, localKeys, peerKey, initialPeerKey, peerEpochKeys, resolvedPeerAgentId, peerAgentId, activeContextCredentials, effectiveAuthType, peerKeyEpoch]);

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
              <button
                type="button"
                onClick={() => onOpenAgentProfile?.(peerName, peerAvatar, peerAgentId)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                <AgentAvatar name={peerName} avatar={peerAvatar} id={peerAgentId} className="w-8 h-8" />
              </button>
              <div 
                className="flex flex-col cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onOpenAgentProfile?.(peerName, peerAvatar, peerAgentId)}
              >
                <div className="flex items-center gap-1.5">
                  <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] hover:underline">
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
          {(isLoading && messages.length === 0) || e2eeStatus === 'recovery_in_progress' ? (
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
                  <p className="text-[11px] font-mono text-[#141414] font-bold font-bold">{recoveryError}</p>
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
              {messages.map((m) => {
                const isCurrentUser = m.senderAgentId === user?.agentId;
                const msgAvatar = isCurrentUser ? user?.avatar : peerAvatar;
                const msgName = isCurrentUser ? (user?.name || m.senderAgentId) : (peerName || m.senderAgentId);

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
                      <div className={`flex items-center ${isCurrentUser ? 'justify-end' : 'justify-start'} gap-2 pb-1.5 mb-2 border-b ${isCurrentUser ? 'border-white/20' : 'border-[#141414]/15'}`}>
                        <span className={`font-mono font-black uppercase text-xs px-2 py-0.5 ${isCurrentUser ? 'bg-white text-[#141414]' : 'bg-[#141414] text-white'}`}>
                          {msgName}
                        </span>
                      </div>
                      {m.isDecrypted ? (
                        <ChatMessageContent content={m.content} isCurrentUser={isCurrentUser} />
                      ) : (
                        <div className={`flex items-center gap-1.5 text-xs font-mono italic py-1 ${isCurrentUser ? 'text-white/70' : 'text-[#141414]/70'}`}>
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span>{m.decryptionStatus?.title || '[Encrypted message - verifying keys]'}</span>
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
            fetchError ? (
              <div className="py-12 px-4 text-center font-mono text-xs text-neutral-700 font-bold border-2 border-dashed border-[#141414]/20 bg-white">
                {fetchError}
              </div>
            ) : (
              <div className="py-16 px-4 text-center my-auto flex flex-col items-center justify-center gap-4 animate-in fade-in duration-200">
                <AgentAvatar name={peerName} avatar={peerAvatar} id={peerAgentId} className="w-16 h-16 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]" />
                <div className="space-y-1">
                  <h4 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414] underline">
                    Ready for orders commander
                  </h4>
                </div>
              </div>
            )
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        {!isSlave ? (
          <div className="border-t-2 border-[#141414] bg-[#E4E3E0] shrink-0">
            {sendError && (
              <div className="mx-3 mt-2 p-2 bg-red-100 border border-red-400 text-red-800 text-xs font-mono flex items-center justify-between">
                <span>⚠️ {sendError}</span>
                <button
                  type="button"
                  onClick={() => setSendError(null)}
                  className="text-red-900 font-bold ml-2 cursor-pointer hover:underline"
                >
                  ✕
                </button>
              </div>
            )}
            <form onSubmit={handleSendMessage} className="p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a secure message..."
                  className="flex-1 border-2 border-[#141414] px-3 py-2 text-xs font-mono bg-white focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={isSending || !newMessage.trim()}
                  className="bg-[#141414] text-white px-4 py-2 text-xs font-mono font-bold uppercase hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
                  title="Send message"
                >
                  {isSending ? '...' : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="p-3 border-t-2 border-[#141414] bg-[#E4E3E0] shrink-0">
            <div className="text-[10px] font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-1.5 flex items-center justify-between">
              <span>Slave UI messaging disabled. Operate via agent runtime API.</span>
              <span className="uppercase text-[8px] bg-amber-200 px-1 py-0.5 border border-amber-400">Restricted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

