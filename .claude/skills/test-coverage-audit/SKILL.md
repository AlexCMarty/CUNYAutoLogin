---
name: test-coverage-audit
description: >
  Produces a single ranked, risk-weighted audit of the CUNYAutoLogin test suite and
  writes it to a file — it does NOT write or change any tests. Spawns parallel inspection
  subagents (one per domain) that judge tests by behavior-over-implementation, then
  synthesizes their findings into one audit document at a known path. Use whenever the
  user wants to understand the state of their tests before acting: "audit my test
  coverage", "where are my tests weak", "what's missing in my tests", "are my tests any
  good", "find flaky or fragile tests", "which tests assert on implementation", "produce
  a coverage report", "review my test suite". This is the analysis half — pair it with
  `act-on-test-audit` to actually fill the gaps. Invoke proactively before any large test
  refactor so decisions are driven by evidence, not vibes.
triggers:
  - audit test coverage
  - audit my tests
  - review test suite
  - where are my tests weak
  - what tests are missing
  - find flaky tests
  - find tests that assert implementation
  - produce a coverage report
disable-model-invocation: false
---

# Test Coverage Audit

Produce **one** ranked audit file describing the true state of the test suite. This skill
**reads and judges; it never writes tests** — that separation is the point. A clean audit
artifact is the contract consumed by `act-on-test-audit`.

## What "good" means here

Before judging anything, read `references/good-tests.md`. That file — not any in-repo doc
— is the authority on what makes a test good. The repo's own testing docs
(`.agents/rules/unit-testing.md`, `.agents/rules/e2e-testing.md`) are useful for
*mechanical* conventions (runner, mock helpers, environment directives) but treat their
claims about what a "good test" is critically: confirm against the source, not the prose.
The headline judgment: **test behavior, not implementation**, and prioritize by
**risk × likelihood**, never by a coverage percentage.

## Project quick-reference (CUNYAutoLogin)

**Unit:** Vitest — `src/**/*.test.ts` beside source. `npm run test:unit` (no build needed).
**E2E:** Playwright (Chromium only) — `e2e/*.spec.ts`. `npm run test:e2e`.
**Config:** `vitest.config.ts`, `playwright.config.ts`.

Domains (confirm with the commands in Phase 1 — the layout may have grown):

| Domain | Source | Notes |
|--------|--------|-------|
| Crypto / vault | `src/crypto/` | **highest blast radius** — credential & master-password paths |
| Content scripts | `src/content/` | single-IIFE auto-fill on ssologin.cuny.edu; jsdom env |
| Onboarding FSM | `src/onboarding/` | state machine + screen rendering |
| Background / runtime | `src/background/`, `src/runtime/` | message routing, listener registration |
| Sidebar | `src/sidebar/` | email-domain validation lives here |
| CUNY constants | `src/cuny/` | selectors/URLs/timing — single source of truth |
| Vault session | `src/vaultSession/` | session-only master-password handling |

Security-sensitive domains (crypto, content credential flow, vault session, sidebar email
validation) get their risk weighting bumped — a gap there outranks a cosmetic gap elsewhere.

## Phase 1: Orient (inline, before spawning)

```bash
find src -name "*.test.ts" | sort        # current unit test files
ls e2e/*.spec.ts                          # current E2E specs
find src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" | sort   # full source surface
```

Then:
1. Read `references/good-tests.md` if you haven't.
2. Read 2–3 representative test files to learn the *mechanical* style (mock setup,
   assertion idioms, environment directives) so findings cite realistic remedies.
3. Note every source file with **no** corresponding test — these are prime gaps.
4. Note which domains touch credentials/crypto/storage — flag those as elevated risk.

Emit a one-screen pre-map (file counts, zero-coverage modules, elevated-risk domains)
before spawning. This is also your fallback: if a domain has almost no surface, audit it
inline instead of spending a subagent on it.

## Phase 2: Spawn parallel inspection agents

Spawn one subagent per domain with meaningful surface, **all in the same turn**. They
**only analyze and report** — they must not edit files. Paste the full template; fill the
bracketed parts per domain.

```
You are auditing (NOT writing) the tests for the **[DOMAIN]** domain of the CUNYAutoLogin
MV3 browser extension. You write zero code. You produce findings only.

## The bar for a good test (this overrides any repo doc)
- Tests pin observable BEHAVIOR (inputs/state -> output/effect), never implementation.
  A test that breaks on a behavior-preserving refactor is testing implementation — flag it.
- Failures must localize: clear name, one logical behavior per test.
- Edges matter more than the happy path: empty/zero/one/max/off-by-one, error paths
  (throws, rejections, malformed input, locked state), "impossible" states.
- "Line executed" != "behavior pinned". Coverage without meaningful assertions is illusory.
- Deterministic & isolated: no real time/randomness/network/order-dependence.
- Mock only the system's edges; never mock the unit under test or assert-call internal
  collaborators. A good fake honors the real contract, not just call-recording.
- Right level: pure logic -> unit; seams -> integration; only critical journeys -> E2E.
  Flag level mismatches (complex logic tested only via slow E2E, or core logic with no unit test).
- Tests are code: dead assertions, tautologies, drifted copy-paste, forgotten .skip,
  over-mocking = NEGATIVE coverage. Flag them.
- Prioritize by risk x likelihood, never a coverage percentage. Credential/crypto/storage
  paths far outweigh cosmetic code.

## Mechanical conventions (match these so fixes are realistic, but do NOT treat them as
## the definition of a good test)
- Vitest unit tests beside source as *.test.ts. jsdom via `// @vitest-environment jsdom`
  as the first line when DOM is needed; Node default otherwise.
- `browser.*` via mocked `webextension-polyfill`; never `chrome.*`.
- neverthrow Results: tests use `unwrap`/`unwrapErr` helpers, never `_unsafeUnwrap`.
- E2E: Chromium only; import DOM IDs/URLs from `src/cuny/ssoSite.ts` and `e2e/constants.ts`.

## Source files in this domain
[paths + one-line purpose each]

## Existing test files in this domain
[paths, or "none"]

## Your task
1. Read every source file and every existing test file above.
2. Classify each meaningful issue into exactly one type:
   untested-behavior | under-tested-edge | mis-leveled | weak-test | flaky | high-risk-gap
3. For each, assign severity by risk x likelihood:
   CRITICAL (security/crypto/credential/data-loss behavior unpinned),
   HIGH (common user path or important error path unpinned; a test welded to implementation),
   MEDIUM (edge/boundary missing; weak assertion), LOW (polish, minor edge, naming).
4. Return findings ONLY in this exact block format (one block per finding) so they can be
   merged mechanically:

   ### [SEVERITY] <domain>/<short-id> — <one-line title>
   - **Location:** <file:line or file>
   - **Type:** <one of the six types>
   - **Behavior at risk:** <the contract that is not pinned, in plain language>
   - **Evidence:** <what you saw: e.g. "no test calls X with empty input", "test asserts
     setError was called rather than the rejection outcome">
   - **Recommended test:** <level + what to ASSERT behaviorally — not how to implement>
   - **Effort:** S | M | L

5. End with one line: `DOMAIN SUMMARY: <n> findings (C<n> H<n> M<n> L<n>)`.
   If the domain is genuinely solid, say so in one sentence and stop.
```

## Phase 3: Synthesize and write the audit file

1. **Merge** every finding. De-dupe (same location from two agents -> one; higher severity wins).
2. **Spot-check** the top 5 CRITICAL/HIGH by reading the cited lines yourself. Downgrade or
   drop any that don't hold up, with a one-line note — a credible audit is honest about
   false positives.
3. **Re-rank** the whole list by risk × likelihood, security domains first within a tier.
4. **Write the audit** to `test-audit.md` at the repo root (overwrite if present), using
   the exact template below. The structure is a contract: `act-on-test-audit` parses it.

```markdown
# Test Coverage Audit — <YYYY-MM-DD>

## Scorecard
- Unit test files: N | E2E specs: N | Source files: N
- Source files with zero tests: N  (<list>)
- Findings: N  (CRITICAL N | HIGH N | MEDIUM N | LOW N)
- Elevated-risk domains audited: <list>
- Suite currently: <passing / failing — N failures>  (state if not run)

## Top risks (read these first)
1. <one line per top finding, why it matters>
...

## Findings

### [CRITICAL] <domain>/<id> — <title>
- **Location:** <file:line>
- **Type:** <type>
- **Behavior at risk:** <contract>
- **Evidence:** <what was observed>
- **Recommended test:** <level + behavioral assertion>
- **Effort:** S | M | L

### [HIGH] ...
### [MEDIUM] ...
### [LOW] ...

## Not findings (looked suspicious, actually fine)
- <location> — fine because <reason>

## Notes for whoever acts on this
- <anything requiring real browser crypto / live CUNY SSO / manual setup>
- <ordering or dependency hints for fixing>
```

5. Report to the user: the path (`test-audit.md`), the scorecard line, and the top 3 risks.
   Then offer: "Run `act-on-test-audit` to act on this." Do **not** start writing tests —
   that is the other skill's job, and keeping them separate lets the user review the audit
   before any code changes.
