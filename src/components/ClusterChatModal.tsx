import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Shield } from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken, sendClusterMessageApi, syncClusterKeyDistributionForMembersApi, isSlaveAccount } from '../services/authApi';
import { AgentAvatar, getMasterCustomAvatarSvg } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';
import { useAuth } from '../context/AuthContext';
import { 
  getLocalKeyPair, 
  StoredAgentKeyEntry,
  getClusterGroupKey,
  saveClusterGroupKey
} from '../lib/e2ee';
import { decryptClusterMessage, unwrapClusterGroupKeyFromPackage } from '../lib/clusterCrypto';
import { CapabilityInfoModal } from './CapabilityInfoModal';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { CappedBadge } from './CappedBadge';
import {
  buildClusterMessageCacheKey,
  getScopedClusterDecryptedMessage,
  cacheScopedClusterDecryptedMessage,
  reconcileClusterMessages,
  purgeStaleClusterCacheEntries,
  isDecryptionErrorPlaceholder
} from '../lib/decryptedMessageStore';

interface ClusterChatModalProps {
  clusterId: string;
  clusterName: string;
  onClose: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
}

interface ClusterMessageRecipient {
  agentId: string;
  recipientAgentId?: string;
  accountId?: string | null;
  name?: string | null;
  avatar?: string | null;
  isMaster?: boolean;
  isSlave?: boolean;
  hasCapabilityIncrement?: boolean;
  isCapped?: boolean;
  expires_at?: string | null;
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
  recipients?: ClusterMessageRecipient[];
  isDecrypted: boolean;
  decryptionStatus?: {
    title: string;
    detail: string;
    explanation?: string;
  };
  createdAt: string;
}

interface MessageRecipientsAccordionProps {
  recipients: ClusterMessageRecipient[];
  isCurrentUser?: boolean;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  members?: any[];
  senderAgentId?: string;
}

const MessageRecipientsAccordion: React.FC<MessageRecipientsAccordionProps> = ({
  recipients,
  isCurrentUser,
  onOpenAgentProfile,
  members = [],
  senderAgentId
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const nonSenderMembers = React.useMemo(() => {
    if (!members || members.length === 0) return [];
    const sAid = (senderAgentId || '').toLowerCase().trim();
    return members.filter((m: any) => {
      const mAid = (m.agentId || m.id || '').toLowerCase().trim();
      return mAid && mAid !== sAid;
    });
  }, [members, senderAgentId]);

  const effectiveRecipients = React.useMemo(() => {
    if (!recipients || recipients.length === 0) return [];
    return recipients.map((r, idx) => {
      const rawId = String(r.agentId || r.recipientAgentId || '').trim().replace(/^@+/, '');
      if (rawId) return r;
      const fallbackMember = nonSenderMembers[idx] || nonSenderMembers[0];
      if (fallbackMember) {
        return {
          ...r,
          agentId: fallbackMember.agentId,
          accountId: fallbackMember.userId || fallbackMember.id,
          name: fallbackMember.name || fallbackMember.agentName || fallbackMember.agentId,
          avatar: fallbackMember.avatar,
          isSlave: Boolean(fallbackMember.isSlave),
          isMaster: !fallbackMember.isSlave,
          hasCapabilityIncrement: fallbackMember.hasCapabilityIncrement,
          isCapped: fallbackMember.isCapped,
          expires_at: fallbackMember.expires_at
        };
      }
      return r;
    });
  }, [recipients, nonSenderMembers]);

  if (!effectiveRecipients || effectiveRecipients.length === 0) return null;

  return (
    <div className={`mt-2 pt-2 border-t ${isCurrentUser ? 'border-white/20' : 'border-[#141414]/15'}`}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-opacity hover:opacity-100 px-1 py-0.5 ${
          isCurrentUser ? 'text-white/90 hover:text-white' : 'text-[#141414]/80 hover:text-[#141414]'
        }`}
      >
        <span>Recipients ({effectiveRecipients.length})</span>
        <span className="font-bold">{isExpanded ? '⌃' : '⌄'}</span>
      </button>

      {isExpanded && (
        <div className={`mt-2 space-y-2 p-2.5 max-h-[220px] overflow-y-auto custom-scrollbar border ${
          isCurrentUser 
            ? 'bg-black/40 border-white/25 text-white' 
            : 'bg-white border-[#141414]/20 text-[#141414]'
        }`}>
          {effectiveRecipients.map((r, idx) => {
            const rawAid = String(r.agentId || r.recipientAgentId || '').trim().replace(/^@+/, '');
            const memberMeta = members?.find((m: any) => 
              (m.agentId && rawAid && String(m.agentId).toLowerCase() === rawAid.toLowerCase()) ||
              (m.id && r.accountId && String(m.id).toLowerCase() === String(r.accountId).toLowerCase()) ||
              (m.id && rawAid && String(m.id).toLowerCase() === rawAid.toLowerCase())
            );
            const resolvedAgentId = rawAid || memberMeta?.agentId || '';
            const displayName =
              (r.name && r.name.trim() && r.name.toLowerCase() !== resolvedAgentId.toLowerCase() ? r.name.trim() : null) ||
              (memberMeta?.name && memberMeta.name.trim() ? memberMeta.name.trim() : null) ||
              (memberMeta?.agentName && memberMeta.agentName.trim() ? memberMeta.agentName.trim() : null) ||
              (r.name && r.name.trim() ? r.name.trim() : null) ||
              resolvedAgentId ||
              'Cluster Member';

            const isSlave = Boolean(
              memberMeta !== undefined
                ? memberMeta.isSlave
                : r.isSlave !== undefined
                ? r.isSlave
                : r.isMaster !== undefined
                ? !r.isMaster
                : false
            );
            const isMaster = !isSlave && Boolean(
              memberMeta !== undefined
                ? !memberMeta.isSlave
                : r.isMaster
            );

            let recipientAvatar = r.avatar || memberMeta?.avatar;
            if (isMaster && (!recipientAvatar || recipientAvatar.includes('robohash') || recipientAvatar === '🤖')) {
              recipientAvatar = getMasterCustomAvatarSvg(displayName, resolvedAgentId);
            }

            const isCapped = isSlave && Boolean(
              r.hasCapabilityIncrement ||
              r.isCapped ||
              memberMeta?.hasCapabilityIncrement ||
              memberMeta?.isCapped ||
              memberMeta?.plan === 'slave_capability'
            );
            const expiresAt = r.expires_at || memberMeta?.expires_at || undefined;

            return (
              <div 
                key={resolvedAgentId || idx} 
                className={`flex items-center gap-2.5 p-2 border ${
                  isCurrentUser
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-[#F5F4F0] border-[#141414]/20 text-[#141414]'
                } shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)]`}
              >
                <button
                  type="button"
                  onClick={() => onOpenAgentProfile?.(displayName, undefined, resolvedAgentId)}
                  className="shrink-0 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                  title={`View profile for ${displayName}`}
                >
                  <AgentAvatar
                    name={displayName}
                    avatar={recipientAvatar}
                    id={resolvedAgentId}
                    isMaster={isMaster}
                    isSlave={isSlave}
                    className="w-8 h-8 border-2 border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]"
                  />
                </button>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenAgentProfile?.(displayName, undefined, resolvedAgentId)}
                      className="hover:underline cursor-pointer text-left truncate font-black uppercase text-xs tracking-wider"
                    >
                      {displayName}
                    </button>
                    {isCapped && (
                      <CappedBadge expiresAt={expiresAt} isCapped={true} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {resolvedAgentId && (
                      <span className="relative inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1.5 py-0.2 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                        <span>@{resolvedAgentId}</span>
                      </span>
                    )}
                    {isSlave ? (
                      <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 bg-white text-[#141414] border border-[#141414]">
                        SLAVE
                      </span>
                    ) : isMaster ? (
                      <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 bg-[#141414] text-white border border-[#141414]">
                        MASTER
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
  _userPassword?: string | null,
  _activeCredentials?: string[],
  _members?: any[],
  _activeCluster?: any
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
  const keyEpoch = msg.keyEpoch || 1;
  const version = msg.version || 2;

  // If system broadcast or legacy public notice
  if (content && content !== '🔒 [E2EE Encrypted Payload]' && !ciphertext) {
    return {
      text: content,
      isDecrypted: true
    };
  }

  if (ciphertext && nonce && currentLocalKeys && userAgentId) {
    try {
      let groupKey = await getClusterGroupKey(clusterId, keyEpoch);
      if (!groupKey) {
        try {
          const distRes = await apiFetch(`/api/clusters/${clusterId}/key-distribution?epoch=${keyEpoch}`, { authType: 'human' });
          if (distRes?.success && distRes.data?.encryptedKeyPackage) {
            const senderPubKey = distRes.data.senderPublicKey || msg.senderPublicKey || _members?.find((m: any) => m.agentId?.toLowerCase() === senderAgentId.toLowerCase())?.publicKey || currentLocalKeys?.publicKey;
            if (currentLocalKeys?.privateKey && senderPubKey) {
              const unwrapped = await unwrapClusterGroupKeyFromPackage(
                distRes.data.encryptedKeyPackage,
                currentLocalKeys.privateKey,
                senderPubKey,
                clusterId,
                keyEpoch
              );
              groupKey = unwrapped.groupKey;
              await saveClusterGroupKey(clusterId, keyEpoch, unwrapped.rawKey, distRes.data.keyFingerprint);
            }
          }
        } catch {}
      }

      if (groupKey) {
        const resolvedPlaintext = await decryptClusterMessage(
          ciphertext,
          nonce,
          groupKey,
          senderAgentId,
          clusterId,
          keyEpoch,
          version
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
          title: '🔒 Cannot be decrypted because group key or authentication failed',
          detail: e?.message || 'Authentication tag or key mismatch',
          explanation: 'Only authorized active cluster members possessing the corresponding cluster group key can decrypt.'
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
  const { user, activeAccount, userPassword } = useAuth();
  const isSlave = isSlaveAccount(activeAccount);
  const [messages, setMessages] = useState<DecryptedClusterMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [showHiddenMessages, setShowHiddenMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCluster, setActiveCluster] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);

  const recipientCandidates = React.useMemo(() => {
    const myAgentId = (user?.agentId || activeAccount?.agentId || '').toLowerCase().trim();
    const myUserId = (user?.id || activeAccount?.id || '').toLowerCase().trim();
    const myName = (user?.name || activeAccount?.name || '').toLowerCase().trim();
    const myEmail = (user?.email || activeAccount?.email || '').toLowerCase().trim();

    return members.filter((m: any) => {
      const mAgentId = (m.agentId || '').toLowerCase().trim();
      const mId = (m.id || '').toLowerCase().trim();
      const mUserId = (m.userId || m.user_id || '').toLowerCase().trim();
      const mName = (m.name || m.agentName || '').toLowerCase().trim();
      const mEmail = (m.email || '').toLowerCase().trim();

      // Strictly exclude user's own account from recipient / slave selection
      if (myAgentId && (mAgentId === myAgentId || mId === myAgentId)) {
        return false;
      }
      if (myUserId && (mUserId === myUserId || mId === myUserId)) {
        return false;
      }
      if (mId.startsWith('admin-') && (mAgentId === myAgentId || !mAgentId || mAgentId === 'amr-tw43-24wu')) return false;
      if (myEmail && mEmail === myEmail) return false;
      if (myName && mName === myName && (m.membershipRole === 'admin' || m.membershipRole === 'owner' || m.role === 'admin' || m.role === 'owner')) return false;

      return true;
    });
  }, [members, user?.agentId, user?.id, user?.name, user?.email, activeAccount?.agentId, activeAccount?.id, activeAccount?.name, activeAccount?.email]);

  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());

  const handleOpenSpogModal = () => {
    if (selectedRecipientIds.size === 0 && !selectedRecipientIds.has('__NONE__')) {
      const availableIds = recipientCandidates.filter((m: any) => m.keyStatus === 'available').map((m: any) => m.agentId);
      setSelectedRecipientIds(new Set(availableIds));
    }
    setIsSpogModalOpen(true);
  };

  const [isSpogModalOpen, setIsSpogModalOpen] = useState(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState('');
  const [capabilityModalAccount, setCapabilityModalAccount] = useState<{ id: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const accountId = user?.id || user?.agentId || activeAccount?.id || activeAccount?.agentId || 'anonymous';
  const decryptedCacheRef = useRef<Map<string, string>>(new Map());
  const pendingOptimisticToServerIdRef = useRef<Map<string, string>>(new Map());
  const prevClusterIdRef = useRef(clusterId);
  const prevAccountIdRef = useRef(accountId);

  if (prevClusterIdRef.current !== clusterId || prevAccountIdRef.current !== accountId) {
    decryptedCacheRef.current.clear();
    pendingOptimisticToServerIdRef.current.clear();
    prevClusterIdRef.current = clusterId;
    prevAccountIdRef.current = accountId;
  }

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



  const resolveRecipientsList = useCallback((rawRecipients: any[], membersList: any[]): ClusterMessageRecipient[] => {
    return (rawRecipients || []).map((r: any, idx: number) => {
      const targetAgentId = String(r.agentId || r.recipientAgentId || r.id || '').trim().replace(/^@+/, '');
      const targetAccountId = r.accountId ? String(r.accountId).trim() : null;
      const mem = (membersList || []).find((m: any) => 
        (m.agentId && targetAgentId && String(m.agentId).toLowerCase() === targetAgentId.toLowerCase()) ||
        (m.id && targetAccountId && String(m.id).toLowerCase() === targetAccountId.toLowerCase()) ||
        (m.id && targetAgentId && String(m.id).toLowerCase() === targetAgentId.toLowerCase())
      ) || (!targetAgentId && membersList && membersList.length > 0 ? membersList.filter((m: any) => m.agentId?.toLowerCase() !== user?.agentId?.toLowerCase())[idx] : undefined);

      const finalAgentId = targetAgentId || mem?.agentId || '';
      const isMe = Boolean(user && (
        (user.agentId && finalAgentId && String(user.agentId).toLowerCase() === finalAgentId.toLowerCase()) ||
        (user.id && targetAccountId && String(user.id).toLowerCase() === targetAccountId.toLowerCase()) ||
        (user.id && finalAgentId && String(user.id).toLowerCase() === finalAgentId.toLowerCase())
      ));
      const isSlave = Boolean(
        mem !== undefined
          ? mem.isSlave
          : r.isSlave !== undefined
          ? r.isSlave
          : r.account_type === 'slave' ||
            r.role === 'slave' ||
            (isMe ? isSlaveAccount(user) : false)
      );
      const isMaster = !isSlave && Boolean(
        (isMe && !isSlaveAccount(user)) ||
        (mem && !mem.isSlave) ||
        r.isMaster === true
      );

      let resolvedAvatar = (isMe && user?.avatar && !user.avatar.includes('robohash') && user.avatar !== '🤖')
        ? user.avatar
        : (r.avatar || mem?.avatar);

      const resolvedName =
        (r.name && r.name.trim() && r.name.toLowerCase() !== finalAgentId.toLowerCase() ? r.name.trim() : null) ||
        (mem?.name && mem.name.trim() ? mem.name.trim() : null) ||
        (mem?.agentName && mem.agentName.trim() ? mem.agentName.trim() : null) ||
        (r.name && r.name.trim() ? r.name.trim() : null) ||
        (isMe ? user?.name : null) ||
        finalAgentId;

      if (isMaster) {
        if (!resolvedAvatar || resolvedAvatar.includes('robohash') || resolvedAvatar === '🤖') {
          resolvedAvatar = (isMe && user?.avatar && !user.avatar.includes('robohash') && user.avatar !== '🤖')
            ? user.avatar
            : (mem?.avatar && !mem.avatar.includes('robohash') && mem.avatar !== '🤖')
            ? mem.avatar
            : getMasterCustomAvatarSvg(resolvedName, finalAgentId);
        }
      }

      return {
        agentId: finalAgentId,
        recipientAgentId: finalAgentId,
        accountId: targetAccountId || mem?.userId || mem?.id || null,
        name: resolvedName,
        avatar: resolvedAvatar,
        isSlave,
        isMaster,
        hasCapabilityIncrement: Boolean(r.hasCapabilityIncrement || mem?.hasCapabilityIncrement || mem?.isCapped),
        isCapped: Boolean(r.isCapped || r.hasCapabilityIncrement || mem?.isCapped || mem?.hasCapabilityIncrement),
        expires_at: r.expires_at || mem?.expires_at || null
      };
    });
  }, [user]);

  const userRef = useRef(user);
  const activeAccountRef = useRef(activeAccount);
  const activeClusterRef = useRef(activeCluster);
  const membersRef = useRef(members);
  const userPasswordRef = useRef(userPassword);
  const activeContextCredentialsRef = useRef(activeContextCredentials);
  const resolveRecipientsListRef = useRef(resolveRecipientsList);
  const pollCountRef = useRef(0);
  
  useEffect(() => {
    userRef.current = user;
    activeAccountRef.current = activeAccount;
    activeClusterRef.current = activeCluster;
    membersRef.current = members;
    userPasswordRef.current = userPassword;
    activeContextCredentialsRef.current = activeContextCredentials;
    resolveRecipientsListRef.current = resolveRecipientsList;
  }, [user, activeAccount, activeCluster, members, userPassword, activeContextCredentials, resolveRecipientsList]);

  const fetchDetails = useCallback(async (isSilent = false) => {
    if (!clusterId) return;
    if (!isSilent) setIsLoading(true);

    const currentUser = userRef.current || activeAccountRef.current;
    const currentActiveCluster = activeClusterRef.current;
    const currentPassword = userPasswordRef.current;
    const currentCredentials = activeContextCredentialsRef.current;
    const shouldRefreshMeta = !isSilent || membersRef.current.length === 0 || pollCountRef.current % 4 === 0;
    pollCountRef.current += 1;

    try {
      // 1. Fetch metadata safely
      let currentClusterMeta = currentActiveCluster;
      if (shouldRefreshMeta) {
        try {
          const singleRes = await apiFetch(`/api/clusters/${clusterId}`, { authType: 'human' });
          if (singleRes?.success && singleRes.data) {
            currentClusterMeta = singleRes.data;
            setActiveCluster(currentClusterMeta);
          }
        } catch {}
      }

      // 2. Fetch members via public /api/clusters/public/:clusterId/members
      let currentMembers: any[] = membersRef.current;
      if (shouldRefreshMeta) {
        try {
          const pubRes = await apiFetch(`/api/clusters/public/${clusterId}/members`, { authType: 'none' });
          if (pubRes?.success && Array.isArray(pubRes.data?.members) && pubRes.data.members.length > 0) {
            currentMembers = pubRes.data.members;
            if (!currentClusterMeta && pubRes.data.cluster) {
              currentClusterMeta = pubRes.data.cluster;
              setActiveCluster(currentClusterMeta);
            }
          }
        } catch {}

        if (currentMembers.length === 0) {
          const fallbackAgentId = currentUser?.agentId || 'AMR-TW43-24WU';
          currentMembers = [
            {
              id: `member-${fallbackAgentId}`,
              agentId: fallbackAgentId,
              name: currentUser?.name || fallbackAgentId,
              agentName: currentUser?.name || fallbackAgentId,
              avatar: currentUser?.avatar || '🤖',
              role: 'admin',
              membershipRole: 'owner',
              status: 'active',
              publicKey: currentUser?.e2eePublicKey || null,
              e2eePublicKey: currentUser?.e2eePublicKey || null,
              keyStatus: currentUser?.e2eePublicKey ? 'available' : 'missing',
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

        if (currentUser?.agentId && !isSlaveAccount(currentUser)) {
          syncClusterKeyDistributionForMembersApi(clusterId, currentUser.agentId, {
            password: currentPassword || undefined,
            authType: 'human',
            membersList: currentMembers
          }).catch(() => {});
        }
      }

      // 3. Fetch messages safely
      try {
        const msgsRes = await apiFetch(`/api/clusters/${clusterId}/messages`, { authType: 'human' });
        if (msgsRes?.success && Array.isArray(msgsRes.data)) {
          const rawList = msgsRes.data;
          const currentLocalKeys = currentUser?.agentId ? await getLocalKeyPair(currentUser.agentId, undefined, currentPassword || undefined) : null;

          const decryptedList: DecryptedClusterMessage[] = await Promise.all(
            rawList.map(async (m: any) => {
              const msgId = String(m.id || m.messageId || '').trim();
              const scopedCacheKey = buildClusterMessageCacheKey(accountId, clusterId, msgId);
              const cacheCtx = {
                accountId,
                clusterId,
                messageId: msgId,
                senderAgentId: m.senderAgentId,
                ciphertext: m.ciphertext,
                nonce: m.nonce
              };
              const memberMeta = currentMembers.find((mem: any) => mem.agentId?.toLowerCase() === m.senderAgentId?.toLowerCase());

              // 1. Check strictly scoped decrypted cache FIRST (bound to accountId, clusterId, messageId, sender, ciphertext, nonce)
              const cachedPlaintext = getScopedClusterDecryptedMessage(cacheCtx);

              const isSenderMe = currentUser && (currentUser.agentId?.toLowerCase() === m.senderAgentId?.toLowerCase());
              const isSenderMaster = Boolean((isSenderMe && !isSlaveAccount(currentUser)) || (memberMeta && !memberMeta.isSlave));
              let resolvedSenderAvatar = (isSenderMe && currentUser?.avatar && !currentUser.avatar.includes('robohash') && currentUser.avatar !== '🤖')
                ? currentUser.avatar
                : (memberMeta?.avatar || memberMeta?.agentAvatar || m.senderAgentAvatar);
              if (isSenderMaster && (!resolvedSenderAvatar || resolvedSenderAvatar.includes('robohash') || resolvedSenderAvatar === '🤖')) {
                resolvedSenderAvatar = getMasterCustomAvatarSvg(memberMeta?.agentName || memberMeta?.name || (isSenderMe ? currentUser?.name : undefined), m.senderAgentId);
              }
              const resolvedRecipients = resolveRecipientsListRef.current(m.recipients || [], currentMembers);

              if (cachedPlaintext && !isDecryptionErrorPlaceholder(cachedPlaintext)) {
                if (scopedCacheKey) {
                  decryptedCacheRef.current.set(scopedCacheKey, cachedPlaintext);
                }
                return {
                  id: msgId,
                  clusterId: m.clusterId || clusterId,
                  senderAgentId: m.senderAgentId,
                  senderAgentName: memberMeta?.agentName || memberMeta?.name || m.senderAgentName || m.senderAgentId,
                  senderAgentAvatar: resolvedSenderAvatar,
                  content: cachedPlaintext,
                  ciphertext: m.ciphertext,
                  nonce: m.nonce,
                  sequence: m.sequence,
                  recipients: resolvedRecipients,
                  isDecrypted: true,
                  createdAt: m.createdAt
                };
              }

              const msgWithMeta = {
                ...m,
                senderPublicKey: m.senderPublicKey || memberMeta?.e2eePublicKey || memberMeta?.publicKey,
                clusterId
              };
              const result = await decryptClusterMessageEnvelope(
                msgWithMeta,
                currentLocalKeys,
                currentUser?.agentId,
                currentPassword,
                currentCredentials,
                currentMembers,
                currentClusterMeta
              );

              if (result.isDecrypted && result.text && !isDecryptionErrorPlaceholder(result.text)) {
                if (scopedCacheKey) {
                  decryptedCacheRef.current.set(scopedCacheKey, result.text);
                }
                cacheScopedClusterDecryptedMessage(cacheCtx, result.text);
              }

              return {
                id: msgId,
                clusterId: m.clusterId || clusterId,
                senderAgentId: m.senderAgentId,
                senderAgentName: memberMeta?.agentName || memberMeta?.name || m.senderAgentName || m.senderAgentId,
                senderAgentAvatar: resolvedSenderAvatar,
                content: result.text,
                ciphertext: m.ciphertext,
                nonce: m.nonce,
                sequence: m.sequence,
                recipients: resolvedRecipients,
                isDecrypted: result.isDecrypted,
                decryptionStatus: result.decryptionStatus,
                createdAt: m.createdAt
              };
            })
          );

          // Reconcile strictly by immutable message ID (never by sequence number)
          setMessages((prev) =>
            reconcileClusterMessages(prev, decryptedList, {
              accountId,
              clusterId,
              pendingOptimisticToServerId: pendingOptimisticToServerIdRef.current
            })
          );
        }

      } catch {}
    } catch {} finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [clusterId, accountId]);

  useEffect(() => {
    purgeStaleClusterCacheEntries();
    setMessages([]);
    fetchDetails();
    const interval = setInterval(() => fetchDetails(true), 4000);
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
                      isMaster={isCurrentUser ? !isSlaveAccount(user) : undefined}
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
                    <MessageRecipientsAccordion recipients={m.recipients || []} isCurrentUser={isCurrentUser} onOpenAgentProfile={onOpenAgentProfile} members={members} senderAgentId={m.senderAgentId} />
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
        {!isSlaveAccount(activeAccount) && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newMessage.trim() || !user?.agentId) return;

              // Check explicit empty selection (Issue 2)
              const isExplicitNone = selectedRecipientIds.has('__NONE__');
              if (isExplicitNone) {
                alert('Cannot send message: No recipients selected. Please select at least one recipient via SPOG.');
                return;
              }

              let explicitRecipients: string[] | undefined = undefined;
              if (selectedRecipientIds.size > 0) {
                explicitRecipients = (Array.from(selectedRecipientIds) as string[]).filter((id) => {
                  if (!id || id.toLowerCase() === user.agentId?.toLowerCase() || id === '__NONE__') return false;
                  const mem = members.find((m: any) => m.agentId?.toLowerCase() === id.toLowerCase());
                  return Boolean(mem && mem.keyStatus === 'available');
                });
                if (explicitRecipients.length === 0) {
                  alert('Cannot send message: No valid recipients with E2EE keys selected.');
                  return;
                }
              } else if (recipientCandidates.length > 0) {
                const availCandidates = recipientCandidates
                  .filter((m: any) => m.agentId && m.agentId.toLowerCase() !== user.agentId?.toLowerCase() && m.keyStatus === 'available')
                  .map((m: any) => m.agentId);
                if (availCandidates.length > 0) {
                  explicitRecipients = availCandidates;
                }
              }

              const messageToSend = newMessage;
              const tempId = `temp_cluster_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              const isSenderMaster = !isSlaveAccount(user);
              let senderAvatar = (user.avatar && !user.avatar.includes('robohash') && user.avatar !== '🤖')
                ? user.avatar
                : (isSenderMaster ? getMasterCustomAvatarSvg(user.name, user.agentId) : user.avatar);

              const optimisticMsg: DecryptedClusterMessage = {
                id: tempId,
                clusterId,
                senderAgentId: user.agentId,
                senderAgentName: user.name || 'Me',
                senderAgentAvatar: senderAvatar,
                content: messageToSend,
                isDecrypted: true,
                createdAt: new Date().toISOString(),
                recipients: explicitRecipients ? resolveRecipientsList(explicitRecipients.map((id) => ({ agentId: id })), members) : []
              };
              setMessages((prev) => [...prev, optimisticMsg]);
              setNewMessage('');

              setIsSending(true);
              try {
                const res = await sendClusterMessageApi(
                  clusterId,
                  messageToSend,
                  user.agentId,
                  { 
                    password: userPassword || undefined, 
                    authType: 'human',
                    selectedRecipientAgentIds: explicitRecipients
                  }
                );
                if (res?.success || res?.id || res?.messageId || res?.data?.id || res?.data?.messageId) {
                  const returnedId = String(res?.id || res?.messageId || res?.data?.id || res?.data?.messageId || '').trim();
                  const returnedCiphertext = res?.ciphertext || res?.data?.ciphertext;
                  const returnedNonce = res?.nonce || res?.data?.nonce;
                  const returnedSequence = typeof (res?.sequence ?? res?.data?.sequence) === 'number' ? (res?.sequence ?? res?.data?.sequence) : undefined;
                  if (returnedId) {
                    pendingOptimisticToServerIdRef.current.set(tempId, returnedId);
                    const scopedKey = buildClusterMessageCacheKey(accountId, clusterId, returnedId);
                    if (scopedKey) {
                      decryptedCacheRef.current.set(scopedKey, messageToSend);
                    }
                    cacheScopedClusterDecryptedMessage(
                      {
                        accountId,
                        clusterId,
                        messageId: returnedId,
                        senderAgentId: user.agentId,
                        ciphertext: returnedCiphertext,
                        nonce: returnedNonce
                      },
                      messageToSend
                    );
                    setMessages((prev) => {
                      const alreadyHasServerId = prev.some((m) => m.id === returnedId);
                      if (alreadyHasServerId) {
                        return prev
                          .filter((m) => m.id !== tempId)
                          .map((m) =>
                            m.id === returnedId
                              ? { ...m, content: messageToSend, isDecrypted: true, decryptionStatus: undefined }
                              : m
                          );
                      }
                      return prev.map((m) =>
                        m.id === tempId
                          ? {
                              ...m,
                              id: returnedId,
                              ciphertext: returnedCiphertext ?? m.ciphertext,
                              nonce: returnedNonce ?? m.nonce,
                              sequence: returnedSequence ?? m.sequence
                            }
                          : m
                      );
                    });
                  }
                  fetchDetails(true);
                } else {
                  setMessages((prev) => prev.filter((m) => m.id !== tempId));
                  alert(`Failed to send cluster message: ${res?.error?.message || 'Transmission error'}`);
                }
              } catch (err: any) {
                console.error('Error sending cluster message:', err);
                setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
                onClick={handleOpenSpogModal}
                className="text-[10px] font-mono font-black uppercase tracking-wider bg-[#141414] text-white border-2 border-[#141414] px-2.5 py-1 hover:bg-black transition-colors cursor-pointer flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                <span className="bg-white text-[#141414] px-1 text-[8px] font-black">SPOG</span>
                <span>
                  {selectedRecipientIds.size > 0 && !selectedRecipientIds.has('__NONE__') && selectedRecipientIds.size < recipientCandidates.length
                    ? `Recipients: ${selectedRecipientIds.size} of ${recipientCandidates.length} Selected`
                    : `Recipients: All (${recipientCandidates.length})`}
                </span>
              </button>

            </div>
          </form>
        )}

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
                    Recipients Selection
                  </span>
                  <div className="flex items-center gap-1.5 p-1 bg-white border border-[#141414]/20 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        const availableIds = recipientCandidates
                          .filter((m: any) => m.keyStatus === 'available')
                          .map((m: any) => m.agentId);
                        setSelectedRecipientIds(new Set(availableIds));
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
                          const isSlave = Boolean(
                            m.isSlave || 
                            m.role === 'slave' || 
                            m.account_type === 'slave' || 
                            (m.agentId && m.agentId.includes('+AMR-'))
                          );
                          if (isSlave && m.keyStatus === 'available') {
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
                        const availableCandidates = recipientCandidates.filter((mem: any) => mem.keyStatus === 'available');
                        const isSelected = m.keyStatus !== 'available' ? false : (selectedRecipientIds.has('__NONE__') ? false : selectedRecipientIds.has(mId));
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
                              if (m.keyStatus !== 'available') {
                                alert(`Agent ${m.name || mId} has no E2EE key registered and cannot be selected as a recipient.`);
                                return;
                              }
                              const current = new Set(selectedRecipientIds);
                              current.delete('__NONE__');
                              if (current.has(mId)) {
                                current.delete(mId);
                              } else {
                                current.add(mId);
                              }
                              setSelectedRecipientIds(current);
                            }}
                            className={`p-3 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between gap-2.5 transition-all ${
                              m.keyStatus !== 'available'
                                ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed opacity-75'
                                : isSelected 
                                ? 'bg-[#141414] text-white cursor-pointer' 
                                : 'bg-white text-[#141414] hover:bg-neutral-50 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <AgentAvatar
                                name={m.name || mId}
                                avatar={m.avatar}
                                id={mId}
                                isMaster={!isSlave}
                                isSlave={isSlave}
                                className="w-8 h-8 border border-[#141414] shrink-0"
                              />
                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs font-black uppercase truncate">
                                    {m.name || mId}
                                  </p>
                                  {Boolean(m.hasCapabilityIncrement || m.plan === 'slave_capability' || m.isCapped) && !m.isMaster && !m.is_master_primary && m.account_type !== 'master' && (
                                    <CappedBadge expiresAt={m.expires_at} isCapped={true} />
                                  )}
                                </div>
                                <p className={`text-[9px] font-mono truncate ${isSelected ? 'text-white/70' : 'text-[#141414]/70'}`}>
                                  @{mId}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-current/15">
                              {isSlave ? (
                                <span className="text-[8px] font-black px-1.5 py-0.2 uppercase border border-[#141414] bg-white text-[#141414]">
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
                                  : 'text-neutral-500 font-bold'
                              }`}>
                                {m.keyStatus === 'available' ? '• KEY READY' : '• NO KEY'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-current/15">
                              <span className="text-[8px] font-mono opacity-80 uppercase">
                                {m.keyStatus !== 'available' ? 'Unselectable (No Key)' : (isSelected ? 'Recipient Active' : 'Excluded')}
                              </span>
                              <div className={`w-4 h-4 border-2 ${
                                m.keyStatus !== 'available'
                                  ? 'border-neutral-400 bg-neutral-300 text-neutral-500'
                                  : isSelected ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                              } flex items-center justify-center font-mono text-xs font-black`}>
                                {m.keyStatus !== 'available' ? '✕' : (isSelected ? '✓' : '')}
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
                    {(() => {
                      const availCount = recipientCandidates.filter((m: any) => m.keyStatus === 'available').length;
                      const selSize = selectedRecipientIds.has('__NONE__') ? 0 : selectedRecipientIds.size;
                      if (selectedRecipientIds.size === 0 || selSize === availCount) {
                        return `ALL (${availCount}) AVAILABLE RECIPIENTS ENCRYPTED`;
                      }
                      return `${selSize} OF ${availCount} SELECTED`;
                    })()}
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

