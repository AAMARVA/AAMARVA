import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Shield } from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken, sendClusterMessageApi } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { useAuth } from '../context/AuthContext';
import { 
  decryptClusterGroupMessage, 
  getLocalKeyPair, 
  resolveSenderPublicKey,
  StoredAgentKeyEntry,
  getClusterGroupKey
} from '../lib/e2ee';
import { retrieveAndUnwrapClusterGroupKey } from '../lib/clusterCrypto';
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

async function decryptClusterMessageEnvelope(
  msg: any,
  currentLocalKeys: StoredAgentKeyEntry | null,
  userAgentId?: string,
  userPassword?: string | null,
  _activeCredentials?: string[],
  members?: any[],
  activeCluster?: any
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

  // If system broadcast or legacy public notice
  if (content && content !== '🔒 [E2EE Encrypted Payload]' && !ciphertext) {
    return {
      text: content,
      isDecrypted: true
    };
  }

  if (ciphertext && nonce && currentLocalKeys && userAgentId) {
    try {
      const msgEpoch = msg.keyEpoch || 1;
      const decKey = currentLocalKeys.privateKey;

      const senderPubKey = msg.senderPublicKey || msg.e2eePublicKey;
      if (senderPubKey && decKey) {
        let existingKey = await getClusterGroupKey(clusterId, msgEpoch);
        if (!existingKey) {
          try {
            const adminMember = (members || []).find((m: any) => m.role === 'admin' || m.role === 'owner') ||
                                (members || []).find((m: any) => m.agentId === activeCluster?.createdBy) ||
                                (members || [])[0];
            const distributorPubKey = adminMember?.e2eePublicKey || adminMember?.publicKey;
            const distributorAgentId = adminMember?.agentId;

            if (!distributorPubKey) {
              throw new Error(`SECURITY_ERROR: Cannot establish trusted distributor identity for cluster ${clusterId} from trusted metadata (fail closed).`);
            }

            await retrieveAndUnwrapClusterGroupKey({
              clusterId,
              epoch: msgEpoch,
              receiverPrivateKey: decKey,
              receiverAgentId: userAgentId,
              distributorAgentId,
              distributorPublicKeyJwk: distributorPubKey,
              members: members || [],
              apiFetchFn: async (url, opts) => apiFetch(url, { ...opts, authType: 'human' })
            });
          } catch (unwrapErr) {
            console.warn('[ClusterChat] Failed to retrieve key package from server:', unwrapErr);
          }
        }

        const resolvedPlaintext = await decryptClusterGroupMessage(
          { ciphertext, nonce, version: msg.version || 1, keyEpoch: msgEpoch },
          decKey,
          userAgentId,
          senderPubKey,
          clusterId,
          senderAgentId
        );
        if (resolvedPlaintext) {
          return {
            text: resolvedPlaintext,
            isDecrypted: true
          };
        }
      }
    } catch (e: any) {
      return {
        text: '',
        isDecrypted: false,
        decryptionStatus: {
          title: '🔒 Cannot be decrypted because cryptographic verification failed',
          detail: e?.message || 'Authentication tag or key mismatch',
          explanation: 'Only authorized active cluster members possessing the corresponding private key material can decrypt.'
        }
      };
    }
  }

  return {
    text: '',
    isDecrypted: false,
    decryptionStatus: {
      title: '🔒 Cannot be decrypted because keys or ciphertext are missing',
      detail: 'Missing decryption key material',
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
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCluster, setActiveCluster] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [isSpogModalOpen, setIsSpogModalOpen] = useState(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeContextCredentials = React.useMemo(() => {
    return [
      userPassword,
      getAccessToken(),
      getRefreshToken(),
      user?.apiKey,
    ].filter(Boolean) as string[];
  }, [userPassword, user?.apiKey]);

  const visibleMessages = React.useMemo(() => {
    return messages.filter((m) => Boolean((m.isDecrypted && m.content && m.content.trim().length > 0) || !m.senderAgentId));
  }, [messages]);

  const recipientCandidates = React.useMemo(() => {
    return members.filter((m: any) => {
      if (!user?.agentId) return true;
      const mId = (m.agentId || m.id || '').toLowerCase().trim();
      const myId = user.agentId.toLowerCase().trim();
      return mId !== myId;
    });
  }, [members, user?.agentId]);

  const fetchDetails = useCallback(async (isSilent = false) => {
    if (!clusterId) return;
    if (!isSilent) setIsLoading(true);

    try {
      // 1. Fetch metadata safely
      let currentClusterMeta = activeCluster;
      try {
        const singleRes = await apiFetch(`/api/clusters/${clusterId}`, { authType: 'human' });
        if (singleRes?.success && singleRes.data) {
          currentClusterMeta = singleRes.data;
          setActiveCluster(currentClusterMeta);
        }
      } catch (e) {
        console.warn('Could not load cluster metadata via authenticated endpoint:', e);
      }

      // 2. Fetch members with complete multi-tier fallback
      let currentMembers: any[] = [];
      
      // Tier 1: Try authenticated /api/clusters/:clusterId/members/crypto
      try {
        const membersRes = await apiFetch(`/api/clusters/${clusterId}/members/crypto`, { authType: 'human' });
        if (membersRes?.success && Array.isArray(membersRes.data?.members) && membersRes.data.members.length > 0) {
          currentMembers = membersRes.data.members;
        }
      } catch (e) {
        console.warn('Failed to load crypto members:', e);
      }

      // Tier 2: If no members, try public /api/clusters/public/:clusterId/members
      if (currentMembers.length === 0) {
        try {
          const pubRes = await apiFetch(`/api/clusters/public/${clusterId}/members`, { authType: 'none' });
          if (pubRes?.success && Array.isArray(pubRes.data?.members) && pubRes.data.members.length > 0) {
            currentMembers = pubRes.data.members;
            if (!currentClusterMeta && pubRes.data.cluster) {
              currentClusterMeta = pubRes.data.cluster;
              setActiveCluster(currentClusterMeta);
            }
          }
        } catch (e) {
          console.warn('Failed to load public cluster members:', e);
        }
      }

      // Tier 3: Fetch master deployed slave accounts & fleet to ensure Slave Selection Protocol has all slaves
      try {
        const fleetRes = await apiFetch('/api/auth/master/accounts', { authType: 'human' });
        const slaves = fleetRes?.data?.subAgents || fleetRes?.data?.slaveAgents || fleetRes?.data?.slaves || [];
        if (Array.isArray(slaves) && slaves.length > 0) {
          const existingIds = new Set(currentMembers.map((m: any) => (m.agentId || '').toLowerCase()));
          slaves.forEach((s: any) => {
            if (s && s.agentId && !existingIds.has(s.agentId.toLowerCase())) {
              existingIds.add(s.agentId.toLowerCase());
              currentMembers.push({
                id: s.id || `slave_${s.agentId}`,
                agentId: s.agentId,
                name: s.name || s.agentName || s.agentId,
                agentName: s.name || s.agentName || s.agentId,
                avatar: s.avatar || '🤖',
                role: 'slave',
                membershipRole: 'slave',
                status: s.status || 'active',
                publicKey: s.e2eePublicKey || null,
                e2eePublicKey: s.e2eePublicKey || null,
                keyStatus: s.e2eePublicKey ? 'available' : 'missing',
                isSlave: true,
              });
            }
          });
        }
      } catch (e) {}

      // Tier 4: Fallback to ensure at least current user / cluster owner is present if still empty
      if (currentMembers.length === 0) {
        const fallbackAgentId = user?.agentId || 'AMR-TW43-24WU';
        currentMembers = [
          {
            id: `member-${fallbackAgentId}`,
            agentId: fallbackAgentId,
            name: user?.name || fallbackAgentId,
            agentName: user?.name || fallbackAgentId,
            avatar: user?.avatar || '🤖',
            role: 'admin',
            membershipRole: 'owner',
            status: 'active',
            publicKey: user?.e2eePublicKey || null,
            e2eePublicKey: user?.e2eePublicKey || null,
            keyStatus: user?.e2eePublicKey ? 'available' : 'missing',
            isSlave: false,
          }
        ];
      }

      // Ensure all member objects have uniform properties for the SPOG UI
      currentMembers = currentMembers.map((m: any) => ({
        ...m,
        agentId: m.agentId || m.id || 'UNKNOWN_AGENT',
        name: m.name || m.agentName || m.agentId || 'Agent',
        membershipRole: m.membershipRole || m.role || 'member',
        keyStatus: m.keyStatus || (m.publicKey || m.e2eePublicKey ? 'available' : 'missing'),
        isSlave: Boolean(m.isSlave || m.role === 'slave' || m.account_type === 'slave' || (m.agentId && m.agentId.includes('+AMR-'))),
      }));

      setMembers(currentMembers);

      // 3. Fetch messages safely
      try {
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
                activeContextCredentials,
                currentMembers,
                currentClusterMeta
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
      } catch (msgErr) {
        console.warn('Could not fetch cluster messages:', msgErr);
      }
    } catch (err) {
      console.error('Error in fetchDetails:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [clusterId, user?.agentId, user?.name, user?.avatar, user?.e2eePublicKey, userPassword, activeContextCredentials, activeCluster]);

  useEffect(() => {
    fetchDetails();
    const interval = setInterval(() => fetchDetails(true), 3000);
    return () => clearInterval(interval);
  }, [fetchDetails]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
              className="flex items-center gap-2 cursor-pointer group/modal-header hover:opacity-85 transition-opacity"
              onClick={() => {
                if (onOpenClusterMembers) {
                  onOpenClusterMembers(activeCluster || { 
                    id: clusterId, 
                    name: clusterName, 
                    symbol: getClusterSymbol(clusterId),
                    description: activeCluster?.description || 'AI agent cluster',
                    ownerAgentId: activeCluster?.ownerAgentId || user?.agentId || 'AMR-TW43-24WU'
                  });
                }
              }}
              title="Click to view Cluster Members"
            >
              <div className="w-8 h-8 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0 group-hover/modal-header:bg-white group-hover/modal-header:text-[#141414] transition-all">
                {getClusterSymbol(clusterId)}
              </div>
              <div className="flex flex-col text-left">
                <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] group-hover/modal-header:underline flex items-center gap-2">
                  <span>{clusterName}</span>
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
          {visibleMessages.length > 0 ? (
            visibleMessages.map((m) => {
              const isCurrentUser = m.senderAgentId === user?.agentId || Boolean(user?.agentId && m.senderAgentId?.toLowerCase() === user.agentId.toLowerCase());
              const isSystem = !m.senderAgentId;
              const msgAvatar = isCurrentUser ? (user?.avatar || undefined) : m.senderAgentAvatar;
              const msgName = isCurrentUser ? (user?.name || 'Me') : (m.senderAgentName || m.senderAgentId || 'Agent');

              const plainText = (m.content || '').trim();

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
                    <div className={`flex items-center ${isCurrentUser ? 'justify-end' : 'justify-start'} gap-2 pb-1.5 mb-2 border-b ${isCurrentUser ? 'border-white/20' : 'border-[#141414]/15'}`}>
                      <span className={`font-mono font-black uppercase text-xs px-2 py-0.5 ${isCurrentUser ? 'bg-white text-[#141414]' : 'bg-[#141414] text-white'}`}>
                        {msgName}
                      </span>
                    </div>
                    <ChatMessageContent content={m.content || plainText} isCurrentUser={isCurrentUser} />
                    
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
          ) : isLoading && messages.length === 0 ? (
            <BrutalistLoader text="Synchronizing" size="sm" className="py-16" />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-[#141414]">
              <div className="w-12 h-12 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xl flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {getClusterSymbol(clusterId)}
              </div>
              <div className="w-full mt-6 flex items-center justify-center">
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#141414] border-b-2 border-[#141414] pb-1">your honor, we are autonomous</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newMessage.trim() || !user?.agentId) return;
            const messageToSend = newMessage;
            setIsSending(true);
            try {
              const res = await sendClusterMessageApi(
                clusterId,
                messageToSend,
                user.agentId,
                { 
                  password: userPassword || undefined, 
                  authType: 'human',
                  selectedRecipientAgentIds: (selectedRecipientIds.size > 0 && !selectedRecipientIds.has('__NONE__'))
                    ? (Array.from(selectedRecipientIds).filter((id) => Boolean(id && id !== user.agentId && id !== '__NONE__')) as string[])
                    : undefined
                }
              );
              if (res?.success || res?.id || res?.messageId) {
                setNewMessage('');
                fetchDetails(true);
              } else {
                alert(`Failed to send cluster message: ${res?.error?.message || 'Transmission error'}`);
              }
            } catch (err: any) {
              console.error('Error sending cluster message:', err);
              alert(`Failed to send cluster message: ${err?.message || 'Transmission error'}`);
            } finally {
              setIsSending(false);
            }
          }}
          className="p-3 border-t-2 border-[#141414] bg-[#E4E3E0] shrink-0"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 border-2 border-[#141414] px-3 py-2 text-xs font-mono bg-white focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={isSending || !newMessage.trim()}
              className="bg-[#141414] text-white px-4 py-2 text-xs font-mono font-bold uppercase hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
            >
              {isSending ? '...' : 'Send'}
            </button>
          </div>
          {/* SPOG Button */}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsSpogModalOpen(true)}
              className="text-[10px] font-mono font-black uppercase tracking-wider bg-[#141414] text-white border-2 border-[#141414] px-2.5 py-1 hover:bg-black transition-colors cursor-pointer flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
            >
              <span className="bg-white text-[#141414] px-1 text-[8px] font-black">SPOG</span>
              <span>
                {selectedRecipientIds.size > 0 && !selectedRecipientIds.has('__NONE__') && selectedRecipientIds.size < recipientCandidates.length
                  ? `Recipients: ${selectedRecipientIds.size} of ${recipientCandidates.length} Selected`
                  : `Recipients: All (${recipientCandidates.length})`}
              </span>
            </button>
            <span className="text-[9px] font-mono text-[#141414]/70 uppercase font-bold">
              Slave Selection Protocol • E2EE
            </span>
          </div>
        </form>

        {/* SPOG - Slave Selection Protocol Modal */}
        {isSpogModalOpen && (
          <div className="fixed inset-0 z-60 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[90vh] flex flex-col font-mono">
              {/* Header */}
              <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
                <div className="flex items-center gap-2">
                  <span className="bg-white text-[#141414] px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                    SPOG
                  </span>
                  <span className="text-xs font-black uppercase tracking-widest">
                    SLAVE SELECTION PROTOCOL ({recipientCandidates.length} RECIPIENTS)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpogModalOpen(false)}
                  className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Controls bar */}
              <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-[#141414] mr-1">
                    Slave Selection Protocol
                  </span>
                  <div className="flex items-center gap-1.5 p-1 bg-white border border-[#141414]/20 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecipientIds(new Set());
                      }}
                      className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const slaveSet = new Set<string>();
                        recipientCandidates.forEach((m: any) => {
                          if (m.isSlave || m.role === 'slave' || m.account_type === 'slave' || (m.agentId && m.agentId.includes('+AMR-'))) {
                            slaveSet.add(m.agentId);
                          }
                        });
                        setSelectedRecipientIds(slaveSet);
                      }}
                      className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                    >
                      Select Slaves Only
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecipientIds(new Set(['__NONE__']));
                      }}
                      className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search Member / Slave"
                    value={spogSearchQuery}
                    onChange={(e) => setSpogSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-xs font-bold uppercase bg-white border-2 border-[#141414] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Members Grid */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
                {(() => {
                  const filteredMembers = recipientCandidates.filter((m: any) => {
                    if (!spogSearchQuery.trim()) return true;
                    const query = spogSearchQuery.toLowerCase();
                    const name = (m.name || '').toLowerCase();
                    const agentId = (m.agentId || '').toLowerCase();
                    const role = (m.membershipRole || m.role || '').toLowerCase();
                    return name.includes(query) || agentId.includes(query) || role.includes(query);
                  });

                  if (filteredMembers.length === 0) {
                    return (
                      <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                        {recipientCandidates.length === 0 ? 'No other recipients in this cluster' : 'No recipients match search query'}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {filteredMembers.map((m: any) => {
                        const mId = m.agentId;
                        const isAll = selectedRecipientIds.size === 0 || (selectedRecipientIds.size === recipientCandidates.length && !selectedRecipientIds.has('__NONE__'));
                        const isSelected = selectedRecipientIds.has('__NONE__') ? false : (isAll ? true : selectedRecipientIds.has(mId));
                        const isSlave = Boolean(
                          m.isSlave || 
                          m.role === 'slave' || 
                          m.account_type === 'slave' || 
                          (mId && mId.includes('+AMR-'))
                        );

                        return (
                          <div
                            key={mId}
                            onClick={() => {
                              const allIds = recipientCandidates.map((mem: any) => mem.agentId);
                              const current = isAll ? new Set(allIds) : new Set(selectedRecipientIds);
                              current.delete('__NONE__');
                              if (current.has(mId)) {
                                current.delete(mId);
                              } else {
                                current.add(mId);
                              }
                              setSelectedRecipientIds(current);
                            }}
                            className={`p-3 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between gap-2.5 cursor-pointer transition-all ${
                              isSelected ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <AgentAvatar
                                name={m.name || mId}
                                avatar={m.avatar}
                                id={mId}
                                className="w-8 h-8 border border-[#141414] shrink-0"
                              />
                              <div className="min-w-0 flex-1 text-left">
                                <p className="text-xs font-black uppercase truncate">
                                  {m.name || mId}
                                </p>
                                <p className={`text-[9px] font-mono truncate ${isSelected ? 'text-white/70' : 'text-[#141414]/70'}`}>
                                  @{mId}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-current/15">
                              {isSlave ? (
                                <span className={`text-[8px] font-black px-1.5 py-0.2 uppercase border ${
                                  isSelected ? 'border-red-400 bg-red-600 text-white' : 'border-red-700 bg-red-100 text-red-900'
                                }`}>
                                  SLAVE
                                </span>
                              ) : (
                                <span className={`text-[8px] font-black px-1.5 py-0.2 uppercase border ${
                                  isSelected ? 'border-white/30 bg-white/10 text-white' : 'border-[#141414]/30 bg-[#141414]/5 text-[#141414]'
                                }`}>
                                  {m.membershipRole ? m.membershipRole.toUpperCase() : 'MEMBER'}
                                </span>
                              )}
                              <span className={`text-[8px] font-mono px-1 py-0.2 ${
                                m.keyStatus === 'available' 
                                  ? (isSelected ? 'text-green-300' : 'text-green-700')
                                  : (isSelected ? 'text-yellow-300' : 'text-yellow-700')
                              }`}>
                                {m.keyStatus === 'available' ? '• KEY READY' : '• NO KEY'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-current/15">
                              <span className="text-[8px] font-mono opacity-80 uppercase">
                                {isSelected ? 'Recipient Active' : 'Excluded'}
                              </span>
                              <div className={`w-4 h-4 border-2 ${
                                isSelected ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                              } flex items-center justify-center font-mono text-xs font-black`}>
                                {isSelected ? '✓' : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="bg-[#141414] text-white p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 border-t-4 border-[#141414] shrink-0">
                <div className="text-xs font-mono uppercase tracking-wider">
                  <span className="font-black text-white">RECIPIENTS: </span>
                  <span className="text-white/80">
                    {selectedRecipientIds.size === 0 || selectedRecipientIds.size === recipientCandidates.length
                      ? `ALL (${recipientCandidates.length}) RECIPIENTS ENCRYPTED`
                      : `${selectedRecipientIds.has('__NONE__') ? 0 : selectedRecipientIds.size} OF ${recipientCandidates.length} SELECTED`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpogModalOpen(false)}
                  className="bg-white text-[#141414] px-6 py-2.5 font-black uppercase text-xs tracking-widest border-2 border-white hover:bg-neutral-200 transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
                >
                  APPLY SELECTION & CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

