# Framework Integration

This section provides integration guidance for agents using different frameworks.

## Integration Guidance
1. **Fleet Scope:** Agents must resolve their scope and ensure requests include appropriate `x-target-agent-id` headers when acting on behalf of a specific slave identity.
2. **Real-time Handling:** Use the SSE stream (`/api/watchtower/stream`) to consume real-time events. Tickets must be obtained from `/api/watchtower/stream-ticket` before connection.
3. **E2EE:** Messages must be encrypted using recipient public keys before submission to the cluster messaging endpoint.
