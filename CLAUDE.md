# CUNYAutoLogin — Claude Code guidance

## What this project is

A Manifest V3 browser extension (Firefox + Chromium) that:

1. Stores CUNY login credentials (email, password, TOTP secret) encrypted in `browser.storage.local` using PBKDF2 + AES-GCM.
2. Keeps the vault unlocked across popup opens for the lifetime of the browser session using `browser.storage.session`.
3. Injects a content script on `https://ssologin.cuny.edu/*` that auto-fills the Oracle SSO login and TOTP pages when the vault session is valid, and responds to manual `FILL_CREDENTIALS` messages from the popup.

Saved email must end with **`@login.cuny.edu`** (enforced in `popup.ts`).

## Project layout

```
popup.html                      Vite entry point for the popup UI
sidebar.html                    Dev-only Vite entry: vault state side UI (Chrome side panel + Firefox sidebar); omitted from production build
src/
  vaultSession/snapshot.ts      loadVaultSessionSnapshot — shared vault + session master mode (used by popup init and dev sidebar)
  vaultSession/snapshot.test.ts Unit tests for snapshot (injected storage mocks; no top-level webextension-polyfill import)
  dev/sideSurface.manifest.patch.ts  Single object: both vendors’ manifest keys for the dev side UI (merged in vite only when MODE=development)
  dev/sidebar/sidebar.ts        Dev-only page: Onboarding / Locked / Unlocked from snapshot + storage.onChanged
  dev/sidebar/sidebar.css       Dev sidebar styles
  popup/popup.ts                Modes: setup / locked / unlocked; encrypt/save; session unlock; master rotation; draft autosave
  popup/popup.utils.ts          Pure helpers + small DOM utilities used by the popup (email validation, draft parse, status copy)
  popup/popup.test.ts           Unit tests: popup.utils (jsdom + mocked webextension-polyfill)
  popup/debugPanel.ts           Debug-only: test FILL_CREDENTIALS + clear vault (not bundled in production)
  popup/popup.css               Popup styles
  crypto/vault.ts               PBKDF2 + AES-GCM encrypt/decrypt; VAULT_STORAGE_KEY; payload types
  crypto/vault.test.ts          Unit tests: encrypt/decrypt round-trips, tamper detection, isStoredVault guard
  cuny/ssoSite.ts               Single source of truth for SSO URL path markers, DOM element IDs, and TOTP constants
  cuny/ssoSite.test.ts          Unit tests: all URL matcher functions and critical constants
  content/content.ts            IIFE bundle: MutationObserver; fill login + TOTP; enroll-page secret scraping;
                                MFA self-service verify OTP polling; AUTO_FILL_REQUEST + FILL_CREDENTIALS handling
  content/content.utils.ts      Pure helpers for the content script (TOTP normalization, enroll scrape, KO-aware setInputValue, message guards)
  content/content.test.ts       Unit tests: content.utils (jsdom)
  background/service-worker.ts  onInstalled log; AUTO_FILL_REQUEST → decrypt vault via session master;
                                TOTP_SECRET_FROM_PAGE → validate + stage in session storage
  background/service-worker.test.ts  Unit tests: message routing, AUTO_FILL paths, TOTP staging (mocked polyfill + vault helpers)
  manifest.json                 Source manifest; Vite writes dist/manifest.json (merges dev side UI in development mode)
  manifest.e2e.json             E2E variant — adds http://127.0.0.1:4173/* to host_permissions and content_scripts
icons/dev-sidebar-48.png        Copied to dist/ in dev builds only — Firefox sidebar_action icon
vite.config.ts                  Builds popup + background (+ dev sidebar); merges manifest; dev copies sidebar icon
vite.content.config.ts          Builds content.ts as a single IIFE (dist/content.js, inline deps)
e2e/
  onboarding.spec.ts            Playwright: first-run / setup flow
  locked.spec.ts                Playwright: vault locked behavior
  unlocked.spec.ts              Playwright: unlocked vault + autofill
  helpers.ts                    Shared popup / vault setup for specs
  extension-fixture.ts          Loads the built extension into Chromium via --load-extension
  fixtures-server.mjs           Local HTTP server serving e2e/fixtures/*.html pages
  fixtures/                     HTML pages that mimic CUNY SSO screens
  constants.ts                  Shared constants (FIXTURE_PORT, fixture URLs)
  test-credentials.ts           Plaintext test credentials used only by E2E tests
dist/                           Built extension — load this folder in the browser
```

## Build commands

```bash
npm install
npm run build          # production: tsc --noEmit → vite build → vite content
npm run build:dev      # development mode; popup includes debug panel; dist includes dev sidebar + merged manifest (Chrome 114+)
npm run build:e2e      # dev build with manifest.e2e.json (required before E2E tests)
npm run build:content  # rebuild only the content script
npm run watch          # vite build --watch --mode development
npm run typecheck      # tsc --noEmit only
npm run test:unit      # vitest run (no build needed)
npm run test:e2e       # build:e2e then playwright test
```

The two-step Vite build is intentional: `vite.config.ts` bundles the popup and background as ES modules; `vite.content.config.ts` produces a single-file IIFE with `inlineDynamicImports` — required for reliable MV3 content script injection and to ship `totp-generator` + `neverthrow` inside the content bundle.

## Loading the extension

**Firefox:** `about:debugging` → Load Temporary Add-on → select `dist/manifest.json`  
**Chrome/Chromium:** `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

Rebuild and reload the extension after any source change.

## Runtime dependencies

- `webextension-polyfill` — unified `browser` API (never use `chrome.*` directly)
- `neverthrow` — `Result` / `ResultAsync` / `ok` / `err` in `vault.ts`, `popup.ts`, and `content.ts`
- `totp-generator` — TOTP codes in the content script (bundled into IIFE)

---

## Security invariants

The master password **is never written to `storage.local` or disk**. It is held only in `browser.storage.session` and in JS module memory while the popup is open.

- **Master password never in `storage.local`** — `decryptVault` / `encryptVault` accept it as a parameter. Never write it to `storage.local` or logs.
- **`PENDING_TOTP_SECRET_SESSION_KEY`** — The scraped Base32 TOTP secret is staged in `browser.storage.session` only. Never write it to `storage.local`, logs, or any persistent store.
- **Setup draft in `browser.storage.session`** — email/password/TOTP drafts are mirrored to `browser.storage.session` (key: `cuny_form_draft`) **while in setup mode only**. `storage.session` is in-memory and never written to disk. `localStorage` is explicitly forbidden for this data — it persists to disk indefinitely and was a prior audit finding. Draft saving is gated: input listeners check `currentMode === "setup"` before calling `saveDraft`.
- **`browser` import** — always `import browser from "webextension-polyfill"`, never `chrome.*`.
- **Minimum browser versions** — `storage.session` requires Firefox 115+ and Chrome 102+. Do not lower these without adding a fallback.

### Security stakes

This extension stores institutional login credentials (email, password, TOTP secret) for 275,000+ CUNY students. It is subject to CUNY IT security review and Chrome Web Store scrutiny. A credential exposure is an institutional-scale incident — the kind that gets extensions removed from the Web Store and triggers disciplinary proceedings against the developer. Every change to credential-handling code carries this weight. When in doubt, check with a security-aware reviewer before merging.

### Crypto parameters (`src/crypto/vault.ts`)

| Parameter | Value |
|---|---|
| KDF | PBKDF2-SHA-256 |
| Iterations | 310 000 |
| Salt | 32 bytes (random per save) |
| IV | 12 bytes (random per save) |
| Cipher | AES-GCM-256 |
| Storage format | `{ version: 1, saltB64, ivB64, ciphertextB64 }` |

---

## Key architectural gotchas

- **`novalidate` on the popup form** — Firefox silently swallows submit events with native HTML5 validation inside extension popups. All validation is in JS. Do not remove `novalidate` from `<form>` in `popup.html`.
- **Content script must be a single IIFE** — MV3 does not support ES module content scripts reliably across browsers. Always build `src/content/` via `vite.content.config.ts`.
- **`crossorigin` on built assets** — Vite injects `crossorigin` on `<script>` and `<link>` tags. These cause silent failures under `moz-extension://`. Avoid adding module preload links or external scripts.
- **Oracle JET inputs** — inputs render after `document_idle`. Content script uses `MutationObserver` + timeouts, not immediate DOM access.
- **SSO constants** — All URL path markers, DOM element IDs, and timing constants live in `src/cuny/ssoSite.ts`. Never hardcode these in `content.ts` or `service-worker.ts`.
- **MFA self-service OTP polling** — `startMfaEnrollVerifyOtpPolling` uses `setInterval` instead of `MutationObserver` because the Oracle SPA re-renders the form in ways that make observers flaky. See the comment in that function.

---

## TypeScript style

- Arrow functions always
- No `any` — use precise union types or generics
- Named exports only
- `async`/`await` only; no `.then()`
- Avoid `throw` — use neverthrow `Result` / `ResultAsync`. A `throw` **requires** a comment explaining why neverthrow was unsuitable.
- Functions do one thing. If you need "and" to describe it, split it.
- Aim for 20–40 lines per function; hard cap 80 lines.
- Early returns over nesting — fail fast, keep the happy path obvious.

### Naming

Functions and variables announce their purpose without needing a comment.

- Predicates: `matchesCredentialPage`, `matchesTotpPage` — not `check`, `test`, `verify`
- Waiters: `waitForInputById`, `waitForEnrollTotpSecret` — not `getEl`, `findInput`
- Error strings in unions: screaming snake case — `"decrypt_failed"`, `"no_session_master"`

### Comments

The code shows *what*. Comments explain *why this approach* was chosen, or what non-obvious constraint forced the decision. Never restate what the code already says. Never leave commented-out code in a committed branch — use git history.

### neverthrow patterns

```typescript
// Good — both tracks are typed and explicit
const result = await decryptVault(stored, master);
return result.match(
  (payload) => ({ success: true as const, payload }),
  ()        => ({ success: false as const, reason: "decrypt_error" as const }),
);
```

DOM helpers return `Result<El, string>` — fail fast at a single consolidated error surface, not scattered null checks.

---

## Unit testing conventions

Unit tests live alongside source files as `*.test.ts`. The runner is **Vitest** (`npm run test:unit`) — no build step needed. `vitest.config.ts` includes `src/**/*.test.ts`.

**Suites today:** `vault.test.ts`, `ssoSite.test.ts`, `popup.test.ts`, `content.test.ts`, `service-worker.test.ts`.

Logic that is awkward to test inside an IIFE or a top-level service worker lives in colocated `*.utils.ts` modules (`popup.utils.ts`, `content.utils.ts`) so Vitest can import it directly.

### Vitest environment

- **Default (Node):** `vault.test.ts`, `ssoSite.test.ts`, and `service-worker.test.ts` run in Node; `globalThis.crypto.subtle` is available on supported Node versions.
- **jsdom:** Files that need `document` / `HTMLElement` start with `// @vitest-environment jsdom` — see `popup.test.ts` and `content.test.ts`.

### Mocking `webextension-polyfill`

Popup and background unit tests use `vi.mock("webextension-polyfill", …)` to stub `browser.storage`, `browser.runtime.onMessage`, etc. Pair `vi.spyOn` on `crypto.subtle` with `afterEach(() => vi.restoreAllMocks())` so mocks do not leak across tests (see `unit-testing.mdc`).

### Result unwrapping

Never use `_unsafeUnwrap()` or `_unsafeUnwrapErr()` in tests. When a test fails, these throw an opaque `UnsafeUnwrapError` with no indication of the actual value. Use the `unwrap` / `unwrapErr` helpers defined in each test file instead:

```typescript
function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok, got err(${JSON.stringify(result.error)})`);
  return result.value;
}
```

### Bypassing serialisation to test parsing branches

When a function both serialises *and* parses (e.g. `encryptVault` JSON-encodes before encrypting, `decryptVault` decodes after decrypting), test the parsing branches with a raw helper that writes arbitrary bytes into the encrypted blob — without going through the production serialisation path. This keeps the serialisation and parsing branches independently exercised.

See `encryptRaw` in `src/crypto/vault.test.ts` for the pattern.

### Pure-function modules

Modules that export only pure string/boolean functions (e.g. `ssoSite.ts`) need no mocking, no `beforeEach`, and no async setup. Use flat `describe` + `test` blocks with inline inputs — see `src/cuny/ssoSite.test.ts` as the reference.

### Shared setup in describe blocks

Use `beforeEach` + a `let` variable when multiple tests in the same `describe` block need the same freshly-created value. Do not repeat `await setup()` in every test body.

```typescript
describe("tampered StoredVault → decrypt_failed", () => {
  let stored: StoredVault;
  beforeEach(async () => { stored = unwrap(await encryptVault(PAYLOAD, MASTER)); });
  // tests use stored directly
});
```

---

## E2E testing conventions

- Always run `npm run build:e2e` before `npm run test:e2e`. Stale artifacts cause false failures.
- `workers: 1`, `fullyParallel: false` — extension storage is global to the browser context.
- Each spec's `beforeEach` clears vault state via `#clear-vault-debug-btn` (only present in dev/e2e builds). Never assume clean state without this reset.
- Use shared helpers from `e2e/helpers.ts` (`gotoPopup`, `clearVaultIfPossible`, `setupVault`, `lockVault`).
- Firefox is not supported in E2E — test Firefox manually via `about:debugging`.

### Fixture URLs

All fixture URLs are named constants in `e2e/constants.ts`. Never construct or hardcode fixture URLs inside specs.

```typescript
// Good
await fixturePage.goto(CREDENTIAL_FIXTURE_URL);
```

### Test naming

Plain sentences describing observable behavior:

```typescript
// Good
test("fills credential page via AUTO_FILL_REQUEST on load", async () => { ... });
test("does not fill credential page when vault is locked", async () => { ... });
```

### Assert behavior, not internals

```typescript
// Good — observes the DOM outcome
await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.username}`)).toHaveValue(E2E_EMAIL);
```

Import element IDs from `src/cuny/ssoSite.ts` in specs — the same constants the extension uses — so specs break immediately if a constant is renamed.

---

## Code quality

1. Write code that will be read by humans, not by AI.
2. Always choose the simplest solution. Add complexity only when it solves a real problem.
3. Always leave the codebase better than you found it.

**We do not:**
- Use `any` as a way to avoid thinking about types
- Skip tests because we're confident a change is safe
- Add comments that restate what the code says
- Leave commented-out code in committed branches
- Write code that only the original author can maintain

### Pre-merge checklist

- [ ] Does every function do exactly one thing?
- [ ] Can a stranger understand each variable's purpose from its name alone?
- [ ] Are all error paths handled explicitly (typed, not swallowed)?
- [ ] Are there tests for the new behavior, including edge cases?
- [ ] Is there a test that would catch a regression if this broke?
- [ ] Are there any `TODO`s that should be tickets instead?
- [ ] Is there any commented-out code?
- [ ] Could a sleep-deprived on-call developer understand this at 3am?

---

## Documentation

`README.md` is oriented toward less technically inclined college students — it's the first thing they see on GitHub. Put technical documentation in `CONTRIBUTING.md` or inline comments, not the README.
