import React, { useState } from 'react';
import { 
  Terminal, ShieldCheck, Key, Lock, Cpu, Layers, Share2, 
  CheckCircle2, ArrowRight, Play, RefreshCw, AlertTriangle, 
  FileCode, Database, Activity, UserCheck, Eye, Zap, BookOpen
} from 'lucide-react';

interface ProductSectionProps {
  onAccessApp?: (target?: 'login' | 'register' | 'adk') => void;
  onOpenDocs?: () => void;
}

export const ProductSection: React.FC<ProductSectionProps> = ({ onAccessApp, onOpenDocs }) => {
  const [activeModule, setActiveModule] = useState<'command-pit' | 'floor' | 'clusters' | 'passkey' | 'watchtower'>('command-pit');
  
  // Interactive Simulator State for FLOOR Tool Execution
  const [simStep, setSimStep] = useState<number>(1);
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simSelectedTool, setSimSelectedTool] = useState<string>('db_production_migration');

  const runSimulation = () => {
    if (simRunning) return;
    setSimRunning(true);
    setSimStep(1);
    
    setTimeout(() => {
      setSimStep(2);
      setTimeout(() => {
        setSimStep(3);
        setTimeout(() => {
          setSimStep(4);
          setTimeout(() => {
            setSimStep(5);
            setSimRunning(false);
          }, 900);
        }, 900);
      }, 900);
    }, 800);
  };

  return (
    <section id="product" className="py-20 sm:py-28 bg-[#000000] text-white border-b border-white/15 relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest">
              Core Platform
            </span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs text-white uppercase tracking-wider font-semibold">
              AAMARVA — Autonomous Agent Command Protocol & Infrastructure
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white uppercase leading-[1.08] mb-4">
            Total control over autonomous agents.
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-normal">
            AAMARVA provides the runtime coordination, cryptographic boundaries, and deterministic tool gateways needed to run production-grade autonomous agent fleets without risking data leakage or unmonitored execution.
          </p>
        </div>

        {/* 1. MODULE TABS SELECTOR */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-10 font-mono">
          <button
            type="button"
            onClick={() => setActiveModule('command-pit')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeModule === 'command-pit'
                ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)]'
                : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Terminal className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-black opacity-60">01</span>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-tight block">Command Pit</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">Fleet Supervision</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('floor')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeModule === 'floor'
                ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)]'
                : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-black opacity-60">02</span>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-tight block">FLOOR Protocol</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">MCP Tool Gateway</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('clusters')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeModule === 'clusters'
                ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)]'
                : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Layers className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-black opacity-60">03</span>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-tight block">Crypto Clusters</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">E2EE Workgroups</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('passkey')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeModule === 'passkey'
                ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)]'
                : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Key className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-black opacity-60">04</span>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-tight block">Passkey Vault</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">FIDO2 Passkeys</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('watchtower')}
            className={`col-span-2 md:col-span-1 p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              activeModule === 'watchtower'
                ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)]'
                : 'bg-[#09090b] text-zinc-300 border-white/15 hover:border-white/40 hover:bg-[#121214]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-black opacity-60">05</span>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-tight block">Watchtower</span>
              <span className="text-[10px] opacity-75 mt-0.5 block truncate">Structured Footprints</span>
            </div>
          </button>
        </div>

        {/* 2. ACTIVE MODULE DEEP DIVE CARD */}
        <div className="bg-[#09090b] rounded-2xl border border-white/20 p-6 sm:p-10 mb-16 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
          {activeModule === 'command-pit' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Terminal className="w-4 h-4 text-white" />
                  <span className="uppercase font-bold tracking-wider text-white">Command Pit // Sovereign Terminal</span>
                  <span className="text-zinc-600">·</span>
                  <span>Master-Controlled Runtime</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                  Centralized Fleet Supervision & Revocation Controls
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  The Command Pit gives master operators authoritative visibility over fleet accounts and processes. Provision dedicated slave accounts, inspect operational status, and manage access permissions before errant actions escalate.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 font-mono text-xs">
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Hierarchical Governance</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Master accounts retain absolute cryptographic authority over child slave nodes.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Fleet Quarantine & Terminate</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      One-click revocation of agent API keys and immediate token invalidation.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Dynamic Loadout Profiles</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Assign deterministic capability sets, rate thresholds, and model parameters.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Operational Status Monitoring</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Status indicators tracking active, disconnected, or isolated agent accounts.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-black border border-white/15 rounded-xl p-4 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-white font-bold">COMMAND_PIT.STATUS</span>
                  </div>
                  <span>ONLINE [FLEET: 12]</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">MASTER-OP-01 (SUPERVISOR)</div>
                      <div className="text-zinc-500 text-[10px]">Privilege: FULL_AUTHORITY</div>
                    </div>
                    <span className="text-emerald-400 text-[10px] font-bold">ACTIVE</span>
                  </div>
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-zinc-300">AMR-RESEARCH-SLAVE-01</div>
                      <div className="text-zinc-500 text-[10px]">Task: Data Synthesis</div>
                    </div>
                    <span className="text-emerald-400 text-[10px] font-bold">HEALTHY</span>
                  </div>
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-zinc-300">AMR-ANALYTICS-SLAVE-02</div>
                      <div className="text-zinc-500 text-[10px]">Task: Vector Querying</div>
                    </div>
                    <span className="text-emerald-400 text-[10px] font-bold">HEALTHY</span>
                  </div>
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-zinc-300">AMR-EXECUTOR-SLAVE-03</div>
                      <div className="text-zinc-500 text-[10px]">FLOOR MCP: db_migrator</div>
                    </div>
                    <span className="text-amber-400 text-[10px] font-bold">AWAITING_APPROVAL</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>POLICY: STRICT_HITL</span>
                  <span className="text-white">FAILSAFE: ACTIVE</span>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'floor' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Zap className="w-4 h-4 text-white" />
                  <span className="uppercase font-bold tracking-wider text-white">The FLOOR Protocol</span>
                  <span className="text-zinc-600">·</span>
                  <span>Model Context Protocol Gateway</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                  Governed Tool Discovery & Access Requests
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  Agents should never possess unmonitored production API keys or direct database credentials. The FLOOR intercepts external tool requests, validates argument schemas via MCP, requires human authorization for high-risk actions, and issues temporary access parameters once approved.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 font-mono text-xs">
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Standard MCP Interface</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Connect any Model Context Protocol compliant server in seconds.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">4-Phase Access Lifecycle</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Discover Tools, Request Access, Policy Verification, Temporary Credential Grant.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Governed Access Delegation</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Backend evaluates authorization requests and manages access parameters according to governance policies.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Schema Cache Invariant</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Verified synchronization across pending invocation and consumed states.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-black border border-white/15 rounded-xl p-4 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-white" />
                    <span className="text-white font-bold">FLOOR_MCP_FLOW</span>
                  </div>
                  <span>PROTOCOL v2.4</span>
                </div>
                <div className="bg-zinc-950 p-3 rounded border border-white/10 space-y-2 text-[11px]">
                  <div className="text-zinc-400">1. Agent discovers tools:</div>
                  <div className="text-emerald-400 font-bold font-mono pl-3">GET /api/floor/agent/tools</div>
                  <div className="text-zinc-400 mt-2">2. Agent requests tool execution:</div>
                  <div className="text-amber-400 font-bold font-mono pl-3">POST /api/floor/tools/:id/invoke</div>
                  <div className="text-zinc-400 mt-2">3. Human reviews request & authorizes:</div>
                  <div className="text-sky-400 font-bold font-mono pl-3">GET /api/floor/requests/:requestId</div>
                  <div className="text-zinc-400 mt-2">4. Temporary credentials minted:</div>
                  <div className="text-emerald-400 font-bold font-mono pl-3">POST /api/floor/invocations/:id/access</div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>TEMPORARY SESSION ACCESS</span>
                  <span className="text-emerald-400 font-bold">GOVERNED</span>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'clusters' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Layers className="w-4 h-4 text-white" />
                  <span className="uppercase font-bold tracking-wider text-white">Cryptographic Clusters</span>
                  <span className="text-zinc-600">·</span>
                  <span>End-to-End Encrypted Enclaves</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                  Strict Recipient-Only Multi-Agent Mesh
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  AAMARVA organizes agents into isolated clusters for targeted collaborative tasks. Communication is encrypted end-to-end with cryptographic recipient verification: only explicit recipients can retrieve or decrypt message payloads, with automatic, non-negotiable inclusion of the Master Account and Sender Account.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 font-mono text-xs">
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Recipient-Only Invariant</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Enforced server-side: non-recipients receive zero message content or metadata.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Master & Sender Inclusion</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Master and sender are always maintained in the recipient set without duplicates.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Authorized Key Management</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Versioned key derivation maintaining authorized encrypted access across members.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Zero Blind-Relay Leakage</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      The server relays ciphertext only; plaintext never touches platform storage.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-black border border-white/15 rounded-xl p-4 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-white" />
                    <span className="text-white font-bold">CLUSTER_SECURITY_AUDIT</span>
                  </div>
                  <span className="text-emerald-400">VERIFIED</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="p-2.5 bg-white/5 rounded border border-white/10">
                    <div className="text-zinc-400 text-[10px] mb-1">RECIPIENT_LIST_EVALUATION:</div>
                    <div className="text-white font-bold flex items-center justify-between">
                      <span>Master Account [SUPERVISOR]</span>
                      <span className="text-emerald-400 text-[10px]">INCLUDED</span>
                    </div>
                    <div className="text-white font-bold flex items-center justify-between mt-1">
                      <span>Sender Account [SLAVE_01]</span>
                      <span className="text-emerald-400 text-[10px]">INCLUDED</span>
                    </div>
                    <div className="text-zinc-400 flex items-center justify-between mt-1">
                      <span>Target Peer [SLAVE_02]</span>
                      <span className="text-emerald-400 text-[10px]">INCLUDED</span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-red-950/30 rounded border border-red-500/30 text-red-200">
                    <div className="text-[10px] font-bold text-red-400">UNAUTHORIZED_PEER [SLAVE_09]:</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Server query: HTTP 403 Forbidden. Ciphertext withheld. Group key unavailable.
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>ENCRYPTION: AES-256-GCM</span>
                  <span className="text-white">NO CIPHERTEXT LEAKS</span>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'passkey' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Key className="w-4 h-4 text-white" />
                  <span className="uppercase font-bold tracking-wider text-white">Passkey Vault</span>
                  <span className="text-zinc-600">·</span>
                  <span>FIDO2 / WebAuthn Passkeys</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                  FIDO2 Passkey Human Authority
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  High-risk fleet actions require human presence. With WebAuthn and FIDO2 passkeys, operators verify critical administrative actions, credential updates, and cluster policies. Automated scripts cannot impersonate the master operator.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 font-mono text-xs">
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Passkey Bound</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Cryptographic credentials managed via standard WebAuthn authenticators.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Phishing Proof</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Domain-scoped challenges prevent interception and credential reuse.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Credential Management</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Configure and rotate credentials under master operator authorization.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Passkey Verification</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Challenge-response verification for high-risk fleet operations.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-black border border-white/15 rounded-xl p-4 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                    <span className="text-white font-bold">WEBAUTHN_GATEWAY</span>
                  </div>
                  <span className="text-emerald-400">HARDWARE_ENCLAVE</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="p-3 bg-white/5 rounded border border-white/10">
                    <div className="text-white font-bold mb-1">HARDWARE PASSKEY ENROLLED</div>
                    <div className="text-zinc-400 text-[10px]">Credential: Apple TouchID / YubiKey 5C</div>
                    <div className="text-zinc-500 text-[9px] mt-1">AAGUID: 00000000-0000-0000-0000-000000000000</div>
                  </div>
                  <div className="p-3 bg-emerald-950/30 rounded border border-emerald-500/30 text-emerald-300">
                    <div className="font-bold text-[10px]">CHALLENGE VERIFICATION</div>
                    <div className="text-[10px] text-zinc-300 mt-1">
                      Action: Authorize DB Production Write · Signed with Secure Enclave signature. Verified.
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>STANDARD: W3C WEBAUTHN</span>
                  <span className="text-white">FIDO2 COMPLIANT</span>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'watchtower' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Activity className="w-4 h-4 text-white" />
                  <span className="uppercase font-bold tracking-wider text-white">Watchtower Telemetry</span>
                  <span className="text-zinc-600">·</span>
                  <span>Structured Activity Stream</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                  Complete Observability & Structured Footprints
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  Fleet activity, message events, and tool requests are delivered via authorized Server-Sent Events (SSE) and persisted as structured footprint records for comprehensive operational tracking across your fleet.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 font-mono text-xs">
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Real-Time Event Stream</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Server-Sent Events (SSE) feed directly into your operator console.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Structured Footprints</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Structured audit records identifying originating agent, timestamp, and action.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Rate Limit Observability</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Track quota utilization across external APIs and token budgets.
                    </span>
                  </div>
                  <div className="p-3.5 bg-black/60 rounded-xl border border-white/10">
                    <span className="font-bold text-white block mb-1">Activity Tracking</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed block">
                      Inspect historical agent operations and tool request lifecycle parameters.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-black border border-white/15 rounded-xl p-4 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-white" />
                    <span className="text-white font-bold">WATCHTOWER_FEED</span>
                  </div>
                  <span className="text-emerald-400 animate-pulse">LIVE STREAM</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-start gap-2">
                    <span className="text-zinc-500 text-[10px]">14:22:01</span>
                    <div>
                      <div className="text-white font-bold">TOOL_INVOKE: hello_test</div>
                      <div className="text-zinc-400 text-[10px]">Agent: AMR-RESEARCH-SLAVE-01 · 200 OK</div>
                    </div>
                  </div>
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-start gap-2">
                    <span className="text-zinc-500 text-[10px]">14:20:45</span>
                    <div>
                      <div className="text-white font-bold">CLUSTER_MSG: e2ee_broadcast</div>
                      <div className="text-zinc-400 text-[10px]">Cluster: research-squad · Recipients: 3</div>
                    </div>
                  </div>
                  <div className="p-2 bg-white/5 rounded border border-white/5 flex items-start gap-2">
                    <span className="text-zinc-500 text-[10px]">14:18:12</span>
                    <div>
                      <div className="text-white font-bold">PASSKEY_VERIFY: operator_session</div>
                      <div className="text-zinc-400 text-[10px]">Operator: kjk · Passkey Signature OK</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>AUDIT STATUS: RECORDED</span>
                  <span className="text-emerald-400">PERSISTED FOOTPRINTS</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. INTERACTIVE SIMULATOR: THE 4-PHASE FLOOR EXECUTION LIFECYCLE */}
        <div className="bg-[#09090b] rounded-2xl border border-white/20 p-6 sm:p-10 mb-16 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
            <div>
              <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                Local Simulation
              </span>
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                Simulated 4-Phase FLOOR Tool Gateway
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Demonstration illustrating how an autonomous agent requests tool access parameters through AAMARVA (local example).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={simSelectedTool}
                onChange={(e) => setSimSelectedTool(e.target.value)}
                className="bg-black text-white text-xs font-mono px-3 py-2 rounded-lg border border-white/20 focus:outline-none focus:border-white"
              >
                <option value="db_production_migration">Tool: db_production_migration (High Risk)</option>
                <option value="vector_query_search">Tool: vector_query_search (Read Only)</option>
                <option value="transfer_cluster_ownership">Tool: transfer_ownership (Admin)</option>
              </select>

              <button
                type="button"
                onClick={runSimulation}
                disabled={simRunning}
                className="px-4 py-2 bg-white text-black font-mono font-black text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {simRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{simRunning ? 'Executing...' : 'Run Simulation'}</span>
              </button>
            </div>
          </div>

          {/* Stepper Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono text-xs mb-8">
            <div className={`p-4 rounded-xl border transition-all ${
              simStep >= 1 ? 'bg-white/10 border-white text-white' : 'bg-black/40 border-white/10 text-zinc-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold">STAGE 01</span>
                {simStep > 1 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="w-2 h-2 rounded-full bg-white/60"></span>}
              </div>
              <span className="font-bold block text-xs">Agent Invocation</span>
              <span className="text-[10px] text-zinc-400 block mt-1">POST /api/floor/tools/:id/invoke</span>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              simStep >= 2 ? 'bg-white/10 border-white text-white' : 'bg-black/40 border-white/10 text-zinc-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold">STAGE 02</span>
                {simStep > 2 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="w-2 h-2 rounded-full bg-white/60"></span>}
              </div>
              <span className="font-bold block text-xs">Policy & HITL Check</span>
              <span className="text-[10px] text-zinc-400 block mt-1">GET /api/floor/requests/:id</span>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              simStep >= 3 ? 'bg-white/10 border-white text-white' : 'bg-black/40 border-white/10 text-zinc-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold">STAGE 03</span>
                {simStep > 3 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="w-2 h-2 rounded-full bg-white/60"></span>}
              </div>
              <span className="font-bold block text-xs">Access Token Grant</span>
              <span className="text-[10px] text-zinc-400 block mt-1">POST /api/floor/invocations/:id/access</span>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              simStep >= 4 ? 'bg-white/10 border-white text-white' : 'bg-black/40 border-white/10 text-zinc-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold">STAGE 04</span>
                {simStep >= 5 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="w-2 h-2 rounded-full bg-white/60"></span>}
              </div>
              <span className="font-bold block text-xs">Access Parameters & Log</span>
              <span className="text-[10px] text-zinc-400 block mt-1">Watchtower Footprint Recorded</span>
            </div>
          </div>

          {/* Interactive Console Terminal Output */}
          <div className="bg-black border border-white/20 rounded-xl p-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-zinc-500 text-[10px]">
              <span className="text-zinc-300 font-bold">GATEWAY_SESSION_LOG // LOCAL SIMULATOR</span>
              <span>STATE: {simStep === 5 ? 'COMPLETED' : simRunning ? 'PROCESSING' : 'READY'}</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-zinc-300">
              <p className="text-zinc-500">[0.00s] Initializing FLOOR execution simulator for tool: <span className="text-white font-bold">{simSelectedTool}</span></p>
              
              {simStep >= 1 && (
                <p className="text-sky-300">
                  [0.12s] <span className="text-white font-bold">AMR-SLAVE-01</span> created invocation request <span className="text-zinc-400 font-mono">inv_sim_{simSelectedTool.slice(0, 8)}</span>
                </p>
              )}

              {simStep >= 2 && (
                <p className="text-amber-300">
                  [0.45s] Policy Engine: Tool flagged as HIGH_RISK. Status: <span className="font-bold text-white">PENDING_OPERATOR_APPROVAL</span>. Operator review required.
                </p>
              )}

              {simStep >= 3 && (
                <p className="text-emerald-300">
                  [0.91s] Operator passkey approval confirmed. Status transitioned to <span className="font-bold text-white">ACCEPTED</span>.
                </p>
              )}

              {simStep >= 4 && (
                <p className="text-emerald-400">
                  [1.34s] Ephemeral access details granted via <span className="font-mono text-white">/access</span>. Single retrieval committed.
                </p>
              )}

              {simStep >= 5 && (
                <div className="pt-2 text-zinc-200 border-t border-white/10 mt-2 space-y-1">
                  <p className="text-emerald-400 font-bold">
                    [1.78s] Access details received for MCP connection.
                  </p>
                  <p className="text-zinc-400 text-[10px]">
                    Watchtower Footprint ID: <span className="text-white font-mono">fp_89df2c449a0e1</span> · Structured event logged for Master and Sender.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. COMPARISON MATRIX: AAMARVA VS TRADITIONAL LLM FRAMEWORKS */}
        <div className="mb-16">
          <div className="max-w-2xl mb-8">
            <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-1">
              Architectural Standard
            </span>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Why Sovereign Infrastructure Matters
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1">
              Most multi-agent frameworks rely on plain Python scripts and open network sockets. AAMARVA introduces zero-trust boundaries built specifically for autonomous agents.
            </p>
          </div>

          <div className="overflow-x-auto border border-white/20 rounded-2xl bg-[#09090b]">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/15 bg-white/5 text-zinc-300">
                  <th className="p-4 sm:p-5 font-bold uppercase">Capability</th>
                  <th className="p-4 sm:p-5 font-black uppercase text-white bg-white/10 border-x border-white/15">
                    AAMARVA Fleet OS
                  </th>
                  <th className="p-4 sm:p-5 font-normal uppercase text-zinc-500">
                    Traditional Scripting / Raw Frameworks
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-zinc-300 text-[11px] sm:text-xs">
                <tr>
                  <td className="p-4 sm:p-5 font-bold text-white">Tool Execution Gateway</td>
                  <td className="p-4 sm:p-5 bg-white/5 border-x border-white/15 text-white font-semibold">
                    <span className="text-emerald-400 font-black">FLOOR MCP:</span> Governed tool access and temporary credential parameters
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">
                    Raw API keys hardcoded into environment variables or prompt strings
                  </td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-bold text-white">Agent-to-Agent Messaging</td>
                  <td className="p-4 sm:p-5 bg-white/5 border-x border-white/15 text-white font-semibold">
                    <span className="text-emerald-400 font-black">E2EE Cryptographic Mesh:</span> Strict recipient-only visibility invariant
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">
                    Plaintext HTTP or Redis queues without peer verification or encryption
                  </td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-bold text-white">Human Authority & Elevation</td>
                  <td className="p-4 sm:p-5 bg-white/5 border-x border-white/15 text-white font-semibold">
                    <span className="text-emerald-400 font-black">FIDO2 / WebAuthn:</span> Passkey authentication for critical operator actions
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">
                    Command line `input()` prompts or unauthenticated webhook endpoints
                  </td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-bold text-white">Fleet Hierarchy & Roles</td>
                  <td className="p-4 sm:p-5 bg-white/5 border-x border-white/15 text-white font-semibold">
                    <span className="text-emerald-400 font-black">Master/Slave Isolation:</span> Super-operator commands and quota governance
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">
                    Flat peer networks with no role enforcement or permission boundaries
                  </td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-bold text-white">Observability & Audit</td>
                  <td className="p-4 sm:p-5 bg-white/5 border-x border-white/15 text-white font-semibold">
                    <span className="text-emerald-400 font-black">Watchtower Telemetry:</span> Authorized SSE stream and structured footprint records
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">
                    Ephemeral console stdout logs that disappear on restart
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. CALL TO ACTION / TRANSITION BAR */}
        <div className="p-8 sm:p-12 rounded-2xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-black border border-white/20 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_4px_30px_rgba(255,255,255,0.1)]">
          <div className="space-y-2 text-center md:text-left">
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest block">
              Ready to deploy your sovereign fleet?
            </span>
            <h4 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
              Command your agents with deterministic safety.
            </h4>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-xl font-sans">
              Create your Master Account, provision child slave nodes, and integrate with any Model Context Protocol tool server in minutes.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto font-mono">
            <button
              type="button"
              onClick={() => onAccessApp ? onAccessApp('register') : null}
              className="w-full sm:w-auto px-6 py-3.5 bg-white text-black font-black text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.25)]"
            >
              <span>Access AAMARVA</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>

            {onOpenDocs && (
              <button
                type="button"
                onClick={onOpenDocs}
                className="w-full sm:w-auto px-6 py-3.5 bg-black text-white font-black text-xs uppercase tracking-wider rounded-lg border border-white/30 hover:border-white hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Documentation</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </section>
  );
};
