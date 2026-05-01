<!-- Load when: writing or reviewing any .ts file in src/ or e2e/ -->

# TypeScript code style

## Syntax basics

- Arrow functions preferred
- No `any` — use precise union types or generics
- Named exports by default; config entrypoints may use default exports when required by tooling
- `async`/`await` only; no `.then()` — enforced by ESLint
- Avoid `throw`. Use neverthrow `Result` / `ResultAsync` where practical. A `throw` **requires** a comment explaining why neverthrow was unsuitable.
- Maintain the same security level as a password manager

## Naming

Names must announce purpose without a comment. If the name alone doesn't tell the story, it's wrong.

Single-letter names are banned (enforced by `id-length`). Exceptions: `_` (unused), `i` (for-loop counter), generic type parameters (`T`, `E`, `K`, `V`, `R`).

| Tempting name | Better name |
|---|---|
| `el` | `<purpose>El` — e.g. `statusEl`, `usernameInputEl` |
| `e` | `error`, `submitEvent`, `clickEvent` |
| `m` | `message`, `match` |
| `j` | `parsed<Type>` — e.g. `parsedFactor` |
| `v` | name after contents — e.g. `storedVaultCandidate` |
| `s` | `resolvedStorage`, `rawString` |
| `d` | `rawDraft`, `responseData` |
| `o` | `parsedPayload` |
| `t` | `clickTarget`, `resolvedTarget` |
| `r` | `result`, `vaultResult` |
| `p` | `payload`, `rawPayload` |

Boolean variables must read as predicates: `isPasswordVisible`, not `showing`.

Concrete patterns in this codebase:
- Predicates: `matchesCredentialPage`, `matchesTotpPage`, `isStoredVault`
- Waiters: `waitForInputById`, `waitForEnrollTotpSecret`
- Error strings: lowercase snake case — `"decrypt_failed"`, `"no_session_master"`

## Function size and responsibility

One function, one concern. If you need "and" to describe it, split it. Aim 20–40 lines. Hard cap: 80 lines.

```typescript
// Bad — two concerns
async function decryptAndFillCredentials(...) { ... }

// Good — each owns one concern
async function decryptVault(...): ResultAsync<VaultPayload, VaultError> { ... }
async function fillCredentials(email: string, password: string): Promise<Result<true, string>> { ... }
```

## Early returns over nesting

```typescript
// Bad
async function autoFill() {
  const response = await sendMessage(...);
  if (response.success) {
    if (response.payload.email) { await main(response.payload); }
  }
}

// Good
async function autoFill() {
  const response = await sendMessage(...);
  if (!response.success) { log("autoFill:", response.reason); return; }
  await main(response.payload);
}
```

## Comments — explain the constraint, not the operation

```typescript
// Bad — restates the code
// Dispatch input and change events
el.dispatchEvent(new Event('input', { bubbles: true }));

// Good — explains the constraint
// A plain `.value =` bypasses Oracle JET's Knockout.js bindings.
// Native prototype setter + synthetic events so KO's change detection fires.
el.dispatchEvent(new Event('input', { bubbles: true }));
```

Never leave commented-out code in a committed branch.

## Async fire-and-forget

`void promise` must chain `.catch()`. `try/catch` does **not** catch async rejections from a voided Promise.

```typescript
// Wrong — catch is unreachable for async errors
try { void browser.runtime.sendMessage(msg); } catch { ... }

// Correct
void browser.runtime.sendMessage(msg).catch((error) => handleError(error));

// Also correct — genuinely don't care about failure
void browser.runtime.sendMessage(msg).catch(() => undefined);
```

An `async` IIFE or arrow with no `await` expressions should not be `async`.

## neverthrow patterns

`vault.ts` exposes `encryptVault` / `decryptVault` as `ResultAsync<T, VaultError>`. Use `.match()` or `isErr()` / `.value` — never unwrap with try/catch.

```typescript
// Bad
let payload: VaultPayload;
try { payload = await decryptVault(stored, master); } catch { ... }

// Good
const result = await decryptVault(stored, master);
return result.match(
  (payload) => ({ success: true as const, payload }),
  ()        => ({ success: false as const, reason: "decrypt_error" as const }),
);
```

DOM lookup helpers return `Result<El, string>` — fail fast at the top, no scattered null checks.

`ResultAsync.fromPromise` is the correct wrapper for any rejectable Promise — map the rejection to a typed error string immediately.
