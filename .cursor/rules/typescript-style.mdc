---
description: TypeScript, neverthrow, naming, structure, and comment conventions for src and Vite configs
globs: "**/*.ts"
alwaysApply: false
---

# TypeScript code style

## Syntax basics

- Strongly prefer arrow functions
- No `any` types — use precise union types or generics
- Named exports by default; config entrypoints may use default exports when required by tooling (`vite.config.ts`, `vite.content.config.ts`, `vitest.config.ts`, `playwright.config.ts`)
- `async`/`await` only; no `.then()` — enforced by ESLint (`eslint.config.js`)
- Avoid `throw`. Use neverthrow to return `Result` / `ResultAsync` where practical. A `throw` **requires** a comment explaining why neverthrow was unsuitable here.
- Always maintain the same level of security as a password manager

## Naming

Functions and variables should announce their purpose without needing a comment. If a name alone does not tell the full story, the name is wrong.

```typescript
// Bad
const el = document.getElementById("CUNYLoginUsernameDisplay");
async function handleMsg(m: unknown) { ... }

// Good
const usernameInput = document.getElementById("CUNYLoginUsernameDisplay");
async function handleAutoFillRequest(message: unknown) { ... }
```

Concrete naming patterns used in this codebase:
- Predicates: `matchesCredentialPage`, `matchesTotpPage`, `isStoredVault` — not `check`, `test`, `verify`
- Waiters: `waitForInputById`, `waitForEnrollTotpSecret` — not `getEl`, `findInput`
- Error strings in unions: lowercase snake case — `"decrypt_failed"`, `"no_session_master"`, `"crypto_failed"`

## Function size and responsibility

A function does one thing. If you need "and" to describe it, split it.

```typescript
// Bad — two concerns in one function
async function decryptAndFillCredentials(...) { ... }

// Good — each function owns exactly one concern
async function decryptVault(...): ResultAsync<VaultPayload, VaultError> { ... }
async function fillCredentials(email: string, password: string): Promise<Result<true, string>> { ... }
```

Aim for 20–40 lines per function. Hard cap: 80 lines unless the logic is genuinely sequential and extracting it would obscure the flow. `fillCredentials` and `fillTotp` in `content.ts` are good-length references.

## Early returns over nesting

Every nesting level is a tax on the reader's working memory. Fail fast.

```typescript
// Bad — reader must track two levels of context
async function autoFill() {
  const response = await sendMessage(...);
  if (response.success) {
    if (response.payload.email) {
      await main(response.payload);
    }
  }
}

// Good — happy path is obvious
async function autoFill() {
  const response = await sendMessage(...);
  if (!response.success) { log("autoFill:", response.reason); return; }
  await main(response.payload);
}
```

## Comments — explain the constraint, not the operation

The code shows *what*. Comments explain *why this approach* was chosen, or what non-obvious constraint forced this decision.

```typescript
// Bad — restates the code
// Dispatch input and change events
el.dispatchEvent(new Event('input', { bubbles: true }));

// Good — explains the constraint
// A plain `.value =` assignment bypasses Oracle JET's Knockout.js bindings.
// We use the native prototype setter + synthetic events so KO's change detection fires.
el.dispatchEvent(new Event('input', { bubbles: true }));
```

Real examples in this codebase worth reading:
- `waitForElement` — why `MutationObserver` instead of `setInterval`
- `waitForInputById` — why `getElementById` over `querySelector` (pipe chars in IDs break CSS selectors)
- `startMfaEnrollVerifyOtpPolling` — why polling instead of `MutationObserver` for the Oracle SPA
- `vite.content.config.ts` comment — why IIFE format instead of ESM for MV3 content scripts

Never leave commented-out code in `main` or any committed branch. If it matters, it belongs in git history.

## neverthrow patterns

`vault.ts` exposes `encryptVault` / `decryptVault` as `ResultAsync<T, VaultError>`. Callers use `.match()` or the `isErr()` / `value` guard pattern — never unwrap with try/catch.

```typescript
// Bad — silently swallows errors, caller has no typed contract
let payload: VaultPayload;
try {
  payload = await decryptVault(stored, master);
} catch { ... }

// Good — both tracks are typed and explicit
const result = await decryptVault(stored, master);
return result.match(
  (payload) => ({ success: true as const, payload }),
  ()        => ({ success: false as const, reason: "decrypt_error" as const }),
);
```

DOM lookup helpers return `Result<El, string>` so null checks don't scatter across the call site:

```typescript
// content.ts pattern — fail fast, single consolidated error surface
if (!usernameElm) return err('credential page: username input not found');
if (!passwordElm) return err('credential page: password input not found');
```

`ResultAsync.fromPromise` is the correct wrapper for any Promise that can reject — map the rejection to a typed error string immediately, not at the call site.
