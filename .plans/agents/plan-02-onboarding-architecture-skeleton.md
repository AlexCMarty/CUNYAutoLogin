# Plan 02: Onboarding Architecture Skeleton

## Objective
Create the onboarding module scaffolding and routing seams so new screen-flow logic can be added incrementally without destabilizing existing setup/locked/unlocked behavior.

## Dependencies
- `plan-01-test-gate-baseline.md`

## In Scope
- Introduce `src/onboarding/*` module boundaries (types, transitions, render contracts).
- Add a side-panel entry seam to host onboarding flow in parallel with legacy vault UI path.
- Keep current behavior as default unless explicitly switched.

## Out of Scope
- Final onboarding UI copy implementation.
- Content-script overlay behavior.

## Implementation Tasks
1. Create onboarding module skeleton:
   - `src/onboarding/state.ts`
   - `src/onboarding/transitions.ts`
   - `src/onboarding/render.ts`
2. Define screen-state enum and stage-bead mapping contract.
3. Add minimal side-panel integration point in `src/sidebar/sidebar.ts`.
4. Add feature-toggle or mode branch preserving current `setup|locked|unlocked` flow.
5. Add narrow unit tests for transition table and state guards.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/onboarding/*.test.ts`
- `npm run test:unit -- src/popup/popup.test.ts src/vaultSession/snapshot.test.ts`

## Validation Gate
- Legacy setup, locked, and unlocked flows remain operational.
- New onboarding modules compile and are covered by basic transition tests.
- No security storage regression from route wiring.

## Evidence Required
- Files added/updated summary.
- Transition table tested states list.
- Command outputs and exits.

## Rollback Notes
- If integration destabilizes popup/sidebar behavior, disable onboarding route branch and revert to legacy entry.
