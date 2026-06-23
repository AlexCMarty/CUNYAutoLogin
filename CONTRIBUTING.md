# Contributing to CUNYAutoLogin

Manifest V3 extension for **Chromium 141+** and **Firefox 140+** (see `src/manifest.json`). The sidebar stores an encrypted vault (**PBKDF2 + AES-GCM**), keeps the session master in **`browser.storage.session`**, and ships a content script on the CUNY SSO host that auto-fills login and TOTP when the vault is unlocked.

For product copy and install steps, see **[README.md](README.md)**. For cutting a release, see **[RELEASING.md](RELEASING.md)**. This file is for **contributors**: build, test, and where things live.

---

## Prerequisites

- **Node.js 22+** and npm (matches CI).
- **Git** with a clean working tree before you start (`git status`).

---

## First-time setup

```bash
npm ci
```

`npm ci` respects the lockfile and is what CI uses. Use `npm install` only when you intentionally change dependencies.

---

## Build and quality gates

**Lint is part of every full build.** Don't skip `npm run lint` locally — it runs with `--max-warnings 0` and must pass before merge (see `eslint.config.js`).

```bash
npm run lint          # ESLint on src/ + e2e/ (zero warnings enforced)
npm run typecheck     # tsc --noEmit only
npm run build         # lint → knip → tsc → Vite (sidebar + background) → Vite (content IIFE)
npm run build:dev     # Same pipeline, development mode + sidebar debug controls
npm run build:e2e     # build:dev + E2E manifest (local fixture origin)
npm run build:content # dist/content.js only
npm run watch         # vite --watch for sidebar/background (dev); content is NOT rebuilt — run `npm run build:content` after content changes
```

**Outputs** land in **`dist/`** — load that folder as an unpacked / temporary extension (see below).

| Script | What it does |
|--------|----------------|
| `npm run build` | Production: **lint**, **knip**, `tsc --noEmit`, Vite app bundle, second Vite pass for `content.js`, merged `dist/manifest.json`. |
| `npm run build:dev` | Dev build; sidebar adds **Send test FILL_CREDENTIALS** and **Clear vault — debug**. |
| `npm run build:e2e` | `build:dev` with `E2E_MANIFEST=1`, so Vite emits `src/manifest.e2e.json` into `dist/manifest.json` — that manifest adds `http://127.0.0.1:4173/*` to `host_permissions` and `content_scripts[0].matches` so Playwright fixtures load the content script. |
| `npm run build:content` | Rebuild only `dist/content.js` (single-file IIFE). |
| `npm run typecheck` | `tsc --noEmit` only. |

**CI** ([ci.yml](.github/workflows/ci.yml)) runs three jobs on every push / PR to `main`: lint + typecheck + `test:unit`; a production `build`; and `test:e2e`. Run **`npm run test`** locally before merging.

---

## Tests

```bash
npm run test:unit   # Vitest, no build required
npm run test:e2e    # build:e2e + Playwright (Chromium, extension from dist/)
npm run test        # unit, then e2e
```

- **Unit:** `src/**/*.test.ts` (see `vitest.config.ts`).
- **E2E:** specs under `e2e/`. **Firefox is not automated** — load `dist/` manually via `about:debugging` for Gecko coverage.

After changing **only** Playwright specs you can run `npx playwright test` (the config still starts the fixture server). Keep `dist/` in sync with a recent `npm run build:e2e` so `manifest.json` matches the E2E host permissions.

### Hunting flaky tests

`scripts/flake-finder.nu` (requires [Nushell](https://www.nushell.sh/), `nu`) reruns each suite many times to surface intermittent failures:

```bash
nu scripts/flake-finder.nu <e2e_runs> <unit_runs>   # e.g. 100 100
```

Results land under `flake-reports/<timestamp>/` (git-ignored): `transcript.log`, `summary.txt`, and per-failure `unit/` + `e2e/` logs. Exits non-zero if any iteration failed.

---

## CUNY page contract (`src/cuny/ssoSite.ts`)

**All** SSO host patterns, path markers, DOM ids, and timing constants must live in **`src/cuny/ssoSite.ts`**. Runtime code in `src/content/`, `src/background/`, and elsewhere **imports** from there — never duplicate drift-prone literals. The E2E fixture server (`e2e/fixtures-server.mjs`) mirrors those paths so local URLs behave like production.

One gotcha worth knowing: after **My authentication factors**, the Oracle SPA keeps the same URL while swapping views, so the content script detects the verify-OTP view by the presence of `RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID` in the DOM, not by URL. Unlock the vault before that field exists so `AUTO_FILL_REQUEST` can supply a code.

---

## Load unpacked (from `dist/`)

**Chrome / Chromium / Edge:** `chrome://extensions` → **Developer mode** on → **Load unpacked** → select `dist/`.

**Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `dist/manifest.json`.

Rebuild and reload after source changes.

---

## Sidebar screenshots (visual QA)

For sidebar-only visual QA without hitting live CUNY, build dev or e2e first (`#qa=` / `#onboarding=1` hashes are ignored in production), then capture:

```bash
npm run capture-sidebar -- '#qa=WELCOME'   # a single state
npm run capture-sidebar -- --capture-all   # every visual state, one PNG each
node scripts/capture-sidebar.mjs --help    # full state list + flags (--qa-vault-locked, --width/--height, …)
```

`scripts/capture-sidebar.mjs` (`ALL_STATES`) is the single source of truth for the state list — read it from `--help` rather than a copy kept here. PNGs write under `agent_screenshots/` (git-ignored); default viewport 380×800.

---

## Dev-only debug hooks

Both require a **dev build** (`npm run build:dev` / `build:e2e`) and are tree-shaken out of production:

- **Content-script logs** — `[CUNYAutoLogin]` lines appear in the page console on the CUNY SSO origin (gated by `import.meta.env.MODE === "production"` in `content.ts`).
- **`FILL_CREDENTIALS` test** — with a `ssologin` tab active and the vault unlocked, use **Send test FILL_CREDENTIALS to active tab** in the sidebar; the `content.ts` listener is removed in production.

---

## Don't break live users

The extension ships to installed users via store auto-update, so each of these is a breaking change:

- **`StoredVault` schema** — bump `StoredVault.version`, write a forward migration in `src/crypto/vault.ts`, and keep the previous decrypt path readable until the migration is proven. A vault you can read but can't re-encrypt is a lockout.
- **Crypto params** (PBKDF2 iterations, salt/IV lengths, KDF, cipher mode) are part of the on-disk format — changing them without a migration locks every existing user out. Key-stretch lazily on next unlock and re-write.
- **`cunyBiometricCredential` shape** must stay readable in its old form (`src/crypto/biometric.ts`); a silent fallback to password is acceptable, throwing on parse is not.
- **Message protocol** (`STAGE_ONBOARDING_CREDENTIALS`, `AUTO_FILL_REQUEST`, `ONBOARDING_*`, …) must stay backward compatible for one auto-update window — old content scripts talk to a freshly-updated service worker (and vice versa) for a few minutes after rollout.
- **Onboarding state / resume-snapshot changes** need a graceful path for snapshots written by the previous version — clear and route to a safe screen, don't hard-throw.

Storage lives in `storage.local` under two keys: **`cunyVault`** (encrypted `StoredVault`) and **`cunyBiometricCredential`** (AES-GCM-wrapped master + WebAuthn metadata, present only after biometric enrollment). Don't add new keys without a security review — see `.agents/rules/security.md`.

---

## Project layout

| Area | Role |
|------|--------|
| `sidebar.html`, `src/sidebar/` | Sidebar shell, vault controller, dev debug panel |
| `src/onboarding/` | 24-state flow (`state.ts`, `render.ts`, `screens/`, …) |
| `src/crypto/vault.ts` | Encrypt/decrypt, `VAULT_STORAGE_KEY` |
| `src/cuny/ssoSite.ts` | **Single source of truth** for SSO URLs, DOM ids, timing |
| `src/content/` | Content script (IIFE root `content.ts`, flows, banner) |
| `src/background/service-worker.ts` | Auto-fill responses, onboarding staging, logout |
| `e2e/` | Playwright, fixtures, extension loader |

Deeper architecture, security, flows, TypeScript style, and testing conventions live under **`.agents/rules/`** (indexed from `CLAUDE.md`).

---

## Working on the docs site

The marketing/docs site lives in `docs/` (Jekyll + just-the-docs) and deploys via [pages.yml](.github/workflows/pages.yml) on any push touching `docs/**`. Preview it locally with Docker — no host Ruby needed:

```bash
cd docs && docker compose up   # → http://localhost:4000, live-reloads on save
```

Asset regeneration (OG card, video poster), the design tokens the site borrows from the extension, and one-time GitHub Pages / DNS setup are documented in **`.agents/rules/website.md`**.

---

## Commits

`<type>(<scope>): summary` — ≤50-char subject; the body explains **why**, not what.

To ship a release, see **[RELEASING.md](RELEASING.md)**.
