# Plan 08: Phase 2 Verify and Set Default

## Objective
Implement Screen 10 and 10a reliability behavior, including retry limits and default-factor confirmation.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-07-phase2-guided-steps-allow-to-secret.md`

## In Scope
- Verify and Save interaction handling with two distinct failure modes.
- One automatic code regeneration on first server-side failure only.
- User-driven retry only after second failure.
- Set-as-default two-click guided flow via accessibility tree.
- Success gated by confirmed default marker, not menu interaction.

## Out of Scope
- Extension password and biometrics steps.

## Confirmed selectors (from `.map/` live observation)

| Interaction | Selector / method |
|-------------|-------------------|
| OTP code input (enroll verify) | `getElementById('otp\|input')` + **keystroke simulation only** — `setInputValue` fails silently |
| Verify and Save button | `querySelector('button')` + text filter `"Verify and Save"` |
| Client-side error (bad format) | `querySelector('div.oj-messaging-inline-container')` text contains `"Enter a OTP code"` |
| Server-side error (wrong code) | `querySelector('div.oj-messaging-inline-container')` text contains `"Incorrect code"` |
| Factor kebab menu | `querySelector('oj-menu-button.oj-button-sm')` inside `factor-panel` for target factor |
| Set as Default | A11y tree snapshot after kebab menu opens → `menuitem` UID with text `"Set as Default"` |
| Default confirmation | Poll `factor-panel[factor]` JSON for `factorIsPreferred: true` every 100ms; ~1.2s propagation |

**Critical**: `otp|input` on the enrollment verify page requires keystroke simulation (dispatched `KeyboardEvent` per character). `setInputValue` produces a client-side "Enter a OTP code" error because the JET/Knockout.js observable for this specific input is not updated by the native setter. This is **different** from `otpValue|input` on the login challenge page, where `setInputValue` works.

## Two distinct failure modes — handle them differently

| Mode | Error text | Trigger | Action |
|------|-----------|---------|--------|
| Client-side | `"Enter a OTP code"` | JET model was empty (keystroke simulation failed or was skipped) | Do NOT auto-retry; show message and re-enter code via keystrokes |
| Server-side | `"Incorrect code"` | TOTP code was delivered but rejected by server | Auto-retry once: regenerate code → keystroke-simulate into `otp\|input` → click Verify and Save |

Only the server-side failure triggers the one automatic regeneration. A client-side error means the input interaction itself failed — the auto-retry path assumes delivery succeeded, so retrying without fixing the delivery problem just produces another client-side error.

## Set-as-Default flow: timing and polling

1. Click kebab menu button (`querySelector('oj-menu-button.oj-button-sm button')` inner button)
2. Take accessibility tree snapshot
3. Find `menuitem` with text `"Set as Default"` in floating overlay; click its UID
4. Poll `factor-panel[factor]` JSON every 100ms for `factorIsPreferred: true`
5. Timeout at 2000ms; emit `TARGET_NOT_FOUND` if no confirmation by then
6. Do NOT advance sidebar state on the menu click alone — wait for `factorIsPreferred` flip

Expected propagation: ~1.1–1.2 seconds.

## Implementation Tasks
1. Implement verification outcome detector: distinguish client-side vs. server-side error by text match.
2. Implement keystroke simulation for `otp|input` (per-character `KeyboardEvent` dispatch).
3. Implement first-failure auto-regenerate on server-side error only.
4. Implement second-failure pause and guidance messaging.
5. Implement Screen 10a two-click sequence (kebab inner button → A11y UID → Set as Default).
6. Implement default-state confirmation polling (100ms interval, 2s timeout).
7. Add E2E tests for:
   - first failure (server-side) branch — auto-regenerate fires
   - client-side failure branch — no auto-regenerate
   - second failure pause branch
   - set-default success and false-positive prevention

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/content/content.test.ts src/cuny/ssoSite.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "verify|retry|set default"`

## Validation Gate
- Retry logic strictly follows one automatic attempt then user-driven flow.
- No auto-advance based on menu open/click without default marker confirmation.
- Success transitions only on verified default state.

## Evidence Required
- Retry branch traces and assertions.
- Default-marker detection assertion evidence.
- Command outputs and exits.

## Rollback Notes
- Preserve guided steps through Screen 9 while disabling automatic Screen 10 retry logic if instability appears.
