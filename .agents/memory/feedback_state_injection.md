---
name: Onboarding state injection — content script runtime.sendMessage
description: Cannot inject ONBOARDING_STAGE_DETECTED from inspect_dom on CUNY web page; must navigate live CUNY flow
type: feedback
---

inspect_dom runs in the regular web page context (not content script context). The CUNY page does NOT have `chrome.runtime` available in its page context — only in the injected content script context. Therefore:

- `chrome.runtime.sendMessage(...)` from inspect_dom on a CUNY page → TypeError (chrome is undefined)
- Cannot fake ONBOARDING_STAGE_DETECTED messages from inspect_dom to advance sidebar state

The sidebar's runtime.onMessage bridge is only triggered by messages from content scripts (which have extension privileges). The service worker just acks onboarding messages — it does NOT re-broadcast them.

**Why:** MV3 security model — web pages cannot access chrome.runtime without explicit extension channel.

**How to apply:** When trying to reach EXT_PASSWORD_SETUP or other late-flow states, must navigate the full live CUNY flow. The fast-forward helpers (fastForwardToSetDefault, etc.) in applyOnboardingMessage cannot be triggered externally from MCP inspect_dom. The full navigation path takes ~5-10 minutes with real CUNY login.

Alternative: The applyOnboardingMessage function IS exposed from render.ts — if there were a window-scope reference to the controller, one could call it directly. But the controller lives in the mountOnboarding closure only; not window-accessible.
