---
name: cunyautologin-browser-testing
description: >-
  Loads the CUNYAutoLogin dev extension in Chromium, opens the dev sidebar or
  popup, and drives or inspects it for manual or MCP-assisted testing. Use when
  the user wants to test the extension in a real browser, verify sidebar/popup,
  debug autofill on ssologin.cuny.edu, or connect Chrome DevTools MCP to an
  extension-loaded browser session.
---

# CUNYAutoLogin — browser testing (dev extension)

## Preconditions

1. **Development build** — Production builds omit the dev sidebar. Run from repo root:

   `npm run build:dev`

   Output: unpacked extension at **`dist/`** (merged manifest includes `side_panel` / Firefox sidebar in dev).

2. **Truth for launch flags** — **`e2e/extension-fixture.ts`** is the canonical pattern: Playwright `chromium.launchPersistentContext` with:

   - `--load-extension=<repo>/dist`
   - `--disable-extensions-except=<repo>/dist`

   Use **`channel: "chromium"`** (Playwright’s Chromium), not system Google Chrome, so you do not inherit unrelated component extensions that confuse extension IDs.

## Extension ID and URLs

- After launch, get the id from the extension **service worker** URL:  
  `chrome-extension://<id>/background.js` → `<id>` is the second path segment.
- **Popup:** `chrome-extension://<id>/popup.html`
- **Dev sidebar only:** `chrome-extension://<id>/sidebar.html` (vault mode label: Onboarding / Locked / Unlocked)

## Chrome DevTools MCP (`chrome-devtools-mcp`)

- **Reliable approach:** Start Chromium yourself with the extension **and** an HTTP remote-debugging port, then point MCP at that instance (see upstream README: `--browser-url` / `--browserUrl`).
- Example flags (Playwright Chromium binary path from `chromium.executablePath()` in Node, or the same binary used in e2e):

  - `--user-data-dir=…` (dedicated profile)
  - `--remote-debugging-port=9222` (pick a free port)
  - `--load-extension=<absolute-path-to>/dist`
  - `--disable-extensions-except=<same-path>/dist`

- Then configure MCP with e.g. `--browser-url=http://127.0.0.1:9222` so tools attach to **that** browser.
- **Why not rely on MCP-only launch?** The server uses Puppeteer, which injects `--disable-extensions` by default. Passing `--chrome-arg=--load-extension=…` can be overridden unless default args are stripped; always **verify** the live Chrome command line includes `--load-extension` and that an unpacked extension appears in `chrome://extensions`-equivalent state. Attaching to a self-started Chromium avoids that class of failure.

## What to automate vs. eyeball

- **Popup / sidebar:** Fully automatable via Playwright or MCP (`navigate_page`, `take_snapshot`, `fill`, etc.) on `chrome-extension://` pages.
- **CUNY SSO (`https://ssologin.cuny.edu/*`):** Content script runs there; vault must be **unlocked** (session in `storage.session`). Test flow mirrors e2e: save vault in popup, open an ssologin tab, wait for async Oracle/JET UI and autofill.

## Secrets

Never commit real credentials. For live login tests, use environment variables or local-only config; follow **Security, crypto, and gotchas** project rules for vault and session handling.
