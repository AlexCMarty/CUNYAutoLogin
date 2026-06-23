---
name: code-quality
description: >
  Use when the user wants a senior-level code-quality review of the CUNYAutoLogin
  source — "audit the code", "find code smells", "review code quality", "what would a
  senior flag", "find tech debt". Covers type-safety, complexity, naming, error
  handling, coupling, async, test quality, dead code, magic values, and non-crypto
  security smells in the TypeScript/MV3 source. Reports only — it does not modify
  code. For credential/crypto depth use `security-audit`; for the test suite use
  `test-coverage-audit`.
triggers:
  - review code quality
  - audit the code
  - find code smells
  - find spaghetti code
  - what would a senior engineer flag
  - find tech debt
  - clean up this codebase
disable-model-invocation: false
---

# Code Quality

## Purpose

Hunt for code a senior engineer would flag in review — code that works but isn't readable, typed, single-responsibility, or defensively correct. The bar is high, but a review is only useful if its signal survives: **rank by real-world impact, and be honest about what is actually fine.** A report that flags everything "no matter how small" is noise, and noise wastes the reader's time exactly like a false alarm does.

This skill **reads and judges; it does not modify code.** It returns a severity-ranked findings report to the user (offer to also write `code-quality-report.md` if they want an artifact to act on later).

## Core Rules

1. **High bar, ranked by impact.** Hold code to a senior-review standard, but rank every finding by real-world impact (see Severity Scale) and lead with what matters. A correctness bug in a credential path outranks a naming nit — let severity, not volume, carry the report.
2. **Cite exactly.** Every finding includes file path, line number(s), and the offending code snippet. A finding you cannot cite is a guess — drop it.
3. **Be honest about false positives.** If a pattern *looks* wrong but is actually fine (documented deviation, deliberate exception, framework requirement), put it under "Not findings" and do **not** flag it. Padding the list with non-issues destroys the report's credibility — this discipline is as important as the findings themselves.
4. **Severity is not optional.** Every finding is rated `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` — by impact, not by how easy it was to spot.
5. **Recommend a fix, don't apply it.** Every finding includes a concrete corrective action (rename, split, add type, extract constant). This skill reports; it does not edit source — leave the change to the user.
6. **The repo rules are the authority.** Ground findings in `.agents/rules/code-quality.md`, `.agents/rules/typescript.md`, and `.agents/rules/unit-testing.md`. Where the taxonomy below names a specific number or ban (the 80-line cap, the `.then()` ban), those files win if they have since drifted — verify against them, don't assume the taxonomy is current.

## Severity Scale

| Level | When to use |
|---|---|
| **CRITICAL** | Bug likely in production: wrong logic, security leak, data loss, broken async, uncaught rejection that silently eats errors |
| **HIGH** | Code a senior would send back in review: `any` types, god functions, deep nesting, missing error path, swallowed errors, test asserting internals |
| **MEDIUM** | Maintainability debt: vague names, magic literals, function does two things, missing early return, unnecessary mutation |
| **LOW** | Style or polish: inconsistent naming convention, dead import, redundant comment, single-use variable with a bad name |

---

## Issue Taxonomy

Each subagent focuses on one category. These are the canonical issues for this TypeScript/MV3 extension:

### 1. Type Safety
- `any` types (explicit or implicit via unsafe cast)
- `as X` casts that bypass the type system without a comment explaining why
- `_unsafeUnwrap()` / `_unsafeUnwrapErr()` in non-test code
- Functions with return type `void` that actually return meaningful values
- Parameters typed as `unknown` then immediately cast without a guard

### 2. Function Complexity
- Functions longer than ~80 lines (hard cap per style rule)
- Functions that do two things ("and" in the description)
- Nesting deeper than 2 levels when early returns would flatten it
- `if/else` chains that should be a lookup table or `match`
- Long argument lists (≥ 4 params that aren't grouped into an object)

### 3. Naming
- Single-letter or cryptic variable names outside tight loop counters (`el`, `m`, `msg`, `r`, `e`, `cb`, `fn`, `val`, `obj`, `data`, `res`, `ret`)
- Boolean variables that don't read as predicates (`const ready = …` vs `const isReady = …`)
- Event handler names that start with `handle` when a more specific verb exists (`handleMsg` → `routeRuntimeMessage`)
- Functions named after their implementation rather than their contract (`getData`, `doStuff`, `processItem`)
- Constants that are not `SCREAMING_SNAKE_CASE`

### 4. Error Handling
- `try/catch` blocks with an empty body or a bare `console.error`
- `catch (e)` where `e` is used as `any` — should be `unknown` + type-narrowed
- Promises without rejection handling (no `.catch`, no `try/await`, no `ResultAsync`)
- `.then()` usage anywhere in `src/` or `e2e/` (banned by ESLint — flag remaining instances if lint was bypassed)
- `Result`/`ResultAsync` `.value` accessed without an `isErr()` guard (unsafe)
- Error strings that are not typed union literals (bare string returns from functions that can fail)

### 5. Coupling & Cohesion
- A module that imports from more than ~5 other source modules (potential god module)
- Circular or back-edge imports (A imports B imports A)
- A function that reaches across module boundaries for DOM state it shouldn't own
- Business logic embedded in a UI event handler instead of a pure function
- Hardcoded paths, URLs, DOM IDs, or timing constants outside `src/cuny/ssoSite.ts` (single source of truth for SSO constants)

### 6. Async / Concurrency
- `async` functions that never `await` anything
- `await` on a non-Promise value
- `Promise.all` without considering partial failure
- Fire-and-forget `async` calls where the rejection is silently dropped
- `setInterval` / `setTimeout` with a magic number that should be a named constant
- Race conditions: reading then writing storage without atomicity where order matters

### 7. Test Quality
- Tests that assert on internal state (`(module as any)._privateVar`) instead of observable behavior
- Tests with no assertions at all (or only `expect(true).toBe(true)`)
- Tests with `_unsafeUnwrap()` / `_unsafeUnwrapErr()` directly (should use the `unwrap`/`unwrapErr` helper pattern)
- Setup code duplicated across test cases that belongs in `beforeEach`
- Test name that starts with "test", "should", or is a generic phrase instead of a plain behavior sentence
- Mocks that silently return `undefined` for methods that can meaningfully fail (hides error paths)
- E2E tests that hardcode fixture URLs instead of importing constants from `e2e/constants.ts`

### 8. Dead & Vestigial Code
- Commented-out code blocks (any committed commented-out code is a finding)
- Imports that are never used
- Variables assigned but never read
- `console.log` / `console.debug` left in production code paths (not gated by `import.meta.env.MODE !== "production"`; note the content script legitimately uses `import.meta.env.DEV` for tree-shaking)
- Exports that are never imported by any other module
- TODO/FIXME comments that have been sitting long enough to become permanent fixtures

### 9. Magic Values
- Numeric literals in logic outside a named constant
- String literals repeated more than once across different files
- Timeout/interval values not named
- Storage key strings defined inline instead of imported from the module that owns them

### 10. Security Issues (non-crypto)
- `console.log` of anything that *might* carry credential-shaped data (email, password, secret)
- Storage writes of non-vault data to `browser.storage.local` (should be `storage.session` or in-memory)
- Any use of `localStorage` in extension code (persists to disk — critical finding per the security rule)
- Message handlers that return sensitive data without checking sender identity
- Content script code that writes credential values into the DOM in readable form

---

## Workflow

### Step 1 — Inventory the codebase

Before spawning subagents, collect the file list and rough line counts so subagents can be scoped efficiently:

```bash
find src e2e -name "*.ts" | sort
rg --files src -g "*.ts" | xargs wc -l | sort -rn | head -20
```

### Step 2 — Spawn the four audit subagents (all in the same turn)

Divide the taxonomy into **four read-only subagents**, dispatched **in a single turn** so they run in parallel. Each owns one bundle (all 10 categories are covered, none twice):

**Bundle A — Types & Errors** (categories 1, 4)
**Bundle B — Shape & Complexity** (categories 2, 3, 5)
**Bundle C — Async, Dead Code & Magic Values** (categories 6, 8, 9)
**Bundle D — Tests & Security Issues** (categories 7, 10)

Paste this template to each, filling the bracketed parts:

```
You are auditing the **[BUNDLE NAME]** of the CUNYAutoLogin MV3 browser extension
(TypeScript). You write ZERO code — you read, judge, and return findings only. Do not
edit, create, or delete any file.

## Your categories
[paste the relevant taxonomy categories from the skill, verbatim]

## The bar
Senior-reviewer standard, but rank by real-world impact and be honest about false
positives — a finding you cannot cite or defend is noise, so drop it. The authority on
conventions is `.agents/rules/code-quality.md`, `.agents/rules/typescript.md`, and
`.agents/rules/unit-testing.md`; if a specific number here (e.g. the 80-line cap) has
drifted from those files, the files win.

## Severity — rank by impact, not by how easy it was to spot
[paste the Severity Scale table from the skill]

## Method
1. `rg` the canonical patterns for your categories before opening files.
2. Read the files most likely to have findings (largest files; multiple rg hits).
3. Return findings ONLY in this block format:

   ### [SEVERITY] <category> — <one-line title>
   - **Location:** <file:line>
   - **Code:** <the offending snippet>
   - **Why:** <one sentence: the real problem>
   - **Fix:** <concrete corrective action — to recommend, not to apply>

4. End with `BUNDLE SUMMARY: <n> findings (C<n> H<n> M<n> L<n>)`. If a category is
   genuinely clean, say so in one line — do not manufacture findings. List anything that
   looked suspicious but is fine under `Not findings: <location> — <why it's fine>`.
```

### Step 3 — Synthesize

After all four bundles complete:
1. Merge all findings
2. De-duplicate (same line flagged by two agents → one finding, higher severity wins)
3. Re-rank: if a finding touches both a complexity issue and a type-safety issue, escalate one level
4. Group by file for the final report

### Step 4 — Spot-check top findings

Before reporting, directly read the top 5 CRITICAL/HIGH findings to confirm they are real, not grep false-positives. Downgrade any that turn out to be fine (and explain why).

---

## Output Format

```
## Code Quality Report — <date>

### Summary
- Files scanned: N
- Total findings: N (C critical / H high / M medium / L low)
- Hottest file: <file> (N findings)

### CRITICAL
[file:line] <offending snippet>
Issue: <category>
Why: <one sentence on why this is a real problem>
Fix: <concrete corrective action>

### HIGH
... (same format)

### MEDIUM
... (same format)

### LOW
... (same format, grouped by file for brevity)

### Not findings (looked suspicious, actually fine)
- <pattern> in <file> — fine because <reason>
```

Report inline to the user by default: the summary line first, then CRITICAL/HIGH findings, then the rest. Write `code-quality-report.md` only if the user wants an artifact. Either way the skill stops here — it never edits source.

---

## Project Context

This is a TypeScript MV3 browser extension. Conventions enforced by `.agents/rules/code-quality.md`, `.agents/rules/typescript.md`, and `.agents/rules/unit-testing.md`:

- `neverthrow` `Result`/`ResultAsync` for fallible functions — no raw `throw` without a comment
- `async`/`await` only — no `.then()`
- No `any` types
- Named exports by default
- Arrow functions preferred
- Functions ≤ 80 lines; single responsibility
- SSO URL/DOM constants only in `src/cuny/ssoSite.ts`
- Test names are plain behavior sentences (no "should", no "test X")
- `unwrap`/`unwrapErr` helpers in tests, never `_unsafeUnwrap`
- `import.meta.env.MODE !== "production"` guards for dev-only code paths (the content script is excepted — it uses `import.meta.env.DEV` for tree-shaking)

Violations of the above are **always** findings — no exceptions unless a comment in the source explains the deviation.
