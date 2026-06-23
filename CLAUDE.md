# CUNYAutoLogin

MV3 browser extension (Firefox + Chromium): encrypts CUNY credentials in `storage.local` via PBKDF2 + AES-GCM, auto-fills `ssologin.cuny.edu` via content script, guides students through a 24-state onboarding flow.

## Hard rules — never violate

- `browser.*` only — `import browser from "webextension-polyfill"`, never `chrome.*`
- Master password never in `storage.local` or logs — `browser.storage.session` only
- Saved email must end with `@login.cuny.edu` (vault: `sidebar/sidebar.utils.ts`; onboarding: `emailEntry.ts`)
- All CUNY page constants (selectors, URL paths, timing) go in `src/cuny/ssoSite.ts` only
- Content script must stay a single IIFE — never add ESM imports to `src/content/`
- No `console.log`/`console.debug` outside a dev-mode guard. Use `if (import.meta.env.MODE !== "production")` — **not** `if (import.meta.env.DEV)`, which reflects the Vite mode at build time (`true` in `build:dev`, `false` in `build`) and therefore does not reliably gate production-only exclusions across all build targets. See `.agents/rules/biometrics.md` § "The `import.meta.env.DEV` trap".
- **Lint:** `npm run lint` runs ESLint with `--max-warnings 0` (covers `id-length`, `no-console`, etc.); must pass with zero errors and zero warnings before merge
- Do NOT assume completion just because unit tests pass. Run full `npm run test`.
- **Minimum browsers** (see `src/manifest.json`): Firefox **140+** (`strict_min_version`), Chromium **141+** (`minimum_chrome_version`). Do not document or relax below these without updating the manifest and fallbacks.

## Build

```bash
npm run lint        # must pass before build/merge
npm run build       # production (lint → knip → tsc → vite build → vite content)
npm run build:dev   # development (sidebar includes debug panel)
npm run build:e2e   # dev + manifest.e2e.json for Playwright
npm run test        # unit + e2e
npm run test:unit   # vitest run (no build step needed)
npm run test:e2e    # build:e2e + playwright
npm run capture-sidebar -- '#qa=WELCOME'       # onboarding state → PNG path on stdout (after build:e2e or build:dev); 380×800 default; --width/--height optional
npm run capture-sidebar -- --qa-vault-locked   # vault locked UI
npm run capture-sidebar -- --qa-vault-unlocked # vault unlocked / management UI
npm run capture-sidebar -- --capture-all       # all visual states, one PNG each (needs build:e2e or build:dev — production ignores #qa= hashes)
# Credential-error variants: &qaCred=email on EMAIL_ENTRY, &qaCred=password on PASSWORD_ENTRY
# Advanced key-flow states: CHOOSE_SETUP_PATH, KEY_FROM_OTHER_DEVICE, KEY_FROM_AUTH_APP, TEST_LOGIN, TEST_LOGIN_BAD_CREDENTIALS, TEST_LOGIN_BAD_KEY; &qaVariant=open|valid (KEY_FROM_*), &qaVariant=success (TEST_LOGIN)
npm run typecheck   # tsc --noEmit
```

## Git

Always run `git status` before writing code — never start on uncommitted changes you don't know about.

Commit format: `<type>(<scope>): short summary (≤50 chars)` — body explains *why*, not what.

## Documentation

`README.md` is GitHub-facing (product copy + install) — keep technical depth out of it. Contributor build/test/layout → `CONTRIBUTING.md`; release/publish → `RELEASING.md`; deep architecture, security, flows → `.agents/rules/*` (below); fine detail → inline comments.

## Domain rules — load when relevant

- Project layout, file tree, key modules → `.agents/rules/overview.md`
- Security details, crypto params, storage invariants → `.agents/rules/security.md`
- Session unlock, auto-fill, TOTP enroll, onboarding flows → `.agents/rules/flows.md`
- TypeScript style, naming, neverthrow, async patterns → `.agents/rules/typescript.md`
- Writing or running unit tests (`src/**/*.test.ts`) → `.agents/rules/unit-testing.md`
- Writing or running E2E tests (`e2e/`) → `.agents/rules/e2e-testing.md`
- Prime directives, pre-merge quality checklist → `.agents/rules/code-quality.md`
- WebAuthn PRF enrollment/unlock, OS/browser minimums, fallback rules, known pitfalls → `.agents/rules/biometrics.md`
- Marketing/docs website (`docs/`), GitHub Pages deploy, marketing screenshots → `.agents/rules/website.md`

