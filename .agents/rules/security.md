<!-- Load when: touching vault, credentials, storage, crypto, or any sensitive data path -->

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
