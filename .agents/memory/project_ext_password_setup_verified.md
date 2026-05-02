---
name: EXT_PASSWORD_SETUP live verification snapshot
description: Nine behavioral claims for EXT_PASSWORD_SETUP verified live on 2026-04-27 — all CONFIRMED
type: project
---

Nine behavioral claims for EXT_PASSWORD_SETUP were verified on 2026-04-27 and CONFIRMED.

**Why:** Full live CUNY flow was navigated to reach EXT_PASSWORD_SETUP state, then UI interactions were tested in-browser.

**How to apply:** When verifying EXT_PASSWORD_SETUP claims, note that the dist was already built with ONBOARDING_V2_ENABLED=true. The screen is registered in render.ts SCREEN_MOUNTS map. Claims about vault storage (cunyVault in storage.local), strength logic, match indicator, and BIOMETRIC_OFFER transition were all confirmed working correctly.

Key observations from the session:
- BIOMETRIC_OFFER was at the time a stub screen — placeholder text only (verify current UI in code before asserting copy).
- The vault is written under key "cunyVault" with structure: { version, saltB64, ivB64, ciphertextB64 }.
- No plaintext credentials appear in storage.local or localStorage after forward click.
- "Passw0rd!" (8 chars, lowercase+uppercase+digit+symbol = 4 variety categories) is Fair strength.
- "Passw0rd!Test" (13 chars) is Strong strength.
