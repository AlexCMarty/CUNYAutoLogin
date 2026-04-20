# Plan 03: Message Protocol Hardening

## Objective
Introduce typed, guarded onboarding runtime messaging across sidebar/background/content before adding multi-step orchestration.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-02-onboarding-architecture-skeleton.md`

## In Scope
- Define discriminated unions for onboarding message types and payloads.
- Add runtime guards for all onboarding messages.
- Enforce default-reject behavior for unknown messages.

## Out of Scope
- Full guided CUNY flow behavior.
- Overlay rendering details.

## Implementation Tasks
1. Add shared onboarding message types module.
2. Update `src/background/service-worker.ts` to narrow and handle onboarding messages safely.
3. Update content and sidebar message consumers to use shared types.
4. Add unit tests for:
   - valid message acceptance
   - invalid payload rejection
   - unknown type rejection
5. Ensure development-only messages remain development-only.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/background/service-worker.test.ts`
- `npm run test:unit -- src/content/content.test.ts`

## Validation Gate
- Invalid or unknown message payloads cannot trigger onboarding state mutations.
- Existing `AUTO_FILL_REQUEST` and `TOTP_SECRET_FROM_PAGE` behavior remains intact.

## Evidence Required
- Message type matrix (type -> accepted payload shape).
- Rejection-path test evidence.
- Command outputs and exits.

## Rollback Notes
- If message narrowing causes runtime breakage, revert onboarding handlers first and keep existing core message paths untouched.
