---
name: fill-test-gaps
description: >
  Audits the CUNYAutoLogin unit and E2E test suite for coverage gaps, then automatically writes the missing tests and verifies the suite still passes. Use this skill whenever the user wants to improve test coverage, fill in missing tests, audit the test suite, or says anything like "what tests are missing", "add missing tests", "fill in test gaps", "write tests for untested code", "check test coverage", "inspect my tests", "find gaps in my tests", or "improve coverage". Spawns parallel Sonnet subagents — one per logical domain — that each deeply inspect their area and write new tests, then runs the full suite to verify. Invoke proactively whenever any test-related task would benefit from a full gap sweep.
triggers:
  - fill test gaps
  - add missing tests
  - audit test coverage
  - inspect tests
  - write missing tests
  - improve test coverage
  - find gaps in tests
---

# Fill Test Gaps

Performs a full test suite audit and automatically writes the missing tests, using parallel Sonnet subagents (one per logical codebase domain), then runs the suite to verify.

## Project quick-reference (CUNYAutoLogin)

**Unit tests:** Vitest — `src/**/*.test.ts` alongside source files. Run with `npm run test:unit`.
**E2E tests:** Playwright (Chromium only) — `e2e/*.spec.ts`. Run with `npm run test:e2e` (triggers `build:e2e` first).
**Full suite:** `npm run test` (unit + E2E).
**Config:** `vitest.config.ts`, `playwright.config.ts`.

**Established domains and their test files:**

| Domain | Source | Test file(s) |
|--------|--------|--------------|
| Crypto / vault | `src/crypto/` | `vault.test.ts`, `biometric.test.ts` |
| Content scripts | `src/content/` | `content.test.ts`, `credentialFlow.test.ts`, `totpLoginFlow.test.ts`, `totpEnrollSecretBridge.test.ts`, `mfaEnrollVerifyFlow.test.ts`, `ruiSpaView.test.ts`, `overlayBridge.test.ts`, `overlay.test.ts`, `banner.test.ts`, `domWait.test.ts`, `content.utils.test.ts` |
| Onboarding state machine | `src/onboarding/` | `state.test.ts`, `transitions.test.ts`, `controller.test.ts`, `render.test.ts`, `messages.test.ts`, `screenMounts.test.ts`, `beadHeader.test.ts`, `beadViewModel.test.ts`, `resumeSession.test.ts`, `devModes.test.ts`, `devQaJump.test.ts` |
| Background / runtime | `src/background/`, `src/runtime/` | `service-worker.test.ts`, `messageRouter.test.ts` |
| Sidebar | `src/sidebar/` | `sidebar.utils.test.ts`, `passwordToggleLabels.test.ts` |
| CUNY site constants | `src/cuny/` | `ssoSite.test.ts` |
| Vault session | `src/vaultSession/` | `snapshot.test.ts` |

## Phase 1: Orient (inline, before spawning agents)

Always read `.agents/rules/unit-testing.md` and `.agents/rules/e2e-testing.md` before dispatching agents — they are the authoritative spec for what "good tests" looks like here. Then:

1. Run `find src -name "*.test.ts" | sort` and `ls e2e/*.spec.ts` to confirm current file list (it may have grown since this skill was written).
2. Run `find src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" | sort` to see the full source surface.
3. Read 2–3 representative test files to internalize current mocking and assertion style.
4. Note which source files have **no corresponding test file** — these are the highest-priority gaps.

Output a brief map before spawning:
- Unit test file count | E2E spec count
- Source files with zero coverage (entire modules or individual files)
- Any security-critical paths (crypto, storage, credential flow) without tests — flag these as CRITICAL

## Phase 2: Spawn parallel inspection agents

Spawn one Sonnet subagent per domain, **all in the same turn**. Each agent both identifies gaps and writes the tests to fill them. Use the domain table above to assign files. Pass the full prompt below — don't abbreviate it.

**Prompt template for each agent:**

```
You are auditing and filling test gaps for the **[DOMAIN]** domain of the CUNYAutoLogin browser extension.

## Project context
MV3 extension (Firefox 128+ / Chromium 141+). Uses `webextension-polyfill` — all browser APIs go through `browser.*`, never `chrome.*`. Core flows: PBKDF2+AES-GCM vault, 19-state onboarding FSM, content-script auto-fill on ssologin.cuny.edu.

## Testing conventions (internalize before writing a single line)

### Runner and location
Vitest. Unit tests live alongside source as `*.test.ts`. No build step needed — `npm run test:unit`.

### Vitest environment
- **Node (default):** pure-logic suites (vault, ssoSite, service-worker, runtime/messageRouter, onboarding state/transitions/messages/controller).
- **jsdom:** Add `// @vitest-environment jsdom` as the **first line** of any file that needs `document` or DOM APIs (sidebar.utils, content, onboarding/beadHeader, onboarding/render, onboarding/screens/*).

### Mocking webextension-polyfill
```typescript
vi.mock("webextension-polyfill", () => ({ default: { … } }))
```
Keep mocks local to each suite. Reset between tests. Never import `chrome.*`.

### service-worker.test.ts special case
The module registers `onMessage` at import time. Use:
```typescript
beforeAll(async () => { await import("./service-worker"); })
```
Then read the listener from `vi.mocked(browser.runtime.onMessage.addListener).mock.calls`.

### Result types (neverthrow)
Never use `_unsafeUnwrap()` or `_unsafeUnwrapErr()`. Import from `src/testUtils/resultUnwrap`:
```typescript
import { unwrap, unwrapErr } from "../testUtils/resultUnwrap";
```
Or define inline if the import would be cross-domain awkward:
```typescript
function unwrap<T, E>(r: Result<T, E>): T {
  if (r.isErr()) throw new Error(`Expected Ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}
```

### Console guard
No bare `console.log`/`console.debug`. If a source file guards with `if (import.meta.env.MODE !== "production")`, tests can spy on console but must not call it unconditionally.

### E2E conventions (Playwright)
- Chromium only — no Firefox E2E.
- `npm run test:e2e` triggers `build:e2e` first; never skip the build.
- Import DOM IDs from `src/cuny/ssoSite.ts`, never hardcode selectors.
- Shared helpers: `setupVault`, `clearVaultIfPossible`, `lockVault`, `walkToPasswordEntry` from `e2e/helpers.ts`.
- WebAuthn tests need `addVirtualPlatformAuthenticator(page)` from `e2e/webauthnVirtualAuthenticator.ts`; call `.remove()` in `afterEach`.
- Fixture URLs exported from `e2e/constants.ts` only — never constructed inline.
- Test names: plain sentences, no "should". Assert observable DOM/storage state, not internal module variables.

## Test framework
- Unit: Vitest — `npm run test:unit`
- E2E: Playwright — `npm run test:e2e`
- Full: `npm run test`

## Source files in this domain
[File path + one-line description of what each does]

## Existing test files for this domain
[File paths, or "none"]

## Existing test style reference — match this exactly
[Paste 20–40 lines from a representative test file in this domain, including imports, mock setup, and at least one full describe/it block]

---

## Your task

1. Read each source file listed above.
2. Read each existing test file listed above.
3. Identify every meaningful coverage gap:
   - Functions or methods with no test at all
   - Untested branches (if/else, switch cases, early returns, catch blocks)
   - Missing edge cases (empty input, null/undefined, boundary values, concurrent calls)
   - Untested error scenarios (rejected promises, invalid state, dependency failures)
   - Security-critical paths (crypto ops, credential storage, master-password handling) — treat these as CRITICAL even if partially covered
4. Write complete, runnable tests for every gap. Follow conventions exactly — same import paths, same mock patterns, same assertion style, same describe/it nesting.
5. Return your output using this structure:

### Gap Summary
| Severity | Location | Description |
|----------|----------|-------------|
| CRITICAL | path:line | Core crypto / security / credential path with no coverage |
| HIGH     | path:line | Common user path or important error handling untested |
| MEDIUM   | path:line | Edge case or non-critical path missing |
| LOW      | path:line | Minor edge case or test quality improvement |

### New Test Code

**Target file: [path/to/existing-or-new.test.ts]**
```typescript
// [Brief description of what this block covers]
[Complete, runnable test code — no TODOs, no stubs]
```

If this domain has no meaningful gaps, say so in one sentence and stop.
```

## Phase 3: Apply tests, verify, and report

Once all agents return:

1. **Collect all new test code** — parse the "New Test Code" sections from each agent's output.

2. **Write to files** — append new tests to existing test files (adding a blank line before the new block), or create a new `*.test.ts` alongside the source file if none exists. Add `// @vitest-environment jsdom` as the first line for any new file that needs DOM APIs.

3. **Run unit tests** — `npm run test:unit`. If tests fail:
   - Fix mechanical issues: wrong import paths, missing `vi.mock` calls, incorrect mock signatures, missing `// @vitest-environment jsdom` directive
   - Re-run once after fixes
   - If still failing, note the failure in the report rather than chasing it further

4. **Run E2E tests** — only if new E2E spec code was written.

5. **Run lint** — `npm run lint`. New test code must pass ESLint with zero warnings (`--max-warnings 0` is enforced). Fix any `no-console`, `id-length`, or import-order violations before reporting done.

6. **Output the final report:**

```
# Test Gap Audit — Complete

## Summary
- Domains inspected: N
- Gaps found: N total (CRITICAL: N | HIGH: N | MEDIUM: N | LOW: N)
- New tests written: N tests across N files
- Suite status: ✓ all passing / ✗ N failures remaining
- Lint: ✓ clean / ✗ N warnings

## What Was Added
[Per domain — one or two lines: which file(s) were modified or created, how many tests, what they cover]

## Failures (if any)
[Paste the failure message with file:line; explain the likely cause in one line each]

## Gaps Not Auto-Filled
[Anything requiring real browser crypto, manual E2E setup, or live CUNY SSO — brief explanation per item]
```
