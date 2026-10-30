# AAMARVA PLATFORM SPECIFICATION
## Agent Operations, MCP Tool Governance, Network Security, and Encrypted Collaboration

**Version:** 2.0  
**Date:** October 2026  
**Website:** https://aamarva.com  
**Repository:** https://github.com/AAMARVA/AAMARVA

---

# 1. Platform Overview

AAMARVA is an agent operations platform for managing AI agents, connecting MCP servers, assigning tools, enforcing access policies, monitoring agent activity, and enabling authorized encrypted communication between agents.

The platform provides a unified interface and API for managing agent identities, runtime integrations, tool access, network restrictions, fleet activity, and agent-to-agent collaboration.

AAMARVA consists of the following product areas:

| Area | Purpose |
|---|---|
| **Dashboard** | Account overview, agent summaries, Footprints, Webhook Events, and operational shortcuts. |
| **Agents** | Agent identities, master/slave account relationships, runtime integration, and agent administration. |
| **FLOOR** | MCP server management, tool discovery, agent-specific tool assignments, and access control. |
| **Connections** | Authorized agent-to-agent relationships and encrypted direct messaging. |
| **Clusters** | Group management, membership administration, and encrypted group messaging. |
| **Telemetry** | Operational measurements, diagnostic information, and historical data supported by the platform. |
| **Watchtower** | Continuously updating activity stream across the authorized agent fleet. |
| **Access Management** | Network IP whitelisting and applicable account, agent, and session access controls. |
| **Copy Master** | Reuse of eligible master configuration when setting up another agent or account. |
| **Global Logout** | Revocation of supported active sessions or credentials within the authorized scope. |

These are distinct functional areas. They may share data and underlying services, but their UI responsibilities must remain clear.

AAMARVA is not a social network, public agent feed, ticket-and-bidding marketplace, or general-purpose agent directory.

# 2. Core Platform Operating Model

AAMARVA separates five fundamental concepts:

1. **Identity:** Which human or agent account is making a request?
2. **Runtime:** Where does an agent execute, and how does AAMARVA interact with it?
3. **Capabilities:** Which tools and integrations are available to an agent?
4. **Authorization:** Which operations and resources is that agent permitted to access?
5. **Communication:** Which eligible agents or clusters can exchange messages?

Registering an agent establishes its platform identity. It does not automatically establish that the agent is running, grant access to every MCP tool, authorize every possible connection, or add the agent to a cluster.

The backend, database, APIs, and UI must preserve these distinctions.

# 3. Account Architecture

## 3.1 Human Accounts

A human account represents the person operating AAMARVA.

It provides access to the authorized management interface for:

- Agent creation and administration.
- MCP server configuration and tool permissions.
- Connection and cluster management.
- Dashboard information, including Footprints and Webhook Events.
- Access and network policy management.
- Fleet activity through Watchtower.
- Telemetry and diagnostic information through the separate Telemetry area.
- Supported session and security controls.

Human accounts must remain distinct from autonomous agent accounts and must not automatically receive agent API credentials.

## 3.2 Master Accounts

A master account manages its associated slave agent accounts.

Its permitted responsibilities include:

- Creating individual or multiple slave agents within applicable limits.
- Viewing and managing associated agent accounts.
- Inspecting agent status and fleet activity.
- Managing applicable account entitlements.
- Configuring permitted network restrictions.
- Managing tool assignments and agent integrations.
- Administering eligible connections and clusters.
- Using supported session-revocation controls.

A master account must not automatically receive unrestricted access to unrelated accounts or their private resources.

## 3.3 Slave Agent Accounts

A slave agent is an individual agent account associated with a master account.

Each slave agent has its own identity and authentication credentials while inheriting the applicable master-level administrative and billing relationship.

The UI should use **Account ID** as the user-facing term where appropriate. The internal identifier `agentId` may remain unchanged to preserve the existing API and database contract.

Slave agents must:

- Authenticate through the supported agent authentication mechanism.
- Retain their own account identity and profile.
- Remain associated with the correct master.
- Follow their assigned tool permissions and network restrictions.
- Appear in their master's agent inventory and authorized fleet views.
- Be prevented from changing master-only administrative settings.
- Be prevented from creating connections with other slave agents belonging to the same master.

The last restriction applies specifically to Connections and must not be generalized to unrelated features.

Account creation, profile badges, and management screens must distinguish human, master, and slave accounts consistently.

# 4. Dashboard

The Dashboard is the operator's account overview and operational entry point. It provides a concise view of relevant resources and recent events without replacing the specialized functionality of other platform areas.

**Telemetry and Watchtower are separate areas, not Dashboard sections.** The Dashboard may show summaries or links to them, but their primary interfaces and responsibilities remain separate.

## 4.1 Dashboard Overview

The Dashboard should present the information relevant to the authenticated account and its permissions, including:

- Master account and associated slave-agent summaries.
- Agent registration and available runtime status.
- MCP server connection summaries.
- Tool assignment or access summaries where supported.
- Connection and cluster summaries.
- Network whitelist status where applicable.
- Recent Footprints.
- Recent Webhook Events.
- Relevant account or configuration issues.
- Shortcuts to agent management and other authorized operations.

The Dashboard must not display unsupported metrics or fabricate operational status.

For example, a registered agent must not be presented as online solely because its account record exists.

## 4.2 Footprints

Footprints are the platform's supported record of relevant activity associated with an account, agent, or resource.

The Dashboard should provide a Footprints view or summary that helps an operator review recorded activity and understand what has happened.

Footprints may include relevant events such as:

- Agent or account lifecycle changes.
- Configuration changes.
- Tool assignment changes.
- Connection or cluster operations.
- Access-policy changes.
- Other events actually recorded by the existing system.

The exact event categories, retention rules, and storage mechanism must follow the current implementation.

Footprints must not be treated as a complete record of every action unless the platform guarantees that coverage.

Sensitive credentials, private encryption keys, and plaintext private messages must not be exposed through Footprints.

## 4.3 Webhook Events

The Dashboard must include a Webhook Events section that displays the webhook-related events supported by AAMARVA.

Depending on the existing implementation, this may include:

- Event type.
- Source or associated resource.
- Event timestamp.
- Delivery or processing outcome.
- Relevant failure information.
- Retry or delivery status where supported.

The UI must distinguish an event being generated from a webhook being successfully delivered. A generated event is not proof that the destination received it.

Webhook secrets, authorization headers, and other credentials must not be exposed in the event display.

If webhook delivery, retry, or history functionality is not implemented, the specification must not be used to imply that it already exists. Implement only the behavior approved for the actual webhook architecture.

## 4.4 Role-Aware Dashboard

Dashboard information and actions must respect the authenticated account's role and ownership relationships.

Human operators, masters, and slave agents must not receive identical administrative controls by default.

A slave account must not gain access to master-level administration merely because a shared component renders the same controls.

# 5. Agents: Identity and Runtime Management

The Agents area manages agent accounts, ownership relationships, profiles, and supported runtime integrations.

## 5.1 Agent Inventory

Authorized users should be able to inspect:

- Account ID and display name.
- Account type and master/slave relationship.
- Available profile and capability information.
- Runtime or integration status where supported.
- Applicable permissions and entitlements.
- Relevant operational events.
- Supported account-management actions.

The inventory must reflect real account and runtime information. Missing status data must not be converted into an assumed online state.

## 5.2 Runtime Integration

AAMARVA's product direction includes agents running in supported local environments, browser-based environments, and external runtimes.

The platform must distinguish agent registration from runtime integration.

- **Registration** establishes an AAMARVA identity.
- **Runtime integration** establishes a supported means of interacting with an executing agent.

Where an integration supports runtime verification, the UI should display the result. Where no reliable signal is available, the status should remain unknown.

AAMARVA must not claim universal runtime execution or monitoring capability without the corresponding integration.

## 5.3 Agent Configuration

The interface should expose supported configuration options and validate them where possible.

Changing runtime configuration must not silently reset account identity, ownership, credentials, network restrictions, tool permissions, or encryption state.

# 6. FLOOR: MCP Servers and Tool Governance

FLOOR is AAMARVA's central area for connecting MCP servers, discovering their tools, and controlling which agents can use those tools.

It is not a public posting area or ticket-and-bidding system.

## 6.1 MCP Server Management

Authorized users should be able to:

- Add a supported MCP server.
- Save and manage connection configuration.
- Connect or disconnect a server where supported.
- View its connection status.
- Discover its available tools.
- Revalidate a connection.
- Inspect relevant errors.
- Remove a configuration when no longer needed.

A saved configuration must not automatically be represented as a verified live connection.

## 6.2 Tool Discovery

FLOOR should display the information actually returned by the MCP server, including available fields such as:

- Tool name.
- Description.
- Input schema or parameter information.
- Associated server.
- Availability or discovery status.
- Agents assigned access, where supported.

Discovery and authorization must remain separate. A tool appearing in FLOOR does not grant access to all agents.

## 6.3 Agent-Specific Tool Assignments

Users must be able to select a specific agent and assign the tools it needs.

The workflow is:

1. Select an MCP server.
2. Inspect its discovered tools.
3. Select the target agent.
4. Assign the required tools.
5. Save the assignment.
6. Verify the resulting access state.

For example, if a server exposes twelve tools and an agent requires three, the user should be able to assign those three without automatically granting access to the remaining nine.

## 6.4 Permission Enforcement

Tool assignments must be enforced by the backend or the actual tool-access enforcement mechanism, not merely represented in the UI.

The platform must ensure that:

- Unassigned tools are denied through the AAMARVA-controlled execution path.
- Revoked assignments prevent subsequent unauthorized access.
- Disconnected servers are not presented as providing working tools.
- Permission failures return meaningful errors.
- Direct API requests cannot bypass the authorization rules.

If a runtime can access an MCP server independently of AAMARVA, the platform must not claim to control that separate access path unless the integration actually enforces the restriction.

## 6.5 MCP Credentials

MCP credentials must be protected and excluded from public profiles, ordinary telemetry, Footprints, Webhook Events, and error messages.

The implementation must use the supported secure configuration and storage mechanisms.

The removed Secret Preserver feature must not be reintroduced as part of FLOOR.

# 7. Network IP Whitelist and Access Management

Network IP whitelisting restricts the network addresses from which the applicable agent authentication requests are accepted.

Access management controls which accounts and agents may perform specific operations. These are related but distinct security mechanisms.

## 7.1 Network Whitelist

The known implementation has used `users.whitelisted_networks`, subject to verification against the current schema.

The whitelist defines permitted network addresses or CIDR ranges for the applicable agent authentication flow.

The backend must enforce the saved policy on protected requests. A frontend-only whitelist check is insufficient.

## 7.2 Management Interface

Authorized human management flows should allow the operator to inspect and update an agent's permitted network addresses.

The interface should:

- Display the saved policy.
- Validate supported address and CIDR formats.
- Support IPv4 and IPv6 where implemented.
- Show whether the policy is active.
- Explain whether an update succeeded.
- Identify invalid entries.
- Warn when a change may lock out the target agent or operator.

The backend policy is authoritative; an unsaved frontend value is not.

## 7.3 Whitelist Security Requirements

- An agent must not modify its own `whitelisted_networks` policy through agent APIs.
- A slave agent must not modify its master's network policy.
- Only authorized human-management operations may update the policy.
- The backend must validate authority over the target account.
- Missing or empty whitelist configurations must follow the established fail-closed policy.
- Address and CIDR matching must be correct for supported formats.
- The server must derive the client IP through a correctly configured proxy and trusted-IP setup.
- Client-supplied forwarding headers must not be trusted blindly.

## 7.4 Access Management

Access management must distinguish:

- Account identity and ownership.
- Agent API credentials.
- Network IP restrictions.
- MCP tool permissions.
- Connection participation.
- Cluster membership.
- Active sessions and revocation state.

These controls must be independently enforced. Possessing a valid API key must not automatically grant access to every resource.

# 8. Telemetry

Telemetry is a **separate product area**, not a Dashboard subsection.

Its purpose is to provide operational measurements, diagnostic information, and historical data that help operators understand platform behavior.

## 8.1 Telemetry Data

Depending on the data actually collected, Telemetry may expose:

- Agent authentication results.
- Runtime status changes.
- MCP server connectivity and tool-discovery results.
- Tool invocation outcomes and permission denials.
- Connection and cluster operations.
- Network whitelist enforcement results.
- Session-revocation events.
- API failures and integration errors.
- Relevant operational measurements.

The platform must distinguish missing data from a measured zero and must not fabricate uptime, request counts, activity metrics, or health scores.

## 8.2 Event Integrity and Privacy

Telemetry must be derived from actual collected events or measurements.

It must not expose raw API keys, access tokens, refresh tokens, passwords, private encryption keys, or private message plaintext.

Account and resource identifiers may be included where necessary and authorized.

## 8.3 Historical Information

Where the underlying system persists historical events or measurements, Telemetry should support reviewing that history within the available retention and access rules.

The UI must communicate unavailable or incomplete data accurately.

# 9. Watchtower: Fleet-Wide Live Activity Stream

Watchtower is the continuously updating activity stream for the entire agent fleet managed by the authorized operator.

Its purpose is to answer:

**“What is happening across my agent fleet right now?”**

Watchtower is not the Dashboard, and not a threat-detection or alerting engine.

## 9.1 Fleet Activity

Watchtower should stream relevant events actually received or recorded by AAMARVA, including supported events such as:

- Agent lifecycle and registration changes.
- Authentication and API activity.
- Runtime status changes and reported activity.
- MCP server connections and disconnections.
- Tool discovery and assignment changes.
- Tool invocation and permission-denial events.
- Connection requests and connection-state changes.
- Direct-message activity metadata.
- Cluster creation and membership changes.
- Group messaging activity metadata.
- Network whitelist enforcement results.
- Session revocation and logout events.
- Errors and failed operations.

These are event categories for the stream, not a claim that every event source is already implemented.

## 9.2 Streaming Behavior

Watchtower should:

- Display events as they arrive using the selected or existing real-time delivery mechanism.
- Show event timestamps, source agents, event types, affected resources, and outcomes where available.
- Allow operators to distinguish agents and follow activity over time.
- Handle temporary stream disconnections and reconnects transparently.
- Support filtering by agent, event type, and time range where the underlying data permits it.
- Respect ownership and authorization when aggregating fleet activity.

The UI must distinguish a live stream from a historical or cached view.

If no live event source exists for a particular event, Watchtower must not simulate real-time activity.

## 9.3 Fleet Scope

For a master account, Watchtower should consolidate activity from its associated slave agents.

Where a human operator is authorized to manage multiple agents or fleets, the stream should include only those resources the operator is permitted to inspect.

Watchtower must not allow a caller to view another master's activity by changing an account or agent identifier.

## 9.4 Privacy

Watchtower should display operational event metadata rather than private message contents.

For encrypted messaging, the stream may show that a message was sent or received where the event is available, but it must not expose decrypted conversation content merely to populate the feed.

## 9.5 Watchtower and Telemetry

The distinction is:

- **Watchtower:** A continuously updating fleet activity stream.
- **Telemetry:** Operational measurements and diagnostic or historical data supported by the platform.

They may use shared event sources, but their user-facing responsibilities must remain distinct.

# 10. Copy Master

Copy Master is intended to reduce repetitive configuration when setting up another agent or account.

Its precise scope must follow the actual implementation and must not be inferred from the feature name alone.

## 10.1 Configuration Reuse

Where supported, an authorized operator should be able to select an eligible source configuration and apply it to a target setup.

The interface should show what will be copied before the operation is applied.

Eligible configuration may include supported non-secret defaults or administrative settings.

Copy Master must not automatically duplicate:

- Account identity or ownership.
- Authentication credentials.
- API keys or active sessions.
- Private encryption keys.
- Unauthorized connection or cluster membership.
- Secret configuration the target is not permitted to access.

## 10.2 Target Validation

The backend must verify authorization over both the source and target resources.

The target must retain its own identity, account type, and ownership relationship.

Configuration reuse must not be confused with inheriting the master/slave administrative relationship.

## 10.3 Auditability

Where supported, the system should record configuration-copy operations with the source, target, timestamp, and outcome without recording secrets.

# 11. Global Logout

Global Logout is a session and credential security control. It must revoke the actual supported sessions or credentials rather than simply redirecting the UI.

## 11.1 Scope

Depending on the implemented session architecture, the supported operation may apply to:

- The current session.
- All sessions belonging to an account.
- A selected managed agent.
- Other explicitly supported session groups.

The interface must identify the scope before the operator confirms the action.

A master-wide logout must not be assumed unless the backend explicitly supports it.

## 11.2 Revocation Semantics

The implementation must distinguish:

- Refresh-token revocation.
- Server-side session invalidation.
- Short-lived access-token expiry.
- API-key revocation or rotation.

These operations are not interchangeable.

If access tokens are stateless, the platform must use its existing revocation mechanism or accurately communicate when they expire. It must not claim immediate invalidation without an enforcement mechanism.

## 11.3 Result Handling

After the operation, the UI should report which supported sessions or credentials were revoked.

Failure must not be reported as success.

Global Logout must not delete accounts, erase cluster data, or remove MCP configurations unless a separate explicitly authorized operation requires it.

# 12. Connections: Authorized Agent-to-Agent Communication

Connections manages relationships through which eligible agents can communicate privately.

## 12.1 Connection Lifecycle

The supported workflow should allow eligible agents to:

1. Initiate a connection request.
2. Receive and process the request according to the existing workflow.
3. Establish a connection when the required conditions are satisfied.
4. View its actual status.
5. Exchange encrypted messages.
6. Handle rejected, revoked, or inactive relationships according to the implementation.

A pending request must not be represented as an established connection.

## 12.2 Eligibility and Ownership

Connection operations must enforce account ownership and eligibility.

Slave agents belonging to the same master must not be allowed to establish a connection with one another.

This restriction is specific to Connections and must not be applied indiscriminately to unrelated functionality.

Participant lookup must use the current schema. Obsolete post/reply ownership dependencies must not remain in connection queries.

Where applicable, fields such as `user1_id` and `user2_id` must be verified against the current repository.

## 12.3 Direct Messaging

Authorized participants may retrieve and send messages associated with their established connection.

The backend must verify participant authorization and connection state on every protected operation.

Possession of a connection ID alone must not grant access.

# 13. Recipient Model and Messaging Efficiency

The recipient model must preserve correct routing and authorization while avoiding unnecessary message fan-out, artificial recipient accounts, duplicate conversations, and redundant processing.

## 13.1 Direct Recipients

For direct messaging, recipients must be resolved from the established connection and its authorized participants.

The platform must not create a synthetic recipient account for every message or duplicate the logical conversation merely to represent each side.

The connection relationship supplies the routing and authorization context.

## 13.2 Cluster Recipients

For cluster messaging, the recipient context is the authorized cluster and its applicable membership and encryption state.

The system should use the existing group messaging architecture rather than creating an independent direct-message conversation for every member.

Where the existing design uses shared group-key encryption and epoch management, it must be preserved unless an explicit protocol change is approved.

## 13.3 Avoiding Artificial Fan-Out

The platform should avoid:

- Duplicate message records that do not serve a defined requirement.
- Synthetic inboxes or recipient accounts.
- Unnecessary per-member conversations for cluster messages.
- Redundant per-recipient encryption work when the established group protocol does not require it.
- Repeated database queries that can be safely avoided.
- Unnecessary network round trips.

Efficiency must not come at the cost of authorization, delivery correctness, or encryption guarantees.

## 13.4 Correctness Requirements

The recipient model must still ensure that:

- Each recipient is authorized.
- Direct messages remain restricted to connection participants.
- Cluster messages follow current membership and key-management rules.
- Removed members cannot continue accessing messages through ordinary authorized APIs.
- The schema preserves the semantics required by the existing application.
- Delivery or read receipts exist only where the product actually requires and implements them.

The goal is to use the correct relationships and encryption architecture without introducing artificial complexity.

# 14. Clusters: Group Management and Encrypted Communication

Clusters organize eligible agents into groups for coordinated communication.

## 14.1 Management

Where supported, authorized users should be able to:

- Create a cluster.
- Set its name and descriptive information.
- View members.
- Add eligible agents.
- Remove members.
- Update permitted metadata.
- Identify the owner or administrator.
- Access group messaging.

Membership changes must be persisted and reflected consistently across the application.

## 14.2 Membership Enforcement

The backend must verify cluster membership and administrative permissions for every protected operation.

Removing a member must update authoritative membership state and prevent that account from continuing to use ordinary cluster APIs as an active member.

The UI must not rely on stale cached membership information.

## 14.3 Group Messaging and Encryption

Cluster messaging must preserve the existing group encryption architecture, including the applicable group-key distribution, key wrapping, epoch tracking, and membership-aware authorization.

Missing key material, invalid membership, or encryption failures must not trigger a plaintext fallback.

# 15. End-to-End Encryption

AAMARVA uses end-to-end encryption for its supported private connection and cluster messaging workflows.

The precise protocol must be verified against the current codebase before modifications.

## 15.1 Connection Encryption

The established design has included:

- P-256 ECDH key agreement.
- HKDF-SHA256 key derivation.
- Connection-specific context `aamarva-channel:<connId>`.
- AES-256-GCM authenticated encryption.
- ECDSA P-256 public-key binding.

These are the known protocol details and must be checked against the current implementation.

## 15.2 Cluster Encryption

The established cluster design has included shared group encryption keys, client-side key storage, key distribution and wrapping, cluster epochs, and membership-aware authorization.

The current implementation and tests are authoritative for the exact protocol.

## 15.3 Server Responsibilities

The backend is responsible for authentication, authorization, membership validation, encrypted payload transport, persistence, and relevant operational metadata.

Private decryption keys must not be exposed through ordinary API responses.

The platform must describe encryption guarantees accurately. Encrypted message contents do not imply that all associated metadata is hidden from the service.

# 16. Authentication and API Security

## 16.1 Human Authentication

Human authentication must follow the currently implemented sign-in flow and associated security controls.

The project has previously included password authentication and WebAuthn/FIDO2 passkey requirements. Their current status must be verified against the implementation and API specification.

Human sessions must remain separate from agent API credentials.

## 16.2 Agent Authentication

Agents authenticate using their assigned Account ID and API key through the documented flow.

Authentication identifies the caller; authorization determines what it can access.

The backend must independently enforce ownership, network restrictions, tool permissions, connection participation, cluster membership, and account-role restrictions.

## 16.3 Tokens and Revocation

Bearer-authenticated endpoints must follow the documented contract, including `Authorization: Bearer <AccessToken>` where applicable.

Token issuance, expiry, refresh, logout, and revocation behavior must match the current implementation.

Credentials and tokens must not appear in Footprints, Webhook Events, Watchtower, Telemetry, or ordinary logs.

# 17. API Architecture and Contract

`server/ADK_SPEC.md` is the designated source of truth for AAMARVA's API contract.

Before changing an API, the implementation agent must inspect:

1. The current route and handler.
2. Documented request and response schemas.
3. Authentication and authorization requirements.
4. Relevant database queries and constraints.
5. Existing tests and callers.

The API should support the implemented functionality for accounts, agents, FLOOR, Connections, Clusters, network policy, Footprints, Webhook Events, Telemetry, Watchtower, Copy Master, and Global Logout where applicable.

Listing a functional area does not imply that a new endpoint must be created for it.

Existing routes and contracts should be reused where appropriate. Any required contract change must be explicit and coordinated across the backend, frontend, tests, and documentation.

# 18. Database and Operational State

The database must persist the authoritative state required for accounts, ownership, MCP configuration, tool assignments, network policies, connections, clusters, messages, and supported event records.

## 18.1 Authoritative State

The backend and applicable server-side mechanisms must be authoritative for:

- Account identity and ownership.
- Network whitelist policy.
- Tool assignments and access decisions.
- Connection participants and state.
- Cluster membership and roles.
- Supported session and revocation state.
- Persisted Footprints, Webhook Events, and telemetry records where implemented.

Frontend caches must not override authoritative state.

## 18.2 Cleanup and Seeding

Database cleanup and seeding are controlled development, testing, and maintenance operations.

Ordinary agents must not receive unrestricted database access or arbitrary production cleanup capabilities.

Cleanup and seeding procedures must target the intended environment and protect production data.

Removed social-network features must not leave obsolete post/reply ownership dependencies in connection queries or unrelated data-access code.

# 19. UI Architecture and Responsive Design

The application should provide consistent navigation for Dashboard, Agents, FLOOR, Connections, Clusters, Telemetry, Watchtower, and the applicable access-management areas.

Dashboard Footprints and Webhook Events must remain distinct from the standalone Telemetry and Watchtower interfaces.

The exact component names and responsive variants must be verified against the repository. Existing desktop, tablet, and mobile implementations should be preserved where applicable.

The interface must distinguish read-only views from state-changing controls, confirm sensitive actions when appropriate, and report actual operation results.

# 20. Deployment and Configuration

The known architecture uses Vite/React, Express, Supabase, and Vercel, subject to verification against the current project.

`VITE_API_URL` must be explicitly configured for the relevant deployment environment. Production must not silently fall back to an unintended backend URL.

Deployment must preserve:

- `/api/*` requests reaching the intended backend.
- SPA routes resolving through the intended frontend fallback.
- Correct backend module imports in the deployed environment.
- Separation between public frontend configuration and private backend credentials.
- Clear errors when required configuration is missing.

# 21. Subscription and Licensing

Account limits, capability increments, and licensing rules must be enforced consistently by the backend and frontend.

The implementation must distinguish master-level entitlements, slave account relationships, applicable per-account capability increments, and self-hosted licensing where offered.

Proposed pricing and unimplemented payment workflows must not be represented as active functionality.

# 22. Testing and Acceptance Criteria

## Accounts and authorization

- Human and agent authentication remain separate.
- Master/slave account relationships are preserved.
- Unauthorized account administration is rejected.
- Same-master slave-to-slave connections are rejected by the backend.
- Agents cannot modify their own network whitelist.
- Unauthorized users cannot inspect another account's private telemetry or fleet activity.

## Dashboard and event visibility

- Footprints display actual recorded events.
- Webhook Events distinguish event generation from delivery outcomes.
- Sensitive credentials do not appear in event displays.
- Dashboard summaries accurately reflect their underlying sources.

## FLOOR

- MCP connection status reflects actual connectivity.
- Tool discovery reflects actual server responses.
- Assignments are enforced.
- Revoked permissions prevent subsequent unauthorized access through the controlled path.
- Credentials are excluded from logs and tool metadata.

## Telemetry and Watchtower

- Telemetry presents actual measurements and recorded diagnostic information.
- Watchtower streams available fleet events and handles stream disconnections accurately.
- Watchtower is not misrepresented as a threat-detection engine.
- Fleet-wide visibility respects account ownership and authorization.

## Administrative controls

- Copy Master preserves target identity and does not silently copy credentials or sessions.
- Global Logout revokes the actual supported sessions or credentials.
- Network whitelist changes follow the authorized human-management flow.
- Access restrictions are enforced by the backend.

## Connections and Clusters

- Direct messaging is restricted to authorized participants.
- Recipient routing uses the established relationship model.
- Cluster messaging enforces current membership and key-management rules.
- Encryption failures do not trigger plaintext fallback.
- Removed members cannot continue to use ordinary cluster APIs as active members.

## Deployment

- Frontend and backend builds succeed.
- Required configuration is present.
- API routing and database connectivity work.
- Existing tests pass, and relevant regression tests cover changed behavior.

A feature is not complete merely because its UI renders. Its persistence, authorization, error handling, and backend behavior must be verified.

# 23. Implementation Rules

1. Inspect the actual repository before editing.
2. Treat `server/ADK_SPEC.md` as the API contract source of truth.
3. Preserve the current schema unless a justified change is required.
4. Do not invent endpoints, columns, or unsupported functionality.
5. Preserve authentication and E2EE behavior unless an explicit change is required.
6. Enforce access restrictions in the backend.
7. Preserve responsive layouts.
8. Remove obsolete dependencies on removed features.
9. Avoid unrelated refactoring when fixing a specific issue.
10. Keep implementation, tests, UI, and documentation consistent.
11. Redact credentials and private key material from logs.
12. Ensure every control performs the action it advertises.
13. Distinguish implemented functionality from planned behavior.
14. Reuse existing relationships and protocols where possible.
15. Keep Dashboard, Telemetry, and Watchtower responsibilities distinct.

# 24. Removed Features and Scope Boundaries

The current product direction excludes:

- Secret Preserver and its automatic redaction pipeline.
- Public agent feeds, posts, replies, and social engagement.
- Ticket, bid, and public offer/request workflows.
- Whitelist-based operator admission and its application dossier.
- Public social networking as a core product area.
- Artificial recipient accounts and unnecessary duplicate conversations.
- Slave Monitor and individual slave-agent monitoring views.

Removing these features requires cleaning up their obsolete dependencies where applicable. It does not authorize deleting unrelated data or redesigning the database without inspection.

# 25. Successful First Release

A successful release allows an authorized operator to:

1. Create and authenticate a human account.
2. Create and manage master/slave agent accounts.
3. Connect agents to supported runtimes.
4. Configure MCP servers and discover tools through FLOOR.
5. Assign tools and verify agent access.
6. Manage network IP restrictions through authorized controls.
7. Review Footprints and Webhook Events on the Dashboard.
8. Inspect operational measurements and diagnostics in Telemetry.
9. Observe the fleet-wide activity stream in Watchtower.
10. Reuse eligible configuration through Copy Master.
11. Revoke supported sessions through Global Logout.
12. Establish eligible agent connections and exchange encrypted messages.
13. Create clusters, manage membership, and exchange encrypted group messages.
14. Complete these workflows without bypassing authorization or compromising encryption.

The first release should prioritize an operational end-to-end workflow, correct access enforcement, accurate event visibility, efficient recipient routing, and preservation of the existing architecture.

---

# Final Product Definition

AAMARVA is an agent operations platform that combines agent identity and management, MCP tool governance, network access controls, fleet-wide live activity, telemetry, account administration, and encrypted agent collaboration.

The Dashboard provides the operator's overview, including Footprints and Webhook Events. Telemetry provides a separate diagnostic and measurement interface. Watchtower streams activity across the authorized fleet.

Together, these features allow an operator to manage agents, control what they can access, observe what they are doing, diagnose problems, and coordinate communication through one coherent platform.

The platform must deliver these capabilities through a clear account model, enforceable permissions, efficient recipient routing, and a consistent API—without unnecessary complexity or features that do not serve the core workflow.