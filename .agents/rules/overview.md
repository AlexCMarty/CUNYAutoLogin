<!-- Load when: navigating the codebase, understanding project structure, finding files, or working on build/manifest config -->

# CUNYAutoLogin — project overview

## Tips for peak productivity

1. Search the internet when uncertain about browser extension APIs
2. Run terminal commands freely
3. Ask for clarification rather than guessing

## What this project is

A Manifest V3 browser extension (Firefox + Chromium) that:

1. Stores CUNY credentials (email, password, TOTP secret) encrypted in `browser.storage.local` via PBKDF2 + AES-GCM.
2. Keeps the vault unlocked across side panel opens for the browser session via `browser.storage.session`.
3. Injects a content script on `https://ssologin.cuny.edu/*` that auto-fills the Oracle SSO login and TOTP pages when the vault session is valid.
4. Guides first-time students through a multi-screen onboarding flow.

Recent architecture: onboarding routing in `onboarding/render.ts` uses a declarative stage-handler map; runtime message routing helpers live in `src/runtime/messageRouter.ts`; content script responsibilities are split across `src/content/*Flow*.ts` and `*Bridge*.ts` modules with `content.ts` as orchestration only.

## Project layout

```
sidebar.html                    Vite entry point — vault form + #onboarding-root
src/
  vaultSession/snapshot.ts      loadVaultSessionSnapshot — setup / locked / unlocked
  sidebar/sidebar.ts            Sidebar entrypoint — routes to onboarding or vault UI
  sidebar/vaultController.ts    Vault controller — setup / locked / unlocked, encrypt/save,
                                session unlock, master rotation, draft autosave
  sidebar/sidebar.utils.ts      Pure helpers (email validation, draft parse, status strings,
                                MIN_MASTER_PASSWORD_LENGTH = 12)
  sidebar/debugPanel.ts         Dev-only debug panel (FILL_CREDENTIALS tester + clear-vault)
  sidebar/sidebar.css           Base vault UI styles
  onboarding/state.ts           18-state enum, bead mapping, resume policy
  onboarding/transitions.ts     Declarative TRANSITION_TABLE + advance / backStateFor
  onboarding/controller.ts      createOnboardingController — closure-only state; subscribe/dispatch
  onboarding/messages.ts        Wire contract + is* guards for all onboarding messages
  onboarding/beadHeader.ts      Five-bead progress header
  onboarding/render.ts          mountOnboarding — mounts shell + screen + runtime.onMessage bridge;
                                fires CLEAR_ONBOARDING_CREDENTIALS on unmount
  onboarding/screens/           welcome, emailEntry, passwordEntry, openingCuny, allowGate,
                                oaaSpaHome, guidedManage, guidedAddFactor, guidedFactorType,
                                guidedSecretCapture, verifyLoginCode, setDefault, extPasswordSetup,
                                biometricOffer, biometricPrep, completeDemo, completeDone.
                                guidedCommon.ts — shared guided-flow helpers
                                screenContext.ts — shared mount context
  crypto/vault.ts               PBKDF2 + AES-GCM encrypt/decrypt; VAULT_STORAGE_KEY
  cuny/ssoSite.ts               Single source of truth for SSO URL markers, DOM IDs, TOTP constants
  runtime/messageRouter.ts      routeByType, guardedRoute shared helpers
  content/content.ts            IIFE composition root — startup wiring + URL routing
  content/domWait.ts            Shared MutationObserver wait helpers
  content/credentialFlow.ts     Credential submit/error/report flow
  content/totpLoginFlow.ts      Login-page TOTP generation/fill flow
  content/totpEnrollSecretBridge.ts  Enroll-page secret scrape/post bridge
  content/mfaEnrollVerifyFlow.ts    Self-service enroll-verify polling flow
  content/overlayBridge.ts      Pull/execute overlay commands
  content/allowConsentReporter.ts   Allow-button click reporter
  content/banner.ts             Extension-branded credential-error banner (INT_MAX z-index)
  content/content.utils.ts      Pure helpers (TOTP normalization, KO-aware input setter)
  background/service-worker.ts  Opens side panel on toolbar click; handles AUTO_FILL_REQUEST,
                                STAGE/CLEAR_ONBOARDING_CREDENTIALS, TOTP_SECRET_FROM_PAGE,
                                ONBOARDING_REOPEN_CUNY_TAB
  manifest.json                 Source manifest (Vite writes dist/manifest.json)
  manifest.e2e.json             E2E variant — adds http://127.0.0.1:4173/* to host_permissions
vite.config.ts                  Builds sidebar + background as ES modules
vite.content.config.ts          Builds content.ts as single IIFE (inlineDynamicImports)
e2e/
  onboarding.spec.ts            First-run, screens 1–4, credential-error regressions
  onboarding-guided.spec.ts     Overlay, guided CUNY steps, verify / set-default flows
  onboarding-completion.spec.ts Extension password, biometrics, completion, interruptions
  locked.spec.ts                Vault locked behavior
  unlocked.spec.ts              Unlocked vault + autofill
  helpers.ts                    gotoPrimarySurface, clearVaultIfPossible, setupVault, lockVault,
                                walkToPasswordEntry, onboardingHashWith
  extension-fixture.ts          Loads built extension into Chromium via --load-extension
  fixtures-server.mjs           Local HTTP server for e2e/fixtures/*.html
  fixtures/                     credential, credential-error, credential-success-transient,
                                totp, self-service, allow-gate HTML pages
  constants.ts                  FIXTURE_PORT, FIXTURE_ORIGIN, fixture URLs
  test-credentials.ts           Fabricated test credentials for E2E only
.plans/                         Engineering plan documents — not part of the build
.map/                           AI-optimized reference for the live CUNY SSO flow.
                                pages/ — per-page markdown (selectors, timing, HTML skeleton)
                                graph.yaml — full transition state machine
                                conventions.md — Oracle JET async timing, selector patterns
dist/                           Built extension — load this folder in the browser
```

## Build detail

The two-step Vite build is intentional: `vite.config.ts` bundles sidebar + background as ES modules; `vite.content.config.ts` produces a single-file IIFE (`dist/content.js`) with `inlineDynamicImports` — required for reliable MV3 content script injection and to ship `totp-generator` + `neverthrow` inside the content bundle.

## Loading the extension

**Firefox:** `about:debugging` → Load Temporary Add-on → select `dist/manifest.json`
**Chrome/Chromium:** `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

Rebuild and reload after any source change.

## Runtime dependencies

- `webextension-polyfill` — unified `browser` API
- `neverthrow` — `Result` / `ResultAsync` in vault, vault controller, and content flow modules
- `totp-generator` — TOTP codes in the content script (bundled into IIFE)

## Dev/E2E escape hatches

- `#onboarding=1` URL hash — forces onboarding in sidebar (dev/e2e only)
- `#vault=1` URL hash — forces vault setup form even with no stored vault (e2e only)
