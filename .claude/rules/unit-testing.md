---
description: Vitest unit testing conventions for src/**/*.test.ts files
globs: "src/**/*.test.ts"
alwaysApply: false
---

# Unit testing conventions

## Runner and location

Unit tests live **alongside source files** as `*.test.ts`. The runner is **Vitest** — no build step is required.

```bash
npm run test:unit   # vitest run
npm run test:watch  # vitest watch mode
```

`vitest.config.ts` at the repo root picks up all `src/**/*.test.ts` files.

**Current suites change frequently**; use the filesystem as the source of truth.
Run `rg --files src -g "*.test.ts"` if you need the current full list.

Stable high-level coverage areas:

- `src/crypto/*.test.ts` — vault encryption/decryption and parsing/tamper paths
- `src/cuny/*.test.ts` — URL/DOM constants and matcher contracts
- `src/sidebar/*.test.ts` — form helpers and vault UI behavior
- `src/vaultSession/*.test.ts` — setup/locked/unlocked snapshot branching
- `src/background/*.test.ts` — service-worker routing and staging behavior
- `src/runtime/*.test.ts` — shared runtime router guards/routing
- `src/content/*.test.ts` — content orchestrator + extracted flow/bridge modules
- `src/onboarding/*.test.ts` and `src/onboarding/screens/*.test.ts` — state machine, render bridge, per-screen DOM behavior

Prefer colocated `*.utils.ts` for testable logic when the main file is an IIFE or otherwise hard to import (`sidebar/sidebar.utils.ts`, `content.utils.ts`).

## Vitest environment

- **Node (default):** pure-logic suites (for example `vault.test.ts`, `ssoSite.test.ts`, `service-worker.test.ts`, `runtime/messageRouter.test.ts`, onboarding state/transition/message/controller tests).
- **jsdom:** Add `// @vitest-environment jsdom` as the **first line** of any file that needs `document` / DOM APIs (for example `sidebar.utils.test.ts`, `content.test.ts`, `onboarding/beadHeader.test.ts`, `onboarding/render.test.ts`, and files under `onboarding/screens/`).

## Mocking `webextension-polyfill`

Many suites mock `webextension-polyfill` with `vi.mock("webextension-polyfill", () => ({ default: { … } }))` so `browser.storage` / `browser.runtime` are in-memory fakes. Keep those mocks local to each suite and reset between tests.

For `service-worker.test.ts`, the module under test registers `onMessage` at import time — use `beforeAll(async () => { await import("./service-worker"); … })` and read the listener from `vi.mocked(browser.runtime.onMessage.addListener).mock.calls`.

Reset mock state in `beforeEach` / `afterEach` as appropriate so one test cannot rely on another test's call history.

## Result unwrapping

**Never** use `_unsafeUnwrap()` or `_unsafeUnwrapErr()` directly in test assertions. When a test fails, these throw an opaque `UnsafeUnwrapError` with no indication of the actual value. Define `unwrap` / `unwrapErr` helpers in each test file:

```typescript
function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok, got err(${JSON.stringify(result.error)})`);
  return result.value;
}

function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.isOk()) throw new Error(`Expected Err, got ok(${JSON.stringify(result.value)})`);
  return result.error;
}
```

Failures then read `Expected Ok, got err("decrypt_failed")` — immediately actionable.

## Bypassing serialisation to test parsing branches

When a function both serialises and parses (e.g. `encryptVault` JSON-encodes, `decryptVault` JSON-decodes), test the parsing error branches with a raw helper that writes **arbitrary bytes** into the encrypted blob, bypassing the production serialisation path. This keeps the two branches independently exercised and ensures the parser is tested against genuinely malformed input.

See `encryptRaw` in `src/crypto/vault.test.ts` for the pattern. If you duplicate private constants from the source file (salt length, IV length, key bits), add a comment noting that the helper must be updated if those constants change.

## Shared setup in describe blocks

Use `beforeEach` + a `let` variable when multiple tests in the same `describe` block need the same freshly-created value. Do not repeat the setup call in every test body.

```typescript
describe("tampered StoredVault → decrypt_failed", () => {
  let stored: StoredVault;
  beforeEach(async () => {
    stored = unwrap(await encryptVault(PAYLOAD, MASTER));
  });
  // each test mutates a spread of `stored` without re-encrypting
});
```

## Mocking WebCrypto

Use `vi.spyOn(globalThis.crypto.subtle, "deriveKey").mockRejectedValueOnce(...)` to force crypto failures. Always pair with `afterEach(() => vi.restoreAllMocks())` so spies don't bleed between tests.

## Pure-function modules

Modules that export only pure string/boolean functions (e.g. `ssoSite.ts`) need no mocking, no `beforeEach`, and no async setup. Use flat `describe` blocks with inline inputs — see `src/cuny/ssoSite.test.ts` as the reference.

Always include a `constants` describe block that pins the literal values of exported strings/arrays that the rest of the extension depends on. A typo in a constant breaks autofill silently; a pinned assertion catches it immediately.

## Test naming

Same rule as E2E: plain sentences describing observable behavior, no "should":

```typescript
// Good
test("wrong master password returns decrypt_failed", async () => { ... });
test("missing totpSecret field returns invalid_payload", async () => { ... });
test("URL contains /oaa-totp-factor/ → true", () => { ... });
```
