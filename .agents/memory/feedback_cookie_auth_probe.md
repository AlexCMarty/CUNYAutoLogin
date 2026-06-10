---
name: Cookie/auth state — probe the API, never the SPA shell
description: OAA SPA shell is browser-cached and renders "logged in" with zero cookies; only an API call reveals true auth state
type: feedback
---

When testing whether a CUNY session is still authenticated after deleting cookies, the OAA SPA shell (`/oaa/rui/index.html`, "Hi, what are you managing today?") is **served from browser cache** and renders as if logged in **even with all cookies cleared**. The static shell is not session-gated.

**Why:** This cached shell is almost certainly the source of the (false) claim in `.map/cookies/session-and-logout.md` that "after the allow gate the session is server-side; client-side cookie deletion does not log the user out." It does — the shell just *looks* authenticated.

**How to apply:** Use an authenticated **API/dynamic endpoint** as the auth oracle, fetched with `credentials:'include'`:
- OAA SPA: `fetch('/oaa/rui/user/v1')` → JSON array (authed) vs 302→`obrareq.cgi` login HTML (logged out).
- Brightspace: `fetch('/d2l/api/lp/1.43/users/whoami')` → JSON `{Identifier,...}` (authed) vs 403 `{Errors:[{Message:"Forbidden"}]}` (logged out).
A full-page nav to `/oaa/rui` is only reliable when **all** cookies are cleared (then it redirects to login); partial deletes can still serve the cached shell. Bare `/oaa/rui` redirects to OAuth; `/oaa/rui/index.html` may be served from cache.

Related: OAM dual-cookie re-mint — deleting only `OAM_ID` or only `OAMAuthnCookie_*` leaves you logged in because OAM re-mints the survivor; both must go. See [[project_cookie_session_map_2026_06]].
