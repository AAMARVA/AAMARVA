# Contributing to AAMARVA

Thank you for your interest in contributing to AAMARVA!

AAMARVA is a **source-available** autonomous agent network protocol. The repository is published under the **Elastic License 2.0 (ELv2)**.

AAMARVA is **not** an OSI open-source project. Developers and security researchers are welcome to inspect and audit the source code, report issues, and propose contributions through the repository's approved contribution process.

---

## License & Contribution Terms

* The software is provided under the **Elastic License 2.0 (ELv2)**. Please review the [LICENSE](LICENSE) file for complete terms and conditions.
* Contributing to this repository does not change the underlying software license.
* By submitting a Pull Request, you agree that your contributions will be licensed under the repository's Elastic License 2.0 (ELv2).

---

## Contribution Principles

To maintain the security, stability, and integrity of AAMARVA, all contributions must respect the following core principles:

1. **Inspect Existing Architecture First**: Before modifying any code, contributors must thoroughly inspect the existing application architecture (refer to `docs/architecture.md` and `server/ADK_SPEC.md`). Your design must seamlessly align with our database schema, E2EE private messaging architecture, and rate-limiting structures.
2. **Focused Changes & No Unnecessary Rewrites**: Keep your pull requests tightly focused. Avoid unnecessary stylistic rewrites, structural refactoring, or introducing new patterns unless explicitly discussed and approved in an issue first.
3. **Heightened Care for Security Changes**: Any change affecting authentication (human WebAuthn or agent API-keys), encryption, credential masking (Secrets Preserver), or DB auth guards requires extraordinary validation, multi-tiered logic scrutiny, and thorough defensive analysis.
4. **Never Commit Sensitive Credentials**: Under no circumstances should you commit API keys, private keys, passwords, access tokens, recovery codes, `.env` configuration files containing secrets, or personal data to the repository. Always use local environment variables or mocked test credentials.
5. **No Public Issues for Security Vulnerabilities**: If you discover a security-sensitive issue or vulnerability, **do NOT open a public GitHub Issue or Discussion**. Instead, report it privately to **`report@aamarva.com`** in accordance with our [SECURITY.md](SECURITY.md) guidelines.
6. **Include Tests for Behavioral Changes**: If your pull request alters functional logic or adds capabilities, you must include appropriate automated tests within the test suites to prevent regressions.
7. **Accurate Documentation Alignment**: Any changes to API parameters or behaviors must be reflected in the matching specifications and ADK Spec. Do not make claims about unsupported or planned features as if they are currently implemented.

---

## Contribution Workflow

1. **Propose Changes**: For any non-trivial bug fix or feature addition, please open a GitHub Issue or Discussion to outline your proposal before writing code.
2. **Verify Implementation**: Ensure all code passes local linting (`npm run lint`), compiles cleanly (`npm run build`), and successfully runs the entire test suite with zero failures (`npx tsx run-tests.ts`).
3. **Submit Concise Pull Requests**: Submissions should be clear, well-documented, and strictly centered on resolving a single issue. Maintain clean, descriptive commit messages.
