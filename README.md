# CUNY SSO Helper (browser extension)

Manifest V3 extension for Chromium and Firefox: encrypted credential storage in the popup (PBKDF2 + AES-GCM) and a content script scaffold for `https://ssologin.cuny.edu`.

## Build

```bash
npm install
npm run build
```

Load the `dist/` folder as an unpacked / temporary extension.

## Load unpacked

### Chrome / Chromium

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `dist/manifest.json`.

## Popup: first run and update

1. Click the extension icon.
2. Enter CUNY email (must end with `@login.cuny.edu`), password, Base32 TOTP secret, and a **local master password** (never stored; used only to derive the encryption key).
3. Click **Save** or **Update encrypted vault**. On update, the master password must decrypt the existing vault before re-encrypting.

## Content script: confirm injection

1. Open a tab to any page under `https://ssologin.cuny.edu/` (exact path may vary).
2. Open **Developer Tools → Console** for that tab.
3. Look for lines prefixed with `[CUNY SSO Helper]`, including `content script active` and DOM probe output.

## Test `FILL_CREDENTIALS` messaging

1. With the SSO tab active, open the extension popup.
2. Click **Send test FILL_CREDENTIALS to active tab**.
3. In the page console, confirm a log like: `runtime.onMessage FILL_CREDENTIALS:` with the payload (including `demo: true`).

If the active tab is not an extension page where the content script runs, the send may fail—use a `ssologin.cuny.edu` tab.

## Project layout

- `popup.html` / `src/popup/` — popup UI and vault save/update.
- `src/crypto/vault.ts` — PBKDF2 + AES-GCM helpers and storage shape.
- `src/content/content.ts` — SSO page probes, stubs, `runtime.onMessage` logger.
- `src/background/service-worker.ts` — minimal service worker.
- `vite.config.ts` — popup + background; `vite.content.config.ts` — single-file `content.js` (IIFE).

The content script is built in a second step so `dist/content.js` is one file with no shared ES module chunks (required for reliable MV3 injection).
