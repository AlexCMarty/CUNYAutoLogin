# Plan 12: Hardening and Release Readiness

## Objective
Run final reliability, selector-robustness, and release-gate checks before shipping the onboarding overhaul.

## Dependencies
- `plan-01-test-gate-baseline.md`
- `plan-11-interruptions-and-resume-security.md`

## In Scope
- Selector robustness and timeout recovery polish.
- Debug transition logging quality in development mode.
- Full acceptance checklist against approved onboarding spec.
- Cross-browser manual sanity checks.

## Out of Scope
- New product-scope expansions.

## Implementation Tasks
1. Run full code audit for silent-failure opportunities in onboarding states.
2. Improve fallback messaging for selector/timeouts where needed.
3. Ensure critical transition logs exist for debugging in development builds.
4. Execute full automated test matrix.
5. Execute manual sanity runs in Chromium and Firefox.
6. Produce release-readiness report with open risks (if any).

## Required Tests
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e`
- Manual run-through on real CUNY flow targets in Chromium and Firefox.

## Validation Gate
- All prior plan gates still hold when rerun on integrated branch.
- No unresolved critical security or state-desync issues.
- UX behavior parity matches approved spec for in-scope screens and edges.

## Evidence Required
- Consolidated test matrix results.
- Manual sanity checklist outcomes per browser.
- Risk register with severity and explicit ship/no-ship recommendation.

## Rollback Notes
- If critical regressions emerge late, roll back to last gate-passing plan boundary and re-run release checks.
