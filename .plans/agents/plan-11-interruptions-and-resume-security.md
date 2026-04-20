# Plan 11: Interruptions and Resume Security

## Objective
Implement and validate interruption handling across sidebar close, CUNY tab close, and browser restart while preserving session-only security posture.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-10-phase3-biometrics-and-completion.md`

## In Scope
- Resume-from-last-safe-step after sidebar close.
- Reopen-CUNY-tab affordance and reattach behavior during guided steps.
- Browser-close reset behavior that clears in-flight onboarding state by design.

## Out of Scope
- New feature additions unrelated to interruption handling.

## Implementation Tasks
1. Define resumable vs non-resumable onboarding states.
2. Implement sidebar-close resume state restoration.
3. Implement CUNY tab missing detection and reopen action.
4. Implement browser restart reset behavior and messaging.
5. Add integration/unit tests for session-only resume semantics.
6. Add E2E for all three interruption scenarios.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/vaultSession/snapshot.test.ts src/background/service-worker.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "resume|sidebar close|tab close|browser restart"`

## Validation Gate
- Sidebar close resumes only to a safe state without data loss beyond policy.
- CUNY tab close can be recovered with explicit user action.
- Browser restart clears in-flight sensitive onboarding data from session context.

## Evidence Required
- Resume-state table (event -> resulting state).
- E2E interruption run evidence for all three cases.
- Command outputs and exits.

## Rollback Notes
- If resume logic is unsafe or inconsistent, disable resume and keep secure restart-from-beginning behavior.
