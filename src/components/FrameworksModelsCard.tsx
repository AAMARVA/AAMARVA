import React, { useState } from 'react';
import { Cpu, ArrowUpRight, X, Check, Sliders, Layers } from 'lucide-react';

export const FrameworksModelsCard: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-[#141414] text-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
        {/* Card Header Bar */}
        <div className="bg-[#141414] text-white px-5 py-3.5 border-b-2 border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-white" />
            <h2 className="font-mono text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Frameworks and Models
            </h2>
          </div>
          <span className="px-2 py-0.5 bg-emerald-400 text-black border border-white/20 text-[9px] font-black uppercase tracking-wider font-mono">
            Operational
          </span>
        </div>

        {/* Card Body */}
        <div className="p-5 bg-white text-[#141414] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#F5F4F0] border-2 border-[#141414]">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-[#141414]/60 font-mono tracking-wider block">
                Primary Execution Core
              </span>
              <span className="text-sm font-black text-[#141414] font-mono uppercase block">
                Gemini 3.5 Flash Lite (@google/genai)
              </span>
              <span className="text-[11px] text-[#141414]/70 font-sans">
                High-performance agentic reasoning, function calling, and cryptographic payload verification.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 bg-[#141414] text-white hover:bg-black font-mono text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0 flex items-center gap-1.5 justify-center"
            >
              <span>Inspect Stack</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 bg-[#E4E3E0]/30 border border-[#141414]/20 space-y-1">
              <span className="text-[9px] font-black uppercase text-[#141414]/50 block">Runtime</span>
              <span className="font-bold text-[#141414] block">React SPA + Vite</span>
            </div>
            <div className="p-3 bg-[#E4E3E0]/30 border border-[#141414]/20 space-y-1">
              <span className="text-[9px] font-black uppercase text-[#141414]/50 block">Gateway</span>
              <span className="font-bold text-[#141414] block">Node.js / Express</span>
            </div>
            <div className="p-3 bg-[#E4E3E0]/30 border border-[#141414]/20 space-y-1">
              <span className="text-[9px] font-black uppercase text-[#141414]/50 block">Storage</span>
              <span className="font-bold text-[#141414] block">Supabase / Drizzle</span>
            </div>
          </div>
        </div>
      </div>

      {/* Inspection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] flex items-center justify-between shrink-0 font-mono">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#141414]" />
                <h3 className="font-black uppercase text-xs sm:text-sm tracking-wider">
                  Frameworks and Models Stack
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F5F4F0] text-left font-mono">
              <div className="bg-white border-2 border-[#141414] p-4 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3">
                <div className="flex items-center justify-between border-b border-[#141414]/15 pb-2">
                  <span className="text-xs font-black uppercase tracking-wider">Active Execution Models</span>
                  <span className="px-2 py-0.5 bg-emerald-400 text-black border border-[#141414] text-[9px] font-black uppercase">Operational</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414] flex items-center justify-between">
                    <div>
                      <span className="font-bold block">Gemini 3.5 Flash Lite</span>
                      <span className="text-[10px] text-[#141414]/60">Default Agentic & Reasoning Core (@google/genai)</span>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-[#141414] text-white px-2 py-0.5">Primary</span>
                  </div>
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414] flex items-center justify-between">
                    <div>
                      <span className="font-bold block">Gemini 2.5 Flash / Pro</span>
                      <span className="text-[10px] text-[#141414]/60">Multimodal & Grounding Engine</span>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-white border border-[#141414] px-2 py-0.5">Ready</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-[#141414] p-4 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3">
                <div className="flex items-center justify-between border-b border-[#141414]/15 pb-2">
                  <span className="text-xs font-black uppercase tracking-wider">Runtime Frameworks Stack</span>
                  <span className="px-2 py-0.5 bg-neutral-900 text-white border border-[#141414] text-[9px] font-black uppercase">v2.4 Secured</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414]">
                    <span className="font-black block">React SPA + Vite</span>
                    <span className="text-[9.5px] text-[#141414]/60">Frontend Client Runtime</span>
                  </div>
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414]">
                    <span className="font-black block">Node.js / Express</span>
                    <span className="text-[9.5px] text-[#141414]/60">Backend Gateway API</span>
                  </div>
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414]">
                    <span className="font-black block">Supabase / Drizzle ORM</span>
                    <span className="text-[9.5px] text-[#141414]/60">Persistent Relational DB</span>
                  </div>
                  <div className="p-2.5 bg-[#F5F4F0] border border-[#141414]">
                    <span className="font-black block">Tailwind CSS v4</span>
                    <span className="text-[9.5px] text-[#141414]/60">Brutalist Design System</span>
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
