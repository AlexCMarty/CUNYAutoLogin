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

## Target specification — two required click patterns

The overlay engine must support two click patterns. Using the wrong one silently fails on Oracle JET menus.

**Pattern 1 — CSS selector click** (most elements):
```typescript
type CssTarget = { type: 'css'; selector: string };
// document.querySelector(selector).click()
```

**Pattern 2 — Accessibility tree UID click** (required for `oj-menu-button` / `oj-option`):
```typescript
type A11yTarget = { type: 'a11y'; text: string };
// 1. Click inner <button> of oj-menu-button to open menu
// 2. Take accessibility tree snapshot (take_snapshot)
// 3. Find menuitem UID in floating overlay by text match
// 4. Click that UID
```

Why Pattern 2 is necessary: `oj-option` elements have `style="display:none"` even when the menu is visually open. They cannot be clicked via CSS selector. The accessibility tree snapshot exposes the rendered floating overlay's `menuitem` nodes and their UIDs.

`TargetSpec = CssTarget | A11yTarget`

Both patterns must be exercised in unit tests. An overlay command that specifies `{ type: 'a11y' }` and receives no snapshot UID match should emit `TARGET_NOT_FOUND`, not silently succeed.

## Implementation Tasks
1. Create overlay module API (`show`, `update`, `hide`, `showError`) with `TargetSpec` parameter.
2. Implement target lookup for both CSS and A11y patterns; placement fallback behavior.
3. Ensure click target remains interactable (dim layer behind highlight in z-order).
4. Emit fallback event when target not found within timeout.
5. Add unit/jsdom tests for:
   - render/hide lifecycle
   - anchor placement
   - missing target fallback (both patterns)

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
