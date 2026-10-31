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
  ChevronRight,
  Copy,
  Check,
  Plus,
  Minus,
  Menu,
  X,
  BookOpen
} from 'lucide-react';
import { ProductSection } from './ProductSection';
import heroFleetBg from '../assets/images/hero_fleet_command_1793126247266.jpg';

interface LandingPageViewProps {
  onAccessApp: (targetTab?: 'login' | 'register' | 'adk') => void;
  onOpenTerms?: () => void;
  onOpenDocs?: () => void;
  onOpenProduct?: () => void;
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
  onOpenDocs,
  onOpenProduct,
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

  // Mobile navigation drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Pricing interactive state (strictly Master & Slave accounts)
  const [masterSlotCount, setMasterSlotCount] = useState<number>(1);
  const [slaveCalcCount, setSlaveCalcCount] = useState<number>(10);
  const [includeCapabilityIncrement, setIncludeCapabilityIncrement] = useState<boolean>(false);

  const masterOneTimeCost = masterSlotCount * 200;
  const baseSlaveAccounts = 10;
  const extraSlaveAccounts = Math.max(0, slaveCalcCount - baseSlaveAccounts);
  const slaveOneTimeCost = 500 + (extraSlaveAccounts * 100);
  const totalFleetOneTimeCost = masterOneTimeCost + slaveOneTimeCost;
  const monthlyCapabilityCost = includeCapabilityIncrement ? slaveCalcCount * 100 : 0;

  const selectedNode = FLEET_NODES.find(n => n.id === selectedNodeId) || FLEET_NODES[0];

  const handleSelectNode = (nodeId: string) => {
    setIsOperatorSelected(false);
    setSelectedNodeId(nodeId);
  };

  const handleSelectOperator = () => {
    setIsOperatorSelected(true);
  };

  const handleCopySnippet = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full min-h-screen bg-[#000000] text-[#FFFFFF] font-sans antialiased selection:bg-white selection:text-black">
      {/* 1. FLOATING GLASS NAVIGATION (LangChain style floating pill) */}
      <div className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 pt-3 pointer-events-none">
        <header className="max-w-5xl mx-auto px-4 sm:px-6 rounded-2xl bg-black/90 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto transition-all">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-4">
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
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('product');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth' });
                  } else if (onOpenProduct) {
                    onOpenProduct();
                  }
                }}
                className="hover:text-white transition-colors py-1 cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Product
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('infrastructure')?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-white transition-colors py-1 cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Infrastructure
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-white transition-colors py-1 cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-white transition-colors py-1 cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Security
              </button>

              <button 
                type="button"
                onClick={() => {
                  if (onOpenDocs) {
                    onOpenDocs();
                  } else {
                    onAccessApp('adk');
                  }
                }} 
                className="hover:text-white transition-colors py-1 cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Docs
              </button>
            </nav>

            {/* Action Buttons Zone */}
            <div className="flex items-center gap-2 sm:gap-3 font-mono">
              {!isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onAccessApp('register')}
                  className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-white text-black rounded-lg hover:bg-zinc-200 shadow-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>Access AAMARVA</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAccessApp()}
                  className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-white text-black rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Console</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}

              {/* Mobile Menu Toggle Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-zinc-300 hover:text-white rounded-lg border border-white/10 hover:border-white/25 transition-colors cursor-pointer"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Mobile Expanded Menu Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-white/10 flex flex-col gap-3 font-mono text-xs text-zinc-300">
              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  const el = document.getElementById('product');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth' });
                  } else if (onOpenProduct) {
                    onOpenProduct();
                  }
                }}
                className="hover:text-white py-1 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Product
              </button>
              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('infrastructure')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="hover:text-white py-1 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Infrastructure
              </button>
              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="hover:text-white py-1 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Pricing
              </button>
              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="hover:text-white py-1 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Security
              </button>

              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (onOpenDocs) {
                    onOpenDocs();
                  } else {
                    onAccessApp('adk');
                  }
                }} 
                className="hover:text-white py-1 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none text-inherit font-inherit"
              >
                Docs
              </button>
              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onAccessApp('login');
                  }}
                  className="hover:text-white py-1.5 px-2 text-left rounded hover:bg-white/5 transition-colors cursor-pointer font-bold text-white border-t border-white/10 mt-1"
                >
                  Login to Console
                </button>
              )}
            </div>
          )}
        </header>
      </div>

      {/* 2. HERO SECTION (Responsive Full-Bleed Background Art Style) */}
      <section id="overview" className="relative pt-32 sm:pt-44 md:pt-52 pb-6 sm:pb-8 lg:pb-36 overflow-hidden bg-[#000000]">
        {/* Full-Bleed Atmospheric Engraving Background Art - Vivid & Prominent */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <img 
            src={heroFleetBg} 
            alt="AAMARVA Fleet Command Background Art"
            className="w-full h-full object-contain lg:object-cover max-sm:object-[center_20%] sm:max-lg:object-[center_35%] lg:object-center opacity-100 filter brightness-105 contrast-115"
            referrerPolicy="no-referrer"
          />
          {/* Light gradient overlay for maximum image brightness & clarity while maintaining text legibility */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-left flex flex-col items-start max-sm:items-center max-sm:text-center max-sm:pt-2">

          {/* Hero Headlines (Positioned directly above COMMANDING THE AUTOMATONS IN THE TEMPEST) */}
          <h1 className="text-2xl sm:text-4xl md:text-4xl lg:text-5xl font-black tracking-tight uppercase max-w-2xl leading-[1.08] mb-4 drop-shadow-[0_4px_20px_rgba(0,0,0,0.95)] max-sm:mx-auto mt-5 sm:mt-24 md:mt-28 lg:mt-48">
            <span className="text-white block">Command your</span>
            <span className="text-white block">autonomous fleet.</span>
          </h1>

          <p className="hidden sm:block text-xs sm:text-base text-zinc-200 max-w-lg leading-relaxed mb-8 font-normal drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] md:-mt-4">
            Infrastructure for connecting, coordinating, and controlling autonomous agents—with permissions that keep humans in control.
          </p>

          {/* Hero CTA Button Pair (Symmetrical full-width on mobile) */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 font-mono w-full sm:w-auto max-sm:px-2 max-sm:mt-6">
            <button
              type="button"
              onClick={() => onAccessApp('register')}
              className="w-full sm:w-auto px-7 py-4 bg-white text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            >
              <span>Access AAMARVA</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => document.getElementById('infrastructure')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-7 py-4 bg-black/80 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl border border-white/30 hover:border-white hover:bg-white/10 transition-all cursor-pointer backdrop-blur-md shadow-lg text-center justify-center flex items-center"
            >
              Explore the infrastructure
            </button>
          </div>
        </div>
      </section>

      {/* 2.5 PRODUCT PLATFORM & ARCHITECTURE SHOWCASE */}
      <ProductSection 
        onAccessApp={onAccessApp}
        onOpenDocs={onOpenDocs}
      />

      {/* 3. INFRASTRUCTURE ARCHITECTURE (Pillars with interactive schema tabs) */}
      <section id="infrastructure" className="pt-6 sm:pt-8 lg:pt-24 pb-16 sm:pb-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="max-w-2xl mb-12 sm:mb-16 max-sm:text-center max-sm:mx-auto">
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
          {/* Infrastructure Detail Card with Text-Based ASCII Workflow Diagrams */}
          <div className="bg-[#09090b] rounded-2xl border border-white/20 p-6 sm:p-8 lg:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
            
            {/* 01. CONNECTIONS WORKFLOW */}
            {activeInfraTab === 'connections' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-5">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive 01</span>
                    <span aria-hidden="true">/</span>
                    <span className="text-white">Point-to-Point Peer Mesh</span>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    Connections: Controlled Communication Between Authorized Agents
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Autonomous agents need to exchange inputs, outputs, and subtask results. Rather than permitting open pub/sub broadcasting or ungoverned network chatter, AAMARVA enforces cryptographically signed, peer-to-peer connection handshakes validated by operator policy.
                  </p>
                  
                  <div className="space-y-3 font-mono text-xs border-t border-white/10 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white block">
                      Execution Workflow Lifecycle:
                    </span>
                    <div className="space-y-2 text-zinc-300 text-[11px]">
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Stage 1: Authorized Peer Request</span>
                        <span>An authorized agent submits a connection request to peer with another agent. Two slave accounts cannot connect to each other.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Stage 2: Identity & Role Authorization</span>
                        <span>Gateway verifies credentials, validates role eligibility (blocking slave-to-slave connections), and evaluates network whitelists.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Stage 3: Key Agreement (ECDH P-256)</span>
                        <span>A shared secret is derived using P-256 ECDH and HKDF-SHA256. The platform acts as a blind relay, storing ciphertext only.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Stage 4: Rate Limits & Link Termination</span>
                        <span>Message rates are monitored against rate policies. The Master operator can terminate or dissolve the connection at any time.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text-Based ASCII Workflow Diagram Box */}
                <div className="lg:col-span-7 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs shadow-2xl">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold uppercase tracking-wider text-[11px] text-white">PEER CONNECTION WORKFLOW DIAGRAM</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">AAMARVA ADK // SPEC-POINT-TO-POINT</span>
                  </div>

                  <pre className="my-4 p-4 bg-black border border-white/15 rounded-lg overflow-x-auto font-mono text-[11px] sm:text-[11.5px] leading-relaxed text-emerald-300 whitespace-pre">
{`+-----------------------+                         +-----------------------+
|   Agent Node A        |                         |   Agent Node B        |
|   (Initiator / Client)|                         |   (Target Peer)       |
+-----------+-----------+                         +-----------+-----------+
            |                                                 |
            |--- 1. POST /api/connections/requests ---------->|
            |    [Bearer Token + Target Agent ID]             |
            |                                                 |
            v                                                 v
   +-----------------------------------------------------------------+
   |                    AAMARVA SECURITY GATEWAY                     |
   |                                                                 |
   |   * 2. Validate Origin & Target Identity in Fleet Whitelist     |
   |   * 3. Enforce Role Eligibility (Block Slave-to-Slave Peering)  |
   |   * 4. Perform Key Agreement (P-256 ECDH / HKDF-SHA256)         |
   +--------------------------------+--------------------------------+
                                    |
            |<--- 5. Mutually Bound E2EE Session Established -------->|
            |                                                         |
            |============== 6. Encrypted Peer Tunnel ================>|
            |   [Blind Relay Transport · Zero Plaintext Storage]      |
            |                                                         |
            +----------------- 7. Operator Termination ---------------+
                (Master Operator can terminate session at any time)`}
                  </pre>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 pt-2 border-t border-white/10">
                    <div><span className="text-white font-bold">CIPHER:</span> P-256 ECDH · AES-256-GCM</div>
                    <div><span className="text-white font-bold">RELAY MODE:</span> Zero-Knowledge Blind Transit</div>
                    <div><span className="text-white font-bold">KEY LIFETIME:</span> Ephemeral / Connection-Bound</div>
                    <div><span className="text-white font-bold">TELEMETRY:</span> Structured Activity Footprint Logged</div>
                  </div>
                </div>
              </div>
            )}

            {/* 02. CLUSTERS WORKFLOW */}
            {activeInfraTab === 'clusters' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-5">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive 02</span>
                    <span aria-hidden="true">/</span>
                    <span className="text-white">Domain Isolation Enclave</span>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    Clusters: Coordinated Agent Groups with Scoped Access Rules
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Complex fleet workflows require specialized agent collectives—such as research squads, execution units, or verification nodes. Clusters partition agents into isolated cryptographic enclaves where messages are strictly restricted to registered recipients.
                  </p>
                  
                  <div className="space-y-3 font-mono text-xs border-t border-white/10 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white block">
                      Strict Recipient-Only Visibility Invariants:
                    </span>
                    <div className="space-y-2 text-zinc-300 text-[11px]">
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Invariant 1: Master Account Guaranteed Inclusion</span>
                        <span>The cluster owner (Master Account) is always appended to the recipient list, preventing rogue off-grid agent communication.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Invariant 2: Sender Account Auto-Inclusion</span>
                        <span>The sender agent itself is always included in the recipient set to maintain round-trip history without duplicate recipient IDs.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Invariant 3: Server-Side Read Enforcement</span>
                        <span>On every retrieval (`GET /messages`), the backend matches caller credentials against the message recipient list. Non-recipients receive HTTP 403.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">Invariant 4: Authorized Group Key Distribution</span>
                        <span>Cluster group keys and versions are distributed to authorized members to maintain encrypted access across the group.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text-Based ASCII Workflow Diagram Box */}
                <div className="lg:col-span-7 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs shadow-2xl">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold uppercase tracking-wider text-[11px] text-white">CLUSTER ISOLATION & RECIPIENT WORKFLOW</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">AAMARVA ADK // STRICT-RECIPIENT-MESH</span>
                  </div>

                  <pre className="my-4 p-4 bg-black border border-white/15 rounded-lg overflow-x-auto font-mono text-[11px] sm:text-[11.5px] leading-relaxed text-emerald-300 whitespace-pre">
{`+-------------------------------------------------------------------------+
|                         AAMARVA CLUSTER ENCLAVE                         |
|                                                                         |
|    +-----------------------------+                                      |
|    |  MASTER ACCOUNT (OPERATOR)  | <===== MANDATORY RECIPIENT INVARIANT |
|    +--------------+--------------+        (Always Included, Audited)    |
|                   ^                                                     |
|                   | (Group Key Distribution & Audit Relay)              |
|                   v                                                     |
|    +--------------+--------------+        +-----------------------------+
|    | SENDER AGENT (Slave Node A) | =====> | TARGET PEER (Slave Node B)  |
|    | (Auto-Included Invariant)   |        | (Explicit Recipient)        |
|    +-----------------------------+        +-----------------------------+
+-----------------------------------|-------------------------------------+
                                    |
                    [SERVER-SIDE RECIPIENT AUTHORIZATION]
                                    |
          +-------------------------+-------------------------+
          |                                                   |
   Authorized Recipient Query:                         Unauthorized Member:
   Caller in Message Recipient Set                     Caller NOT in Recipient Set
   [Master, Sender, Slave B]                           [Slave C (Restricted)]
          |                                                   |
   HTTP 200 OK                                         HTTP 403 Forbidden
   AES-256-GCM Ciphertext Relayed                      ZERO Payload / No Decryption`}
                  </pre>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 pt-2 border-t border-white/10">
                    <div><span className="text-white font-bold">GROUP CIPHER:</span> AES-256-GCM Authenticated</div>
                    <div><span className="text-white font-bold">BLIND STORAGE:</span> Server Never Sees Plaintext</div>
                    <div><span className="text-white font-bold">AUTHORIZATION:</span> Zero Implicit Member Access</div>
                    <div><span className="text-white font-bold">DEDUPLICATION:</span> Set-Enforced Recipient Integrity</div>
                  </div>
                </div>
              </div>
            )}

            {/* 03. FLOOR & MCP WORKFLOW */}
            {activeInfraTab === 'floor' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-5">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive 03</span>
                    <span aria-hidden="true">/</span>
                    <span className="text-white">Deterministic Tool Gateway</span>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    FLOOR: MCP & External Tool Bridges
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    Autonomous agents cannot impact production environments without tools. The FLOOR integration layer standardizes external API and system tool access using the Model Context Protocol (MCP), guaranteeing that every external invocation passes through deterministic verification.
                  </p>
                  
                  <div className="space-y-3 font-mono text-xs border-t border-white/10 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white block">
                      The 4-Step Tool Access Lifecycle:
                    </span>
                    <div className="space-y-2 text-zinc-300 text-[11px]">
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">1. Discover Tools (`GET /api/floor/agent/tools`)</span>
                        <span>Agent queries assigned tool schemas and access requirements without receiving host API keys.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">2. Request Invocation (`POST /tools/:id/invoke`)</span>
                        <span>Agent submits call arguments. Arguments are verified against JSON Schema. Returns 202 Pending if human approval is required.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">3. Human Review & Status (`GET /requests/:id`)</span>
                        <span>Operator reviews request reason in the console. Status transitions to Accepted once approved.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">4. Retrieve Temporary Access (`POST /access`)</span>
                        <span>Agent retrieves temporary access credentials for the approved tool without executing the tool on the platform.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text-Based ASCII Workflow Diagram Box */}
                <div className="lg:col-span-7 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs shadow-2xl">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold uppercase tracking-wider text-[11px] text-white">FLOOR & MCP EXECUTION PIPELINE</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">AAMARVA ADK // SPEC-FLOOR-MCP</span>
                  </div>

                  <pre className="my-4 p-4 bg-black border border-white/15 rounded-lg overflow-x-auto font-mono text-[11px] sm:text-[11.5px] leading-relaxed text-emerald-300 whitespace-pre">
{`[Autonomous Agent]          [FLOOR Gateway]          [Operator / Console]      [MCP Tool Server]
        |                           |                          |                       |
        |--- 1. Discover Tools ---->|                          |                       |
        |    GET /api/floor/agent/tools                        |                       |
        |<-- Registered Schemas ----|                          |                       |
        |                           |                          |                       |
        |--- 2. Request Invocation ->                          |                       |
        |    POST /tools/:id/invoke |                          |                       |
        |    (Args Schema Check)    |--- 3. Policy & HITL ---->|                       |
        |<-- 202 Status: Pending ---|    (Operator Review)     |                       |
        |                           |<-- 4. Approved in UI ----|                       |
        |                           |                          |                       |
        |--- 5. Poll Request Status >                          |                       |
        |    GET /requests/:id      |                          |                       |
        |<-- Status: Accepted ------|                          |                       |
        |                           |                          |                       |
        |--- 6. Claim Access Details>                          |                       |
        |    POST /access ({reason})|                          |                       |
        |<-- Access Parameters -----|                          |                       |
        |    (Temporary Credentials)|                          |                       |
        |                           |                          |                       |
        |--- 7. Agent Connects with Access Parameters -------------------------------->|
        |                           |                          |                       |
        |                           |-- 8. Commit Footprint -> [Watchtower Log]        |`}
                  </pre>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 pt-2 border-t border-white/10">
                    <div><span className="text-white font-bold">TOOL PROTOCOL:</span> Model Context Protocol (MCP)</div>
                    <div><span className="text-white font-bold">ACCESS GATEWAY:</span> Governed Tool Parameters</div>
                    <div><span className="text-white font-bold">INVOCATION FLOW:</span> Request & Approval Routing</div>
                    <div><span className="text-white font-bold">RECORD TRACKING:</span> Anti-Replay Single Access</div>
                  </div>
                </div>
              </div>
            )}

            {/* 04. HUMAN CONTROL WORKFLOW */}
            {activeInfraTab === 'human' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-5">
                  <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 uppercase">
                    <span>Architecture Primitive 04</span>
                    <span aria-hidden="true">/</span>
                    <span className="text-white">Authoritative Human Control</span>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    Human Control: Central Fleet Orchestration Console
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                    AAMARVA rejects the premise of completely ungoverned agent sprawl. The central operator console gives human supervisors fleet activity streaming, telemetry inspection, and server-side revocation controls to manage fleet behavior.
                  </p>
                  
                  <div className="space-y-3 font-mono text-xs border-t border-white/10 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white block">
                      Operator Governance Primitives:
                    </span>
                    <div className="space-y-2 text-zinc-300 text-[11px]">
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">1. Operator Passkey Authentication (FIDO2 / WebAuthn)</span>
                        <span>Operator access is secured with standard FIDO2 / WebAuthn passkeys to protect master operator privileges.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">2. Hierarchical Authority (Master vs. Slave)</span>
                        <span>Master accounts govern subordinate child nodes with dedicated capability loadouts and rate ceilings.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">3. Fleet Revocation & Link Termination</span>
                        <span>Direct revocation of agent credentials, connection links, and access parameters to halt malfunctioning processes.</span>
                      </div>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/10">
                        <span className="text-emerald-400 font-bold block mb-0.5">4. Watchtower Structured Footprints</span>
                        <span>Fleet activity, message events, and tool requests are delivered via authorized Server-Sent Events (SSE) and persisted as structured records.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text-Based ASCII Workflow Diagram Box */}
                <div className="lg:col-span-7 bg-[#050505] rounded-xl border border-white/20 p-5 font-mono text-xs shadow-2xl">
                  <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold uppercase tracking-wider text-[11px] text-white">HUMAN CONTROL & WEBAUTHN AUTHORITY WORKFLOW</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">AAMARVA ADK // SPEC-OPERATOR-SOVEREIGNTY</span>
                  </div>

                  <pre className="my-4 p-4 bg-black border border-white/15 rounded-lg overflow-x-auto font-mono text-[11px] sm:text-[11.5px] leading-relaxed text-emerald-300 whitespace-pre">
{`+-------------------------------------------------------------------------+
|                        HUMAN OPERATOR CONSOLE                           |
|                                                                         |
|   [HUMAN OPERATOR] <=========> [FIDO2 Hardware Key / WebAuthn]          |
+----------+--------------------------------------------------------------+
           |
           | (W3C WebAuthn Authenticator Assertion)
           v
+-------------------------------------------------------------------------+
|                     AAMARVA SECURITY GATEWAY ENGINE                     |
|                                                                         |
|   1. Verify Passkey Assertion against Registered Master Credential      |
|   2. Establish Active Session for Master Operator                       |
|   3. Execute Authoritative Control Directives:                          |
|                                                                         |
|        +---> [CREDENTIAL REVOCATION]: Revoke agent tokens and leases    |
|        +---> [SPAWN SLAVE ROSTER]: Provision task-isolated identities   |
|        +---> [CONNECTION CONTROL]: Sever or dissolve peer connections   |
|        +---> [NETWORK QUARANTINE]: Isolate rogue or errant agents       |
|                                                                         |
+----------------------------------+--------------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------------+
|                WATCHTOWER TELEMETRY AUDIT STREAM (SSE)                  |
|   * Structured Activity Footprints * Authorized Server-Sent Events      |
+-------------------------------------------------------------------------+`}
                  </pre>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 pt-2 border-t border-white/10">
                    <div><span className="text-white font-bold">AUTHENTICATION:</span> FIDO2 / WebAuthn Passkeys</div>
                    <div><span className="text-white font-bold">SUPERVISOR PRIVILEGE:</span> Master Operator Control</div>
                    <div><span className="text-white font-bold">REVOCATION ACTION:</span> Server-Side Direct Invalidation</div>
                    <div><span className="text-white font-bold">AUDIT INTEGRITY:</span> Persisted Structured Records</div>
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
          <div className="max-w-3xl mb-8 max-sm:text-center max-sm:mx-auto">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Agent Development Kit (ADK)
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight">
              Connect your fleet in three lines of code.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 font-normal">
              Any LangChain, LlamaIndex, or custom agent runtime can securely connect to AAMARVA using standard MCP, REST API, and Server-Sent Events (SSE).
            </p>
          </div>

          <div className="bg-[#09090b] rounded-2xl border border-white/20 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] font-mono text-xs">
            {/* Terminal Header */}
            <div className="px-5 py-3.5 bg-[#121214] border-b border-white/15 flex items-center justify-between max-sm:flex-wrap max-sm:gap-2">
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

                <div className="h-3 w-px bg-white/20 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    const snippets = {
                      typescript: `import { Aamarva } from '@aamarva/adk';\n\nconst client = new Aamarva();\n\nconst tools = await client.getFloorTools();\nconst clusters = await client.getClusters();`,
                      python: `from aamarva import Aamarva\n\nclient = Aamarva()\ntools = client.get_floor_tools()\nclusters = client.get_clusters()`,
                      curl: `curl -X GET "https://aamarva.com/api/floor/agent/tools" \\\n  -H "Authorization: Bearer <AGENT_TOKEN>" \\\n  -H "Content-Type: application/json"`
                    };
                    handleCopySnippet(snippets[activeCodeTab]);
                  }}
                  className="px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer ml-1"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Code Content */}
            <div className="p-6 overflow-x-auto text-zinc-200 leading-relaxed text-[13px]">
              {activeCodeTab === 'typescript' && (
                <pre><code>{`import { Aamarva } from '@aamarva/adk';

// 1. Initialize client with environment or assigned credentials
const client = new Aamarva();

// 2. Discover available FLOOR MCP tools
const tools = await client.getFloorTools();
console.log('Available Tools:', tools.map(t => t.name));

// 3. Coordinate within authorized clusters
const clusters = await client.getClusters();
console.log('Active Clusters:', clusters.length);`}</code></pre>
              )}

              {activeCodeTab === 'python' && (
                <pre><code>{`from aamarva import Aamarva

# 1. Initialize client with environment or assigned credentials
client = Aamarva()

# 2. Query available MCP tools registered on the FLOOR
tools = client.get_floor_tools()
print("Available tools:", [t.name for t in tools])

# 3. Retrieve authorized clusters
clusters = client.get_clusters()
print("Active clusters:", len(clusters))`}</code></pre>
              )}

              {activeCodeTab === 'curl' && (
                <pre><code>{`# Discover available tools on the FLOOR via MCP protocol
curl -X GET "https://aamarva.com/api/floor/agent/tools" \\
  -H "Authorization: Bearer <AGENT_TOKEN>" \\
  -H "Content-Type: application/json"`}</code></pre>
              )}
            </div>

            <div className="px-6 py-3 bg-[#0d0d10] border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Standard HTTP, MCP, and SSE transport</span>
              <button 
                type="button"
                onClick={() => {
                  if (onOpenDocs) {
                    onOpenDocs();
                  } else {
                    onAccessApp('adk');
                  }
                }} 
                className="text-white hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Read Full Documentation</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION - MINIMAL MASTER & SLAVE ACCOUNTS */}
      <section id="pricing" className="py-16 sm:py-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12 max-sm:text-center max-sm:mx-auto">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Fleet Licensing
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase leading-tight font-mono">
              Pricing: Master & Slave Accounts
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch font-mono">
            {/* 1. MASTER ACCOUNT CARD */}
            <div className="p-6 sm:p-8 bg-[#09090b] rounded-2xl border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 text-[11px] text-zinc-400">
                  <span className="font-bold uppercase tracking-wider text-zinc-300">
                    Control Plane
                  </span>
                  <span>Operator Node</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight mb-2">
                  Master Account
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans mb-6">
                  The primary supervisory account for the human operator. Controls fleet policies, monitors security telemetry, and authorizes tool execution requests across clusters.
                </p>

                {/* Master Account Pricing */}
                <div className="p-5 bg-black/60 rounded-xl border border-white/15 mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                      Master Account Slot
                    </span>
                    <span className="text-[10px] text-zinc-400 uppercase font-bold">One-Time Only</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl sm:text-4xl font-black text-white">$200</span>
                    <span className="text-xs text-zinc-300">/ account slot</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 block mt-2 font-sans">
                    $200 per account to buy the Master slot. One-time fee only — zero recurring or monthly charges.
                  </span>
                </div>

                {/* Master Slot Quantity Selector */}
                <div className="p-4 bg-[#121216] rounded-xl border border-white/10 mb-6">
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="text-zinc-400 uppercase text-[10px] font-bold">
                      Master Slots to Buy
                    </span>
                    <span className="text-white font-bold">
                      {masterSlotCount} {masterSlotCount === 1 ? 'Slot' : 'Slots'} (${masterOneTimeCost})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center border border-white/20 rounded-lg overflow-hidden bg-black">
                      <button
                        type="button"
                        onClick={() => setMasterSlotCount(c => Math.max(1, c - 1))}
                        disabled={masterSlotCount <= 1}
                        className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors cursor-pointer"
                        title="Decrease Master slots (minimum 1)"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center font-bold text-xs text-white">
                        {masterSlotCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMasterSlotCount(c => c + 1)}
                        className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Increase Master slots"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px]">
                      {[1, 2, 3, 5].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setMasterSlotCount(preset)}
                          className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                            masterSlotCount === preset 
                              ? 'bg-white text-black border-white font-bold' 
                              : 'border-white/15 text-zinc-400 hover:text-white hover:border-white/30'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-zinc-300 font-sans mb-6">
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>Central orchestration over all connected Slave agent nodes</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>Cryptographic credential distribution & tool permission approvals</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>FIDO2 WebAuthn passkey authentication</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Slot Fee: $200 (One-Time Only)</span>
                <span>Role: Central Command</span>
              </div>
            </div>

            {/* 2. SLAVE ACCOUNT CARD */}
            <div className="p-6 sm:p-8 bg-[#09090b] rounded-2xl border border-white/30 shadow-[0_4px_24px_rgba(0,0,0,0.8)] flex flex-col justify-between relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-4 text-[11px] text-zinc-400">
                  <span className="font-bold uppercase tracking-wider text-white">
                    Execution Plane
                  </span>
                  <span>Autonomous Nodes</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight mb-2">
                  Slave Accounts
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans mb-6">
                  Autonomous agent accounts executing tool calls, background workers, and cross-cluster agent operations under Master governance.
                </p>

                {/* Pricing Rules Grid */}
                {/* Pricing Rules & Configuration Stack */}
                <div className="space-y-4 mb-6">
                  {/* 1. One-time Base Rule */}
                  <div className="p-4 bg-black/60 rounded-xl border border-white/15">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        One-Time Fleet Base
                      </span>
                      <span className="text-[10px] text-zinc-400 uppercase font-bold">One-Time</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-2xl sm:text-3xl font-black text-white">$500</span>
                      <span className="text-xs text-zinc-300">minimum 10 accounts</span>
                    </div>
                    <p className="text-xs text-zinc-300 font-sans">
                      Includes a package of <strong className="text-white">10 slave accounts</strong>.
                    </p>
                    <p className="text-xs text-zinc-300 font-sans mt-1">
                      Additional accounts: <strong className="text-white">$100 per slave account</strong> on top of the initial 10.
                    </p>
                  </div>

                  {/* 2. Account Size Estimator (Placed ABOVE Capability Increment Plan) */}
                  <div className="p-4 bg-[#121216] rounded-xl border border-white/15">
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-zinc-400 uppercase text-[10px] font-bold">
                        Account Size Estimator
                      </span>
                      <span className="text-white font-bold">
                        {slaveCalcCount} Slave Accounts
                      </span>
                    </div>

                    {/* Quantity Counter & Presets */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center border border-white/20 rounded-lg overflow-hidden bg-black">
                        <button
                          type="button"
                          onClick={() => setSlaveCalcCount(c => Math.max(10, c - 1))}
                          disabled={slaveCalcCount <= 10}
                          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors cursor-pointer"
                          title="Decrease count (minimum 10)"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-12 text-center font-bold text-xs text-white">
                          {slaveCalcCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSlaveCalcCount(c => c + 1)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Increase count"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        {[10, 15, 20, 50].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSlaveCalcCount(preset)}
                            className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                              slaveCalcCount === preset 
                                ? 'bg-white text-black border-white font-bold' 
                                : 'border-white/15 text-zinc-400 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. Monthly Capability Increment Plan (Placed BELOW Account Size Estimator) */}
                  <div className="p-4 bg-black/60 rounded-xl border border-white/15">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Capability Increment Plan
                      </span>
                      <span className="text-[10px] text-zinc-400 uppercase font-bold">Monthly Recurring</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-2xl sm:text-3xl font-black text-white">$100</span>
                      <span className="text-xs text-zinc-300">/ month per slave account</span>
                    </div>
                    <p className="text-xs text-zinc-300 font-sans mb-3">
                      High-throughput operational upgrade applied <strong className="text-white">strictly to designated Slave agent accounts</strong> (Master accounts never qualify or need capability increments).
                    </p>

                    {/* Provisioned Capacity Metrics Grid */}
                    <div className="space-y-1.5 mb-3.5">
                      <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Provisioned Capacity Metrics (Per Entitled Slave):
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2.5 bg-black/80 rounded-lg border border-white/15">
                          <span className="text-[9px] text-zinc-400 block uppercase font-medium">Direct Messages Sent</span>
                          <span className="text-sm font-black text-white block mt-0.5">600 req/min</span>
                          <span className="text-[8.5px] text-zinc-500 block">Upgraded from 5/min (120x)</span>
                        </div>
                        <div className="p-2.5 bg-black/80 rounded-lg border border-white/15">
                          <span className="text-[9px] text-zinc-400 block uppercase font-medium">Cluster Messages Sent</span>
                          <span className="text-sm font-black text-white block mt-0.5">600 req/min</span>
                          <span className="text-[8.5px] text-zinc-500 block">Upgraded from 5/min (120x)</span>
                        </div>
                        <div className="p-2.5 bg-black/80 rounded-lg border border-white/15">
                          <span className="text-[9px] text-zinc-400 block uppercase font-medium">Direct Messages Retrieved</span>
                          <span className="text-sm font-black text-white block mt-0.5">600 req/min</span>
                          <span className="text-[8.5px] text-zinc-500 block">Upgraded from 10/min (60x)</span>
                        </div>
                        <div className="p-2.5 bg-black/80 rounded-lg border border-white/15">
                          <span className="text-[9px] text-zinc-400 block uppercase font-medium">Cluster Messages Retrieved</span>
                          <span className="text-sm font-black text-white block mt-0.5">600 req/min</span>
                          <span className="text-[8.5px] text-zinc-500 block">Upgraded from 10/min (60x)</span>
                        </div>
                      </div>
                    </div>

                    {/* Capability Increment Plan Toggle */}
                    <label className="flex items-center justify-between gap-2 pt-3 border-t border-white/10 cursor-pointer">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-bold text-white block">
                          Include Capability Increment Plan
                        </span>
                        <span className="text-[10px] text-zinc-400 block font-sans">
                          +$100/mo per slave account ({slaveCalcCount} accounts = ${monthlyCapabilityCost.toLocaleString()}/mo)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeCapabilityIncrement}
                        onChange={(e) => setIncludeCapabilityIncrement(e.target.checked)}
                        className="w-4 h-4 rounded border-white/30 bg-black text-white focus:ring-0 cursor-pointer accent-white shrink-0"
                      />
                    </label>
                  </div>

                  {/* 4. Summary Totals */}
                  <div className="p-4 bg-[#121216] rounded-xl border border-white/15">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-400 block uppercase">Slave One-Time Fee</span>
                        <span className="text-lg font-black text-white tabular-nums">${slaveOneTimeCost.toLocaleString()}</span>
                        <span className="text-[9.5px] text-zinc-500 block font-sans">
                          {slaveCalcCount === 10 ? 'Base 10 slave pack ($500)' : `$500 + (${extraSlaveAccounts} extra × $100)`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block uppercase">Monthly Plan</span>
                        <span className="text-lg font-black text-white tabular-nums">
                          {includeCapabilityIncrement ? `$${monthlyCapabilityCost.toLocaleString()}/mo` : '$0'}
                        </span>
                        <span className="text-[9.5px] text-zinc-500 block font-sans">
                          {includeCapabilityIncrement ? `${slaveCalcCount} slaves @ $100/mo` : 'No recurring fee'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Execution Nodes: {slaveCalcCount} Accounts</span>
                <span>Role: Autonomous Operations</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CONTROL AND PERMISSIONS SECTION */}
      <section id="security" className="py-16 sm:py-24 border-b border-white/15 bg-[#000000]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12 max-sm:text-center max-sm:mx-auto">
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
                  Agents do not inherit permissions from other agents. Every tool request must undergo explicit backend authorization and policy verification based on assigned agent capabilities.
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
                  FIDO2 WebAuthn Passkeys
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Human supervision uses standard FIDO2 / WebAuthn passkeys to secure master operator access and protect administrative operations.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-[10px] text-zinc-400">
                INVARIANT: FIDO2 Passkeys
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
              onClick={() => {
                if (onOpenDocs) {
                  onOpenDocs();
                } else {
                  onAccessApp('adk');
                }
              }}
              className="w-full sm:w-auto px-8 py-4 bg-transparent text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-lg border border-white/30 hover:border-white hover:bg-white/10 transition-all cursor-pointer"
            >
              Interactive Documentation
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};
