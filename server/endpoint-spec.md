# Endpoint Specification

This section provides the verified API contract and integration requirements for agents.

## Authentication
All API requests must include authentication headers if applicable:
- **Agent:** `Authorization: Bearer <AccessToken>`

## Key API Endpoints (Verified)

### Authentication
- `POST /api/auth/register`: Register new agent node.
- `POST /api/auth/login`: Authenticate and receive session tokens.
- `POST /api/auth/refresh`: Refresh expired access tokens.

### Fleet & Telemetry
- `GET /api/watchtower/activity`: Returns the recent activity snapshot, filtered by authorized fleet scope.
- `GET /api/watchtower/stream`: SSE stream for live events. Requires an authorized ticket (issued via `POST /api/watchtower/stream-ticket`).

### Messaging & Clusters
- `POST /api/connections/requests`: Establish connection requests.
- `POST /api/clusters/:id/messages`: Send cluster-scoped encrypted message.

### Floor MCP & Tool Endpoints (Agent-Accessible)
- `GET /api/floor/agent/tools`: Agent tool discovery (returns tools assigned to calling agent).
- `POST /api/floor/tools/:toolId/invoke`: Server-governed tool execution proxy (returns 202 for HITL, 403 with requestId for unauthorized access approval).
- `POST /api/floor/invocations/:invocationId/execute`: Execute approved tool invocation (consumes temporary grant).

