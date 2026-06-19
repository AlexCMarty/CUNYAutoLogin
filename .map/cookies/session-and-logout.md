# Session cookies — CUNY SSO / OAM (`ssologin.cuny.edu`) + Brightspace

Cookie **names**, hosts, attachment points, and behavior. Values are intentionally
omitted.

**Provenance:** Sections marked **[live 2026-06-10]** were verified end-to-end with
the `manage_cookies` MCP tool, which reads at the Playwright/browser layer — it sees
`httpOnly` cookies **and every domain**, regardless of the extension's
`host_permissions`. Earlier notes (May 2026) were captured through the extension's
`chrome.cookies` API (scoped to `ssologin.cuny.edu`) and were both incomplete and, in
one respect, wrong — see the correction below.

## ⚠️ Correction: the post-consent session is NOT "server-side / cookie-independent"

A previous revision of this file claimed that after the Allow gate the OAM server holds
a session "independent of cookies," and that "even with zero browser cookies the SPA
loads as authenticated." **That is false.** **[live 2026-06-10]**

The mistake came from trusting the **SPA shell as an auth signal**. The OAA SPA shell
(`/oaa/rui/index.html`, "Hi, what are you managing today?") is a **cacheable static
asset**. After clearing every cookie it still renders as if logged in — but it is just
cache. Any authenticated request fails:

```
GET /oaa/rui/user/v1   (credentials: include)
  authed   → 200 JSON  [{"key":"user","val":"…@login.cuny.edu"}, …]
  logged out → 302 → /oam/server/obrareq.cgi  (CUNY Login HTML)
```

**Always probe an API/dynamic endpoint, never the shell.** A full-page navigation to
`/oaa/rui` is only a reliable logout check once **all** cookies are gone (then it
redirects to `obrareq.cgi`); a partial cookie delete can still serve the cached shell.

## Does deleting cookies clear login? Minimum cookie set per stage **[live 2026-06-10]**

Yes at every stage — login is cookie-dependent. The minimal set whose deletion logs you
out differs by stage because two independent session layers are involved: the **OAM SSO
front door** (WebGate) and each **application's own session** (Helidon/WebLogic OIDC for
OAA; D2L for Brightspace).

| Stage | Auth oracle | Minimum cookies to delete | Notes |
|-------|-------------|---------------------------|-------|
| **Pre-Allow-gate** (`mfaConsent.jsp`, authenticated, pre-consent) | nav `/oaa/rui` → `mfaConsent` (in) vs `obrareq.cgi` (out) | **`OAM_ID` + `OAMAuthnCookie_ssologin.cuny.edu_443`** (both) | OAM **re-mints the survivor**: delete only one and you stay logged in (`OAMAuthnCookie` reappears with a fresh value). Both are on `ssologin.cuny.edu`. |
| **Post-Allow-gate** (OAA SPA `/oaa/rui`, post-consent) | `fetch('/oaa/rui/user/v1')` JSON vs 302 | **`JSESSIONID`** (alone) | The OIDC app-session JWT. **OAM cookies are not needed here** — deleting `OAM_ID`+`OAMAuthnCookie` leaves the API authed. `_WL_AUTHCOOKIE_JSESSIONID` alone is **not** sufficient to keep the session. |
| **Brightspace** (`brightspace.cuny.edu/d2l`) | `fetch('/d2l/api/lp/1.43/users/whoami')` JSON vs 403 | **`d2lSecureSessionVal`** (alone) → 403 | Kills the D2L app session, **but see the re-federation trap below.** |

### The Brightspace silent re-federation trap **[live 2026-06-10]**

Deleting the `brightspace.cuny.edu` cookies invalidates the D2L session, **but it is not
a real logout.** Brightspace authenticates via **SAML** (`/oamfed/idp/samlv20`), and the
upstream OAM/federation session on `ssologin.cuny.edu` survives. The next visit to
`brightspace.cuny.edu` **silently re-federates** and mints fresh `d2l*` cookies with **no
credential prompt** (verified: `whoami` returns the user again).

To force a full re-authentication (CUNY Login + TOTP), you must **also** clear the
upstream OAM/federation session. Verified sufficient: delete the `d2l*` cookies **and**
`OAM_ID` **and** `ORA_OSFS_SESSION` on `ssologin.cuny.edu` → the next Brightspace visit
redirects to the CUNY Login form.

## Logout via the OAA logout endpoint (server-side termination)

Independent of cookie deletion, the OAA app exposes a server-side logout endpoint:

```
GET https://ssologin.cuny.edu/oaa/rui/user/v1/logout
```

- **Post-consent:** terminates the OAA session and redirects to
  `https://ssologin.cuny.edu/cunylogin/pages/Logout.jsp` ("You Have Logged Out").
- **Pre-consent (at the Allow gate):** does **not** terminate — it redirects back to a
  fresh `mfaConsent.jsp`. Cookie deletion is the only logout at that stage.

The logout URL is also advertised by the authenticated API: `GET /oaa/rui/user/v1`
returns a `{"key":"logout_location","val":"/oaa/rui/user/v1/logout"}` entry.

> The endpoint **redirect behavior** above is carried over from May 2026 and was **not**
> re-verified on 2026-06-10; the cookie-deletion results in this file were. **The extension
> no longer touches this endpoint** — the tab-nav + `fetch` path was removed in commit
> `94f96b8` after a live probe showed it does not terminate at the pre-consent Allow gate,
> leaving the cookie sweep as the sole logout (see "Extension logout procedure (current
> code)" below). It is documented here only as live-site behavior.

## Extension logout procedure (current code)

Logout is **cookie-deletion only** — there is no logout-URL navigation and no `fetch`. On
`LOGOUT_CUNY_SESSIONS` (and before reopening a CUNY tab), `src/background/service-worker.ts`
calls two helpers directly:

1. `clearSsoLoginCookies()` — `browser.cookies.getAll({ domain: SSO_LOGIN_HOST })`, then
   `cookies.remove` for **every** returned cookie. The full-jar sweep removes the OAM SSO
   cookies (`OAM_ID`, `OAMAuthnCookie_*`), the OAA OIDC app session (`JSESSIONID`), and the
   SAML federation session (`ORA_OSFS_SESSION`) that would otherwise silently re-federate
   Brightspace. This is the **load-bearing logout mechanism** (see the comment on
   `clearSsoLoginCookies`); sweeping the whole jar rather than a hardcoded subset stays
   correct even when Oracle renames or adds cookies.
2. `clearBrightspaceSessionCookies()` — `cookies.remove` on the fixed pair `d2lSessionVal`
   / `d2lSecureSessionVal` with `url: BRIGHTSPACE_HOME_URL` (the reopen-tab path runs this
   only when the destination is Brightspace).

**Scope limits of the `chrome.cookies` sweep (vs. the Playwright-layer `manage_cookies`
tool used to gather this doc):**

- `getAll({ domain: "ssologin.cuny.edu" })` matches that host and its subdomains
  (incl. `.ssologin.cuny.edu`), so it **does** catch `OAM_ID`, `OAMAuthnCookie_*`,
  `JSESSIONID`, `_WL_AUTHCOOKIE_JSESSIONID`, `ORA_OSFS_SESSION`, `OAM_JSESSIONID`, etc.
- It does **not** catch the parent-domain `OAMAuthnHintCookie` (`.cuny.edu`) — but that is
  only a username hint, not a session token, so it does not matter for logout.
- It does **not** catch `brightspace.cuny.edu` cookies — those need the dedicated
  Brightspace clear. The extension's `host_permissions` is `https://ssologin.cuny.edu/*`
  only, which is why the `manage_cookies` tool (browser layer) sees cookies the
  extension's own API never can.

## Observed cookies by stage **[live 2026-06-10, Chrome]**

SameSite is shown in standard terms (`None`/`Lax`/`Strict`); the extension's
`chrome.cookies` API surfaces these as `no_restriction`/`lax`/`strict`/`unspecified`.

### `ssologin.cuny.edu` / `.cuny.edu`

| Cookie | Domain | httpOnly | secure | SameSite | Role |
|--------|--------|----------|--------|----------|------|
| **`OAM_ID`** | `ssologin.cuny.edu` | ✓ | ✓ | None | OAM master SSO session. Pre-consent: pairs with `OAMAuthnCookie` (delete both to log out). Post-consent: **not** required by the OAA app. |
| **`OAMAuthnCookie_ssologin.cuny.edu_443`** | `ssologin.cuny.edu` | ✓ | ✓ | None | WebGate bearer for this host/port. Re-minted from a valid `OAM_ID`. |
| **`JSESSIONID`** | `ssologin.cuny.edu` | ✓ | **✗** | **Strict** | **OAA OIDC app session — a signed JWT** (`iss …/oauth2`, `sub`, `groups`, `cunyeduemplid`). The load-bearing post-consent cookie. *Not previously documented.* |
| **`_WL_AUTHCOOKIE_JSESSIONID`** | `ssologin.cuny.edu` | ✓ | ✓ | Lax | WebLogic auth cookie paired with the app `JSESSIONID`. |
| **`OAM_JSESSIONID`** | `ssologin.cuny.edu` | **✗** | ✓ | Lax | OAM server's WebLogic session. *Previously listed as "not observed" — it appears in the SAML federation flow.* |
| **`ORA_OSFS_SESSION`** | `ssologin.cuny.edu` | ✓ | ✓ | None | OAM **Federation (SAML IdP)** session. The SSO behind Brightspace. *Previously "not observed."* |
| **`OAACtxCookie`** | `ssologin.cuny.edu` | ✓ | **✗** | Lax | OAuth/MFA partner-context blob (base64 `v2.0~CUNY-OAM-MFAPartner~…`). *Not previously documented.* |
| **`HELIDON_TENANT`** | `ssologin.cuny.edu` | ✓ | **✗** | **Strict** | Helidon tenant routing (`@default`). *Not previously documented.* |
| `oaaCtx` | `.ssologin.cuny.edu` | ✓ | ✓ | Lax | OAM auxiliary context (domain cookie, sent to all subdomains). |
| `OAMRequestContext_…_<hex>` | `ssologin.cuny.edu` | ✓ | ✓ | None | Transient in-flight OAM request context. *Not previously documented.* |
| `OAM_REQ_0`, `OAM_REQ_1` | `ssologin.cuny.edu` | ✓ | ✓ | None | In-flight request state; set to `invalid` after successful auth. |
| `OAM_REQ_COUNT` | `ssologin.cuny.edu` | ✓ | ✓ | None | Request counter. |
| `BIGipServer/…`, `BIGipServera/…` | `ssologin.cuny.edu` | ✓ | ✓ | Lax | F5 load-balancer affinity — **not** auth proofs. |
| `OAMAuthnHintCookie` | `.cuny.edu` | ✓ | ✓ | None | **Username hint only**, not a session token. On the parent domain, so the `ssologin.cuny.edu`-scoped sweep misses it (harmless). Visible to `manage_cookies` regardless. |

Which appear when: pre-login → `BIGipServer*`, `OAMAuthnHintCookie`, `OAM_REQ_*`,
`OAMRequestContext_*`. Pre-Allow-gate adds `OAM_ID`, `OAMAuthnCookie_*`, `oaaCtx`,
`OAACtxCookie`. Post-Allow-gate adds `_WL_AUTHCOOKIE_JSESSIONID`, `HELIDON_TENANT`,
`JSESSIONID`. The SAML/Brightspace flow is where `OAM_JSESSIONID` and `ORA_OSFS_SESSION`
appear. `ObSSOCookie` was still not observed.

### `brightspace.cuny.edu` (D2L) — outside `host_permissions`

| Cookie | httpOnly | secure | SameSite | Role |
|--------|----------|--------|----------|------|
| **`d2lSecureSessionVal`** | ✓ | ✓ | None | **Load-bearing** D2L secure session (HTTPS). Deleting it alone → `whoami` 403. |
| `d2lSessionVal` | ✓ | ✓ | None | D2L session value. |
| `d2lSameSiteCanaryA` | ✓ | ✓ | None | SameSite capability canary. |
| `d2lSameSiteCanaryB` | ✓ | ✓ | Lax | SameSite capability canary. |

## Verification protocol **[live 2026-06-10]**

Use an **API probe** as the auth oracle (the SPA/portal shell is cached and unreliable).
Record evidence as `{API endpoint, status, final URL}` — never cookie values.

**Post-consent (OAA SPA):**
1. Authenticate past `mfaConsent.jsp` to `/oaa/rui`.
2. Confirm authed: `fetch('/oaa/rui/user/v1')` → 200 JSON.
3. Trigger logout (`LOGOUT_CUNY_SESSIONS`) or delete `JSESSIONID`.
4. Confirm: `fetch('/oaa/rui/user/v1')` → 302 → `obrareq.cgi` (login HTML).

**Pre-consent (Allow gate):**
1. Log in through TOTP, stop at `mfaConsent.jsp`.
2. Delete `OAM_ID` **and** `OAMAuthnCookie_*` (deleting one is not enough — OAM re-mints).
3. Navigate `/oaa/rui` → redirects to `obrareq.cgi`.

**Brightspace:**
1. Authenticate to `brightspace.cuny.edu/d2l/home`.
2. Confirm authed: `fetch('/d2l/api/lp/1.43/users/whoami')` → 200 JSON `{Identifier,…}`.
3. Delete `d2lSecureSessionVal` → `whoami` returns 403.
4. To prove **full** logout (no silent re-fed): also delete `OAM_ID` + `ORA_OSFS_SESSION`
   on `ssologin.cuny.edu`, then visit `brightspace.cuny.edu` → CUNY Login form.

## Disclaimer

Oracle/WebGate/Helidon and D2L may add or rename cookies; confirm with the
`manage_cookies` MCP tool (or DevTools **Application → Cookies**) for failing cases.
Observations above are from `ssologin.cuny.edu` + `brightspace.cuny.edu`, Chrome,
2026-06-10.
