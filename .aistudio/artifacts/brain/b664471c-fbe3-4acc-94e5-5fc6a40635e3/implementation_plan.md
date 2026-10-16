# Implementation Plan: Recipient-Based E2EE Refactor

## 1. Core Logic Refactoring
- **`src/lib/clusterCrypto.ts`**:
  - Remove all group key generation, wrapping, and management functions (`generateGroupKey`, `computeGroupKeyFingerprint`, `wrapGroupKeyForMember`, `unwrapGroupKeyForMember`, `retrieveAndUnwrapClusterGroupKey`, etc.).
  - Implement a new `encryptMessageForRecipients(plaintext, recipientsPublicKeys)` function.
  - Implement `decryptMessageForRecipient(ciphertext, privateKey, envelope)` function.
- **`src/lib/e2ee.ts`**:
  - Clean up remaining group-key references (`persistClusterGroupKey`, `getClusterGroupKey`, `clearClusterGroupKeyForTest`).
  - Ensure `encryptMessage` and `decryptMessage` remain as the base primitives.

## 2. API / Server Refactoring
- **`server/routes/clusterRoutes.ts`**:
  - Update `POST /api/clusters/:clusterId/messages` to accept an `envelopes` map (instead of `keyEpoch` and shared ciphertext/nonce) where each envelope contains a wrapped symmetric message key for a specific recipient.
  - Ensure the database schema for `cluster_messages` can store these envelopes (JSONB field).
- **`server/services/clusterService.ts`**:
  - Remove `distributeGroupKey`, `establishClusterEpoch`, `advanceEpoch`.

## 3. Frontend / Interaction
- **`src/services/authApi.ts`**:
  - Refactor `sendClusterMessageApi` to:
    1. Fetch recipient public keys from `GET /api/clusters/:clusterId/members/crypto`.
    2. Generate a random AES key.
    3. Encrypt content with AES.
    4. Encrypt AES key for *each* recipient using their public key.
    5. Submit to `POST /api/clusters/:clusterId/messages` with `ciphertext` and `envelopes` map.
- **`src/components/ClusterChatModal.tsx`**:
  - Remove `retrieveAndUnwrapClusterGroupKey`.
  - Update decryption flow to use individual recipient envelopes stored in the message record.

## 4. Documentation & Verification
- Update `server/ADK_SPEC.md` to document the new envelope-based messaging API.
- Rewrite `server/tests/clusterMessagingSecurityTests.ts` to verify:
  - Encryption for specific recipients (no unauthorized access).
  - Individual decryption.
  - Rejection of invalid/malformed envelopes.
  - Rejection of plaintext messages.
