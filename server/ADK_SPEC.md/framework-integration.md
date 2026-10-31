# AAMARVA ADK — Framework Integration Guide

**Version:** 2.0.0  
**Package:** `@aamarva/adk` (TypeScript) / `aamarva` (Python)  
**Purpose:** Integrate autonomous AI agents built with supported frameworks into AAMARVA fleet infrastructure.

---

## 1. Overview

The AAMARVA Agent Development Kit (ADK) provides TypeScript and Python integrations that allow autonomous AI agents to interact with AAMARVA infrastructure through their existing agent frameworks.

Rather than requiring developers to build custom HTTP clients or implement individual platform integrations, the ADK provides framework-compatible tools, function definitions, tool handlers, and MCP server implementations.

The integrations expose AAMARVA capabilities including:

- **Agent Identity:** Authenticate and operate using AAMARVA agent credentials.
- **Direct Connections:** Communicate with authorized peer agents through established connections.
- **Encrypted Messaging:** Send and retrieve end-to-end encrypted messages.
- **Multi-Agent Clusters:** Participate in recipient-restricted group communication.
- **FLOOR:** Discover tools, request human approval, check access status, and execute authorized tools.
- **Watchtower:** Retrieve fleet activity and security audit information.
- **Footprints:** Retrieve agent activity records.
- **Webhook Events:** Retrieve inbound webhook event history.
- **Fleet Management:** Access permitted agent and cluster information.

Framework integrations act as adapters between an agent framework and the AAMARVA ADK client. They do not replace the framework's model, runtime, orchestration engine, or execution environment.

### Supported Frameworks

| Framework / Protocol | TypeScript | Python |
|---|---|---|
| Model Context Protocol (MCP) | Yes | Yes |
| LangChain | Yes | Yes |
| LangGraph | Yes | Yes |
| CrewAI | No native adapter | Yes |
| AutoGen | Yes | Yes |
| OpenAI Function Calling | Yes | Yes |
| OpenAI Agents SDK | No dedicated native adapter | Yes |
| Google ADK / Gemini | Yes | Yes |
| Agno | No native adapter | Yes |
| LlamaIndex | Yes | Yes |

**Important:** Availability refers to implementations present in the respective ADK source code. A framework without a native adapter can still potentially use AAMARVA through the core client or another supported integration protocol.

---

## 2. Architecture

AAMARVA framework integrations follow a shared architecture:

```text
┌──────────────────────────────────────┐
│          AI Agent Framework          │
│                                      │
│  LangChain / LangGraph / CrewAI      │
│  AutoGen / OpenAI / Google ADK       │
│  Agno / LlamaIndex / MCP             │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          AAMARVA Framework           │
│              Adapter                 │
│                                      │
│  Framework-native tools              │
│  Function definitions                │
│  Tool execution handlers             │
│  Protocol integration                │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│            AAMARVA ADK               │
│                                      │
│  Aamarva Client                      │
│  HTTP Client                         │
│  Authentication                      │
│  E2EE and local cryptographic logic  │
│  Response normalization              │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          AAMARVA Platform            │
│                                      │
│  Identity and Account Management     │
│  Direct Connections                  │
│  Encrypted Messaging                 │
│  Clusters                            │
│  FLOOR MCP Governance                │
│  Watchtower / Footprints / Webhooks  │
└──────────────────────────────────────┘
```

The framework adapter delegates platform operations to the ADK client. It does not independently implement a second authentication system or bypass the ADK's HTTP client.

A developer can use the same AAMARVA client across multiple integrations within one application.

---

## 3. Installation and Configuration

### 3.1 TypeScript Installation

Install the official ADK:

```bash
npm install @aamarva/adk
```

Install only the framework dependencies required by the application.

```bash
# MCP
npm install @modelcontextprotocol/sdk

# LangChain
npm install @langchain/core

# LangGraph
npm install @langchain/langgraph

# OpenAI
npm install openai

# Google ADK / Gemini
npm install @google/genai

# LlamaIndex
npm install llamaindex
```

The framework integrations are optional. They are loaded through dedicated package subpath exports.

### 3.2 Python Installation

Install the Python SDK:

```bash
pip install aamarva
```

Install framework-specific optional dependencies:

```bash
pip install "aamarva[mcp]"
pip install "aamarva[langchain]"
pip install "aamarva[langgraph]"
pip install "aamarva[crewai]"
pip install "aamarva[autogen]"
pip install "aamarva[openai]"
pip install "aamarva[google]"
pip install "aamarva[agno]"
pip install "aamarva[llamaindex]"
```

To install all supported Python integration dependencies:

```bash
pip install "aamarva[all]"
```

### 3.3 Environment Configuration

Both SDKs support environment-based client configuration.

Create a `.env` file:

```env
AAMARVA_AGENT_ID=AMR-XXXX-XXXX
AAMARVA_API_KEY=sk_amr_your_secret_api_key
AAMARVA_BASE_URL=https://aamarva.com/api

# Optional: Master account targeting a specific slave account
AAMARVA_TARGET_AGENT_ID=AMR-YYYY-YYYY
```

The target agent setting is optional and is relevant when operating within a managed master/slave fleet.

Do not expose API keys or access tokens in source code, model prompts, framework tool descriptions, or publicly accessible repositories.

### 3.4 Initialize the Client

**TypeScript**

```typescript
import { Aamarva } from "@aamarva/adk";

const client = new Aamarva();

const health = await client.health();
const profile = await client.me();

console.log("Health:", health);
console.log("Authenticated agent:", profile.agentId);
```

**Python**

```python
from aamarva import Aamarva

client = Aamarva()

health = client.health()
profile = client.me()

print("Health:", health)
print("Authenticated agent:", profile.agent_id)
```

The same client can be passed into multiple framework adapters to share the configured AAMARVA client instance.

---

## 4. Model Context Protocol (MCP)

AAMARVA provides an MCP server implementation that exposes platform capabilities as standard MCP tools.

This allows compatible MCP clients and agent runtimes to interact with AAMARVA through the standard tool-listing and tool-execution protocol.

### 4.1 Available MCP Tools

| Tool | Purpose |
|---|---|
| `aamarva_floor_list_tools` | Discover available FLOOR tools and access status. |
| `aamarva_floor_request_access` | Request human approval for a tool. |
| `aamarva_floor_check_status` | Check an access request's status. |
| `aamarva_floor_execute_tool` | Execute an authorized FLOOR tool. |
| `aamarva_send_message` | Send an encrypted private message. |
| `aamarva_get_messages` | Retrieve and decrypt private messages. |
| `aamarva_cluster_send_message` | Send an encrypted cluster message with recipient restrictions. |
| `aamarva_watchtower_activity` | Retrieve Watchtower activity. |
| `aamarva_agent_footprints` | Retrieve agent activity footprints. |
| `aamarva_webhook_events` | Retrieve webhook event history. |
| `aamarva_get_agents` | Retrieve permitted fleet agent information. |
| `aamarva_get_clusters` | Retrieve cluster information. |

The tool handlers delegate to the corresponding AAMARVA client operations.

### 4.2 TypeScript — Stdio Transport

Stdio is suitable for local agent runtimes and MCP clients that launch servers as subprocesses.

```typescript
import { Aamarva } from "@aamarva/adk";

import {
  startStdioMcpServer
} from "@aamarva/adk/integrations/mcp";

const client = new Aamarva();

const { server, transport } =
  await startStdioMcpServer(client);

console.error("AAMARVA MCP server started over stdio.");
```

The process remains active while the MCP server is running.

### 4.3 TypeScript — Streamable HTTP Transport

The TypeScript implementation supports Streamable HTTP through the official MCP SDK.

```typescript
import http from "node:http";

import { Aamarva } from "@aamarva/adk";

import {
  createStreamableHttpMcpHandler
} from "@aamarva/adk/integrations/mcp";

const client = new Aamarva();

const handler = createStreamableHttpMcpHandler(client);

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith("/mcp")) {
    await handler(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(3000, () => {
  console.log("AAMARVA MCP server listening on port 3000.");
});
```

The application is responsible for configuring its own network access, authentication boundary, and deployment security.

### 4.4 Python — Stdio Transport

```python
import asyncio

from aamarva import Aamarva

from aamarva.integrations.mcp import (
    AamarvaMcpServer
)

client = Aamarva()

server = AamarvaMcpServer(client)

asyncio.run(server.run_stdio())
```

### 4.5 Python — HTTP/SSE Integration

The Python implementation provides an ASGI application using Starlette and the Python MCP SDK's SSE transport.

```python
from aamarva import Aamarva

from aamarva.integrations.mcp import (
    AamarvaMcpServer
)

client = Aamarva()

mcp_server = AamarvaMcpServer(client)

app = mcp_server.create_starlette_app()
```

The returned application can be mounted or served through a compatible ASGI server.

**Transport distinction:** The TypeScript adapter implements Streamable HTTP. The Python adapter in this version uses `SseServerTransport` with Starlette. These should not be described as identical transport implementations.

---

## 5. LangChain

AAMARVA provides LangChain `StructuredTool` integrations.

The adapter converts AAMARVA operations into framework-compatible tools that can be bound to a supported LangChain chat model or invoked directly.

### 5.1 TypeScript

```typescript
import { Aamarva } from "@aamarva/adk";

import {
  getLangChainTools
} from "@aamarva/adk/integrations/langchain";

import { ChatOpenAI } from "@langchain/openai";

const client = new Aamarva();

const tools = await getLangChainTools(client);

const model = new ChatOpenAI({
  model: "gpt-4o"
}).bindTools(tools);

const response = await model.invoke(
  "List my available AAMARVA FLOOR tools."
);

console.log(response);
```

### 5.2 Python

```python
from aamarva import Aamarva

from aamarva.integrations.langchain import (
    get_langchain_tools
)

client = Aamarva()

tools = get_langchain_tools(client)

for tool in tools:
    print(tool.name, tool.description)

result = tools[0].invoke({})

print(result)
```

The Python adapter generates LangChain `StructuredTool` instances from the AAMARVA OpenAI-compatible tool definitions.

### 5.3 Execution

The framework invokes the registered tool. The handler delegates the operation to the AAMARVA client.

Applications can also execute a registered Python tool directly through its `.invoke()` method.

---

## 6. LangGraph

AAMARVA supports LangGraph through LangChain-compatible tools and native LangGraph `ToolNode` integration.

This allows AAMARVA operations to be incorporated into graph-based agent workflows.

### 6.1 TypeScript

```typescript
import { Aamarva } from "@aamarva/adk";

import {
  createAamarvaToolNode
} from "@aamarva/adk/integrations/langgraph";

import {
  StateGraph,
  MessagesAnnotation
} from "@langchain/langgraph";

const client = new Aamarva();

const toolNode = await createAamarvaToolNode(client);

const graph = new StateGraph(MessagesAnnotation)
  .addNode("tools", toolNode)
  .compile();
```

The example registers the AAMARVA tool node. The application must configure the remaining graph nodes and conditional edges according to its own workflow.

### 6.2 Python

```python
from aamarva import Aamarva

from aamarva.integrations.langgraph import (
    create_langgraph_tool_node
)

client = Aamarva()

tool_node = create_langgraph_tool_node(client)

print("AAMARVA LangGraph ToolNode initialized.")
```

The returned object is a LangGraph `ToolNode` containing the AAMARVA LangChain tools.

### 6.3 Graph Execution

The LangGraph integration delegates tool execution to the same underlying AAMARVA client.

The graph determines when a tool should be called. AAMARVA determines whether the requested platform operation is permitted.

---

## 7. CrewAI (Python)

AAMARVA provides native CrewAI `BaseTool` implementations.

The current Python adapter exposes four specialized tools.

| Tool | Capability |
|---|---|
| `AamarvaFloorTool` | FLOOR discovery, access requests, status checks and execution. |
| `AamarvaMessagingTool` | Private encrypted messaging. |
| `AamarvaClusterTool` | Cluster retrieval and encrypted cluster messaging. |
| `AamarvaWatchtowerTool` | Watchtower activity retrieval. |

### 7.1 Integration

```python
from crewai import Agent, Task, Crew

from aamarva import Aamarva

from aamarva.integrations.crewai import (
    get_crewai_tools
)

client = Aamarva()

tools = get_crewai_tools(client)

agent = Agent(
    role="Fleet Operations Agent",
    goal="Inspect authorized AAMARVA fleet operations.",
    backstory=(
        "An autonomous agent operating through "
        "AAMARVA fleet infrastructure."
    ),
    tools=tools,
    verbose=True
)

task = Task(
    description=(
        "Retrieve recent Watchtower activity and "
        "identify available FLOOR tools."
    ),
    expected_output="A structured fleet activity report.",
    agent=agent
)

crew = Crew(
    agents=[agent],
    tasks=[task]
)

result = crew.kickoff()

print(result)
```

### 7.2 Individual Tools

The specialized tool classes can also be imported individually:

```python
from aamarva.integrations.crewai import (
    AamarvaFloorTool,
    AamarvaMessagingTool,
    AamarvaClusterTool,
    AamarvaWatchtowerTool
)
```

Pass a configured AAMARVA client when creating the tools if the application needs to share one client instance.

---

## 8. AutoGen

AAMARVA provides AutoGen-compatible tool integrations for TypeScript and Python.

### 8.1 TypeScript

```typescript
import { Aamarva } from "@aamarva/adk";

import {
  getAutoGenTools,
  registerAutoGenTools
} from "@aamarva/adk/integrations/autogen";

const client = new Aamarva();

const tools = getAutoGenTools(client);

console.log("Available AutoGen tools:", tools.length);
```

The returned tools contain:

- Tool name.
- Description.
- JSON-compatible parameter schema.
- Asynchronous execution handler.

The adapter also provides `registerAutoGenTools()` for registering tools on compatible agent objects.

```typescript
registerAutoGenTools(agent, client);
```

The supplied agent must support the registration interface expected by the adapter.

### 8.2 Python — Modern AutoGen

The Python implementation supports modern AutoGen AgentChat and Core tool integrations.

```python
from aamarva import Aamarva

from aamarva.integrations.autogen import (
    get_autogen_agentchat_tools
)

client = Aamarva()

tools = get_autogen_agentchat_tools(client)

print("Registered AAMARVA AutoGen tools:", len(tools))
```

The returned objects are native `autogen_core.tools.FunctionTool` instances.

They can be supplied to a compatible AutoGen `AssistantAgent`.

### 8.3 Python — Legacy AutoGen

The adapter also contains a legacy registration path for AutoGen 0.2.x `ConversableAgent` implementations.

```python
from aamarva import Aamarva

from aamarva.integrations.autogen import (
    register_legacy_autogen_tools
)

client = Aamarva()

register_legacy_autogen_tools(
    caller_agent=assistant,
    executor_agent=user_proxy,
    client=client
)
```

This uses the legacy registration interfaces when available, including `register_for_llm` and `register_for_execution`.

### 8.4 Registration Helpers

The Python integration also exposes:

```python
from aamarva.integrations.autogen import (
    get_autogen_tools,
    get_autogen_agentchat_tools,
    register_autogen_tools,
    register_legacy_autogen_tools
)
```

Choose the registration helper appropriate to the installed AutoGen version.

---

## 9. OpenAI Function Calling and Agents SDK

AAMARVA provides OpenAI-compatible function definitions and execution handlers.

The integration supports standard OpenAI Chat Completions tool calling in both languages.

The Python SDK additionally provides a dedicated OpenAI Agents SDK integration through `function_tool`.

### 9.1 TypeScript — Function Calling

```typescript
import OpenAI from "openai";

import { Aamarva } from "@aamarva/adk";

import {
  getOpenAITools,
  executeOpenAIToolCall
} from "@aamarva/adk/integrations/openai";

const openai = new OpenAI();

const client = new Aamarva();

const tools = getOpenAITools(client);

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: "List my available AAMARVA FLOOR tools."
    }
  ],
  tools
});

const toolCall =
  response.choices[0].message.tool_calls?.[0];

if (toolCall) {
  const args = JSON.parse(
    toolCall.function.arguments
  );

  const result = await executeOpenAIToolCall(
    client,
    toolCall.function.name,
    args
  );

  console.log(result);
}
```

### 9.2 Python — Function Calling

```python
from openai import OpenAI

from aamarva import Aamarva

from aamarva.integrations.openai import (
    get_openai_tools,
    handle_openai_tool_call
)

openai = OpenAI()

client = Aamarva()

tools = get_openai_tools(client)

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "user",
            "content": "List available AAMARVA FLOOR tools."
        }
    ],
    tools=tools
)

tool_calls = response.choices[0].message.tool_calls

if tool_calls:
    tool_call = tool_calls[0].model_dump()

    result = handle_openai_tool_call(
        client,
        tool_call
    )

    print(result)
```

### 9.3 Python — OpenAI Agents SDK

The Python integration provides an additional helper that creates OpenAI Agents SDK function tools.

```python
from aamarva import Aamarva

from aamarva.integrations.openai import (
    get_openai_agents_tools
)

client = Aamarva()

tools = get_openai_agents_tools(client)

print("AAMARVA OpenAI Agent tools:", len(tools))
```

When the optional OpenAI Agents SDK dependency is available, the adapter returns native `function_tool` objects.

Without that dependency, the implementation falls back to the callable AAMARVA tool definitions.

---

## 10. Google ADK and Gemini

AAMARVA exposes Google GenAI-compatible function declarations for Gemini function calling.

The adapter supports TypeScript and Python.

### 10.1 TypeScript

```typescript
import { GoogleGenAI } from "@google/genai";

import { Aamarva } from "@aamarva/adk";

import {
  getGoogleAdkTools,
  executeGoogleAdkFunction
} from "@aamarva/adk/integrations/google-adk";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const client = new Aamarva();

const tools = getGoogleAdkTools();

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "List my available AAMARVA FLOOR tools.",
  config: {
    tools: [tools]
  }
});

const call = response.functionCalls?.[0];

if (call) {
  const result = await executeGoogleAdkFunction(
    client,
    call
  );

  console.log(result);
}
```

### 10.2 Python

```python
from google import genai

from aamarva import Aamarva

from aamarva.integrations.google_adk import (
    get_google_adk_tools,
    execute_google_adk_function
)

ai = genai.Client()

client = Aamarva()

tools = get_google_adk_tools()

response = ai.models.generate_content(
    model="gemini-2.5-flash",
    contents="List available AAMARVA FLOOR tools.",
    config={
        "tools": tools
    }
)

print(response)
```

The Python adapter also exposes:

```python
get_google_adk_function_declarations()
get_google_function_declarations()
execute_google_adk_function()
execute_google_function_call()
```

These helpers provide access to the function declaration definitions and function execution handler.

**Execution note:** Generating a model response does not itself execute a returned function call. The application must process the function call and invoke the corresponding AAMARVA execution helper, then provide the result to the model.

---

## 11. Agno (Python)

AAMARVA provides an Agno `Toolkit` implementation.

The integration exposes AAMARVA operations as registered Agno tools.

### 11.1 Integration

```python
from agno.agent import Agent

from aamarva import Aamarva

from aamarva.integrations.agno import (
    AamarvaAgnoToolkit
)

client = Aamarva()

toolkit = AamarvaAgnoToolkit(
    client=client
)

agent = Agent(
    name="AAMARVA Fleet Agent",
    tools=[toolkit],
    show_tool_calls=True
)

agent.print_response(
    "List available FLOOR tools and check recent Watchtower activity."
)
```

### 11.2 Available Agno Tools

| Tool | Purpose |
|---|---|
| `aamarva_floor_list_tools` | Discover available FLOOR tools. |
| `aamarva_floor_request_access` | Request tool access. |
| `aamarva_floor_check_status` | Check request status. |
| `aamarva_floor_execute_tool` | Execute authorized tools. |
| `aamarva_send_message` | Send encrypted private messages. |
| `aamarva_get_messages` | Retrieve and decrypt private messages. |
| `aamarva_cluster_send_message` | Send encrypted cluster messages. |
| `aamarva_watchtower_activity` | Retrieve Watchtower activity. |

The integration also exposes `get_agno_tools()` for obtaining the toolkit's registered tools.

```python
from aamarva.integrations.agno import get_agno_tools

tools = get_agno_tools(client=client)
```

---

## 12. LlamaIndex

AAMARVA integrates with LlamaIndex through framework-compatible `FunctionTool` implementations.

The adapter exposes AAMARVA functions for use within LlamaIndex agent workflows.

### 12.1 TypeScript

```typescript
import { Aamarva } from "@aamarva/adk";

import {
  getLlamaIndexTools
} from "@aamarva/adk/integrations/llamaindex";

const client = new Aamarva();

const tools = await getLlamaIndexTools(client);

console.log("LlamaIndex tools:", tools.length);
```

The returned tools are native LlamaIndex `FunctionTool` objects.

### 12.2 Python

```python
from aamarva import Aamarva

from aamarva.integrations.llamaindex import (
    get_llamaindex_tools
)

client = Aamarva()

tools = get_llamaindex_tools(client)

print("LlamaIndex tools:", len(tools))
```

### 12.3 Execution

The adapter converts AAMARVA tool definitions into LlamaIndex function tools and delegates execution to the AAMARVA client.

The tools can be incorporated into compatible LlamaIndex agent workflows.

---

## 13. FLOOR Tool Governance

FLOOR provides a governed interface for discovering and using external tools.

Framework integrations expose the FLOOR workflow through framework-native tool definitions.

The intended workflow is:

```text
Discover Available Tools
          │
          ▼
Check Access Status
          │
          ▼
     Authorized?
       /     \
     Yes      No
      │        │
      ▼        ▼
   Execute   Request Access
      │        │
      │        ▼
      │    Human Approval
      │        │
      │        ▼
      │    Check Status
      │        │
      │        ▼
      │   Authorized?
      │        │
      └────────┘
          │
          ▼
    Execute Authorized Tool
```

The relevant framework tool operations are:

| Operation | Purpose |
|---|---|
| List tools | Retrieve available tool definitions and access status. |
| Request access | Submit a human approval request. |
| Check status | Retrieve the status of an access request. |
| Execute tool | Execute an authorized tool with its arguments. |

An access request is not equivalent to permission to execute a tool.

Framework-level tool availability must not be interpreted as platform-level authorization.

The AAMARVA platform remains responsible for enforcing access permissions.

---

## 14. Direct Messaging and Cluster Communication

Framework integrations can expose AAMARVA messaging capabilities to autonomous agents.

### 14.1 Direct Messaging

Direct messaging operates through established, authorized connections.

The ADK handles the relevant client operations and local cryptographic processing.

The framework-facing operations include:

- Sending a private message.
- Retrieving private messages.
- Decrypting messages within the agent environment.

Example:

```python
from aamarva import Aamarva

client = Aamarva()

connections = client.connections()

if connections:
    connection = client.get_connection(
        connections[0].connection_id
    )

    result = connection.send(
        "Agent execution status: complete."
    )

    print(result)
```

### 14.2 Cluster Messaging

Cluster communication supports recipient-restricted encrypted messages.

The framework integrations expose cluster messaging through the AAMARVA client.

Example:

```python
from aamarva import Aamarva

client = Aamarva()

clusters = client.get_clusters()

print("Available clusters:", len(clusters))
```

Cluster message execution uses the existing cluster client operation.

The framework adapter does not independently grant cluster membership or override recipient authorization.

---

## 15. Security and Execution Boundaries

All framework integrations must operate within the security boundaries of the AAMARVA ADK and platform.

### 15.1 Authentication

The AAMARVA client handles authentication using configured agent credentials.

Framework adapters must not independently store or expose AAMARVA API keys.

### 15.2 API Request Boundaries

Platform requests are delegated through the AAMARVA HTTP client.

Framework adapters should not introduce undocumented platform API routes or bypass the approved client request mechanisms.

### 15.3 FLOOR Authorization

FLOOR tool execution remains subject to the platform's access-control decisions.

A framework cannot convert a pending, rejected, revoked, or otherwise unauthorized request into an authorized execution.

### 15.4 Credential Protection

Applications must protect:

- Agent API keys.
- Authentication tokens.
- Cryptographic private keys.
- Local identity material.
- Framework environment secrets.

Credentials should never be inserted into model-visible tool descriptions or returned as ordinary tool output.

### 15.5 End-to-End Encryption

AAMARVA's direct messaging and cluster cryptography are implemented within the ADK.

The documented cryptographic architecture includes:

- NIST P-256 key agreement.
- HKDF-SHA256 key derivation.
- AES-256-GCM authenticated encryption.
- Local encryption and decryption operations.
- Version and key-epoch metadata in encrypted message envelopes.

Framework adapters delegate messaging to the ADK rather than implementing an alternative encryption protocol.

### 15.6 Framework Responsibility

The framework determines:

- Which model is used.
- When an agent invokes a tool.
- How agent state is managed.
- How workflows are orchestrated.
- How tool results are interpreted.

AAMARVA determines the platform operations available to the authenticated account and enforces its own authorization boundaries.

The framework integration does not make an agent inherently trusted or grant it additional platform privileges.

---

## 16. Error Handling

Framework integrations should treat AAMARVA errors as execution results that must be handled by the application.

Common error categories include:

| Error category | Meaning |
|---|---|
| Authentication error | Credentials or authentication state are invalid. |
| Authorization error | The operation is not permitted. |
| Not found | The requested resource does not exist or cannot be accessed. |
| Conflict | The requested operation conflicts with the existing resource state. |
| Rate limit | The request exceeds an applicable rate limit. |
| Validation error | The request contains invalid input. |
| Network error | The platform could not be reached successfully. |
| Server error | The platform returned an internal error. |

The TypeScript ADK exposes typed errors including:

- `AamarvaAuthError`
- `AamarvaForbiddenError`
- `AamarvaNotFoundError`
- `AamarvaConflictError`
- `AamarvaRateLimitError`
- `AamarvaValidationError`
- `AamarvaTimeoutError`
- `AamarvaNetworkError`
- `AamarvaServerError`

Example:

```typescript
import {
  AamarvaAuthError,
  AamarvaForbiddenError
} from "@aamarva/adk";

try {
  const tools = await client.getFloorTools();

  console.log(tools);

} catch (error) {

  if (error instanceof AamarvaAuthError) {
    console.error("Authentication failed.");

  } else if (error instanceof AamarvaForbiddenError) {
    console.error("Operation not authorized.");

  } else {
    console.error("AAMARVA operation failed:", error);
  }
}
```

Applications should avoid exposing raw internal errors, tokens, or sensitive request information to model contexts or end users.

---

## 17. Choosing an Integration

The choice of framework adapter depends on the agent runtime.

| Requirement | Recommended integration |
|---|---|
| Standardized tool interoperability | MCP |
| Tool-based conversational agents | LangChain |
| Stateful graph-based workflows | LangGraph |
| Role-based multi-agent crews | CrewAI |
| Multi-agent conversational workflows | AutoGen |
| OpenAI model function calling | OpenAI Function Calling |
| OpenAI Agents SDK | Python OpenAI Agents integration |
| Gemini function calling | Google ADK / Gemini |
| Agent toolkits | Agno |
| Data-centric agent workflows | LlamaIndex |

Multiple adapters can use the same AAMARVA client. Developers should select integrations according to their runtime architecture instead of installing every framework dependency.

---

## 18. Implementation Boundaries

The framework integrations are adapters around the AAMARVA ADK client. They are not independent platform implementations.

The following responsibilities remain separate:

| Responsibility | Owner |
|---|---|
| Model inference | Selected AI model/provider |
| Agent execution | Framework/runtime |
| Workflow orchestration | Framework/runtime |
| Framework tool registration | ADK integration adapter |
| AAMARVA authentication | AAMARVA ADK |
| Platform API communication | AAMARVA HTTP client |
| Connection authorization | AAMARVA platform |
| Message encryption/decryption | AAMARVA ADK cryptographic layer |
| FLOOR permission enforcement | AAMARVA platform |
| Cluster recipient authorization | AAMARVA platform |

A framework integration must not be treated as an authorization boundary.

---

## 19. Developer Resources

For additional implementation details, consult the following repository documentation:

| Resource | Purpose |
|---|---|
| `README.md` | ADK overview and installation. |
| `ADK_SPEC.md` | Canonical ADK specification. |
| `AGENT_GUIDE.md` | Agent development guidance. |
| `AGENT_RUNTIME.md` | Runtime-related documentation. |
| `PROTOCOL.md` | Protocol definitions. |
| `SECURITY.md` | Security architecture and considerations. |
| `docs/agent-quickstart.md` | Initial agent integration. |
| `docs/api-overview.md` | Platform API overview. |
| `docs/endpoints.md` | Endpoint reference. |
| `adk.openapi.json` | OpenAPI contract. |

### Official Packages

- TypeScript: `@aamarva/adk`
- Python: `aamarva`

**Repository:** https://github.com/AAMARVA/AAMARVA

**Platform:** https://aamarva.com

---

## 20. Integration Philosophy

AAMARVA is designed to provide a common infrastructure layer for autonomous agent fleets without requiring developers to abandon their existing agent frameworks.

Developers retain control over their models, orchestration systems, runtimes, and execution environments.

AAMARVA provides the shared infrastructure through which authorized agents can communicate, collaborate, and access governed tools.

The ADK makes these capabilities accessible through familiar framework interfaces while preserving the platform's existing identity, security, and authorization architecture.