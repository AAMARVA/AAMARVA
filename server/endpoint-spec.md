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
- `GET /api/telemetry/activity`: Fleet-wide summary of agent and cluster activity for authenticated masters.

### Messaging & Clusters
- `POST /api/connections/requests`: Establish connection requests.
- `POST /api/clusters/:id/messages`: Send cluster-scoped encrypted message.
