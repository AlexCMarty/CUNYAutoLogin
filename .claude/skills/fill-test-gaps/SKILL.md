---
name: fill-test-gaps
description: >
  Audits a project's unit and E2E test suite for coverage gaps, then automatically writes the missing tests and verifies the suite still passes. Use this skill whenever the user wants to improve test coverage, fill in missing tests, audit the test suite, or says anything like "what tests are missing", "add missing tests", "fill in test gaps", "write tests for untested code", "check test coverage", "inspect my tests", "find gaps in my tests", or "improve coverage". Spawns parallel Sonnet subagents — one per logical domain — that each deeply inspect their area and write new tests, then runs the full suite to verify. Invoke proactively whenever any test-related task would benefit from a full gap sweep.
---

# Fill Test Gaps

Performs a full test suite audit and automatically writes the missing tests, using parallel Sonnet subagents (one per logical codebase domain), then runs the suite to verify.

## Phase 1: Orient (inline, before spawning agents)

Build a complete picture of the codebase before dispatching any agents.

**Read project test rules** — look for files like `.agents/rules/unit-testing.md`, `.agents/rules/e2e-testing.md`, `CONTRIBUTING.md`, or inline comments in existing test files. These define the project's testing conventions: framework, naming, mocking patterns, what to avoid. Read and internalize them — they are the spec for what "good tests" looks like here.

**Survey test files** — find all `*.test.ts`, `*.spec.ts`, `e2e/**/*.ts`, `__tests__/**` files. Note which source directories have zero test files; those are immediate high-priority candidates.

**Survey source files** — understand the full scope of code that exists to be tested.

**Detect test framework(s)** — check `package.json`, `vitest.config.*`, `jest.config.*`, `playwright.config.*`. Note the exact run commands.

**Read 2–3 existing test files** — understand actual patterns in use: import style, mock setup, assertion style, describe/it structure. These set the template that new tests must follow.

**Partition source into 3–5 logical domains** — group related files into inspection zones that each subagent can own completely (e.g., auth/crypto, UI/sidebar, background service, content scripts, utilities). Each domain should be coherent enough that one agent can write idiomatic tests without needing to understand the whole codebase.

Before spawning agents, output a brief map:
- Framework(s) + run commands
- Unit test file count | E2E test file count
- Source domains with file counts
- Any areas already obviously untested (entire directories with no test files)

## Phase 2: Spawn parallel inspection agents

Spawn one Sonnet subagent per domain, **all in the same turn**. Each agent both identifies gaps and writes the tests to fill them. Pass enough context in each prompt that the agent doesn't need to guess at conventions.

**Prompt template for each agent:**

```
You are auditing and filling test gaps for the **[DOMAIN]** domain of this codebase.

## Project testing conventions
[Paste the relevant rules from unit-testing.md / e2e-testing.md, or summarize the conventions if no rules file exists. Include: what framework is used, how mocks are set up, naming conventions, anything explicitly prohibited.]

## Test framework
- Framework: [vitest / jest / playwright / etc]
- Unit test run command: [e.g., npm run test:unit]
- Config: [path to vitest.config.ts etc]

## Source files in this domain
[File path + one-line description of what each does]

## Existing test files for this domain
[File paths, or "none"]

## Existing test style reference — match this exactly
[Paste 20–40 lines from a representative test file in this project, including imports and at least one full describe/it block with mocking if applicable]

---

## Your task

1. Read each source file listed above.
2. Read each existing test file listed above.
3. Identify every meaningful coverage gap:
   - Functions or methods with no test at all
   - Untested branches (if/else, switch cases, early returns, catch blocks)
   - Missing edge cases (empty input, null/undefined, boundary values, large inputs, concurrent calls)
   - Untested error scenarios (thrown exceptions, rejected promises, invalid state, dependency failures)
4. Write complete, runnable tests for every gap you identify. Follow the project conventions exactly — same import paths, same mock patterns, same assertion style, same describe/it nesting.
5. Return your output using this structure:

### Gap Summary
| Severity | Location | Description |
|----------|----------|-------------|
| CRITICAL | path:line | Core logic / security / data-loss path with no coverage |
| HIGH     | path:line | Common user path or important error handling untested |
| MEDIUM   | path:line | Edge case or non-critical path missing |
| LOW      | path:line | Minor edge case or test quality improvement |

### New Test Code

**Target file: [path/to/existing-or-new.test.ts]**
\`\`\`typescript
// [Brief description of what this block covers]
[Complete, runnable test code — no TODOs, no stubs]
\`\`\`

If this domain has no meaningful gaps, say so in one sentence and stop.
```

## Phase 3: Apply tests, verify, and report

Once all agents return:

1. **Collect all new test code** — parse the "New Test Code" sections from each agent's output.

2. **Write to files** — append new tests to existing test files (adding a blank line before the new block), or create a new `*.test.ts` file if none exists for that module. When creating a new file, place it alongside the source file following the project's naming convention.

3. **Run the unit test suite** — use the project's unit test command. If tests fail:
   - Fix obvious mechanical issues: wrong import paths, typos, incorrect mock signatures
   - Re-run once after fixes
   - If still failing, note the failures in the report rather than continuing to chase them

4. **Run E2E tests** — only if new E2E test code was written.

5. **Output the final report:**

```
# Test Gap Audit — Complete

## Summary
- Domains inspected: N
- Gaps found: N total (CRITICAL: N | HIGH: N | MEDIUM: N | LOW: N)
- New tests written: N tests across N files
- Suite status: ✓ all passing / ✗ N failures remaining

## What Was Added
[Per domain — one or two lines: which file(s) were modified or created, how many tests, what they cover]

## Failures (if any)
[Paste the failure message with file:line; explain the likely cause in one line each]

## Gaps Not Auto-Filled
[Anything too complex to auto-test without real infrastructure, manual setup, or domain knowledge the agent lacked — brief explanation per item]
```
