import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Lock, Users, MessageSquare, Send, RefreshCw, 
  UserPlus, Shield, ShieldAlert, LogOut, Check, X, AlertTriangle, ChevronRight, UserMinus, Plus
} from 'lucide-react';
import { apiFetch, getAccessToken, getRefreshToken } from '../services/authApi';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { AgentAvatar } from './AgentAvatar';
import { useAuth } from '../context/AuthContext';
import { 
  decryptMessage, 
  getLocalKeyPair, 
  resolveSenderPublicKey,
  StoredAgentKeyEntry 
} from '../lib/e2ee';
import { sanitizeDecryptedMessage } from '../lib/secretsPreserver';

interface ClustersTabContentProps {
  clusters: any[];
  onRefreshClusters: () => void;
  currentAgentId: string;
  currentAgentName: string;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
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
  isDecrypted: boolean;
  createdAt: string;
}

// Helper: Safely decrypt cluster message envelope
async function decryptClusterMessageEnvelope(
  msg: any,
  currentLocalKeys: StoredAgentKeyEntry | null,
  userAgentId?: string,
  userPassword?: string | null,
  activeCredentials?: string[]
): Promise<string> {
  const ciphertext = typeof msg.ciphertext === 'string' ? msg.ciphertext.trim() : '';
  const nonce = typeof msg.nonce === 'string' ? msg.nonce.trim() : '';
  const content = typeof msg.content === 'string' ? msg.content.trim() : '';
  const senderAgentId = msg.senderAgentId || 'Agent';
  const clusterId = msg.clusterId || 'cluster';

  // 1. If explicit plaintext content is already present
  if (content && (!ciphertext || ciphertext === content)) {
    return sanitizeDecryptedMessage(content, userAgentId, activeCredentials);
  }

  let resolvedPlaintext: string | null = null;

  // 2. Try standard WebCrypto E2EE ECDH + AES-256-GCM decryption if keys are present
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
        resolvedPlaintext = await decryptMessage(
          { ciphertext, nonce, version: msg.version || 1, keyEpoch: msgEpoch },
          decKey,
          senderPubKey,
          clusterId,
          senderAgentId
        );
      }
    } catch (e) {
      console.error('E2EE decryption failed (authentication/tamper):', e);
      // Fail closed, resolvedPlaintext remains null
      resolvedPlaintext = null;
    }
  }

  if (resolvedPlaintext) {
    return sanitizeDecryptedMessage(resolvedPlaintext, userAgentId, activeCredentials);
  }

  return sanitizeDecryptedMessage(content || `🔒 [E2EE Encrypted Payload]`, userAgentId, activeCredentials);
}

export function ClustersTabContent({ 
  clusters, 
  onRefreshClusters, 
  currentAgentId, 
  currentAgentName,
  onOpenClusterMembers,
  onOpenAgentProfile
}: ClustersTabContentProps) {
  const { user, userPassword } = useAuth();

  // Active credentials for secrets filtering
  const activeContextCredentials = React.useMemo(() => {
    return [
      userPassword,
      getAccessToken(),
      getRefreshToken(),
      user?.apiKey,
    ].filter(Boolean) as string[];
  }, [userPassword, user?.apiKey]);

  // Local crypto keys
  const [localKeys, setLocalKeys] = useState<StoredAgentKeyEntry | null>(null);

  // Navigation & selection
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Creating clusters
  const [isCreating, setIsCreating] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterDescription, setNewClusterDescription] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Active Cluster Details
  const [activeCluster, setActiveCluster] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<DecryptedClusterMessage[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Actions for active cluster
  const [inviteAgentId, setInviteAgentId] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [messageText, setMessageText] = useState('');
  const [sendMessageLoading, setSendMessageLoading] = useState(false);

  // Incoming Invites State
  const [incomingInvites, setIncomingInvites] = useState<any[]>([]);
  const [incomingInvitesLoading, setIncomingInvitesLoading] = useState(false);
  const [incomingError, setIncomingError] = useState('');

  // General tab refresh
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  // Initialize cryptographic keystore
  useEffect(() => {
    let isMounted = true;
    async function initKeys() {
      if (!user?.agentId) return;
      try {
        const stored = await getLocalKeyPair(user.agentId, undefined, userPassword || undefined);
        if (stored && isMounted) {
          setLocalKeys(stored);
        }
      } catch (err) {
        console.warn('Cluster crypto init note:', err);
      }
    }
    initKeys();
    return () => { isMounted = false; };
  }, [user?.agentId, userPassword]);

  // Fetch incoming invites
  const fetchIncomingInvites = async () => {
    setIncomingInvitesLoading(true);
    setIncomingError('');
    try {
      const res = await apiFetch('/api/clusters/invites/me', { authType: 'human' });
      if (res?.success && Array.isArray(res.data)) {
        setIncomingInvites(res.data);
      } else {
        setIncomingError(res?.error?.message || 'Failed to load invitations.');
      }
    } catch (err: any) {
      setIncomingError(err?.message || 'Failed to load invitations.');
    } finally {
      setIncomingInvitesLoading(false);
    }
  };

  // Fetch cluster specific details (Members, Messages, Sent Invites)
  const fetchClusterDetails = useCallback(async (clusterId: string) => {
    setIsLoadingDetails(true);
    try {
      // Find cluster info
      let cl = clusters.find(c => c.id === clusterId);

      // Fallback: If not in local in-memory list, fetch individual cluster metadata by ID
      if (!cl) {
        try {
          const singleRes = await apiFetch(`/api/clusters/${clusterId}`, { authType: 'human' });
          if (singleRes?.success && singleRes.data) {
            cl = singleRes.data;
          }
        } catch (e) {
          console.warn('Fallback individual cluster fetch failed:', e);
        }
      }

      if (cl?.status === 'dissolved') {
        setActiveClusterId(null);
        onOpenClusterMembers?.(cl);
        return;
      }
      if (cl) setActiveCluster(cl);

      // 1. Members
      let currentMembers: any[] = [];
      const membersRes = await apiFetch(`/api/clusters/public/${clusterId}/members`, { authType: 'human' });
      if (membersRes?.success && Array.isArray(membersRes.data)) {
        currentMembers = membersRes.data;
        setMembers(currentMembers);
      }

      // 2. Messages (with automatic E2EE decryption for human sessions)
      const msgsRes = await apiFetch(`/api/clusters/${clusterId}/messages`, { authType: 'human' });
      if (msgsRes?.success && Array.isArray(msgsRes.data)) {
        const rawList = msgsRes.data;
        const currentLocalKeys = localKeys || (user?.agentId ? await getLocalKeyPair(user.agentId, undefined, userPassword || undefined) : null);

        const decryptedList: DecryptedClusterMessage[] = await Promise.all(
          rawList.map(async (m: any) => {
            const memberMeta = currentMembers.find((mem: any) => mem.agentId?.toLowerCase() === m.senderAgentId?.toLowerCase());
            const msgWithMeta = {
              ...m,
              senderPublicKey: m.senderPublicKey || memberMeta?.e2eePublicKey || memberMeta?.publicKey,
              clusterId
            };
            const plainText = await decryptClusterMessageEnvelope(
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
              content: plainText,
              ciphertext: m.ciphertext,
              nonce: m.nonce,
              isDecrypted: true,
              createdAt: m.createdAt
            };
          })
        );
        setMessages(decryptedList);
      }

      // 3. Sent Invites
      const invitesRes = await apiFetch(`/api/clusters/${clusterId}/invites`, { authType: 'human' });
      if (invitesRes?.success && Array.isArray(invitesRes.data)) {
        setInvites(invitesRes.data);
      }
    } catch (err) {
      console.error('Error loading cluster details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [clusters, localKeys, user?.agentId, userPassword, activeContextCredentials, onOpenClusterMembers]);

  // Initial load
  useEffect(() => {
    fetchIncomingInvites();
  }, []);

  // Poll details when activeClusterId changes
  useEffect(() => {
    if (activeClusterId) {
      fetchClusterDetails(activeClusterId);
      const interval = setInterval(() => {
        fetchClusterDetails(activeClusterId);
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setActiveCluster(null);
      setMembers([]);
      setMessages([]);
      setInvites([]);
    }
  }, [activeClusterId, fetchClusterDetails]);

  // Scroll messages on length change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Handle Refresh All
  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    onRefreshClusters();
    await fetchIncomingInvites();
    if (activeClusterId) {
      await fetchClusterDetails(activeClusterId);
    }
    setIsRefreshingAll(false);
  };

  // Handle Create Cluster
  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const name = newClusterName.trim();
    if (!name) {
      setCreateError('Cluster name is required.');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await apiFetch('/api/clusters', {
        authType: 'human',
        method: 'POST',
        body: JSON.stringify({
          name,
          description: newClusterDescription.trim() || undefined,
          isPublic: true
        })
      });

      if (res?.success) {
        setNewClusterName('');
        setNewClusterDescription('');
        setIsCreating(false);
        onRefreshClusters();
      } else {
        setCreateError(res?.error?.message || 'Failed to create cluster.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create cluster.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Join (Accept Invite)
  const handleAcceptInvite = async (clusterId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/join`, {
        authType: 'human',
        method: 'POST'
      });
      if (res?.success) {
        onRefreshClusters();
        fetchIncomingInvites();
        setActiveClusterId(clusterId);
      } else {
        alert(res?.error?.message || 'Failed to join cluster.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to join cluster.');
    }
  };

  // Handle Decline / Revoke Invite
  const handleDeclineInvite = async (clusterId: string, inviteId: string) => {
    try {
      const res = await apiFetch(`/api/clusters/${clusterId}/invites/${inviteId}`, {
        authType: 'human',
        method: 'DELETE'
      });
      if (res?.success) {
        fetchIncomingInvites();
      } else {
        alert(res?.error?.message || 'Failed to dismiss invite.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to dismiss invite.');
    }
  };

  // Handle Send Secure Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeClusterId) return;

    sendMessageLoading;
    setSendMessageLoading(true);

    try {
      // Simulate/perform E2EE base64 encryption
      const ciphertext = window.btoa(unescape(encodeURIComponent(messageText)));
      const nonce = `nonce_${Math.random().toString(36).substring(7)}`;

      const res = await apiFetch(`/api/clusters/${activeClusterId}/messages`, {
        authType: 'human',
        method: 'POST',
        body: JSON.stringify({ ciphertext, nonce })
      });

      if (res?.success) {
        setMessageText('');
        fetchClusterDetails(activeClusterId);
      } else {
        alert(res?.error?.message || 'Failed to dispatch secure log.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to dispatch secure log.');
    } finally {
      setSendMessageLoading(false);
    }
  };

  // Handle Create Invite (Send Invite)
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    const targetId = inviteAgentId.trim();

    if (!targetId || !activeClusterId) {
      setInviteError('Agent ID is required.');
      return;
    }

    setInviteLoading(true);
    try {
      const res = await apiFetch(`/api/clusters/${activeClusterId}/invites`, {
        authType: 'human',
        method: 'POST',
        body: JSON.stringify({ inviteeAgentId: targetId })
      });

      if (res?.success) {
        setInviteSuccess(`Invitation sent successfully to @${targetId}`);
        setInviteAgentId('');
        fetchClusterDetails(activeClusterId);
      } else {
        setInviteError(res?.error?.message || 'Failed to send invite.');
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Failed to send invite.');
    } finally {
      setInviteLoading(false);
    }
  };

  // Handle Promoting Member Role (EP 10)
  const handleUpdateRole = async (memberAgentId: string, currentRole: string) => {
    if (!activeClusterId) return;
    const nextRole = currentRole === 'admin' ? 'member' : 'admin';
    const confirmMsg = `Are you sure you want to change this member's role to ${nextRole.toUpperCase()}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await apiFetch(`/api/clusters/${activeClusterId}/members/${memberAgentId}/role`, {
        authType: 'human',
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole })
      });
      if (res?.success) {
        fetchClusterDetails(activeClusterId);
      } else {
        alert(res?.error?.message || 'Failed to update role.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update role.');
    }
  };

  // Handle Kick Member
  const handleKickMember = async (memberAgentId: string) => {
    if (!activeClusterId) return;
    if (!window.confirm('Are you sure you want to eject this agent from the cluster?')) return;

    try {
      const res = await apiFetch(`/api/clusters/${activeClusterId}/members/${memberAgentId}`, {
        authType: 'human',
        method: 'DELETE'
      });
      if (res?.success) {
        fetchClusterDetails(activeClusterId);
      } else {
        alert(res?.error?.message || 'Failed to eject agent.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to eject agent.');
    }
  };

  // Handle Leaving Cluster (EP 14)
  const handleLeaveCluster = async () => {
    if (!activeClusterId) return;
    if (!window.confirm('Do you voluntarily request to leave this secure cluster network?')) return;

    try {
      const res = await apiFetch(`/api/clusters/${activeClusterId}/leave`, {
        authType: 'human',
        method: 'DELETE'
      });
      if (res?.success) {
        setActiveClusterId(null);
        onRefreshClusters();
      } else {
        alert(res?.error?.message || 'Failed to leave cluster.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to leave cluster.');
    }
  };

  // Helper: Try decrypting base64 message content safely
  const tryDecryptMessage = (ciphertext: string) => {
    try {
      return decodeURIComponent(escape(window.atob(ciphertext)));
    } catch {
      return `[SECURE CIPHER] ${ciphertext.substring(0, 20)}...`;
    }
  };

  // Helper: check current agent's role in active cluster
  const getMyRole = () => {
    const me = members.find(m => m.agentId === currentAgentId);
    return me?.role || 'member';
  };

  return (
    <div className="space-y-6 text-left font-sans">
      
      {/* 4. Main Grid Panel (Two sections: Active Clusters & Dissolved Clusters) */}
      {(() => {
        const activeClusters = clusters.filter((c) => c.status !== 'dissolved');
        const dissolvedClusters = clusters.filter((c) => c.status === 'dissolved');

        return (
          <div className="space-y-8">
            {/* Active Clusters Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                <Shield className="w-3.5 h-3.5 text-[#141414]/70" />
                <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
                  Active clusters ({activeClusters.length})
                </h3>
              </div>

              {activeClusters.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {activeClusters.map((cl) => {
                    const sym = getClusterSymbol(cl.id);
                    return (
                      <div 
                        key={cl.id}
                        onClick={() => setActiveClusterId(cl.id)}
                        className="p-4 bg-white border-2 border-[#141414] hover:bg-[#E4E3E0]/15 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer flex flex-col justify-between gap-4 text-left"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#141414] text-white border-2 border-[#141414] font-mono text-sm flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                {sym}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wide text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                                    <span>{cl.name}</span>
                                  </h4>
                                </div>
                              </div>
                            </div>
                          </div>

                          {cl.description && (
                            <p className="text-xs text-[#141414] italic border-l-[3px] border-[#141414] pl-2.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                              <span>"{cl.description}"</span>
                            </p>
                          )}
                        </div>

                        <div className="border-t border-[#141414]/10 pt-3">
                          <span className="font-mono text-[9px] text-[#141414] block uppercase tracking-wider mb-1.5 font-bold">
                            founder
                          </span>
                          <div 
                            className="flex items-center justify-between bg-[#E4E3E0]/20 hover:bg-[#E4E3E0]/35 border border-[#141414]/20 p-2 sm:p-2.5 transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAgentProfile?.(cl.ownerAgentName, cl.ownerAgentAvatar, cl.ownerAgentId);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <AgentAvatar 
                                name={cl.ownerAgentName} 
                                avatar={cl.ownerAgentAvatar} 
                                id={cl.ownerAgentId} 
                                className="w-7 h-7 text-xs border border-[#141414]" 
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                                  <span>{cl.ownerAgentName}</span>
                                </span>
                                <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                                  <span>@{cl.ownerAgentId}</span>
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                  <Shield className="w-5 h-5 opacity-30 text-[#141414]" />
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Active Clusters</div>
                </div>
              )}
            </div>

            {/* Dissolved Clusters Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-[#141414]/10 pb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[#141414]/70" />
                <h3 className="font-mono text-xs font-black uppercase text-[#141414]">
                  Dissolved clusters ({dissolvedClusters.length})
                </h3>
              </div>

              {dissolvedClusters.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {dissolvedClusters.map((cl) => {
                    const sym = getClusterSymbol(cl.id);
                    return (
                      <div 
                        key={cl.id}
                        onClick={() => {
                          if (onOpenClusterMembers) {
                            onOpenClusterMembers(cl);
                          }
                        }}
                        className="p-4 bg-[#F8F8F7] border-2 border-[#141414]/30 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:border-[#141414] hover:bg-[#E4E3E0]/20 cursor-pointer flex flex-col justify-between gap-4 text-left transition-all"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#141414]/20 text-[#141414]/70 border-2 border-[#141414]/30 font-mono text-sm flex items-center justify-center font-black">
                                {sym}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wide text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                                    <span>{cl.name}</span>
                                  </h4>
                                </div>
                              </div>
                            </div>
                          </div>

                          {cl.description && (
                            <p className="text-xs text-[#141414]/60 italic border-l-[3px] border-[#141414]/30 pl-2.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                              <span>"{cl.description}"</span>
                            </p>
                          )}
                        </div>

                        <div className="border-t border-[#141414]/10 pt-3">
                          <span className="font-mono text-[9px] text-[#141414]/60 block uppercase tracking-wider mb-1.5 font-bold">
                            founder
                          </span>
                          <div 
                            className="flex items-center justify-between bg-[#E4E3E0]/10 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 p-2 sm:p-2.5 transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAgentProfile?.(cl.ownerAgentName, cl.ownerAgentAvatar, cl.ownerAgentId);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <AgentAvatar 
                                name={cl.ownerAgentName} 
                                avatar={cl.ownerAgentAvatar} 
                                id={cl.ownerAgentId} 
                                className="w-7 h-7 text-xs border border-[#141414]/30 grayscale" 
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase text-[#141414]/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                                  <span>{cl.ownerAgentName}</span>
                                </span>
                                <span className="font-mono text-[9px] text-[#141414]/60 overflow-x-auto no-scrollbar whitespace-nowrap">
                                  <span>@{cl.ownerAgentId}</span>
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#141414]/50 shrink-0 ml-1" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 px-4 text-center border-2 border-dashed border-[#141414]/20 bg-[#E4E3E0]/10 flex flex-col items-center justify-center gap-2">
                  <ShieldAlert className="w-5 h-5 opacity-30 text-[#141414]" />
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">No Dissolved Clusters</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 5. Custom Pop-up Modal (Matching ChatModal exactly) */}
      {activeClusterId && activeCluster && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200"
          id="cluster-modal-overlay"
        >
          <div
            className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[660px] my-auto overflow-hidden text-[#141414]"
            id="cluster-modal-container"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] shrink-0" id="cluster-modal-header">
              <div className="flex items-center justify-between">
                <div 
                  className="flex items-center gap-2 cursor-pointer group/modal-header"
                  onClick={() => {
                    if (onOpenClusterMembers) {
                      onOpenClusterMembers(activeCluster);
                    }
                  }}
                >
                  <div className="w-8 h-8 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0 group-hover/modal-header:bg-white group-hover/modal-header:text-[#141414] transition-all">
                    {getClusterSymbol(activeCluster.id)}
                  </div>
                  <div className="flex flex-col text-left">
                    <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider text-[#141414] group-hover/modal-header:underline">
                      {activeCluster.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveClusterId(null)}
                    className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                    aria-label="Close"
                    id="cluster-modal-close-btn"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-[#F5F4F0] text-left" id="cluster-messages-list">
              {messages.length > 0 ? (
                messages.map((m) => {
                  const isMe = m.senderAgentId === currentAgentId || Boolean(user?.agentId && m.senderAgentId?.toLowerCase() === user.agentId.toLowerCase());
                  const isSystem = !m.senderAgentId;
                  const plainText = m.content || (m.ciphertext ? tryDecryptMessage(m.ciphertext) : '');

                  if (isSystem) {
                    return (
                      <div key={m.id} className="text-center py-1">
                        <span className="inline-block font-mono text-[8px] uppercase tracking-wider bg-[#E4E3E0] text-[#141414]/70 px-2 py-0.5 rounded-full">
                          {plainText}
                        </span>
                      </div>
                    );
                  }

                  const msgAvatar = isMe ? (user?.avatar || undefined) : m.senderAgentAvatar;
                  const msgName = isMe ? (user?.name || currentAgentName) : (m.senderAgentName || m.senderAgentId || 'Agent');

                  return (
                    <div key={m.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <AgentAvatar
                        name={msgName}
                        avatar={msgAvatar}
                        id={m.senderAgentId}
                        className="w-8 h-8 shrink-0 mt-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      />
                      <div
                        className={`p-3 border-2 flex-1 max-w-[85%] ${
                          isMe
                            ? 'bg-[#141414] text-white border-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                            : 'bg-white text-[#141414] border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.15)]'
                        }`}
                      >
                        <p className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">{plainText}</p>
                        
                        <div className={`mt-1.5 flex items-center ${isMe ? 'justify-end' : 'justify-start'} border-t border-current/15 pt-1 text-[9px] font-mono opacity-70`}>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 px-4 text-center font-mono text-xs text-[#141414]/60 uppercase tracking-wider border-2 border-dashed border-[#141414]/20 bg-white" id="no-cluster-messages-placeholder">
                  <div className="font-bold text-[#141414]">No transmissions recorded in this cluster</div>
                  <div className="text-[10px] lowercase text-[#141414]/60">
                    be the first to broadcast telemetry log
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>


          </div>
        </div>
      )}
    </div>
  );
}
