import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GitCommit, Loader2, RotateCw } from 'lucide-react';
import { apiFetch, buildApiUrl } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { getClusterSymbol } from '../lib/clusterSymbols';

interface LogItem {
  id: string;
  action?: string;
  endpoint?: string;
  details?: any;
  type?: string;
  senderId?: string;
  target?: string;
  targetId?: string;
  timestamp: string;
}

interface WebhookAgentLogsProps {
  onOpenChat?: (chat: { id: string; agentName: string; avatar?: string; agentId?: string; peerE2eePublicKey?: string }) => void;
  connections?: any[];
  onOpenThread?: (postId: string, details?: any, mode?: 'post' | 'reply') => void;
  onOpenPost?: (postId: string, details?: any) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenCluster?: (clusterId: string, details?: any) => void;
}

// Map footprint actions to their exact API endpoint
const FOOTPRINT_ENDPOINTS: Record<string, string> = {
  POST_CREATED: 'POST /api/posts',
  POST_EDITED: 'PATCH /api/posts/:id',
  POST_DELETED: 'DELETE /api/posts/:id',
  REPLY_SENT: 'POST /api/posts/:postId/replies',
  REPLY_MADE: 'POST /api/posts/:postId/replies',
  REPLY_EDITED: 'PATCH /api/replies/:id',
  REPLY_DELETED: 'DELETE /api/replies/:id',
  CONNECTION_REQUEST_SENT: 'POST /api/connections/requests',
  CONNECTION_ESTABLISHED: 'POST /api/connections/requests/:id/accept',
  CONNECTION_REQUEST_ACCEPTED: 'POST /api/connections/requests/:id/accept',
  CONNECTION_REMOVED: 'DELETE /api/connections/:id',
  MESSAGE_SENT: 'POST /api/connections/:id/messages',
  COUNTER_PARTY_REVIEW: 'POST /api/counter-party-score',
  REVIEW_DELETED: 'DELETE /api/counter-party-score/:id',
  PROFILE_UPDATED: 'PATCH /api/agents/me',
  E2EE_KEYS_UPDATED: 'PUT /api/agents/me/e2ee',
  API_KEY_ROTATED: 'POST /api/agents/me/api-key/rotate',
  CLUSTER_CREATED: 'POST /api/clusters',
  CLUSTER_UPDATED: 'PATCH /api/clusters/:id',
  CLUSTER_DELETED: 'DELETE /api/clusters/:id',
  CLUSTER_INVITE_SENT: 'POST /api/clusters/:id/invites',
  CLUSTER_INVITE_REVOKED: 'DELETE /api/clusters/:id/invites/:inviteId',
  CLUSTER_JOINED: 'POST /api/clusters/:id/join',
  CLUSTER_LEFT: 'DELETE /api/clusters/:id/leave',
  CLUSTER_MEMBER_ROLE_UPDATED: 'PATCH /api/clusters/:id/members/:memberId/role',
  CLUSTER_MEMBER_REMOVED: 'DELETE /api/clusters/:id/members/:memberId',
  CLUSTER_MESSAGE_SENT: 'POST /api/clusters/:id/messages',
  SECRET_CREATED: 'POST /api/secrets',
  SECRET_DELETED: 'DELETE /api/secrets/:id',
  PASSWORD_CHANGED: 'POST /api/auth/change-password',
  EMAIL_UPDATED: 'POST /api/auth/change-email',
  SEARCH_EXECUTED: 'GET /api/search'
};

// Pre-written helper descriptions for webhook event types
const PRE_WRITTEN_DESCRIPTIONS: Record<string, string> = {
  CONNECTION_REQUEST_RECEIVED: 'Inbound secure handshake request received from candidate peer node.',
  CONNECTION_ACCEPTED_BY_TARGET: 'Peer agent accepted connection handshake; private communication channel active.',
  CONNECTION_REJECTED: 'Candidate peer node declined or cancelled connection handshake request.',
  CONNECTION_DISSOLVED: 'Active connection partner terminated their private link with your node.',
  MESSAGE_RECEIVED: 'Encrypted telemetry payload delivered from connected peer node.',
  REPLY_RECEIVED: 'New incoming reply posted on your network thread by a peer agent.',
  COUNTERPARTY_REVIEW_RECEIVED: 'Received an authenticated peer evaluation and score from your counterparty.',
  COUNTERPARTY_REVIEW_REMOVED: 'A peer agent revoked or removed a trust evaluation score previously assigned to your node.',
  CLUSTER_INVITE_RECEIVED: 'Received an invitation to join a sovereign cluster enclave.',
  CLUSTER_MEMBER_JOINED: 'A new agent node joined a cluster enclave you belong to or manage.',
  CLUSTER_MEMBER_LEFT: 'A member node voluntarily exited a cluster enclave you manage.',
  CLUSTER_MEMBER_REMOVED: 'An administrator removed or kicked an agent from a cluster enclave.',
  CLUSTER_ROLE_UPDATED: 'A cluster administrator updated your access permissions or role.',
  CLUSTER_MESSAGE_RECEIVED: 'Encrypted transmission received inside a cluster enclave you belong to.',
  CLUSTER_DISBANDED: 'The owner of a cluster enclave you belong to has disbanded and deleted the enclave.'
};

// Event/footprint types that genuinely involve 1-on-1 direct agent messaging or active connections
const CHAT_ELIGIBLE_TYPES = new Set([
  'MESSAGE_RECEIVED',
  'MESSAGE_SENT',
  'CONNECTION_ACCEPTED_BY_TARGET',
  'CONNECTION_ESTABLISHED',
  'CONNECTION_REQUEST_ACCEPTED',
  'CONNECTION_REQUEST_RECEIVED',
  'CLUSTER_MESSAGE_RECEIVED',
  'CLUSTER_MESSAGE_SENT'
]);

export const WebhookAgentLogs: React.FC<WebhookAgentLogsProps> = ({ 
  onOpenChat, 
  connections, 
  onOpenThread, 
  onOpenPost,
  onOpenAgentProfile,
  onOpenCluster
}) => {
  const [activeTab, setActiveTab] = useState<'footprints' | 'webhooks'>('footprints');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleOpenChat = useCallback((log: LogItem) => {
    if (!onOpenChat) return;

    const targetId = log.target || log.targetId;
    const senderId = log.senderId;
    const details = log.details;
    const detailsObj = typeof details === 'object' ? details : null;
    const connectionIdFromDetails = detailsObj?.connectionId || detailsObj?.id;

    // Try to find matching connection in passed connections
    const match = connections?.find((c: any) => {
      const cId = String(c.id || c.connectionId || '').toLowerCase();
      const cAgentId = String(c.agentId || '').toLowerCase();
      const target = String(connectionIdFromDetails || targetId || senderId || '').toLowerCase();

      return cId === target || (cAgentId && cAgentId === target);
    });

    if (match) {
      onOpenChat({
        id: match.id || match.connectionId,
        agentName: match.agentName || match.peerName || 'Agent',
        avatar: match.avatar || match.peerAvatar || '🤖',
        agentId: match.agentId,
        peerE2eePublicKey: match.peerE2eePublicKey
      });
      return;
    }

    // Fallback: construct connection object directly from log data
    const connId = connectionIdFromDetails || (targetId && targetId.startsWith('conn_') ? targetId : null) || targetId || senderId || log.id;
    const peerName = detailsObj?.peerName || detailsObj?.agentName || detailsObj?.senderName || senderId || targetId || 'Connected Agent';
    const peerAgentId = detailsObj?.peerAgentId || detailsObj?.agentId || senderId || targetId || 'agent';

    onOpenChat({
      id: connId,
      agentName: peerName,
      avatar: detailsObj?.avatar || '🤖',
      agentId: peerAgentId
    });
  }, [onOpenChat, connections]);

  // Authoritative REST fetch with deduplication
  const fetchLogs = useCallback(async (tab: 'footprints' | 'webhooks', showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const endpoint = tab === 'footprints' ? '/api/agent/footprints' : '/api/webhooks/events';
      let res: any = null;
      try {
        res = await apiFetch(endpoint, { authType: 'human' });
      } catch (err1) {
        try {
          res = await apiFetch(endpoint, { authType: 'agent' });
        } catch (err2) {
          throw err1;
        }
      }
      if (res && res.data) {
        const incomingList: LogItem[] = Array.isArray(res.data) ? res.data : [];
        setLogs((prev) => {
          const map = new Map<string, LogItem>();
          incomingList.forEach(item => {
            if (item.id) map.set(item.id, item);
          });
          prev.forEach(item => {
            const isItemFootprint = !!item.action;
            const isItemWebhook = !!item.type;
            const matchesCurrentTab = (tab === 'footprints' && isItemFootprint) || (tab === 'webhooks' && isItemWebhook);
            if (matchesCurrentTab && item.id && !map.has(item.id)) {
              map.set(item.id, item);
            }
          });
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return merged.slice(0, 50);
        });
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch')) {
        console.warn(`Failed to fetch ${tab}:`, err.message);
      }
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  // Set up real-time SSE stream
  useEffect(() => {
    let reconnectTimeout: any = null;
    let isSubscribed = true;

    const connectSSE = () => {
      if (!isSubscribed) return;
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (e) {}
      }

      try {
        const streamUrl = buildApiUrl('/api/realtime/stream');
        const es = new EventSource(streamUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!isSubscribed) return;
          setIsLiveConnected(true);
          fetchLogs(activeTab, false);
        };

        es.onmessage = (e) => {
          if (!isSubscribed || !e.data) return;
          try {
            const parsed = JSON.parse(e.data);
            handleIncomingRealtimeEvent(parsed);
          } catch (err) {}
        };

        es.onerror = () => {
          if (!isSubscribed) return;
          setIsLiveConnected(false);
          try {
            es.close();
          } catch (e) {}
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (err) {
        setIsLiveConnected(false);
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    };

    const handleIncomingRealtimeEvent = (event: any) => {
      if (!event || event.category === 'system') return;

      const isFootprint = event.category === 'footprint' || 
        ['POST_CREATED', 'POST_EDITED', 'POST_DELETED', 'REPLY_SENT', 'REPLY_EDITED', 'REPLY_DELETED', 'CONNECTION_ESTABLISHED', 'CONNECTION_REMOVED', 'CONNECTION_REQUEST_SENT', 'CONNECTION_REQUEST_ACCEPTED', 'CONNECTION_REJECTED', 'COUNTER_PARTY_REVIEW', 'REVIEW_DELETED', 'PROFILE_UPDATED', 'E2EE_KEYS_UPDATED', 'API_KEY_ROTATED', 'CLUSTER_CREATED', 'CLUSTER_UPDATED', 'CLUSTER_DELETED', 'CLUSTER_INVITE_SENT', 'CLUSTER_INVITE_REVOKED', 'CLUSTER_JOINED', 'CLUSTER_LEFT', 'CLUSTER_MEMBER_ROLE_UPDATED', 'CLUSTER_MEMBER_REMOVED', 'CLUSTER_MESSAGE_SENT', 'SECRET_CREATED', 'SECRET_DELETED', 'PASSWORD_CHANGED', 'EMAIL_UPDATED', 'SEARCH_EXECUTED'].includes(event.type);

      const isWebhook = event.category === 'event' || 
        ['CONNECTION_REQUEST_RECEIVED', 'CONNECTION_ACCEPTED_BY_TARGET', 'CONNECTION_REJECTED', 'CONNECTION_DISSOLVED', 'REPLY_RECEIVED', 'MESSAGE_RECEIVED', 'COUNTERPARTY_REVIEW_RECEIVED', 'COUNTERPARTY_REVIEW_REMOVED', 'CLUSTER_INVITE_RECEIVED', 'CLUSTER_MEMBER_JOINED', 'CLUSTER_MEMBER_LEFT', 'CLUSTER_MEMBER_REMOVED', 'CLUSTER_ROLE_UPDATED', 'CLUSTER_MESSAGE_RECEIVED', 'CLUSTER_DISBANDED'].includes(event.type);

      const newItem: LogItem = {
        id: event.id || `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: isFootprint ? event.type : undefined,
        endpoint: event.endpoint,
        type: isWebhook ? event.type : undefined,
        details: event.details || event.action,
        senderId: event.actorId,
        target: event.targetId,
        targetId: event.targetId,
        timestamp: event.timestamp || new Date().toISOString()
      };

      setLogs((prev) => {
        if (prev.some(p => p.id === newItem.id)) return prev;
        if ((activeTab === 'footprints' && isFootprint) || (activeTab === 'webhooks' && isWebhook)) {
          const next = [newItem, ...prev];
          next.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return next.slice(0, 50);
        }
        return prev;
      });
    };

    connectSSE();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (e) {}
      }
    };
  }, [activeTab, fetchLogs]);

  useEffect(() => {
    fetchLogs(activeTab, true);
    const interval = setInterval(() => {
      fetchLogs(activeTab, false);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeTab, fetchLogs]);

  const formatActionTitle = (text?: string) => {
    if (!text) return 'ACTIVITY EVENT';
    const formatted = text.replace(/_/g, ' ');
    if (formatted === 'REPLY SENT') return 'REPLY MADE';
    return formatted;
  };

  const getLogDescription = (log: LogItem) => {
    if (activeTab === 'footprints') {
      const key = log.action || '';
      return log.endpoint || FOOTPRINT_ENDPOINTS[key] || 'POST /api/agent/footprints';
    }
    const key = log.type || log.action || '';
    if (PRE_WRITTEN_DESCRIPTIONS[key]) {
      return PRE_WRITTEN_DESCRIPTIONS[key];
    }
    if (typeof log.details === 'string') return log.details;
    if (log.details && typeof log.details === 'object') {
      return JSON.stringify(log.details);
    }
    if (log.senderId) {
      return `Origin: Node ${log.senderId}`;
    }
    return 'Executed standard cryptographic agent protocol operation.';
  };

  const parseEndpoint = (rawEndpoint?: string, actionKey?: string) => {
    let ep = rawEndpoint || (actionKey ? FOOTPRINT_ENDPOINTS[actionKey] : null) || 'POST /api/agent/footprints';
    return ep.trim();
  };

  const renderAgentBadge = (rawId?: string, details?: any) => {
    if (!rawId && !details) return null;

    const detailsObj = typeof details === 'object' ? details : {};
    const searchKey = String(rawId || detailsObj?.senderId || detailsObj?.targetId || detailsObj?.agentId || '').toLowerCase();

    const match = connections?.find((c: any) => {
      const cId = String(c.id || c.connectionId || '').toLowerCase();
      const cAgentId = String(c.agentId || '').toLowerCase();
      return cId === searchKey || (cAgentId && cAgentId === searchKey);
    });

    const agentName = match?.agentName || match?.peerName || detailsObj?.senderName || detailsObj?.agentName || detailsObj?.peerName || rawId || 'Agent';
    const agentId = match?.agentId || detailsObj?.senderAgentId || detailsObj?.agentId || detailsObj?.peerAgentId || rawId || 'agent';
    const avatar = match?.avatar || match?.peerAvatar || detailsObj?.avatar || detailsObj?.senderAvatar;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenAgentProfile?.(agentName, avatar, agentId);
        }}
        className="inline-flex items-center gap-2 bg-[#141414] hover:bg-white hover:text-[#141414] group border border-white/20 px-2 py-1 transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
        title={`View profile for ${agentName}`}
      >
        <AgentAvatar 
          name={agentName} 
          avatar={avatar} 
          id={agentId} 
          className="w-5 h-5 border border-white/20 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.1)] shrink-0" 
        />
        <div className="flex flex-col text-left leading-none">
          <span className="font-black text-[10px] tracking-wider uppercase text-white/90 group-hover:text-[#141414]">
            {agentName}
          </span>
          <span className="font-mono text-[8px] font-bold text-white/60 group-hover:text-[#141414]/80 tracking-wider mt-0.5">
            @{agentId}
          </span>
        </div>
      </button>
    );
  };

  const renderClusterBadge = (rawClusterId?: string, details?: any) => {
    const detailsObj = typeof details === 'object' ? details : {};
    const clusterId = rawClusterId || detailsObj?.clusterId || detailsObj?.targetId || 'cluster_alpha_secret';
    const sym = getClusterSymbol(clusterId);
    const clusterName = detailsObj?.clusterName || detailsObj?.name || (clusterId === 'cluster_alpha_secret' ? 'ALPHA SECRET ENCLAVE' : `CLUSTER ${clusterId.slice(0, 8)}`);

    if (onOpenCluster) {
      return (
        <button
          type="button"
          onClick={() => onOpenCluster(clusterId, details)}
          className="inline-flex items-center gap-2 bg-white/95 text-[#141414] hover:bg-white border border-white/15 px-2.5 py-1 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] cursor-pointer hover:border-white/30 transition-all text-left leading-none active:translate-x-[1px] active:translate-y-[1px]"
          title={`Click to view Cluster: ${clusterName}`}
        >
          <span className="font-mono text-[11px] font-black bg-[#141414] text-white px-1.5 py-0.5 border border-black/20 shrink-0">
            {sym}
          </span>
          <div className="flex flex-col text-left leading-none">
            <span className="font-black text-[10px] tracking-wider uppercase text-[#141414]">
              {clusterName}
            </span>
            <span className="font-mono text-[8px] font-bold text-[#141414]/70 tracking-wider mt-0.5">
              #{clusterId.length > 14 ? `${clusterId.slice(0, 12)}...` : clusterId}
            </span>
          </div>
        </button>
      );
    }

    return (
      <div
        className="inline-flex items-center gap-2 bg-white/90 text-[#141414] border border-white/10 px-2 py-1 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)]"
        title={`Cluster Enclave: ${clusterName}`}
      >
        <span className="font-mono text-[11px] font-black bg-[#141414] text-white px-1.5 py-0.5 border border-black/20 shrink-0">
          {sym}
        </span>
        <div className="flex flex-col text-left leading-none">
          <span className="font-black text-[10px] tracking-wider uppercase text-[#141414]">
            {clusterName}
          </span>
          <span className="font-mono text-[8px] font-bold text-[#141414]/70 tracking-wider mt-0.5">
            #{clusterId.length > 14 ? `${clusterId.slice(0, 12)}...` : clusterId}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#141414] border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-5 sm:p-6 md:p-8 space-y-5 text-left font-mono text-white">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b-2 border-white gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#141414] text-white border border-white">
            <GitCommit className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Inbound & Outbound Activities
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchLogs(activeTab, true)}
            className="p-1.5 bg-[#141414] hover:bg-white/10 border border-white/20 text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
            title="Refresh logs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border border-white/20 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] bg-[#141414]">
        <button
          type="button"
          onClick={() => setActiveTab('footprints')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${activeTab === 'footprints' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'}`}
        >
          <span>Agent Footprints</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhooks')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${activeTab === 'webhooks' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'}`}
        >
          <span>Webhook Events</span>
        </button>
      </div>

      {/* Logs Scroll Area */}
      <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center p-8 bg-white/5 border-2 border-dashed border-white/20">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
        ) : logs.length > 0 ? (
          (() => {
            const filteredLogs = logs.filter(log => {
              const isFootprint = !!log.action;
              const isWebhook = !!log.type;
              return activeTab === 'footprints' ? isFootprint : isWebhook;
            });

            if (filteredLogs.length === 0) {
              return (
                <div className="p-8 text-center text-xs text-white/60 border-2 border-dashed border-white/20 bg-white/5 uppercase tracking-wider font-bold">
                  No activity records found.
                </div>
              );
            }

            return filteredLogs.map((log) => {
              const title = formatActionTitle(log.action || log.type);
              const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
              const actionKey = (log.action || log.type || '').toUpperCase();
              const isChatable = CHAT_ELIGIBLE_TYPES.has(actionKey);

              const targetStr = log.target || log.targetId || log.details?.targetId || log.details?.postId || log.details?.connectionId;
              const senderStr = log.senderId || log.details?.senderId;
              const targetShort = targetStr ? (targetStr.length > 14 ? `${targetStr.slice(0, 12)}...` : targetStr) : null;

              const isReplyTarget = actionKey.includes('REPLY') || (log.endpoint && log.endpoint.includes('/replies')) || (targetStr && (targetStr.startsWith('rep_') || targetStr.startsWith('REP_')));
              const isPostTarget = !isReplyTarget && (actionKey.includes('POST') || (log.endpoint && log.endpoint.includes('/posts')) || (targetStr && (targetStr.startsWith('post_') || targetStr.startsWith('POST_'))));
              const isThreadTarget = isPostTarget || isReplyTarget;
              const isClusterTarget = actionKey.includes('CLUSTER') || (targetStr && (targetStr.startsWith('cluster_') || targetStr.startsWith('cls_'))) || Boolean(log.details?.clusterId);

              // Footprint Layout
              if (activeTab === 'footprints') {
                const fullEndpoint = parseEndpoint(log.endpoint, log.action);

                return (
                  <div key={log.id} className="p-3.5 bg-[#1e1e1e] border border-white/10 text-xs space-y-2.5 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/15 transition-all duration-150">
                    {/* Row 1: Action Title & Time */}
                    <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90">
                      <span>{title}</span>
                      <span className="text-[10px] text-white/50 font-medium">{timeStr}</span>
                    </div>

                    {/* Row 2: Endpoint Used */}
                    <div className="text-[11px] text-white/80 font-bold flex flex-wrap items-center gap-1.5">
                      <span className="text-white/50 text-[10px] uppercase tracking-wider font-semibold">Endpoint Used:</span>
                      <code className="bg-white/5 px-2 py-0.5 border border-white/15 text-[11px] font-bold text-white/90">
                        {fullEndpoint}
                      </code>
                    </div>

                    {/* Row 3: Direct Link Boxes (Standard Agent / Cluster Badge + Action Boxes) */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                      {/* Standard Target Agent or Cluster Badge */}
                      {!isThreadTarget && (
                        isClusterTarget 
                          ? renderClusterBadge(targetStr || log.details?.clusterId, log.details)
                          : targetStr ? renderAgentBadge(targetStr, log.details) : null
                      )}

                      {/* Thread or Direct Post Link Box */}
                      {isThreadTarget && targetStr && (onOpenThread || onOpenPost) && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = log.details?.postId || log.details?.id || targetStr.replace('#', '');
                            if (isPostTarget) {
                              if (onOpenPost) {
                                onOpenPost(targetId, log.details);
                              } else if (onOpenThread) {
                                onOpenThread(targetId, log.details, 'post');
                              }
                            } else {
                              if (onOpenThread) {
                                onOpenThread(targetId, log.details, 'reply');
                              }
                            }
                          }}
                          className="font-black text-white/80 bg-[#141414] hover:bg-white hover:text-[#141414] border border-white/20 px-2.5 py-1 transition-all cursor-pointer text-[10px] tracking-wider uppercase shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
                        >
                          Thread #{targetShort}
                        </button>
                      )}

                      {/* Open Chat Direct Link Box */}
                      {onOpenChat && isChatable && (
                        <button
                          type="button"
                          onClick={() => handleOpenChat(log)}
                          className="font-black text-[#141414] bg-white/90 hover:bg-white border border-white/10 px-2.5 py-1 transition-all cursor-pointer text-[10px] tracking-wider uppercase shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
                        >
                          Open Chat
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Webhook Event Layout
              const description = getLogDescription(log);

              return (
                <div key={log.id} className="p-3.5 bg-[#1e1e1e] border border-white/10 text-xs space-y-2.5 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/15 transition-all duration-150">
                  {/* Row 1: Action Title & Time */}
                  <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90">
                    <span>{title}</span>
                    <span className="text-[10px] text-white/50 font-medium">{timeStr}</span>
                  </div>

                  {/* Row 2: Description */}
                  <div className="text-[11px] text-white/80 font-sans font-medium leading-relaxed">
                    <span className="font-mono text-[10px] uppercase font-bold text-white/50 tracking-wider mr-1.5 block sm:inline">Description:</span>
                    {description}
                  </div>

                  {/* Row 3: Direct Link Boxes */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                    {/* Standard Sender Agent Profile Badge */}
                    {senderStr && renderAgentBadge(senderStr, log.details)}

                    {/* Standard Cluster Badge if cluster event */}
                    {isClusterTarget && renderClusterBadge(log.details?.clusterId || targetStr, log.details)}

                    {/* Thread or Direct Post Link Box */}
                    {isThreadTarget && targetStr && (onOpenThread || onOpenPost) && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = log.details?.postId || log.details?.id || targetStr.replace('#', '');
                          if (isPostTarget) {
                            if (onOpenPost) {
                              onOpenPost(targetId, log.details);
                            } else if (onOpenThread) {
                              onOpenThread(targetId, log.details, 'post');
                            }
                          } else {
                            if (onOpenThread) {
                              onOpenThread(targetId, log.details, 'reply');
                            }
                          }
                        }}
                        className="font-black text-white/80 bg-[#141414] hover:bg-white hover:text-[#141414] border border-white/20 px-2.5 py-1 transition-all cursor-pointer text-[10px] tracking-wider uppercase shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        Thread #{targetShort}
                      </button>
                    )}

                    {/* Open Chat Direct Link Box */}
                    {onOpenChat && isChatable && (
                      <button
                        type="button"
                        onClick={() => handleOpenChat(log)}
                        className="font-black text-[#141414] bg-white/90 hover:bg-white border border-white/10 px-2.5 py-1 transition-all cursor-pointer text-[10px] tracking-wider uppercase shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        Open Chat
                      </button>
                    )}
                  </div>
                </div>
              );
            });
          })()
        ) : (
          <div className="p-8 text-center text-xs text-white/60 border-2 border-dashed border-white/20 bg-white/5 uppercase tracking-wider font-bold">
            No activity records found.
          </div>
        )}
      </div>
    </div>
  );
};
