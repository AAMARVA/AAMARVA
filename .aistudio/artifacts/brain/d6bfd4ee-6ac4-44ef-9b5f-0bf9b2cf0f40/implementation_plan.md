# AAMARVA Product-Scope Cleanup and Security Enforcement

## Summary
This plan addresses the non-negotiable requirement to remove all discovery functionality from AAMARVA, eliminate the obsolete shared-key architecture for Cluster Chat, and enforce a strict recipient-only encryption model. The ADK and API contracts will be aligned with this truthful scope, and existing infrastructure (connections, auth, clusters) will be preserved.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions are made to align with the core product scope. No UI changes are proposed, only the removal of unsupported capabilities and the cleanup of obsolete claims.

- **Discovery Removal**: Discovery endpoints, claims, and documentation will be removed. UI copy in `TermsView.tsx` will be updated to remove references to discovery.
- **Shared Key Removal**: `cluster_key_distributions` table and related API routes will be removed.
- **Recipient Model**: All message submissions will be enforced to include explicit, valid recipient envelopes for recipient-only decryption.

## 1. Overview & Core Concept
- **Goal**: Establish AAMARVA as a secure platform for authorized communication, not discovery.
- **Scope**: Direct connections, clusters, recipient-specific E2EE, authorized agent/human communication.

## 2. Technical Architecture & Data Strategy

### Migration Checklist:
- **Security**: 
    - [ ] Update `clusterRoutes.ts` message handler to validate recipient-specific envelopes.
    - [ ] Remove shared group-key logic.
    - [ ] Ensure DB enforces `content = null` for encrypted records if decryption fails or envelopes are missing.
- **Discovery Cleanup**:
    - [ ] Remove discovery endpoints (TBD after full audit).
    - [ ] Remove discovery claims in `TermsView.tsx` and `README.md`.
- **Schema Migration**:
    - [ ] Add forward migration to drop `cluster_key_distributions` table (verify if `remove_obsolete_group_key_schema.sql` is already applied, if not, apply).
- **ADK/API Alignment**:
    - [ ] Fix `GET /api/adk` response structure.
    - [ ] Audit all endpoints for authorization (human vs agent session enforcement).
    - [ ] Verify `GET /api/clusters/:clusterId/members/crypto` returns authoritative identity keys.

### Architecture
```
┌──────────────────────────────────────┐
│       AAMARVA API (Express/Express)  │
└──────────────────┬───────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │  Authorization Middleware   │ (Auth/Human/Agent/Cluster Auth)
    └──────────────┴──────────────┘
                   │
    ┌──────────────┴──────────────┐
    │      Core Services          │ (Connection, ClusterMessage, Auth)
    └──────────────┴──────────────┘
                   │
    ┌──────────────┴──────────────┐
    │      Supabase (DB)          │ (Clusters, Members, Messages, Recipients)
    └─────────────────────────────┘
```

## 3. Deployment & Verification
- Run full build, lint, and test suite.
- Verify security with E2EE encryption/decryption tests, specifically confirming that recipients *without* an envelope cannot decrypt a message.
- Verify that `cluster_key_distributions` and discovery routes are inaccessible.
