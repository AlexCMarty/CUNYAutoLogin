---
name: End-of-run cleanup — restore Bitwarden as default login factor
description: Always finish verification runs by restoring Bitwarden as remembered/default TOTP choice via live login path
type: feedback
---

After any run that may alter default factor selection, restore Bitwarden as the remembered default before ending the session.

**Why:** The account owner uses Bitwarden daily and wants post-test state returned to Bitwarden-by-default to avoid lock-in to CUNYAutoLogin prompts on the next login.

**How to apply:** End-of-run cleanup sequence (live site, not fixtures):
1. Reach a TOTP challenge page that says `Enter TOTP from the registered CUNYAutoLogin` (or any non-Bitwarden default).
2. Click `Return to All Options`.
3. On `Choose a method to login`, enable `Remember Choice` (checkbox must be checked).
4. Click `TOTP from Bitwarden`.
5. Complete login (enter Bitwarden TOTP, click `Verify`, then click `Allow` on consent if prompted) until OAA home loads.
6. Re-check default behavior by triggering a fresh challenge; confirm prompt text is `Enter TOTP from the registered Bitwarden`.

Verification signal:
- Fresh challenge lands directly on Bitwarden TOTP prompt without needing `Return to All Options`.

Caveat:
- If a stale challenge still shows CUNYAutoLogin, repeat the exact path once more and complete login end-to-end; persistence is tied to successful completion.
