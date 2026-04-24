# Plan 07: Phase 2 Guided Steps Allow to Secret

## Objective
Implement guided flow from Allow gate through secret capture with synchronized sidebar messaging and overlay sequencing.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-05-phase1-screen4-and-credential-errors.md`
- `plan-06-overlay-engine-core.md`

## In Scope
- Screen 5 Allow gate guidance.
- `oaa-spa-home` intermediate state: highlight Manage, then wait for factors-list to load after the user clicks it.
- Screens 6-9 sequence: Manage -> Add factor -> Mobile Authenticator -> Verify Now context.
- Sidebar step-specific context copy updates.
- Secret capture confirmation update in sidebar.
- Five-factor edge pause behavior and user guidance.
- Verify Later edge case: unverified factor detection and recovery routing.

## Out of Scope
- Verify-and-save retry policy and set-as-default completion logic.

## Critical: oaa-spa-home is a new intermediate state

The old assumption was `allow-gate → factors-list` directly. The live site shows:

```
allow-gate → [allow click] → oaa-spa-home → [student clicks Manage] → factors-list
```

`oaa-spa-home` detects via `document.getElementById('categoryActionheader') !== null`. The extension should highlight the Manage button (`getElementById('createNewCategory')` inner button — use `querySelector('oj-button#createNewCategory button')`) and wait for `factor-panel` elements to appear after the user clicks it.

The state machine in `onboarding/state.ts` needs a new state between `ALLOW_GATE` and `GUIDED_STEP_1` to represent this. The sidebar should prompt the student to click Manage, with an overlay on that control.

## Confirmed selectors (from `.map/` live observation)

| Step | Target | Selector / method |
|------|--------|-------------------|
| Allow gate | Allow button | `querySelector('button[onclick="allow()"]')` |
| oaa-spa-home | Manage button | `querySelector('oj-button#createNewCategory button')` |
| factors-list ready | Factor panels | `querySelectorAll('factor-panel').length > 0` (after ~19–25s) |
| Add Auth Factor | Add menu button | `querySelector('oj-menu-button.menu-button button')` |
| Select TOTP | ChallengeOMATOTP | `getElementById('ChallengeOMATOTP')` via a11y tree after menu open |
| Friendly name | Name input | `getElementById('name\|input')` + `setInputValue` ✅ |
| Secret extraction | Secret element | `querySelector('[aria-labelledby="key-labelled-by\|label"]').textContent` |
| Verify Now | Verify Now button | `querySelector('button')` + text filter `"Verify Now"` |

Note: `getElementById('ChallengeOMATOTP')` cannot be clicked directly — use the A11y tree UID pattern from plan-06 (the `oj-option` has `display:none` until rendered in the floating overlay).

## Edge case: Verify Later saves factor as Unverified

If the student clicks "Verify Later" on the totp-enroll-secret view, the factor is saved to CUNY with the friendly name but marked Unverified — it is **not** discarded. The factors-list view will show it with an unverified indicator.

Handling required: when the extension returns to `factors-list` after a Verify Later action, detect whether a factor with the expected friendly name (`factorAlias === 'CUNYAutoLogin'`) exists but has `factorIsValidated === false`. If so:
- Do not advance to GUIDED_STEP_5 (Set as Default)
- Route sidebar back to the enrollment verify step with message: "Your login method was saved but not verified yet. Click Verify to finish setting it up."
- Highlight the Verify option on the CUNYAutoLogin factor panel

## Implementation Tasks
1. Add `ONBOARDING_OAA_SPA_HOME` state to `onboarding/state.ts` + transitions table; update bead mapping.
2. Implement content script detector for `oaa-spa-home` view; emit stage event when `factor-panel` elements appear after user-driven Manage click.
3. Implement selectors and detectors for each guided sub-step (Allow → Add → TOTP type → Verify Now).
4. Bind overlay commands to detected step transitions (CSS pattern for most; A11y UID for TOTP menu item).
5. Implement sidebar copy updates for each guided step.
6. Implement five-factor maximum branch pause and instructions (`oj-option#ChallengeOMATOTP.oj-disabled` detection).
7. Implement Verify Later detection and recovery routing (unverified factor path).
8. Add E2E for happy path to secret-capture checkpoint.
9. Add E2E for five-factor edge pause behavior.

## Required Tests
- `npm run typecheck`
- `npm run test:unit -- src/cuny/ssoSite.test.ts src/content/content.test.ts`
- `npx playwright test e2e/onboarding.spec.ts --grep "allow|manage|add factor|mobile authenticator|secret|five-factor"`

## Validation Gate
- Guided progression works through Screen 9 on happy path.
- Five-factor edge pauses flow with actionable messaging and no unsafe automation.
- Selector failure fails soft with recovery instructions (no silent hang).

## Evidence Required
- Step-by-step run log (detected page state -> commanded overlay step).
- Happy path and five-factor E2E evidence.
- Command outputs and exits.

## Rollback Notes
- If selector fragility is high, keep overlay core and gate guided sequence behind a temporary feature switch.
