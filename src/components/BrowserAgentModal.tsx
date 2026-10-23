import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Terminal, 
  ShieldCheck, 
  CheckCircle2, 
  Download, 
  Layers, 
  X, 
  Bot,
  RotateCw,
  Wrench,
  AlertTriangle,
  Radio,
  Play,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';
import { 
  browserAgentRuntime, 
  MODEL_EVALUATIONS, 
  FRAMEWORK_EVALUATIONS, 
  BrowserAgentMessage,
  BrowserAgentTool,
  FloorSyncStatus,
  FrameworkType,
  FrameworkExecutionTraceStep
} from '../services/browserAgentRuntime';

interface BrowserAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserAgentModal: React.FC<BrowserAgentModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'tools' | 'models' | 'frameworks'>('chat');
  const [selectedModelId, setSelectedModelId] = useState(MODEL_EVALUATIONS[0].mlcModelId);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkType>(() => browserAgentRuntime.getActiveFramework());
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [modelLoaded, setModelLoaded] = useState<boolean>(browserAgentRuntime.isReady());
  const [isSyncingTools, setIsSyncingTools] = useState<boolean>(false);
  const [availableTools, setAvailableTools] = useState<BrowserAgentTool[]>(() => browserAgentRuntime.getRegisteredToolEntities());
  const [syncStatus, setSyncStatus] = useState<FloorSyncStatus>(() => browserAgentRuntime.getFloorSyncStatus());

  const [messages, setMessages] = useState<BrowserAgentMessage[]>([
    {
      role: 'system',
      content: 'You are an autonomous local AAMARVA browser agent running entirely on-device via WebGPU. You have direct access to approved FLOOR MCP tools and verified system introspection tools. Execute tasks locally while keeping private user data secure.'
    },
    {
      role: 'assistant',
      content: 'Local browser agent initialized with modular framework adapters. Select your model and agent framework, load weights, and issue instructions.'
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionTrace, setExecutionTrace] = useState<FrameworkExecutionTraceStep[]>([]);
  const [showTracePanel, setShowTracePanel] = useState<boolean>(true);
  const [runningFrameworkTest, setRunningFrameworkTest] = useState<string | null>(null);
  const [frameworkTestResults, setFrameworkTestResults] = useState<Record<string, { status: 'passed' | 'failed'; message: string; traceCount: number }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = browserAgentRuntime.addProgressListener((report) => {
      setLoadingProgress(report.text);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      handleSyncTools();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isExecuting]);

  if (!isOpen) return null;

  const handleSyncTools = async () => {
    setIsSyncingTools(true);
    try {
      const res = await browserAgentRuntime.syncFloorTools();
      setAvailableTools(res.tools);
      setSyncStatus(browserAgentRuntime.getFloorSyncStatus());
    } finally {
      setIsSyncingTools(false);
    }
  };

  const handleLoadModel = async () => {
    setIsLoadingModel(true);
    setLoadingProgress('Initializing WebGPU and downloading model weights locally...');
    try {
      await browserAgentRuntime.initializeModel(selectedModelId);
      setModelLoaded(true);
      setLoadingProgress('Model loaded successfully into WebGPU!');
    } catch (err: any) {
      setLoadingProgress(`Failed to load model: ${err?.message || 'WebGPU or network error'}`);
      setModelLoaded(false);
    } finally {
      setIsLoadingModel(false);
    }
  };

  const handleUnloadModel = async () => {
    setIsLoadingModel(true);
    try {
      await browserAgentRuntime.unloadCurrentEngine();
      setModelLoaded(false);
      setLoadingProgress('Model unloaded from WebGPU memory.');
    } finally {
      setIsLoadingModel(false);
    }
  };

  const handleFrameworkChange = (fw: FrameworkType) => {
    setSelectedFramework(fw);
    browserAgentRuntime.setActiveFramework(fw);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isExecuting) return;

    if (!modelLoaded && !browserAgentRuntime.isReady()) {
      alert('Please load the local browser model first.');
      return;
    }

    const userText = inputPrompt.trim();
    setInputPrompt('');
    const newMessages: BrowserAgentMessage[] = [
      ...messages,
      { role: 'user', content: userText }
    ];
    setMessages(newMessages);
    setIsExecuting(true);
    setExecutionTrace([]);

    const liveTrace: FrameworkExecutionTraceStep[] = [];

    try {
      const result = await browserAgentRuntime.executeAgentTurnWithTrace(
        newMessages,
        selectedModelId,
        selectedFramework,
        undefined,
        (step) => {
          liveTrace.push(step);
          setExecutionTrace([...liveTrace]);
        }
      );
      setMessages([
        ...newMessages,
        { role: 'assistant', content: result.finalText }
      ]);
      setExecutionTrace(result.trace);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `Execution error: ${err?.message || 'Unknown runtime error'}` }
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTestFramework = async (frameworkId: FrameworkType) => {
    setRunningFrameworkTest(frameworkId);
    try {
      // Create a test mock engine or run against current engine
      const testMessages: BrowserAgentMessage[] = [
        { role: 'user', content: 'What is the current fleet telemetry activity status?' }
      ];
      
      const testResult = await browserAgentRuntime.executeAgentTurnWithTrace(
        testMessages,
        selectedModelId,
        frameworkId
      );

      setFrameworkTestResults(prev => ({
        ...prev,
        [frameworkId]: {
          status: 'passed',
          message: `Adapter executed ${testResult.trace.length} pipeline steps with ${testResult.toolsInvoked.length} tool calls. Result returned successfully.`,
          traceCount: testResult.trace.length
        }
      }));
    } catch (err: any) {
      setFrameworkTestResults(prev => ({
        ...prev,
        [frameworkId]: {
          status: 'failed',
          message: err?.message || 'Framework test execution failed.',
          traceCount: 0
        }
      }));
    } finally {
      setRunningFrameworkTest(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-[#141414]">
        
        {/* Header */}
        <div className="bg-[#141414] text-white px-6 py-4 flex items-center justify-between border-b-2 border-[#141414]">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-white animate-pulse" />
            <span className="font-mono text-xs sm:text-sm font-black uppercase tracking-widest">
              AAMARVA // BROWSER AGENT RUNTIME & MODEL EVALUATION
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 bg-[#E4E3E0] border-b-2 border-[#141414] gap-1 p-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`py-2 px-2 sm:px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5]'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Agent Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('tools')}
            className={`py-2 px-2 sm:px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'tools'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5]'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0" />
            <span>FLOOR Tools ({availableTools.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('models')}
            className={`py-2 px-2 sm:px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'models'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5]'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Open Models (5)</span>
          </button>

          <button
            onClick={() => setActiveTab('frameworks')}
            className={`py-2 px-2 sm:px-3 font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'frameworks'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                : 'bg-white text-[#141414] hover:bg-[#FAF9F5]'
            }`}
          >
            <Terminal className="w-4 h-4 shrink-0" />
            <span>Frameworks ({FRAMEWORK_EVALUATIONS.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-[#FAF9F5]">
          {activeTab === 'chat' && (
            <div className="space-y-4 h-full flex flex-col">
              
              {/* Architecture Scope Notice */}
              <div className="p-3 bg-white border-2 border-[#141414] text-[11px] font-mono flex items-start justify-between gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex items-start gap-2">
                  <Radio className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold uppercase tracking-wider text-[#141414]">
                      Execution Architecture & Privacy Boundaries:
                    </div>
                    <div className="text-[#141414]/80">
                      <strong className="text-emerald-800">Inference:</strong> 100% on-device WebGPU execution. Prompts stay local and are never transmitted to third-party AI APIs.
                      <span className="mx-1.5 text-gray-400">|</span>
                      <strong className="text-blue-800">Tool Calls:</strong> Dispatched strictly through authorized AAMARVA FLOOR API proxy with credential redaction.
                    </div>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-600 text-emerald-800 text-[10px] font-bold uppercase">
                  <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>Adapter: {FRAMEWORK_EVALUATIONS.find(f => f.id === selectedFramework)?.name}</span>
                </div>
              </div>

              {/* Model & Framework Selector Bar */}
              <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Model Selector */}
                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider mb-1 text-[#141414]">
                      1. Select Local Browser Model (WebLLM WebGPU)
                    </label>
                    <select
                      value={selectedModelId}
                      onChange={(e) => {
                        setSelectedModelId(e.target.value);
                        setModelLoaded(false);
                      }}
                      disabled={isLoadingModel}
                      className="w-full px-3 py-2 bg-[#FAF9F5] border-2 border-[#141414] font-mono text-xs font-bold focus:outline-none"
                    >
                      {MODEL_EVALUATIONS.map(m => (
                        <option key={m.id} value={m.mlcModelId}>
                          {m.name} ({m.parameterSize}, {m.downloadSize}, VRAM: {Math.round(m.vramRequiredMB)}MB)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Framework Selector */}
                  <div>
                    <label className="block font-mono text-[10px] font-black uppercase tracking-wider mb-1 text-[#141414]">
                      2. Select Agent Execution Framework
                    </label>
                    <select
                      value={selectedFramework}
                      onChange={(e) => handleFrameworkChange(e.target.value as FrameworkType)}
                      disabled={isExecuting}
                      className="w-full px-3 py-2 bg-[#FAF9F5] border-2 border-[#141414] font-mono text-xs font-bold focus:outline-none"
                    >
                      {FRAMEWORK_EVALUATIONS.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.adapterStatus} — Browser: {f.browserCompatibility})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Model Engine Control */}
                <div className="flex items-center justify-between pt-2 border-t border-[#141414]/15">
                  <div className="font-mono text-[11px] text-[#141414]/80">
                    Engine Status: {modelLoaded ? (
                      <span className="font-bold text-emerald-700">Ready in WebGPU Memory</span>
                    ) : (
                      <span className="text-[#141414]/60">Not loaded (weights will download locally)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {modelLoaded ? (
                      <>
                        <div className="px-3 py-1.5 bg-green-50 border-2 border-green-600 text-green-700 font-mono text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </div>
                        <button
                          onClick={handleUnloadModel}
                          disabled={isLoadingModel}
                          className="px-3 py-1.5 bg-white text-[#141414] hover:bg-red-50 hover:text-red-700 border-2 border-[#141414] font-mono text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                          title="Unload model and free GPU memory"
                        >
                          Unload
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleLoadModel}
                        disabled={isLoadingModel}
                        className="px-4 py-2 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#2A2A2A] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer disabled:opacity-55 flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isLoadingModel ? 'Loading...' : 'Load Model'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isLoadingModel && (
                <div className="p-4 bg-white border-2 border-[#141414] font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider">WebGPU Model Loading...</span>
                    <span className="text-[#141414]/70">{loadingProgress}</span>
                  </div>
                  <div className="w-full bg-[#E4E3E0] h-2 border border-[#141414] overflow-hidden">
                    <div className="bg-[#141414] h-full w-2/3 animate-pulse"></div>
                  </div>
                </div>
              )}

              {/* Chat & Trace Split Container */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-[300px]">
                {/* Chat Messages (2 Cols) */}
                <div className="lg:col-span-2 flex flex-col space-y-3">
                  <div className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto p-4 bg-white border-2 border-[#141414] space-y-3 font-mono text-xs shadow-[inset_2px_2px_0px_0px_rgba(20,20,20,0.05)]">
                    {messages.map((m, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 border-2 border-[#141414] ${
                          m.role === 'user' 
                            ? 'bg-[#FAF9F5] ml-8 border-l-4 border-l-[#141414]' 
                            : m.role === 'tool'
                            ? 'bg-amber-50 mx-4 border-amber-600 text-[11px]'
                            : 'bg-white mr-8 border-l-4 border-l-emerald-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[10px] uppercase font-black text-[#141414]/60">
                          <span>{m.role === 'tool' ? `TOOL RESULT: ${m.name}` : m.role}</span>
                          {m.role === 'assistant' && (
                            <span className="text-emerald-700">● {FRAMEWORK_EVALUATIONS.find(f => f.id === selectedFramework)?.name} (Local WebGPU)</span>
                          )}
                          {m.role === 'tool' && <span className="text-blue-700">● FLOOR API Proxy</span>}
                        </div>
                        <div className="whitespace-pre-wrap text-[#141414] leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Prompt Form */}
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      placeholder={modelLoaded ? `Instruction for ${FRAMEWORK_EVALUATIONS.find(f => f.id === selectedFramework)?.name} (e.g. check telemetry, list clusters)...` : "Load local model weights above to begin..."}
                      disabled={!modelLoaded || isExecuting}
                      className="flex-1 px-4 py-3 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] disabled:bg-gray-100"
                    />
                    <button
                      type="submit"
                      disabled={!modelLoaded || isExecuting || !inputPrompt.trim()}
                      className="px-6 py-3 bg-[#141414] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-[#2A2A2A] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer disabled:opacity-50"
                    >
                      {isExecuting ? 'Thinking...' : 'Execute'}
                    </button>
                  </form>
                </div>

                {/* Live Framework Trace & Pipeline Inspector (1 Col) */}
                <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col font-mono text-xs max-h-[440px]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#141414]/20">
                    <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wide">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Pipeline Trace ({executionTrace.length})</span>
                    </div>
                    <button 
                      onClick={() => setShowTracePanel(!showTracePanel)}
                      className="text-[10px] text-[#141414]/60 hover:text-[#141414]"
                    >
                      {showTracePanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {showTracePanel && (
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {executionTrace.length === 0 ? (
                        <div className="text-center py-8 text-[#141414]/50 text-[11px]">
                          No active trace events.
                          <br />
                          Execute a prompt to stream live framework telemetry.
                        </div>
                      ) : (
                        executionTrace.map((step, idx) => (
                          <div 
                            key={idx} 
                            className="p-2 border border-[#141414]/30 bg-[#FAF9F5] text-[10px] space-y-1"
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="text-[#141414]">#{step.stepNumber} {step.title}</span>
                              <span className="text-[9px] uppercase px-1 py-0.2 bg-gray-200 border border-gray-400">
                                {step.type}
                              </span>
                            </div>
                            <pre className="text-[9px] text-[#141414]/70 overflow-x-auto max-h-20 bg-white p-1 border border-[#141414]/10">
                              {JSON.stringify(step.details, null, 2)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
                <div>
                  <h3 className="font-mono text-sm font-black uppercase tracking-wide">
                    FLOOR & System Tool Inventory ({availableTools.length})
                  </h3>
                  <p className="font-mono text-xs text-[#141414]/70">
                    Real, permission-governed tools accessible to the local agent. No fabricated fallbacks.
                  </p>
                </div>
                <button
                  onClick={handleSyncTools}
                  disabled={isSyncingTools}
                  className="px-3 py-1.5 bg-[#141414] text-white font-mono text-xs font-bold uppercase flex items-center gap-1.5 border border-[#141414] hover:bg-[#2A2A2A] cursor-pointer disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isSyncingTools ? 'animate-spin' : ''}`} />
                  <span>Sync FLOOR</span>
                </button>
              </div>

              {/* Explicit Sync Status Notice */}
              {syncStatus.status === 'no_tools_assigned' && (
                <div className="p-3 bg-amber-50 border-2 border-amber-600 text-amber-900 font-mono text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>
                    <strong>FLOOR Status:</strong> No remote MCP tools are currently assigned to this agent identity. Only verified platform inspection tools are active. Configure tool assignments on the FLOOR tab to grant additional capabilities.
                  </span>
                </div>
              )}

              {syncStatus.status === 'failed' && (
                <div className="p-3 bg-red-50 border-2 border-red-600 text-red-900 font-mono text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                  <span>
                    <strong>Sync Failed:</strong> {syncStatus.error || 'Failed to load tool assignments.'} Remote tools were not registered.
                  </span>
                </div>
              )}

              {syncStatus.status === 'synced' && (
                <div className="p-3 bg-emerald-50 border-2 border-emerald-600 text-emerald-900 font-mono text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                  <span>
                    <strong>Synced:</strong> {syncStatus.assignedCount} authorized MCP tools actively registered from the FLOOR.
                  </span>
                </div>
              )}

              <div className="space-y-3 font-mono">
                {availableTools.map(t => (
                  <div key={t.name} className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase text-[#141414]">
                        {t.name}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${
                        t.source === 'FLOOR_MCP' ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-emerald-50 border-emerald-600 text-emerald-700'
                      }`}>
                        {t.source === 'FLOOR_MCP' ? 'FLOOR MCP Tool' : 'System Verified'}
                      </span>
                    </div>
                    <p className="text-xs text-[#141414]/80">{t.description}</p>
                    <div className="text-[10px] text-[#141414]/60 pt-1 border-t border-[#141414]/10">
                      Parameters Schema: {Object.keys(t.parameters?.properties || {}).length > 0 ? Object.keys(t.parameters.properties).join(', ') : 'None (Parameterless)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                <h3 className="font-mono text-sm font-black uppercase tracking-wide mb-1">
                  Verified Open-Source Model Evaluation Matrix
                </h3>
                <p className="font-mono text-xs text-[#141414]/70">
                  Evaluated with WebLLM prebuiltAppConfig for client-side WebGPU execution.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MODEL_EVALUATIONS.map(m => (
                  <div key={m.id} className="p-5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs uppercase bg-[#141414] text-white px-2 py-0.5">
                        {m.parameterSize}
                      </span>
                      <span className="text-[10px] text-[#141414]/70">VRAM: ~{Math.round(m.vramRequiredMB)} MB</span>
                    </div>
                    <h4 className="font-bold text-sm uppercase">{m.name}</h4>
                    <p className="text-xs text-[#141414]/80 leading-relaxed">{m.description}</p>
                    <div className="text-[10px] text-[#141414]/60 font-mono">
                      MLC ID: <code>{m.mlcModelId}</code>
                    </div>
                    <div className="pt-2 border-t border-[#141414]/20 flex items-center justify-between text-[11px]">
                      <span>Download: <strong>{m.downloadSize}</strong></span>
                      <span>License: <strong>{m.license}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'frameworks' && (
            <div className="space-y-4">
              <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                <h3 className="font-mono text-sm font-black uppercase tracking-wide mb-1">
                  Agent Framework Evaluation & Verification Matrix
                </h3>
                <p className="font-mono text-xs text-[#141414]/70">
                  Executable framework adapters running on top of browser WebGPU inference and FLOOR tool interfaces.
                </p>
              </div>

              <div className="space-y-3">
                {FRAMEWORK_EVALUATIONS.map((f) => (
                  <div key={f.id} className="p-5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 font-mono">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-sm uppercase">{f.name}</h4>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 bg-emerald-100 border border-emerald-600 text-emerald-800 font-bold">
                          {f.adapterStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border-2 border-[#141414] ${
                          f.browserCompatibility === 'Full' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : f.browserCompatibility === 'Partial'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          Browser: {f.browserCompatibility}
                        </span>
                        <button
                          onClick={() => handleTestFramework(f.id)}
                          disabled={runningFrameworkTest !== null}
                          className="px-3 py-1 bg-[#141414] text-white text-[10px] font-bold uppercase tracking-wider border border-[#141414] hover:bg-[#2A2A2A] cursor-pointer disabled:opacity-50 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>{runningFrameworkTest === f.id ? 'Verifying...' : 'Verify in Browser'}</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#141414]/80 leading-relaxed">{f.notes}</p>

                    {/* Test result display */}
                    {frameworkTestResults[f.id] && (
                      <div className={`p-2.5 border text-[11px] ${
                        frameworkTestResults[f.id].status === 'passed' 
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900' 
                          : 'bg-red-50 border-red-600 text-red-900'
                      }`}>
                        <strong>Test Result:</strong> {frameworkTestResults[f.id].message}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 pt-2 border-t border-[#141414]/20 text-[11px]">
                      <span>Weight: <strong>{f.dependencyWeight}</strong></span>
                      <span>Tool Support: <strong>{f.toolSupport ? 'Yes (Active FLOOR & System)' : 'No'}</strong></span>
                      <span>Privacy: <strong>{f.localPrivacy ? '100% On-Device WebGPU' : 'Network-Assisted'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#E4E3E0] border-t-2 border-[#141414] px-6 py-3 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Local WebGPU Inference | FLOOR MCP Network Integration</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141414] text-white font-black uppercase text-xs border-2 border-[#141414] hover:bg-[#2A2A2A] cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
