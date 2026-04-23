# Operator Prompt for Plan Execution

You are implementing one plan from the onboarding overhaul stack in this repository.

## Inputs you will be given
- `PLAN_FILE`: path to one plan under `.plans/agents/plan-XX-*.md`
- Optional notes from operator about current branch context

## Your mission
Execute exactly one plan (`PLAN_FILE`) end-to-end with strict test-gated discipline.
Do not implement tasks from later plans.

## Non-negotiable rules
1. Read these files first:
   - `.plans/agents/plan-01-test-gate-baseline.md`
   - `PLAN_FILE`
   - `.plans/engineering-scope-onboarding-overhaul.md`
   - `.plans/overhaul-onboarding.md` (only sections relevant to `PLAN_FILE`)
   - `.map/README.md` and `.map/conventions.md` — ground-truth CUNY SSO selectors, timing, and input rules (always authoritative over any prior assumption in plan docs)
   - `.map/pages/<relevant-page>.md` for every CUNY page your plan touches
2. Treat the plan’s **Validation Gate** as a hard stop/go decision.
3. If scope is ambiguous, choose the most conservative implementation that satisfies the plan.
4. Do not modify plan docs unless explicitly asked.
5. Do not start work from any subsequent `plan-(XX+1)` file.
6. Preserve security invariants:
   - no plaintext sensitive secrets to disk
   - no master/extension password persisted improperly
   - no unsafe auth retry loops
7. Site map is the source of truth. If a plan doc says one thing and `.map/` says another, `.map/` wins. Flag the discrepancy in your report.

## E2E test gating

The e2e suite uses a `PLAN_GATE` environment variable to skip tests for unimplemented plans. When you implement plan N:

```bash
PLAN_GATE=N npm run test:e2e
```

This runs tests for plans 1–N and skips plans N+1–12. The default (`PLAN_GATE=5`) runs only the originally-merged test suite with no new failures.

**Spec files:**
- `e2e/onboarding.spec.ts` — plans 01–05 (always run, no gate)
- `e2e/onboarding-guided.spec.ts` — plans 06–08 (`describePlan(6/7/8, ...)` blocks)
- `e2e/onboarding-completion.spec.ts` — plans 09–12 (`describePlan(9/10/11/12, ...)` blocks)

**Overlay DOM attributes** — your plan-06+ implementation must set these on content-script-injected elements so e2e tests can assert on them:
- `data-cuny-autologin-overlay="true"` — dim layer div
- `data-cuny-autologin-highlight="true"` — attribute added to the target element
- `data-cuny-autologin-tooltip="true"` — tooltip bubble div
- `data-cuny-autologin-step-chip="true"` — "Step N of M" chip div

**Sidebar data attributes** required by completion/interruption tests:
- `data-onboarding-recovery-message="true"` — shown when overlay target not found or Deny clicked
- `data-onboarding-oaa-home-loading="true"` — shown while waiting for factor-panel elements after Manage click
- `data-onboarding-secret-confirmed="true"` — shown after secret captured
- `data-onboarding-five-factor-limit="true"` — shown when TOTP Add option is oj-disabled
- `data-onboarding-verify-later-recovery="true"` — shown when unverified factor detected
- `data-onboarding-verify-pause="true"` — shown after second consecutive server-side OTP failure
- `data-onboarding-reopen-cuny="true"` — "Reopen CUNY tab" button
- `data-onboarding-resume="true"` — resume prompt after sidebar close mid-flow
- `data-onboarding-ext-password-input="true"` / `data-onboarding-ext-password-confirm="true"`
- `data-onboarding-ext-password-strength="true"` / `data-onboarding-ext-password-match-indicator="true"`
- `data-onboarding-ext-password-forward="true"` / `data-onboarding-biometric-skip="true"` / `data-onboarding-biometric-use="true"`
- `data-onboarding-demo-skip="true"` / `data-onboarding-demo-show="true"` / `data-onboarding-demo-status="true"`

## Execution workflow
1. **Scope lock**
   - Summarize `PLAN_FILE` objective, in-scope, out-of-scope.
   - List concrete files you expect to change.
2. **Implement**
   - Make minimal, reviewable changes tied to the plan tasks.
   - Keep behavior idempotent and guard unknown states.
   - Use selectors from `.map/pages/` — never guess or invent DOM selectors.
3. **Verify**
   - Run the exact required tests from `PLAN_FILE`.
   - Run `PLAN_GATE=N npm run test:e2e` where N = this plan's number.
   - Run any additional focused tests needed to prove no regression in touched areas.
4. **Gate check**
   - Evaluate each validation criterion from `PLAN_FILE` one by one.
   - If any criterion fails, do not claim completion.
5. **Report**
   - Return evidence in the format below.

## Required output format
Use this exact structure in your final report:

### Plan Executed
- `PLAN_FILE`: <path>
- Objective: <one sentence>

### Scope Confirmation
- In Scope delivered:
  - <bullet list>
- Out of Scope preserved:
  - <bullet list>

### Changes Made
- Files changed:
  - `<path>`: <what changed and why>

### Test Evidence
- Commands run:
  - `<command>` -> `<pass/fail>`
- Key results:
  - <important assertions>

### Validation Gate Checklist
- [ ] <criterion 1> — PASS/FAIL with proof
- [ ] <criterion 2> — PASS/FAIL with proof
- [ ] <criterion 3> — PASS/FAIL with proof

### Risks / Follow-ups
- Residual risks:
  - <if any>
- Explicitly deferred (must be in later plan):
  - <list mapped to later plan files>

### Completion Decision
- `READY_FOR_NEXT_PLAN` or `NOT_READY`
- Reason: <short justification>

## Operator handoff contract
- You may proceed to the next plan only if completion decision is `READY_FOR_NEXT_PLAN`.
- If `NOT_READY`, provide the smallest fix list required to pass this plan’s validation gate.

## How to invoke this prompt
Copy this prompt, then set:
- `PLAN_FILE=.plans/agents/plan-02-onboarding-architecture-skeleton.md`

Then run agent execution with this instruction:
"Use `.plans/operator-prompt.md` and execute only `$PLAN_FILE`. You are encouraged to use subagents when you find tasks that can be done in parallel."
