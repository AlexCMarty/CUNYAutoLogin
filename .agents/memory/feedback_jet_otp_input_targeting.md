---
name: JET OTP input targeting — use oj-input-text#otp, not first oj-input-text
description: When manually filling the OTP on enroll-verify page, must target oj-input-text#otp specifically, not the first oj-input-text (which is the name field)
type: feedback
---

On the CUNY enroll-verify page (?view=verify / ?view=secret with Verify Now clicked), there are three `oj-input-text` elements in the form:
- [0] id="name" / inputId="name|input" — Friendly Name
- [1] id="key" / inputId="key|input" — Secret key (read-only)
- [2] id="otp" / inputId="otp|input" — Verification code

**Why:** Using `document.querySelector('oj-input-text').value = code` targets the FIRST element (name field), not the OTP field. Setting the wrong field corrupts the factor name and still shows "Enter a OTP code".

**How to apply:** Always use `document.querySelector('oj-input-text#otp').value = code` to fill the verification code. This correctly updates the JET model and clears the validation error. Confirm with: `document.querySelector('oj-input-text#otp').value` — should return the 6-digit code, and `document.querySelector('.oj-message-detail')?.innerText` should be absent or undefined after setting.

Also: the "Verify Now" button has NO id attribute on the CUNY page. Use text-based selector:
`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Verify Now')`
NOT `button#verify-now-btn`.
