import React, { useState } from 'react';
import { 
  Shield, 
  Terminal, 
  ArrowRight, 
  Layers, 
  Share2, 
  Activity, 
  Fingerprint, 
  Cpu,
  ChevronDown,
  Code2,
  Lock,
  Zap,
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface LandingPageViewProps {
  onAccessApp: (targetTab?: 'login' | 'register' | 'adk') => void;
  onOpenTerms?: () => void;
  isAuthenticated?: boolean;
}

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'ISOLATED' | 'BRIDGED';
  capabilities: string[];
  permissions: string;
  x: number; // percentage in visualization viewBox
  y: number;
  connections: string[];
}

const FLEET_NODES: AgentNode[] = [
  {
    id: 'node-alpha',
    name: 'Execution Core α',
    role: 'Primary Autonomous Task Worker',
    status: 'ACTIVE',
    capabilities: ['Autonomous Step Engine', 'Workspace Scratchpad', 'E2EE Streamer'],
    permissions: 'RESTRICTED / SCOPED TO ASSIGNED TASK',
    x: 20,
    y: 28,
    connections: ['operator-root', 'node-beta', 'node-gamma']
  },
  {
    id: 'node-beta',
    name: 'Cluster Sentinel β',
    role: 'Multi-Agent Consensus Coordinator',
    status: 'ACTIVE',
    capabilities: ['Consensus Verification', 'Gossip Protocol Relay', 'Cluster Isolation Filter'],
    permissions: 'PEER-TO-PEER VERIFIED / CLUSTER CONFINED',
    x: 80,
    y: 26,
    connections: ['operator-root', 'node-alpha', 'node-delta']
  },
  {
    id: 'node-gamma',
    name: 'Floor & MCP Bridge γ',
    role: 'External Tool & API Gateway',
    status: 'BRIDGED',
    capabilities: ['Model Context Protocol v1', 'Sanitized Tool Invocation', 'Outbound Rate Limiter'],
    permissions: 'ZERO IMPLICIT ACCESS / INDIVIDUAL TOOL GRANTS',
    x: 18,
    y: 72,
    connections: ['operator-root', 'node-alpha']
  },
  {
    id: 'node-delta',
    name: 'Telemetry Ledger δ',
    role: 'State Verification & Audit Monitor',
    status: 'ACTIVE',
    capabilities: ['Cryptographic Audit Trail', 'Message Hash Ledger', 'Anomaly Sentinel'],
    permissions: 'READ-ONLY STREAM / OPERATOR REPORTING',
    x: 82,
    y: 70,
    connections: ['operator-root', 'node-beta', 'node-epsilon']
  },
  {
    id: 'node-epsilon',
    name: 'Ingestion Gateway ε',
    role: 'Feed Normalization & Intake',
    status: 'ISOLATED',
    capabilities: ['Cryptographic Intake Gate', 'Input Sanitization', 'Format Parser'],
    permissions: 'QUARANTINE BUFFER / OPERATOR SIGNED INTAKE',
    x: 50,
    y: 86,
    connections: ['operator-root', 'node-delta']
  }
];

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onAccessApp,
  onOpenTerms,
  isAuthenticated = false
}) => {
  // Interactive Topology State
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-alpha');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'cluster' | 'mcp' | 'permissions'>('all');
  const [isOperatorSelected, setIsOperatorSelected] = useState<boolean>(false);

  // Active architecture tab in Infrastructure Section
  const [activeInfraTab, setActiveInfraTab] = useState<'connections' | 'clusters' | 'floor' | 'human'>('connections');

  // Code sample tab
  const [activeCodeTab, setActiveCodeTab] = useState<'typescript' | 'python' | 'curl'>('typescript');

  const selectedNode = FLEET_NODES.find(n => n.id === selectedNodeId) || FLEET_NODES[0];

  const handleSelectNode = (nodeId: string) => {
    setIsOperatorSelected(false);
    setSelectedNodeId(nodeId);
  };

  const handleSelectOperator = () => {
    setIsOperatorSelected(true);
  };

  return (
    <div className="w-full min-h-screen bg-[#000000] text-[#FFFFFF] font-sans antialiased selection:bg-white selection:text-black">
      {/* 1. FLOATING GLASS NAVIGATION (LangChain style floating pill) */}
      <div className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 pt-3 pointer-events-none">
        <header className="max-w-5xl mx-auto h-14 sm:h-16 px-4 sm:px-6 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4 pointer-events-auto transition-all">
          {/* Brand Zone */}
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 group text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            aria-label="AAMARVA Home"
          >
            <img 
              src="/f.png" 
              alt="AAMARVA" 
              className="w-7 h-7 sm:w-8 sm:h-8 bg-black border border-white/40 object-contain rounded-md shadow-sm transition-transform group-hover:scale-105" 
            />
            <span className="font-mono text-base sm:text-lg font-black tracking-tight uppercase text-white">
              AAMARVA
            </span>
          </button>

          {/* Navigation Links Zone */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium text-zinc-300">
            <a href="#overview" className="hover:text-white transition-colors py-1">
              Product
            </a>
            <a href="#infrastructure" className="hover:text-white transition-colors py-1">
              Infrastructure
            </a>
            <a href="#security" className="hover:text-white transition-colors py-1">
              Security
            </a>
            <button 
              onClick={() => onAccessApp('adk')} 
              className="hover:text-white transition-colors py-1 cursor-pointer"
            >
              Docs
            </button>
          </nav>

          {/* Action Buttons Zone */}
          <div className="flex items-center gap-2 sm:gap-3 font-mono">
            {!isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => onAccessApp('login')}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => onAccessApp('register')}
                  className="px-4 py-2 sm:px-5 sm:py-2 text-xs font-black uppercase tracking-wider bg-white text-black rounded-lg hover:bg-zinc-200 shadow-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>Access AAMARVA</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onAccessApp()}
                className="px-4 py-2 sm:px-5 sm:py-2 text-xs font-black uppercase tracking-wider bg-white text-black rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Console</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
          </div>
        </header>
      </div>

      {/* 2. HERO SECTION WITH LANGCHAIN-INSPIRED ENGRAVING ART */}
      <section id="overview" className="relative pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-24 overflow-hidden bg-[#000000]">
        {/* Subtle geometric background grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center flex flex-col items-center">
          {/* Subtle Announcement Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-white/5 border border-white/15 text-xs font-mono text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Autonomous Agent Command Protocol v2.0</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-zinc-400">Zero Ambient Authority</span>
          </div>

          {/* Hero Headlines */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white uppercase max-w-4xl leading-[1.05] mb-6">
            Command your autonomous fleet.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-300 max-w-2xl leading-relaxed mb-8 font-normal">
            Infrastructure for connecting, coordinating, and controlling autonomous agents—with permissions that keep humans in control.
          </p>

          {/* Hero CTA Button Pair */}
          <div className="flex flex-wrap items-center justify-center gap-4 font-mono mb-12">
            <button
              type="button"
              onClick={() => onAccessApp('register')}
              className="px-6 py-3.5 bg-white text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.2)]"
            >
              <span>Access AAMARVA</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <a
              href="#infrastructure"
              className="px-6 py-3.5 bg-black/60 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-lg border border-white/20 hover:border-white/50 hover:bg-white/5 transition-all cursor-pointer"
            >
              Explore the infrastructure
            </a>
          </div>

          {/* HERO VISUAL ARTWORK: "Commanding the Automatons in the Tempest" */}
          <div className="w-full max-w-5xl relative mt-2 rounded-2xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.9)] group">
            {/* Measured Gradient Scrim for Contrast & Integration */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-transparent to-transparent z-10 pointer-events-none" />
            
            <img 
              src="/src/assets/images/hero_fleet_command_1793126247266.jpg" 
              alt="AAMARVA: Commanding the Autonomous Fleet in the Tempest"
              className="w-full h-auto object-cover max-h-[580px] brightness-[0.92] contrast-[1.1] transition-transform duration-700 group-hover:scale-[1.01]"
              referrerPolicy="no-referrer"
            />

            {/* Archival Badge overlay on bottom */}
            <div className="absolute bottom-4 left-6 right-6 z-20 flex flex-col sm:flex-row items-center justify-between gap-2 text-left font-mono text-[11px] text-zinc-300 bg-black/80 backdrop-blur-md p-3 sm:px-4 rounded-xl border border-white/15">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-white shrink-0" />
                <span className="font-bold text-white uppercase">ARCHITECTURAL INVARIANT:</span>
                <span className="text-zinc-300">Human Operator holds the cryptographic command harness at all times.</span>
              </div>
              <a 
                href="#topology" 
                className="text-xs font-bold text-white underline underline-offset-4 hover:text-zinc-300 whitespace-nowrap"
              >
                Inspect Live Fleet Topology ↓
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INTEGRATION ROSTER TICKER (LangChain style strip) */}
      <section className="py-6 border-y border-white/15 bg-[#050505] font-mono text-xs text-zinc-400 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-between gap-y-4 gap-x-6 text-[11px] uppercase tracking-wider">
          <div className="flex items-center gap-2 text-white font-bold">
            <Activity className="w-3.5 h-3.5 text-white" />
            <span>SUPPORTED PROTOCOL INTERFACES:</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-zinc-300 font-semibold">
            <span>Model Context Protocol (MCP)</span>
            <span className="text-zinc-600">+</span>
            <span>LangChain Integration</span>
            <span className="text-zinc-600">+</span>
            <span>FIDO2 / WebAuthn</span>
            <span className="text-zinc-600">+</span>
            <span>ECDSA End-to-End Transport</span>
            <span className="text-zinc-600">+</span>
            <span>Domain Cluster Isolation</span>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE FLEET TOPOLOGY VISUALIZATION */}
      <section id="topology" className="py-16 sm:py-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                Live Interactive System Visualization
              </span>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight">
                Cryptographic Fleet Topology
              </h2>
              <p className="mt-2 text-sm sm:text-base text-zinc-300 max-w-2xl">
                Hover over nodes to inspect states, or click any node to update the technical permission boundary inspector.
              </p>
            </div>

            {/* Filter mode segmented controls */}
            <div className="flex items-center gap-1 p-1 bg-[#121214] rounded-xl border border-white/20 self-start md:self-auto font-mono">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  filterMode === 'all' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Fleet
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('cluster')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  filterMode === 'cluster' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Clusters
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mcp')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  filterMode === 'mcp' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                FLOOR / MCP
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('permissions')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  filterMode === 'permissions' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Permissions
              </button>
            </div>
          </div>

          {/* Interactive Topology Container */}
          <div className="bg-[#09090b] rounded-2xl border border-white/20 p-4 sm:p-6 lg:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
            {/* Interactive Canvas Canvas Area */}
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[460px] bg-[#050505] rounded-xl border border-white/20 overflow-hidden select-none">
              {/* Subtle background grid coordinates */}
              <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

              {/* SVG CONNECTION MESH */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {FLEET_NODES.map((node) => {
                  const isConnectedToSelected = !isOperatorSelected && (selectedNode.connections.includes(node.id) || selectedNode.id === node.id);
                  const isHighlighted = isOperatorSelected || isConnectedToSelected || hoveredNodeId === node.id;
                  
                  let isModeVisible = true;
                  if (filterMode === 'cluster' && node.id === 'node-gamma') isModeVisible = false;
                  if (filterMode === 'mcp' && node.id !== 'node-gamma' && node.id !== 'node-alpha') isModeVisible = false;
                  if (filterMode === 'permissions' && node.id === 'node-epsilon') isModeVisible = false;

                  return (
                    <g key={`conn-${node.id}`}>
                      <line
                        x1="50"
                        y1="48"
                        x2={node.x}
                        y2={node.y}
                        stroke="#FFFFFF"
                        strokeWidth={isHighlighted ? "0.6" : "0.3"}
                        strokeOpacity={isModeVisible ? (isHighlighted ? "0.95" : "0.3") : "0.08"}
                        strokeDasharray={isHighlighted ? "1 0.8" : "none"}
                      />
                    </g>
                  );
                })}

                {/* Inter-Agent Coordination Lines */}
                <line
                  x1={FLEET_NODES[0].x}
                  y1={FLEET_NODES[0].y}
                  x2={FLEET_NODES[1].x}
                  y2={FLEET_NODES[1].y}
                  stroke="#FFFFFF"
                  strokeWidth="0.3"
                  strokeOpacity={filterMode === 'mcp' ? "0.05" : (selectedNodeId === 'node-alpha' || selectedNodeId === 'node-beta' ? "0.85" : "0.25")}
                  strokeDasharray="0.8 0.8"
                />
                <line
                  x1={FLEET_NODES[0].x}
                  y1={FLEET_NODES[0].y}
                  x2={FLEET_NODES[2].x}
                  y2={FLEET_NODES[2].y}
                  stroke="#FFFFFF"
                  strokeWidth="0.3"
                  strokeOpacity={filterMode === 'cluster' ? "0.05" : (selectedNodeId === 'node-alpha' || selectedNodeId === 'node-gamma' ? "0.85" : "0.25")}
                  strokeDasharray="0.8 0.8"
                />
                <line
                  x1={FLEET_NODES[1].x}
                  y1={FLEET_NODES[1].y}
                  x2={FLEET_NODES[3].x}
                  y2={FLEET_NODES[3].y}
                  stroke="#FFFFFF"
                  strokeWidth="0.3"
                  strokeOpacity={selectedNodeId === 'node-beta' || selectedNodeId === 'node-delta' ? "0.85" : "0.25"}
                  strokeDasharray="0.8 0.8"
                />
                <line
                  x1={FLEET_NODES[3].x}
                  y1={FLEET_NODES[3].y}
                  x2={FLEET_NODES[4].x}
                  y2={FLEET_NODES[4].y}
                  stroke="#FFFFFF"
                  strokeWidth="0.3"
                  strokeOpacity={selectedNodeId === 'node-delta' || selectedNodeId === 'node-epsilon' ? "0.85" : "0.25"}
                  strokeDasharray="0.8 0.8"
                />
              </svg>

              {/* 1. CENTRAL HUMAN CONTROL OPERATOR NODE */}
              <div 
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group"
                style={{ left: '50%', top: '48%' }}
                onClick={handleSelectOperator}
                onMouseEnter={() => setHoveredNodeId('operator-root')}
                onMouseLeave={() => setHoveredNodeId(null)}
                role="button"
                tabIndex={0}
                aria-label="Human Control Operator Root Node"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectOperator(); }}
              >
                <div className={`p-2.5 sm:p-3 bg-white text-black rounded-xl border-2 border-white transition-all ${
                  isOperatorSelected 
                    ? 'ring-4 ring-white/30 shadow-[0_0_24px_rgba(255,255,255,0.5)] scale-105' 
                    : 'shadow-[0_4px_16px_rgba(255,255,255,0.25)] hover:scale-105'
                }`}>
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                    <div className="hidden sm:flex flex-col text-left">
                      <span className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-600">AUTHORITY ROOT</span>
                      <span className="font-mono text-[10px] font-black uppercase text-black">HUMAN OPERATOR</span>
                    </div>
                  </div>
                </div>
                <div className="sm:hidden absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white text-black text-[8px] font-mono px-1 rounded font-bold">
                  OPERATOR
                </div>
              </div>

              {/* 2. FLEET AGENT NODES */}
              {FLEET_NODES.map((node) => {
                const isSelected = !isOperatorSelected && selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;

                return (
                  <div
                    key={node.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 group"
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    onClick={() => handleSelectNode(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Agent Node ${node.name}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectNode(node.id); }}
                  >
                    <div className={`p-2 sm:p-2.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-white text-black border-white ring-4 ring-white/30 shadow-[0_0_18px_rgba(255,255,255,0.4)] scale-110'
                        : isHovered
                          ? 'bg-[#1e1e24] text-white border-white shadow-[0_4px_12px_rgba(255,255,255,0.15)] scale-105'
                          : 'bg-[#121214] text-white border-white/30'
                    }`}>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {node.id === 'node-gamma' ? (
                          <Layers className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSelected ? 'text-black' : 'text-white'}`} />
                        ) : node.id === 'node-beta' ? (
                          <Share2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSelected ? 'text-black' : 'text-white'}`} />
                        ) : (
                          <Cpu className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSelected ? 'text-black' : 'text-white'}`} />
                        )}
                        <span className="font-mono text-[9px] sm:text-[10px] font-black uppercase whitespace-nowrap">
                          {node.name.split(' ')[0]} {node.name.split(' ')[2]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* INSPECTION PANEL FOR SELECTED TOPOLOGY NODE */}
            <div className="mt-4 p-4 sm:p-5 bg-[#050505] rounded-xl border border-white/15 font-mono text-white">
              {isOperatorSelected ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/10 gap-2">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-white" />
                      <span className="text-xs font-black uppercase text-white">Central Human Control Authority</span>
                      <span className="text-[10px] bg-white text-black px-1.5 py-0.5 rounded font-bold uppercase">Master Grantor</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-bold">FIDO2 / WebAuthn Hardware Bound</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    The Human Operator is the authoritative cryptographic root. No autonomous agent within your fleet can communicate, allocate cluster resources, or invoke external tools without affirmative permission grants explicitly anchored to your master operator keys.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[11px]">
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase block">Credential Revocation</span>
                      <span className="font-bold text-white mt-0.5 block">Instant Single-Click Kill-Switch</span>
                    </div>
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase block">Perimeter Defense</span>
                      <span className="font-bold text-white mt-0.5 block">CIDR IP Whitelist Enforced</span>
                    </div>
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase block">Session Protocol</span>
                      <span className="font-bold text-white mt-0.5 block">Zero Ambient Token Authority</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/10 gap-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-white" />
                      <span className="text-xs font-black uppercase text-white">{selectedNode.name}</span>
                      <span className="text-[10px] border border-white/30 px-1.5 py-0.5 rounded font-bold uppercase text-zinc-300">
                        {selectedNode.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400">Role: {selectedNode.role}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">
                        Active Permission Boundary
                      </span>
                      <div className="p-2 bg-[#121214] rounded-lg border border-white/15 font-bold text-white text-[11px]">
                        {selectedNode.permissions}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">
                        Cryptographic Capabilities
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.capabilities.map((cap, i) => (
                          <span key={i} className="text-[10px] bg-[#18181b] text-zinc-200 px-2 py-0.5 rounded border border-white/20 font-bold">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. INFRASTRUCTURE ARCHITECTURE (Pillars with interactive schema tabs) */}
      <section id="infrastructure" className="py-16 sm:py-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="max-w-2xl mb-12 sm:mb-16">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Protocol Architecture
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight">
              Infrastructure built for controlled autonomy.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-normal">
              Autonomous agents should never operate in an unbounded vacuum. AAMARVA introduces strict architectural primitives to partition, authorize, and observe multi-agent operations.
            </p>
          </div>

          {/* Interactive Infrastructure Switcher */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 font-mono">
            <button
              type="button"
              onClick={() => setActiveInfraTab('connections')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeInfraTab === 'connections'
                  ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.25)]'
                  : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Share2 className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black opacity-60">01</span>
              </div>
              <span className="text-xs font-black uppercase tracking-tight block">Connections</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">Controlled peer links</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInfraTab('clusters')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeInfraTab === 'clusters'
                  ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.25)]'
                  : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Layers className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black opacity-60">02</span>
              </div>
              <span className="text-xs font-black uppercase tracking-tight block">Clusters</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">Isolated domain teams</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInfraTab('floor')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeInfraTab === 'floor'
                  ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.25)]'
                  : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Terminal className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black opacity-60">03</span>
              </div>
              <span className="text-xs font-black uppercase tracking-tight block">FLOOR & MCP</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">External tool bridges</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveInfraTab('human')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeInfraTab === 'human'
                  ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.25)]'
                  : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Fingerprint className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black opacity-60">04</span>
              </div>
              <span className="text-xs font-black uppercase tracking-tight block">Human Control</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">Authoritative console</span>
            </button>
          </div>

          {/* Infrastructure Detail Card with Diagram */}
          <div className="bg-[#09090b] rounded-2xl border border-white/20 p-6 sm:p-8 lg:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
            {activeInfraTab === 'connections' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive</span>
                    <span aria-hidden="true">/</span>
                    <span>Point-to-Point Mesh</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    Connections: Controlled Communication Between Authorized Agents
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Autonomous agents need to exchange inputs, outputs, and subtask results. Rather than permitting open pub/sub broadcasting or ungoverned network chatter, AAMARVA enforces cryptographically signed, peer-to-peer connection handshakes.
                  </p>
                  <ul className="space-y-2.5 font-mono text-xs text-zinc-300 pt-2">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Mutual Cryptographic Identity Verification (ECDSA / Ed25519)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>End-to-End Encrypted Transport Channels</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Zero Message Forwarding Without Affirmative Authorization</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Immediate Operator Connection Severing & Key Rotation</span>
                    </li>
                  </ul>
                </div>

                {/* Architectural Diagram Box */}
                <div className="lg:col-span-6 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-white">CONNECTION HANDSHAKE FLOW</span>
                    <span className="text-[10px] text-zinc-400">RFC-AMR-01</span>
                  </div>
                  <div className="py-4 space-y-3">
                    <div className="p-3 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[10px] text-zinc-400 uppercase block">Step 01. Peer Request</span>
                      <span className="font-bold text-white">Agent_A presents signed ephemeral token to Agent_B</span>
                    </div>
                    <div className="p-3 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[10px] text-zinc-400 uppercase block">Step 02. Permission Verification</span>
                      <span className="font-bold text-white">Cryptographic validation against Human Operator Grant</span>
                    </div>
                    <div className="p-3 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-[10px] text-zinc-400 uppercase block">Step 03. Secure Channel Bind</span>
                      <span className="font-bold text-white">E2EE Tunnel established with explicit message quota</span>
                    </div>
                  </div>
                  <div className="pt-2 text-[10px] text-zinc-500 text-right">
                    Zero unauthenticated traffic permitted
                  </div>
                </div>
              </div>
            )}

            {activeInfraTab === 'clusters' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive</span>
                    <span aria-hidden="true">/</span>
                    <span>Domain Isolation</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    Clusters: Coordinated Agent Groups with Scoped Access Rules
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Complex fleet workflows require specialized agent collectives—such as a research group, an execution squad, or a verification unit. Clusters group authorized agents into bounded domains where messages are restricted strictly to registered participants.
                  </p>
                  <ul className="space-y-2.5 font-mono text-xs text-zinc-300 pt-2">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Enforced Recipient Whitelists per Cluster Domain</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Zero Cross-Cluster Data Leakage by Default</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Cluster Dissolution & Instant Capability Revocation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Cluster Coordinator Consensus Protocols</span>
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-6 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-white">CLUSTER ISOLATION BOUNDARY</span>
                    <span className="text-[10px] text-zinc-400">RFC-AMR-02</span>
                  </div>
                  <div className="py-4 space-y-3">
                    <div className="p-3 border border-dashed border-white/30 bg-[#121214] rounded-lg">
                      <div className="flex justify-between text-[10px] font-bold text-white mb-1">
                        <span>CLUSTER: FINANCIAL RESEARCH SQUAD</span>
                        <span className="text-zinc-300">ISOLATED</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                        <div className="p-2 bg-[#18181b] rounded border border-white/15 text-zinc-200">Agent: Ingestion_01</div>
                        <div className="p-2 bg-[#18181b] rounded border border-white/15 text-zinc-200">Agent: Synthesis_02</div>
                      </div>
                    </div>
                    <div className="p-2.5 bg-white text-black text-[10px] text-center font-bold rounded-lg">
                      CROSS-BOUNDARY BARRIER: REQUIRES OPERATOR SIGNED ROUTE
                    </div>
                    <div className="p-3 border border-dashed border-white/30 bg-[#121214] rounded-lg">
                      <div className="flex justify-between text-[10px] font-bold text-white mb-1">
                        <span>CLUSTER: CODE EXECUTION WORKERS</span>
                        <span className="text-zinc-300">ISOLATED</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                        <div className="p-2 bg-[#18181b] rounded border border-white/15 text-zinc-200">Agent: Sandbox_01</div>
                        <div className="p-2 bg-[#18181b] rounded border border-white/15 text-zinc-200">Agent: Tester_02</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeInfraTab === 'floor' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive</span>
                    <span aria-hidden="true">/</span>
                    <span>Tool Integration Layer</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    FLOOR: MCP & External Tool Bridges
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Agents cannot impact production environments without tools. The FLOOR integration layer standardizes external API and system tool access using the Model Context Protocol (MCP), guaranteeing that every external invocation passes through deterministic verification.
                  </p>
                  <ul className="space-y-2.5 font-mono text-xs text-zinc-300 pt-2">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Native Model Context Protocol (MCP) Server Compatibility</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Per-Agent Tool Whitelists & Argument Validation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Rate Limits and Anomaly Circuit Breakers</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Immutable Tool Invocation Audit Logs</span>
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-6 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-white">FLOOR MCP PIPELINE</span>
                    <span className="text-[10px] text-zinc-400">SPEC MCP-1.0</span>
                  </div>
                  <div className="py-4 space-y-3">
                    <div className="flex items-center justify-between p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-zinc-200">1. Agent Tool Call Request</span>
                      <span className="text-[10px] bg-white text-black px-1.5 font-bold rounded">mcp://exec</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-zinc-200">2. FLOOR Policy Verification</span>
                      <span className="text-[10px] text-white font-bold">Schema Validated</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-zinc-200">3. Outbound Execution</span>
                      <span className="text-[10px] text-zinc-400 font-bold">Sandboxed Host</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-[#121214] rounded-lg border border-white/15">
                      <span className="text-zinc-200">4. Signed Output Injection</span>
                      <span className="text-[10px] bg-white text-black px-1.5 font-bold rounded">Encrypted Result</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeInfraTab === 'human' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive</span>
                    <span aria-hidden="true">/</span>
                    <span>Operator Command</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    Human Control: Central Fleet Orchestration Console
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    AAMARVA rejects the premise of completely ungoverned agent sprawl. The central operator console gives human supervisors total situational awareness, live telemetry inspection, and the architectural leverage to modify fleet behavior instantly.
                  </p>
                  <ul className="space-y-2.5 font-mono text-xs text-zinc-300 pt-2">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Master Account vs. Delegated Agent Roster Hierarchy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Hardware Passkey Verification for State-Changing Directives</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Real-Time Fleet Telemetry & Activity Auditing</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-white">·</span>
                      <span>Global Logout & Network Perimeter Invariant Enforcement</span>
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-6 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-white">OPERATOR AUTHORITY SPECS</span>
                    <span className="text-[10px] text-zinc-400">ARCH-CORE</span>
                  </div>
                  <div className="py-4 space-y-2.5">
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15 flex justify-between">
                      <span className="text-zinc-400">Access Mode</span>
                      <span className="font-bold text-white">Operator Authenticated</span>
                    </div>
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15 flex justify-between">
                      <span className="text-zinc-400">Delegated Keys</span>
                      <span className="font-bold text-white">Rotatable & Scoped</span>
                    </div>
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15 flex justify-between">
                      <span className="text-zinc-400">Perimeter Control</span>
                      <span className="font-bold text-white">IP / CIDR Whitelisting</span>
                    </div>
                    <div className="p-2.5 bg-[#121214] rounded-lg border border-white/15 flex justify-between">
                      <span className="text-zinc-400">Emergency Override</span>
                      <span className="font-bold text-white">Deterministic Revocation</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. CODE & ADK SPECIFICATION SECTION */}
      <section className="py-16 sm:py-24 border-b border-white/15 bg-[#050505]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-8">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Agent Development Kit (ADK)
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight">
              Connect your fleet in three lines of code.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 font-normal">
              Any LangChain, LlamaIndex, or custom agent runtime can securely bind to AAMARVA using standard MCP or REST/WebSocket endpoints.
            </p>
          </div>

          <div className="bg-[#09090b] rounded-2xl border border-white/20 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] font-mono text-xs">
            {/* Terminal Header */}
            <div className="px-5 py-3.5 bg-[#121214] border-b border-white/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <span className="ml-3 text-zinc-400 font-medium">agent_connect.ts</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCodeTab('typescript')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeCodeTab === 'typescript' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  TypeScript
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab('python')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeCodeTab === 'python' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Python
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab('curl')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeCodeTab === 'curl' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  cURL
                </button>
              </div>
            </div>

            {/* Code Content */}
            <div className="p-6 overflow-x-auto text-zinc-200 leading-relaxed text-[13px]">
              {activeCodeTab === 'typescript' && (
                <pre><code>{`import { AamarvaAgentClient } from '@aamarva/adk';

// 1. Initialize agent with operator-granted credentials
const agent = new AamarvaAgentClient({
  agentId: process.env.AAMARVA_AGENT_ID,
  apiKey: process.env.AAMARVA_API_KEY,
  endpoint: 'https://aamarva.com/api'
});

// 2. Discover and bind authorized FLOOR MCP tools
const tools = await agent.floor.discoverTools();
console.log('Authorized Tools:', tools.map(t => t.name));

// 3. Coordinate within assigned cluster domain
await agent.clusters.send({
  clusterId: 'research-squad-01',
  payload: { task: 'summarize_telemetry', step: 1 }
});`}</code></pre>
              )}

              {activeCodeTab === 'python' && (
                <pre><code>{`from aamarva import AamarvaClient
from langchain_community.chat_models import ChatAnthropic

# 1. Bind agent runtime to AAMARVA protocol harness
client = AamarvaClient(
    agent_id="agent_alpha_01",
    api_key="amr_sec_9941..."
)

# 2. Query available MCP tools registered on the FLOOR
tools = client.floor.list_tools()

# 3. Transmit verifiable E2EE step execution ticket
ticket = client.connections.post_ticket(
    content="Task verification complete. Ready for consensus.",
    cluster_id="verification-squad"
)`}</code></pre>
              )}

              {activeCodeTab === 'curl' && (
                <pre><code>{`# Discover available tools on the FLOOR via MCP protocol
curl -X GET "https://aamarva.com/api/floor/agent/tools" \\
  -H "Authorization: Bearer amr_sec_key_..." \\
  -H "Content-Type: application/json"`}</code></pre>
              )}
            </div>

            <div className="px-6 py-3 bg-[#0d0d10] border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Standard RFC-AMR compliant transport</span>
              <button 
                onClick={() => onAccessApp('adk')} 
                className="text-white hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Read Full ADK Spec</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CONTROL AND PERMISSIONS SECTION */}
      <section id="security" className="py-16 sm:py-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Security Philosophy
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight">
              Connecting an agent does not grant authorization.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              Traditional microservices and agent runtimes assume implicit trust once a socket is open or an API key is supplied. AAMARVA adheres to an uncompromising principle: every communication path, tool access, and cluster entry requires affirmative operator permission.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
            {/* Core Principle 1 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs mb-4">
                  01
                </div>
                <h4 className="text-sm font-black uppercase text-white mb-2">
                  Zero Ambient Authority
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Agents do not inherit permissions from other agents. Every task delegation must carry an explicit cryptographic ticket specifying exact operational scopes and time-to-live boundaries.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-[10px] text-zinc-400">
                INVARIANT: Scoped Execution
              </div>
            </div>

            {/* Core Principle 2 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs mb-4">
                  02
                </div>
                <h4 className="text-sm font-black uppercase text-white mb-2">
                  Perimeter & IP Whitelisting
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Control the physical and logical network perimeter of your fleet. Restrict operator consoles and agent ingress endpoints to explicit CIDR ranges and authorized hardware hosts.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-[10px] text-zinc-400">
                INVARIANT: Network Perimeter
              </div>
            </div>

            {/* Core Principle 3 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs mb-4">
                  03
                </div>
                <h4 className="text-sm font-black uppercase text-white mb-2">
                  Hardware-Bound Biometrics
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  High-leverage fleet directives require physical presence. FIDO2 / WebAuthn hardware passkeys ensure that automated threats cannot hijack master operator privileges.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-[10px] text-zinc-400">
                INVARIANT: FIDO2 Hardware Keys
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FINAL HIGH-CONTRAST CALL TO ACTION */}
      <section className="py-20 sm:py-28 bg-[#000000] text-white font-mono relative overflow-hidden border-b border-white/15">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-4">
            Autonomous Fleet Command Protocol
          </span>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase leading-tight mb-6">
            Deploy command over your fleet.
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 max-w-2xl mx-auto leading-relaxed mb-10 font-sans">
            Establish cryptographic authority, organize agent clusters, and interface safely with external tools through the FLOOR and MCP protocols.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => onAccessApp('register')}
              className="w-full sm:w-auto px-8 py-4 bg-white text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.25)]"
            >
              <span>Access AAMARVA</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onAccessApp('adk')}
              className="w-full sm:w-auto px-8 py-4 bg-transparent text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-lg border border-white/30 hover:border-white hover:bg-white/10 transition-all cursor-pointer"
            >
              Review ADK Specifications
            </button>
          </div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <footer className="py-12 bg-[#000000] border-t border-white/15 font-mono text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img 
                src="/f.png" 
                alt="AAMARVA" 
                className="w-6 h-6 bg-black border border-white/40 object-contain rounded" 
              />
              <span className="font-black uppercase tracking-wider text-white text-sm">
                AAMARVA
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-[11px] text-zinc-400">Autonomous Agent Command Protocol & Infrastructure</span>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-zinc-400">
              <a href="#overview" className="hover:text-white transition-colors">Overview</a>
              <a href="#infrastructure" className="hover:text-white transition-colors">Infrastructure</a>
              <a href="#security" className="hover:text-white transition-colors">Security</a>
              <button onClick={() => onAccessApp('adk')} className="hover:text-white transition-colors cursor-pointer">ADK Docs</button>
              {onOpenTerms && (
                <button onClick={onOpenTerms} className="hover:text-white transition-colors cursor-pointer">Terms & Conditions</button>
              )}
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-zinc-500">
            <span>
              © {new Date().getFullYear()} AAMARVA Core Contributors. All rights reserved.
            </span>
            <span>
              Explicit Permissions · Strict Cryptographic Boundary
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
