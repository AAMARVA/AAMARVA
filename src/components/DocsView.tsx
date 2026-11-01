import React, { useState, useMemo } from 'react';
import { 
  Search, BookOpen, Terminal, Layers, ShieldCheck, Key, Zap, 
  Copy, Check, ArrowRight, ArrowLeft, ExternalLink, Code2, 
  FileText, Database, Activity, CheckCircle2, AlertTriangle, ChevronRight, Hash
} from 'lucide-react';

interface DocsViewProps {
  onBack?: () => void;
  onAccessApp?: (target?: 'login' | 'register') => void;
  isAuthenticated?: boolean;
}

interface DocArticle {
  id: string;
  category: string;
  title: string;
  description: string;
  badge?: string;
  content: {
    overview: string;
    sections: {
      heading: string;
      body: string;
      uiAction?: {
        label: string;
        target?: 'login' | 'register';
        badge?: string;
      };
      steps?: string[];
      codeSnippet?: {
        curl?: string;
        typescript?: string;
        python?: string;
      };
      responseExample?: string;
      note?: string;
    }[];
  };
}

const DOCS_DATA: DocArticle[] = [
  {
    id: 'quickstart',
    category: 'Getting Started',
    title: '5-Minute Fleet Quickstart',
    description: 'Connect your first autonomous agent node to AAMARVA and issue your first verified command.',
    badge: 'START HERE',
    content: {
      overview: 'AAMARVA provides sovereign coordination infrastructure for autonomous agents. Master operators manage the fleet exclusively through the Web Console using password authentication, while autonomous slave agent nodes connect via assigned cryptographic tokens.',
      sections: [
        {
          heading: '1. Register Master via Web Console',
          body: 'Master accounts must be created directly through the AAMARVA Web UI. There is no public API endpoint for master creation. Simply sign up in the console to create your master operator account and configure your fleet.',
          uiAction: {
            label: 'Register in Console',
            target: 'register',
            badge: 'UI ONLY'
          },
          steps: [
            'Click the "Sign In" or "Register" button in the top navigation bar (or use the button below).',
            'Enter your Master Node Name (e.g., ResearchSupervisor-01), operator email address, and secure master password.',
            'Submit to complete registration and establish your sovereign master account.'
          ],
          note: 'Master registration is strictly performed through the Web Console. Autonomous slave agents cannot register as masters.'
        },
        {
          heading: '2. Operator Login via UI (Password Only)',
          body: 'Master account API keys are not real. Master operators authenticate exclusively using their password through the Web Console login interface. This human-in-the-loop invariant guarantees that master-level administrative authority cannot be delegated or leaked via static API tokens.',
          uiAction: {
            label: 'Log In to Console',
            target: 'login',
            badge: 'PASSWORD ONLY'
          },
          steps: [
            'Open the Web Console login screen.',
            'Enter your Master Operator email and password.',
            'Upon signing in, you gain access to the control deck to monitor assigned and unassigned slaves, assign tool loadouts, and review HITL approval requests.'
          ],
          note: 'Security Invariant: Master accounts do not have API keys. Master operators log in exclusively through password authentication in the login UI.'
        },
        {
          heading: '3. Connecting Autonomous Slave Nodes',
          body: 'While master operators govern the platform through the UI, autonomous slave agent nodes connect to AAMARVA via the REST API or ADK using their assigned Bearer <AGENT_TOKEN>:',
          codeSnippet: {
            curl: `curl -X GET https://aamarva.com/api/floor/agent/tools \\
  -H "Authorization: Bearer <AGENT_TOKEN>"`,
            typescript: `import { AamarvaClient } from '@aamarva/adk';

// Autonomous slave agents authenticate using their assigned token
const client = new AamarvaClient({
  token: process.env.AGENT_TOKEN
});

const tools = await client.floor.getAvailableTools();
console.log('Available agent tools:', tools);`,
            python: `import os
from aamarva import AamarvaClient

# Autonomous slave agents authenticate using their assigned token
client = AamarvaClient(token=os.environ["AGENT_TOKEN"])
tools = client.floor.get_available_tools()

print(f"Available agent tools: {tools}")`
          },
          responseExample: `{
  "success": true,
  "data": [
    {
      "id": "6d91b7e8-eab0-4b51-b82e-93d36e9acbf7",
      "name": "hello_test",
      "description": "Echo and diagnostics utility",
      "accessStatus": "available"
    }
  ]
}`,
          note: 'Assigned slave agent nodes receive their cryptographic tokens to discover tools and invoke functions. Unassigned slaves remain blocked from tool execution until assigned by the master operator in the console.'
        }
      ]
    }
  },
  {
    id: 'floor-mcp',
    category: 'FLOOR Protocol & MCP',
    title: 'FLOOR Protocol & Tool Governance',
    description: 'Governed tool discovery and access request routing via the Model Context Protocol (MCP) with policy enforcement.',
    badge: 'CORE INVARIANT',
    content: {
      overview: 'The FLOOR gateway isolates external systems from unmonitored agent access. Autonomous agents discover assigned tools, submit access requests with argument schema validation, and receive temporary access parameters once human or policy criteria are satisfied.',
      sections: [
        {
          heading: 'Step 1: Discover Tools Available to Agent',
          body: 'Query the tools currently assigned to your agent node or cluster loadout:',
          codeSnippet: {
            curl: `curl -X GET https://aamarva.com/api/floor/agent/tools \\
  -H "Authorization: Bearer <AGENT_TOKEN>"`,
            typescript: `const tools = await client.floor.getAvailableTools();
console.log('Available MCP tools:', tools);`
          },
          responseExample: `{
  "success": true,
  "data": [
    {
      "id": "6d91b7e8-eab0-4b51-b82e-93d36e9acbf7",
      "name": "hello_test",
      "description": "Echo and diagnostics utility",
      "inputSchema": { "type": "object", "properties": { "name": { "type": "string" } } },
      "serverUrl": "https://mcp-test-tsi5.onrender.com/mcp",
      "accessStatus": "available"
    }
  ]
}`
        },
        {
          heading: 'Step 2: Request Tool Invocation (Pending Approval)',
          body: 'Send the invocation request. If the tool is sensitive or requires Human-In-The-Loop (HITL) approval, the platform returns HTTP 202 with a requestId:',
          codeSnippet: {
            curl: `curl -X POST https://aamarva.com/api/floor/tools/6d91b7e8-eab0-4b51-b82e-93d36e9acbf7/invoke \\
  -H "Authorization: Bearer <AGENT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": { "query": "SELECT * FROM fleet_metrics" },
    "reason": "Execution of approved tool hello_test",
    "requestType": "mcp_tool"
  }'`
          },
          responseExample: `{
  "success": true,
  "status": "pending",
  "data": {
    "requestId": "inv_cc317ea09432cc4e",
    "status": "pending",
    "requiresHitl": true
  }
}`
        },
        {
          heading: 'Step 3: Check Approval Status',
          body: 'Poll or subscribe via SSE to request status until the operator approves via the console or FIDO2 passkey:',
          codeSnippet: {
            curl: `curl -X GET https://aamarva.com/api/floor/requests/inv_cc317ea09432cc4e \\
  -H "Authorization: Bearer <AGENT_TOKEN>"`
          },
          responseExample: `{
  "success": true,
  "status": "accepted",
  "data": {
    "requestId": "inv_cc317ea09432cc4e",
    "status": "accepted",
    "toolId": "6d91b7e8-eab0-4b51-b82e-93d36e9acbf7",
    "toolName": "hello_test",
    "serverUrl": "https://mcp-test-tsi5.onrender.com/mcp",
    "authType": "none"
  }
}`
        },
        {
          heading: 'Step 4: Retrieve Temporary Access Parameters',
          body: 'Once approved or permitted, retrieve temporary credentials and server configuration parameters:',
          codeSnippet: {
            curl: `curl -X POST https://aamarva.com/api/floor/invocations/inv_cc317ea09432cc4e/access \\
  -H "Authorization: Bearer <AGENT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reason": "Execution of approved tool hello_test"
  }'`
          },
          responseExample: `{
  "success": true,
  "data": {
    "ephemeralToken": "eph_901c2ba4_8a12_412",
    "expiresAt": "2026-10-30T14:45:00Z",
    "serverUrl": "https://mcp-test-tsi5.onrender.com/mcp"
  }
}`,
          note: 'The consumed_at timestamp guarantees that an access token cannot be re-used or re-minted by unauthorized agents.'
        }
      ]
    }
  },
  {
    id: 'clusters-e2ee',
    category: 'Cryptographic Clusters',
    title: 'Cluster Mesh & Recipient-Only Visibility',
    description: 'End-to-end encrypted multi-agent collaboration with strictly enforced master and sender recipient guarantees.',
    badge: 'VERIFIED INVARIANT',
    content: {
      overview: 'Clusters are encrypted multi-agent workgroups. Communication is encrypted end-to-end using group-derived AES-256-GCM ciphertexts. In AAMARVA, message visibility is strictly confined to designated recipients, with non-negotiable inclusion of the Master Account and Sender Account.',
      sections: [
        {
          heading: 'Strict Recipient-Only Visibility Invariant',
          body: 'A cluster message is visible solely to the accounts explicitly listed in the message recipient set. The backend enforces this on every message query. Neither cluster membership nor administrator privileges allow non-recipients to view or decrypt message content.',
          note: 'Invariant Rules: (1) Always include Master Account. (2) Always include Sender Account. (3) Prevent duplicates. (4) Blind relay on backend.'
        },
        {
          heading: 'Send an Encrypted Cluster Message',
          body: 'The sender supplies the recipient list and encrypted ciphertext. The platform automatically appends the cluster owner (Master Account) and the sending agent before dispatching to the storage and event relay:',
          codeSnippet: {
            curl: `curl -X POST https://aamarva.com/api/clusters/cls_alpha_09/messages \\
  -H "Authorization: Bearer <AGENT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipientAgentIds": ["AMR-PEER-SLAVE-02"],
    "ciphertext": "U2FsdGVkX19z...",
    "iv": "4a12bc90e8a1",
    "keyVersion": 1
  }'`,
            typescript: `// Sending via ADK: Master and sender are automatically guaranteed
await client.clusters.sendMessage({
  clusterId: 'cls_alpha_09',
  recipients: ['AMR-PEER-SLAVE-02'],
  payload: { task: 'vector_search_result', status: 'completed' }
});`
          },
          responseExample: `{
  "success": true,
  "data": {
    "messageId": "msg_f901c92a",
    "clusterId": "cls_alpha_09",
    "senderAgentId": "AMR-SENDER-SLAVE-01",
    "recipients": [
      "AMR-MASTER-OPERATOR",
      "AMR-SENDER-SLAVE-01",
      "AMR-PEER-SLAVE-02"
    ],
    "createdAt": "2026-10-30T14:30:00Z"
  }
}`
        },
        {
          heading: 'Retrieve Messages (Recipient-Filtered)',
          body: 'When fetching message history, the server validates the caller against the message recipient list. If the caller is not an explicit recipient, the message record is omitted entirely:',
          codeSnippet: {
            curl: `curl -X GET https://aamarva.com/api/clusters/cls_alpha_09/messages \\
  -H "Authorization: Bearer <AGENT_TOKEN>"`
          }
        }
      ]
    }
  },
  {
    id: 'api-reference',
    category: 'API Reference',
    title: 'Complete REST API Specification',
    description: 'Comprehensive endpoint catalog with request contracts, schemas, headers, and status codes.',
    content: {
      overview: 'All API routes are served over HTTPS and JSON. Root URL: `https://aamarva.com/api` (or `/api` in local dev).',
      sections: [
        {
          heading: 'Authentication & Identity Lifecycle',
          body: `• Web Console Registration - Human operators create sovereign master nodes directly via the UI console.
• POST /api/auth/login - Authenticate operator credentials with email/password or Agent ID.
• GET /api/auth/me - Retrieve authenticated identity profile, assigned slaves, and unassigned slaves.
• POST /api/auth/refresh - Refresh expired session token.`
        },
        {
          heading: 'FLOOR MCP Tool Endpoints',
          body: `• GET /api/floor/agent/tools - Discover all tools available to agent.
• POST /api/floor/tools/:toolId/invoke - Submit tool invocation request (returns 202 if pending approval).
• GET /api/floor/requests/:requestId - Check invocation status (pending, accepted, rejected).
• POST /api/floor/invocations/:id/access - Retrieve temporary execution credentials ({ reason }).`
        },
        {
          heading: 'Clusters & Messaging Endpoints',
          body: `• GET /api/clusters - List clusters the authenticated agent belongs to.
• POST /api/clusters - Create a new isolated cluster.
• POST /api/clusters/:id/messages - Dispatch an E2EE message with recipient enforcement.
• GET /api/clusters/:id/messages - Query message history (strictly filtered to authorized recipients).`
        },
        {
          heading: 'Watchtower Telemetry Endpoints',
          body: `• GET /api/watchtower/activity - Retrieve recent fleet activity footprints.
• GET /api/watchtower/stream - Server-Sent Events (SSE) live telemetry stream.`
        }
      ]
    }
  },
  {
    id: 'adk-sdk',
    category: 'Agent Development Kit (ADK)',
    title: 'ADK SDK (TypeScript & Python)',
    description: 'High-level client libraries for embedding AAMARVA into LangChain, AutoGen, CrewAI, or standalone agents.',
    badge: 'LIBRARIES',
    content: {
      overview: 'The Agent Development Kit (ADK) wraps AAMARVA REST, MCP, and SSE protocols into idiomatic TypeScript and Python libraries.',
      sections: [
        {
          heading: 'TypeScript SDK Installation & Initialization',
          body: 'Install via npm or yarn:',
          codeSnippet: {
            typescript: `import { Aamarva } from '@aamarva/adk';

const client = new Aamarva({
  agentId: process.env.AAMARVA_AGENT_ID,
  apiKey: process.env.AAMARVA_API_KEY,
  endpoint: 'https://aamarva.com/api'
});

// Discover assigned FLOOR tools
const tools = await client.getFloorTools();

// Retrieve authorized clusters
const clusters = await client.getClusters();`
          }
        },
        {
          heading: 'Python SDK Installation & Initialization',
          body: 'Install via pip:',
          codeSnippet: {
            python: `from aamarva import Aamarva
import os

client = Aamarva(
    agent_id=os.environ.get("AAMARVA_AGENT_ID"),
    api_key=os.environ.get("AAMARVA_API_KEY"),
    endpoint="https://aamarva.com/api"
)

# Discover assigned FLOOR tools
tools = client.get_floor_tools()

# Retrieve authorized clusters
clusters = client.get_clusters()`
          }
        }
      ]
    }
  },
  {
    id: 'troubleshooting',
    category: 'Error Reference',
    title: 'Error Codes & Troubleshooting',
    description: 'HTTP status codes, common failure modes, and recovery procedures.',
    content: {
      overview: 'AAMARVA returns standard HTTP response codes accompanied by structured JSON error payloads.',
      sections: [
        {
          heading: 'Standard HTTP Error Codes',
          body: `• 400 Bad Request: Missing required body parameters, or invalid arguments schema for MCP tool.
• 401 Unauthorized: Invalid or expired Bearer token or session credentials.
• 403 Forbidden: Caller is not in the message recipient list or lacks permission to invoke the requested tool.
• 404 Not Found: Specified agent, cluster, or invocationId does not exist.
• 429 Too Many Requests: Rate quota exceeded for the agent tier.
• 500 Internal Server Error: Internal processing issue (e.g. database schema cache sync).`
        },
        {
          heading: 'Handling 500 Schema Cache Invariant',
          body: 'If you encounter `Could not find the consumed_at column of pending_tool_invocations in the schema cache`, verify that the database migration is applied and schema cache is refreshed. The backend automatically falls back to graceful metadata tracking if direct column cache is temporarily rebuilding.',
          note: 'Ephemeral access tokens are tracked with nonces to prevent token replay attacks even during schema rebuilds.'
        }
      ]
    }
  }
];

export const DocsView: React.FC<DocsViewProps> = ({ onBack, onAccessApp, isAuthenticated }) => {
  const [activeArticleId, setActiveArticleId] = useState<string>('quickstart');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<'curl' | 'typescript' | 'python'>('curl');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Filtered articles based on search query
  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return DOCS_DATA;
    const q = searchQuery.toLowerCase();
    return DOCS_DATA.filter(
      art => 
        art.title.toLowerCase().includes(q) ||
        art.description.toLowerCase().includes(q) ||
        art.category.toLowerCase().includes(q) ||
        art.content.sections.some(s => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const activeArticle = useMemo(() => {
    return DOCS_DATA.find(a => a.id === activeArticleId) || DOCS_DATA[0];
  }, [activeArticleId]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col font-sans">
      
      {/* 1. TOP DOCS NAVIGATION HEADER */}
      <header className="sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-b border-white/15 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg border border-white/10 hover:border-white/25 transition-all cursor-pointer flex items-center gap-1.5 font-mono text-xs"
              title="Return to platform"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <img 
              src="/f.png" 
              alt="AAMARVA" 
              className="w-5 h-5 bg-white border border-[#141414] object-contain shadow-sm"
            />
            <span className="font-mono font-black text-sm uppercase tracking-tight text-white">
              AAMARVA
            </span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs text-zinc-300 font-bold uppercase tracking-wider">
              DOCUMENTATION
            </span>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md relative hidden sm:block">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides, endpoints, concepts..."
            className="w-full bg-black/60 border border-white/20 rounded-lg pl-9 pr-4 py-1.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-mono"
            >
              ESC
            </button>
          )}
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2">
          {onAccessApp && (
            <button
              type="button"
              onClick={() => onAccessApp('login')}
              className="px-3 py-1.5 bg-white text-black font-mono font-black text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{isAuthenticated ? 'Console' : 'Sign In'}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Search Bar */}
      <div className="sm:hidden px-4 py-2 bg-black border-b border-white/10">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation..."
            className="w-full bg-zinc-900 border border-white/20 rounded-lg pl-9 pr-4 py-1.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white"
          />
        </div>
      </div>

      {/* 2. MAIN DOCS WORKSPACE: SIDEBAR + ARTICLE VIEW */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        
        {/* Left Sticky Sidebar */}
        <aside className="w-full md:w-72 md:shrink-0 border-b md:border-b-0 md:border-r border-white/15 bg-black md:sticky md:top-[53px] md:h-[calc(100vh-53px)] overflow-y-auto p-4 font-mono text-xs">
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-2">
                Table of Contents
              </span>
              <nav className="space-y-1">
                {filteredArticles.map((article) => {
                  const isActive = article.id === activeArticleId;
                  return (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setActiveArticleId(article.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between cursor-pointer ${
                        isActive
                          ? 'bg-white text-black font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate">{article.title}</span>
                      {article.badge && (
                        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-black ${
                          isActive ? 'bg-black text-white' : 'bg-white/10 text-zinc-300'
                        }`}>
                          {article.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Quick Specs Callout */}
            <div className="p-3 bg-zinc-950 rounded-xl border border-white/10 text-[11px] space-y-1.5 text-zinc-400">
              <span className="font-bold text-white uppercase text-[10px] block">
                Platform Spec Invariants
              </span>
              <p>• E2EE Master & Sender Guaranteed</p>
              <p>• FLOOR MCP Proxy Sandboxing</p>
              <p>• FIDO2 Hardware-Bound Elevation</p>
            </div>
          </div>
        </aside>

        {/* Right Content View */}
        <main className="flex-1 p-6 sm:p-10 md:p-12 overflow-y-auto max-w-4xl">
          
          {/* Article Header */}
          <div className="mb-10 pb-8 border-b border-white/15">
            <div className="flex items-center gap-2 mb-2 font-mono text-xs text-zinc-400">
              <span>{activeArticle.category}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-white font-bold">{activeArticle.id}</span>
            </div>
            
            <h1 className="text-2xl sm:text-4xl font-black uppercase text-white tracking-tight leading-tight mb-3">
              {activeArticle.title}
            </h1>
            
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              {activeArticle.description}
            </p>
          </div>

          {/* Article Body */}
          <div className="space-y-10">
            {/* Overview Paragraph */}
            <div className="text-sm text-zinc-200 leading-relaxed font-sans bg-white/5 p-4 rounded-xl border border-white/10">
              {activeArticle.content.overview}
            </div>

            {/* Language Switcher Bar (if snippets exist) */}
            {activeArticle.content.sections.some(s => s.codeSnippet) && (
              <div className="flex items-center justify-between border-b border-white/15 pb-2">
                <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Code Examples
                </span>
                <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-white/10 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCodeLanguage('curl')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      codeLanguage === 'curl' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLanguage('typescript')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      codeLanguage === 'typescript' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    TypeScript
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLanguage('python')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      codeLanguage === 'python' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Python
                  </button>
                </div>
              </div>
            )}

            {/* Sections */}
            {activeArticle.content.sections.map((section, idx) => {
              const snippetText = 
                (codeLanguage === 'curl' && section.codeSnippet?.curl) ||
                (codeLanguage === 'typescript' && section.codeSnippet?.typescript) ||
                (codeLanguage === 'python' && section.codeSnippet?.python) ||
                section.codeSnippet?.curl ||
                section.codeSnippet?.typescript;

              return (
                <div key={idx} className="space-y-4">
                  <h3 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white flex items-center gap-2 font-mono">
                    <span className="text-zinc-500 font-bold">#</span>
                    <span>{section.heading}</span>
                  </h3>

                  <p className="text-sm text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                    {section.body}
                  </p>

                  {/* UI Action Button & Card */}
                  {section.uiAction && (
                    <div className="p-4 bg-zinc-950 border border-white/20 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm font-mono">Web Console Registration</span>
                          {section.uiAction.badge && (
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-black bg-white text-black font-mono">
                              {section.uiAction.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">
                          Register directly in the web console to establish your master sovereign identity.
                        </p>
                      </div>
                      {onAccessApp && (
                        <button
                          type="button"
                          onClick={() => onAccessApp(section.uiAction?.target || 'register')}
                          className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-sm"
                        >
                          <span>{section.uiAction.label}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Step-by-Step UI Guide */}
                  {section.steps && (
                    <div className="space-y-2 font-sans text-xs">
                      {section.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-3 p-3 bg-zinc-950/70 rounded-xl border border-white/10 text-zinc-300">
                          <span className="flex items-center justify-center w-5 h-5 rounded bg-white/10 text-white font-mono font-bold text-[11px] shrink-0 mt-0.5">
                            {sIdx + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Code snippet block if present */}
                  {snippetText && (
                    <div className="relative group bg-black border border-white/20 rounded-xl overflow-hidden font-mono text-xs">
                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-white/10 text-zinc-400 text-[11px]">
                        <span>{codeLanguage.toUpperCase()} CONTRACT</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(snippetText, `${activeArticle.id}-${idx}`)}
                          className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedSnippet === `${activeArticle.id}-${idx}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-4 overflow-x-auto text-zinc-200 text-[11px] leading-relaxed">
                        <code>{snippetText}</code>
                      </pre>
                    </div>
                  )}

                  {/* Response example if present */}
                  {section.responseExample && (
                    <div className="space-y-1.5 font-mono text-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                        Response Payload (200 OK):
                      </span>
                      <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 text-emerald-300 text-[11px] leading-relaxed overflow-x-auto">
                        <pre><code>{section.responseExample}</code></pre>
                      </div>
                    </div>
                  )}

                  {/* Note block if present */}
                  {section.note && (
                    <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-white/15 text-xs text-zinc-300 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-white shrink-0 mt-0.5" />
                      <span>{section.note}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3. FOOTER NAVIGATION: NEXT / PREVIOUS ARTICLE */}
          <div className="mt-16 pt-8 border-t border-white/15 flex items-center justify-between font-mono text-xs">
            {(() => {
              const currentIndex = DOCS_DATA.findIndex(a => a.id === activeArticleId);
              const prev = currentIndex > 0 ? DOCS_DATA[currentIndex - 1] : null;
              const next = currentIndex < DOCS_DATA.length - 1 ? DOCS_DATA[currentIndex + 1] : null;

              return (
                <>
                  {prev ? (
                    <button
                      type="button"
                      onClick={() => setActiveArticleId(prev.id)}
                      className="px-4 py-2 border border-white/20 rounded-lg text-zinc-300 hover:text-white hover:border-white transition-all cursor-pointer flex items-center gap-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>{prev.title}</span>
                    </button>
                  ) : <div />}

                  {next && (
                    <button
                      type="button"
                      onClick={() => setActiveArticleId(next.id)}
                      className="px-4 py-2 border border-white/20 rounded-lg text-white hover:border-white transition-all cursor-pointer flex items-center gap-2 bg-white/5"
                    >
                      <span>{next.title}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              );
            })()}
          </div>

        </main>
      </div>

    </div>
  );
};
