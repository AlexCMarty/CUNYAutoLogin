Use `.plans/operator-prompt.md` and execute only `@.plans/agents/plan-07-phase2-guided-steps-allow-to-secret.md`.
You are encouraged to use subagents when tasks can be done in parallel.

## Critical starting point (must preserve)

You are resuming from a repo where **plans 01–06 are fully implemented, committed, and passing**.
The baseline commit is `3e1080a`. Do not redo or alter that work except where plan-07 explicitly requires it.

```
3e1080a feat(onboarding): plan-06 overlay engine with TargetSpec
6ae4627 chore: updated handoff p5 to p6
9ff7ab7 docs: update agent docs with PLAN_GATE test gating and new fixture inventory
bac003d docs(plans): update operator-prompt with .map/ rules and PLAN_GATE workflow
0c31fc7 test(e2e): add exhaustive fixture infrastructure and plan-gated specs for plans 06-12
682736c fix(content): use keystroke simulation for otp|input on enroll-verify
4588995 docs: align plans 06-08 with verified site map
...
```

## Current test baseline

```
npm run typecheck            → clean
npm run test:unit            → 399 tests passing (17 files)
PLAN_GATE=6 npm run test:e2e → 29 passing, 51 skipped, 0 failing
```

After implementing plan-07 the target is:
```
PLAN_GATE=7 npm run test:e2e → 29 + plan-07 tests passing, plan-08+ skipping
```

## What plan-06 delivered (do NOT re-implement)

Read the code before designing — do not invent parallel abstractions.

### `src/content/overlay.ts` (new module)
Reusable overlay engine. Plan-07 must **consume** this module, not replicate it.

- `showOverlay(spec: TargetSpec, tooltipText, stepIndex, stepTotal, onNotFound)`
- `hideOverlay()`
- `TargetSpec = CssTarget | A11yTarget` (exported from `src/onboarding/messages.ts`; re-exported from `overlay.ts`)
  - `CssTarget`: `{ type: 'css', selector }` → `document.querySelector`
  - `A11yTarget`: `{ type: 'a11y', text }` → matches `[role="menuitem"]` by exact text. **This is the path plan-07 must use for `oj-option#ChallengeOMATOTP`** — do not try a CSS selector, `oj-option` has `display:none` even when the menu is visually open.
- Renders `data-cuny-autologin-overlay`, `data-cuny-autologin-highlight`, `data-cuny-autologin-tooltip`, `data-cuny-autologin-step-chip`.
- Dim layer uses `pointer-events:none` so the target stays clickable.
- On target click, overlay auto-hides (one-shot listener installed when the ring is attached).
- On target not found within `OVERLAY_TARGET_TIMEOUT_MS` (5s), calls `onNotFound`.

### Overlay command wire protocol (already in place)
The plan-07 guided sequencer should **issue show/hide commands via this existing protocol** rather than invent a new one.

- `OnboardingOverlayCommand` in `src/onboarding/messages.ts` already has `action`, `targetSpec`, `tooltipText`, `stepIndex`, `stepTotal`. Guard: `isOnboardingOverlayCommand`.
- Delivery is **pull-based**, not push:
  1. Sidebar screen mount → `browser.runtime.sendMessage(ONBOARDING_OVERLAY_COMMAND{action:"show", ...})`.
  2. Service worker stores it in the module-level `stagedOverlayCommand` (see `service-worker.ts` and `__test_getStagedOverlayCommand`).
  3. Content script on every page load sends `ONBOARDING_CONTENT_SCRIPT_READY`; SW responds `{ overlayCommand }`.
  4. Content script's `executeOverlayCommand` calls `showOverlay` or `hideOverlay`.
  5. Target-not-found fires `ONBOARDING_STAGE_DETECTED{stage:"target_not_found"}`.
- Unmounting a screen sends `action:"hide"` which clears the SW's staged command. **Plan-07 screens should follow this same pattern** — stash the show command on mount, clear on unmount.
- `target_not_found` is handled in `render.ts`'s runtime bridge: it un-hides `[data-onboarding-recovery-message='true']` inside the active screen host. Plan-07 recovery surfaces (`data-onboarding-verify-later-recovery`, etc.) are **different** attributes and need their own logic; don't collapse them.

### `src/onboarding/messages.ts`
- New types exported: `CssTarget`, `A11yTarget`, `TargetSpec`.
- `ONBOARDING_PAGE_STAGES` already includes `"target_not_found"`. Adding plan-07 stages (if any) means extending this array; keep the existing values in place.
- The guard `isOnboardingOverlayCommand` already validates `targetSpec`. Do not relax it.

### `src/onboarding/screens/allowGate.ts`
Already sends show-overlay for `button[onclick="allow()"]` on mount and hide on unmount. Plan-07 **refines** Screen 5's behavior (auto-advance on Allow click, Deny-path recovery) but the overlay wiring is done — reuse `sendShowOverlayCommand`/`sendHideOverlayCommand` pattern.

The recovery `<p data-onboarding-recovery-message='true'>` is already in the DOM, hidden until `target_not_found`. Plan-07's Deny handling should reuse this same element.

### `src/content/content.ts`
Already wires `ONBOARDING_CONTENT_SCRIPT_READY` on load and `executeOverlayCommand`. Plan-07 adds **page-specific content-script behaviors** (auto-click Manage on `oaa-spa-home`, fill `name|input`, scrape secret) but must leave the overlay pull-on-ready path alone.

Auto-click of Manage etc. should be triggered by the incoming overlay command's targetSpec OR by a new dedicated mechanism — pick one and justify it; do not duplicate the existing show pipeline with a parallel "click on behalf of student" pipeline unless plan-07 explicitly requires it (the plan only says the extension auto-clicks Manage; everything else is student-driven, overlay-highlighted).

### `src/sidebar/sidebar.ts`
Plan-06 added a **dev/e2e-only `hashchange` → `location.reload()` listener**. This fixes the test pattern where `setupToAllowGate` navigates no-hash first (for `setupVault`) then to `#onboarding=1` — Chromium does not reload on hash-only changes, so `bootSidebar()` would otherwise have already committed to the legacy vault path. The listener folds away in production via the existing `DEV_MODE_NAMES` guard. **Do not remove it.**

### `src/content/overlay.test.ts` (new, 17 tests)
Covers show/hide lifecycle, CSS + a11y resolvers, missing-target fallback, anchor placement. If plan-07 adds behavior to the overlay engine itself, extend this file; don't create a second overlay test file.

## Things plan-07 needs that do NOT yet exist

Only listing shape-of-the-work; the plan doc is the contract.

- `ONBOARDING_OAA_SPA_HOME` state between `ALLOW_GATE` and `GUIDED_STEP_1` (per plan-07 §Critical).
- Guided-step state machine entries: `GUIDED_MANAGE`, `GUIDED_ADD_FACTOR`, `GUIDED_FACTOR_TYPE`, `GUIDED_NAME`, `GUIDED_SECRET`, etc. (see plan-07 task list).
- Per-step context copy in the sidebar with the required `data-onboarding-*` markers from `operator-prompt.md §Sidebar data attributes` (`data-onboarding-oaa-home-loading`, `data-onboarding-secret-confirmed`, `data-onboarding-five-factor-limit`, `data-onboarding-verify-later-recovery`).
- Content-script SPA-view detection at `/oaa/rui/index.html?h_ra=1` (four views share one URL — see `.map/README.md §Critical: the Oracle Universal Authenticator SPA` for the exact detection order; do not use URL matching).
- Factor-panel JSON parsing for unverified-factor detection (`.map/conventions.md §8`).

## Scope guard for this run

- Execute only plan-07 guided steps from Allow gate through secret capture.
- Do not implement Verify Login Code flow or Set-as-Default (plan-08).
- Do not touch vault encryption, extension password screen, or biometrics (plans 09–10).
- Keep plan-06 overlay engine, message protocol, and test baseline intact.
- `.map/` is still the source of truth; re-read `.map/pages/oaa-spa-home.md`, `.map/pages/factors-list.md`, `.map/pages/totp-enroll-secret.md`, and `.map/conventions.md` before writing any selector.

## Implementation discipline

- Read `src/content/overlay.ts`, `src/content/content.ts`, `src/onboarding/messages.ts`, and `src/onboarding/screens/allowGate.ts` before planning your changes. The patterns they establish are the patterns plan-07 should extend.
- When a plan-07 screen needs to highlight a CUNY element, it sends `ONBOARDING_OVERLAY_COMMAND{action:"show", targetSpec:…}` on mount and `{action:"hide"}` on unmount. That's it. Do not add a new message type or a new storage slot.
- Use the a11y `TargetSpec` for `oj-option#ChallengeOMATOTP` (confirmed in `.map/conventions.md §4`).
- Prefer additive changes. Never remove a `data-onboarding-*` or `data-cuny-autologin-*` attribute that an e2e test already asserts on.
- Run `PLAN_GATE=7 npm run test:e2e` as your gate. The plan-07 e2e tests are already in `e2e/onboarding-guided.spec.ts` under `describePlan(7, …)` — do not modify them; make the implementation satisfy them.
- If a plan-07 task appears ambiguous after reading `.map/` + the plan doc, stop and ask before inventing.
