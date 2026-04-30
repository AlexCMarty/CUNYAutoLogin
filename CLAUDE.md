# CUNYAutoLogin — Claude Code guidance

## What this project is

A Manifest V3 browser extension (Firefox + Chromium) that:

1. Stores CUNY login credentials (email, password, TOTP secret) encrypted in `browser.storage.local` using PBKDF2 + AES-GCM.
2. Keeps the vault unlocked across side panel opens for the lifetime of the browser session using `browser.storage.session`.
3. Injects a content script on `https://ssologin.cuny.edu/*` that auto-fills the Oracle SSO login and TOTP pages when the vault session is valid.
4. Guides a first-time student through a 19-screen onboarding flow.

Saved email must end with **`@login.cuny.edu`** (enforced in `sidebar.ts` / `sidebar/sidebar.utils.ts`).

## Rule files

Detailed guidance lives in `.cursor/rules/`. Run `nu sync.nu` after editing any rule file — it
copies `.cursor/rules/*.mdc` → `.claude/rules/*.md` for Claude Code.
**Never edit `.claude/rules/` directly.**

| Rule file | `alwaysApply` | Covers |
|---|---|---|
| `cunyautologin-overview.mdc` | true | Project layout, build, loading, dependencies |
| `security-crypto-gotchas.mdc` | true | Security invariants, crypto params, key gotchas |
| `flows-vault-and-autofill.mdc` | true | Session unlock, auto-fill, TOTP enroll, onboarding bridge |
| `code-quality.mdc` | true | Prime directives, pre-merge checklist |
| `typescript-style.mdc` | false (`**/*.ts`) | TS conventions, neverthrow, naming, comments |
| `unit-testing.mdc` | false (`src/**/*.test.ts`) | Vitest unit test conventions |
| `testing.mdc` | false (`e2e/**`) | Playwright E2E test conventions |

## Current state

The onboarding flow (all 19 screens fully implemented, plans 1–12 merged) ships via
`onboarding/render.ts`. Post-onboarding vault management lives in `sidebar/vaultController.ts`.
The URL hash `#onboarding=1` is a dev/e2e-only escape hatch; `#vault=1` forces the vault setup
form on an empty profile (e2e only).

## Build commands

```bash
npm install
npm run build          # production: tsc --noEmit → vite build → vite content
npm run build:dev      # development mode; sidebar includes debug panel
npm run build:e2e      # dev build with manifest.e2e.json (required before E2E tests)
npm run build:content  # rebuild only the content script
npm run watch          # vite build --watch --mode development
npm run typecheck      # tsc --noEmit only
npm run test:unit      # vitest run (no build step needed)
npm run test:e2e       # build:e2e then playwright test
```

The two-step Vite build is intentional: `vite.config.ts` bundles the sidebar and background as
ES modules; `vite.content.config.ts` produces a single-file IIFE with `inlineDynamicImports` —
required for reliable MV3 content script injection and to ship `totp-generator` + `neverthrow`
inside the content bundle.

## Loading the extension

**Firefox:** `about:debugging` → Load Temporary Add-on → select `dist/manifest.json`
**Chrome/Chromium:** `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

Rebuild and reload the extension after any source change.

## Runtime dependencies

- `webextension-polyfill` — unified `browser` API (never use `chrome.*` directly)
- `neverthrow` — `Result` / `ResultAsync` / `ok` / `err` in `vault.ts`, `sidebar.ts`, `content.ts`
- `totp-generator` — TOTP codes in the content script (bundled into the content IIFE)

## Documentation

`README.md` is oriented toward less technically inclined college students. Put technical
documentation in `CONTRIBUTING.md` or inline comments, not the README.
