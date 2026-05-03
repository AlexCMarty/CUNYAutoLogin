<!-- Load when: touching vault, credentials, storage, crypto, SSO session termination, or any sensitive data path -->

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

## SSO session termination (OAM / `ssologin.cuny.edu`)

Some flows (for example onboarding “try again”) must end the IdP session so the next navigation behaves like a cold login. **Mis-handling sessions is a credential and session incident.**

### What the code does today

`src/background/service-worker.ts` terminates the Oracle OAA server-side session by:

1. Navigating open `https://ssologin.cuny.edu/*` tabs to **`OAA_RUI_LOGOUT_URL`** (`src/cuny/ssoSite.ts`), and  
2. A best-effort **`fetch(OAA_RUI_LOGOUT_URL, { credentials: "include" })`** so logout still runs when no SSO tab is open.

That matches the live-site procedure documented in [.map/cookies/session-and-logout.md](../../.map/cookies/session-and-logout.md). It uses the browser’s normal jar for **same-origin** logout — it is **not** “scrape cookies” or “attach `Cookie` to a random API”.

### Rules for **implementers and reviewers** (including agents)

1. **Same-origin session flows only** — Use `credentials: "include"` only for requests that are explicitly part of the supported CUNY logout or session contract (e.g. the documented OAA logout URL). Do **not** attach manual `Cookie` headers to arbitrary `fetch` / XHR / WebSocket / third-party endpoints.
2. **Never store or exfiltrate cookie material** — Cookie **names** in source are fine as string literals aligned with the live map. Cookie **values** must **never** land in `storage.local`, `storage.session`, telemetry, production `console`, screenshots, MCP transcripts, fixtures from real captures, git history, PR bodies, etc. Rotate anything pasted by mistake.
3. **Do not forward raw cookie lines** — Do not paste DevTools **`Set-Cookie`** / network cookie payloads into chats, bots, CI logs, or off-repo HTTP. **Reads** (`cookies.get*` / captures) for automation must **never** emit values off-machine.
4. **`browser.cookies` is not used today.** If you add it later: **`cookies.remove` only** on the **smallest** documented set; never **`cookies.set`** or jar carpet-bombing without explicit human verification. Add **`"cookies"`** permission and matching **`host_permissions`** — lack of permission is **not** an excuse for content-script `document.cookie` writes or remote cookie injection; use **documentation / user steps** instead.

Violations of §1–3 or careless use of §4 are **critical** severity regardless of convenience.
