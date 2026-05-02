---
name: OTP input fill approach for CUNY enroll-verify page
description: Keystroke simulation for Oracle JET OTP input requires per-character native setter + input event + blur/change to commit JET model
type: feedback
---

The Oracle JET OTP input at `?view=verify` rejects values set via plain native setter approach (produces "Enter a OTP code" client-side error). The correct approach from MCP inspect_dom:

1. Clear existing value: `nativeSetter.call(input, ''); input.dispatchEvent(new Event('input', ...))`
2. Per character: `keydown` → native setter append → `keypress` → `InputEvent('input', {inputType:'insertText', data:char})` → `keyup`
3. Commit: `input.dispatchEvent(new Event('change', ...))` + `blur()`

**Why:** Oracle JET validates via its own model, not the raw DOM value. The model updates on the InputEvent per character. The change+blur commits the model so JET's validator sees the value.

**How to apply:** Whenever filling `#otp|input` or similar JET-managed inputs on the CUNY enroll-verify page. Generate fresh TOTP immediately before filling — the 30-second window expires fast.

Note: The extension itself uses keystroke simulation too, and it auto-fills the OTP input during onboarding (the extension had already filled `946533` before we interacted). When the extension's auto-fill fails client-side validation, manual keystroke simulation with this approach works.
