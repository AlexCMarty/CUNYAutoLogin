Use `.plans/operator-prompt.md` and execute only `@.plans/agents/plan-06-overlay-engine-core.md`.
You are encouraged to use subagents when tasks can be done in parallel.

## Critical starting point (must preserve)
You are resuming from a repo where **plan-05 false credential error fix is already completed and committed**.
Do not redo or alter that work except where explicitly required by plan-06.

- Latest commit to preserve: `0525eed`
- Commit message: `fix(content): require #serverError DOM marker on /auth_cred_submit before reporting credential error`
- Behavior now verified on Firefox + Chrome:
  - Correct credentials proceed without false credential-error banner.
  - Wrong credentials still show extension banner and route back correctly.

## What was changed in that commit
- `src/content/content.ts`
  - `/auth_cred_submit` handling now requires DOM confirmation (`hasCredentialErrorInDom`) before reporting credential error.
  - If URL matches but DOM marker is absent, it watches post-submit DOM instead of firing error immediately.
  - no-vault path in `autoFill()` was aligned to the same DOM-confirmed behavior.
- `e2e/fixtures-server.mjs`
  - `/oam/server/auth_cred_submit?outcome=success` now serves success-transient fixture.
- `e2e/fixtures/credential-success-transient.html`
  - New fixture that redirects to `/oaa-totp-factor/` without `#serverError`.
- `e2e/onboarding.spec.ts`
  - Added regression: transient `/auth_cred_submit` without error DOM must not show banner or route sidebar backward.

## Validation already passed (do not claim regressions without rerunning)
- `npm run typecheck`
- `npm run test:unit -- src/content/content.test.ts` (55 passing)
- `npm run build:e2e && npx playwright test e2e/onboarding.spec.ts --grep "screen 4|allow gate|wrong credentials|auth_cred_submit"` (passing)
- `npx playwright test` full suite (22 passing)

## Scope guard for this run
- Execute only plan-06 overlay engine core.
- Keep plan-05 behavior and tests intact.
- Do not refactor unrelated onboarding architecture.
- Do not rewrite existing copy/state flow unless plan-06 explicitly requires it.
- `ALLOW_GATE` copy currently remains plan-05 stub text and is expected at this point.

## Implementation discipline
- Before editing, inspect git diff/status and confirm baseline includes `0525eed`.
- Make minimal, targeted changes.
- Prefer additive plan-06 work over restructuring.
- Update/add tests required by plan-06 only.
- Run relevant validation and report exact commands/results.
- If uncertain whether a change is in scope, stop and ask.