---
name: Interruption and resume behavior — live snapshot
description: Five interruption/resume behavioral claims verified live on 2026-04-29 — all CONFIRMED
type: project
---

Five interruption/resume claims verified live on 2026-04-29. CONFIRMED.

**Why:** Full live CUNY flow was navigated to OAA_SPA_HOME, then interruption behaviors tested.

Key observations:
- `data-onboarding-reopen-cuny="true"` appears immediately (sync) when the tracked CUNY tab is closed, while state is in CUNY_REATTACHABLE_STATES.
- `activeCunyTabId` is set when content script sends any ONBOARDING_STAGE_DETECTED message from the CUNY tab — happens on credential_page detection, so first message after tab opens.
- `browser.tabs.onRemoved` works in the sidebar despite only `activeTab` (not full `tabs`) permission in manifest. Tab lifecycle events don't require the tabs permission.
- Resume snapshot is stored in `storage.session` (not `storage.local`) — cleared on browser restart, confirming session-only policy.
- After `chrome.storage.session.clear()`, sidebar reloads to WELCOME with no resume button — session-only invariant holds.
- `storage.local` was empty (no vault) during test run — no sensitive in-flight state persisted to local.
- Bitwarden default was unaffected (all TOTP challenges showed "from the registered Bitwarden" throughout).
