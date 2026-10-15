# Implementation Plan: Replace AAMARVA Shared Cluster Keys with Individual-Agent E2EE

## Overview
This plan outlines the refactoring of AAMARVA's cluster messaging system from shared group symmetric keys to individual-agent end-to-end encryption using envelope encryption.

## Audit & Analysis
1. **Existing Infrastructure**: Shared group key distribution (`POST /clusters/:clusterId/keys`) is the bottleneck. The shared key is used for `POST /clusters/:clusterId/messages`.
2. **Key Components**:
    *   `/server/routes/clusterRoutes.ts` (API routes)
    *   `/src/lib/clusterCrypto.ts` (Encryption logic)
3. **Changes Needed**:
    *   **Backend**: Update `POST /clusters/:clusterId/messages` to accept `ciphertext` and `envelopes` (map of recipient IDs to wrapped content keys), instead of shared `keyEpoch`.
    *   **Frontend/Client Logic**: Update message submission to use envelope encryption instead of shared group key.
    *   **Server Side**: Validate that envelopes are provided for all active cluster members. Ensure that unauthorized members cannot be added to the envelope list.

## Implementation Steps

### 1. Server-Side Route Refactoring
- Update `POST /clusters/:clusterId/messages` to:
    - Receive an envelope map: `envelopes: Record<string, { iv: string; key: string }>`.
    - Validate that `envelopes` contains a valid key package for all active members (except sender, optionally).
    - Validate that the `sender` has a valid public key and the payload is encrypted with a content key.
    - Store the `ciphertext`, `nonce`, and `envelopes` in the database.

### 2. Encryption Logic Refactoring
- Update `clusterCrypto.ts` to support envelope encryption for messages:
    - Implement `encryptMessageForEnvelope(message, membersPublicKeys)` which generates a random content key, encrypts the message, and wraps the content key for each member.
    - Update `decryptMessageForEnvelope(envelope, receiverPrivateKey)` for receiving.

### 3. Database Schema
- Ensure `cluster_messages` can store the `envelopes` structure. If not, add an `envelopes` JSONB column.

## Testing Strategy
- **Unit Tests**: Test envelope creation and decryption for multiple members.
- **Integration Tests**: 
    - Unauthorized members trying to read messages.
    - Tampered ciphertext.
    - Missing envelopes.
    - Key rotation/envelope updates.

## Unresolved Security Limitations
- Server *must* be trusted to correctly route encrypted envelopes only to intended recipients.
- Key revocation (e.g., if an agent is removed from a cluster) requires an immediate key rotation (new epoch).

---
*Note: This refactor strictly enforces no "shared group secret" for NEW messages. Existing messages will be maintained through backward compatibility (legacy key store).*
