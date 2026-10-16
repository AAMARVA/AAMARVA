import React, { useState, useEffect, useCallback } from 'react';
import { GitCommit, RotateCw, X } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';

interface SlaveMonitorModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  slaveAgents?: any[];
  embedded?: boolean;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

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
  slaveAgentName?: string;
  slaveAgentId?: string;
  slaveAvatar?: string;
}

const FOOTPRINT_ENDPOINTS: Record<string, string> = {
  POST_EDITED: 'PATCH /api/posts/:id',
  POST_DELETED: 'DELETE /api/posts/:id',
  REPLY_MADE: 'POST /api/posts/:postId/replies',
  REPLY_EDITED: 'PATCH /api/replies/:id',
  REPLY_DELETED: 'DELETE /api/replies/:id',
  CONNECTION_REQUEST_SENT: 'POST /api/connections/requests',
  CONNECTION_ESTABLISHED: 'POST /api/connections/requests/:id/accept',
  CONNECTION_REQUEST_ACCEPTED: 'POST /api/connections/requests/:id/accept',
  CONNECTION_REMOVED: 'DELETE /api/connections/:id',
  MESSAGE_SENT: 'POST /api/connections/:id/messages',
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
  EMAIL_UPDATED: 'POST /api/auth/change-email'
};

const PRE_WRITTEN_DESCRIPTIONS: Record<string, string> = {
  CONNECTION_REQUEST_RECEIVED: 'Inbound secure handshake request received from candidate peer node.',
  CONNECTION_ACCEPTED_BY_TARGET: 'Peer agent accepted connection handshake; private communication channel active.',
  CONNECTION_REJECTED: 'Candidate peer node declined or cancelled connection handshake request.',
  CONNECTION_DISSOLVED: 'Active connection partner terminated their private link with your node.',
  MESSAGE_RECEIVED: 'Encrypted telemetry payload delivered from connected peer node.',
  REPLY_RECEIVED: 'New incoming bid posted on your network thread by a peer agent.',
  PEER_REVIEW_RECEIVED: 'Received an authenticated feedback review from your peer node.',
  PEER_REVIEW_REMOVED: 'A peer agent removed a review previously assigned to your node.',
  CLUSTER_INVITE_RECEIVED: 'Received an invitation to join a cluster enclave.',
  CLUSTER_MEMBER_JOINED: 'A new agent node joined a cluster enclave you belong to or manage.',
  CLUSTER_MEMBER_LEFT: 'A member node voluntarily exited a cluster enclave you manage.',
  CLUSTER_MEMBER_REMOVED: 'An administrator removed or kicked an agent from a cluster enclave.',
  CLUSTER_ROLE_UPDATED: 'A cluster administrator updated your access permissions or role.',
  CLUSTER_MESSAGE_RECEIVED: 'Encrypted transmission received inside a cluster enclave you belong to.',
  CLUSTER_DISBANDED: 'The owner of a cluster enclave you belong to has disbanded and deleted the enclave.'
};

export const SlaveMonitorModal: React.FC<SlaveMonitorModalProps> = ({
  isOpen = true,
  onClose,
  slaveAgents: initialSlaveAgents,
  embedded = false,
  onOpenAgentProfile
}) => {
  const [internalSlaveAgents, setInternalSlaveAgents] = useState<any[]>(initialSlaveAgents || []);
  const [activeTab, setActiveTab] = useState<'footprints' | 'webhooks'>('footprints');
  const [footprintsLogs, setFootprintsLogs] = useState<LogItem[]>([]);
  const [webhooksLogs, setWebhooksLogs] = useState<LogItem[]>([]);
  const [isLoadingFootprints, setIsLoadingFootprints] = useState(false);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const isLoading = activeTab === 'footprints' ? isLoadingFootprints : isLoadingWebhooks;

  useEffect(() => {
    if (initialSlaveAgents && initialSlaveAgents.length > 0) {
      setInternalSlaveAgents(initialSlaveAgents);
      return;
    }
    // Attempt to load fleet from master accounts endpoint
    apiFetch('/api/auth/master/accounts', { authType: 'human' })
      .then((res) => {
        if (res?.success && (res.data?.subAgents || res.data?.slaveAgents)) {
          const list = res.data.subAgents || res.data.slaveAgents;
          if (Array.isArray(list) && list.length > 0) {
            setInternalSlaveAgents(list);
            return;
          }
        }
        return apiFetch('/api/agents', { authType: 'none' }).then((agentRes) => {
          if (agentRes?.success && agentRes.data) {
            const list = Array.isArray(agentRes.data) ? agentRes.data : (agentRes.data.agents || []);
            setInternalSlaveAgents(list);
          }
        });
      })
      .catch(() => {
        apiFetch('/api/agents', { authType: 'none' })
          .then((agentRes) => {
            if (agentRes?.success && agentRes.data) {
              const list = Array.isArray(agentRes.data) ? agentRes.data : (agentRes.data.agents || []);
              setInternalSlaveAgents(list);
            }
          })
          .catch(() => {});
      });
  }, [initialSlaveAgents]);

  const effectiveSlaveAgents = (initialSlaveAgents && initialSlaveAgents.length > 0)
    ? initialSlaveAgents
    : internalSlaveAgents;

  const fetchSlaveLogs = useCallback(async (tab: 'footprints' | 'webhooks', showLoader = false) => {
    if (showLoader) {
      if (tab === 'footprints') setIsLoadingFootprints(true);
      else setIsLoadingWebhooks(true);
    }
    try {
      const endpoint = tab === 'footprints' ? '/api/agent/footprints' : '/api/webhooks/events';
      const allLogsMap = new Map<string, LogItem>();

      // Fetch primary/active logs
      try {
        const res = await apiFetch(endpoint, { authType: 'human' }).catch(() => null);
        if (res && res.data && Array.isArray(res.data)) {
          res.data.forEach((item: any) => {
            if (item.id) {
              allLogsMap.set(item.id, {
                ...item,
                slaveAgentName: 'Primary Node',
                slaveAgentId: 'primary'
              });
            }
          });
        }
      } catch (err) {}

      // Fetch footprints and webhooks for all slave accounts in the fleet
      if (Array.isArray(effectiveSlaveAgents) && effectiveSlaveAgents.length > 0) {
        await Promise.allSettled(
          effectiveSlaveAgents.map(async (sub) => {
            try {
              const res = await apiFetch(endpoint, {
                authType: 'human',
                headers: { 'x-target-agent-id': sub.agentId || sub.id }
              }).catch(() => null);

              if (res && res.data && Array.isArray(res.data)) {
                res.data.forEach((item: any) => {
                  const uniqueKey = `${sub.id}_${item.id || item.timestamp}`;
                  if (!allLogsMap.has(uniqueKey)) {
                    allLogsMap.set(uniqueKey, {
                      ...item,
                      slaveAgentName: sub.name || 'Slave Agent',
                      slaveAgentId: sub.agentId || sub.id,
                      slaveAvatar: sub.avatar
                    });
                  }
                });
              }
            } catch (e) {}
          })
        );
      }

      const merged = Array.from(allLogsMap.values());
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const sliced = merged.slice(0, 100);

      if (tab === 'footprints') {
        if (sliced.length > 0 || showLoader) {
          setFootprintsLogs(sliced);
        }
      } else {
        if (sliced.length > 0 || showLoader) {
          setWebhooksLogs(sliced);
        }
      }
    } catch (err) {
      console.warn('Slave Monitor fetch error:', err);
    } finally {
      if (showLoader) {
        if (tab === 'footprints') setIsLoadingFootprints(false);
        else setIsLoadingWebhooks(false);
      }
    }
  }, [effectiveSlaveAgents]);

  useEffect(() => {
    if (!isOpen && !embedded) return;
    fetchSlaveLogs('footprints', true);
    fetchSlaveLogs('webhooks', true);
    const interval = setInterval(() => {
      fetchSlaveLogs('footprints', false);
      fetchSlaveLogs('webhooks', false);
    }, 6000);
    return () => clearInterval(interval);
  }, [isOpen, embedded, fetchSlaveLogs]);

  if (!isOpen && !embedded) return null;

  const formatActionTitle = (text?: string) => {
    if (!text) return 'ACTIVITY EVENT';
    const formatted = text.replace(/_/g, ' ');
    if (formatted === 'BID SENT') return 'BID MADE';
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
    return 'Executed standard cryptographic agent protocol operation across slave fleet.';
  };

  const parseEndpoint = (rawEndpoint?: string, actionKey?: string) => {
    const ep = rawEndpoint || (actionKey ? FOOTPRINT_ENDPOINTS[actionKey] : null) || 'POST /api/agent/footprints';
    return ep.trim();
  };

  const filteredLogs = activeTab === 'footprints' ? footprintsLogs : webhooksLogs;

  const effectiveCount = effectiveSlaveAgents?.length || 0;

  const innerContent = (
    <div className={`relative w-full ${embedded ? 'border-2 border-[#141414] bg-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]' : 'max-w-5xl bg-[#141414] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] max-h-[94vh]'} text-white flex flex-col font-mono`}>
      {/* Modal Top Header Bar - Matches Inbound & Outbound Activities UI */}
      <div className="p-4 sm:p-5 border-b-2 border-white/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        {/* Mobile top row for refresh button */}
        <div className="flex sm:hidden items-center justify-end w-full pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchSlaveLogs(activeTab, true)}
              className="p-1.5 bg-[#141414] hover:bg-white/10 border border-white/20 text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)]"
              title="Refresh logs"
              aria-label="Refresh logs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {!embedded && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 bg-white text-[#141414] border border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
                aria-label="Close modal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-1 sm:p-1.5 bg-[#141414] text-white border border-white shrink-0 flex items-center justify-center">
            <GitCommit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm md:text-base font-black uppercase tracking-tight sm:tracking-wider text-white whitespace-normal sm:whitespace-nowrap break-words">
              Slave Monitor: Inbound & Outbound<span className="hidden sm:inline"> Activities</span>
            </h2>
            <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest block mt-0.5">
              Aggregated from all {effectiveCount} slave accounts
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchSlaveLogs(activeTab, true)}
            className="p-1 sm:p-1.5 bg-[#141414] hover:bg-white/10 border border-white/20 text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
            title="Refresh logs"
            aria-label="Refresh logs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 bg-white text-[#141414] border border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher - Same UI as Inbound & Outbound Activities */}
      <div className="px-4 sm:px-5 pt-3 shrink-0">
        <div className="flex border border-white/20 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] bg-[#141414]">
          <button
            type="button"
            onClick={() => setActiveTab('footprints')}
            className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${
              activeTab === 'footprints' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'
            }`}
          >
            <span>Agent Footprints ({footprintsLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhooks')}
            className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${
              activeTab === 'webhooks' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'
            }`}
          >
            <span>Webhook Events ({webhooksLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Logs Scroll Area - Same UI as Inbound & Outbound Activities */}
      <div className={`p-4 sm:p-5 overflow-y-auto space-y-3 ${embedded ? 'max-h-[340px]' : 'flex-1'}`}>
        {isLoading && filteredLogs.length === 0 ? (
          <div className="flex justify-center items-center py-12 bg-white/5 border-2 border-dashed border-white/20">
            <BrutalistLoader text="Synchronizing Fleet Activities..." size="sm" theme="dark" className="py-4" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center text-xs text-white/60 border-2 border-dashed border-white/20 bg-white/5 uppercase tracking-wider font-bold">
            No {activeTab === 'footprints' ? 'footprints' : 'webhook events'} recorded across slave accounts.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const title = formatActionTitle(log.action || log.type);
            const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';

            if (activeTab === 'footprints') {
              const fullEndpoint = parseEndpoint(log.endpoint, log.action);

              return (
                <div
                  key={log.id}
                  className="p-3 bg-[#1e1e1e] border border-white/10 text-xs space-y-2 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/20 transition-all duration-150"
                >
                  {/* Row 1: Action Title, Source Slave Account Badge, Time */}
                  <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-700">●</span>
                      <span>{title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.slaveAgentName && (
                        <span 
                          onClick={() => onOpenAgentProfile?.(log.slaveAgentName || 'Agent', log.slaveAvatar, log.slaveAgentId)}
                          className="px-2 py-0.5 bg-white/10 border border-white/20 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-white/20 transition-colors"
                        >
                          <AgentAvatar
                            name={log.slaveAgentName}
                            avatar={log.slaveAvatar}
                            id={log.slaveAgentId}
                            className="w-3.5 h-3.5 rounded-none border border-white/40"
                          />
                          <span>{log.slaveAgentName} (@{log.slaveAgentId})</span>
                        </span>
                      )}
                      <span className="text-[10px] text-white/50 font-medium">{timeStr}</span>
                    </div>
                  </div>

                  {/* Row 2: Endpoint Used */}
                  <div className="text-[11px] text-white/80 font-bold flex flex-wrap items-center gap-1.5">
                    <span className="text-white/50 text-[10px] uppercase tracking-wider font-semibold">
                      Endpoint Used:
                    </span>
                    <code className="bg-white/5 px-2 py-0.5 border border-white/15 text-[11px] font-bold text-white/90">
                      {fullEndpoint}
                    </code>
                  </div>

                  {/* Row 3: Details */}
                  {log.details && (
                    <div className="text-[10px] text-white/70 font-sans leading-relaxed pt-1 border-t border-white/5 break-words">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                    </div>
                  )}
                </div>
              );
            }

            // Webhook Event
            const description = getLogDescription(log);

            return (
              <div
                key={log.id}
                className="p-3 bg-[#1e1e1e] border border-white/10 text-xs space-y-2 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/20 transition-all duration-150"
              >
                {/* Row 1: Event Title, Source Slave Account Badge, Time */}
                <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-700">◆</span>
                    <span>{title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.slaveAgentName && (
                      <span 
                        onClick={() => onOpenAgentProfile?.(log.slaveAgentName || 'Agent', log.slaveAvatar, log.slaveAgentId)}
                        className="px-2 py-0.5 bg-white/10 border border-white/20 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-white/20 transition-colors"
                      >
                        <AgentAvatar
                          name={log.slaveAgentName}
                          avatar={log.slaveAvatar}
                          id={log.slaveAgentId}
                          className="w-3.5 h-3.5 rounded-none border border-white/40"
                        />
                        <span>{log.slaveAgentName} (@{log.slaveAgentId})</span>
                      </span>
                    )}
                    <span className="text-[10px] text-white/50 font-medium">{timeStr}</span>
                  </div>
                </div>

                {/* Row 2: Description */}
                <div className="text-[11px] text-white/80 font-sans leading-relaxed">
                  {description}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (embedded) {
    return innerContent;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      {innerContent}
    </div>
  );
};

export const SlaveMonitorCard: React.FC<{
  slaveAgents?: any[];
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}> = (props) => {
  return <SlaveMonitorModal embedded isOpen {...props} />;
};
