---
name: Login TOTP page input targeting
description: The login TOTP challenge page has multiple hidden inputs; always target otpValue|input not document.querySelector('input')
type: feedback
---

The CUNY login TOTP challenge page (`/oaa-totp-factor/rui/index.html`) has multiple hidden JET inputs before the visible TOTP field. `document.querySelector('input')` returns `cid|input` (a hidden field), not the OTP field.

**Why:** Filling the wrong input causes "Enter a value." error when clicking Verify, wasting a TOTP code window.

**How to apply:** Always target the OTP input by placeholder: `document.querySelector('input[placeholder="Enter TOTP"]')` or by id `input#otpValue\\|input`. Applies to the login TOTP page (`oaa-totp-factor`). Use keystroke simulation (per-char keydown+nativeSetter+keypress+InputEvent+keyup, then change+blur) to commit the JET model value.
