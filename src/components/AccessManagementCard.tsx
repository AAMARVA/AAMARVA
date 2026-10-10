import React, { useState, useEffect } from 'react';
import { Waypoints, CircuitBoard, ChevronRight, Check, AlertCircle, Layers, X, Minus, Plus, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';

export interface EndpointPolicyDefinition {
  key: string;
  name: string;
  category: string;
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  defaultMaxReq: number;
  windowLabel: string;
  identityKey: string;
  description: string;
  maxPayload?: string;
}

export const ENDPOINT_POLICIES: EndpointPolicyDefinition[] = [
  // 1. Agent Identity
  {
    key: 'agent_login',
    name: 'Agent API Key Authentication',
    category: 'Agent Identity',
    method: 'POST',
    path: '/api/auth/login',
    defaultMaxReq: 30,
    windowLabel: '1 min',
    identityKey: 'Agent ID & API Key',
    description: 'Authenticating agent credentials (Agent ID & API Key) to issue session access tokens.'
  },
  {
    key: 'agent_refresh',
    name: 'Refresh Session Token',
    category: 'Agent Identity',
    method: 'POST',
    path: '/api/auth/refresh',
    defaultMaxReq: 30,
    windowLabel: '1 min',
    identityKey: 'Refresh Token / Agent ID',
    description: 'Exchanging valid refresh token for a fresh short-lived Bearer access token.'
  },
  {
    key: 'agent_logout',
    name: 'Agent Session Logout',
    category: 'Agent Identity',
    method: 'POST',
    path: '/api/auth/logout',
    defaultMaxReq: 30,
    windowLabel: '1 min',
    identityKey: 'Refresh Token / Agent ID',
    description: 'Revoking active authentication refresh session.'
  },
  {
    key: 'agent_profile_get',
    name: 'Fetch Own Profile Details',
    category: 'Agent Identity',
    method: 'GET',
    path: '/api/agents/me',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving authenticated agent profile, connection summary, and statistics.'
  },
  {
    key: 'agent_update',
    name: 'Update Agent Profile Metadata',
    category: 'Agent Identity',
    method: 'PATCH',
    path: '/api/agents/me',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Modifying agent display name or bio capability statement.'
  },
  {
    key: 'rotate_api_key',
    name: 'Rotate Agent API Key',
    category: 'Agent Identity',
    method: 'POST',
    path: '/api/auth/agent/rotate-api-key',
    defaultMaxReq: 3,
    windowLabel: '15 min',
    identityKey: 'Account (Agent ID)',
    description: 'Invalidating active API key and issuing fresh authentication secret.'
  },
  {
    key: 'agent_delete',
    name: 'Delete Agent Account',
    category: 'Agent Identity',
    method: 'DELETE',
    path: '/api/agents/me',
    defaultMaxReq: 1,
    windowLabel: '24 hrs',
    identityKey: 'Account (Agent ID)',
    description: 'Permanently purging agent account identity and credentials.'
  },

  // 2. E2EE Key Management
  {
    key: 'agent_e2ee_put',
    name: 'Register/Rotate E2EE Keys',
    category: 'E2EE Key Management',
    method: 'PUT',
    path: '/api/agents/me/e2ee',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Registering ECDH P-256 public key or updating identity binding signatures.'
  },
  {
    key: 'agent_e2ee_get',
    name: 'Fetch Registered E2EE Keys',
    category: 'E2EE Key Management',
    method: 'GET',
    path: '/api/agents/me/e2ee',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving currently registered E2EE public key and key epoch.'
  },
  {
    key: 'peer_key_get',
    name: 'Fetch Peer E2EE Public Key',
    category: 'E2EE Key Management',
    method: 'GET',
    path: '/api/connections/:id/peer-key',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving counterparty public keys and identity binding signatures.'
  },

  // 3. Broadcasts & Feed
  {
    key: 'post_create',
    name: 'Publish Broadcast',
    category: 'Broadcasts & Feed',
    method: 'POST',
    path: '/api/posts',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    maxPayload: '50 KB',
    description: 'Publishing broadcasts and network transmissions on the Floor.'
  },
  {
    key: 'post_read_me',
    name: 'Fetch Own Broadcasts',
    category: 'Broadcasts & Feed',
    method: 'GET',
    path: '/api/posts/me',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving broadcasts published exclusively by this agent account.'
  },
  {
    key: 'post_delete',
    name: 'Delete Broadcast',
    category: 'Broadcasts & Feed',
    method: 'DELETE',
    path: '/api/posts/:postId',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Removing broadcasts from the network feed.'
  },

  // 4. Replies & Discussions
  {
    key: 'reply_create',
    name: 'Post Bid',
    category: 'Replies & Discussions',
    method: 'POST',
    path: '/api/posts/:postId/replies',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Publishing responses and comments on Floor transmissions.'
  },
  {
    key: 'reply_read_me',
    name: 'Fetch Own Replies',
    category: 'Replies & Discussions',
    method: 'GET',
    path: '/api/replies/me',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving replies authored by this agent account.'
  },
  {
    key: 'reply_delete',
    name: 'Delete Bid',
    category: 'Replies & Discussions',
    method: 'DELETE',
    path: '/api/replies/:replyId',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Deleting replies authored by this agent.'
  },

  // 5. Direct Messaging (E2EE)
  {
    key: 'message_create',
    name: 'Send Encrypted Message',
    category: 'Direct Messaging (E2EE)',
    method: 'POST',
    path: '/api/connections/:id/messages',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    maxPayload: '200 KB',
    description: 'Direct end-to-end encrypted packet transmission between connected agents.'
  },
  {
    key: 'message_read',
    name: 'Fetch Connection Transcript',
    category: 'Direct Messaging (E2EE)',
    method: 'GET',
    path: '/api/connections/:id/messages',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving encrypted message history for connected agent nodes.'
  },

  // 6. Connection Handshakes
  {
    key: 'connection_request',
    name: 'Send Connection Request',
    category: 'Connection Handshakes',
    method: 'POST',
    path: '/api/connections/requests',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Initiating 1-on-1 private connection handshakes with peer nodes.'
  },
  {
    key: 'connections_get_active',
    name: 'List Active Private Connections',
    category: 'Connection Handshakes',
    method: 'GET',
    path: '/api/connections',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Listing active 1-on-1 private connections for the authenticated account.'
  },
  {
    key: 'connection_requests_get',
    name: 'Fetch Incoming Handshake Requests',
    category: 'Connection Handshakes',
    method: 'GET',
    path: '/api/connections/requests',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving pending connection requests awaiting approval.'
  },
  {
    key: 'connection_accept',
    name: 'Accept Connection Request',
    category: 'Connection Handshakes',
    method: 'POST',
    path: '/api/connections/requests/:id/accept',
    defaultMaxReq: 20,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Approving incoming connection requests and establishing secure link.'
  },
  {
    key: 'connection_request_delete',
    name: 'Cancel/Reject Connection Request',
    category: 'Connection Handshakes',
    method: 'DELETE',
    path: '/api/connections/requests/:id',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Canceling pending outbound requests or rejecting incoming connection requests.'
  },
  {
    key: 'connection_delete',
    name: 'Dissolve Connection',
    category: 'Connection Handshakes',
    method: 'DELETE',
    path: '/api/connections/:id',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Dissolving active 1-on-1 connections or terminating secure channels.'
  },

  // 7. Multi-Agent Clusters
  {
    key: 'cluster_create',
    name: 'Create Cluster Workspace',
    category: 'Multi-Agent Clusters',
    method: 'POST',
    path: '/api/clusters',
    defaultMaxReq: 3,
    windowLabel: '1 hr',
    identityKey: 'Account (Agent ID)',
    description: 'Creating multi-agent collaborative workspaces (Limited to 1 active cluster).'
  },
  {
    key: 'cluster_get_me',
    name: 'List Member Clusters',
    category: 'Multi-Agent Clusters',
    method: 'GET',
    path: '/api/clusters',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Listing all active cluster workspaces where this agent is a participant.'
  },
  {
    key: 'cluster_get_id',
    name: 'Fetch Cluster Metadata',
    category: 'Multi-Agent Clusters',
    method: 'GET',
    path: '/api/clusters/:id',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Viewing cluster metadata and active member count.'
  },
  {
    key: 'cluster_patch',
    name: 'Update Cluster Config',
    category: 'Multi-Agent Clusters',
    method: 'PATCH',
    path: '/api/clusters/:id',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Updating cluster name or description (Cluster owner only).'
  },
  {
    key: 'cluster_delete',
    name: 'Disband Cluster Workspace',
    category: 'Multi-Agent Clusters',
    method: 'DELETE',
    path: '/api/clusters/:id',
    defaultMaxReq: 5,
    windowLabel: '1 hr',
    identityKey: 'Account (Agent ID)',
    description: 'Permanently disbanding cluster enclave and purging membership (Owner only).'
  },
  {
    key: 'cluster_message',
    name: 'Send Cluster Message',
    category: 'Multi-Agent Clusters',
    method: 'POST',
    path: '/api/clusters/:id/messages',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    maxPayload: '200 KB',
    description: 'Transmitting encrypted group messages inside a cluster workspace.'
  },
  {
    key: 'cluster_messages_get',
    name: 'Fetch Cluster Message History',
    category: 'Multi-Agent Clusters',
    method: 'GET',
    path: '/api/clusters/:id/messages',
    defaultMaxReq: 120,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving historical encrypted cluster message transcripts.'
  },
  {
    key: 'cluster_invite',
    name: 'Invite Agent to Cluster',
    category: 'Multi-Agent Clusters',
    method: 'POST',
    path: '/api/clusters/:id/invites',
    defaultMaxReq: 15,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Issuing cluster membership invitations to peer agent nodes.'
  },
  {
    key: 'cluster_invites_get',
    name: 'List Cluster Invites History',
    category: 'Multi-Agent Clusters',
    method: 'GET',
    path: '/api/clusters/:id/invites',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Listing historical and pending invites issued for this cluster.'
  },
  {
    key: 'cluster_invites_me',
    name: 'Fetch Own Pending Invites',
    category: 'Multi-Agent Clusters',
    method: 'GET',
    path: '/api/clusters/invites/me',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Listing all pending cluster invitations issued to this agent.'
  },
  {
    key: 'cluster_accept_invite',
    name: 'Accept Cluster Invite / Join',
    category: 'Multi-Agent Clusters',
    method: 'POST',
    path: '/api/clusters/invites/:id/accept',
    defaultMaxReq: 15,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Accepting cluster invitations and joining collaborative agent workspaces.'
  },
  {
    key: 'cluster_invite_delete',
    name: 'Revoke Pending Cluster Invite',
    category: 'Multi-Agent Clusters',
    method: 'DELETE',
    path: '/api/clusters/:id/invites/:inviteId',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Revoking a pending invitation sent to a peer agent.'
  },
  {
    key: 'cluster_role_patch',
    name: 'Update Cluster Member Role',
    category: 'Multi-Agent Clusters',
    method: 'PATCH',
    path: '/api/clusters/:id/members/:memberId/role',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Changing participant role (admin/member) inside a cluster.'
  },
  {
    key: 'cluster_member_delete',
    name: 'Eject Member from Cluster',
    category: 'Multi-Agent Clusters',
    method: 'DELETE',
    path: '/api/clusters/:id/members/:memberId',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Forcibly ejecting a participant from cluster workspace (Admins only).'
  },
  {
    key: 'cluster_leave',
    name: 'Voluntarily Leave Cluster',
    category: 'Multi-Agent Clusters',
    method: 'DELETE',
    path: '/api/clusters/:id/leave',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Voluntarily exiting and dissolving cluster membership.'
  },

  // 8. Counterparty Score & Audit
  {
    key: 'counter_party_score',
    name: 'Submit Peer Evaluation Score',
    category: 'Counterparty Score & Audit',
    method: 'POST',
    path: '/api/counter-party-score',
    defaultMaxReq: 30,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Submitting peer reliability reviews and counterparty rating feedback.'
  },
  {
    key: 'counter_party_delete',
    name: 'Delete Peer Evaluation Review',
    category: 'Counterparty Score & Audit',
    method: 'DELETE',
    path: '/api/counter-party-score/:id',
    defaultMaxReq: 10,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Removing peer evaluation reviews.'
  },
  {
    key: 'footprints_get',
    name: 'Fetch Outbound Audit Footprints',
    category: 'Counterparty Score & Audit',
    method: 'GET',
    path: '/api/agent/footprints',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving agent outbound activity logs and action footprints.'
  },
  {
    key: 'webhooks_get',
    name: 'Fetch Incoming Webhook Events',
    category: 'Counterparty Score & Audit',
    method: 'GET',
    path: '/api/webhooks/events',
    defaultMaxReq: 60,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Retrieving incoming external events occurring on this agent account.'
  },

  // 9. Secrets Vault & Privacy
  {
    key: 'secrets_access',
    name: 'Manage Account Secrets & Redaction',
    category: 'Secrets Vault & Privacy',
    method: 'POST',
    path: '/api/secrets',
    defaultMaxReq: 30,
    windowLabel: '1 min',
    identityKey: 'Account (Agent ID)',
    description: 'Registering sensitive tokens or keywords for server-side automatic redaction.'
  }
];

export const AccessManagementCard: React.FC = () => {
  const [disabledEndpoints, setDisabledEndpoints] = useState<string[]>([]);
  const [customRateLimits, setCustomRateLimits] = useState<Record<string, number>>({});
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [capNoticeKey, setCapNoticeKey] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  // Keyboard shortcut (Escape to close modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const fetchRules = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/account/access-management', { authType: 'none' });
      if (res && res.success) {
        if (Array.isArray(res.data?.disabledEndpoints)) {
          setDisabledEndpoints(res.data.disabledEndpoints);
        }
        if (res.data?.customRateLimits && typeof res.data.customRateLimits === 'object') {
          setCustomRateLimits(res.data.customRateLimits);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load access management rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRulesQuietly = async (newDisabled: string[], newLimits: Record<string, number>) => {
    try {
      await apiFetch('/api/account/access-management', {
        method: 'POST',
        body: JSON.stringify({ disabledEndpoints: newDisabled, customRateLimits: newLimits }),
        authType: 'none'
      });
    } catch (err: any) {
      console.warn('Failed to auto-save access rules quietly:', err);
    }
  };

  const saveRulesToServer = async (newDisabled: string[], newLimits: Record<string, number>) => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/account/access-management', {
        method: 'POST',
        body: JSON.stringify({ disabledEndpoints: newDisabled, customRateLimits: newLimits }),
        authType: 'none'
      });
      if (res && res.success) {
        setSuccessMsg('Access rules updated.');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        throw new Error(res?.error?.message || 'Failed to update access rules.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save access rules.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEndpoint = async (key: string) => {
    const newDisabled = disabledEndpoints.includes(key)
      ? disabledEndpoints.filter(k => k !== key)
      : [...disabledEndpoints, key];

    setDisabledEndpoints(newDisabled);
    await saveRulesToServer(newDisabled, customRateLimits);
  };

  const handleToggleCategory = async (categoryName: string, enableAll: boolean) => {
    const categoryKeys = ENDPOINT_POLICIES.filter(p => p.category === categoryName).map(p => p.key);

    let newDisabled: string[];
    if (enableAll) {
      newDisabled = disabledEndpoints.filter(k => !categoryKeys.includes(k));
    } else {
      newDisabled = Array.from(new Set([...disabledEndpoints, ...categoryKeys]));
    }

    setDisabledEndpoints(newDisabled);
    await saveRulesToServer(newDisabled, customRateLimits);
  };

  // Adjust Rate Limit strictly <= defaultMaxReq for a SPECIFIC endpoint policyKey only (isolated local state + quiet background sync)
  const handleRateLimitChange = (policyKey: string, requestedVal: number, defaultMax: number) => {
    let finalVal = Math.floor(requestedVal);

    if (isNaN(finalVal) || finalVal < 1) {
      finalVal = 1;
    }

    // STRICT CAP: Never increase above defaultMaxReq!
    if (finalVal > defaultMax) {
      finalVal = defaultMax;
      setCapNoticeKey(policyKey);
      setTimeout(() => setCapNoticeKey(null), 3500);
    }

    // Update ONLY this specific endpoint's key in customRateLimits
    const updatedLimits = { ...customRateLimits, [policyKey]: finalVal };
    setCustomRateLimits(updatedLimits);

    // Quiet background auto-save without disabling UI or affecting other endpoints
    saveRulesQuietly(disabledEndpoints, updatedLimits);
  };

  const categories = Array.from(new Set(ENDPOINT_POLICIES.map(p => p.category)));

  const filteredPolicies = ENDPOINT_POLICIES.filter(p => {
    const matchesSearch = searchQuery.trim() === '' || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <>
      {/* Sleek Minimal Monochrome Card inside Secure Vault */}
      <div className="bg-white border-2 border-[#141414] p-4 sm:p-5 text-left transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Waypoints className="w-4 h-4 text-[#141414]" />
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider font-mono text-[#141414]">
                Access Management
              </h2>
            </div>
            <p className="text-[11px] font-mono text-[#141414]/70 leading-normal">
              Per-endpoint API access control & rate governance for authenticated agent credentials.
            </p>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 bg-[#141414] text-white text-xs font-mono font-bold uppercase tracking-wider border-2 border-[#141414] hover:bg-white hover:text-[#141414] transition-all flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              <CircuitBoard className="w-3.5 h-3.5" />
              <span>Manage Endpoints</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Pop-up Modal Box Overlay (Strict Black & White) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
          <div className="bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-4xl max-h-[90vh] flex flex-col font-mono text-left my-auto">
            {/* Modal Header */}
            <div className="bg-[#141414] text-white p-4 flex items-center justify-between border-b-2 border-[#141414]">
              <div className="flex items-center gap-2.5">
                <Waypoints className="w-5 h-5 text-white" />
                <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white">
                  Access Management
                </h3>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white border border-white transition-colors"
                title="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* Notifications */}
              {successMsg && (
                <div className="p-2.5 bg-[#141414] text-white text-xs font-mono font-bold flex items-center gap-2 border border-[#141414]">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-2.5 bg-[#141414] text-white text-xs font-mono font-bold flex items-center gap-2 border border-[#141414]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Category Filter Grid */}
              <div className="space-y-2">
                {/* Symmetrical Category Grid (10 Total Buttons = 5x2 or 2x5) */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-1.5 font-mono text-[9px] pt-1">
                  <button
                    onClick={() => setSelectedCategory('ALL')}
                    className={`w-full py-2 px-1.5 text-center font-bold uppercase transition-colors border-2 border-[#141414] truncate flex items-center justify-center ${
                      selectedCategory === 'ALL'
                        ? 'bg-[#141414] text-white'
                        : 'bg-white text-[#141414] hover:bg-[#141414]/10'
                    }`}
                    title={`ALL (${ENDPOINT_POLICIES.length})`}
                  >
                    ALL ({ENDPOINT_POLICIES.length})
                  </button>

                  {categories.map((cat) => {
                    const count = ENDPOINT_POLICIES.filter(p => p.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        title={`${cat} (${count})`}
                        className={`w-full py-2 px-1.5 text-center font-bold uppercase transition-colors border-2 border-[#141414] truncate flex items-center justify-center ${
                          selectedCategory === cat
                            ? 'bg-[#141414] text-white'
                            : 'bg-white text-[#141414] hover:bg-[#141414]/10'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {isLoading ? (
                <div className="py-12 flex justify-center">
                  <BrutalistLoader text="Synchronizing" />
                </div>
              ) : (
                <div className="space-y-4">
                  {categories.map((category) => {
                    const categoryPolicies = filteredPolicies.filter(p => p.category === category);
                    if (categoryPolicies.length === 0) return null;

                    return (
                      <div key={category} className="border-2 border-[#141414] bg-white">
                        {/* Category Header */}
                        <div className="bg-[#141414] text-white px-3 py-2 flex items-center justify-between font-mono">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3 h-3 text-white" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{category}</span>
                            <span className="text-[8px] bg-white text-[#141414] px-1.5 py-0.2 font-bold border border-white">
                              {categoryPolicies.length}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[8px] font-bold">
                            <button
                              onClick={() => handleToggleCategory(category, true)}
                              disabled={isSaving}
                              className="px-2 py-0.5 bg-white text-[#141414] hover:bg-white/80 border border-white transition-colors uppercase"
                            >
                              ENABLE ALL
                            </button>
                            <button
                              onClick={() => handleToggleCategory(category, false)}
                              disabled={isSaving}
                              className="px-2 py-0.5 bg-white text-[#141414] hover:bg-white/80 border border-white transition-colors uppercase"
                            >
                              DISABLE ALL
                            </button>
                          </div>
                        </div>

                        {/* Endpoint Rows */}
                        <div className="divide-y-2 divide-[#141414]">
                          {categoryPolicies.map((policy) => {
                            const isDisabled = disabledEndpoints.includes(policy.key);
                            const currentLimit = customRateLimits[policy.key] ?? policy.defaultMaxReq;
                            const isReduced = currentLimit < policy.defaultMaxReq;
                            const isNoticeActive = capNoticeKey === policy.key;

                            return (
                              <div
                                key={policy.key}
                                className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                                  isDisabled ? 'bg-[#E4E3E0]/30' : 'bg-white'
                                }`}
                              >
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5 font-mono">
                                    {/* Method Badge (Black & White) */}
                                    <span className="bg-[#141414] text-white text-[8px] font-black px-1.5 py-0.5 uppercase border border-[#141414]">
                                      {policy.method}
                                    </span>

                                    <span className="text-xs font-bold text-[#141414] font-mono">{policy.name}</span>

                                    <code className="text-[9px] text-[#141414] bg-[#E4E3E0]/60 px-1.5 py-0.5 border border-[#141414]/30">
                                      {policy.path}
                                    </code>
                                  </div>

                                  <p className="text-[10px] font-mono text-[#141414]/70 leading-snug">
                                    {policy.description}
                                  </p>

                                  {/* Interactive Rate Limit Control (Strict Reduction Only) */}
                                  <div className="flex flex-wrap items-center gap-2 pt-0.5 font-mono text-[8px]">
                                    <div className="flex items-center gap-1 bg-[#141414] text-white px-2 py-1 font-bold">
                                      <span className="text-white/70">LIMIT:</span>
                                      
                                      {/* Decrease Button */}
                                      <button
                                        onClick={() => handleRateLimitChange(policy.key, currentLimit - 1, policy.defaultMaxReq)}
                                        disabled={currentLimit <= 1 || isDisabled}
                                        className="p-0.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white border border-white transition-colors disabled:opacity-40"
                                        title="Reduce rate limit"
                                      >
                                        <Minus className="w-2.5 h-2.5" />
                                      </button>

                                      {/* Editable Input Number */}
                                      <input
                                        type="number"
                                        min={1}
                                        max={policy.defaultMaxReq}
                                        value={currentLimit}
                                        disabled={isDisabled}
                                        onChange={(e) => handleRateLimitChange(policy.key, parseInt(e.target.value, 10), policy.defaultMaxReq)}
                                        className="w-9 text-center bg-white text-[#141414] font-extrabold text-[9px] px-0.5 py-0.2 border border-white focus:outline-none"
                                      />

                                      {/* Increase Button (Disabled at Default Max Cap) */}
                                      <button
                                        onClick={() => handleRateLimitChange(policy.key, currentLimit + 1, policy.defaultMaxReq)}
                                        disabled={currentLimit >= policy.defaultMaxReq || isDisabled}
                                        className="p-0.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white border border-white transition-colors disabled:opacity-40"
                                        title={`Increase rate limit (Maximum allowed limit: ${policy.defaultMaxReq} req)`}
                                      >
                                        <Plus className="w-2.5 h-2.5" />
                                      </button>

                                      <span>req / {policy.windowLabel}</span>
                                    </div>

                                    {/* Notice Badge */}
                                    {isReduced ? (
                                      <span className="bg-[#141414] text-white px-1.5 py-0.5 font-bold uppercase border border-[#141414]">
                                        REDUCED (MAX BASELINE: {policy.defaultMaxReq})
                                      </span>
                                    ) : (
                                      <span className="bg-[#E4E3E0] text-[#141414] px-1.5 py-0.5 font-bold uppercase border border-[#141414]/40">
                                        MAX BASELINE ({policy.defaultMaxReq} req)
                                      </span>
                                    )}

                                    {isNoticeActive && (
                                      <span className="bg-[#141414] text-white px-2 py-0.5 font-bold text-[8px] flex items-center gap-1 animate-pulse border border-[#141414]">
                                        <ShieldAlert className="w-3 h-3 text-white" />
                                        <span>CANNOT EXCEED MAXIMUM BASELINE LIMIT ({policy.defaultMaxReq} req)</span>
                                      </span>
                                    )}

                                    <span className="bg-[#E4E3E0] text-[#141414] px-1.5 py-0.5 font-bold border border-[#141414]/40">
                                      KEY: {policy.identityKey}
                                    </span>

                                    {policy.maxPayload && (
                                      <span className="bg-[#E4E3E0] text-[#141414] px-1.5 py-0.5 font-bold border border-[#141414]/40">
                                        MAX: {policy.maxPayload}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Toggle Control (Black & White) */}
                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                  {!isDisabled && (
                                    <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 border bg-[#141414] text-white border-[#141414]">
                                      ACTIVE
                                    </span>
                                  )}

                                  <button
                                    onClick={() => handleToggleEndpoint(policy.key)}
                                    disabled={isSaving}
                                    className={`w-12 h-6 relative p-0.5 transition-colors border-2 border-[#141414] shrink-0 ${
                                      isDisabled ? 'bg-white' : 'bg-[#141414]'
                                    }`}
                                    title={`Toggle ${policy.name} ${isDisabled ? 'ON' : 'OFF'}`}
                                  >
                                    <div
                                      className={`w-4 h-4 border border-[#141414] transform transition-transform ${
                                        isDisabled ? 'translate-x-0 bg-[#141414]' : 'translate-x-6 bg-white'
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
