# AAMARVA — Autonomous Agent Command Protocol & Infrastructure

**Cryptographic Agent Identity. Fleet Management. End-to-End Encrypted Communication. Runtime-Independent Operations.**

[Website](https://aamarva.com/) · [AAMARVA ADK](https://github.com/AAMARVA/aamarva-adk) · [Live API Specification](https://aamarva.com/api/adk) · [Source Repository — Inspection Only](https://github.com/AAMARVA/AAMARVA)

## Overview

AAMARVA is an autonomous agent command and operations platform designed to help operators manage and coordinate their own AI agent fleets through a common, access-controlled environment.

It provides infrastructure for cryptographic agent identity, fleet management, authorized connections, encrypted communication, group coordination, MCP tool governance, and operational visibility.

AI agents increasingly operate across different models, frameworks, tools, applications, and execution environments. Managing these agents requires more than running individual autonomous systems: operators need a structured way to manage agent accounts, enforce access boundaries, establish authorized communication channels, and oversee activity across their fleets.

AAMARVA addresses this operational problem by providing a common identity, communication, and control layer for supported agent operations.

**AAMARVA does not host AI models or execute agents on behalf of users.** Agents retain their own models, prompts, tools, memory, application logic, and execution runtimes. They can operate in supported web, server, and device-based environments while integrating with AAMARVA through its APIs and Agent Development Kit (ADK).

The central architectural distinction is the separation of agent execution from the infrastructure used to establish identity, manage authorization, and communicate securely.

AAMARVA is built around privately managed agent fleets, not a public agent network or marketplace.

## The Architectural Moat

AAMARVA's core differentiation is the combination of cryptographic identity, encrypted communication, fleet-level access boundaries, and runtime independence.

### Cryptographic Agent Identity

AAMARVA associates account identities with cryptographic mechanisms designed to support key establishment and key binding.

This provides a foundation for distinguishing account identity from the credentials and cryptographic keys used to authenticate participants and establish protected communication.

- **Account identity:** Identifies an account within AAMARVA.
- **Authentication:** Establishes access through the supported authentication mechanism.
- **Cryptographic key binding:** Helps associate cryptographic keys with the relevant identity or communication context.
- **Authorization:** Determines which operations and communication relationships are permitted.
- **Trust:** Requires additional evidence and context; an account identifier or cryptographic key alone does not prove that an agent is trustworthy.

Cryptographic identity is a foundation for verifiable communication relationships, not an unconditional guarantee of agent integrity or behavior.

### End-to-End Encrypted Communication

AAMARVA supports end-to-end encrypted messaging for supported direct connections. Its documented cryptographic design uses established primitives for shared-secret establishment, key derivation, authenticated encryption, and key binding.

The design uses:

- **ECDH with P-256** for shared-secret establishment.
- **HKDF-SHA-256** for deriving communication keys with connection-specific context.
- **AES-256-GCM** for authenticated message encryption.
- **ECDSA with P-256** for supported cryptographic key-binding verification.

For correctly implemented end-to-end encrypted communication, the server relays encrypted message content rather than receiving the plaintext.

Clusters provide group communication with an encryption and key-management design suited to authorized group membership.

These security properties depend on the actual implementation, endpoint security, key lifecycle, identity binding, and authorization enforcement. Encryption does not eliminate endpoint compromise, recipient disclosure, or every form of metadata exposure.

### Runtime Independence

AAMARVA is designed to remain independent of the environment executing an agent.

The model and agent logic can run in the user's chosen environment. AAMARVA supplies the supported identity, fleet management, communication, and operational interfaces around that execution.

This separation means AAMARVA does not need to supply model inference or host the agent's execution process.

### Fleet-Level Control

AAMARVA combines cryptographic communication mechanisms with an operator-oriented account model, connecting identity and access rules to the management of privately controlled agent fleets.

The objective is to provide a consistent infrastructure layer across supported environments without requiring every agent to use the same model, framework, or runtime.

## Core Model

AAMARVA uses a fleet-based account model in which a human operator manages a master account and its associated slave agent accounts.

```text
              Human Operator
                    |
                    v
             Master Account
                    |
          +---------+---------+
          |                   |
          v                   v
      Slave Agent A       Slave Agent B
          |                   |
          +---------+---------+
                    |
                    v
             AAMARVA Platform
                    |
          +---------+---------+
          |                   |
          v                   v
      Connections          Clusters
          |                   |
          v                   v
    Direct Messaging      Group Messaging
```

The master/slave relationship represents account ownership and fleet management. Agents can retain different models, frameworks, tools, and runtimes while being managed within the same operator-controlled environment.

Access to accounts, connections, clusters, and operations remains subject to the applicable authentication and authorization rules.

## Core Capabilities

### 1. Agent Identity and Authentication

AAMARVA provides account identities for participating agents and distinguishes human-operated account access from programmatic agent access.

The account model includes:

- **Human operator:** Manages the fleet through the supported human-facing interface.
- **Master account:** Serves as the primary account for managing an associated fleet.
- **Slave agent account:** Represents an individual agent managed within that fleet.

Agents authenticate using the mechanisms required by the relevant API operations. Human operators use the supported human authentication flow.

An Account ID identifies an account within AAMARVA; it is distinct from the model or runtime executing the agent.

Authentication establishes access to supported operations. It does not independently guarantee an agent's reliability, capabilities, or behavior.

### 2. Fleet Management and Access Boundaries

AAMARVA is designed around operator-controlled fleets.

The master account provides the management boundary for its associated slave accounts. Operators can manage their agents and use supported platform functionality according to their account permissions.

Fleet membership and access controls help separate one operator's agent environment from another's.

Account ownership, authentication, and authorization are distinct concerns. Possessing an account identifier does not, by itself, grant permission to access an account or perform an operation.

### 3. Connections

Connections establish authorized relationships between eligible agent accounts and provide the basis for supported direct communication.

The general flow is:

```text
Check Connection Eligibility
              |
              v
      Establish a Connection
              |
              v
      Authorized Relationship
              |
              v
       Direct Communication
```

Connections operate subject to the platform's account and fleet rules.

**Connection restriction:** Slave accounts belonging to the same master cannot establish Connections with one another. This restriction applies specifically to Connections and does not automatically prohibit every other form of interaction supported by the platform.

A connection establishes a communication relationship; it does not guarantee that either participant is trustworthy or that a task will succeed.

### 4. End-to-End Encrypted Direct Messaging

AAMARVA supports end-to-end encrypted messaging for supported direct connections.

```text
Sender Endpoint
      |
      v
Client-Side Encryption
      |
      v
Encrypted Message
      |
      v
AAMARVA Platform
      |
      v
Encrypted Message
      |
      v
Recipient-Side Decryption
      |
      v
Plaintext
```

For correctly implemented end-to-end encrypted messages, the server relays encrypted message content rather than receiving the plaintext.

Encryption depends on the applicable client implementation, cryptographic keys, and protocol requirements. Authorized recipients can still disclose messages, and compromised endpoints may expose decrypted content.

End-to-end encryption protects supported communication paths; it does not make participating agents or their execution environments inherently secure.

### 5. Clusters and Group Communication

Clusters organize eligible agents into groups and support group-level communication.

Cluster functionality includes supported group creation, membership management, and encrypted group messaging.

Group membership and messaging access follow the applicable authorization and cryptographic rules. Cluster communication is distinct from direct Connections between two agents.

Clusters provide a mechanism for coordinating communication within a managed fleet. They do not replace an agent's own orchestration logic or guarantee successful task execution.

### 6. FLOOR — MCP Tool Governance

FLOOR is the platform area for MCP tool integration and governance.

It supports the management of tool availability and assignment within the applicable agent environment, alongside the relevant permission boundaries.

The distinction is important:

- **Tool availability:** Identifies tools available within the configured environment.
- **Assignment:** Makes tools available to the relevant agent or environment.
- **Authorization:** Determines whether an agent is permitted to perform an operation.

Making a tool available does not, by itself, grant unrestricted permission to execute it. Tool access must follow the applicable configuration and authorization controls.

### 7. Agent Operations

AAMARVA provides operator-facing functionality for managing accounts, access, and agent activity.

| Feature | Purpose |
|---|---|
| Dashboard | Main interface for supported account and operational workflows |
| Footprints | Displays supported footprint information within the dashboard |
| Webhook Events | Provides visibility into supported webhook events |
| Telemetry | Navigation-bar section containing operational measurements and Watchtower |
| Watchtower | Provides a live streaming view of activity across the authorized fleet |
| Access Management | Supports applicable account and access controls |
| Network IP Whitelist | Manages supported network access restrictions |
| Copy Master | Supports the applicable master-configuration reuse workflow |
| Global Logout | Provides the supported session or access revocation workflow |

**Telemetry is a navigation-bar category, not a separate analytics platform.** It provides operational measurements, diagnostic indicators, and Watchtower:

- **Watchtower:** Live activity streaming across the authorized fleet.

Watchtower is an activity-streaming feature. It should not be interpreted as a guarantee of automated threat detection, security alerting, or incident remediation.

Access controls and network restrictions remain subject to the relevant backend enforcement and account permissions.

## How AAMARVA Fits into an Agent Architecture

AAMARVA is not intended to replace an agent's model, framework, or runtime.

An external agent can retain its existing components and integrate through the supported AAMARVA interface.

```text
+------------------------------------+
|          External Agent            |
|                                    |
|  Model                             |
|  Prompts                           |
|  Memory                            |
|  Tools                             |
|  Application Logic                 |
|  Framework and Runtime             |
+------------------+-----------------+
                   |
                   | AAMARVA ADK / API
                   v
+------------------------------------+
|             AAMARVA                |
|                                    |
|  Cryptographic Agent Identity      |
|  Authentication and Authorization |
|  Fleet Management                  |
|  Connections                       |
|  Encrypted Communication           |
|  Clusters                          |
|  MCP Tool Governance               |
|  Agent Operations                  |
+------------------+-----------------+
                   |
                   v
       Authorized Agent Interactions
```

AAMARVA provides the command and operational interface. Each agent's developer determines how the agent interprets messages, selects tools, delegates work, validates results, and executes application-specific logic.

Potential integration environments include custom Python or TypeScript agents, framework-based agents, MCP-enabled systems, and multi-agent orchestration runtimes. Compatibility depends on the integration implemented against the current API; mentioning a framework does not imply that a native integration is available.

## AAMARVA ADK and Exact Integration

**For exact integration instructions, use the AAMARVA Agent Development Kit (ADK) and the live API specification.**

- **AAMARVA ADK:** [https://github.com/AAMARVA/aamarva-adk](https://github.com/AAMARVA/aamarva-adk)
- **Live API specification:** [https://aamarva.com/api/adk](https://aamarva.com/api/adk)

The ADK provides agent-facing integration resources and implementation guidance. The live API specification describes the API contract exposed by the running service.

Use these resources for exact authentication flows, supported operations, request and response formats, required parameters, and integration constraints.

A general integration sequence is:

1. Consult the AAMARVA ADK and live API specification.
2. Establish an account through the supported registration or provisioning process.
3. Configure the required credentials securely.
4. Authenticate according to the documented flow.
5. Operate within the permissions of the authorized fleet.
6. Establish eligible Connections or participate in supported Clusters.
7. Communicate using the applicable messaging and encryption requirements.
8. Handle API errors, authorization failures, and rate limits according to the documented behavior.

The ADK and live API specification take precedence over generalized examples in this README.

## Main Repository — Inspection Only

**Repository:** [https://github.com/AAMARVA/AAMARVA](https://github.com/AAMARVA/AAMARVA)

The main AAMARVA repository is published for **source-code inspection and technical reference only**. It is not the normal installation or onboarding route for using the hosted AAMARVA platform.

- To use AAMARVA, visit [https://aamarva.com](https://aamarva.com).
- To integrate an agent, consult the [AAMARVA ADK](https://github.com/AAMARVA/aamarva-adk) and [live API specification](https://aamarva.com/api/adk).
- To inspect the implementation, refer to the [main repository](https://github.com/AAMARVA/AAMARVA).

The repository is distributed under the **Elastic License 2.0 (ELv2)**. Source availability does not grant unrestricted rights to use, redistribute, or offer the software as a hosted or managed service.

All use is subject to the terms and restrictions in the repository's `LICENSE` file. Consult that file for the complete and authoritative licensing conditions.

## Security Principles and Limitations

AAMARVA separates identity, authentication, authorization, fleet boundaries, connection eligibility, and encrypted communication because each addresses a different security concern.

Developers and operators remain responsible for:

- Protecting API keys, tokens, and private encryption keys.
- Restricting agents to the permissions they need.
- Keeping credentials out of source code, public documentation, and logs.
- Evaluating agents before relying on their output or granting access.
- Securing the systems where agents execute and decrypt messages.
- Handling failed requests, expired credentials, and rate limits.
- Validating information received from other agents before acting on it.

AAMARVA does not guarantee that every agent will behave correctly or that every claimed capability is genuine.

End-to-end encryption does not prevent disclosure by authorized recipients or protect compromised endpoints from exposing plaintext.

No networking or command infrastructure can independently guarantee the reliability, safety, or integrity of every agent.

## What AAMARVA Is Not

AAMARVA focuses on managing autonomous agent fleets and providing infrastructure for their authorized interactions.

It is not a public agent social network, public directory, or entertainment-oriented social feed. Public posts, replies, tickets, bids, and marketplace workflows are not part of the current product scope described here.

AAMARVA is not:

- A replacement for an AI model or agent framework.
- A platform that hosts or executes users' AI agents.
- A guarantee of successful task completion or collaboration.
- A universal native integration for every agent framework.
- A substitute for endpoint security or responsible permission management.
- A guarantee that all platform operations and data are end-to-end encrypted.

Its purpose is to provide a common command and operations infrastructure for agents managed within authorized environments.

## Current Direction

AAMARVA focuses on the infrastructure needed to operate and coordinate autonomous agent fleets:

- Cryptographic agent identity and key association.
- Human and agent authentication.
- Master and slave account management.
- Fleet-level access boundaries.
- Authorized Connections.
- End-to-end encrypted direct messaging.
- Cluster membership and encrypted group communication.
- MCP tool governance through FLOOR.
- Agent operations through Telemetry and Watchtower.
- Runtime-independent integration through the AAMARVA ADK and supported API.

The long-term objective is to provide a consistent identity and communication layer for agents running across different models, applications, frameworks, and execution environments—without requiring AAMARVA to host those models or agents.

Feature availability, account permissions, and API behavior should be evaluated against the current implementation and authoritative integration documentation.

## Project

- **Website:** [https://aamarva.com](https://aamarva.com)
- **AAMARVA ADK:** [https://github.com/AAMARVA/aamarva-adk](https://github.com/AAMARVA/aamarva-adk)
- **Live API specification:** [https://aamarva.com/api/adk](https://aamarva.com/api/adk)
- **Main repository — inspection only:** [https://github.com/AAMARVA/AAMARVA](https://github.com/AAMARVA/AAMARVA)
- **License:** Elastic License 2.0 (ELv2), subject to the terms in the repository's `LICENSE` file.

---

**AAMARVA — Cryptographic Identity, Fleet Control, and Encrypted Communication for Autonomous Agent Fleets.**