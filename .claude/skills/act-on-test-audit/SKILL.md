---
name: act-on-test-audit
description: >
  Takes a test-coverage audit (the file produced by `test-coverage-audit`, default
  `test-audit.md`) and acts on it: triages findings by risk, decides whether parallel
  subagents are even worth it, then writes the recommended tests and verifies the suite
  still passes. Use whenever the user has an audit in hand and wants it actioned: "act on
  the audit", "fix the gaps from the audit", "implement the audit's recommendations",
  "write the missing tests from test-audit.md", "address the findings", "work through the
  audit". Also use when the user points at any findings/coverage report and says "make
  these real". This is the action half — it expects an audit to exist; if none does,
  offer to run `test-coverage-audit` first. Invoke proactively right after an audit when
  the user signals they want the gaps closed.
triggers:
  - act on the audit
  - fix the audit findings
  - implement the audit
  - write the missing tests from the audit
  - address the test gaps
  - work through test-audit
disable-model-invocation: false
---

# Act on Test Audit

Turn a coverage audit into real, passing tests — guided by the audit's own risk ranking,
not by a coverage number. The audit decided *what* matters; this skill decides *how much
machinery* is worth it and then does the work.

## What "good" means here

The tests you write must clear the same bar the audit used to judge them. Read
`../test-coverage-audit/references/good-tests.md` before writing anything. The single rule
that matters most: **pin observable behavior, not implementation.** If a test you're about
to write would break on a behavior-preserving refactor, you're writing the wrong test —
assert the outcome, not the call sequence. The repo's testing docs are fine for
*mechanical* conventions but are not the authority on test quality.

## Phase 1: Load and triage the audit

1. **Find the audit.** Default `test-audit.md` at repo root; otherwise use the path the
   user gave. If none exists, stop and offer to run `test-coverage-audit` first — acting
   without an audit means re-deriving everything it already established.
2. **Parse the findings** into a list: `{severity, type, location, behavior, recommended
   test, effort, domain}`. The audit's block format is stable; if the file is hand-written
   or malformed, extract what you can and tell the user what you couldn't parse.
3. **Decide scope with the user if the audit is large.** Sensible default: act on
   everything CRITICAL and HIGH, plus MEDIUM where effort is S. Skip LOW unless asked.
   State the cut line you're using so it's reviewable.
4. **Skip work that isn't worth it.** A finding whose "recommended test" would weld a test
   to implementation, or re-assert something already covered, gets dropped with a one-line
   note — not blindly implemented. The audit is evidence, not orders.

## Phase 2: Is parallelism worth it? (decide explicitly)

Parallel subagents pay off only when there's enough *independent* work to amortize their
setup cost. Spawning four agents to write two tests is slower and noisier than doing it
yourself. Decide deliberately:

**Do it inline (no subagents)** when any of:
- The actionable findings fit in **one or two domains**, or
- There are **≲ 5 actionable findings** total, or
- The findings are tightly coupled (same file, same shared helper) so splitting would
  cause merge conflicts or duplicated setup.

**Spawn parallel agents** when:
- Actionable findings span **≥ 3 domains** AND total **≳ 8**, and
- The per-domain work is genuinely independent (different files, no shared new fixture).

State your decision and the reason in one line before proceeding — e.g. "12 findings
across 4 domains, independent → spawning 4 agents" or "3 findings, all in crypto →
inline." When in doubt, inline: it's easier to verify and keeps assertions consistent.

## Phase 3a: Inline path

Work findings in risk order. For each: read the cited source + existing test file, write
the test that pins the at-risk behavior, place it in the right file (or create a new
`*.test.ts` beside the source, `// @vitest-environment jsdom` first line if DOM is needed).
Keep mock setup consistent with the surrounding suite. Then go to Phase 4.

## Phase 3b: Parallel path

Group findings by domain (one bundle per domain). Spawn all bundle agents **in the same
turn**. Each agent writes tests for its findings and returns the code; they do **not** run
the suite (you verify centrally in Phase 4 so failures are diagnosed in one place). Paste
the full template:

```
You are writing tests for the **[DOMAIN]** domain of the CUNYAutoLogin MV3 extension,
to address specific findings from a coverage audit. Write complete, runnable tests — no
TODOs, no stubs. Do NOT run the test suite; return the code.

## The bar (overrides any repo doc)
Pin observable BEHAVIOR, never implementation. If your test would break on a
behavior-preserving refactor, rewrite it to assert the outcome instead of the call
sequence. Cover the edge the finding names (empty/boundary/error path), not the happy path
again. Mock only the system's edges (browser API, clock, network) — never the unit under
test, never assert that an internal collaborator was merely called. One logical behavior
per test; a clear name that localizes failure; concrete literal expectations.

## Mechanical conventions (match exactly; not the definition of quality)
- Vitest, *.test.ts beside source. `// @vitest-environment jsdom` first line when DOM is used.
- `browser.*` via mocked `webextension-polyfill`; never `chrome.*`.
- neverthrow: use `unwrap`/`unwrapErr` helpers, never `_unsafeUnwrap`/`_unsafeUnwrapErr`.
- No bare `console.*` in production paths; dev gates use `import.meta.env.MODE !== "production"`
  (NOT `import.meta.env.DEV`).
- E2E (only if a finding is E2E): Chromium only; import IDs/URLs from `src/cuny/ssoSite.ts`
  and `e2e/constants.ts`; WebAuthn via the virtual authenticator helper.

## Existing test style to match
[paste 20–40 lines from a representative test file in this domain]

## Findings to address (from the audit)
[for each finding: location, behavior at risk, recommended test, effort]

## Return format
For each finding, return:
### <finding id>
**Target file:** <path to existing or new *.test.ts>
```typescript
// what behavior this pins
<complete runnable test code>
```
If a finding shouldn't be implemented as written (would test implementation, already
covered), say so in one sentence instead of writing it.
```

## Phase 4: Apply, verify, report

1. **Apply** all test code: append to existing files (blank line before each new block) or
   create new `*.test.ts` beside the source. Add the jsdom directive where DOM is used.
2. **Run unit tests:** `npm run test:unit`. On failure, fix *mechanical* issues only (wrong
   import path, missing `vi.mock`, missing jsdom directive, mock signature) and re-run
   once. If a test still fails because the asserted behavior doesn't actually hold, that is
   a real signal — report it; do not weaken the assertion just to get green.
3. **Run E2E** only if E2E specs were added: `npm run test:e2e`.
4. **Lint:** `npm run lint` — must pass with zero warnings (`--max-warnings 0`). Fix
   `no-console`, `id-length`, import-order before claiming done.
5. **Report:**

```
# Acted on Test Audit — <date>

## Approach
- Audit: <path> | Findings actioned: N of M (cut line: <e.g. CRITICAL+HIGH+small MEDIUM>)
- Mode: inline / N parallel agents — <one-line reason>

## What was written
[per finding or per domain: file(s), # tests, behavior pinned]

## Dropped / deferred (with reason)
- <finding id> — <would test implementation / already covered / needs live SSO / etc.>

## Verification
- Unit: ✓ all passing / ✗ N failures (paste message + one-line cause each)
- E2E: ✓ / ✗ / not run
- Lint: ✓ clean / ✗ N warnings

## Real failures worth attention
[any test that failed because the behavior genuinely doesn't hold — this is the audit
paying off, not a chore]
```

Tell the user which findings remain (e.g. LOW polish, anything needing live CUNY SSO or
real browser crypto) so they can decide whether to re-run later.
