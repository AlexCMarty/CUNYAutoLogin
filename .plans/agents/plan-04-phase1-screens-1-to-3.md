# Plan 04: Phase 1 Screens 1-3

## Objective
Implement the trust-first onboarding entry screens (Welcome, Email, Password) with clear validation and stage progression.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-02-onboarding-architecture-skeleton.md`

## In Scope
- Screen 1 welcome trust copy.
- Screen 2 email capture with `@login.cuny.edu` guidance and validation.
- Screen 3 password capture with show/hide and forward gating.
- Stage bead shell rendering for early flow.

## Out of Scope
- Opening CUNY tab and credential submission.
- Wrong-credential detection and error banner.

## Implementation Tasks
1. Implement screen components/states for 1-3 in onboarding renderer.
2. Add input validation and button enable/disable logic.
3. Implement forward/back transitions according to approved flow.
4. Add unit tests for:
   - valid and invalid email transitions
   - password non-empty transition
   - back navigation rules
5. Add E2E smoke for reaching screen 3 and navigating back/forward.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/onboarding/*.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "screens 1-3"`

## Validation Gate
- User can reliably reach Screen 3 from Screen 1.
- Incorrect email domain blocks progress with clear hint.
- No regression in pre-existing vault session bootstrap behavior.

## Evidence Required
- Screen-state transition log.
- E2E smoke result showing forward and back correctness.
- Command outputs and exits.

## Rollback Notes
- Revert to skeleton onboarding route while keeping module boundaries if validation fails.
