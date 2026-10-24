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
  Play,
  Code,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Check,
  XCircle,
  Plus,
  Inbox
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
  invokeMcpToolApi,
  fetchServerGrantsApi,
  setToolGrantApi,
  fetchToolRequestsApi,
  approveToolRequestApi,
  rejectToolRequestApi
} from '../../services/floorApi';
import { AgentAvatar } from '../AgentAvatar';

interface IntegrationDetailsModalProps {
  isOpen: boolean;
  server: McpServer | null;
  tools: McpTool[];
  fleetAgents: FleetAgent[];
  onClose: () => void;
  onServerUpdated: (server: McpServer, tools: McpTool[]) => void;
  onServerDeleted: (serverId: string) => void;
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
  isSlaveAccount = false,
  onOpenAgentProfile
}) => {
  const [activeTab, setActiveTab] = useState<'tools' | 'assignment' | 'requests' | 'test'>('tools');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(tools[0]?.id || null);
  const [expandedSchemaToolId, setExpandedSchemaToolId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Grants state
  const [grants, setGrants] = useState<McpToolGrant[]>([]);
  const [isLoadingGrants, setIsLoadingGrants] = useState(false);
  const [selectedGrantToolId, setSelectedGrantToolId] = useState<string>(tools[0]?.id || '');
  const [selectedGrantAccountId, setSelectedGrantAccountId] = useState<string>(fleetAgents[0]?.agentId || '');
  const [isGrantingSubmitting, setIsGrantingSubmitting] = useState(false);
  const [revokingTarget, setRevokingTarget] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<McpToolRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [expandedReqArgsId, setExpandedReqArgsId] = useState<string | null>(null);

  // Test Execution State
  const [testArgsJson, setTestArgsJson] = useState('{}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [execError, setExecError] = useState<string | null>(null);

  useEffect(() => {
    if (tools.length > 0 && !selectedToolId) {
      setSelectedToolId(tools[0].id);
      setSelectedGrantToolId(tools[0].id);
    }
  }, [tools, selectedToolId]);

  useEffect(() => {
    if (fleetAgents.length > 0 && !selectedGrantAccountId) {
      setSelectedGrantAccountId(fleetAgents[0].agentId || fleetAgents[0].id);
    }
  }, [fleetAgents, selectedGrantAccountId]);

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

  const currentTool = tools.find((t) => t.id === selectedToolId) || tools[0];

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await reconnectMcpServerApi(server.id);
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

  const handleGrantAccess = async (toolId: string, accountId: string) => {
    if (!toolId || !accountId) return;
    setIsGrantingSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await setToolGrantApi(toolId, accountId, true);
      // Refresh grants
      await loadGrants();
      // Update tools state assigned_agents
      const updatedTools = tools.map((t) => {
        if (t.id !== toolId) return t;
        const currentAssigned = t.assigned_agents || [];
        const nextAssigned = Array.from(new Set([...currentAssigned, accountId]));
        return { ...t, assigned_agents: nextAssigned };
      });
      onServerUpdated(server, updatedTools);
      setActionSuccess(`Permanent tool access granted to ${accountId}!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to grant tool access.');
    } finally {
      setIsGrantingSubmitting(false);
    }
  };

  const handleRevokeGrant = async (toolId: string, accountId: string) => {
    const key = `${toolId}:${accountId}`;
    setRevokingTarget(key);
    setActionError(null);
    setActionSuccess(null);
    try {
      await setToolGrantApi(toolId, accountId, false);
      // Refresh grants
      await loadGrants();
      // Update local tools state
      const updatedTools = tools.map((t) => {
        if (t.id !== toolId) return t;
        const currentAssigned = t.assigned_agents || [];
        const nextAssigned = currentAssigned.filter((a) => a !== accountId);
        return { ...t, assigned_agents: nextAssigned };
      });
      onServerUpdated(server, updatedTools);
      setActionSuccess(`Tool access revoked from ${accountId}. Subsequent calls will be denied.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to revoke tool grant.');
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
        const updatedTools = tools.map((t) => {
          if (t.id !== res.grant.tool_id) return t;
          const nextAssigned = Array.from(new Set([...(t.assigned_agents || []), res.grant.account_id]));
          return { ...t, assigned_agents: nextAssigned };
        });
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

  const handleExecuteTest = async () => {
    if (!currentTool) return;
    setIsExecuting(true);
    setExecResult(null);
    setExecError(null);

    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(testArgsJson);
    } catch {
      setExecError('Malformed JSON arguments. Please provide valid JSON object.');
      setIsExecuting(false);
      return;
    }

    try {
      const result = await invokeMcpToolApi(currentTool.id, parsedArgs);
      setExecResult(result);
    } catch (err: any) {
      setExecError(err?.message || 'Tool execution invocation failed.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  return (
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#141414]/60 uppercase">ENDPOINT:</span>
              <code className="text-[10px] font-bold truncate max-w-md bg-white px-1.5 py-0.5 border border-[#141414]/20">
                {server.endpoint}
              </code>
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
            <span>Discovered Tools ({tools.length})</span>
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
            <ShieldCheck className="w-3.5 h-3.5" />
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

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'test'
                ? 'bg-white text-[#141414] border-r-2 border-l-2 border-[#141414] -mb-[2px] pb-[10px]'
                : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test Sandbox</span>
          </button>
        </div>

        {/* Tab 1: Tools & Schema Inspection */}
        {activeTab === 'tools' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tools.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#141414]/20 bg-[#FAF9F5]">
                <Wrench className="w-8 h-8 text-[#141414]/30 mx-auto mb-2" />
                <p className="text-xs font-bold uppercase">No tools discovered from this server.</p>
                <p className="text-[10px] text-[#141414]/60 mt-1 font-sans">
                  The MCP server connected successfully but exposed zero tools in its <code className="bg-white px-1">tools/list</code> response.
                </p>
              </div>
            ) : (
              tools.map((tool) => {
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

        {/* Tab 2: Access & Governance (Persistent Grants Management) */}
        {activeTab === 'assignment' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Persistent Account-Level Tool Authorization Matrix
              </span>
              <p className="text-[10px] text-[#141414]/70 font-sans leading-relaxed">
                Tools are closed by default. Authorized accounts can invoke tools repeatedly without prompt. Grants persist indefinitely until explicitly revoked manually. Revocation denies subsequent calls immediately.
              </p>
            </div>

            {/* Quick Grant Panel */}
            {!isSlaveAccount && tools.length > 0 && fleetAgents.length > 0 && (
              <div className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3">
                <div className="flex items-center justify-between border-b border-[#141414]/15 pb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Grant Permanent Access
                  </span>
                  <span className="text-[9px] text-neutral-500 font-bold uppercase">
                    Account-Specific Authorization
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-[#141414]/70 mb-1">
                      1. Select Discovered Tool
                    </label>
                    <select
                      value={selectedGrantToolId}
                      onChange={(e) => setSelectedGrantToolId(e.target.value)}
                      className="w-full bg-white border-2 border-[#141414] p-1.5 text-xs font-mono font-bold focus:outline-hidden"
                    >
                      {tools.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase text-[#141414]/70 mb-1">
                      2. Select Target Account
                    </label>
                    <select
                      value={selectedGrantAccountId}
                      onChange={(e) => setSelectedGrantAccountId(e.target.value)}
                      className="w-full bg-white border-2 border-[#141414] p-1.5 text-xs font-mono font-bold focus:outline-hidden"
                    >
                      {fleetAgents.map((a) => (
                        <option key={a.id} value={a.agentId || a.id}>
                          {a.name} (@{a.agentId?.replace(/^@/, '') || a.id}) {a.isMaster ? '[Master]' : '[Slave]'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleGrantAccess(selectedGrantToolId, selectedGrantAccountId)}
                    disabled={isGrantingSubmitting || !selectedGrantToolId || !selectedGrantAccountId}
                    className="w-full py-2 px-3 bg-[#141414] text-white hover:bg-black border-2 border-[#141414] text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    {isGrantingSubmitting ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Authorize Account</span>
                  </button>
                </div>
              </div>
            )}

            {/* Matrix of Tools & Granted Accounts */}
            {tools.length === 0 ? (
              <p className="text-xs text-[#141414]/60 italic py-4">No tools available to govern.</p>
            ) : (
              <div className="space-y-4">
                {tools.map((tool) => {
                  const assignedAgentsList = tool.assigned_agents || [];
                  const activeGrantsForTool = grants.filter(
                    (g) => g.tool_id === tool.id && g.status === 'active'
                  );
                  // Accounts that have access
                  const grantedAccounts = fleetAgents.filter((agent) => {
                    const matchId = agent.agentId || agent.id;
                    const byAssigned = assignedAgentsList.includes(matchId) || assignedAgentsList.includes(agent.id);
                    const byGrant = activeGrantsForTool.some((g) => g.account_id === matchId || g.account_id === agent.id);
                    return byAssigned || byGrant;
                  });

                  // Accounts without access
                  const ungrantedAccounts = fleetAgents.filter(
                    (agent) => !grantedAccounts.some((g) => g.id === agent.id)
                  );

                  return (
                    <div key={tool.id} className="p-3 bg-white border-2 border-[#141414] space-y-3 text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#141414]/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-3.5 h-3.5" />
                          <span className="text-xs font-black uppercase">{tool.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-[#141414]/70 uppercase">
                          {grantedAccounts.length} Account{grantedAccounts.length === 1 ? '' : 's'} Granted Permanent Access
                        </span>
                      </div>

                      {/* Currently Authorized Accounts */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-[#141414]/60 uppercase block">
                          Authorized Accounts (Indefinite Permanent Grants):
                        </span>
                        {grantedAccounts.length === 0 ? (
                          <div className="p-3 border border-dashed border-[#141414]/20 bg-[#FAF9F5] text-center">
                            <p className="text-[10px] font-bold text-[#141414]/50 uppercase">
                              No accounts authorized yet. All calls to '{tool.name}' will be blocked and recorded in Requests.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {grantedAccounts.map((agent) => {
                              const targetId = agent.agentId || agent.id;
                              const isRevoking = revokingTarget === `${tool.id}:${targetId}`;

                              return (
                                <div
                                  key={agent.id}
                                  className="p-2.5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between gap-2.5"
                                >
                                  <div
                                    className={`flex items-center gap-2 min-w-0 flex-1 ${
                                      onOpenAgentProfile ? 'cursor-pointer group' : ''
                                    }`}
                                    onClick={() => onOpenAgentProfile?.(agent.name, agent.avatar, agent.agentId)}
                                    title={onOpenAgentProfile ? `View profile for ${agent.name}` : undefined}
                                  >
                                    <AgentAvatar
                                      id={agent.agentId || agent.id}
                                      name={agent.name}
                                      avatar={agent.avatar}
                                      isMaster={agent.isMaster}
                                      className="w-7 h-7 rounded-full border border-[#141414] shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold truncate text-[#141414]">
                                          {agent.name}
                                        </span>
                                        <span className="text-[8px] bg-green-100 text-green-900 border border-green-600 px-1 font-bold uppercase">
                                          Active
                                        </span>
                                      </div>
                                      <span className="text-[8.5px] text-[#141414]/60 font-mono block truncate">
                                        @{agent.agentId ? agent.agentId.replace(/^@/, '') : agent.id}
                                      </span>
                                    </div>
                                  </div>

                                  {!isSlaveAccount && (
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeGrant(tool.id, targetId)}
                                      disabled={isRevoking}
                                      className="px-2 py-1 bg-red-600 text-white hover:bg-red-700 text-[9px] font-black uppercase tracking-wider border border-[#141414] transition-all shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                      title="Revoke grant and immediately deny calls"
                                    >
                                      {isRevoking ? (
                                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      ) : (
                                        <XCircle className="w-2.5 h-2.5" />
                                      )}
                                      <span>Revoke</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Ungranted Accounts Quick Delegation */}
                      {!isSlaveAccount && ungrantedAccounts.length > 0 && (
                        <div className="pt-2 border-t border-neutral-200 space-y-1.5">
                          <span className="text-[9px] font-bold text-[#141414]/50 uppercase block">
                            Delegate Access To Other Fleet Nodes:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {ungrantedAccounts.map((agent) => {
                              const targetId = agent.agentId || agent.id;
                              return (
                                <button
                                  key={agent.id}
                                  type="button"
                                  onClick={() => handleGrantAccess(tool.id, targetId)}
                                  className="px-2 py-0.5 bg-[#FAF9F5] hover:bg-neutral-100 border border-[#141414] text-[9px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-all"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>{agent.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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

        {/* Tab 4: Interactive Tool Execution Sandbox */}
        {activeTab === 'test' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Interactive Tool Execution Sandbox
              </span>
              <p className="text-[10px] text-[#141414]/70 font-sans leading-relaxed">
                Test calling this integration directly through AAMARVA's execution gateway to verify protocol response format and live connectivity.
              </p>
            </div>

            {tools.length === 0 ? (
              <p className="text-xs text-[#141414]/60 italic py-4">No tools available to test.</p>
            ) : (
              <div className="space-y-3">
                {/* Select tool to test */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                    Select Tool to Test
                  </label>
                  <select
                    value={selectedToolId || ''}
                    onChange={(e) => {
                      setSelectedToolId(e.target.value);
                      setExecResult(null);
                      setExecError(null);
                    }}
                    className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono font-bold focus:outline-hidden"
                  >
                    {tools.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.description?.slice(0, 50) || 'no description'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Input arguments JSON */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                    Input Arguments (JSON Object)
                  </label>
                  <textarea
                    rows={4}
                    value={testArgsJson}
                    onChange={(e) => setTestArgsJson(e.target.value)}
                    placeholder='{"query": "test query", "limit": 5}'
                    className="w-full bg-black text-green-400 border-2 border-[#141414] p-2.5 text-xs font-mono leading-normal focus:outline-hidden"
                  />
                </div>

                {/* Submit test button */}
                <button
                  type="button"
                  onClick={handleExecuteTest}
                  disabled={isExecuting || !currentTool}
                  className="px-4 py-2 bg-[#141414] text-white hover:bg-black text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isExecuting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-white animate-pulse" />
                      </div>
                      <span>Invoking Remote Tool...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Execute Tool Call</span>
                    </>
                  )}
                </button>

                {/* Execution Output */}
                {execError && (
                  <div className="p-3 bg-red-50 border-2 border-red-600 text-red-700 text-xs font-mono font-bold">
                    Invocation Error: {execError}
                  </div>
                )}

                {execResult && (
                  <div className="p-3 bg-black text-white border-2 border-[#141414] space-y-1.5">
                    <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      Execution Result (JSON-RPC)
                    </span>
                    <pre className="text-[10px] font-mono text-white/90 overflow-x-auto p-2 bg-neutral-900 border border-white/10 max-h-56">
                      {JSON.stringify(execResult, null, 2)}
                    </pre>
                  </div>
                )}
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
  );
};
