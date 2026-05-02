<!-- Load when: touching vault, credentials, storage, crypto, SSO session cookies (`browser.cookies`), or any sensitive data path -->

> **Security stakes**: This extension stores institutional login credentials for 275,000+ CUNY students. It is subject to CUNY IT security review and Chrome Web Store scrutiny. A credential exposure is institutional-scale — extensions get removed and developers face discipline. **Never suggest `localStorage`, unencrypted `storage.local`, or any on-disk store for sensitive plaintext data.** The only permitted locations are `browser.storage.session` (in-memory, cleared on browser close) and encrypted `browser.storage.local` (vault ciphertext only).

# Security, crypto, and gotchas

The master password is **never written to `storage.local` or disk**. It lives only in `browser.storage.session` (`SESSION_MASTER_KEY = "cunySessionMaster"`) and in JS module memory while the side panel is open.

## Key constraints

- **Master password never in `storage.local`** — `decryptVault` / `encryptVault` accept it as a parameter. Never write it to `storage.local` or logs.
- **`browser` import** — always `import browser from "webextension-polyfill"`, never `chrome.*`.
- **Minimum browser versions** — `storage.session` requires Firefox 115+ and Chrome 114+. Do not lower these without adding a fallback.
- **Setup draft in `browser.storage.session`** — While in `setup` mode **only**, email/password/TOTP secret drafts are mirrored to `storage.session` (key: `cuny_form_draft`). `localStorage` is **explicitly forbidden** — prior security audit finding (plaintext credentials on disk). Draft is cleared on successful vault save or reset.
- **Onboarding credential staging (pre-vault)** — During onboarding, the sidebar sends `STAGE_ONBOARDING_CREDENTIALS { email, password }` to the service worker. The SW holds this in a **module-level variable only** — never `storage.local` or `storage.session`. `CLEAR_ONBOARDING_CREDENTIALS` fires on sidebar unmount. Onboarding protocol messages carry metadata only; credential payloads route only through STAGE/CLEAR messages.
- **`PENDING_TOTP_SECRET_SESSION_KEY`** — The Base32 TOTP secret scraped from the Oracle enroll page stages in `storage.session` only (`cunyPendingTotpSecretFromSso`). Never write it to `storage.local`, logs, or any persistent store.
- **`novalidate` on the side panel form** — Keep JS validation; avoids browser-specific native validation inconsistencies in extension surfaces.
- **Content script must be a single IIFE** — MV3 does not support ES module content scripts reliably. Use `vite.content.config.ts`. Dependencies bundle into `content.js`, not shared chunks.
- **`crossorigin` on built assets** — Vite injects `crossorigin` on `<script>` and `<link>` tags. These can cause silent failures under `moz-extension://`. Avoid adding new module preload links or external scripts.

## Crypto details (`src/crypto/vault.ts`)

| Parameter | Value |
|---|---|
| KDF | PBKDF2-SHA-256 |
| Iterations | 310 000 |
| Salt | 32 bytes (random per save) |
| IV | 12 bytes (random per save) |
| Cipher | AES-GCM-256 |
| Storage format | `{ version: 1, saltB64, ivB64, ciphertextB64 }` |

## Browser SSO session cookies (PeopleSoft / D2L / OAM shells)

Rare code paths may need to **simulate a logout** locally (for example onboarding “try again” UX) so the next navigation hits SSO like a cold browser would. **`browser.cookies`** is the API surface involved. Misuse is a credential **and session** incident.

Treat this as policy for **implementers and reviewers** — including AI agents tooling on this repo:

1. **Delete only.** The **only** permitted programmatic action on SSO-related cookies is **`browser.cookies.remove`**. Do **not** call **`cookies.set`** (or equivalents), do **not** inject `Set-Cookie` via redirects, proxies, DevTools payloads, MCP tools, scripts, tests, or one-off tooling that **writes** jar state for users’ real browsers.
2. **Minimum footprint.** Delete the **fewest cookies** documented to invalidate the targeted layer — see [.map/cookies/session-and-logout.md](../../.map/cookies/session-and-logout.md). Do **not** carpet-bomb `cookies.getAll({ domain })` deletes “to be safe” unless a human explicitly widened scope after verifying behavior; oversized deletion is breakage and phishing-adjacent if misdirected.
3. **Never store cookie material.** Cookie **names** okay in source as string literals matching the live map **names only**. Cookie **values** must **never** land in **`storage.local`**, **`storage.session`**, SQLite, telemetry, Markdown runbooks pasted from DevTools captures, **`console`** output in production builds, screenshots, MCP transcripts, clipboard helpers, fixtures, mock servers, git history, PR bodies, comments, tests that snapshot real dumps, etc. Rotate any secret that was pasted by mistake — values are bearer tokens.
4. **Never transit cookie payloads.** Do **not** attach `Cookie` headers manually to `fetch` / WebSocket / `XMLHttpRequest` / third-party endpoints. Do **not** forward DevTools **`Set-Cookie`** lines to chats, bots, observability backends, CI logs, or off-repo HTTP. **Reads** (`cookies.get*` / MCP network captures) exist only where automation **must** understand shape — still **never** emit values off-machine.
5. **Manifest parity.** Clearing host-only or SP-scoped jars requires **`"cookies"`** permission and matching **`host_permissions`**. Lack of permission is **not** an excuse to work around with content-script `document.cookie` writes or remote cookie injection — downgrade to **documentation / user instruction** instead.

Violation of §1–4 is severity **critical** regardless of alleged convenience.
