# Plan 05: Phase 1 Screen 4 and Credential Errors

## Objective
Implement the transition into CUNY login flow and robust wrong-credential recovery with explicit no-loop behavior.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-03-message-protocol-hardening.md`
- `plan-04-phase1-screens-1-to-3.md`

## In Scope
- Screen 4 tab-opening flow and status narration.
- Detection of failure to advance after credential submission.
- Wrong-credential return routing to editable input with inline error.
- Extension-authored CUNY tab banner for source clarity.

## Out of Scope
- Guided overlay click sequence for self-service pages.

## Implementation Tasks
1. Implement open-tab trigger to CUNY login URL.
2. Add state wait and detection for success transition to Allow gate.
3. Add wrong-credential detection and likely-field routing.
4. Add extension-branded banner rendering on CUNY tab.
5. Enforce hard block on automatic repeated submit.
6. Add E2E tests for success path and wrong-credential branch.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/background/service-worker.test.ts src/content/content.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "screen 4|wrong credentials|allow gate"`

## Validation Gate
- Wrong credentials never trigger repeated automatic submission.
- User is returned to correction state with prefilled data and clear error.
- Success branch reaches Allow gate detection.

## Evidence Required
- Proof of single-submit behavior under credential error.
- Banner screenshot or DOM assertion evidence in E2E output.
- Command outputs and exits.

## Rollback Notes
- Disable new screen 4 auto-open branch and preserve screens 1-3 if this plan fails validation.
