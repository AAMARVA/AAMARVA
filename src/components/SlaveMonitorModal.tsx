import React, { useState, useEffect, useCallback } from 'react';
import { GitCommit, RotateCw, X } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { BrutalistLoader } from './BrutalistLoader';

interface SlaveMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slaveAgents: any[];
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

const PRE_WRITTEN_DESCRIPTIONS: Record<string, string> = {
  CONNECTION_REQUEST_RECEIVED: 'Inbound secure handshake request received from candidate peer node.',
  CONNECTION_ACCEPTED_BY_TARGET: 'Peer agent accepted connection handshake; private communication channel active.',
  CONNECTION_REJECTED: 'Candidate peer node declined or cancelled connection handshake request.',
  CONNECTION_DISSOLVED: 'Active connection partner terminated their private link with your node.',
  MESSAGE_RECEIVED: 'Encrypted telemetry payload delivered from connected peer node.',
  REPLY_RECEIVED: 'New incoming bid posted on your network thread by a peer agent.',
  COUNTERPARTY_REVIEW_RECEIVED: 'Received an authenticated peer evaluation and score from your counterparty.',
  COUNTERPARTY_REVIEW_REMOVED: 'A peer agent revoked or removed a trust evaluation score previously assigned to your node.',
  CLUSTER_INVITE_RECEIVED: 'Received an invitation to join a cluster enclave.',
  CLUSTER_MEMBER_JOINED: 'A new agent node joined a cluster enclave you belong to or manage.',
  CLUSTER_MEMBER_LEFT: 'A member node voluntarily exited a cluster enclave you manage.',
  CLUSTER_MEMBER_REMOVED: 'An administrator removed or kicked an agent from a cluster enclave.',
  CLUSTER_ROLE_UPDATED: 'A cluster administrator updated your access permissions or role.',
  CLUSTER_MESSAGE_RECEIVED: 'Encrypted transmission received inside a cluster enclave you belong to.',
  CLUSTER_DISBANDED: 'The owner of a cluster enclave you belong to has disbanded and deleted the enclave.'
};

export const SlaveMonitorModal: React.FC<SlaveMonitorModalProps> = ({
  isOpen,
  onClose,
  slaveAgents
}) => {
  const [activeTab, setActiveTab] = useState<'footprints' | 'webhooks'>('footprints');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAllSlaveLogs = useCallback(async (tab: 'footprints' | 'webhooks', showLoader = false) => {
    if (showLoader) setIsLoading(true);
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
      if (Array.isArray(slaveAgents) && slaveAgents.length > 0) {
        await Promise.allSettled(
          slaveAgents.map(async (sub) => {
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
      setLogs(merged.slice(0, 100));
    } catch (err) {
      console.warn('Slave Monitor fetch error:', err);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [slaveAgents]);

  useEffect(() => {
    if (!isOpen) return;
    fetchAllSlaveLogs(activeTab, true);
    const interval = setInterval(() => {
      fetchAllSlaveLogs(activeTab, false);
    }, 6000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab, fetchAllSlaveLogs]);

  if (!isOpen) return null;

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

  const filteredLogs = logs.filter((log) => {
    const isFootprint = !!log.action;
    const isWebhook = !!log.type;
    return activeTab === 'footprints' ? isFootprint : isWebhook;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#141414] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] text-white max-h-[94vh] flex flex-col font-mono">
        {/* Modal Top Header Bar - Matches Inbound & Outbound Activities UI */}
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b-2 border-white flex items-center justify-between flex-nowrap min-w-0 gap-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-nowrap min-w-0">
            <div className="p-1 sm:p-1.5 bg-[#141414] text-white border border-white shrink-0 flex items-center justify-center">
              <GitCommit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm md:text-base font-black uppercase tracking-tight sm:tracking-wider text-white whitespace-nowrap">
                Slave Monitor: Inbound & Outbound Activities
              </h2>
              <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest block mt-0.5">
                Aggregated from all {slaveAgents?.length || 0} slave accounts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchAllSlaveLogs(activeTab, true)}
              className="p-1 sm:p-1.5 bg-[#141414] hover:bg-white/10 border border-white/20 text-white transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px]"
              title="Refresh logs"
              aria-label="Refresh logs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 bg-white text-[#141414] border border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher - Same UI as Inbound & Outbound Activities */}
        <div className="px-4 sm:px-6 pt-3 shrink-0">
          <div className="flex border border-white/20 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] bg-[#141414]">
            <button
              type="button"
              onClick={() => setActiveTab('footprints')}
              className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${
                activeTab === 'footprints' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'
              }`}
            >
              <span>Agent Footprints ({logs.filter(l => !!l.action).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('webhooks')}
              className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer ${
                activeTab === 'webhooks' ? 'bg-white/90 text-[#141414]' : 'bg-[#141414] text-white/70 hover:bg-white/5'
              }`}
            >
              <span>Webhook Events ({logs.filter(l => !!l.type).length})</span>
            </button>
          </div>
        </div>

        {/* Logs Scroll Area - Same UI as Inbound & Outbound Activities */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {isLoading && logs.length === 0 ? (
            <div className="flex justify-center items-center py-16 bg-white/5 border-2 border-dashed border-white/20">
              <BrutalistLoader text="Synchronizing Fleet Activities..." size="sm" theme="dark" className="py-4" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-white/60 border-2 border-dashed border-white/20 bg-white/5 uppercase tracking-wider font-bold">
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
                    className="p-3.5 bg-[#1e1e1e] border border-white/10 text-xs space-y-2.5 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/20 transition-all duration-150"
                  >
                    {/* Row 1: Action Title, Source Slave Account Badge, Time */}
                    <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-700">●</span>
                        <span>{title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.slaveAgentName && (
                          <span className="px-2 py-0.5 bg-white/10 border border-white/20 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
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
                  className="p-3.5 bg-[#1e1e1e] border border-white/10 text-xs space-y-2.5 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.05)] hover:border-white/20 transition-all duration-150"
                >
                  {/* Row 1: Event Title, Source Slave Account Badge, Time */}
                  <div className="flex justify-between items-center border-b border-white/10 pb-1.5 font-black tracking-wider text-xs text-white/90 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-700">◆</span>
                      <span>{title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.slaveAgentName && (
                        <span className="px-2 py-0.5 bg-white/10 border border-white/20 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
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
    </div>
  );
};
