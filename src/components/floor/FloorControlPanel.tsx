import React, { useState, useEffect } from 'react';
import {
  Server,
  Wrench,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Shield,
  Activity,
  Trash2,
  Check,
  XCircle,
  Clock,
  ShieldAlert
} from 'lucide-react';
import {
  fetchMcpServers,
  fetchServerDetails,
  fetchFleetAgents,
  reconnectMcpServerApi,
  deleteMcpServerApi,
  fetchPendingInvocations,
  resolvePendingInvocationApi,
  McpServer,
  McpTool,
  FleetAgent,
  PendingInvocation
} from '../../services/floorApi';
import { BrutalistLoader } from '../BrutalistLoader';
import { AgentAvatar } from '../AgentAvatar';
import { AddIntegrationModal } from './AddIntegrationModal';
import { IntegrationDetailsModal } from './IntegrationDetailsModal';

interface FloorControlPanelProps {
  isSlaveAccount?: boolean;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const FloorControlPanel: React.FC<FloorControlPanelProps> = ({
  isSlaveAccount = false,
  onOpenAgentProfile
}) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [fleetAgents, setFleetAgents] = useState<FleetAgent[]>([]);
  const [pendingInvocations, setPendingInvocations] = useState<PendingInvocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [processingInvocationId, setProcessingInvocationId] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [selectedServerTools, setSelectedServerTools] = useState<McpTool[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [reconnectingServerId, setReconnectingServerId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [serversData, agentsData, pendingData] = await Promise.all([
        fetchMcpServers(),
        fetchFleetAgents(),
        fetchPendingInvocations()
      ]);
      setServers(serversData);
      setFleetAgents(agentsData);
      setPendingInvocations(pendingData);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load MCP servers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const pendingData = await fetchPendingInvocations();
        setPendingInvocations(pendingData);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolveInvocation = async (invocationId: string, approved: boolean) => {
    setProcessingInvocationId(invocationId);
    setErrorMsg(null);
    try {
      await resolvePendingInvocationApi(invocationId, approved);
      setPendingInvocations((prev) => prev.filter((inv) => inv.id !== invocationId));
      setSuccessMsg(approved ? 'Tool invocation approved & temporary grant issued!' : 'Tool invocation denied.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to process invocation resolution.');
    } finally {
      setProcessingInvocationId(null);
    }
  };

  const handleOpenDetails = async (server: McpServer) => {
    setSelectedServer(server);
    try {
      const details = await fetchServerDetails(server.id);
      setSelectedServerTools(details.tools || []);
      setIsDetailsModalOpen(true);
    } catch {
      setSelectedServerTools([]);
      setIsDetailsModalOpen(true);
    }
  };

  const handleReconnectQuick = async (e: React.MouseEvent, serverId: string) => {
    e.stopPropagation();
    setReconnectingServerId(serverId);
    setErrorMsg(null);
    try {
      const res = await reconnectMcpServerApi(serverId);
      setServers((prev) => prev.map((s) => (s.id === serverId ? res.server : s)));
      setSuccessMsg(`Reconnected '${res.server.name}' successfully!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Re-connection failed.');
    } finally {
      setReconnectingServerId(null);
    }
  };

  const handleDeleteQuick = async (e: React.MouseEvent, server: McpServer) => {
    e.stopPropagation();
    if (!window.confirm(`Delete integration '${server.name}'?`)) return;

    try {
      await deleteMcpServerApi(server.id);
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      setSuccessMsg(`Deleted '${server.name}'.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete integration.');
    }
  };

  const filteredServers = servers.filter((s) => {
    return (
      statusFilter === 'ALL' ||
      s.status.toUpperCase() === statusFilter.toUpperCase()
    );
  });

  return (
    <div className="w-full space-y-4 font-mono text-[#141414] text-left">
      {/* Top Banner / Hero Card */}
      <div className="p-4 sm:p-5 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#141414] pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-[#141414]" />
              <h1 className="text-sm sm:text-base font-black tracking-tight uppercase">
                AAMARVA FLOOR // TOOLS & MCP GOVERNANCE
              </h1>
            </div>
            <p className="text-[11px] text-[#141414]/70 font-sans leading-relaxed">
              Operator control panel for connecting Model Context Protocol (MCP) servers, discovering tool definitions, and enforcing agent-level permissions.
            </p>
          </div>

          {!isSlaveAccount && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-[#141414] text-white hover:bg-black font-black text-xs uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Integration</span>
            </button>
          )}
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 bg-[#FAF9F5] border border-[#141414]/30 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-[#141414]/60 block">INTEGRATIONS</span>
            <span className="text-sm font-black">{servers.length} Configured</span>
          </div>
          <div className="p-2.5 bg-[#FAF9F5] border border-[#141414]/30 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-[#141414]/60 block">ACTIVE CONNECTIONS</span>
            <span className="text-sm font-black text-green-700">
              {servers.filter((s) => s.status === 'connected').length} Live
            </span>
          </div>
          <div className="p-2.5 bg-[#FAF9F5] border border-[#141414]/30 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-[#141414]/60 block">DISCOVERED TOOLS</span>
            <span className="text-sm font-black">
              {servers.reduce((acc, s) => acc + (s.tools_count || 0), 0)} Available
            </span>
          </div>
          <div className="p-2.5 bg-[#FAF9F5] border border-[#141414]/30 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-[#141414]/60 block">FLEET NODES</span>
            <span className="text-sm font-black">{fleetAgents.length} Accounts</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-2 border-red-600 text-red-700 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-50 border-2 border-green-600 text-green-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* HITL Human Approval Queue */}
      {!isSlaveAccount && pendingInvocations.length > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-600 shadow-[4px_4px_0px_0px_rgba(217,119,6,1)] space-y-3">
          <div className="flex items-center justify-between border-b-2 border-amber-600/40 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-700 animate-pulse" />
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-900">
                PENDING HITL TOOL APPROVALS ({pendingInvocations.length})
              </h2>
            </div>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 border border-amber-400">
              Human Authorization Required
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingInvocations.map((inv) => {
              const isProcessing = processingInvocationId === inv.id;
              const expiresSec = Math.max(0, Math.floor((new Date(inv.expires_at).getTime() - Date.now()) / 1000));

              return (
                <div key={inv.id} className="p-3 bg-white border-2 border-amber-600 space-y-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-neutral-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[#141414] uppercase">{inv.tool_name}</span>
                      <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.5 border border-neutral-300">
                        {inv.server_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-amber-800">
                      <Clock className="w-3 h-3" />
                      <span>Expires in {expiresSec}s</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <span className="text-[9px] font-bold text-neutral-500 uppercase block">Requesting Agent:</span>
                      {(() => {
                        const reqAgent = fleetAgents.find(
                          (a) => a.agentId === inv.agent_id || a.id === inv.agent_id
                        );
                        return (
                          <div
                            className={`flex items-center gap-1.5 mt-0.5 ${onOpenAgentProfile && reqAgent ? 'cursor-pointer group' : ''}`}
                            onClick={() => reqAgent && onOpenAgentProfile?.(reqAgent.name, reqAgent.avatar, reqAgent.agentId)}
                          >
                            {reqAgent ? (
                              <AgentAvatar
                                id={reqAgent.agentId}
                                name={reqAgent.name}
                                avatar={reqAgent.avatar}
                                isMaster={reqAgent.isMaster}
                                className="w-4 h-4 rounded-full border border-[#141414] shrink-0"
                              />
                            ) : null}
                            <span className="font-bold text-[#141414] group-hover:underline truncate">
                              {reqAgent ? `${reqAgent.name} (@${reqAgent.agentId.replace(/^@/, '')})` : inv.agent_id}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-neutral-500 uppercase block">Arguments Hash:</span>
                      <span className="font-bold text-neutral-700 truncate block">{inv.args_hash}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase block">Requested Arguments:</span>
                    <pre className="p-2 bg-neutral-900 text-green-400 text-[10px] font-mono overflow-x-auto max-h-32 border border-neutral-700">
                      {JSON.stringify(inv.args, null, 2)}
                    </pre>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveInvocation(inv.id, false)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Deny</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveInvocation(inv.id, true)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Approve & Issue Grant</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* Area A: Inventory Table / List */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3 bg-white border-2 border-[#141414]">
          <BrutalistLoader text="Accessing MCP Integrations..." />
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="p-12 text-center border-4 border-dashed border-[#141414]/30 bg-[#FAF9F5] text-[#141414] space-y-3">
          <Server className="w-8 h-8 text-[#141414]/30 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-xs font-black uppercase tracking-wider">
              {statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} integrations found` : 'No MCP servers configured on this floor'}
            </h3>
            <p className="text-[10px] text-[#141414]/60 max-w-md mx-auto font-sans leading-relaxed">
              Connect external MCP tool servers to discover tools and authorize access for your autonomous agent nodes.
            </p>
          </div>
          {/* Button removed as requested */}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredServers.map((server) => {
            const isReconnecting = reconnectingServerId === server.id;
            const assignedCount = server.assigned_agents_count || 0;

            return (
              <div
                key={server.id}
                onClick={() => handleOpenDetails(server)}
                className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer space-y-3"
              >
                {/* Server Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#141414]/15 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <Server className="w-4 h-4 text-[#141414] shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-[#141414]">
                          {server.name}
                        </span>
                        <span className="text-[9px] bg-[#FAF9F5] text-[#141414]/70 px-1.5 py-0.2 border border-[#141414]/20 uppercase">
                          Streamable HTTP
                        </span>
                      </div>
                      <code className="text-[10px] text-[#141414]/60 font-mono block truncate max-w-sm sm:max-w-md">
                        {server.endpoint}
                      </code>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 border ${
                        server.status === 'connected'
                          ? 'bg-black text-white border-black'
                          : server.status === 'disabled'
                          ? 'bg-neutral-600 text-white border-neutral-600'
                          : 'bg-red-600 text-white border-red-600'
                      }`}
                    >
                      {server.status}
                    </span>
                  </div>
                </div>

                {/* Metrics & Scope Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-[#141414]/50 block">AVAILABLE TOOLS</span>
                    <span className="text-xs font-black flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      <span>{server.tools_count || 0} Tools</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-[#141414]/50 block">ASSIGNED SCOPE</span>
                    <span className="text-xs font-black">
                      {assignedCount > 0 ? `${assignedCount} Agents Granted` : 'Unassigned (Locked)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-[#141414]/50 block">AUTHENTICATION</span>
                    <span className="text-xs font-bold text-[#141414]/80 uppercase">
                      {server.auth_type === 'none' ? 'Public / None' : `${server.auth_type} (Encrypted)`}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-[#141414]/50 block">LAST STATUS CHECK</span>
                    <span className="text-[10px] font-bold text-[#141414]/70">
                      {server.last_checked ? new Date(server.last_checked).toLocaleTimeString() : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Error diagnostics banner if in error state */}
                {server.last_error && (
                  <div className="p-2 bg-red-50 border border-red-600 text-red-700 text-[10px] font-bold truncate">
                    Notice: {server.last_error}
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-1 border-t border-[#141414]/15">
                  <span className="text-[9px] text-[#141414]/50 font-bold uppercase flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>Click card to inspect schemas & govern access</span>
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isSlaveAccount && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleReconnectQuick(e, server.id)}
                          disabled={isReconnecting}
                          className="px-2 py-0.5 bg-white border border-[#141414] hover:bg-neutral-100 text-[9px] font-bold uppercase transition-all flex items-center gap-1"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                          <span>Re-Sync</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteQuick(e, server)}
                          className="p-1 text-red-600 hover:text-white hover:bg-red-600 border border-red-600 transition-colors"
                          title="Delete integration"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenDetails(server)}
                      className="px-2.5 py-0.5 bg-[#141414] text-white hover:bg-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                    >
                      <span>Manage</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Integration Modal */}
      <AddIntegrationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newServer) => {
          setServers((prev) => [newServer, ...prev]);
          setSuccessMsg(`MCP Server '${newServer.name}' connected & registered successfully!`);
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
      />

      {/* Integration Details & Governance Modal */}
      <IntegrationDetailsModal
        isOpen={isDetailsModalOpen}
        server={selectedServer}
        tools={selectedServerTools}
        fleetAgents={fleetAgents}
        isSlaveAccount={isSlaveAccount}
        onOpenAgentProfile={onOpenAgentProfile}
        onClose={() => setIsDetailsModalOpen(false)}
        onServerUpdated={(updatedServer, updatedTools) => {
          setSelectedServer(updatedServer);
          setSelectedServerTools(updatedTools);
          setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
        }}
        onServerDeleted={(deletedServerId) => {
          setServers((prev) => prev.filter((s) => s.id !== deletedServerId));
          setIsDetailsModalOpen(false);
        }}
      />
    </div>
  );
};
