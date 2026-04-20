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
2. Treat the plan’s **Validation Gate** as a hard stop/go decision.
3. If scope is ambiguous, choose the most conservative implementation that satisfies the plan.
4. Do not modify plan docs unless explicitly asked.
5. Do not start work from any subsequent `plan-(XX+1)` file.
6. Preserve security invariants:
   - no plaintext sensitive secrets to disk
   - no master/extension password persisted improperly
   - no unsafe auth retry loops

## Execution workflow
1. **Scope lock**
   - Summarize `PLAN_FILE` objective, in-scope, out-of-scope.
   - List concrete files you expect to change.
2. **Implement**
   - Make minimal, reviewable changes tied to the plan tasks.
   - Keep behavior idempotent and guard unknown states.
3. **Verify**
   - Run the exact required tests from `PLAN_FILE`.
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
"Use `.plans/operator-prompt.md` and execute only `$PLAN_FILE`."
