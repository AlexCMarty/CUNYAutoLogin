# CUNYAutoLogin

How many times a day do you log into CUNYFirst? Probably multiple times. This is because CUNY refuses to let us stay signed. This extension aims to simplify the lives of all CUNY students by signing you in automatically.

# How it works

1. Install.
2. Enter your CUNY email, password, and TOTP code.
3. Choose a strong *master password* for the vault.
4. Unlock the vault when you open your browser.
3. Now you will always be logged into CUNYFirst, Brightspace, Degreeworks etc. automatically.

# How to get your TOTP secret

Before you can use the extension, you will have to add a new authentication factor in CUNYFirst.

1. Visit CUNY MFA Self-Service https://ssologin.cuny.edu/oaa/rui and log in as usual.
2. You will see a page, "Allow CUNY Login to Access MFA Self-Service?" Click "Allow"
2. Under "My authentication factors" click "Manage"
3. Add authentication factor
4. Click, "Mobile Authenticator - TOTP"
5. You will see a string of random numbers and letters (the TOTP secret key), and also a QR code. **Do not share this with anyone**. This generates the six digit code.
6. Open the extension. The key will be autofilled.
7. While on that page, enter into the extension your CUNY email ending in @login.cuny.edu and your CUNY password.
8. Choose a **strong master password**. You will enter this every time you open your browser to unlock the vault.
9. Save credentials
10. In the CUNY webpage, you must save the TOTP authentication method. In "enter a friendly name" just put CUNYAutoLogin
11. Click "Verify Now" and the six digit code will be automatically filled in for you. If it doesn't fill, make sure you actually clicked "save credentials" in the vault.

!TODO functionality of autofilling six digit code in step 11 doesn't exist

## Load unpacked

### Chrome / Chromium

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `dist/manifest.json`.

# For developers

Manifest V3 extension for Chromium and Firefox: encrypted credential storage in the popup (PBKDF2 + AES-GCM), session unlock via `browser.storage.session`, and a content script for `https://ssologin.cuny.edu` that auto-fills login and TOTP when the vault is unlocked.

## Build

```bash
npm install
uv tool install kwin-mcp # Required for automated testing of the extension
npm run build
```

Load the `dist/` folder as an unpacked / temporary extension.

## GitHub Releases (beta builds)

**Publishing a release (maintainer):** Update `version` in `src/manifest.json` if needed, commit, then create and push a tag whose name matches that version with a `v` prefix (for example `v0.2.2` for manifest version `0.2.2`). Pushing the tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds on GitHub and attaches `CUNYAutoLogin-<tag>.zip` (contents of `dist/`) to a new release. Tags whose names contain `beta` or `rc` are marked as prereleases.

**Installing from a release (beta testers):** On the repo’s **Releases** page, download the zip for the version you want, unzip it to a folder (it should contain `manifest.json` at the top level), then load that folder as unpacked / temporary add-on (same as **Load unpacked** below, but use the unzipped folder instead of a local `dist/` build).



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

## Project layout

- `popup.html` / `src/popup/` — popup UI, vault encrypt/save, session unlock, master rotation.
- `src/crypto/vault.ts` — PBKDF2 + AES-GCM helpers and storage shape.
- `src/content/content.ts` — Oracle JET–aware fill for login + TOTP; `AUTO_FILL_REQUEST` and `FILL_CREDENTIALS`.
- `src/background/service-worker.ts` — decrypt vault for auto-fill when session master is present.
- `vite.config.ts` — popup + background; `vite.content.config.ts` — single-file `content.js` (IIFE).

The content script is built in a second step so `dist/content.js` is one file with no shared ES module chunks (required for reliable MV3 injection).
