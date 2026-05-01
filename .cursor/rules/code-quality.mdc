---
description: Engineering prime directives, pre-merge checklist, and what we never do
alwaysApply: true
---

# Code quality standards

## Prime directives

1. Write code that will be read by humans, not by AI.
2. Always choose the simplest solution. Add complexity only when it solves a real problem.
3. Always leave the codebase better than you found it.
4. Ask yourself: *"If I handed this to a skeptical senior engineer on a Friday afternoon before a holiday weekend, would they merge it without hesitation?"* If the answer is anything other than an unqualified yes, keep working.

## Comments

Explain the *why*, not the *what*. The code shows what — comments explain what constraint forced this decision or what non-obvious thing the next person must know. See `typescript-style` rule for codebase-specific examples.

Never leave commented-out code in a committed branch. Git history is the archive.

## What we do not do

- We do not merge code we don't understand.
- We do not skip tests because we're confident the change is safe.
- We do not use `any` as a way to avoid thinking about types.
- We do not optimize code before we have a profiler trace showing it's the bottleneck.
- We do not write code that only the original author can maintain.
- We do not add comments that restate what the code already says.

## Pre-merge checklist

Before requesting a review or considering a task done:

- [ ] Does `npm run lint` pass with zero errors **and zero warnings**?
- [ ] Does every function do exactly one thing?
- [ ] Is every function under 80 lines of code (not counting blank lines / comments)?
- [ ] Can a stranger understand each variable's purpose from its name alone?
- [ ] Are there any single-letter variables outside a `for` loop counter? If yes, rename them.
- [ ] Are all error paths handled explicitly (typed, not swallowed)?
- [ ] Is every `void somePromise()` followed by `.catch(...)` — not wrapped in a `try/catch`?
- [ ] Are there tests for the new behavior — including edge cases?
- [ ] Is there a test that would catch a regression if this broke?
- [ ] Are there any stub or placeholder files that are never imported? Delete them.
- [ ] Are there any `TODO`s that should be tickets instead?
- [ ] Is there any commented-out code?
- [ ] Does every new CUNY page constant (selector, URL path, text marker, timing) live in `ssoSite.ts`?
- [ ] Could a sleep-deprived on-call developer understand this at 3am?

## What we do not do (agent-generated code edition)

Patterns that AI agents commonly produce that are not acceptable here:

- **Single-letter variables.** `el`, `m`, `j`, `v`, `s`, `d`, `o`, `t`, `e`, `r`, `p` as variable names are all banned. Name the variable after what it contains: `errorAlertEl`, `parsedFactor`, `rawDraft`, `sessionMasterCandidate`.
- **God functions.** A function longer than 80 lines must be split. There are no exceptions. Annotate the split point with a comment explaining why the boundary is there if it is non-obvious.
- **`void promise` inside `try/catch`.** This pattern silently drops async rejections because `void` discards the Promise before the `catch` clause can see it. Use `.catch()` on the Promise itself:
  ```typescript
  // Wrong — catch only fires on synchronous throws, which never happen here
  try { void browser.runtime.sendMessage(msg); } catch { ... }

  // Correct — the rejection is handled on the Promise chain
  void browser.runtime.sendMessage(msg).catch((error) => handleError(error));
  ```
- **CUNY page constants outside `ssoSite.ts`.** Before writing any string literal that is a CSS selector, URL path segment, Oracle JET element name, or CUNY page text marker: open `ssoSite.ts` first. If the constant is not there, add it there before using it anywhere. This is the only file a developer needs to check when CUNY changes their pages.
- **Dead stub files.** If a file is not imported by anything, it does not belong in the repo. Delete it. `verifyLoginCodeStub.ts` was a real example of a file left behind after it was superseded — git history preserves it if it is ever needed again.
- **Unguarded `console.log` / `console.debug` in production paths.** Every console call must be inside `if (import.meta.env.DEV)` or `if (isDevMode())`. This is enforced by `no-console` in `eslint.config.js` — do not use `eslint-disable` to silence it without adding the DEV guard.
