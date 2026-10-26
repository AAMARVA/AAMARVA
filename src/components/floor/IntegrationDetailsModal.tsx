import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Wrench,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Check,
  XCircle,
  Plus,
  Inbox,
  Settings
} from 'lucide-react';
import {
  McpServer,
  McpTool,
  FleetAgent,
  McpToolGrant,
  McpToolRequest,
  reconnectMcpServerApi,
  deleteMcpServerApi,
  setToolAssignmentApi,
  fetchServerGrantsApi,
  setToolGrantApi,
  fetchToolRequestsApi,
  approveToolRequestApi,
  rejectToolRequestApi
} from '../../services/floorApi';
import { AgentAvatar } from '../AgentAvatar';
import { CappedBadge } from '../CappedBadge';

interface IntegrationDetailsModalProps {
  isOpen: boolean;
  server: McpServer | null;
  tools: McpTool[];
  fleetAgents: FleetAgent[];
  onClose: () => void;
  onServerUpdated: (server: McpServer, tools: McpTool[]) => void;
  onServerDeleted: (serverId: string) => void;
  onEditServer?: (server: McpServer) => void;
  isSlaveAccount?: boolean;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const IntegrationDetailsModal: React.FC<IntegrationDetailsModalProps> = ({
  isOpen,
  server,
  tools,
  fleetAgents,
  onClose,
  onServerUpdated,
  onServerDeleted,
  onEditServer,
  isSlaveAccount = false,
  onOpenAgentProfile
}) => {
  const [localTools, setLocalTools] = useState<McpTool[]>(tools);
  const [activeTab, setActiveTab] = useState<'tools' | 'assignment' | 'requests'>('tools');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(tools[0]?.id || null);
  const [expandedSchemaToolId, setExpandedSchemaToolId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [assignedSubTab, setAssignedSubTab] = useState<'assigned' | 'unassigned'>('assigned');
  const [isSpogModalOpen, setIsSpogModalOpen] = useState(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState('');
  const [spogModalTab, setSpogModalTab] = useState<'assigned' | 'unassigned'>('assigned');

  // Grants state
  const [, setGrants] = useState<McpToolGrant[]>([]);
  const [, setIsLoadingGrants] = useState(false);
  const [revokingTarget, setRevokingTarget] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<McpToolRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [expandedReqArgsId, setExpandedReqArgsId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTools(tools);
  }, [tools]);

  useEffect(() => {
    if (localTools.length > 0 && !selectedToolId) {
      setSelectedToolId(localTools[0].id);
    }
  }, [localTools, selectedToolId]);

  const loadGrants = async () => {
    if (!server) return;
    setIsLoadingGrants(true);
    try {
      const data = await fetchServerGrantsApi(server.id);
      setGrants(data);
    } catch {
      // Graceful fallback to tool assignments
    } finally {
      setIsLoadingGrants(false);
    }
  };

  const loadRequests = async () => {
    if (!server) return;
    setIsLoadingRequests(true);
    try {
      const data = await fetchToolRequestsApi(server.id);
      setRequests(data);
    } catch {
      // Graceful error handling
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (isOpen && server) {
      loadGrants();
      loadRequests();
    }
  }, [isOpen, server?.id]);

  if (!isOpen || !server) return null;

  const currentTool = localTools.find((t) => t.id === selectedToolId) || localTools[0];
  const uniqueFleetAgents = Array.from(new Map(fleetAgents.map(a => [a.id, a])).values());
  const slaveFleetAgents = uniqueFleetAgents as FleetAgent[];
  const activeFleetAgents: FleetAgent[] = slaveFleetAgents.length > 0 ? slaveFleetAgents : ([
    {
      id: server.owner_id || 'default_agent_1',
      agentId: 'AMR-TAJQ-S36N',
      name: 'AMR-TAJQ-S36N',
      avatar: '🤖',
      isMaster: false,
      isCapped: false
    }
  ] as FleetAgent[]);

  const nonMasterFleetAgents = activeFleetAgents.filter((agent) => !agent.isMaster);

  const assignedAgents = nonMasterFleetAgents.filter((agent) => {
    const targetId = agent.agentId || agent.id;
    return (
      (currentTool?.assigned_agents || []).includes(targetId) ||
      (currentTool?.assigned_agents || []).includes(agent.id) ||
      (currentTool?.assigned_agents || []).includes(agent.agentId)
    );
  });

  const unassignedAgents = nonMasterFleetAgents.filter((agent) => {
    const targetId = agent.agentId || agent.id;
    return !(
      (currentTool?.assigned_agents || []).includes(targetId) ||
      (currentTool?.assigned_agents || []).includes(agent.id) ||
      (currentTool?.assigned_agents || []).includes(agent.agentId)
    );
  });

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await reconnectMcpServerApi(server.id);
      setLocalTools(res.tools);
      onServerUpdated(res.server, res.tools);
      setActionSuccess('Reconnected successfully & tools refreshed!');
      setTimeout(() => setActionSuccess(null), 3000);
      loadGrants();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reconnect to MCP server.');
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently remove MCP server '${server.name}' and all associated tool permissions?`)) {
      return;
    }
    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteMcpServerApi(server.id);
      onServerDeleted(server.id);
      onClose();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to delete MCP server.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleAssignment = async (
    toolId: string,
    accountId: string,
    currentAssigned: boolean,
    agentObj?: FleetAgent
  ) => {
    if (!toolId || !accountId) return;
    setRevokingTarget(accountId);
    setActionError(null);
    setActionSuccess(null);

    const agent = agentObj || activeFleetAgents.find((a) => a.agentId === accountId || a.id === accountId);
    const cleanAccountId = accountId.replace(/^@/, '');
    const cleanAgentId = agent?.agentId ? agent.agentId.replace(/^@/, '') : '';
    const allIds = Array.from(
      new Set(
        [
          accountId,
          cleanAccountId,
          `@${cleanAccountId}`,
          agent?.id,
          agent?.agentId,
          cleanAgentId,
          cleanAgentId ? `@${cleanAgentId}` : null
        ].filter(Boolean)
      )
    ) as string[];

    const nextGranted = !currentAssigned;
    const prevTools = localTools;

    // Instant Synchronous Shift: Immediately update state so profile jumps to other side with zero lag
    const updatedTools = localTools.map((t) => {
      if (t.id !== toolId) return t;
      const currentAssignedList = t.assigned_agents || [];
      const nextAssignedList = nextGranted
        ? Array.from(new Set([...currentAssignedList, ...allIds]))
        : currentAssignedList.filter((a) => !allIds.includes(a));
      return { ...t, assigned_agents: nextAssignedList };
    });

    setLocalTools(updatedTools);
    onServerUpdated(server, updatedTools);

    try {
      await setToolAssignmentApi(toolId, accountId, nextGranted);

      setActionSuccess(
        nextGranted
          ? `Tool access granted to ${accountId} — Free tool execution active (No HITL)`
          : `Tool access revoked from ${accountId}`
      );
      setTimeout(() => setActionSuccess(null), 3000);
      loadGrants();
    } catch (err: any) {
      // Revert if API failed
      setLocalTools(prevTools);
      onServerUpdated(server, prevTools);
      setActionError(err?.message || 'Failed to update tool assignment.');
    } finally {
      setRevokingTarget(null);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequestId(requestId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await approveToolRequestApi(requestId);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved', reviewed_at: new Date().toISOString() } : r))
      );
      await loadGrants();
      // Update tool assignment in tools state
      if (res.grant) {
        const updatedTools = localTools.map((t) => {
          if (t.id !== res.grant.tool_id) return t;
          const nextAssigned = Array.from(new Set([...(t.assigned_agents || []), res.grant.account_id]));
          return { ...t, assigned_agents: nextAssigned };
        });
        setLocalTools(updatedTools);
        onServerUpdated(server, updatedTools);
      }
      setActionSuccess(`Access request approved! Permanent grant issued for ${res.request.account_id}.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to approve access request.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setProcessingRequestId(requestId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await rejectToolRequestApi(requestId, 'Access denied by operator policy.');
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected', reviewed_at: new Date().toISOString() } : r))
      );
      setActionSuccess('Access request rejected and retained in governance history.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reject access request.');
    } finally {
      setProcessingRequestId(null);
    }
  };


  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-4xl max-h-[92vh] flex flex-col font-mono text-[#141414] my-auto overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#141414] select-none shrink-0">
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 text-white" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider">
                {server.name}
              </span>
              <span
                className={`text-[9px] font-black uppercase px-1.5 py-0.5 border ${
                  server.status === 'connected'
                    ? 'bg-white text-black border-white'
                    : server.status === 'disabled'
                    ? 'bg-neutral-600 text-white border-neutral-600'
                    : 'bg-red-600 text-white border-red-600'
                }`}
              >
                {server.status}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-white hover:bg-white hover:text-[#141414] transition-colors cursor-pointer border border-transparent hover:border-white"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Server Sub-Header Info Banner */}
        <div className="p-3 bg-[#FAF9F5] border-b-2 border-[#141414] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-[#141414]/60 uppercase">ENDPOINT:</span>
              <code className="text-[10px] font-bold truncate max-w-md bg-white px-1.5 py-0.5 border border-[#141414]/20">
                {server.endpoint}
              </code>
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-white border border-[#141414]/40">
                AUTH: {server.auth_type === 'none' ? 'No Auth' : server.auth_type === 'bearer' ? 'Bearer Token' : server.auth_type === 'api-key' ? `API Key (${server.auth_header_name || 'X-API-Key'})` : `Custom (${server.auth_header_name || 'Header'})`}
              </span>
            </div>
            {server.description && (
              <p className="text-[10px] text-[#141414]/70 font-sans truncate">{server.description}</p>
            )}
            {server.last_error && (
              <p className="text-[10px] text-red-600 font-bold truncate">Error: {server.last_error}</p>
            )}
          </div>

          {!isSlaveAccount && (
            <div className="flex items-center gap-2 shrink-0">
              {onEditServer && (
                <button
                  type="button"
                  onClick={() => onEditServer(server)}
                  className="px-2.5 py-1 bg-white text-[#141414] hover:bg-neutral-100 border border-[#141414] text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Edit endpoint and authentication credentials"
                >
                  <Settings className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleReconnect}
                disabled={isReconnecting}
                className="px-2.5 py-1 bg-white text-[#141414] hover:bg-neutral-100 border border-[#141414] text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                title="Re-verify connection & sync tool definitions"
              >
                <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>Re-Sync</span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2.5 py-1 bg-red-600 text-white hover:bg-red-700 border border-red-700 text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                title="Permanently remove integration"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        {actionError && (
          <div className="p-2.5 bg-red-50 border-b-2 border-red-600 text-red-700 text-xs font-bold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="p-2.5 bg-green-50 border-b-2 border-green-600 text-green-800 text-xs font-bold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center border-b-2 border-[#141414] bg-neutral-100 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'tools'
                ? 'bg-white text-[#141414] border-r-2 border-[#141414] -mb-[2px] pb-[10px]'
                : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Discovered Tools ({localTools.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('assignment');
              loadGrants();
            }}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'assignment'
                ? 'bg-white text-[#141414] border-r-2 border-l-2 border-[#141414] -mb-[2px] pb-[10px]'
                : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Access & Governance</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('requests');
              loadRequests();
            }}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer relative ${
              activeTab === 'requests'
                ? 'bg-white text-[#141414] border-r-2 border-l-2 border-[#141414] -mb-[2px] pb-[10px]'
                : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-black text-[9px] font-black border border-amber-600">
                {pendingRequestsCount}
              </span>
            )}
          </button>


        </div>

        {/* Tab 1: Tools & Schema Inspection */}
        {activeTab === 'tools' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {localTools.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#141414]/20 bg-[#FAF9F5]">
                <Wrench className="w-8 h-8 text-[#141414]/30 mx-auto mb-2" />
                <p className="text-xs font-bold uppercase">No tools discovered from this server.</p>
                <p className="text-[10px] text-[#141414]/60 mt-1 font-sans">
                  The MCP server connected successfully but exposed zero tools in its <code className="bg-white px-1">tools/list</code> response.
                </p>
              </div>
            ) : (
              localTools.map((tool) => {
                const isSchemaExpanded = expandedSchemaToolId === tool.id;
                const assignedCount = (tool.assigned_agents || []).length;

                return (
                  <div
                    key={tool.id}
                    className="p-3.5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] space-y-2.5 text-left"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-3.5 h-3.5 text-[#141414]" />
                        <span className="text-xs font-black uppercase text-[#141414]">
                          {tool.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 border ${
                          assignedCount > 0
                            ? 'bg-[#141414] text-white border-[#141414]'
                            : 'bg-neutral-100 text-[#141414]/60 border-neutral-300'
                        }`}>
                          {assignedCount > 0 ? `${assignedCount} Accounts Authorized` : 'Unassigned (Restricted)'}
                        </span>

                        <button
                          type="button"
                          onClick={() => setExpandedSchemaToolId(isSchemaExpanded ? null : tool.id)}
                          className="px-2 py-0.5 bg-[#FAF9F5] border border-[#141414] text-[10px] font-bold uppercase hover:bg-neutral-100 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Code className="w-3 h-3" />
                          <span>{isSchemaExpanded ? 'Hide Schema' : 'Inspect Schema'}</span>
                          {isSchemaExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {tool.description && (
                      <p className="text-[11px] text-[#141414]/80 font-sans leading-relaxed">
                        {tool.description}
                      </p>
                    )}

                    {/* Collapsible JSON Schema Inspector */}
                    {isSchemaExpanded && (
                      <div className="p-3 bg-[#141414] text-white border border-[#141414] space-y-1.5 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between text-[9px] text-white/60 uppercase">
                          <span>Input Parameter Schema (JSON-RPC)</span>
                          <span>Required: {tool.input_schema?.required?.join(', ') || 'none'}</span>
                        </div>
                        <pre className="text-[10px] font-mono overflow-x-auto text-green-400 p-2 bg-black/50 border border-white/10 max-h-48 leading-tight">
                          {JSON.stringify(tool.input_schema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Access & Governance */}
        {activeTab === 'assignment' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-left">
            <div className="p-2.5 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-0.5 shrink-0">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Agent Tool Access Governance
              </span>
              <p className="text-[10px] text-[#141414]/70 font-sans leading-relaxed">
                By default, all discovered tools are locked (Zero-Trust). Explicitly assign tools to specific slave agent accounts in your fleet to grant execution permissions.
              </p>
            </div>

            {localTools.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#141414]/20 bg-[#FAF9F5]">
                <p className="text-xs font-bold uppercase text-[#141414]/50">No tools available to govern.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                {/* Left Column: Tools List */}
                <div className="space-y-2 border-2 border-[#141414] p-2.5 bg-[#FAF9F5]">
                  <span className="text-[10px] font-black uppercase text-[#141414]/70 px-1 block">
                    Select Tool ({localTools.length})
                  </span>
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                    {localTools.map((tool) => {
                      const isSelected = tool.id === selectedToolId;
                      const assignedCount = (tool.assigned_agents || []).length;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => setSelectedToolId(tool.id)}
                          className={`w-full p-2 text-left border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#141414] text-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                              : 'bg-white text-[#141414] border-[#141414]/30 hover:border-[#141414]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black uppercase truncate">{tool.name}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 border ${
                                isSelected
                                  ? 'bg-white text-black border-white'
                                  : assignedCount > 0
                                  ? 'bg-green-100 text-green-900 border-green-600'
                                  : 'bg-neutral-100 text-neutral-600 border-neutral-300'
                              }`}
                            >
                              {assignedCount}
                            </span>
                          </div>
                          {tool.description && (
                            <p
                              className={`text-[10px] font-sans truncate mt-1 ${
                                isSelected ? 'text-white/70' : 'text-[#141414]/60'
                              }`}
                            >
                              {tool.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Fleet Accounts Assignment for Selected Tool */}
                <div className="md:col-span-2 space-y-3">
                  {currentTool ? (
                    <div className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#141414] pb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-[#141414] shrink-0" />
                            <span className="text-xs font-black uppercase text-[#141414] truncate">
                              {currentTool.name}
                            </span>
                          </div>
                          {currentTool.description && (
                            <p className="text-[11px] text-[#141414]/70 font-sans mt-0.5 line-clamp-1">
                              {currentTool.description}
                            </p>
                          )}
                        </div>
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-[#FAF9F5] border border-[#141414] shrink-0 self-start sm:self-center">
                          {activeFleetAgents.filter((a) => !a.isMaster && ((currentTool.assigned_agents || []).includes(a.agentId) || (currentTool.assigned_agents || []).includes(a.id))).length} / {activeFleetAgents.filter((a) => !a.isMaster).length} Permitted
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(() => {
                          const displayedAgents = assignedSubTab === 'assigned' ? assignedAgents : unassignedAgents;

                          return (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2 border-b border-[#141414]/20 pb-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setAssignedSubTab('assigned')}
                                    className={`px-3 py-1 text-[10px] font-black uppercase border transition-all cursor-pointer ${
                                      assignedSubTab === 'assigned'
                                        ? 'bg-[#141414] text-white border-[#141414]'
                                        : 'bg-[#FAF9F5] text-[#141414]/70 border-[#141414]/30 hover:border-[#141414]'
                                    }`}
                                  >
                                    Assigned Slaves ({assignedAgents.length})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAssignedSubTab('unassigned')}
                                    className={`px-3 py-1 text-[10px] font-black uppercase border transition-all cursor-pointer ${
                                      assignedSubTab === 'unassigned'
                                        ? 'bg-[#141414] text-white border-[#141414]'
                                        : 'bg-[#FAF9F5] text-[#141414]/70 border-[#141414]/30 hover:border-[#141414]'
                                    }`}
                                  >
                                    Unassigned Slaves ({unassignedAgents.length})
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSpogModalTab(assignedSubTab);
                                    setIsSpogModalOpen(true);
                                  }}
                                  className="px-3 py-1 text-[10px] font-mono font-black uppercase bg-[#141414] text-white border-2 border-[#141414] hover:bg-black transition-all cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5"
                                  title={`Open SPOG Overview for ${assignedSubTab === 'assigned' ? 'Assigned' : 'Unassigned'} Slaves`}
                                >
                                  <span className="bg-white text-[#141414] px-1 text-[8px] font-black">SPOG</span>
                                  <span>{assignedSubTab === 'assigned' ? 'Assigned SPOG' : 'Unassigned SPOG'}</span>
                                  <span className="bg-white/20 px-1.5 py-0.2 text-[9px] text-white font-bold">
                                    {assignedSubTab === 'assigned' ? assignedAgents.length : unassignedAgents.length}
                                  </span>
                                </button>
                              </div>

                              {displayedAgents.length === 0 ? (
                                <div className="p-6 text-center border border-dashed border-[#141414]/20 bg-[#FAF9F5]">
                                  <p className="text-xs font-bold uppercase text-[#141414]/50">
                                    No {assignedSubTab} agents found.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                                  {displayedAgents.map((agent) => {
                                    const targetId = agent.agentId || agent.id;
                                    const isAssigned =
                                      (currentTool.assigned_agents || []).includes(targetId) ||
                                      (currentTool.assigned_agents || []).includes(agent.id) ||
                                      (currentTool.assigned_agents || []).includes(agent.agentId);
                                    const isUpdating = revokingTarget === targetId;

                                    return (
                                      <div
                                        key={agent.id}
                                        className={`p-2 border-2 transition-all flex items-center justify-between gap-2.5 ${
                                          isAssigned
                                            ? 'bg-[#FAF9F5] border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                            : 'bg-white border-[#141414]/20 hover:border-[#141414]/50'
                                        }`}
                                      >
                                        <div
                                          className={`flex items-center gap-2.5 min-w-0 flex-1 ${
                                            onOpenAgentProfile ? 'cursor-pointer group' : ''
                                          }`}
                                          onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                                          title={onOpenAgentProfile ? `View profile for ${agent.name}` : undefined}
                                        >
                                          <AgentAvatar
                                            id={agent.agentId || agent.id}
                                            name={agent.name}
                                            avatar={agent.avatar}
                                            isMaster={false}
                                            className="w-7 h-7 rounded-full border border-[#141414] shrink-0"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-bold text-[#141414] truncate group-hover:underline">
                                                {agent.name}
                                              </span>
                                              {Boolean(agent.expires_at && !isNaN(new Date(agent.expires_at).getTime())) && (
                                                <CappedBadge
                                                  expiresAt={agent.expires_at}
                                                  purchaseDate={agent.plan_created_at}
                                                  isCapped={agent.isCapped}
                                                  size="sm"
                                                />
                                              )}
                                            </div>
                                            <span className="text-[9px] text-[#141414]/60 font-mono block truncate">
                                              @{agent.agentId ? agent.agentId.replace(/^@/, '') : agent.id}
                                            </span>
                                          </div>
                                        </div>

                                        {!isSlaveAccount && (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleAssignment(currentTool.id, targetId, isAssigned, agent)}
                                            disabled={isUpdating}
                                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                              isAssigned
                                                ? 'bg-[#141414] text-white border-[#141414] hover:bg-red-700 hover:border-red-700'
                                                : 'bg-white text-[#141414] border-[#141414] hover:bg-[#141414] hover:text-white'
                                            }`}
                                          >
                                            {isUpdating ? (
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                            ) : isAssigned ? (
                                              <>
                                                <Check className="w-3 h-3" />
                                                <span>Assigned</span>
                                              </>
                                            ) : (
                                              <>
                                                <Plus className="w-3 h-3" />
                                                <span>Assign</span>
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Access Requests Section */}
        {activeTab === 'requests' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <Inbox className="w-4 h-4 text-amber-700" />
                Persistent Tool Access Requests Queue
              </span>
              <p className="text-[10px] text-[#141414]/70 font-sans leading-relaxed">
                When an unauthorized agent attempts an invocation, execution is blocked and a request is queued here. Approving a request grants permanent access and unblocks future invocations. Rejection denies the call and preserves history.
              </p>
            </div>

            {/* Filter Tabs & Refresh */}
            <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => {
                  const count =
                    st === 'all'
                      ? requests.length
                      : requests.filter((r) => r.status === st).length;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setRequestFilter(st)}
                      className={`px-2.5 py-1 text-[10px] font-black uppercase border transition-all cursor-pointer ${
                        requestFilter === st
                          ? 'bg-[#141414] text-white border-[#141414]'
                          : 'bg-white text-[#141414]/70 border-neutral-300 hover:text-[#141414]'
                      }`}
                    >
                      {st} ({count})
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={loadRequests}
                disabled={isLoadingRequests}
                className="px-2 py-1 bg-white border border-[#141414] hover:bg-neutral-100 text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Requests List */}
            {isLoadingRequests ? (
              <div className="p-8 text-center text-xs font-bold uppercase text-[#141414]/50">
                Loading requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#141414]/20 bg-[#FAF9F5] space-y-1">
                <Inbox className="w-8 h-8 text-[#141414]/30 mx-auto mb-1" />
                <p className="text-xs font-bold uppercase">No access requests found.</p>
                <p className="text-[10px] text-[#141414]/60 font-sans">
                  {requestFilter === 'pending'
                    ? 'There are currently zero pending tool access requests awaiting operator approval.'
                    : `No access requests matching status '${requestFilter}'.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((req) => {
                  const isProcessing = processingRequestId === req.id;
                  const isArgsExpanded = expandedReqArgsId === req.id;
                  const reqAgent = fleetAgents.find(
                    (a) => a.agentId === req.account_id || a.id === req.account_id
                  );

                  return (
                    <div
                      key={req.id}
                      className={`p-3 border-2 transition-all space-y-2.5 ${
                        req.status === 'pending'
                          ? 'bg-amber-50/50 border-amber-600 shadow-[2px_2px_0px_0px_rgba(217,119,6,1)]'
                          : req.status === 'approved'
                          ? 'bg-white border-green-700'
                          : 'bg-neutral-50 border-neutral-400 opacity-80'
                      }`}
                    >
                      {/* Request Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-black/10 pb-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-3.5 h-3.5 text-[#141414]" />
                          <span className="font-black text-xs uppercase text-[#141414]">
                            {req.tool_name}
                          </span>
                          <span className="text-[9px] bg-neutral-100 text-neutral-600 px-1.5 py-0.2 border border-neutral-300 font-bold uppercase">
                            {req.server_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 border ${
                              req.status === 'pending'
                                ? 'bg-amber-500 text-black border-amber-600'
                                : req.status === 'approved'
                                ? 'bg-green-600 text-white border-green-700'
                                : 'bg-red-600 text-white border-red-700'
                            }`}
                          >
                            {req.status}
                          </span>
                          <span className="text-[9px] text-[#141414]/60 font-mono">
                            {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Request Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                        <div>
                          <span className="text-[9px] font-bold text-neutral-500 uppercase block">
                            Requesting Account:
                          </span>
                          <div
                            className={`flex items-center gap-2 mt-0.5 ${
                              onOpenAgentProfile && reqAgent ? 'cursor-pointer group' : ''
                            }`}
                            onClick={() =>
                              reqAgent && onOpenAgentProfile?.(reqAgent.name, reqAgent.avatar, reqAgent.agentId)
                            }
                          >
                            <AgentAvatar
                              id={req.account_id}
                              name={reqAgent?.name || req.agent_name || req.account_id}
                              avatar={reqAgent?.avatar}
                              isMaster={reqAgent?.isMaster || false}
                              className="w-5 h-5 rounded-full border border-[#141414] shrink-0"
                            />
                            <span className="font-bold text-[#141414] group-hover:underline truncate">
                              {reqAgent ? reqAgent.name : req.agent_name || req.account_id}
                            </span>
                            <span className="text-[9px] text-neutral-500 font-mono">
                              (@{req.account_id.replace(/^@/, '')})
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[9px] font-bold text-neutral-500 uppercase block">
                            Requested Operation:
                          </span>
                          <span className="font-bold text-neutral-800 uppercase text-[10px]">
                            {req.requested_operation}
                          </span>
                        </div>
                      </div>

                      {/* Arguments Preview */}
                      {req.arguments && Object.keys(req.arguments).length > 0 && (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setExpandedReqArgsId(isArgsExpanded ? null : req.id)}
                            className="text-[9px] font-bold text-neutral-600 uppercase flex items-center gap-1 hover:text-black cursor-pointer"
                          >
                            <Code className="w-3 h-3" />
                            <span>{isArgsExpanded ? 'Hide Payload Arguments' : 'View Payload Arguments'}</span>
                            {isArgsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          {isArgsExpanded && (
                            <pre className="p-2 bg-neutral-900 text-green-400 text-[10px] font-mono overflow-x-auto max-h-32 border border-neutral-700">
                              {JSON.stringify(req.arguments, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Rejection / Review Info */}
                      {req.status !== 'pending' && (
                        <div className="text-[9px] text-neutral-600 pt-1 border-t border-black/10 flex items-center justify-between">
                          <span>
                            Decision recorded: {req.reviewed_at ? new Date(req.reviewed_at).toLocaleString() : 'Done'}
                          </span>
                          {req.rejection_reason && (
                            <span className="text-red-700 font-bold truncate max-w-xs">
                              Reason: {req.rejection_reason}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons for Pending Requests */}
                      {!isSlaveAccount && req.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-black/10">
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(req.id)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApproveRequest(req.id)}
                            disabled={isProcessing}
                            className="px-3.5 py-1.5 bg-green-600 text-white hover:bg-green-700 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Approve & Grant Permanent Access</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* Modal Footer */}
        <div className="p-3 bg-neutral-50 border-t-2 border-[#141414] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141414] text-white hover:bg-black text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>

      {/* SPOG Modal - Fleet Overview */}
      {isSpogModalOpen && (
        <div className="fixed inset-0 z-70 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[90vh] flex flex-col font-mono">
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <div className="flex items-center gap-2">
                <span className="bg-white text-[#141414] px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                  SPOG
                </span>
                <span className="text-xs font-black uppercase tracking-widest">
                  FLEET OVERVIEW — {spogModalTab === 'assigned' ? 'ASSIGNED SLAVES' : 'UNASSIGNED SLAVES'}
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

            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpogModalTab('assigned')}
                  className={`px-3 py-1 text-[10px] font-black uppercase border-2 transition-all cursor-pointer ${
                    spogModalTab === 'assigned'
                      ? 'bg-[#141414] text-white border-[#141414]'
                      : 'bg-white text-[#141414]/70 border-[#141414]/30 hover:border-[#141414]'
                  }`}
                >
                  Assigned SPOG ({assignedAgents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSpogModalTab('unassigned')}
                  className={`px-3 py-1 text-[10px] font-black uppercase border-2 transition-all cursor-pointer ${
                    spogModalTab === 'unassigned'
                      ? 'bg-[#141414] text-white border-[#141414]'
                      : 'bg-white text-[#141414]/70 border-[#141414]/30 hover:border-[#141414]'
                  }`}
                >
                  Unassigned SPOG ({unassignedAgents.length})
                </button>
              </div>

              <input
                type="text"
                placeholder="SEARCH SLAVE..."
                value={spogSearchQuery}
                onChange={(e) => setSpogSearchQuery(e.target.value)}
                className="px-2.5 py-1 text-xs font-bold uppercase bg-white border-2 border-[#141414] focus:outline-hidden"
              />
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
              {(() => {
                const targetPool = spogModalTab === 'assigned' ? assignedAgents : unassignedAgents;
                const filtered = targetPool.filter((agent) => {
                  if (!spogSearchQuery.trim()) return true;
                  const q = spogSearchQuery.toLowerCase();
                  const name = (agent.name || '').toLowerCase();
                  const aid = (agent.agentId || agent.id || '').toLowerCase();
                  return name.includes(q) || aid.includes(q);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                      No {spogModalTab} slave agents match search query.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((agent) => {
                      const targetId = agent.agentId || agent.id;
                      const isAssigned =
                        (currentTool?.assigned_agents || []).includes(targetId) ||
                        (currentTool?.assigned_agents || []).includes(agent.id) ||
                        (currentTool?.assigned_agents || []).includes(agent.agentId);
                      const isUpdating = revokingTarget === targetId;

                      return (
                        <div
                          key={agent.id}
                          className="relative flex items-center justify-between gap-3 p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] min-h-[64px]"
                        >
                          <div
                            className={`flex items-center gap-2.5 min-w-0 flex-1 pr-1 ${
                              onOpenAgentProfile ? 'cursor-pointer group' : ''
                            }`}
                            onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                            title={onOpenAgentProfile ? `View profile for ${agent.name}` : undefined}
                          >
                            <AgentAvatar
                              name={agent.name}
                              avatar={agent.avatar}
                              id={agent.agentId || agent.id}
                              isMaster={false}
                              className="w-8 h-8 border border-[#141414] shrink-0"
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-bold text-xs uppercase truncate text-[#141414] group-hover:underline">
                                {agent.name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-[#141414]/60 truncate font-mono">
                                  @{agent.agentId ? agent.agentId.replace(/^@/, '') : agent.id}
                                </span>
                                {isAssigned ? (
                                  <span className="text-[8px] font-black uppercase px-1 py-0.2 bg-green-50 text-green-800 border border-green-600">
                                    Free Use (No HITL)
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-bold uppercase px-1 py-0.2 bg-neutral-100 text-neutral-500 border border-neutral-300">
                                    Requires Assign
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={`flex flex-col items-end shrink-0 gap-1.5 ${
                            Boolean(agent.expires_at && !isNaN(new Date(agent.expires_at).getTime()))
                              ? 'justify-between self-stretch'
                              : 'justify-center'
                          }`}>
                            {Boolean(agent.expires_at && !isNaN(new Date(agent.expires_at).getTime())) && (
                              <CappedBadge
                                expiresAt={agent.expires_at}
                                purchaseDate={agent.plan_created_at}
                                isCapped={agent.isCapped}
                                size="sm"
                              />
                            )}
                            {!isSlaveAccount ? (
                              <button
                                type="button"
                                onClick={() => handleToggleAssignment(currentTool.id, targetId, isAssigned, agent)}
                                disabled={isUpdating}
                                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border-2 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 ${
                                  isAssigned
                                    ? 'bg-[#141414] text-white border-[#141414] hover:bg-red-700 hover:border-red-700'
                                    : 'bg-white text-[#141414] border-[#141414] hover:bg-[#141414] hover:text-white'
                                }`}
                                title={isAssigned ? `Unassign tool from ${agent.name}` : `Assign tool to ${agent.name}`}
                              >
                                {isUpdating ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : isAssigned ? (
                                  'Unassign'
                                ) : (
                                  '+ Assign'
                                )}
                              </button>
                            ) : (
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 border ${
                                isAssigned ? 'bg-[#141414] text-white border-[#141414]' : 'bg-neutral-100 text-[#141414]/70 border-neutral-300'
                              }`}>
                                {isAssigned ? 'Assigned' : 'Unassigned'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="bg-[#E4E3E0] px-4 py-3 border-t-4 border-[#141414] flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="px-4 py-1.5 bg-white text-[#141414] border-2 border-[#141414] text-xs font-black uppercase hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
