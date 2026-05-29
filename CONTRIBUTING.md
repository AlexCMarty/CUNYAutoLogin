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

The [ci workflow](.github/workflows/ci.yml) runs lint, type-checking, **`npm run test:unit`**, and **`npm run test:e2e`** on every push and PR to `main`. The [release workflow](.github/workflows/release.yml) also runs **`npm run test:unit`** and **`npm run test:e2e`** before **`npm run build`** on every version tag. Run **`npm run test`** locally before merging.

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

For **sidebar-only** visual QA (layout, `#qa=<STATE>`, vault modes, etc.) without hitting live CUNY:

1. `npm run build:e2e` (or `build:dev` — `#qa=` / `#onboarding=1` hashes are ignored in **production** bundles; see `src/sidebar/sidebar.ts`)
2. Pick a capture command (see below).

Writes under `agent_screenshots/` (gitignored); prints one **absolute PNG path** per line on stdout. Default viewport **380×800**; override with `--width` / `--height`. See `node scripts/capture-sidebar.mjs --help` and [`e2e/extension-fixture.ts`](e2e/extension-fixture.ts) for the same Chromium load-extension approach.

### All 22 visual states

| # | Command | Notes |
|---|---|---|
| 1 | `npm run capture-sidebar -- '#qa=WELCOME'` | |
| 2 | `npm run capture-sidebar -- '#qa=EMAIL_ENTRY'` | |
| 3 | `npm run capture-sidebar -- '#qa=EMAIL_ENTRY&qaCred=email'` | credential error on email field |
| 4 | `npm run capture-sidebar -- '#qa=PASSWORD_ENTRY'` | |
| 5 | `npm run capture-sidebar -- '#qa=PASSWORD_ENTRY&qaCred=password'` | credential error on password field |
| 6 | `npm run capture-sidebar -- '#qa=OPENING_CUNY'` | |
| 7 | `npm run capture-sidebar -- '#qa=CUNY_TOTP'` | |
| 8 | `npm run capture-sidebar -- '#qa=ALLOW_GATE'` | |
| 9 | `npm run capture-sidebar -- '#qa=OAA_SPA_HOME'` | |
| 10 | `npm run capture-sidebar -- '#qa=GUIDED_MANAGE'` | |
| 11 | `npm run capture-sidebar -- '#qa=GUIDED_ADD_FACTOR'` | |
| 12 | `npm run capture-sidebar -- '#qa=GUIDED_FACTOR_TYPE'` | |
| 13 | `npm run capture-sidebar -- '#qa=GUIDED_SECRET_CAPTURE'` | |
| 14 | `npm run capture-sidebar -- '#qa=VERIFY_LOGIN_CODE'` | |
| 15 | `npm run capture-sidebar -- '#qa=SET_DEFAULT'` | |
| 16 | `npm run capture-sidebar -- '#qa=EXT_PASSWORD_SETUP'` | |
| 17 | `npm run capture-sidebar -- '#qa=BIOMETRIC_OFFER'` | |
| 18 | `npm run capture-sidebar -- '#qa=BIOMETRIC_PREP'` | |
| 19 | `npm run capture-sidebar -- '#qa=COMPLETE_DEMO'` | |
| 20 | `npm run capture-sidebar -- '#qa=COMPLETE_DONE'` | |
| 21 | `npm run capture-sidebar -- --qa-vault-locked` | vault locked UI |
| 22 | `npm run capture-sidebar -- --qa-vault-unlocked` | vault unlocked / management UI |

`CREDENTIAL_ERROR` has no screen mount by design; use `qaCred=email` / `qaCred=password` variants (rows 3 and 5) to capture its visual representation.

To capture all 22 states in one command:

```bash
npm run capture-sidebar -- --capture-all
```

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

## Releases

The release pipeline has **three stages**, only the last of which reaches real users:

1. **Tag a version on GitHub** — `npm run test`, then `scripts/bump-version.sh <major|minor|patch|x.y.z>` (updates `package.json`, `src/manifest.json`, `src/manifest.e2e.json`, and `package-lock.json` in one shot). Commit the bump, then tag **`vX.Y.Z`** matching that version and push the tag. The release workflow zips `dist/` as `CUNYAutoLogin-<tag>.zip`. Tags containing `beta` or `rc` become GitHub **prereleases**.
2. **Upload to the Chrome Web Store** — `npm run build` locally, zip `dist/`, and **manually upload that zip to the Chrome Web Store developer dashboard**. Review currently takes about a day. Until that review completes and the listing is republished, the new version is **not** in users' hands. (AMO listing is pending its initial review; once published, a parallel upload step there will be needed for each release.)
3. **Chrome auto-update propagates** — within a few hours of CWS publishing, installed Chrome / Edge browsers pick up the new version automatically. No user action required.

**What this means for "is my change live?":** Only the **last tagged version that has cleared CWS review** is what users are running (run `git tag --sort=-v:refname | head -1` for the current latest tag, and confirm against the CWS listing that this tag has actually been uploaded and published, not just cut locally). A merged commit on `main`, or even a fresh tag that hasn't been uploaded and approved yet, is not yet shipping. Do not assume in-progress work has reached users — and conversely, once you've uploaded a release zip, treat it as effectively unrecallable, because auto-update is fast and unconditional.

**GitHub-only installers:** download the release zip, unzip so `manifest.json` is at the top level, then load unpacked / temporary add-on as above. This path is documented in [README.md](README.md) for Firefox users (AMO review pending) and for anyone who wants to try a pre-release before CWS approves it.

---

## Storage (`storage.local`)

- **`cunyVault`** — encrypted `StoredVault` (see `src/crypto/vault.ts`).
- **`cunyBiometricCredential`** — AES-GCM-wrapped master password + WebAuthn credential metadata for biometric unlock (see `src/crypto/biometric.ts`). Present only when the user completes biometric enrollment.

Do not add new `storage.local` keys without a security review (see `.agents/rules/security.md`).

---

## Backward compatibility (we have live users now)

The extension is **live on the [Chrome Web Store](https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin)** and ships to installed users via Chrome auto-update. The Firefox AMO listing is **pending review**. Real installs mean:

- **`StoredVault` schema changes are breaking changes.** Bump `StoredVault.version`, write a forward migration in `src/crypto/vault.ts`, and keep the previous decrypt path readable until the migration is proven. A vault you can read but can’t re-encrypt is a lockout.
- **Crypto parameters (PBKDF2 iterations, salt/IV lengths, KDF, cipher mode) are part of the on-disk format.** Changing them without a migration locks every existing user out. If you must raise iterations, key-stretch lazily on next unlock and re-write.
- **`cunyBiometricCredential` shape changes** must keep the old shape readable; a broken biometric unlock that silently falls back to password is acceptable, but throwing on parse is not.
- **Message protocol (`STAGE_ONBOARDING_CREDENTIALS`, `AUTO_FILL_REQUEST`, `ONBOARDING_*`, etc.) must stay backward compatible** for the duration of one auto-update window — old content scripts can talk to a freshly-updated service worker (and vice versa) for a few minutes after rollout.
- **Removed onboarding states / resume-snapshot shape changes** need a graceful path for snapshots written by the previous version. Don’t hard-throw; clear the snapshot and route to a safe screen.

When in doubt: add the version field, leave the old reader in place for one release, and verify by loading an old `dist/` vault into a freshly-built extension before merging.

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
| `src/cuny/openTabAfterOaaLogout.ts` | OAA logout tab sequence for Screen 4 and SSO reopen (wait for `Logout.jsp`) |
| `vite.config.ts` | Sidebar + background ES modules |
| `vite.content.config.ts` | Single-file `dist/content.js` (`inlineDynamicImports`) |
| `e2e/` | Playwright, fixtures, extension loader |

Deeper architecture, security, flows, TypeScript style, and testing conventions live under **`.agents/rules/`** (see `CLAUDE.md` in the repo root for the index).

---

## Commit messages

Use `<type>(<scope>): summary` (≤50 chars in the subject); body explains **why**, not what.
