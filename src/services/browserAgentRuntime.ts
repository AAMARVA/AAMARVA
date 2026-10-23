import * as webllm from '@mlc-ai/web-llm';
import { apiFetch } from './authApi';
import { invokeMcpToolApi, McpTool } from './floorApi';
import {
  FrameworkType,
  FrameworkExecutionResult,
  FrameworkExecutionTraceStep,
  getFrameworkAdapter
} from './frameworkAdapters';

export type { FrameworkType, FrameworkExecutionResult, FrameworkExecutionTraceStep };

export interface ModelEvaluationCandidate {
  id: string;
  name: string;
  parameterSize: string;
  quantization: string;
  downloadSize: string;
  vramRequiredMB: number;
  webgpuSupported: boolean;
  toolCallingReliability: 'High' | 'Medium' | 'Low';
  license: string;
  description: string;
  mlcModelId: string;
}

export interface FrameworkEvaluationCandidate {
  id: FrameworkType;
  name: string;
  browserCompatibility: 'Full' | 'Partial' | 'Server-Required';
  dependencyWeight: 'Light' | 'Moderate' | 'Heavy';
  toolSupport: boolean;
  localPrivacy: boolean;
  evaluationType: 'Integrated / Verified in Browser (Active Adapter)' | 'Architectural / Documentation Assessment (Not Tested in Browser)';
  notes: string;
  adapterStatus: 'Active & Verified' | 'Experimental';
}

export const FRAMEWORK_EVALUATIONS: FrameworkEvaluationCandidate[] = [
  {
    id: 'webllm-native',
    name: 'Native WebLLM ReAct',
    browserCompatibility: 'Full',
    dependencyWeight: 'Light',
    toolSupport: true,
    localPrivacy: true,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'Direct client-side WebGPU execution with zero intermediary overhead. Native OpenAI-compatible tool call protocol with strict snake_case tool_call_id.'
  },
  {
    id: 'vercel-ai-sdk',
    name: 'Vercel AI SDK',
    browserCompatibility: 'Full',
    dependencyWeight: 'Light',
    toolSupport: true,
    localPrivacy: true,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'Lightweight client footprint with multi-step generateText loop, structured tool schemas, and streaming step trace telemetry.'
  },
  {
    id: 'langchain',
    name: 'LangChain.js',
    browserCompatibility: 'Partial',
    dependencyWeight: 'Heavy',
    toolSupport: true,
    localPrivacy: true,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'LangChain.js AgentExecutor pattern with DynamicStructuredTools and conversational scratchpad memory for multi-round tool routing.'
  },
  {
    id: 'langgraph',
    name: 'LangGraph.js',
    browserCompatibility: 'Partial',
    dependencyWeight: 'Heavy',
    toolSupport: true,
    localPrivacy: true,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'Cyclic StateGraph orchestration (START -> agent_node -> tools_condition -> tool_node -> agent_node -> END) with node-level checkpoints.'
  },
  {
    id: 'mastra',
    name: 'Mastra',
    browserCompatibility: 'Server-Required',
    dependencyWeight: 'Heavy',
    toolSupport: true,
    localPrivacy: false,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'Mastra Agent & Workflow Step pattern client runner with structured tool schemas and workflow telemetry.'
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex.TS',
    browserCompatibility: 'Partial',
    dependencyWeight: 'Moderate',
    toolSupport: true,
    localPrivacy: true,
    evaluationType: 'Integrated / Verified in Browser (Active Adapter)',
    adapterStatus: 'Active & Verified',
    notes: 'LlamaIndex ReAct agent pipeline executing multi-step Thought-Action-Observation loops and tool dispatch directly in browser.'
  }
];

export const MODEL_EVALUATIONS: ModelEvaluationCandidate[] = [
  {
    id: 'smollm2-360m',
    name: 'SmolLM2-360M-Instruct',
    parameterSize: '360M',
    quantization: 'q4f16_1',
    downloadSize: '~230 MB',
    vramRequiredMB: 376.06,
    webgpuSupported: true,
    toolCallingReliability: 'Medium',
    license: 'Apache 2.0',
    description: 'Extremely compact model with minimal VRAM requirement. Verified in WebLLM 0.2.86 prebuiltAppConfig with active WASM binary.',
    mlcModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC'
  },
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen2.5-0.5B-Instruct',
    parameterSize: '0.5B',
    quantization: 'q4f16_1',
    downloadSize: '~390 MB',
    vramRequiredMB: 944.62,
    webgpuSupported: true,
    toolCallingReliability: 'High',
    license: 'Apache 2.0',
    description: 'Outstanding small instruction model. Reliable structured JSON formatting, strong multilingual support, and consistent tool-calling discipline.',
    mlcModelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B Instruct',
    parameterSize: '1.0B',
    quantization: 'q4f16_1',
    downloadSize: '~880 MB',
    vramRequiredMB: 879.04,
    webgpuSupported: true,
    toolCallingReliability: 'High',
    license: 'Llama 3.2 Community License',
    description: 'High-quality 1B parameter reasoning model with native tool-calling capabilities and strong instruction following.',
    mlcModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5-1.5B-Instruct',
    parameterSize: '1.5B',
    quantization: 'q4f16_1',
    downloadSize: '~1.15 GB',
    vramRequiredMB: 1629.75,
    webgpuSupported: true,
    toolCallingReliability: 'High',
    license: 'Apache 2.0',
    description: 'Larger capacity model with multi-step reasoning capabilities. Requires higher VRAM, suited for modern desktop GPUs.',
    mlcModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
  },
  {
    id: 'gemma-3-1b',
    name: 'Gemma 3 1B IT',
    parameterSize: '1.0B',
    quantization: 'q4f16_1',
    downloadSize: '~720 MB',
    vramRequiredMB: 711.07,
    webgpuSupported: true,
    toolCallingReliability: 'High',
    license: 'Gemma Terms of Use',
    description: 'Official Google Gemma 3 1B instruction-tuned model. Verified in WebLLM 0.2.86 prebuiltAppConfig with active WASM binary.',
    mlcModelId: 'gemma3-1b-it-q4f16_1-MLC'
  }
];

export interface BrowserAgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  toolCallId?: string;
  tool_calls?: any[];
}

export interface BrowserAgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  source: 'FLOOR_MCP' | 'SYSTEM_VERIFIED';
  floorToolId?: string;
  execute: (args: any) => Promise<any>;
}

export interface FloorSyncStatus {
  status: 'synced' | 'no_tools_assigned' | 'failed';
  assignedCount: number;
  error?: string;
  lastChecked: string;
}

const MAX_TOOL_ROUNDS = 5;

export class BrowserAgentRuntimeEngine {
  private engine: webllm.MLCEngine | null = null;
  private currentModelId: string = '';
  private activeInitPromise: Promise<webllm.MLCEngine> | null = null;
  private initializingModelId: string = '';
  private listeners: ((progress: webllm.InitProgressReport) => void)[] = [];
  
  private createEngineFn = webllm.CreateMLCEngine;
  private activeFramework: FrameworkType = 'webllm-native';
  private lastExecutionResult: FrameworkExecutionResult | null = null;
  
  // Available tools mapped to actual AAMARVA FLOOR/MCP capabilities and verified endpoints
  private tools: Map<string, BrowserAgentTool> = new Map();
  private floorSyncStatus: FloorSyncStatus = {
    status: 'no_tools_assigned',
    assignedCount: 0,
    lastChecked: new Date().toISOString()
  };

  constructor() {
    this.registerSystemVerifiedTools();
  }

  public setActiveFramework(framework: FrameworkType): void {
    this.activeFramework = framework;
  }

  public getActiveFramework(): FrameworkType {
    return this.activeFramework;
  }

  public getLastExecutionResult(): FrameworkExecutionResult | null {
    return this.lastExecutionResult;
  }

  /**
   * Register verified platform tools with real endpoint routing and NO simulated data fallbacks.
   */
  private registerSystemVerifiedTools() {
    // 1. Telemetry Activity from real endpoint /api/telemetry/activity
    this.tools.set('get_telemetry_activity', {
      name: 'get_telemetry_activity',
      description: 'Retrieve live AAMARVA fleet activity telemetry and cluster performance metrics.',
      parameters: {
        type: 'object',
        properties: {},
      },
      source: 'SYSTEM_VERIFIED',
      execute: async () => {
        try {
          const res = await apiFetch('/api/telemetry/activity', { authType: 'human' });
          if (!res?.success) {
            return { error: res?.error?.message || 'Failed to retrieve telemetry activity from server.' };
          }
          return res.data;
        } catch (err: any) {
          return { error: `Network error retrieving telemetry: ${err?.message || 'Request failed'}` };
        }
      }
    });

    // 2. Multi-Agent Clusters from real endpoint /api/clusters
    this.tools.set('list_clusters', {
      name: 'list_clusters',
      description: 'List active multi-agent clusters and cryptographic communication groups on the network.',
      parameters: {
        type: 'object',
        properties: {},
      },
      source: 'SYSTEM_VERIFIED',
      execute: async () => {
        try {
          const res = await apiFetch('/api/clusters', { authType: 'human' });
          if (!res?.success) {
            return { error: res?.error?.message || 'Failed to retrieve clusters from server.' };
          }
          return res.data;
        } catch (err: any) {
          return { error: `Network error retrieving clusters: ${err?.message || 'Request failed'}` };
        }
      }
    });

    // 3. Fleet Agents from real endpoint /api/floor/fleet-agents
    this.tools.set('get_fleet_agents', {
      name: 'get_fleet_agents',
      description: 'Retrieve registered operator fleet accounts and agent node identities.',
      parameters: {
        type: 'object',
        properties: {},
      },
      source: 'SYSTEM_VERIFIED',
      execute: async () => {
        try {
          const res = await apiFetch('/api/floor/fleet-agents', { authType: 'human' });
          if (!res?.success) {
            return { error: res?.error?.message || 'Failed to retrieve fleet agents from server.' };
          }
          return res.data;
        } catch (err: any) {
          return { error: `Network error retrieving fleet agents: ${err?.message || 'Request failed'}` };
        }
      }
    });

    // 4. Search Network Agents from real endpoint /api/agents
    this.tools.set('search_network_agents', {
      name: 'search_network_agents',
      description: 'Search public agent nodes and network identities by name or keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword or agent name' }
        },
        required: ['query']
      },
      source: 'SYSTEM_VERIFIED',
      execute: async (args: { query: string }) => {
        if (!args?.query || typeof args.query !== 'string') {
          return { error: 'Search query parameter is required.' };
        }
        try {
          const res = await apiFetch(`/api/agents?q=${encodeURIComponent(args.query.trim())}&limit=10`, { authType: 'human' });
          if (!res?.success) {
            return { error: res?.error?.message || 'Failed to search network agents.' };
          }
          return res.data;
        } catch (err: any) {
          return { error: `Network error searching agents: ${err?.message || 'Request failed'}` };
        }
      }
    });
  }

  /**
   * Synchronize explicitly authorized FLOOR MCP tools assigned to the calling agent.
   * Strictly distinguishes "no assigned tools" from "failed to load assignments".
   * Never silently treats unassigned server tools as assigned.
   * Detects normalized name collisions and disambiguates deterministically without overwriting.
   */
  public async syncFloorTools(): Promise<{
    status: 'synced' | 'no_tools_assigned' | 'failed';
    assignedCount: number;
    error?: string;
    tools: BrowserAgentTool[];
  }> {
    // Clear any previously registered dynamic FLOOR tools
    for (const [key, tool] of Array.from(this.tools.entries())) {
      if (tool.source === 'FLOOR_MCP') {
        this.tools.delete(key);
      }
    }

    try {
      const agentToolsRes = await apiFetch('/api/floor/agent/tools', { authType: 'human' });

      if (agentToolsRes?.success) {
        const assignedTools: McpTool[] = Array.isArray(agentToolsRes.data) ? agentToolsRes.data : [];
        let registeredCount = 0;

        for (const t of assignedTools) {
          if (!t.is_enabled) continue;
          let sanitizedName = t.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

          // Collision detection & disambiguation:
          // If another tool (system or MCP) already registered with sanitizedName:
          if (this.tools.has(sanitizedName)) {
            const existing = this.tools.get(sanitizedName)!;
            console.warn(
              `[FLOOR Tool Collision Detected] Tool '${t.name}' (ID: ${t.id}) collided with existing tool '${existing.name}'. Disambiguating key.`
            );
            // Append deterministic suffix derived from tool ID to prevent overwriting
            sanitizedName = `${sanitizedName}_${t.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase()}`;
          }

          this.tools.set(sanitizedName, {
            name: sanitizedName,
            description: `[FLOOR MCP: ${t.name}] ${t.description || 'Assigned tool on the FLOOR'}`,
            parameters: t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : { type: 'object', properties: {} },
            source: 'FLOOR_MCP',
            floorToolId: t.id,
            execute: async (args: Record<string, any>) => {
              try {
                const res = await invokeMcpToolApi(t.id, args);
                if (res && typeof res === 'object' && res.status === 'pending') {
                  return {
                    status: 'HITL_APPROVAL_REQUIRED',
                    invocationId: res.invocationId,
                    message: 'This tool invocation requires operator approval on the FLOOR tab before execution can proceed.'
                  };
                }
                return res;
              } catch (err: any) {
                return { error: `FLOOR MCP Execution Failed: ${err?.message || 'Invocation error'}` };
              }
            }
          });
          registeredCount++;
        }

        this.floorSyncStatus = {
          status: registeredCount > 0 ? 'synced' : 'no_tools_assigned',
          assignedCount: registeredCount,
          lastChecked: new Date().toISOString()
        };
      } else {
        // Failed to load assignments from server
        this.floorSyncStatus = {
          status: 'failed',
          assignedCount: 0,
          error: agentToolsRes?.error?.message || 'Failed to retrieve agent tool assignments from FLOOR.',
          lastChecked: new Date().toISOString()
        };
      }
    } catch (err: any) {
      // Network error or offline
      this.floorSyncStatus = {
        status: 'failed',
        assignedCount: 0,
        error: err?.message || 'Network error connecting to FLOOR agent tools endpoint.',
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: this.floorSyncStatus.status,
      assignedCount: this.floorSyncStatus.assignedCount,
      error: this.floorSyncStatus.error,
      tools: Array.from(this.tools.values())
    };
  }

  public getFloorSyncStatus(): FloorSyncStatus {
    return { ...this.floorSyncStatus };
  }

  public addProgressListener(listener: (progress: webllm.InitProgressReport) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyProgress(report: webllm.InitProgressReport) {
    this.listeners.forEach(l => l(report));
  }

  /**
   * Explicitly unload the current model engine to release WebGPU memory.
   */
  public async unloadCurrentEngine(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (err) {
        console.warn('Error unloading previous WebLLM engine:', err);
      }
      this.engine = null;
      this.currentModelId = '';
    }
  }

  /**
   * Serialized model initialization:
   * Concurrent requests for the same model share the exact same active promise.
   * Requests for a different model wait for any in-flight initialization to settle,
   * safely unload the previous engine, and initialize the requested model sequentially.
   */
  public async initializeModel(mlcModelId: string): Promise<webllm.MLCEngine> {
    // 1. If engine is already initialized for this model, return it immediately
    if (this.engine && this.currentModelId === mlcModelId) {
      return this.engine;
    }

    // 2. If an initialization is already in flight:
    if (this.activeInitPromise) {
      if (this.initializingModelId === mlcModelId) {
        return await this.activeInitPromise;
      }
      // Wait for in-flight init to settle before switching models
      try {
        await this.activeInitPromise;
      } catch {
        // previous init failure ignored for new model attempt
      }
      if (this.engine && this.currentModelId === mlcModelId) {
        return this.engine;
      }
    }

    // 3. Start serialized initialization
    this.initializingModelId = mlcModelId;
    this.activeInitPromise = (async () => {
      try {
        // If an existing engine is loaded for a different model, unload it first
        if (this.engine && this.currentModelId !== mlcModelId) {
          await this.unloadCurrentEngine();
        }

        // Sync latest configured FLOOR tools before model starts
        await this.syncFloorTools();

        const engine = await this.createEngineFn(mlcModelId, {
          initProgressCallback: (report) => {
            this.notifyProgress(report);
          }
        });

        this.engine = engine;
        this.currentModelId = mlcModelId;
        return engine;
      } finally {
        this.activeInitPromise = null;
        this.initializingModelId = '';
      }
    })();

    return await this.activeInitPromise;
  }

  public setEngineCreator(fn: (modelId: string, opts?: any) => Promise<any>) {
    this.createEngineFn = fn as any;
  }

  public getModelId() {
    return this.currentModelId;
  }

  public isReady() {
    return this.engine !== null;
  }

  public getRegisteredTools(): Array<{ type: 'function'; function: any }> {
    return Array.from(this.tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  public getRegisteredToolEntities(): BrowserAgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Helper method for testing tool dispatch directly.
   */
  public async testInvokeRegisteredTool(toolName: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { error: `Tool '${toolName}' is not registered or authorized on the FLOOR.` };
    }
    return await tool.execute(args);
  }

  /**
   * Execute an agent turn using the configured or specified framework adapter with full trace telemetry.
   */
  public async executeAgentTurnWithTrace(
    messages: BrowserAgentMessage[],
    modelId: string,
    framework?: FrameworkType,
    onStream?: (chunk: string) => void,
    onStep?: (step: FrameworkExecutionTraceStep) => void
  ): Promise<FrameworkExecutionResult> {
    const chosenFramework = framework || this.activeFramework;
    const adapter = getFrameworkAdapter(chosenFramework);
    const engine = await this.initializeModel(modelId);
    const tools = Array.from(this.tools.values());

    const result = await adapter.execute({
      messages,
      modelId,
      tools,
      engine,
      maxRounds: MAX_TOOL_ROUNDS,
      onStream,
      onStep
    });

    this.lastExecutionResult = result;
    return result;
  }

  /**
   * Execute an agent reasoning and tool-calling turn with explicit recursion limit protection
   * and compliant OpenAI / WebLLM tool message schema (`tool_call_id`).
   * Routes through the active framework adapter.
   */
  public async executeAgentTurn(
    messages: BrowserAgentMessage[],
    modelId: string,
    onStream?: (text: string) => void,
    round: number = 0
  ): Promise<string> {
    const res = await this.executeAgentTurnWithTrace(
      messages,
      modelId,
      this.activeFramework,
      onStream
    );
    return res.finalText;
  }
}

export const browserAgentRuntime = new BrowserAgentRuntimeEngine();
