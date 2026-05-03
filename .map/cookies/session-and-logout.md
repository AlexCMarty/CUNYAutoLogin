# Session cookies — Brightspace (D2L), CUNYFirst (PeopleSoft), and CUNY SSO (OAM)

Observed May 2026 via live flows through `ssologin.cuny.edu` MFA. Values are intentionally omitted — only cookie **names**, hosts, attachment points, and behavior.

## Summary: identical IdP logout, different SP cookies

| Layer | Same across Brightspace + CUNYFirst? |
|-------|--------------------------------------|
| **CUNY SSO (`ssologin.cuny.edu`)** — breaking MFA/password gate on the next federation hop | **Yes.** Same **`OAM_ID`** guidance as below. **`oaaCtx`** rotates mid-flow on `auth_cred_submit`. |
| **Service-specific app session** | **No.** Brightspace keeps **`d2lSessionVal`** / **`d2lSecureSessionVal`** on `brightspace.cuny.edu`. CUNYFirst keeps **PeopleSoft** cookies on **`.cunyfirst.cuny.edu`** (`PS_TOKEN`, `…PORTAL-PSJSESSIONID`, …) and an **`OAMAuthnCookie_<host>_<port>`** on **`home.cunyfirst.cuny.edu`**. Remove the **whole SP layer** relevant to whichever site you are resetting. |

## Entry URL shape (why the login page differs)

Applications do not share one universal deep link — they hand off to Oracle with different parameters:

| SP | Typical first hop onto `ssologin.cuny.edu` (observed) |
|----|--------------------------------------------------------|
| **Brightspace** | `/oamfed/idp/samlv20?SAMLRequest=…` (SAML artifact / encoded request toward the IdP) |
| **CUNYFirst** | **`/oam/server/obrareq.cgi?encquery=…&ECID-Context=…`** with **`agentid=PeopleSoft`** in the decoded/hand-off query string |

Credential + TOTP pages at `ssologin.cuny.edu` match the **`credential-entry`** model in `.map/pages/` regardless of SP; integration differs **after** MFA at the ACS / WebGate handshake.

After MFA, **`POST /oam/server/auth_cred_submit`** `302`-redirects to:

- Brightspace → **`POST` ACS** `brightspace…/d2l/lp/auth/login/samlLogin.d2l`.
- CUNYFirst → **`GET` WebGate replay** **`https://home.cunyfirst.cuny.edu/obrar.cgi?encreply=…&cksum=…`** (not a SAML `POST` to PeopleSoft HTML).

Landing page after login: **`https://home.cunyfirst.cuny.edu/psc/cnyihprd/EMPLOYEE/EMPL/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL`** (shown in UI as CUNYfirst Home).

---

## Brightspace — `brightspace.cuny.edu`

After successful SAML ACS, **`POST https://brightspace.cuny.edu/d2l/lp/auth/login/samlLogin.d2l`** returned **`Set-Cookie`** (HttpOnly unless noted):

| Cookie | Typical role |
|--------|----------------|
| **`d2lSessionVal`** | Primary Brightspace LMS session bearer (HttpOnly, `Secure`, `SameSite=None`) |
| **`d2lSecureSessionVal`** | Complementary secure session slice (same flags) |
| `d2lSameSiteCanaryA` | SameSite probe / infra (HttpOnly) |
| `d2lSameSiteCanaryB` | SameSite probe / infra (HttpOnly, `SameSite=Lax`) |
| `LoginKey` | Cleared (`Max-Age`/`expires` in the past on success) |

`document.cookie` on the LMS home shows **analytics/third-party IDs only** (`_ga*`, `_fbp`, …). LMS auth is carried on **HttpOnly** cookies above; scripts cannot read them.

### Fewest removals to treat the user as "logged out" of Brightspace

Delete **`d2lSessionVal`** and **`d2lSecureSessionVal`** on `https://brightspace.cuny.edu/`. Those are the two session cookies observed on SAML completion. Clearing the **`d2lSameSiteCanary*`** pair is optional (they are not the cryptographic session proofs but can be removed for a clean cookie jar).

Reloading `/d2l/home` afterward should bounce through SAML again. If the **IdP SSO session is still alive**, the browser may return to Brightspace **without password/TOTP**.

## CUNYFirst — `home.cunyfirst.cuny.edu` and `.cunyfirst.cuny.edu`

Observed chain: MFA success **`302`** → **`GET …/obrar.cgi`** on **`home.cunyfirst.cuny.edu`** (**`302`** to portal path) → portal **`302`** sets PeopleSoft jars → **`200`** on `PT_LANDINGPAGE.GBL?&`.

### WebGate handshake on `home.cunyfirst.cuny.edu`

**`GET /obrar.cgi?encreply=…`** response **`Set-Cookie`** included:

| Cookie | Typical role |
|--------|----------------|
| **`OAMAuthnCookie_home.cunyfirst.cuny.edu_443`** | Oracle WebGate bearer for this **specific host/port** (`HttpOnly`, `Secure`, `path=/`). Name suffix encodes **`home`** + **`443`** — other PeopleSoft tiers or VIP hostnames could produce different **`OAMAuthnCookie_<host>_<port>`** literals. Clears ephemeral **`OAMRequestContext_<host>_<port>_…`** by expiring it. |

### PeopleSoft Fluid portal — `domain=.cunyfirst.cuny.edu`

On the portal **`302`** and first **`200`**, **`Set-Cookie`** on **`.cunyfirst.cuny.edu`** included (among infra cookies):

| Cookie | Typical role |
|--------|----------------|
| **`cnyihprd-8080-PORTAL-PSJSESSIONID`** | Portal **Java servlet session** id (HttpOnly, `Secure`). Prefix **`cnyihprd-8080`** is environment/site-specific — treat as **`{instance}-{port}-PORTAL-PSJSESSIONID`** pattern. |
| **`PS_TOKEN`** | PeopleSoft cryptographic session token (**HttpOnly**). |
| `PS_LASTSITE`, `ExpirePage`, `PS_TokenSite`, `PS_TOKENEXPIRE`, `PS_LOGINLIST`, `SignOnDefault` | Routing / bookkeeping / timeouts (mostly `Secure`; several HttpOnly). |
| `PS_DEVICEFEATURES`, `ps_theme` | Feature hints / UX (not pure auth). |

`BIGipServer*` on **`home.cunyfirst.cuny.edu`** / **`.cunyfirst.cuny.edu`** is load-balancer affinity, not proof of login.

### Fewest removals to treat the user as "logged out" of CUNYFirst

Minimal **portal session teardown** observed in practice:

1. **`PS_TOKEN`** on **`https://home.cunyfirst.cuny.edu/`** (covers `domain=.cunyfirst.cuny.edu`).
2. **`…-PORTAL-PSJSESSIONID`** for your environment (here **`cnyihprd-8080-PORTAL-PSJSESSIONID`**) on the same registrable domain.

Add **`OAMAuthnCookie_home.cunyfirst.cuny.edu_443`** on **`https://home.cunyfirst.cuny.edu/`** so the browser does not immediately present a stale WebGate assertion on the front door host.

Reloading **`https://home.cunyfirst.cuny.edu/`** after that forces a fresh **`obrareq.cgi`** hand-off. To require **full MFA/password** again (not SSO slide), also clear **`OAM_ID`** on the IdP as in the SSO section below.

Subdomains (**`*.cunyfirst.cuny.edu`**, e.g. `hrsa.` / `cssa.` pings seen on home load) reuse **PeopleSoft-domain** cookies once issued; wiping **`.cunyfirst.cuny.edu`** scoped names covers those tabs as well unless the app split cookies onto a narrower host-only jar.

---

## CUNY SSO / OAM — `ssologin.cuny.edu`

Cookies observed on the extension's `cookies.getAll` after a complete MFA login (May 2026, Chrome, `host_permissions: https://ssologin.cuny.edu/*`):

| Cookie | Domain | SameSite | Typical role |
|--------|--------|----------|--------------|
| **`OAM_ID`** | `ssologin.cuny.edu` | `no_restriction` | Oracle OAM session artifact (HttpOnly, Secure) |
| **`OAMAuthnCookie_ssologin.cuny.edu_443`** | `ssologin.cuny.edu` | `no_restriction` | Oracle WebGate bearer for this host/port (HttpOnly, Secure) |
| **`oaaCtx`** | `.ssologin.cuny.edu` | `unspecified` | OAM auxiliary context blob; domain cookie sent to all subdomains of ssologin.cuny.edu (HttpOnly, Secure) |
| **`_WL_AUTHCOOKIE_JSESSIONID`** | `ssologin.cuny.edu` | `unspecified` | WebLogic HTTP session affinity (HttpOnly, Secure) |
| `OAM_REQ_0`, `OAM_REQ_1` | `ssologin.cuny.edu` | `no_restriction` | In-flight request state; set to `invalid` after successful auth |
| `OAM_REQ_COUNT` | `ssologin.cuny.edu` | `no_restriction` | Request counter |
| `BIGipServer/…`, `BIGipServera/…` | `ssologin.cuny.edu` | `unspecified` | Load-balancer affinity — **not** auth proofs |
| `OAMAuthnHintCookie` | `.cuny.edu` | `no_restriction` | **Username hint only** — pre-fills login form username. Not a session token. Only visible to the extension with `https://*.cuny.edu/*` in `host_permissions`. |

`ObSSOCookie`, `ORA_OSFS_SESSION`, and `OAM_JSESSIONID` were **not observed** in the May 2026 Chrome session post-login; they may be present in other flows or environments.

### Logging out of `/oaa/rui` — server-side session, not cookie-based

**The OAA SPA at `/oaa/rui/` maintains a server-side session.** Client-side cookie deletion alone does not log the user out. Even with zero browser cookies, the SPA loads as authenticated because the OAM server still considers the session valid.

**The correct logout procedure is to navigate to the OAA logout endpoint:**

```
GET https://ssologin.cuny.edu/oaa/rui/user/v1/logout
```

This endpoint:
- Terminates the server-side OAA session
- Redirects the browser to `https://ssologin.cuny.edu/cunylogin/pages/Logout.jsp` ("You Have Logged Out")
- After which any navigation to `/oaa/rui` requires full re-authentication (redirects to `obrareq.cgi`)

The logout URL is also available from the authenticated API: `GET /oaa/rui/user/v1` returns `{"key":"logout_location","val":"/oaa/rui/user/v1/logout"}`.

The extension implements this via `browser.tabs.update(tabId, { url: OAA_RUI_LOGOUT_URL })` from the service worker. This works without the `tabs` permission because the URL matches the extension's existing `host_permissions` for `ssologin.cuny.edu`.

### Fewest removals to break IdP SSO (force full challenge for Brightspace/CUNYFirst)

Cookie deletion is the correct approach for **SP-layer sessions** (Brightspace, CUNYFirst). For those:

1. **`OAM_ID`** on `ssologin.cuny.edu`
2. **`OAMAuthnCookie_ssologin.cuny.edu_443`** on `ssologin.cuny.edu`

Combined with the SP-specific cookies above, this forces a fresh credential challenge on the next login attempt to those services.

**This approach does not apply to `/oaa/rui/`.** Use the logout endpoint instead (see above).

---

## Extension implementation notes (MV3 / `browser.*`)

- Clearing cookies requires the **`cookies` API permission** in the manifest (`"permissions": ["cookies", …]`).
- **`browser.cookies.remove`** needs a URL whose scheme + registrable domain matches the cookie; e.g. `{ url: "https://brightspace.cuny.edu/", name: "d2lSessionVal" }` or `{ url: "https://home.cunyfirst.cuny.edu/", name: "PS_TOKEN" }`.
- **`OAMAuthnCookie_*` names encode host and port.** Prefer **`browser.cookies.getAll`** filtered by `domain` / `url` rather than hard-coding literals for every vanity host WebGate exposes.
- Current `host_permissions`: `https://ssologin.cuny.edu/*`, `https://brightspace.cuny.edu/*`, `https://home.cunyfirst.cuny.edu/*`, `https://*.cunyfirst.cuny.edu/*`. `OAMAuthnHintCookie` on `.cuny.edu` is **not** visible without `https://*.cuny.edu/*`, which is intentionally omitted (too broad; the hint cookie is not a session token and does not affect logout).
- HttpOnly cookies **cannot** be cleared from content scripts via `document.cookie`; use the **`cookies`** API from a background/service worker.
- **`browser.tabs.update(tabId, { url })` works without `tabs` permission** if the URL matches `host_permissions`. Use this to navigate a CUNY tab to the OAA logout endpoint from the service worker.

### Live validation note (May 2026, dev build)

- Extension exposes **`LOGOUT_CUNY_SESSIONS`** with optional `site` (`all`, `brightspace`, `cunyfirst`, `ssologin`).
- Handler returns `{ ok: boolean, removedCount: number }`. `removedCount` reflects how many `cookies.remove` calls found and removed a cookie; it does **not** prove the user is logged out.
- Observed: `LOGOUT_CUNY_SESSIONS { site: "all" }` returns `removedCount` of approximately 17–18 (all three site spec lists: 2 Brightspace + 3 CUNYFirst + 12 ssologin, plus any extras found by the URL-based purge).
- `/oaa/rui` logout is confirmed by the tab navigating to `Logout.jsp` and subsequent `/oaa/rui` access redirecting to `obrareq.cgi`.

## Verification protocol (for logout claims)

1. Establish a known logged-in state on each target:
   - `https://brightspace.cuny.edu` — observe the LMS home
   - `https://home.cunyfirst.cuny.edu` — observe the portal home
   - `https://ssologin.cuny.edu/oaa/rui` — observe the OAA dashboard ("Hi, what are you managing today?")
2. Trigger extension logout (dev panel button or `LOGOUT_CUNY_SESSIONS` runtime message).
3. For Brightspace and CUNYFirst: reload each URL and verify redirect to credential page.
4. For `/oaa/rui`: confirm the tab navigated to `Logout.jsp`, then navigate to `/oaa/rui` and verify redirect to `obrareq.cgi`.
5. Record evidence as final URL + visible page text (never cookie values).

## Disclaimer

Oracle, WebGate, and D2L/PeopleSoft may add or rename cookies; always confirm in DevTools **Application → Cookies** for failing cases. SAML / `obrar.cgi` flows for other portals may attach auxiliary cookies — the observations above are from `ssologin.cuny.edu` / `brightspace.cuny.edu` / `home.cunyfirst.cuny.edu` May 2026.
