# Plan 06: Overlay Engine Core

## Objective
Build a reusable overlay primitive in content context to support guided self-service steps with safe failure behavior.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-03-message-protocol-hardening.md`

## In Scope
- Dim layer and highlighted target ring.
- Tooltip attachment and placement strategy.
- Step-chip rendering contract.
- First-use primer support.
- Timeout and `TARGET_NOT_FOUND` fallback event.

## Out of Scope
- Full sequence logic for screens 5-10a.
- Default-factor success detection.

## Implementation Tasks
1. Create overlay module API (`show`, `update`, `hide`, `showError`).
2. Implement target lookup and placement fallback behavior.
3. Ensure click target remains interactable.
4. Emit fallback event when target not found within timeout.
5. Add unit/jsdom tests for:
   - render/hide lifecycle
   - anchor placement
   - missing target fallback

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/content/content.test.ts`

## Validation Gate
- Overlay appears and disappears cleanly.
- Overlay never blocks intended click target.
- Missing target always emits actionable fallback signal.

## Evidence Required
- API contract summary and tested scenarios.
- Test evidence for non-blocking click behavior.
- Command outputs and exits.

## Rollback Notes
- Keep message contracts; disable overlay command handling if rendering is unstable.
