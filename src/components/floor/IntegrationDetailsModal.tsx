import React, { useState } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import {
  McpServer,
  McpTool,
  FleetAgent,
  reconnectMcpServerApi,
  deleteMcpServerApi,
  setToolAssignmentApi,
  invokeMcpToolApi
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
  const [activeTab, setActiveTab] = useState<'tools' | 'assignment' | 'test'>('tools');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(tools[0]?.id || null);
  const [expandedSchemaToolId, setExpandedSchemaToolId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Test Execution State
  const [testArgsJson, setTestArgsJson] = useState('{}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [execError, setExecError] = useState<string | null>(null);

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

  const handleToggleAssignment = async (toolId: string, agentId: string, currentGranted: boolean) => {
    setActionError(null);
    try {
      const newGranted = !currentGranted;
      await setToolAssignmentApi(toolId, agentId, newGranted);

      // Update local tools state
      const updatedTools = tools.map((t) => {
        if (t.id !== toolId) return t;
        const currentAssigned = t.assigned_agents || [];
        const nextAssigned = newGranted
          ? Array.from(new Set([...currentAssigned, agentId]))
          : currentAssigned.filter((a) => a !== agentId);
        return { ...t, assigned_agents: nextAssigned };
      });

      onServerUpdated(server, updatedTools);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update assignment.');
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
                className="px-2.5 py-1 bg-white text-[#141414] hover:bg-neutral-100 border border-[#141414] text-[10px] font-bold uppercase transition-all flex items-center gap-1.5"
                title="Re-verify connection & sync tool definitions"
              >
                <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>Re-Sync</span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2.5 py-1 bg-red-600 text-white hover:bg-red-700 border border-red-700 text-[10px] font-bold uppercase transition-all flex items-center gap-1.5"
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
        <div className="flex items-center border-b-2 border-[#141414] bg-neutral-100 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
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
            onClick={() => setActiveTab('assignment')}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
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
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'bg-white text-[#141414] border-r-2 border-l-2 border-[#141414] -mb-[2px] pb-[10px]'
                : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Requests</span>
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
                          {assignedCount > 0 ? `${assignedCount} Agents Authorized` : 'Unassigned (Restricted)'}
                        </span>

                        <button
                          type="button"
                          onClick={() => setExpandedSchemaToolId(isSchemaExpanded ? null : tool.id)}
                          className="px-2 py-0.5 bg-[#FAF9F5] border border-[#141414] text-[10px] font-bold uppercase hover:bg-neutral-100 transition-all flex items-center gap-1"
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

        {/* Tab 2: Access & Governance (Assigning to Fleet Slave Agents) */}
        {activeTab === 'assignment' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Server-Enforced Agent Authorization Matrix
              </span>
              <p className="text-[10px] text-[#141414]/70 font-sans leading-relaxed">
                Tools are closed by default. Fleet agents cannot execute a tool unless explicitly authorized in this matrix. Revoking permissions takes effect immediately on the backend proxy.
              </p>
              {!isSlaveAccount && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="mt-3 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 border-2 border-red-700 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disband Cluster</span>
                </button>
              )}
            </div>

            {tools.length === 0 ? (
              <p className="text-xs text-[#141414]/60 italic py-4">No tools available to assign.</p>
            ) : (
              <div className="space-y-4">
                {tools.map((tool) => {
                  const governableAgents = fleetAgents.filter((agent) => !agent.isMaster);

                  return (
                    <div key={tool.id} className="p-3 bg-white border-2 border-[#141414] space-y-3 text-left">
                      <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-3.5 h-3.5" />
                          <span className="text-xs font-black uppercase">{tool.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-[#141414]/60 uppercase">
                          Select accounts allowed to invoke this tool
                        </span>
                      </div>

                      {governableAgents.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-[#141414]/20 bg-[#FAF9F5]">
                          <p className="text-[11px] font-bold text-[#141414]/60 uppercase">
                            No fleet slave agents available to authorize.
                          </p>
                          <p className="text-[10px] text-[#141414]/40 mt-0.5 font-sans">
                            Deploy or register slave agents in your cluster to delegate tool invocation permissions.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {governableAgents.map((agent) => {
                            const isGranted = (tool.assigned_agents || []).includes(agent.agentId) ||
                                              (tool.assigned_agents || []).includes(agent.id);

                            return (
                              <div
                                key={agent.id}
                                className={`p-2.5 border-2 flex items-center justify-between gap-2.5 transition-all ${
                                  isGranted
                                    ? 'bg-white border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                    : 'bg-[#FAF9F5] border-neutral-300 opacity-80 hover:opacity-100'
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
                                    className="w-8 h-8 rounded-full border border-[#141414] shrink-0 group-hover:scale-105 transition-transform"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[11px] font-bold block truncate text-[#141414] group-hover:underline">
                                      {agent.name}
                                    </span>
                                    <span className="text-[9px] text-[#141414]/60 font-mono block truncate">
                                      @{agent.agentId ? agent.agentId.replace(/^@/, '') : agent.id}
                                    </span>
                                  </div>
                                </div>

                                {!isSlaveAccount ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleAssignment(tool.id, agent.agentId, isGranted);
                                    }}
                                    className={`px-2.5 py-1 text-[10px] font-black uppercase border transition-all shrink-0 cursor-pointer ${
                                      isGranted
                                        ? 'bg-[#141414] text-white border-[#141414] hover:bg-neutral-800'
                                        : 'bg-white text-[#141414] border-[#141414] hover:bg-neutral-100'
                                    }`}
                                  >
                                    {isGranted ? 'Granted' : 'Grant Access'}
                                  </button>
                                ) : (
                                  <span
                                    className={`text-[9px] font-bold uppercase shrink-0 px-2 py-0.5 border ${
                                      isGranted
                                        ? 'bg-[#141414] text-white border-[#141414]'
                                        : 'bg-neutral-100 text-[#141414]/60 border-neutral-300'
                                    }`}
                                  >
                                    {isGranted ? 'Authorized' : 'Denied'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Interactive Tool Execution Sandbox */}
        {activeTab === 'test' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Requests
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
