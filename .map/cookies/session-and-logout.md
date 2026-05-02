# Session cookies — Brightspace (D2L), CUNYFirst (PeopleSoft), and CUNY SSO (OAM)

Observed May 2026 via live flows through `ssologin.cuny.edu` MFA. Values are intentionally omitted — only cookie **names**, hosts, attachment points, and behavior.

## Summary: identical IdP logout, different SP cookies

| Layer | Same across Brightspace + CUNYFirst? |
|-------|--------------------------------------|
| **CUNY SSO (`ssologin.cuny.edu`)** — breaking MFA/password gate on the next federation hop | **Yes.** Same **`OAM_ID`** / **`ORA_OSFS_SESSION`** (and optionally **`OAM_JSESSIONID`**) guidance as below. **`OAACtxCookie`** still rotates mid-flow on `auth_cred_submit`. |
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

### Fewest removals to treat the user as “logged out” of Brightspace

Delete **`d2lSessionVal`** and **`d2lSecureSessionVal`** on `https://brightspace.cuny.edu/`. Those are the two session cookies observed on SAML completion. Clearing the **`d2lSameSiteCanary*`** pair is optional (they are not the cryptographic session proofs but can be removed for a clean cookie jar).

Reloading `/d2l/home` afterward should bounce through SAML again. If the **IdP SSO session is still alive**, the browser may return to Brightspace **without password/TOTP** (same problem as onboarding “Try it out” showing only a reload).

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
| `PS_DEVICEFEATURES`, `ps_theme`, `OAMAuthnHintCookie` | Feature hints / UX (not pure auth, but may be cleared when resetting cleanly). |

`BIGipServer*` on **`home.cunyfirst.cuny.edu`** / **`.cunyfirst.cuny.edu`** is load-balancer affinity, not proof of login.

### Fewest removals to treat the user as “logged out” of CUNYFirst

Minimal **portal session teardown** observed in practice:

1. **`PS_TOKEN`** on **`https://home.cunyfirst.cuny.edu/`** (covers `domain=.cunyfirst.cuny.edu`).
2. **`…-PORTAL-PSJSESSIONID`** for your environment (here **`cnyihprd-8080-PORTAL-PSJSESSIONID`**) on the same registrable domain.

Add **`OAMAuthnCookie_home.cunyfirst.cuny.edu_443`** on **`https://home.cunyfirst.cuny.edu/`** so the browser does not immediately present a stale WebGate assertion on the front door host.

Reloading **`https://home.cunyfirst.cuny.edu/`** after that forces a fresh **`obrareq.cgi`** hand-off. To require **full MFA/password** again (not SSO slide), also clear **`OAM_ID`** / **`ORA_OSFS_SESSION`** on the IdP as in the SSO section below — **same recommendation as Brightspace**.

Subdomains (**`*.cunyfirst.cuny.edu`**, e.g. `hrsa.` / `cssa.` pings seen on home load) reuse **PeopleSoft-domain** cookies once issued; wiping **`.cunyfirst.cuny.edu`** scoped names covers those tabs as well unless the app split cookies onto a narrower host-only jar.

---

## CUNY SSO / OAM — `ssologin.cuny.edu`

On the MFA completion path (`POST https://ssologin.cuny.edu/oam/server/auth_cred_submit`), responses included **`Set-Cookie`** updates such as:

| Cookie | Typical role |
|--------|----------------|
| **`OAM_ID`** | Oracle OAM identity / SSO session artifact (HttpOnly) |
| **`ORA_OSFS_SESSION`** | Oracle federation / session subsystem (HttpOnly) |
| `OAACtxCookie` | OAM auxiliary context blob (often rotated mid-flow; HttpOnly) |
| **`OAM_JSESSIONID`** | Java HTTP session on the IdP (affinity with app nodes) |

Load-balancer affinity cookies (**`BIGipServer*`** variants) appeared in requests but are **not** authentication proofs; skipping them avoids unnecessary infra churn.

Previously active request state cookies **`OAM_REQ_0`** / **`OAM_REQ_1`** were observed set to **`invalid`** on successful transition (replacing earlier large payloads).

### Fewest removals to break IdP SSO (force full challenge again)

A practical **minimal pair** observed to matter for SSO continuity:

1. **`OAM_ID`** on the IdP host (or whichever `Domain=` the cookie uses when inspected in DevTools Application → Cookies).
2. **`ORA_OSFS_SESSION`** (same caveat: match **name + domain + path** from DevTools).

If a corner case still SSO-slides without MFA, remove **`OAM_JSESSIONID`** as well for that host. Clearing **`OAACtxCookie`** is a heavier-handed reset of auxiliary context.

**Order of operations:** For onboarding UX that must show **real** re-auth, clear (**1**) SP session cookies (**Brightspace** *or* **CUNYFirst** per sections above), **then** (**2**) **IdP** cookies if you must kill SSO-slide, **then** navigate or reload.

## Extension implementation notes (MV3 / `browser.*`)

- Clearing cookies requires the **`cookies` API permission** in the manifest (`"permissions": ["cookies", …]`).
- **`browser.cookies.remove`** needs a URL whose **scheme + registrable domain** matches the cookie; e.g. `{ url: "https://brightspace.cuny.edu/", name: "d2lSessionVal" }` or `{ url: "https://home.cunyfirst.cuny.edu/", name: "PS_TOKEN" }`.
- **`OAMAuthnCookie_*` names encode host and port.** Prefer **`browser.cookies.getAll`** filtered by **`domain`** / **`url`** rather than hard-coding literals for every vanity host WebGate exposes.
- This repo currently grants **`host_permissions`** only for `https://ssologin.cuny.edu/*`. To programmatically wipe **Brightspace**, **home CUNYFirst**, or `.cunyfirst.cuny.edu` jars, extend host permissions (e.g. `https://brightspace.cuny.edu/*`, `https://*.cunyfirst.cuny.edu/*`) to match only hosts you deliberately support.
- HttpOnly cookies **cannot** be cleared from content scripts via `document.cookie`; use the **`cookies`** API from a background/service worker.

## Disclaimer

Oracle, WebGate, and D2L/PeopleSoft may add or rename cookies; always confirm in DevTools **Application → Cookies** for failing cases. SAML / `obrar.cgi` flows for other portals may attach auxiliary cookies — the **minimal pairs** above are pragmatic baselines observed on `brightspace.cuny.edu` / `home.cunyfirst.cuny.edu` May 2026.
