import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Paperclip, Mic, Cpu, ChevronDown, Check, Plus, Terminal, X, Key, Shield } from 'lucide-react';

interface CommandPitProps {
  context: string;
}

interface ModelOption {
  id: string;
  name: string;
  badge: string;
  isCustom?: boolean;
}

const PRESET_MODELS: ModelOption[] = [
  { id: 'gemini-flash', name: 'Gemini 1.5 Flash', badge: 'Fast' },
  { id: 'gemini-pro', name: 'Gemini 1.5 Pro', badge: 'Reasoning' },
  { id: 'aamarva-core', name: 'AAMARVA Core v2', badge: 'Agent' },
];

export const CommandPit: React.FC<CommandPitProps> = ({ context }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(PRESET_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [customApiKeyInput, setCustomApiKeyInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [isSettingUpCustom, setIsSettingUpCustom] = useState(false);
  const [customModels, setCustomModels] = useState<ModelOption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelInput.trim()) return;
    const newModel: ModelOption = {
      id: `custom-${Date.now()}`,
      name: customModelInput.trim(),
      badge: 'BYOM',
      isCustom: true,
    };
    setCustomModels(prev => [...prev, newModel]);
    setSelectedModel(newModel);
    setCustomModelInput('');
    setCustomApiKeyInput('');
    setCustomUrlInput('');
    setIsSettingUpCustom(false);
    setShowModelMenu(false);
  };

  const handleExecute = () => {
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    
    const response = `[${context.toUpperCase()} | ${selectedModel.name}] Acknowledged: "${input}". (Action executed for context: ${context})`;
    
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'agent', text: response }]);
    }, 500);
    
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  return (
    <div className="relative w-full pt-1">
      {/* Top Right Gear Settings Icon outside top-right corner of box */}
      <button
        onClick={() => setIsSettingsOpen(prev => !prev)}
        className="absolute -top-8 right-0 w-8 h-8 sm:w-9 sm:h-9 border-2 border-[#141414] rounded-full transition-all flex items-center justify-center bg-white text-[#141414] hover:bg-[#E4E3E0] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] z-10"
        title="System Settings"
        aria-label="Settings"
      >
        <Terminal className="w-4 h-4 sm:w-4.5 sm:h-4.5 transition-transform duration-300 hover:scale-110" />
      </button>

      <div className="flex flex-col h-[400px] md:h-[300px] bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 border-2 border-[#141414] ${m.role === 'user' ? 'bg-[#141414] text-white' : 'bg-[#E4E3E0] text-[#141414]'}`}>
              <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center font-mono text-base sm:text-lg font-bold text-black underline underline-offset-4">
            Agent is ready for the task !
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t-2 border-[#141414]">
        <div className="flex flex-col bg-[#E4E3E0]/30 border-2 border-[#141414] p-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 88)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder="Give command"
            className="w-full font-mono text-sm p-3 bg-transparent focus:outline-none resize-none overflow-y-auto"
            rows={1}
            style={{ maxHeight: '88px', minHeight: '44px' }}
          />
          
          <div className="flex items-center justify-between border-t border-[#141414]/20 pt-1">
            <div className="flex items-center shrink-0 space-x-1">
              <button className="p-2 text-[#141414] hover:bg-[#E4E3E0] transition-all" title="Upload File">
                <Paperclip className="w-5 h-5" />
              </button>
              <button className="p-2 text-[#141414] hover:bg-[#E4E3E0] transition-all" title="Voice Input">
                <Mic className="w-5 h-5" />
              </button>

              {/* Model Selector Tool */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono font-semibold text-[#141414] bg-white border border-[#141414] hover:bg-[#E4E3E0] transition-all shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]"
                  title="Select AI Model"
                >
                  <Cpu className="w-4 h-4 text-[#141414]" />
                  <span>{selectedModel.name}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showModelMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-60 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] z-20 py-1">
                    <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#141414]/60 border-b border-[#141414]/10 flex justify-between items-center">
                      <span>Select Model</span>
                      {selectedModel.isCustom && (
                        <span className="text-[9px] text-[#141414] font-bold bg-[#E4E3E0] px-1">Custom Active</span>
                      )}
                    </div>

                    {/* Presets */}
                    {[...PRESET_MODELS, ...customModels].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model);
                          setShowModelMenu(false);
                          setIsSettingUpCustom(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left font-mono text-xs hover:bg-[#E4E3E0] transition-all ${
                          selectedModel.id === model.id ? 'font-bold bg-[#E4E3E0]/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          {selectedModel.id === model.id ? (
                            <Check className="w-3.5 h-3.5 text-black shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">{model.name}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#141414] text-white font-mono shrink-0">
                          {model.badge}
                        </span>
                      </button>
                    ))}

                    <div className="border-t border-[#141414]/10 my-1" />

                    {/* Bring Your Own Model Option */}
                    {!isSettingUpCustom ? (
                      <button
                        onClick={() => setIsSettingUpCustom(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs font-semibold text-[#141414] hover:bg-[#E4E3E0] transition-all"
                      >
                        <Plus className="w-4 h-4 text-black shrink-0" />
                        <span>Bring Your Own Model</span>
                      </button>
                    ) : (
                      <form onSubmit={handleAddCustomModel} className="p-2 space-y-2 bg-[#E4E3E0]/30 border-t border-[#141414]/10">
                        <div className="font-mono text-[10px] font-bold text-[#141414] uppercase">
                          Bring Your Own Model
                        </div>
                        <div>
                          <label className="block font-mono text-[9px] uppercase text-[#141414]/70 mb-0.5">
                            Model Name
                          </label>
                          <input
                            type="text"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            placeholder="e.g. GPT-4o, Llama-3"
                            className="w-full font-mono text-xs p-1.5 bg-white border border-[#141414] focus:outline-none"
                            autoFocus
                            required
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[9px] uppercase text-[#141414]/70 mb-0.5">
                            API Key
                          </label>
                          <input
                            type="password"
                            value={customApiKeyInput}
                            onChange={(e) => setCustomApiKeyInput(e.target.value)}
                            placeholder="sk-..."
                            className="w-full font-mono text-xs p-1.5 bg-white border border-[#141414] focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[9px] uppercase text-[#141414]/70 mb-0.5">
                            Endpoint / Base URL (Optional)
                          </label>
                          <input
                            type="url"
                            value={customUrlInput}
                            onChange={(e) => setCustomUrlInput(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full font-mono text-xs p-1.5 bg-white border border-[#141414] focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsSettingUpCustom(false)}
                            className="px-2 py-1 font-mono text-[10px] text-[#141414] hover:bg-[#E4E3E0]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-2 py-1 font-mono text-[10px] bg-[#141414] text-white hover:bg-black font-semibold"
                          >
                            Save Model
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleExecute}
              className="p-2 text-[#141414] hover:bg-[#E4E3E0] transition-all disabled:opacity-50"
              disabled={!input.trim()}
              title="Send Command"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Settings Modal Overlay */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#141414] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-white" />
                <span className="font-mono font-black text-sm uppercase tracking-wider">
                  System Settings
                </span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 font-mono text-xs text-[#141414]">
              <div className="border-2 border-[#141414] p-3 bg-[#E4E3E0]/30 space-y-2">
                <div className="flex items-center gap-2 font-bold uppercase text-[11px] border-b border-[#141414]/20 pb-1">
                  <Cpu className="w-4 h-4" />
                  <span>Agent Configuration</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Active Agent:</span>
                  <span className="font-bold bg-[#141414] text-white px-1.5 py-0.5">AAMARVA Core v2</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Selected Model:</span>
                  <span className="font-bold text-[#141414]">{selectedModel.name}</span>
                </div>
              </div>

              <div className="border-2 border-[#141414] p-3 bg-[#E4E3E0]/30 space-y-2">
                <div className="flex items-center gap-2 font-bold uppercase text-[11px] border-b border-[#141414]/20 pb-1">
                  <Key className="w-4 h-4" />
                  <span>API Keys & BYOM</span>
                </div>
                <p className="text-[10px] text-[#141414]/80">
                  Custom model keys & endpoints can be managed directly in the Command Pit model selector menu.
                </p>
              </div>

              <div className="border-2 border-[#141414] p-3 bg-[#E4E3E0]/30 space-y-2">
                <div className="flex items-center gap-2 font-bold uppercase text-[11px] border-b border-[#141414]/20 pb-1">
                  <Shield className="w-4 h-4" />
                  <span>Security & Permissions</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Telemetry Logging:</span>
                  <span className="font-bold">ENABLED</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Sandbox Environment:</span>
                  <span className="font-bold">ISOLATED</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-[#141414] p-3 bg-[#E4E3E0]/20 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-1.5 bg-[#141414] text-white font-mono font-bold text-xs uppercase hover:bg-black shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
