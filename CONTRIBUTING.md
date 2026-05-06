# Contributing to CUNYAutoLogin

Manifest V3 extension for **Chromium 141+** and **Firefox 128+** (see `src/manifest.json`). The sidebar stores an encrypted vault (**PBKDF2 + AES-GCM**), keeps the session master in **`browser.storage.session`**, and ships a content script on the CUNY SSO host that auto-fills login and TOTP when the vault is unlocked.

For day-to-day product copy and install steps, see **[README.md](README.md)**. This file is for **developers and maintainers**: build, test, release, and where things live in the tree.

---

## Prerequisites

- **Node.js 22+** and npm (matches [`.github/workflows/release.yml`](.github/workflows/release.yml)).
- **Git** with a clean working tree before you start (`git status`).

---

## First-time setup

```bash
npm ci
```

`npm ci` respects the lockfile and is what CI uses. Use `npm install` only when you intentionally change dependencies.

---

## Build and quality gates

**Lint is part of every full build.** Do not skip `npm run lint` locally — it runs with `--max-warnings 0` and must pass before merge (see `eslint.config.js`).

```bash
npm run lint          # ESLint on src/ + e2e/ (zero warnings enforced)
npm run typecheck     # tsc --noEmit only
npm run build         # lint → tsc → Vite (sidebar + background) → Vite (content IIFE)
npm run build:dev     # Same pipeline, development mode + sidebar debug controls
npm run build:e2e     # build:dev + E2E manifest (local fixture origin)
npm run build:content # dist/content.js only (default Vite mode unless you pass flags)
npm run watch         # vite --watch for sidebar/background (dev mode); rerun build:content / build:dev when content changes
```

**Outputs:** everything lands in **`dist/`**. Load that folder as an unpacked / temporary extension (see below).

| Script | What it does |
|--------|----------------|
| `npm run build` | Production: **lint**, TypeScript check, Vite app bundle, second Vite pass for `content.js`, merged `dist/manifest.json`. |
| `npm run build:dev` | Development builds for sidebar, background, and content; sidebar includes **Send test FILL_CREDENTIALS** and **Clear vault — debug**. |
| `npm run build:e2e` | Same as `build:dev`, but `E2E_MANIFEST=1` so Vite emits **`src/manifest.e2e.json`** into `dist/manifest.json`. That manifest adds `http://127.0.0.1:4173/*` to **`host_permissions`** and to **`content_scripts[0].matches`** so Playwright fixtures load the content script. |
| `npm run build:content` | Rebuild only `dist/content.js` (single-file IIFE). |
| `npm run watch` | Watch sidebar/background in dev mode. |
| `npm run typecheck` | `tsc --noEmit` only. |

The [release workflow](.github/workflows/release.yml) runs **`npm run build`** after `npm ci`. **Unit and E2E tests are not run in CI** — run **`npm run test`** locally before merging.

---

## Tests

```bash
npm run test:unit   # Vitest, no build required
npm run test:e2e    # build:e2e + Playwright (Chromium, extension from dist/)
npm run test        # unit, then e2e
```

- **Unit tests:** `src/**/*.test.ts` (see `vitest.config.ts`).
- **E2E:** specs under `e2e/` (`onboarding.spec.ts`, `onboarding-guided.spec.ts`, `onboarding-completion.spec.ts`, `locked.spec.ts`, `unlocked.spec.ts`). **Firefox is not automated** — load `dist/` manually via `about:debugging` when you need Gecko coverage.

After changing **only** Playwright specs, you can run `npx playwright test`; the config still starts the fixture server. Keep **`dist/`** in sync with a recent `npm run build:e2e` so `manifest.json` matches the E2E host permissions.

---

## CUNY page contract (`src/cuny/ssoSite.ts`)

**All** SSO host patterns, path markers, DOM ids, timing constants, and helpers like `browser.tabs.query` URL patterns must live in **`src/cuny/ssoSite.ts`**. Runtime code in `src/content/`, `src/background/`, and elsewhere should **import** from there — do not duplicate literals for drift-prone values.

End-to-end fixtures and the fixture server (`e2e/fixtures-server.mjs`) mirror those paths so local URLs behave like production.

---

## Sidebar screenshot CLI

For **sidebar-only** visual QA (layout, `#vault=1`, `#qa=<STATE>`, etc.) without hitting live CUNY:

1. `npm run build:e2e`
2. `npm run capture-sidebar -- '#vault=1'` — default viewport **380×800**; override with `--width` / `--height` after `--`.

Writes under `agent_screenshots/` (gitignored); prints the **absolute PNG path** on stdout. See `node scripts/capture-sidebar.mjs --help` and [`e2e/extension-fixture.ts`](e2e/extension-fixture.ts) for the same Chromium load-extension approach.

---

## Load unpacked (from `dist/`)

### Chrome / Chromium / Edge

1. `chrome://extensions` (or `edge://extensions`)
2. **Developer mode** on
3. **Load unpacked** → select **`dist/`**

### Firefox

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → `dist/manifest.json`

Rebuild and reload after source changes.

---

## GitHub Releases

**Maintainers:** bump **`version`** in `src/manifest.json` (and keep `package.json` / `src/manifest.e2e.json` aligned), commit, then tag **`vX.Y.Z`** matching that version and push the tag. The workflow zips `dist/` as `CUNYAutoLogin-<tag>.zip`. Tags containing `beta` or `rc` become GitHub **prereleases**.

**Installers:** download the release zip, unzip so `manifest.json` is at the top level, then load unpacked / temporary add-on as above.

---

## Storage (non-secrets in `storage.local`)

- **`cunyVault`** — encrypted `StoredVault`.
- **`cunyOnboardingCompleted`** — boolean when onboarding reaches `COMPLETE_DONE`; cleared when the vault is wiped.

Do not add new `storage.local` keys without a security review (see `.agents/rules/security.md`).

---

## Content script: confirm injection

1. Open any tab on the CUNY SSO origin (paths vary).
2. Use **`npm run build:dev`** if you want `[CUNYAutoLogin]` lines in the **page** console (production omits them).
3. DevTools → Console on that tab should show prefixed logs when gated by `import.meta.env.DEV`.

---

## Dev-only `FILL_CREDENTIALS` test

Requires **`npm run build:dev`**. With a `ssologin` tab active and the vault unlocked, use **Send test FILL_CREDENTIALS to active tab** in the sidebar; the listener in `content.ts` is tree-shaken out of production builds.

---

## MFA enrollment “Verify Now” (engineering note)

After **My authentication factors**, the Oracle SPA often keeps the same URL while swapping views. The verify OTP field appears late; the content script polls on the URL matched by **`matchesRuiMfaEnrollVerifyPage`** / **`RUI_MFA_ENROLL_VERIFY_PAGE_URL`** in `ssoSite.ts`. Unlock the vault before the field exists so `AUTO_FILL_REQUEST` can supply a code.

---

## Project layout (short)

| Area | Role |
|------|--------|
| `sidebar.html`, `src/sidebar/` | Sidebar shell, vault controller, dev debug panel |
| `src/onboarding/` | 19-state flow (`state.ts`, `render.ts`, `screens/`, …) |
| `src/crypto/vault.ts` | Encrypt/decrypt, `VAULT_STORAGE_KEY` |
| `src/cuny/ssoSite.ts` | **Single source of truth** for SSO URLs, DOM ids, timing |
| `src/content/` | Content script (IIFE root `content.ts`, flows, banner) |
| `src/background/service-worker.ts` | Auto-fill responses, onboarding staging, logout |
| `vite.config.ts` | Sidebar + background ES modules |
| `vite.content.config.ts` | Single-file `dist/content.js` (`inlineDynamicImports`) |
| `e2e/` | Playwright, fixtures, extension loader |

Deeper architecture, security, flows, TypeScript style, and testing conventions live under **`.agents/rules/`** (see `CLAUDE.md` in the repo root for the index).

---

## Commit messages

Use `<type>(<scope>): summary` (≤50 chars in the subject); body explains **why**, not what.
