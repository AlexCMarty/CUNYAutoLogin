<!-- Load when: writing or running unit tests in src/**/*.test.ts -->

# Unit testing conventions

## Runner and location

Unit tests live alongside source files as `*.test.ts`. Runner is **Vitest** — no build step needed.

```bash
npm run test:unit   # vitest run
npm run test:watch  # vitest watch mode
```

`vitest.config.ts` picks up all `src/**/*.test.ts`. Use the filesystem as source of truth for current suites: `rg --files src -g "*.test.ts"`.

## Vitest environment

- **Node (default):** pure-logic suites (`vault.test.ts`, `ssoSite.test.ts`, `service-worker.test.ts`, `runtime/messageRouter.test.ts`, onboarding state/transition/message/controller tests).
- **jsdom:** Add `// @vitest-environment jsdom` as the **first line** of files that need `document` / DOM APIs (`sidebar.utils.test.ts`, `content.test.ts`, `onboarding/beadHeader.test.ts`, `onboarding/render.test.ts`, files under `onboarding/screens/`).

## Mocking `webextension-polyfill`

```typescript
vi.mock("webextension-polyfill", () => ({ default: { … } }))
```

Keep mocks local to each suite. Reset between tests.

For `service-worker.test.ts` — the module registers `onMessage` at import time. Use `beforeAll(async () => { await import("./service-worker"); })` and read the listener from `vi.mocked(browser.runtime.onMessage.addListener).mock.calls`.

## Result unwrapping

Never use `_unsafeUnwrap()` or `_unsafeUnwrapErr()`. Define helpers in each test file:

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

## Bypassing serialisation for parsing branches

Test parsing error branches with a raw helper that writes arbitrary bytes into the encrypted blob, bypassing the production serialisation path. See `encryptRaw` in `src/crypto/vault.test.ts`.

## Shared setup in describe blocks

```typescript
describe("tampered StoredVault → decrypt_failed", () => {
  let stored: StoredVault;
  beforeEach(async () => {
    stored = unwrap(await encryptVault(PAYLOAD, MASTER));
  });
  // tests mutate a spread of `stored`
});
```

## Mocking WebCrypto

```typescript
vi.spyOn(globalThis.crypto.subtle, "deriveKey").mockRejectedValueOnce(...)
afterEach(() => vi.restoreAllMocks())
```

## Pure-function modules

No mocking, no `beforeEach`, no async setup. Flat `describe` blocks with inline inputs. Always include a `constants` describe block that pins literal values of exported strings/arrays — a typo in a constant breaks autofill silently.

## Test naming

Plain sentences, no "should":

```typescript
test("wrong master password returns decrypt_failed", async () => { ... });
test("URL contains /oaa-totp-factor/ → true", () => { ... });
```
