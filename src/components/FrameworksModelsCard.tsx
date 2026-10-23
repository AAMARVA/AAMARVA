import React, { useState } from 'react';
import { Workflow, X, Brain, SquareStack } from 'lucide-react';

export const FrameworksModelsCard: React.FC = () => {
  const [isModelsModalOpen, setIsModelsModalOpen] = useState(false);
  const [isFrameworksModalOpen, setIsFrameworksModalOpen] = useState(false);

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
              <div className="font-bold">Gemini 3.5 Flash Lite</div>
              <div className="text-[#141414]/60">Default Agentic & Reasoning Core</div>
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
              <div className="font-bold">React SPA + Vite</div>
              <div className="text-[#141414]/60">Frontend Runtime</div>
              <div className="font-bold pt-1">Node.js / Express</div>
              <div className="text-[#141414]/60">Backend API</div>
            </div>
          </div>
        </div>
      </div>

      {/* Models Inspection Modal */}
      {isModelsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
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
              <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                <div className="bg-[#141414] text-white px-4 py-2.5 flex items-center justify-between border-b-2 border-[#141414]">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-white" />
                    <span className="text-xs font-black uppercase tracking-wider">Execution Models Registry</span>
                  </div>
                  <span className="px-2 py-0.5 bg-white text-black text-[9px] font-black uppercase border border-[#141414]">Operational</span>
                </div>
                <div className="p-3.5 space-y-2.5 bg-[#F5F4F0]">
                  <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs block uppercase">Gemini 3.5 Flash Lite</span>
                      <span className="text-[10px] text-[#141414]/70">Default Agentic & Reasoning Core (@google/genai)</span>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-[#141414] text-white px-2 py-1 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">Primary</span>
                  </div>
                  <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs block uppercase">Gemini 2.5 Flash / Pro</span>
                      <span className="text-[10px] text-[#141414]/70">Multimodal & Grounding Engine</span>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-[#E4E3E0] text-[#141414] px-2 py-1 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Frameworks Inspection Modal */}
      {isFrameworksModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
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
                  <span className="px-2 py-0.5 bg-[#141414] text-white text-[9px] font-black uppercase border border-[#141414]">v2.4 Secured</span>
                </div>
                <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white">
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-black text-xs block uppercase">React SPA + Vite</span>
                    <span className="text-[10px] text-[#141414]/70 block mt-0.5">Frontend Client Runtime</span>
                  </div>
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-black text-xs block uppercase">Node.js / Express</span>
                    <span className="text-[10px] text-[#141414]/70 block mt-0.5">Backend Gateway API</span>
                  </div>
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-black text-xs block uppercase">Supabase / Drizzle ORM</span>
                    <span className="text-[10px] text-[#141414]/70 block mt-0.5">Persistent Relational DB</span>
                  </div>
                  <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <span className="font-black text-xs block uppercase">Tailwind CSS v4</span>
                    <span className="text-[10px] text-[#141414]/70 block mt-0.5">Brutalist Design System</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
