---
name: Full onboarding flow and release readiness — live snapshot
description: End-to-end onboarding and hardening claims verified live on 2026-04-29 — CONFIRMED with noted anomalies
type: project
---

Full live CUNY onboarding path and related hardening/release checks verified on 2026-04-29.

**Why:** Full live flow navigated end-to-end (WELCOME → COMPLETE_DONE) with V2 onboarding enabled, plus targeted behavioral checks.

Key observations:
- Full onboarding flow: WELCOME → EMAIL_ENTRY → PASSWORD_ENTRY → OPENING_CUNY → ALLOW_GATE → OAA_SPA_HOME → GUIDED_MANAGE → GUIDED_FACTOR_TYPE → GUIDED_SECRET_CAPTURE → VERIFY_LOGIN_CODE (with pause) → SET_DEFAULT → EXT_PASSWORD_SETUP → COMPLETE_DEMO → COMPLETE_DONE — transitions observed clean in session, no desync.
- Selector timeout recovery covered by unit tests (including `target_not_found` → `data-onboarding-recovery-message`) plus code review of overlay.ts (OVERLAY_TARGET_TIMEOUT_MS=5s, MutationObserver + setTimeout, onNotFound → sends target_not_found stage, render.ts shows recovery message without hanging).
- Storage posture in session: `storage.local` = `cunyVault` (encrypted only); `storage.session` = `cunySessionMaster` (plaintext master pwd, session-only/cleared on restart by design); `localStorage` = empty. Resume snapshot cleared after completion. No credential leaks to local or localStorage observed.
- Test matrix at time of snapshot: typecheck ✓, unit tests 542/542 ✓, E2E 22/22 ✓.

Known anomaly:
- Extension auto-fill of OTP on enroll-verify page (VERIFY_LOGIN_CODE) triggered `[data-onboarding-verify-pause]` after two server-side failures. Root cause likely expired TOTP window between secret capture and auto-fill attempt. Manually filling with fresh code succeeded. Expected per spec (pause state → user fills manually). Not treated as regression.

- `verify-now-btn` button has NO id attribute in the current CUNY page implementation — selector `button#verify-now-btn` will not work. Use text-based: `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Verify Now')`.
- Bitwarden restored as default after test. TOTP challenge confirmed "Enter TOTP from the registered Bitwarden" after cleanup.
