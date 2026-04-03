# Contributing to CUNYAutoLogin

Manifest V3 extension for Chromium and Firefox: encrypted credential storage in the popup (PBKDF2 + AES-GCM), session unlock via `browser.storage.session`, and a content script for `https://ssologin.cuny.edu` that auto-fills login and TOTP when the vault is unlocked.

## Build

```bash
npm install
npm run build
```

This runs TypeScript checks, then Vite for the popup and background, then a second Vite pass for the content script. Output goes to `dist/`.

| Script | Purpose |
|--------|---------|
| `npm run build` | Full build (popup, background, content, manifest copy) |
| `npm run build:content` | Rebuild only `dist/content.js` |
| `npm run watch` | Watch mode for popup/background (rerun `build:content` when content changes) |
| `npm run typecheck` | `tsc --noEmit` only |

Load `dist/` as an unpacked / temporary extension (see below), or install from a [release zip](./releases) like beta testers.

## Load unpacked (from source)

### Chrome / Chromium / Edge

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `dist/manifest.json`.

## GitHub Releases

**Publishing a release (maintainer):** Update `version` in `src/manifest.json` if needed, commit, then create and push a tag whose name matches that version with a `v` prefix (for example `v0.2.2` for manifest version `0.2.2`). Pushing the tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds on GitHub and attaches `CUNYAutoLogin-<tag>.zip` (contents of `dist/`) to a new release. Tags whose names contain `beta` or `rc` are marked as prereleases.

**Installing from a release:** On the [**Releases**](./releases) page, download the zip, unzip to a folder with `manifest.json` at the top level, then load that folder using **Load unpacked** / **Load Temporary Add-on** as above.

## Popup: first run and update

1. Click the extension icon.
2. Enter CUNY email (must end with `@login.cuny.edu`), password, Base32 TOTP secret, and a **local master password** (never stored in `storage.local`; used only to derive the encryption key).
3. Use **Save encrypted vault**, **Unlock**, or **Save changes** depending on mode. To change the master password, fill both optional fields in unlocked mode.

## Content script: confirm injection

1. Open a tab to any page under `https://ssologin.cuny.edu/` (exact path may vary).
2. Open **Developer Tools → Console** for that tab.
3. Look for lines prefixed with `[CUNYAutoLogin]` (auto-fill and message handling logs).

## Test `FILL_CREDENTIALS` messaging

1. With a ssologin tab active, open the extension popup (vault unlocked).
2. Click **Send test FILL_CREDENTIALS to active tab**.
3. In the page console, confirm a log like `runtime.onMessage FILL_CREDENTIALS — triggering main()`.

If the active tab is not a page where the content script runs, the send may fail—use a `ssologin.cuny.edu` tab.

## MFA enrollment: Verify Now (technical)

After **My authentication factors**, the self-service app often keeps the **same URL** while it swaps views in place. The code field for **Verify Now** does not exist until you click that button, so the content script uses polling on the verify URL (`…/oaa/rui/index.html?h_ra=1`). Unlock the vault before the field appears; the six-digit code fills when the field is present.

## Project layout

- `popup.html` / `src/popup/` — popup UI, vault encrypt/save, session unlock, master rotation.
- `src/crypto/vault.ts` — PBKDF2 + AES-GCM helpers and storage shape.
- `src/content/content.ts` — Oracle JET–aware fill for login + TOTP; `AUTO_FILL_REQUEST` and `FILL_CREDENTIALS`.
- `src/background/service-worker.ts` — decrypt vault for auto-fill when session master is present.
- `vite.config.ts` — popup + background; `vite.content.config.ts` — single-file `dist/content.js` (IIFE).

The content script is built in a second step so `dist/content.js` is one file with no shared ES module chunks (required for reliable MV3 injection).
