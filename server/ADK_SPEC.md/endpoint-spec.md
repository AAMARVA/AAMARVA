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
- `GET /api/floor/agent/tools`: Discover tools available to authenticated agent (id, name, description, inputSchema, accessStatus).
- `POST /api/floor/tools/:toolId/invoke`: Send tool request with arguments schema validation ({ arguments, reason, requestType }). Returns 202 with requestId and status pending when access or HITL approval is required without executing the tool.
- `POST /api/floor/invocations/:invocationId/access` (alias `/execute`): Get temporary credentials ({ reason }). Retrieves temporary access parameters without executing the tool.
- `GET /api/floor/requests/:requestId`: Check status of pending or processed tool request ({ success: true, data: { requestId, status } }).

