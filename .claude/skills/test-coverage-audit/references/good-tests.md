# What good tests look like

This is the judgment that drives the audit. Read it before deciding what counts as a
gap, a weakness, or a non-issue. It is deliberately stack-agnostic — the repo's runner,
mock helpers, and file layout are *mechanical* facts to match, but what makes a test
*good* lives here, not in any in-repo doc.

## The one purpose

A test exists to **let you change code with confidence**. Every property below is
downstream of that. A test that doesn't increase confidence to refactor, or doesn't
catch a real regression, isn't pulling its weight. A test that *fails when behavior is
still correct* is worse than no test — it trains people to ignore red.

## The principles

### 1. Test behavior, not implementation
Pin down an observable contract: given these inputs / this state, the system produces
this output / this effect. Say nothing about *how*.

- Good: "submitting an email without the required domain is rejected and surfaces an error."
- Bad: "`validateEmail` is called once, then `setError(true)` is called."

The tell: a test you must edit on every refactor *even though behavior didn't change* is
testing implementation. This is the most important principle and the one the audit
should weight hardest.

### 2. Failure must localize the cause
A red test's name + assertion should tell you what broke without opening the body. One
logical behavior per test. Several `expect`s describing one behavior (the shape of one
result) are fine; a test exercising three independent behaviors masks two failures
behind the first.

### 3. Cover the boundaries, not the happy path twice
The happy path is the *least* likely place for bugs — it's what the author was staring at.
Real defects live at the edges:
- Boundaries: empty, zero, one, max, off-by-one, the exact threshold.
- Error paths: dependency throws, network fails, input malformed, promise rejects, state locked.
- "Impossible" states: the cases the code "can't" reach.

100% line coverage on happy-path inputs only is a coverage *illusion* — every line ran,
nothing meaningful was asserted. The audit must distinguish "executed" from "pinned."

### 4. Deterministic and isolated
Same answer every run, any order, any machine. Hunt: real time/timers, unseeded
randomness, shared mutable state, order dependence (B passes only after A), real
network/filesystem/wall-clock sleeps. Flaky tests are a tax — people re-run until green,
then learn to ignore real failures.

### 5. Mock at the right seam, sparingly
Mock the *edges* of the system (network, browser API, clock) for speed and determinism.
Never mock the thing under test, and don't mock internal collaborators just to assert
they were called — that's how you weld a test to the implementation (#1). A good fake
honors the real contract (a fake store that actually stores/retrieves), it doesn't just
record calls.

### 6. Readable as documentation
A newcomer should learn how the unit is *meant* to be used by reading its tests.
Arrange / Act / Assert. No logic in tests (loops, conditionals, clever helpers hide what's
asserted; a bug in a test is a silent trap). Prefer concrete literals — `toBe(42)` beats
`toBe(price * qty)`, which can replicate the very bug it should catch.

### 7. The right test at the right level
Test each thing at the cheapest level that gives real confidence:
- **Unit** — pure logic, branches, edges, error handling. Fast, numerous, precise.
- **Integration** — the seams: does the module really talk to storage/router/crypto correctly?
- **E2E** — a handful of critical journeys that must not break. Expensive; reserve for high value.

Flag **level mismatches**: complex pure logic covered only via a slow E2E (should be unit),
or core logic with no unit tests leaning entirely on E2E.

### 8. Tests are code — same bar
Duplicated setup, dead assertions, copy-pasted tests that drifted, tests that call code
but never assert, tautologies (`expect(true).toBe(true)`), forgotten `.skip`. These are
*negative* coverage: maintenance cost plus false reassurance. Flag them.

## What "missing coverage" really means

The audit looks for six things, not a line-coverage diff:

1. **Untested behavior** — public contracts / branches / error paths with no test.
2. **Under-tested edges** — "covered" but only happy path; boundaries & failures unasserted.
3. **Mis-leveled tests** — logic tested only via E2E, or core logic with no unit tests.
4. **Weak / illusory tests** — runs code without meaningfully asserting; over-mocked, welded to impl.
5. **Fragile / flaky tests** — order-, time-, or environment-dependent.
6. **High-risk gaps** — weight by *blast radius*: security/crypto/credential/data-loss paths
   matter far more than a tooltip's text.

## Triage, not a percentage

Prioritize by **risk × likelihood**, never by chasing a coverage number. A security path
with no error-case test outranks ten missing happy-path assertions on cosmetic code. The
goal is confidence where it counts.
