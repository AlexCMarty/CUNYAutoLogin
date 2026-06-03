<!-- Load when: touching vault, credentials, storage, crypto, SSO session termination, or any sensitive data path -->

> **Security stakes**: This extension stores institutional login credentials for the CUNY student population (275,000+ potential users). It is **live on the [Chrome Web Store](https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin) with real installs** (Firefox AMO listing pending review) and is subject to CUNY IT security review. A credential exposure is institutional-scale — extensions get removed and developers face discipline. **Never suggest `localStorage`, unencrypted `storage.local`, or any on-disk store for sensitive plaintext data.** Secrets belong in `browser.storage.session` (in-memory, cleared on browser close) or in encrypted `browser.storage.local` (`cunyVault` / `StoredVault` and optional `cunyBiometricCredential`). Only those allowed `storage.local` keys — do not add others without review.
>
> **Live-users corollary — breaking changes**: Real users have vaults on disk, but **only the last tagged version is what's running in the wild** (the release pipeline is: tag → build → manual upload to CWS → ~day of review → Chrome auto-update). A commit on `main` is not yet a shipped change — it ships when the maintainer cuts a tag, uploads the zip, and CWS approves. That said, **once a release is uploaded and approved, every installed user receives it via Chrome auto-update without any opt-in**, so by the time something lands in a tagged release it has to be right. **Any change that alters `storage.local` keys, the `StoredVault` shape, the biometric credential shape, crypto parameters (PBKDF2 iterations, salt/IV lengths, AES-GCM mode), or onboarding/resume snapshot semantics is a breaking change** for that pipeline. A botched migration locks people out of their CUNY accounts. Treat backward compatibility as a hard requirement: bump `StoredVault.version`, write a forward migration, leave the old decrypt path intact until migration is proven, and never tag a release that can read but not re-encrypt an existing vault. The same applies to the message protocol between sidebar / service worker / content script during the auto-update rollout window — installed clients on the previous version must keep working.

# Security, crypto, and gotchas

The master password is **never written to `storage.local` or disk**. It lives only in `browser.storage.session` (`SESSION_MASTER_KEY = "cunySessionMaster"`) and in JS module memory while the side panel is open.

## Key constraints

- **`browser.storage.local` allowed keys** — **`cunyVault`** (encrypted `StoredVault`) and **`cunyBiometricCredential`** (AES-GCM-wrapped master password + WebAuthn credential ID + PRF salt; optional biometric unlock; no plaintext secrets). Nothing else may be added to `storage.local` without an explicit security pass.
- **Master password never in `storage.local`** — `decryptVault` / `encryptVault` accept it as a parameter. Never write it to `storage.local` or logs.
- **`browser` import** — always `import browser from "webextension-polyfill"`, never `chrome.*`.
- **Minimum browser versions** — `storage.session` requires Firefox 128+ and Chrome 141+. Do not lower these without adding a fallback.
- **`browser.storage.session` (sensitive keys)** — Plaintext session material is allowed only under these keys (see `src/cuny/ssoSite.ts` and `src/onboarding/resumeSession.ts`): **`cunySessionMaster`** (unlocked master password for the session), **`cunyPendingTotpSecretFromSso`** (TOTP enroll secret scraped on SSO), **`cunyEnrolledFactorAlias`** (display name for the enrolled factor), **`cunyOnboardingResumeSnapshot`** (resumable onboarding state + email/password for mid-flow resume). `localStorage` is **explicitly forbidden** for secrets — prior audit finding (plaintext on disk). Onboarding controller drafts stay in memory until resume snapshot persistence (debounced) or vault save; staging to the service worker uses `STAGE_ONBOARDING_CREDENTIALS` only (module memory, not `storage.session`).
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
4. **`browser.cookies` today** — **`cookies.getAll`** + **`cookies.remove`** sweeps every cookie on **`SSO_LOGIN_HOST`** during SSO logout (`clearSsoLoginCookies` in `src/background/service-worker.ts`). Brightspace session cleanup uses **`cookies.remove`** only on a **fixed pair of session names** with `url: BRIGHTSPACE_HOME_URL`. There is **no** `cookies.set` and no persistence of cookie **values**. If you add cookie APIs later: **`remove` only** on the **smallest** documented set; never **`cookies.set`** or jar carpet-bombing without explicit human verification. Add **`"cookies"`** permission and matching **`host_permissions`** — lack of permission is **not** an excuse for content-script `document.cookie` writes or remote cookie injection; use **documentation / user steps** instead.

Violations of §1–3 or careless use of §4 are **critical** severity regardless of convenience.
