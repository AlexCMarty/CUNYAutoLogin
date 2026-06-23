# Security Policy

CUNYAutoLogin stores a CUNY email, password, and authenticator secret — encrypted on your own device. We take the handling of those secrets seriously and welcome responsible disclosure of security issues.

## Reporting a vulnerability

**Please report security issues privately. Do not open a public issue, pull request, or discussion for anything security-sensitive.**

Use GitHub's private vulnerability reporting:

➡️ **[Report a vulnerability](https://github.com/AlexCMarty/CUNYAutoLogin/security/advisories/new)** — or open the repository's **Security** tab and click **Report a vulnerability**.

This creates a private advisory visible only to you and the maintainer.

What helps us triage quickly:

- The extension version, plus your browser and its version.
- A clear description of the issue and its security impact.
- Steps to reproduce, or a proof of concept.
- Relevant logs or screenshots — **with real secrets redacted**.

> [!IMPORTANT]
> **Never include real credentials or secrets in a report.** Do not paste your
> CUNY password, your authenticator (TOTP) secret, your vault master password,
> or screenshots containing them. Reproduce with dummy values — a clear
> description of the flaw is what we need.

## What to expect

This is a small, volunteer-maintained project, so responses are best-effort:

- **Acknowledgement** — typically within 7 days.
- **Updates** — we'll keep you informed as we investigate and prepare a fix.
- **Disclosure** — please give us a reasonable chance to ship a fix before disclosing publicly. We'll credit you in the advisory and release notes unless you'd prefer to stay anonymous.

There is no paid bug-bounty program.

## Scope

**In scope** — the extension in this repository:

- The encrypted vault: key derivation, storage, and unlock, and how secrets are held in memory.
- Biometric / WebAuthn unlock.
- The auto-fill content script and the sidebar ↔ service-worker ↔ content-script message protocol.
- Anything that could expose a user's stored email, password, or authenticator secret.

**Out of scope:**

- **CUNY's own systems** (`ssologin.cuny.edu`, CUNYfirst, Brightspace, DegreeWorks, etc.). **Do not test against, probe, or attack CUNY infrastructure** — report issues with CUNY's services directly to CUNY. This project is independent and **not affiliated with or endorsed by CUNY**.
- The marketing site (`cunyautologin.alexmarty.dev`) content and the third-party store listings.
- Vulnerabilities in dependencies that are not reachable through this extension (please report those upstream).

Testing the extension on **your own machine and your own accounts**, in line with this policy, is authorized and appreciated. That authorization does not — and cannot — extend to CUNY's systems, which are not ours to authorize.

For how the extension protects your data *by design* — encryption parameters, storage model, and threat model — see the [security overview](https://cunyautologin.alexmarty.dev/security/).

## Supported versions

Both stores auto-update, so virtually all users run the latest release, and only that release receives security fixes.

| Version                          | Supported |
| -------------------------------- | :-------: |
| Latest published store release   |     ✅    |
| Any older version                |     ❌    |

Install links and the current version are in the [README](README.md).
