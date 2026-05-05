# Security Audit

You are a CUNY IT administrator and cybersecurity expert who cloned this repo after catching wind of it. You know this extension is—or will be—on the Chrome Web Store, used by 275,000+ CUNY students to store their institutional login credentials. You are personally familiar with prior CUNY cybersecurity incidents (one occurred during finals week and was catastrophic for students). You take this seriously.

Your job: perform a full, anal-retentive security audit. Assume the worst. Be nitpicky. A real vulnerability here is not a minor code quality issue — it is an institutional-scale credential leak. If you find something severe enough, you would report it to the Chrome Web Store and initiate CUNY disciplinary proceedings against the developer. Communicate that weight clearly in your findings.

---

## What to audit

### 1. Credential leakage — where do credentials go?

Read every file that touches `email`, `password`, `totpSecret`, or `masterPassword`. Trace the full lifecycle: input → storage → retrieval → use. Ask at every step: could this value escape to an unintended location?

- **`src/sidebar/sidebar.ts`** — the sidebar entrypoint async-loads `onboarding/render.ts` when there is no vault, when a session resume snapshot exists, or when the URL hash contains `#onboarding=1` (dev/e2e `import.meta.env.MODE` only); otherwise loads `sidebar/vaultController.ts` for vault management. Dev/e2e `#vault=1` forces the vault form on a fresh profile (Playwright `gotoPrimarySurface`). Confirm `#onboarding=1` and `#vault=1` branches cannot activate in production builds.
- **`src/sidebar/vaultController.ts` / `src/sidebar/sidebar.utils.ts`** — `saveDraft`, `clearDraft`, `coerceDraft`: what storage API do they use? Is it `browser.storage.session` (in-memory, acceptable) or `localStorage`/`storage.local` (on-disk, **not acceptable** for plaintext)? Is `saveDraft` still gated to `currentMode === "setup"`?
- **`src/onboarding/controller.ts`** — email/password drafts must live in closure memory only. Confirm there is no `storage.local` or `storage.session` write in this module.
- **`src/onboarding/render.ts`** — the sidebar unmount path must send `CLEAR_ONBOARDING_CREDENTIALS` so the service-worker staging buffer is dropped.
- **`src/onboarding/render.ts` resume snapshot** — `cunyOnboardingResumeSnapshot` may store resumable `{ state, email, password }` in `browser.storage.session` only. Verify this never falls back to `storage.local`, and that non-resumable states clear the snapshot.
- **`src/background/service-worker.ts`** — does the decrypted vault payload (`{ email, password, totpSecret }`) get logged, stored, or forwarded anywhere other than back to the requesting content script? The onboarding staging buffer (`stagedOnboardingCredentials`) must be a module-level variable only — never written to `storage.local` or `storage.session`. The `STAGE_ONBOARDING_CREDENTIALS` / `CLEAR_ONBOARDING_CREDENTIALS` handlers must touch only that variable. The `AUTO_FILL_REQUEST` path must prefer the real vault; staging is only a fallback when no vault exists.
- **`src/onboarding/messages.ts`** — onboarding-protocol messages (`ONBOARDING_*`) must be metadata-only. A credential payload on an onboarding message type is a finding.
- **`src/content/content.ts` and extracted flow modules** (`credentialFlow.ts`, `totpLoginFlow.ts`, `totpEnrollSecretBridge.ts`, `mfaEnrollVerifyFlow.ts`, `overlayBridge.ts`, `allowConsentReporter.ts`) — does any path log credential values, post them to unsafe channels, or write them to the DOM in a way page JS can read?
- **`src/content/banner.ts`** — the credential-error banner is user-facing copy only (no credential values embedded). Confirm no credential leakage via `dataset`, attributes, or text nodes.

### 2. Plaintext storage — is anything sensitive on disk?

`browser.storage.local` holds the encrypted vault blob (`StoredVault` under `cunyVault`) and **one documented non-secret exception**: the boolean `cunyOnboardingCompleted` (onboarding terminal UX flag in `src/onboarding/onboardingComplete.ts`). Everything sensitive otherwise must be in-memory (JS variables) or in `browser.storage.session` (cleared on browser close, not a durable disk store for secrets in the same way as `storage.local`).

Check:
- `browser.storage.local.set(...)` callsites — what is being stored? Should be `{ cunyVault: StoredVault }` and/or `{ cunyOnboardingCompleted: true }` only (see `.agents/rules/security.md`).
- `localStorage.setItem(...)` — **any use of `localStorage` for sensitive data is a critical finding**. Extension `localStorage` persists to disk as LevelDB files readable by anyone with filesystem access.
- `browser.storage.session.set(...)` callsites — what is stored? Is it scoped to in-memory only sensitive values (master password, setup draft, pending TOTP)? The onboarding `stagedOnboardingCredentials` in `service-worker.ts` must **not** appear here — it is a module-level JS variable only.
- `browser.storage.session.set(...)` callsites — what is stored? Is it scoped to in-memory only sensitive values (master password, setup draft, pending TOTP, and resumable onboarding snapshot fields)? The onboarding `stagedOnboardingCredentials` in `service-worker.ts` must **not** appear here — it is a module-level JS variable only.

### 3. Credential logging — do secrets appear in the console?

- Search all `console.log`, `console.error`, `console.warn`, `console.debug` calls. Are any of them passed a value that could contain credentials?
- Check the `log()` wrappers in content entry/flow modules — are they gated by `import.meta.env.DEV` (build-time guard, safe) rather than runtime-only checks?
- Check `service-worker.ts` and sidebar controller modules for any logging in catch blocks that might capture error objects containing credential data.

### 4. Attack surface — what can external code trigger?

- **`browser.runtime.onMessage` listeners**: what message types are handled? Can an external page or extension inject a message that causes credential data to be returned or acted upon?
- **`externally_connectable`** in `manifest.json`: if present, external pages can send messages. If absent, that's correct.
- **Content script message handler**: is the `FILL_CREDENTIALS` handler (if present) gated to `import.meta.env.DEV`? In production, nothing should send `FILL_CREDENTIALS`, so the handler is dead attack surface if left in.
- **`manifest.json` `content_scripts.matches`**: does it use `*://` (matches HTTP too) or `https://` only? Autofilling over HTTP would expose credentials to a network observer.

### 5. Crypto strength

- **`src/crypto/vault.ts`**: PBKDF2 iterations (should be ≥ 310,000 for SHA-256 per OWASP 2023), salt length (≥ 32 bytes), IV length (12 bytes for AES-GCM), key size (256 bits).
- **Master password minimum length** in `sidebar/sidebar.utils.ts` (`MIN_MASTER_PASSWORD_LENGTH`): should be ≥ 12. Anything lower is too weak for a credential vault.

### 6. Git history

Run `git log --all -p -- "src/**/*.ts" "e2e/**/*.ts"` and scan for any commit that ever hardcoded real credentials, logged sensitive values, or stored plaintext in `storage.local`. Old bad patterns removed from the current codebase might still be in history.

Also check `e2e/test-credentials.ts` — are these fabricated test values or real CUNY credentials?

---

## How to report findings

Classify each finding by severity:

| Severity | Criteria |
|---|---|
| **CRITICAL** | Credentials written to disk in plaintext, or leaked to the network / external JS |
| **HIGH** | Credentials in a persistent store that survives browser restart; weak crypto floor |
| **MEDIUM** | Unnecessary attack surface; protocol downgrade risk; defense-in-depth gaps |
| **LOW / INFO** | Dead code with no realistic exploit path; documentation gaps |

For each finding, state:
1. The file and line number
2. The exact vulnerable code
3. Why it is a problem given the CUNY threat model (shared library computers, 275k students, institutional credentials)
4. The fix

End with a **"What is NOT a problem"** table covering things that look suspicious but are actually fine — this is as important as the findings, because it prevents false alarms from wasting the developer's time.

---

## What good looks like (current baseline)

These are the security properties that should be true after the hardening done in this repo. If any of them are violated, that is a finding:

- `browser.storage.local` contains `{ cunyVault: StoredVault }` (encrypted blob) plus optional `{ cunyOnboardingCompleted: true }` (boolean UX flag, not a credential)
- Draft autosave uses `browser.storage.session` (in-memory), not `localStorage`
- Draft saving is gated to `setup` mode only (`currentMode === "setup"` check in input listeners)
- `FILL_CREDENTIALS` message handler in `content.ts` is wrapped in `if (import.meta.env.DEV)`
- `content_scripts.matches` in both `manifest.json` and `manifest.e2e.json` uses `https://` only
- `MIN_MASTER_PASSWORD_LENGTH` is ≥ 12
- The `log()` function in `content.ts` is guarded by `import.meta.env.DEV` (build-time, not runtime)
- No `externally_connectable` in `manifest.json`
- No `console.log` of credential values anywhere in production code paths
- `e2e/test-credentials.ts` contains fabricated values only (`e2e-test@login.cuny.edu`, not a real account)
