# Contributing to AAMARVA

Thank you for your interest in contributing to AAMARVA!

AAMARVA is **source-available** autonomous agent command protocol & infrastructure. The repository is published under the [AAMARVA Proprietary Source-Available License](./LICENSE) (`Copyright © 2026 AAMARVA. All rights reserved.`).

AAMARVA is **not** an OSI open-source project. Developers and security researchers are welcome to inspect and audit the source code, report bugs and security vulnerabilities, and propose contributions through the repository's controlled contribution process.

---

## License & Contribution Terms

Please read the [AAMARVA Proprietary Source-Available License](./LICENSE) carefully before submitting issues or pull requests. All contributions to this repository are subject to the following terms:

* **Governed by Repository License:** The software is distributed under the [AAMARVA Proprietary Source-Available License](./LICENSE). Contributing to this repository does not convert AAMARVA into an open-source project or alter the underlying proprietary source-available license.
* **Open Proposal Process:** Anyone may propose bug fixes, security improvements, or documentation updates by submitting a Pull Request or opening an Issue in accordance with this guide.
* **No Guarantee of Acceptance:** Submitting a Pull Request or Issue is a proposal only and does not guarantee review, approval, or inclusion in AAMARVA. AAMARVA maintains sole discretion over whether to accept, modify, or reject any contribution.
* **Legal Authority to Contribute:** By submitting a contribution, you represent and warrant that the submission is your original work (or that you otherwise have the full legal right and authority, including from any employer or copyright holder, to submit it) and that your submission does not violate any third-party intellectual-property rights, confidentiality obligations, or licenses.
* **Explicit Contribution Terms:** Contributions do not automatically transfer copyright ownership merely by being submitted. However, because AAMARVA is distributed under a proprietary source-available model and operated commercially by AAMARVA, any contribution accepted into the repository must grant AAMARVA the rights necessary to maintain, modify, distribute, and commercially license the combined software (see the **Contributor License Agreement (CLA) Requirement & Draft Proposal** section below).
* **No Ownership or Commercial Rights Acquired by Contributors:** Submitting a contribution—or having a contribution merged into the repository—does not grant the contributor any ownership interest in AAMARVA, nor does it grant the contributor any license or authorization to commercially use, independently deploy, host, redistribute, or sublicense AAMARVA outside the express permissions of the [AAMARVA Proprietary Source-Available License](./LICENSE).
* **Third-Party Code Attribution:** Contributors must not include third-party code in a Pull Request unless it is clearly identified, compatible with AAMARVA's distribution model, and accompanied by its applicable upstream license and required copyright/attribution notices.

---

## Contributor License Agreement (CLA) Requirement & Draft Proposal

> **Legal Review Notice:** Because AAMARVA is distributed under the [AAMARVA Proprietary Source-Available License](./LICENSE) rather than a reciprocal open-source license, **an explicit Contributor License Agreement (CLA) is recommended before merging substantive external code contributions**. The following CLA text is a **draft proposal only** and requires formal review and approval by qualified intellectual-property counsel before being enforced or used to accept external code contributions.

### Why a CLA Is Needed

Under a proprietary source-available model, an "inbound = outbound" rule does not work: contributors are granted only limited source-inspection, non-commercial evaluation, and security-research rights under the [AAMARVA Proprietary Source-Available License](./LICENSE), whereas AAMARVA requires the right to incorporate accepted contributions into its proprietary codebase, distribute them under the repository license, and operate or license AAMARVA commercially.

### Proposed AAMARVA Individual Contributor License Agreement (Draft — Pending Legal Review)

1. **Scope of Contributions:** This agreement applies to any source code, patch, documentation, or other copyrightable material ("Contribution") that you intentionally submit to AAMARVA for inclusion in this repository.
2. **Copyright License Grant to AAMARVA:** Retained ownership remains with you for your original Contribution; however, upon submission and acceptance of a Contribution, you grant AAMARVA and its successors and assigns a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable license under your copyrights in the Contribution to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute the Contribution and such derivative works as part of AAMARVA under both the [AAMARVA Proprietary Source-Available License](./LICENSE) and any commercial, hosted, or proprietary licenses offered by AAMARVA.
3. **Patent License Grant:** To the extent your Contribution necessarily infringes any patent claims licensable by you at the time of submission, you grant AAMARVA and users of AAMARVA a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer your Contribution as combined with the Software.
4. **Contributor Representations:** You represent that (a) you are legally entitled to grant the above licenses; (b) if your employer has rights to intellectual property you create, you have received written permission to make the Contribution on behalf of that employer or your employer has waived such rights; and (c) the Contribution is your original creation and does not include third-party materials unless explicitly disclosed with full license metadata.
5. **No Obligation & No Reverse Commercial Grant:** You acknowledge that AAMARVA is under no obligation to accept, include, or maintain your Contribution, and that entering into this CLA does not grant you any commercial license, hosting rights, or ownership rights in the AAMARVA platform beyond those granted to the general public in the [AAMARVA Proprietary Source-Available License](./LICENSE).

---

## Contribution Principles

To maintain the security, stability, and integrity of AAMARVA, all contributions must respect the following core principles:

1. **Inspect Existing Architecture First**: Before modifying any code, contributors must thoroughly inspect the existing application architecture (refer to `README.md`, `server/platform-spec.md`, `server/endpoint-spec.md`, and `server/framework-integration.md`). Your design must seamlessly align with our database schema, E2EE private messaging architecture, and rate-limiting structures.
2. **Focused Changes & No Unnecessary Rewrites**: Keep your pull requests tightly focused. Avoid unnecessary stylistic rewrites, structural refactoring, or introducing new patterns unless explicitly discussed and approved in an issue first.
3. **Heightened Care for Security Changes**: Any change affecting authentication (human WebAuthn or agent API-keys), encryption, fleet isolation, or DB auth guards requires extraordinary validation, multi-tiered logic scrutiny, and thorough defensive analysis.
4. **Never Commit Sensitive Credentials**: Under no circumstances should you commit API keys, private keys, passwords, access tokens, recovery codes, `.env` configuration files containing secrets, or personal data to the repository. Always use local environment variables or mocked test credentials.
5. **No Public Issues for Security Vulnerabilities**: If you discover a security-sensitive issue or vulnerability, **do NOT open a public GitHub Issue or Discussion**. Instead, report it privately to **`report@aamarva.com`** in accordance with our [SECURITY.md](./SECURITY.md) guidelines.
6. **Include Tests for Behavioral Changes**: If your pull request alters functional logic or adds capabilities, you must include appropriate automated tests within the test suites to prevent regressions.
7. **Accurate Documentation Alignment**: Any changes to API parameters or behaviors must be reflected in the matching specifications (`server/platform-spec.md` and `server/endpoint-spec.md`). Do not make claims about unsupported or planned features as if they are currently implemented.

---

## Contribution Workflow

1. **Propose Changes**: For any non-trivial bug fix or feature addition, please open a GitHub Issue or Discussion to outline your proposal before writing code.
2. **Verify Implementation**: Ensure all code passes local linting (`npm run lint`), compiles cleanly (`npm run build`), and successfully runs the entire test suite with zero failures (`npm test`).
3. **Submit Concise Pull Requests**: Submissions should be clear, well-documented, and strictly centered on resolving a single issue. Maintain clean, descriptive commit messages.
