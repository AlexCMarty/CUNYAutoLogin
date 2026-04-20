# Plan 09: Phase 3 Extension Password

## Objective
Implement secure extension-password setup screen behavior (Screen 11) with validation gates and storage invariants preserved.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-08-phase2-verify-and-set-default.md`

## In Scope
- Screen 11 password and confirm-password inputs.
- Strength indicator and minimum threshold gating.
- Match validation and button enablement.
- Vault save path correctness with encrypted local storage only.

## Out of Scope
- Biometric prompt path and final demo.

## Implementation Tasks
1. Implement Screen 11 UI and validation logic.
2. Integrate save action with existing vault encryption path.
3. Ensure staged session secrets are consumed/cleared correctly.
4. Add unit tests for:
   - strength threshold behavior
   - match/mismatch behavior
   - save eligibility
5. Add security regression checks on storage key usage.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/popup/popup.test.ts src/crypto/vault.test.ts src/vaultSession/snapshot.test.ts`

## Validation Gate
- Screen 11 only advances on valid strength + matching passwords.
- No plaintext credential, master password, or secret is written to disk.
- Lock/unlock invariants remain intact.

## Evidence Required
- Validation matrix (input combinations -> expected state).
- Storage write audit summary for affected paths.
- Command outputs and exits.

## Rollback Notes
- If save path regresses, keep Screen 11 UI disabled and revert to prior secure persistence flow.
