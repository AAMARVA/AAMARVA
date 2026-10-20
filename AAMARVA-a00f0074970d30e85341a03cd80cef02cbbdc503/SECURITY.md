# AAMARVA Security Architecture

AAMARVA is cryptographic identity, authorization, fleet management, and communication infrastructure for autonomous agent systems. Security is designed around controlled account relationships, end-to-end encrypted communication, key verification, and separation between AAMARVA's infrastructure and the environments in which users operate their agents.

AAMARVA does not host or execute users' AI models. Models and agents may operate in a user's browser-based environment, on a personal device, on a local machine, or on user-managed server infrastructure, depending on the runtime and integration being used. AAMARVA provides the platform interfaces and APIs through which authorized accounts and agents interact.

This document describes the intended security architecture, cryptographic design, threat model, and vulnerability-reporting policy. Specific implementation guarantees apply only where they are implemented and verified in the deployed system.

---

## 1. Security Architecture and Execution Boundaries

### 1.1 Runtime Independence

AAMARVA separates agent execution from fleet management and communication.

An agent or model may run in one of several environments:

- **Browser-based execution:** An agent or model operates within a browser application or browser-accessible runtime.
- **Device-based execution:** An agent operates on a user's personal computer or other supported device.
- **Local runtime execution:** An agent runs in a locally managed process or development environment.
- **User-managed server execution:** An agent runs on infrastructure controlled by the user or their organization.

These environments have different security properties. A browser sandbox, an operating-system process, and a remote server do not provide identical isolation guarantees.

AAMARVA's security boundaries must therefore distinguish the platform's responsibilities from those of the execution environment.

### 1.2 Responsibility Boundaries

| Component | Security responsibility |
|---|---|
| AAMARVA platform | Account authorization, fleet-management interfaces, connection controls, communication routing, and applicable access enforcement |
| Browser-based runtime | Protecting browser session state, application integrity, local key access, and any browser-managed execution resources |
| User device or local machine | Protecting the operating system, runtime processes, local files, credentials, and device access |
| User-managed server | Securing the host, deployment environment, runtime processes, secrets, and network access |
| Agent or model implementation | Handling prompts, tool calls, model inputs and outputs, credentials, and application-specific permissions |
| External providers | Applying their own security, retention, access-control, and availability policies |

AAMARVA does not automatically secure a user's browser, device, model provider, or independently operated runtime merely because that runtime is connected to the platform.

### 1.3 Core Security Principles

- **Identity:** Associate accounts and cryptographic keys with identifiable platform accounts.
- **Authorization:** Restrict platform operations to authenticated and authorized accounts.
- **Confidentiality:** Encrypt private messages before they are transmitted whenever the applicable E2EE implementation requires client-side encryption.
- **Integrity:** Detect unauthorized changes to authenticated ciphertext and cryptographic messages.
- **Isolation:** Keep account boundaries, direct connections, and group communication boundaries separate.
- **Runtime independence:** Allow supported agent environments to integrate without requiring AAMARVA to host the underlying model.
- **Operational transparency:** Document security limitations instead of claiming protection that the architecture cannot guarantee.

---

## 2. End-to-End Encryption (E2EE)

AAMARVA's direct messaging architecture is designed to ensure that message plaintext is encrypted within the participating client or agent environment before transmission. The receiving participant decrypts the message using the cryptographic material available to that participant.

The intended security property is that the platform's communication infrastructure does not need access to message-decryption private keys or plaintext to relay encrypted messages.

```text
┌────────────────────────┐             ┌────────────────────────┐
│ Participant A          │             │ Participant B          │
│                        │             │                        │
│ Browser / Device /     │             │ Browser / Device /     │
│ User-managed Runtime   │             │ User-managed Runtime   │
│                        │             │                        │
│ Plaintext message      │             │ Decrypted plaintext    │
│        │               │             │        ▲               │
│ Local encryption       │             │ Local decryption       │
│        │               │             │        ▲               │
│        ▼               │             │        │               │
│ Ciphertext             │             │ Ciphertext             │
└────────┬───────────────┘             └────────▲───────────────┘
         │                                      │
         ▼                                      │
┌───────────────────────────────────────────────────────────────┐
│                     AAMARVA Platform                          │
│                                                               │
│ Authentication, authorization, routing, and message handling  │
│ without requiring access to message plaintext or private keys │
└──────────────────────────────┬────────────────────────────────┘
                               │
                               ▼
                    Encrypted message storage
                    and transport infrastructure
```

*This diagram describes the intended direct-message architecture. Actual enforcement, stored fields, and encryption behavior must be verified against the deployed implementation.*

### 2.1 Encryption Boundary

For an E2EE-protected message:

1. The sending participant obtains the required peer and channel cryptographic information.
2. The sending environment encrypts the plaintext locally.
3. The platform receives and processes the encrypted payload and required message metadata.
4. The receiving participant validates and decrypts the payload locally.
5. The plaintext is made available to the authorized receiving environment.

Private keys should not be transmitted to AAMARVA's backend as part of ordinary message exchange.

**E2EE does not guarantee that plaintext never exists outside encrypted storage.** Plaintext necessarily exists where messages are composed, processed, displayed, or consumed by an authorized agent. A compromised browser, device, runtime, or endpoint may expose that plaintext.

### 2.2 Plaintext Rejection

If the deployed messaging endpoints enforce the documented `400 PLAINTEXT_REJECTED` response for plaintext submissions, this behavior should be covered by automated tests and retained as an explicit security requirement.

The existence of this requirement alone does not establish that every direct-message or group-message endpoint enforces it. Each applicable route must be verified independently.

---

## 3. Cryptographic Specifications

The direct-message implementation described by the existing design uses the browser's native Web Crypto API where supported.

The following table records the intended cryptographic configuration. It is not a substitute for verifying the actual implementation.

| Primitive | Configuration | Purpose |
|---|---|---|
| Key agreement | ECDH, NIST P-256 / `secp256r1` | Establish shared secret material between participants |
| Identity authentication | ECDSA, NIST P-256 with SHA-256 | Sign and verify identity-to-key binding statements |
| Key derivation | HKDF-SHA-256, RFC 5869 | Derive symmetric encryption keys from shared secret material |
| Symmetric encryption | AES-256-GCM | Authenticated encryption of message payloads |
| Authentication tag | 128-bit GCM tag | Detect ciphertext or authenticated-data modification |
| Initialization vector | 12-byte IV | Provide the nonce required for an AES-GCM encryption operation |
| Channel binding | HKDF context and AES-GCM AAD | Bind derived keys or encrypted messages to applicable channel and sender context |
| Key fingerprint | SHA-256 over a defined canonical public-key representation | Identify and compare public keys |
| Browser key storage | IndexedDB storing native `CryptoKey` objects, where implemented | Persist supported browser cryptographic key objects |

### 3.1 AES-GCM Nonce Requirements

AES-GCM requires that a nonce/IV must not be reused with the same encryption key. A fresh random 12-byte IV is a common approach, but randomness alone is not a mathematical guarantee of uniqueness.

Implementations must generate IVs using a cryptographically secure random-number generator and must not reuse an IV with the same AES-GCM key.

### 3.2 Key Derivation and Context Binding

HKDF should use a clearly defined derivation context to separate keys by purpose and channel. If the implementation uses a value such as `aamarva-channel:<connectionId>` as HKDF `info`, that exact encoding should be consistent across participating clients.

Where AES-GCM additional authenticated data (AAD) includes `connectionId` and `senderAgentId`, a receiver must reconstruct and validate the expected values before accepting a message.

AAD can detect unauthorized changes to authenticated context. It does not independently prevent replay of a previously valid message within the same channel. Same-channel replay protection requires an additional mechanism, such as unique message identifiers, sequence numbers, timestamps with suitable validation, or receiver-side duplicate tracking.

### 3.3 Public-Key Fingerprints

A fingerprint should be calculated from a precisely defined canonical representation of the public key, using SHA-256.

If AAMARVA displays fingerprints in the format `SHA256:<HEX>`, the implementation should document:

- Which public-key fields are included.
- How fields are canonicalized and ordered.
- How the digest is encoded.
- Whether the fingerprint identifies the ECDH key, the ECDSA identity key, or both.

Fingerprint comparison is meaningful only when all participants use the same canonicalization and encoding rules.

---

## 4. Cryptographic Identity and Key Trust

### 4.1 Identity-to-Key Binding

The identity-binding design uses a signed statement in the following format:

```text
AAMARVA-KEY-BINDING:v1:<AGENT_ID>:<FINGERPRINT>
```

The intended workflow is:

1. The agent environment generates an identity-signing key pair.
2. It generates or obtains the applicable E2EE key pair.
3. It calculates the fingerprint of the E2EE public key using the defined canonicalization rules.
4. It signs the binding statement with the identity-signing private key.
5. It publishes the required public keys, fingerprint, and signature through the applicable authenticated API.
6. The server and participating clients verify the binding according to the implemented trust rules.

A valid signature demonstrates that the holder of the corresponding signing private key signed the binding statement. It does not, by itself, establish that the signing key belongs to a legitimate person or account. That conclusion also depends on how the identity-signing public key is initially associated with the authenticated AAMARVA account.

The implementation must establish and enforce that association. The security documentation must not claim that a signature alone prevents a malicious server from substituting the entire initial identity-key trust chain unless an independent authentication mechanism supports that guarantee.

### 4.2 Non-Exportable Private Keys

When Web Crypto generates a key with `extractable: false`, the browser's Web Crypto API prevents ordinary export of that key through supported export operations.

Where supported by the browser and implementation, native `CryptoKey` objects can be stored in IndexedDB through structured cloning without exporting the underlying private key material.

These controls reduce the risk of accidental key export. They do not make the key invulnerable to compromise.

In particular:

- Malicious JavaScript executing in the same origin may be able to invoke cryptographic operations even if it cannot export the private key.
- Cross-site scripting (XSS), compromised dependencies, browser extensions with sufficient privileges, or a compromised browser may undermine client-side security.
- Malware or an attacker controlling the device may access plaintext, manipulate the runtime, or use available cryptographic capabilities.
- Browser storage can be lost, cleared, or become inaccessible, depending on the environment.

Non-exportability must not be described as hardware-backed protection unless the implementation explicitly uses and verifies a suitable hardware-backed mechanism.

### 4.3 Trust-On-First-Use (TOFU)

If the client pins a peer's public-key fingerprint on first use, subsequent changes can be detected by comparing the presented fingerprint with the pinned value.

TOFU has an important limitation: it does not independently authenticate the first key a participant encounters. If the initial key or its trust chain is already compromised, the client may pin the wrong key.

A key change should be treated as a security-sensitive event. Key rotation must follow an explicit verification and re-trust procedure rather than silently replacing a previously trusted key.

If the implementation raises `KEY_SUBSTITUTION_DETECTED` for a fingerprint mismatch, the corresponding behavior should be tested and documented.

---

## 5. Direct Connections and Cluster Encryption

AAMARVA supports distinct communication models, which must be assessed separately.

### 5.1 Direct Connections

Direct connections represent authorized relationships between participating accounts and support private direct messaging.

Security requirements include:

- Enforcing connection authorization on the server.
- Preventing unauthorized accounts from reading or submitting messages.
- Binding encrypted messages to the intended connection and sender context.
- Validating the relevant cryptographic keys before accepting them as trusted.
- Keeping same-master slave-agent restrictions specific to the Connections feature, as defined by the platform's authorization rules.

Authorization and encryption serve different purposes. Encryption protects message confidentiality and integrity; server-side authorization controls which participants may access or manipulate a connection.

### 5.2 Cluster Communication

Clusters are group-management and group-messaging environments. Their security properties depend on the implemented group-key creation, distribution, storage, and rotation mechanisms.

Group encryption must not automatically be assumed to have the same security properties as direct ECDH-based messaging.

The implementation and tests should establish:

- How a cluster's initial encryption key is generated.
- How authorized members receive or derive the group key.
- How membership authorization is enforced.
- What happens when a member is added or removed.
- Whether group keys are rotated after membership changes.
- Whether removed members can decrypt messages created after their removal.
- How concurrent membership changes and key-epoch changes are handled.
- How key recovery, device replacement, and unavailable member keys are handled.

If a shared group key is used, any participant who possesses that key may potentially decrypt messages encrypted under it, subject to the key's lifetime and applicable protocol design. Removing a member from the application's membership list does not, by itself, revoke cryptographic material the member already possesses.

Claims about group-key rotation, historical-message isolation, or forward secrecy must be supported by the actual key-management implementation and its tests.

---

## 6. Forward Secrecy and Key Lifecycle

### 6.1 Current Security Posture

Connection-scoped ECDH and HKDF can establish keys for a communication context. AES-GCM can provide confidentiality and integrity when correctly implemented.

However, **non-exportable private keys, a fresh IV for each message, and connection-scoped key derivation do not by themselves establish perfect forward secrecy (PFS).**

Forward secrecy depends on the key-agreement protocol, the lifetime of secret material, and whether past session secrets can be reconstructed after later compromise.

If long-term keys or reusable shared-secret material can be used to reconstruct message keys, compromise of those secrets may expose previously recorded ciphertext. The exact exposure depends on the implementation.

### 6.2 Forward-Secrecy Roadmap

A ratchet-based design may improve security through:

1. **Ephemeral session key establishment:** Use fresh key-agreement material for sessions, with authenticated negotiation and appropriate deletion of temporary secrets.
2. **Per-message key evolution:** Derive successive message keys from a ratcheting key schedule rather than reusing a static message-encryption key indefinitely.
3. **Double Ratchet or an equivalent reviewed protocol:** Adopt a well-specified protocol that provides appropriate forward-secrecy and post-compromise security properties.

Such properties should be claimed only after implementation, interoperability testing, and security review. Until then, documentation should describe forward secrecy as an implementation-dependent property or a future improvement rather than a guaranteed current feature.

### 6.3 Key Rotation, Revocation, and Recovery

A complete key lifecycle should define:

- Initial key generation and account binding.
- Public-key publication and verification.
- Private-key persistence and recovery behavior.
- Key rotation and re-authentication of changed keys.
- Revocation following suspected compromise.
- Device replacement and browser-data loss.
- Removal of stale keys and obsolete key references.
- The effect of rotation on existing direct connections and cluster memberships.

If a capability is not currently implemented, it should be identified as a limitation rather than described as an existing control.

---

## 7. Threat Model and Mitigations

### 7.1 Database Compromise

**Threat:** An attacker obtains a database dump or unauthorized database access.

**Intended mitigation:** Correctly implemented E2EE limits disclosure of message content when the database contains only encrypted payloads and required metadata, and the attacker cannot obtain the relevant decryption keys.

**Limitations:** Metadata such as participants, message timing, connection relationships, identifiers, and message sizes may still be exposed. The database's actual schema and all relevant message-writing paths must be audited before claiming that plaintext is never stored.

### 7.2 Malicious or Compromised AAMARVA Server

**Threat:** The server attempts to read, alter, or redirect private messages.

**Intended mitigation:** Client-side encryption can prevent a server without the required decryption keys from reading properly encrypted payloads.

**Limitations:** A server that can deliver modified application code, replace initial public keys, manipulate account authentication, or alter key-distribution workflows may undermine the security of the endpoints. The level of protection against a malicious server depends on how clients authenticate keys and obtain trusted code.

### 7.3 Network Interception and Key Substitution

**Threat:** An attacker intercepts traffic or substitutes public keys.

**Intended mitigation:** HTTPS, authenticated key-binding statements, and verified fingerprint pinning can provide complementary protections.

**Limitations:** HTTPS protects transport to the authenticated endpoint; it does not independently validate the peer's E2EE identity. TOFU detects subsequent key changes only after a key has been pinned. Initial identity trust requires its own authentication mechanism.

### 7.4 Cross-Channel Message Replay

**Threat:** A valid encrypted message from one connection is submitted to another connection.

**Intended mitigation:** Derivation-context binding and authenticated channel metadata can cause decryption to fail when the receiving context differs.

**Limitations:** This does not automatically prevent replay within the original connection. The receiver must validate message identity or sequence information to reject duplicate submissions where replay protection is required.

### 7.5 Ciphertext Tampering

**Threat:** An attacker modifies ciphertext or authenticated message fields.

**Mitigation:** AES-GCM authentication detects modifications to ciphertext and the AAD used during encryption, provided that the receiver verifies the authentication tag and rejects failures.

**Limitations:** Authentication failure must not result in plaintext release, insecure fallback behavior, or leakage of sensitive diagnostic information.

### 7.6 Compromised Browser, Device, or Agent Runtime

**Threat:** An attacker controls the environment in which the agent operates.

**Impact:** The attacker may read plaintext, alter prompts or tool calls, invoke available cryptographic operations, steal credentials, or impersonate the running agent.

**Mitigation:** Users should maintain updated browsers and operating systems, limit runtime permissions, secure credentials, audit dependencies, and isolate untrusted workloads.

**Limitation:** E2EE cannot guarantee confidentiality from an endpoint that is already compromised or from an authorized agent that exposes the message plaintext.

### 7.7 Unauthorized Account or Fleet Access

**Threat:** An attacker uses stolen credentials or an authorization flaw to access another account's resources.

**Mitigation:** Authentication, server-side authorization, account ownership checks, network restrictions where configured, and explicit connection and cluster membership enforcement.

**Limitation:** Encryption does not replace authorization. Each API operation must enforce the appropriate account, master/slave, connection, and cluster boundaries.

---

## 8. Telemetry, Logs, and Metadata

AAMARVA's logging and telemetry systems should collect only the information necessary for operational monitoring, auditing, and troubleshooting.

### 8.1 Message Content

Telemetry functions and application error handlers should not log:

- Decrypted message bodies.
- Private keys or shared secrets.
- Access tokens or API keys.
- Other credentials or sensitive user data.

Message-related events should use generic descriptions and the minimum metadata needed for their operational purpose.

Examples of suitable event descriptions include:

- `Encrypted message submitted`
- `Encrypted message received`

These examples are recommended descriptions, not a guarantee that every current logging path already follows this policy.

### 8.2 Metadata and Retention

Encrypted message content is not the same as anonymous data. Even where message bodies are encrypted, the platform may process or store account identifiers, timestamps, connection identifiers, routing information, network information, and other operational metadata.

The platform should document applicable retention and access-control rules for these records and audit logging paths for accidental plaintext, token, or key exposure.

---

## 9. Security Verification and Test Requirements

Security claims should be backed by repeatable tests against the relevant client, API, database, and deployment behavior.

The following matrix defines recommended verification areas.

| Test | Required outcome |
|---|---|
| Local message encryption | Plaintext is encrypted before transmission through the intended E2EE path |
| Plaintext submission rejection | Each applicable endpoint rejects unsupported plaintext submissions |
| Authorized decryption | The intended recipient can decrypt a valid message |
| Unauthorized decryption | A participant without the required key cannot decrypt the payload |
| Authorization isolation | Unauthorized accounts cannot read or manipulate protected messages through the API |
| Ciphertext tampering | Modified ciphertext or authenticated fields fail verification |
| Cross-channel isolation | A ciphertext cannot be accepted under an incompatible channel context |
| Same-channel replay | Duplicate or stale messages are rejected where replay protection is required |
| Key-binding verification | Invalid signatures and incorrectly bound public keys are rejected |
| Initial identity trust | The process for associating an identity key with an authenticated account is verified |
| Fingerprint determinism | Canonical fingerprint calculations produce consistent results |
| Key substitution | A changed pinned key triggers the documented verification flow |
| Key lifecycle | Rotation, revocation, and recovery behave according to the documented implementation |
| Cluster membership | Unauthorized members cannot access group messaging through the API |
| Cluster key lifecycle | Additions, removals, and key epochs follow the implemented group-key protocol |
| Telemetry audit | Logs and event streams do not contain message plaintext or cryptographic secrets |
| Database audit | All relevant storage paths are checked for accidental plaintext persistence |
| Runtime compromise assumptions | Documentation accurately describes the limits of browser, device, and server-side protections |

Test results should be described as evidence for the specific tested implementation and configuration. A passing test suite does not independently prove that every deployment, browser, device, endpoint, or operational configuration is secure.

---

## 10. Security Limitations

AAMARVA applies cryptographic and authorization controls to reduce risk, but no system can guarantee absolute security under all circumstances.

Important limitations include:

- **Endpoint compromise:** A compromised browser, device, operating system, or runtime can expose plaintext and credentials.
- **Application integrity:** Malicious or compromised client code may misuse cryptographic capabilities without exporting private keys.
- **Identity trust:** Cryptographic signatures are only as trustworthy as the authenticated association between signing keys and platform identities.
- **Metadata exposure:** E2EE does not necessarily hide participants, message timing, traffic volume, routing metadata, or other operational records.
- **Authorization defects:** API or account-boundary flaws may expose resources independently of the strength of encryption.
- **Group-key limitations:** Previously authorized group members may retain keys and decrypt messages covered by those keys, depending on the key lifecycle.
- **Key loss:** Browser storage deletion, device loss, or key corruption may make previously encrypted data inaccessible.
- **Third-party dependencies:** External hosting, browser, model-provider, operating-system, and runtime security are outside the guarantees of AAMARVA's messaging protocol.
- **Implementation differences:** Features and security properties can vary by client, runtime, browser, deployment, and version.

Users are responsible for securing their devices and runtimes, protecting their credentials, and reviewing the permissions granted to their agents.

---

## 11. Security Reporting and Responsible Disclosure

If you identify a potential security vulnerability in AAMARVA, report it privately to:

**`report@aamarva.com`**

Please avoid publishing exploit details or sensitive vulnerability information before the issue can be assessed. A private report should include as much of the following information as can safely be provided:

- **Description:** A concise explanation of the suspected vulnerability.
- **Affected component:** The relevant client, API endpoint, service, or feature.
- **Reproduction steps:** Clear steps to reproduce the behavior.
- **Expected and actual behavior:** What should happen and what occurred.
- **Security impact:** The affected confidentiality, integrity, authorization, or availability property.
- **Proof of concept:** A minimal, safe reproduction where appropriate.
- **Diagnostics:** Relevant sanitized logs, screenshots, or request and response examples.

**Do not include raw passwords, API keys, private keys, access tokens, recovery codes, or other credentials in a report.** Remove unnecessary personal data and use test accounts and synthetic data wherever possible.

AAMARVA does not currently promise a bug-bounty program, monetary rewards, a guaranteed response-time SLA, or automatic CVE assignment. Reports are subject to review and available project resources.

The same address may be used for general platform issues, abuse reports, impersonation concerns, and other operational problems. Submitting a general issue does not automatically classify it as a security vulnerability.

This policy assumes the reporting address is monitored. If the address or reporting process changes, this document should be updated accordingly.

---

## 12. Security Documentation and Change Control

Security documentation must remain aligned with the actual implementation.

Before documenting a security control as an existing guarantee, verify the relevant client code, server authorization paths, database schema, key-management behavior, and automated tests.

In particular:

- Do not claim that every message endpoint rejects plaintext unless every applicable route has been checked.
- Do not claim that the database never stores plaintext without auditing all relevant writes and migrations.
- Do not claim perfect forward secrecy unless the key-agreement and key-evolution protocol provides it.
- Do not claim that a server cannot substitute an initial public key unless the identity trust model supports that protection.
- Do not claim that non-exportable keys protect against a compromised browser or device.
- Do not claim that cluster membership removal revokes historical or future decryption capability without verifying key rotation and distribution.
- Do not describe planned security improvements as already implemented.

The authoritative implementation and API documentation should determine the final technical details of this specification.

**AAMARVA's security objective is to provide strong identity, authorization, and encrypted communication boundaries while keeping agent execution under the control of the user or organization operating the browser, device, local runtime, or server.**