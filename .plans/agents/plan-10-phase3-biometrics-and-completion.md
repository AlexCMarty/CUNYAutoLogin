# Plan 10: Phase 3 Biometrics and Completion

## Objective
Implement Screens 12, 12a, and 13, including conditional biometric onboarding and final live demo completion behavior.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-09-phase3-extension-password.md`

## In Scope
- Conditional biometric offer screen based on platform authenticator availability.
- Biometric prep screen before native prompt.
- Failure/denial fallback to extension password path.
- Final completion screen with demo trigger and skip path.
- Sidebar narration updates during demo run.

## Out of Scope
- Interruption/resume semantics across sidebar/tab/browser close.

## Implementation Tasks
1. Implement biometric availability branch logic.
2. Implement prep dialog and prompt trigger sequence.
3. Implement denial/retry/fallback handling with confirmation messaging.
4. Implement completion screen, Show me action, and Skip path.
5. Add unit tests for branch and fallback logic.
6. Add E2E tests for completion via demo and completion via skip.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/onboarding/*.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "biometric|completion|show me|skip"`

## Validation Gate
- Both biometric and password-only paths can complete onboarding.
- Completion is recorded consistently whether user picks demo or skip.
- Demo narration and tab actions stay synchronized within expected tolerance.

## Evidence Required
- Branch coverage summary for biometric available/unavailable paths.
- E2E evidence for demo and skip completion.
- Command outputs and exits.

## Rollback Notes
- If biometric path is unstable, gate it while preserving password-only completion path.
