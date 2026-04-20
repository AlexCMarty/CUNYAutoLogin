# Plan 08: Phase 2 Verify and Set Default

## Objective
Implement Screen 10 and 10a reliability behavior, including retry limits and default-factor confirmation.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-07-phase2-guided-steps-allow-to-secret.md`

## In Scope
- Verify and Save interaction handling.
- One automatic code regeneration on first failure.
- User-driven retry only after second failure.
- Set-as-default two-click guided flow.
- Success gated by confirmed default marker, not menu interaction.

## Out of Scope
- Extension password and biometrics steps.

## Implementation Tasks
1. Implement verification outcome detector and first-failure auto-regenerate behavior.
2. Implement second-failure pause and guidance messaging.
3. Implement Screen 10a two-click sequence (kebab -> set default).
4. Implement default-state confirmation check before advancing.
5. Add E2E tests for:
   - first failure branch
   - second failure pause branch
   - set-default success and false-positive prevention

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/content/content.test.ts src/cuny/ssoSite.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "verify|retry|set default"`

## Validation Gate
- Retry logic strictly follows one automatic attempt then user-driven flow.
- No auto-advance based on menu open/click without default marker confirmation.
- Success transitions only on verified default state.

## Evidence Required
- Retry branch traces and assertions.
- Default-marker detection assertion evidence.
- Command outputs and exits.

## Rollback Notes
- Preserve guided steps through Screen 9 while disabling automatic Screen 10 retry logic if instability appears.
