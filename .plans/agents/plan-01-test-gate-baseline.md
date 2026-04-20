# Plan 01: Test Gate Baseline

## Objective
Establish the non-negotiable validation baseline so no subsequent onboarding work proceeds without reproducible test evidence.

## Dependencies
None.

## In Scope
- Define the exact verification command set used in every subsequent plan.
- Define pass/fail rules and acceptable retries.
- Define a standardized evidence format every implementing agent must return.

## Out of Scope
- Implementing onboarding UI or behavior changes.
- Refactoring existing tests unless baseline is red.

## Implementation Tasks
1. Confirm and document canonical commands:
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:e2e`
2. Define targeted run fallback for debugging:
   - `npm run test:unit -- src/<path>.test.ts`
   - `npx playwright test e2e/<spec>.spec.ts`
3. Define failure handling policy:
   - First failure: collect output and classify (flake vs deterministic).
   - If deterministic: fix before advancing.
   - If flaky: rerun once, then block if still failing.
4. Define required implementation report sections for all future plans.

## Required Tests
- Run baseline suite once before any onboarding changes:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run test:e2e`

## Validation Gate
- All three commands exit successfully.
- No skipped failing tests are allowed.
- If baseline is red, no later plan may start until this is resolved or explicitly deferred by user decision.

## Evidence Required
- Command list, start/end time, exit code.
- Short output summary for each command.
- If failures occurred, include root-cause classification and rerun result.

## Rollback Notes
- No rollback needed; this plan is process-only.
