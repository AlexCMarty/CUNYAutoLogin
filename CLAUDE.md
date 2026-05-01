# CUNYAutoLogin

MV3 browser extension (Firefox + Chromium): encrypts CUNY credentials in `storage.local` via PBKDF2 + AES-GCM, auto-fills `ssologin.cuny.edu` via content script, guides students through an 18-state onboarding flow.

## Hard rules — never violate

- `browser.*` only — `import browser from "webextension-polyfill"`, never `chrome.*`
- Master password never in `storage.local` or logs — `browser.storage.session` only
- Saved email must end with `@login.cuny.edu` (enforced in `sidebar/sidebar.utils.ts`)
- All CUNY page constants (selectors, URL paths, timing) go in `src/cuny/ssoSite.ts` only
- Content script must stay a single IIFE — never add ESM imports to `src/content/`
- No `console.log`/`console.debug` outside `if (import.meta.env.DEV)` guards
- No single-letter variable names (enforced by `id-length` in `eslint.config.js`)
- `void promise` must chain `.catch()` — never wrap in `try/catch`
- `npm run lint` must pass zero errors and zero warnings before any merge

## Build

```bash
npm run lint        # must pass before build/merge
npm run build       # production (lint → tsc → vite build → vite content)
npm run build:dev   # development (sidebar includes debug panel)
npm run build:e2e   # dev + manifest.e2e.json for Playwright
npm run test        # unit + e2e
npm run test:unit   # vitest run (no build step needed)
npm run test:e2e    # build:e2e + playwright
npm run typecheck   # tsc --noEmit
```

## Git

Always run `git status` before writing code — never start on uncommitted changes you don't know about.

Commit format: `<type>(<scope>): short summary (≤50 chars)` — body explains *why*, not what.

## Documentation

`README.md` is for Github. Technical docs go in `CONTRIBUTING.md` or inline comments, not README.

## Domain rules — load when relevant

- Project layout, file tree, key modules → `.agents/rules/overview.md`
- Security details, crypto params, storage invariants → `.agents/rules/security.md`
- Session unlock, auto-fill, TOTP enroll, onboarding flows → `.agents/rules/flows.md`
- TypeScript style, naming, neverthrow, async patterns → `.agents/rules/typescript.md`
- Writing or running unit tests (`src/**/*.test.ts`) → `.agents/rules/unit-testing.md`
- Writing or running E2E tests (`e2e/`) → `.agents/rules/e2e-testing.md`
- Prime directives, pre-merge quality checklist → `.agents/rules/code-quality.md`
