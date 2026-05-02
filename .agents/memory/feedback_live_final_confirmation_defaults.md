---
name: Final confirmation defaults — live extension validation
description: Use live-site extension interaction (not fixtures) and apply COMPLETE_DEMO/DONE DOM assertions and environment caveats by default
type: feedback
---

For final confirmation tasks, prioritize live-site validation with the real built extension and provided credentials. Do not rely on fixture-only or e2e-fixture paths as primary evidence.

**Why:** Final behavioral confirmation should reflect real runtime conditions (CUNY pages, account state, tab orchestration, and content-script behavior), which fixtures can mask.

**How to apply:** Default checklist for terminal onboarding screens:
- Run the live onboarding flow with real credentials and real CUNY pages.
- In headless Chrome, expect `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` to be `false` in many runs.
- If no platform authenticator is available, treat BIOMETRIC_OFFER button-path assertions as environment-limited and report that caveat explicitly.
- Verify COMPLETE_DEMO with concrete DOM checks:
  - `data-onboarding-screen="COMPLETE_DEMO"`
  - headline is `You're all set!`
  - show/skip controls exist
  - `[data-onboarding-demo-status]` is hidden before Show me, visible after Show me.
- Verify Show me side effects:
  - a new CUNY tab opens
  - narration status becomes visible and updates text.
- Verify COMPLETE_DONE as terminal:
  - `data-onboarding-screen="COMPLETE_DONE"`
  - no back/forward controls (`[data-onboarding-back]` and `[data-onboarding-forward]` absent/hidden).
- Always mention account-state side effects that can affect future runs (for example, CUNYAutoLogin becoming default factor) and include recovery guidance (for example, use Return to All Options to choose Bitwarden path).

Reusable final-confirmation output defaults:
1. verdict
2. concrete claim
3. minimal executed steps
4. DOM/tab evidence
5. environment caveats
6. account-state side effects + recovery path
