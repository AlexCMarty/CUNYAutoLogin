Use `.plans/operator-prompt.md` and execute only `@.plans/agents/plan-06-overlay-engine-core.md`.
You are encouraged to use subagents when tasks can be done in parallel.

## Critical starting point (must preserve)

You are resuming from a repo where **plans 01–05 are fully implemented, committed, and passing**.
The baseline commit is `9ff7ab7`. Do not redo or alter that work except where plan-06 explicitly requires it.

```
9ff7ab7 docs: update agent docs with PLAN_GATE test gating and new fixture inventory
bac003d docs(plans): update operator-prompt with .map/ rules and PLAN_GATE workflow
0c31fc7 test(e2e): add exhaustive fixture infrastructure and plan-gated specs for plans 06-12
682736c fix(content): use keystroke simulation for otp|input on enroll-verify
4588995 docs: align plans 06-08 with verified site map
1e8ee16 docs: updated agent documentation to include .map/
a733954 docs: add canonical site map as implementation source of truth
...
0525eed fix(content): require #serverError DOM marker on /auth_cred_submit (plan-05)
```

## What has changed since the handoff was originally written

### `.map/` — canonical site map (new, authoritative)

A real-browser agent navigated the live CUNY SSO site and produced `.map/`. This is now the ground truth for all selectors, timing, and DOM behavior. **Read `.map/README.md` and `.map/conventions.md` before touching any CUNY-facing code.** If `.map/` and a plan doc conflict, `.map/` wins.

Key facts relevant to plan-06:
- `otpValue|input` (TOTP login challenge): `setInputValue` ✅ works
- `otp|input` (enrollment verify): `setInputValue` ❌ fails — **already fixed in `682736c`**, uses `simulateKeystrokes` now
- Allow button selector: `querySelector('button[onclick="allow()"]')`
- Overlay must use accessibility tree snapshot for `oj-option` menu items (they have `display:none` even when menu is visually open)
- The SPA at `/oaa/rui/index.html?h_ra=1` has four views detected by DOM content (see `.map/README.md` for detection order)

### `682736c` — `otp|input` keystroke fix (already done — do not redo)

`tryFillMfaEnrollVerifyOtp` in `content.ts` now uses `simulateKeystrokes()` instead of `setInputValue()` for the enrollment verify OTP input. `simulateKeystrokes` is exported from `content.utils.ts` with full unit test coverage (8 new tests). **Plan-08 does not need to implement this — it is already in the codebase.**

### `4588995` — plan-06/07/08 docs updated with ground-truth selectors

Plans 06, 07, and 08 have been updated with confirmed selectors from `.map/`. Critical changes for plan-06:

**plan-06 now includes a `TargetSpec` union type requirement:**
```typescript
type CssTarget = { type: 'css'; selector: string };
type A11yTarget = { type: 'a11y'; text: string };
type TargetSpec = CssTarget | A11yTarget;
```
The overlay engine must support both. A11y UID click is required for `oj-option` items inside Oracle JET menus.

### `0c31fc7` — exhaustive e2e test infrastructure (58 new tests, all skipped by default)

All e2e tests for plans 06–12 are pre-written in:
- `e2e/onboarding-guided.spec.ts` — plans 06–08
- `e2e/onboarding-completion.spec.ts` — plans 09–12

They are **skipped** at `PLAN_GATE=5` (default) and will run when you set `PLAN_GATE=6`.

**Required DOM attributes for plan-06 implementation** (the e2e tests assert on these exact attribute names):
- `data-cuny-autologin-overlay="true"` — dim layer div injected into CUNY tab
- `data-cuny-autologin-highlight="true"` — added to the target element itself
- `data-cuny-autologin-tooltip="true"` — tooltip bubble div
- `data-cuny-autologin-step-chip="true"` — "Step N of M" chip div

**Required sidebar attribute for the fallback test:**
- `data-onboarding-recovery-message="true"` — shown in sidebar when `TARGET_NOT_FOUND` is emitted

**New fixtures available** (no need to create them):
- `allow-gate.html` at `/cunylogin/pages/mfaConsent.jsp` — has `button[onclick="allow()"]`, `button[onclick="deny()"]`
- `self-service.html?view=home` — has `id="categoryActionheader"` and Manage button
- `self-service.html?view=factors` — has `factor-panel` elements and Add menu
- `self-service.html?view=factors&full=1` — 5 factors, `ChallengeOMATOTP` has `oj-disabled`
- (and more — see `e2e/constants.ts` for the full list)

## Current test baseline

```
npm run test:unit           → 382 tests passing (16 files)
PLAN_GATE=5 npm run test:e2e → 22 passing, 58 skipped (0 failing)
```

After implementing plan-06, the target is:
```
PLAN_GATE=6 npm run test:e2e → 22 + plan-06 tests passing, plan-07+ skipping
```

## Scope guard for this run

- Execute only plan-06 overlay engine core.
- Keep plan-05 behavior and all existing tests intact (22 passing e2e, 382 unit).
- Do not implement guided step logic (plan-07), verify/default logic (plan-08), or any state machine for oaa-spa-home (plan-07).
- Do not refactor unrelated onboarding architecture.
- `ALLOW_GATE` screen copy is still a plan-05 stub — expected and acceptable.

## Implementation discipline

- Read `.map/README.md` and `.map/conventions.md` before writing any CUNY selector.
- Read `.plans/agents/plan-06-overlay-engine-core.md` for the updated TargetSpec requirements.
- Run `PLAN_GATE=6 npm run test:e2e` as your verification command (not just the typecheck).
- Make minimal, targeted changes.
- Prefer additive plan-06 work over restructuring.
- If uncertain whether a change is in scope, stop and ask.
