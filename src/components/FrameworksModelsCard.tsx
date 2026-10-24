import React, { useState, useEffect } from 'react';
import { Workflow, X, Brain, SquareStack, Play, Cpu, AlertTriangle, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import {
  qwenLangchainService,
  EXACT_QWEN_MODEL_ID,
  DISPLAY_MODEL_NAME,
  type ModelRuntimeStatus,
} from '../services/qwenLangchainService';

export const FrameworksModelsCard: React.FC = () => {
  const [isModelsModalOpen, setIsModelsModalOpen] = useState(false);
  const [isFrameworksModalOpen, setIsFrameworksModalOpen] = useState(false);
  const [status, setStatus] = useState<ModelRuntimeStatus>(qwenLangchainService.getStatus());

  // Interactive inputs for testing
  const [modelPrompt, setModelPrompt] = useState('Briefly explain the role of autonomous agent coordination.');
  const [frameworkSystemRole, setFrameworkSystemRole] = useState('You are an autonomous AAMARVA node kernel.');
  const [frameworkPrompt, setFrameworkPrompt] = useState('Generate a 2-step verification plan for model integrity.');
  const [isExecutingPrompt, setIsExecutingPrompt] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);
  const [executionLatency, setExecutionLatency] = useState<number | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = qwenLangchainService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const handleLoadModel = async () => {
    setRuntimeError(null);
    try {
      await qwenLangchainService.loadModel();
    } catch (err: any) {
      setRuntimeError(err?.message || 'Initialization failed');
    }
  };

  const handleUnloadModel = async () => {
    setRuntimeError(null);
    try {
      await qwenLangchainService.unloadModel();
      setExecutionOutput(null);
      setExecutionLatency(null);
    } catch (err: any) {
      setRuntimeError(err?.message || 'Unload failed');
    }
  };

  const handleRunModelInference = async () => {
    if (!modelPrompt.trim()) return;
    setIsExecutingPrompt(true);
    setRuntimeError(null);
    try {
      const start = performance.now();
      const res = await qwenLangchainService.executeDirect(modelPrompt);
      setExecutionOutput(res);
      setExecutionLatency(Math.round(performance.now() - start));
    } catch (err: any) {
      setRuntimeError(err?.message || 'Inference failed');
    } finally {
      setIsExecutingPrompt(false);
    }
  };

  const handleRunLangChainPipeline = async () => {
    if (!frameworkPrompt.trim()) return;
    setIsExecutingPrompt(true);
    setRuntimeError(null);
    try {
      const start = performance.now();
      const res = await qwenLangchainService.executeLangchainChain(frameworkSystemRole, frameworkPrompt);
      setExecutionOutput(res);
      setExecutionLatency(Math.round(performance.now() - start));
    } catch (err: any) {
      setRuntimeError(err?.message || 'LangChain execution failed');
    } finally {
      setIsExecutingPrompt(false);
    }
  };

  return (
    <>
      <div 
        className="bg-[#141414] text-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden"
      >
        {/* Card Header Bar */}
        <div className="bg-[#141414] text-white px-5 py-3.5 border-b-2 border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Workflow className="w-5 h-5 text-white" />
            <h2 className="font-mono text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Tool Chain
            </h2>
          </div>
          <span className="px-2 py-0.5 bg-white text-[#141414] border border-white/20 text-[9px] font-black uppercase tracking-wider font-mono">
            RUNTIME CONFIG
          </span>
        </div>

        {/* Card Body */}
        <div className="p-5 bg-white text-[#141414] grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Models Box */}
          <div 
            onClick={() => setIsModelsModalOpen(true)}
            className="p-4 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] space-y-2 cursor-pointer hover:bg-neutral-200 transition-colors"
          >
            <span className="text-[10px] font-black uppercase text-[#141414]/60 font-mono tracking-wider flex items-center gap-2 border-b border-[#141414]/20 pb-1.5">
              <Brain className="w-3 h-3" />
              Models
            </span>
            <div className="space-y-1 font-mono text-[11px] pt-1">
              <div className="font-bold flex items-center justify-between">
                <span>{DISPLAY_MODEL_NAME}</span>
                {status.isLoaded && (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Model Loaded" />
                )}
              </div>
              <div className="text-[#141414]/60">Local Browser WebGPU Inference</div>
            </div>
          </div>
          
          {/* Frameworks Box */}
          <div 
            onClick={() => setIsFrameworksModalOpen(true)}
            className="p-4 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] space-y-2 cursor-pointer hover:bg-neutral-200 transition-colors"
          >
            <span className="text-[10px] font-black uppercase text-[#141414]/60 font-mono tracking-wider flex items-center gap-2 border-b border-[#141414]/20 pb-1.5">
              <SquareStack className="w-3 h-3" />
              Frameworks
            </span>
            <div className="space-y-1 font-mono text-[11px] pt-1">
              <div className="font-bold">LangChain.js</div>
              <div className="text-[#141414]/60">LCEL Pipeline & WebLLM Connector</div>
            </div>
          </div>
        </div>
      </div>

      {/* Models Inspection Modal */}
      {isModelsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-xl shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] flex items-center justify-between shrink-0 font-mono">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#141414]" />
                <h3 className="font-black uppercase text-xs sm:text-sm tracking-wider">
                  Active Execution Models
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModelsModalOpen(false)}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F5F4F0] text-left font-mono">
              {/* Hardware / Environment Banner */}
              <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-start gap-2.5">
                <Cpu className="w-4 h-4 text-[#141414] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold uppercase flex items-center gap-2">
                    <span>Hardware Runtime: Browser WebGPU</span>
                    <span className={`px-1.5 py-0.2 text-[9px] font-black border ${status.webGpuSupported ? 'bg-emerald-100 text-emerald-800 border-emerald-600' : 'bg-amber-100 text-amber-800 border-amber-600'}`}>
                      {status.webGpuSupported ? 'AVAILABLE' : 'WEBGPU ABSENT'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#141414]/70">
                    Execution runs 100% locally on device hardware. Zero cloud fallback is configured to preserve zero-leakage guarantees.
                  </p>
                </div>
              </div>

              {/* Model Registry Card */}
              <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                <div className="bg-[#141414] text-white px-4 py-2.5 flex items-center justify-between border-b-2 border-[#141414]">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-white" />
                    <span className="text-xs font-black uppercase tracking-wider">Execution Models Registry</span>
                  </div>
                  <span className="px-2 py-0.5 bg-white text-black text-[9px] font-black uppercase border border-[#141414]">
                    {status.isLoaded ? 'Loaded' : status.isLoading ? 'Loading' : 'Idle'}
                  </span>
                </div>

                <div className="p-3.5 space-y-3 bg-[#F5F4F0]">
                  <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs block uppercase">{DISPLAY_MODEL_NAME}</span>
                        <span className="text-[10px] text-[#141414]/70">Identifier: {EXACT_QWEN_MODEL_ID}</span>
                      </div>
                      <span className="text-[9px] font-black uppercase bg-[#141414] text-white px-2 py-1 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                        Local Only
                      </span>
                    </div>

                    {/* Progress / Status display */}
                    <div className="pt-2 border-t border-[#141414]/10 text-[10px] space-y-1.5">
                      <div className="flex justify-between items-center text-[#141414]/70">
                        <span>Runtime Status: <span className="font-bold text-[#141414]">{status.progressText}</span></span>
                        {status.isLoading && <span className="font-bold">{status.progressPercent}%</span>}
                      </div>

                      {status.isLoading && (
                        <div className="w-full bg-[#E4E3E0] h-2 border border-[#141414] overflow-hidden">
                          <div 
                            className="bg-[#141414] h-full transition-all duration-200" 
                            style={{ width: `${status.progressPercent}%` }} 
                          />
                        </div>
                      )}
                    </div>

                    {/* Model Lifecycle Controls */}
                    <div className="flex gap-2 pt-1">
                      {!status.isLoaded && !status.isLoading && (
                        <button
                          type="button"
                          onClick={handleLoadModel}
                          disabled={!status.webGpuSupported}
                          className="px-3 py-1.5 bg-[#141414] text-white text-[11px] font-black uppercase border-2 border-[#141414] hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                        >
                          <Play className="w-3 h-3" />
                          Initialize Model
                        </button>
                      )}

                      {status.isLoading && (
                        <div className="px-3 py-1.5 bg-[#E4E3E0] text-[#141414] text-[11px] font-bold uppercase border-2 border-[#141414] flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Loading Weights...
                        </div>
                      )}

                      {status.isLoaded && (
                        <button
                          type="button"
                          onClick={handleUnloadModel}
                          className="px-3 py-1.5 bg-white text-[#141414] text-[11px] font-black uppercase border-2 border-[#141414] hover:bg-neutral-100 cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                        >
                          <Trash2 className="w-3 h-3" />
                          Unload & Release VRAM
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Direct Inference Workbench */}
              <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-4 space-y-3">
                <span className="text-xs font-black uppercase tracking-wider block border-b border-[#141414]/20 pb-1">
                  Local Inference Execution
                </span>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-[#141414]/70">Prompt Input</label>
                  <textarea
                    value={modelPrompt}
                    onChange={(e) => setModelPrompt(e.target.value)}
                    rows={2}
                    className="w-full p-2 bg-[#F5F4F0] border-2 border-[#141414] text-xs font-mono resize-none focus:outline-none"
                    placeholder="Enter prompt for local Qwen inference..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRunModelInference}
                    disabled={isExecutingPrompt || status.isLoading || (!status.isLoaded && !status.webGpuSupported)}
                    className="px-3.5 py-1.5 bg-[#141414] text-white text-xs font-black uppercase border-2 border-[#141414] hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  >
                    {isExecutingPrompt ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {isExecutingPrompt ? 'Executing Locally...' : 'Execute Local Inference'}
                  </button>

                  {executionLatency !== null && (
                    <span className="text-[10px] font-bold text-[#141414]/70">
                      Latency: {executionLatency} ms
                    </span>
                  )}
                </div>

                {runtimeError && (
                  <div className="p-2.5 bg-amber-50 border-2 border-amber-600 text-amber-900 text-[10px] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{runtimeError}</span>
                  </div>
                )}

                {executionOutput && (
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] text-xs space-y-1">
                    <span className="text-[9px] font-black uppercase text-[#141414]/60 block">Local Output:</span>
                    <p className="whitespace-pre-wrap">{executionOutput}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Frameworks Inspection Modal */}
      {isFrameworksModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-xl shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] flex items-center justify-between shrink-0 font-mono">
              <div className="flex items-center gap-2">
                <SquareStack className="w-4 h-4 text-[#141414]" />
                <h3 className="font-black uppercase text-xs sm:text-sm tracking-wider">
                  Runtime Frameworks Stack
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFrameworksModalOpen(false)}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F5F4F0] text-left font-mono">
              <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                <div className="bg-[#E4E3E0] text-[#141414] px-4 py-2.5 flex items-center justify-between border-b-2 border-[#141414]">
                  <div className="flex items-center gap-2">
                    <SquareStack className="w-4 h-4 text-[#141414]" />
                    <span className="text-xs font-black uppercase tracking-wider">Frameworks & Runtimes</span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#141414] text-white text-[9px] font-black uppercase border border-[#141414]">
                    LCEL Active
                  </span>
                </div>

                <div className="p-3.5 space-y-2.5 bg-white">
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs block uppercase">LangChain.js</span>
                      <span className="text-[9px] font-black uppercase bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414]">
                        @langchain/core + @langchain/community
                      </span>
                    </div>
                    <span className="text-[10px] text-[#141414]/70 block">
                      Autonomous orchestration pipeline configured with <code className="bg-white px-1 border border-[#141414]/30">ChatWebLLM</code> targeting local <code className="bg-white px-1 border border-[#141414]/30">{DISPLAY_MODEL_NAME}</code>.
                    </span>
                  </div>

                  {/* Architecture Diagram */}
                  <div className="p-2.5 bg-white border-2 border-[#141414] text-[10px] space-y-1">
                    <span className="font-black uppercase text-[#141414]/70 block">Active LCEL Architecture:</span>
                    <div className="flex items-center gap-1.5 flex-wrap font-bold">
                      <span className="bg-[#E4E3E0] px-2 py-1 border border-[#141414]">PromptTemplate</span>
                      <span>&rarr;</span>
                      <span className="bg-[#E4E3E0] px-2 py-1 border border-[#141414]">ChatWebLLM (Qwen2.5-0.5B)</span>
                      <span>&rarr;</span>
                      <span className="bg-[#E4E3E0] px-2 py-1 border border-[#141414]">StringOutputParser</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LangChain LCEL Workbench */}
              <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-4 space-y-3">
                <span className="text-xs font-black uppercase tracking-wider block border-b border-[#141414]/20 pb-1">
                  LangChain.js Pipeline Execution
                </span>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#141414]/70">System Message Template</label>
                  <input
                    type="text"
                    value={frameworkSystemRole}
                    onChange={(e) => setFrameworkSystemRole(e.target.value)}
                    className="w-full p-2 bg-[#F5F4F0] border-2 border-[#141414] text-xs font-mono focus:outline-none"
                    placeholder="System role..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#141414]/70">Chain Question Input</label>
                  <textarea
                    value={frameworkPrompt}
                    onChange={(e) => setFrameworkPrompt(e.target.value)}
                    rows={2}
                    className="w-full p-2 bg-[#F5F4F0] border-2 border-[#141414] text-xs font-mono resize-none focus:outline-none"
                    placeholder="Input for LangChain pipeline..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRunLangChainPipeline}
                    disabled={isExecutingPrompt || status.isLoading || (!status.isLoaded && !status.webGpuSupported)}
                    className="px-3.5 py-1.5 bg-[#141414] text-white text-xs font-black uppercase border-2 border-[#141414] hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  >
                    {isExecutingPrompt ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {isExecutingPrompt ? 'Running Chain...' : 'Execute LangChain.js Chain'}
                  </button>

                  {executionLatency !== null && (
                    <span className="text-[10px] font-bold text-[#141414]/70">
                      Latency: {executionLatency} ms
                    </span>
                  )}
                </div>

                {runtimeError && (
                  <div className="p-2.5 bg-amber-50 border-2 border-amber-600 text-amber-900 text-[10px] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{runtimeError}</span>
                  </div>
                )}

                {executionOutput && (
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] text-xs space-y-1">
                    <span className="text-[9px] font-black uppercase text-[#141414]/60 block flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      LangChain StringOutputParser Result:
                    </span>
                    <p className="whitespace-pre-wrap">{executionOutput}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
