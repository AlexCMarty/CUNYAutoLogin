---
name: Cookie/session behavior verified live (2026-06-10)
description: Live manage_cookies findings — minimal logout sets at pre/post allow-gate and Brightspace, plus undocumented cookies
type: project
---

Live-verified 2026-06-10 with the new `manage_cookies` MCP tool (reads at Playwright/browser layer — sees httpOnly + ALL domains, bypassing the extension's `ssologin.cuny.edu` host_permissions). Auth oracle = API probe, not SPA shell (see [[feedback_cookie_auth_probe]]).

**Minimal cookie set whose deletion logs you out:**
- **Pre-allow-gate (OAM SSO, on `mfaConsent.jsp`):** `{OAM_ID + OAMAuthnCookie_ssologin.cuny.edu_443}` — BOTH required. Deleting either alone → OAM silently re-mints the survivor and you stay in. Both on `ssologin.cuny.edu` (in old sweep scope).
- **Post-allow-gate (OAA SPA `/oaa/rui`):** `{JSESSIONID}` alone (the OIDC app-session JWT, on ssologin.cuny.edu, secure=false, SameSite=Strict). OAM cookies are NOT needed post-consent — deleting OAM_ID+OAMAuthnCookie leaves the API authed. `_WL_AUTHCOOKIE_JSESSIONID` alone is insufficient.
- **Brightspace (`brightspace.cuny.edu`):** `{d2lSecureSessionVal}` alone kills the D2L session (403 on whoami). BUT the upstream OAM/SAML SSO survives → next visit **silently re-federates** with fresh d2l cookies. Full logout also needs `OAM_ID` + `ORA_OSFS_SESSION` on ssologin (then revisit → CUNY Login form).

**Cookies NOT in `.map/cookies/session-and-logout.md` (observed live):**
- On ssologin.cuny.edu: `JSESSIONID` (OAA OIDC JWT, secure=false), `OAACtxCookie` (OAuth partner ctx, secure=false), `HELIDON_TENANT=@default` (secure=false, Strict), `OAM_JSESSIONID` (httpOnly=FALSE), `ORA_OSFS_SESSION` (SAML/federation session), `OAMRequestContext_*_<hex>` (transient).
- On brightspace.cuny.edu: `d2lSessionVal`, `d2lSecureSessionVal`, `d2lSameSiteCanaryA/B`.
- The map said `ORA_OSFS_SESSION` and `OAM_JSESSIONID` were "not observed" — they ARE, in the SAML federation flow (Brightspace). `JSESSIONID`/`HELIDON_TENANT` appear post-consent in the OAA app.

**Map corrections needed:** the "post-consent session is server-side / cookie deletion doesn't log out" claim is FALSE (artifact of the cached SPA shell). SameSite vocab in the map is chrome.cookies-style (`no_restriction`/`unspecified`); Playwright reports `None`/`Lax`/`Strict`. BIGipServer* are httpOnly+Lax (map said unspecified).
