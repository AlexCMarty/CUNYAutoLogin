# AGENTS.md — CUNY SSO Helper

AI agent guidance for this repository.

## What you should do for peak productivity
These are real time savers:
1. Access the internet to search for information when uncertain
2. Run terminal commands
3. Ask the user for clarification

## What this project is

A Manifest V3 browser extension (Firefox + Chromium) that:
1. Stores CUNY login credentials (email, password, TOTP secret) encrypted in `browser.storage.local` using PBKDF2 + AES-GCM.
2. Keeps the vault unlocked across popup opens for the lifetime of the browser session using `browser.storage.session`.
3. Injects a content script on `https://ssologin.cuny.edu/*` to probe and eventually auto-fill the login form.

The master password used to derive the encryption key is **never written to `storage.local` or disk**. It is held only in `browser.storage.session` (in-memory, cleared on browser restart) and in JS module memory while the popup is open.

## Project layout

```
popup.html                      Vite entry point for the popup UI
src/
  popup/popup.ts                Popup logic: vault save/update, session unlock, form validation
  popup/popup.css               Popup styles
  crypto/vault.ts               PBKDF2 + AES-GCM encrypt/decrypt helpers
  content/content.ts            Content script: DOM probes + onMessage handler
  background/service-worker.ts  Minimal MV3 service worker (onInstalled log)
  manifest.json                 Source manifest (copied to dist/ by Vite)
vite.config.ts                  Builds popup + background as ES modules
vite.content.config.ts          Builds content.ts as a single IIFE (no shared chunks)
dist/                           Built extension — load this folder in the browser
```

## Build

```bash
npm install
npm run build          # tsc typecheck → vite popup/bg build → vite content build
npm run build:content  # rebuild only the content script
npm run typecheck      # tsc --noEmit only
```

The two-step Vite build is intentional: `vite.config.ts` bundles the popup and background as ES modules, while `vite.content.config.ts` produces a single-file IIFE (`dist/content.js`) with no shared chunks — required for reliable MV3 content script injection.

## Loading the extension

**Firefox:** `about:debugging` → Load Temporary Add-on → select `dist/manifest.json`

**Chrome/Chromium:** `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

Rebuild and reload the extension after any source change.

## Session unlock (`popup.ts`)

The popup has three modes: `setup`, `locked`, and `unlocked`.

On every popup open, `init()` checks `browser.storage.session` for a saved master password (`SESSION_MASTER_KEY = "cunySessionMaster"`). If found, it runs PBKDF2 + AES-GCM decrypt automatically and opens directly in `unlocked` mode. If decryption fails (e.g. vault was re-keyed), the session entry is purged and the popup falls back to `locked`.

The master password is written to `browser.storage.session` after every successful unlock or save. It is cleared immediately when the user clicks **Lock vault**, which also resets all in-memory session state.

`browser.storage.session` is not available in Firefox < 115 or Chrome < 102. The three session helpers (`saveSessionMaster`, `loadSessionMaster`, `clearSessionMaster`) wrap the API in try/catch and silently degrade to always-locked behaviour on unsupported browsers.

## Key constraints and gotchas

- **`novalidate` on the popup form** — Firefox does not show native HTML5 validation tooltips inside extension popups; the submit event is silently swallowed. All validation is handled in JS (`popup.ts`). Do not remove `novalidate` from `<form>` in `popup.html`.
- **Content script must be a single IIFE** — MV3 does not support ES module content scripts reliably across browsers. Use `vite.content.config.ts` (IIFE format) for anything in `src/content/`.
- **`crossorigin` on built assets** — Vite injects `crossorigin` on `<script>` and `<link>` tags in the built HTML. These can cause silent failures under `moz-extension://`. Avoid adding new module preload links or external scripts.
- **Master password never in `storage.local`** — `decryptVault` / `encryptVault` accept it as a parameter. Never write it to `storage.local` or logs. `storage.session` is the only permitted persistence location.
- **`browser` import via `webextension-polyfill`** — always `import browser from "webextension-polyfill"`, never use `chrome.*` directly.
- **Minimum browser versions** — `storage.session` requires Firefox 115+ and Chrome 102+ (set in `src/manifest.json`). Do not lower these without adding a fallback.

## Crypto details (`src/crypto/vault.ts`)

| Parameter | Value |
|---|---|
| KDF | PBKDF2-SHA-256 |
| Iterations | 310 000 |
| Salt | 32 bytes (random per save) |
| IV | 12 bytes (random per save) |
| Cipher | AES-GCM-256 |
| Storage format | `{ version: 1, saltB64, ivB64, ciphertextB64 }` |

## What is NOT yet implemented

- `fillCredentials()` and `fillTOTP()` in the content script are stubs — the actual vault read + DOM fill logic is missing.
- TOTP code generation (the stored secret is Base32; a TOTP library needs to be added).
- Any automated tests.
