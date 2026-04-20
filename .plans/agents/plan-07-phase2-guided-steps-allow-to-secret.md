# Plan 07: Phase 2 Guided Steps Allow to Secret

## Objective
Implement guided flow from Allow gate through secret capture with synchronized sidebar messaging and overlay sequencing.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-05-phase1-screen4-and-credential-errors.md`
- `plan-06-overlay-engine-core.md`

## In Scope
- Screen 5 Allow gate guidance.
- Screens 6-9 sequence: Manage -> Add factor -> Mobile Authenticator -> Verify Now context.
- Sidebar step-specific context copy updates.
- Secret capture confirmation update in sidebar.
- Five-factor edge pause behavior and user guidance.

## Out of Scope
- Verify-and-save retry policy and set-as-default completion logic.

## Implementation Tasks
1. Implement selectors and detectors for each guided sub-step.
2. Bind overlay commands to detected step transitions.
3. Implement sidebar copy updates for each guided step.
4. Implement five-factor maximum branch pause and instructions.
5. Add E2E for happy path to secret-capture checkpoint.
6. Add E2E for five-factor edge pause behavior.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/cuny/ssoSite.test.ts src/content/content.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "allow|manage|add factor|mobile authenticator|secret|five-factor"`

## Validation Gate
- Guided progression works through Screen 9 on happy path.
- Five-factor edge pauses flow with actionable messaging and no unsafe automation.
- Selector failure fails soft with recovery instructions (no silent hang).

## Evidence Required
- Step-by-step run log (detected page state -> commanded overlay step).
- Happy path and five-factor E2E evidence.
- Command outputs and exits.

## Rollback Notes
- If selector fragility is high, keep overlay core and gate guided sequence behind a temporary feature switch.
