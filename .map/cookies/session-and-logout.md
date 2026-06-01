# Session cookies — CUNY SSO / OAM (`ssologin.cuny.edu`)

Observed May 2026 via live flows through `ssologin.cuny.edu` MFA. Values are intentionally omitted — only cookie **names**, hosts, attachment points, and behavior.

## Logging out of `/oaa/rui` — session behavior differs by OAuth consent state

The logout mechanism behaves differently depending on whether the user has passed the OAuth allow gate (`mfaConsent.jsp`).

### After the allow gate (full session)

Once the user clicks Allow on `mfaConsent.jsp`, the OAM server establishes a full server-side session that is **independent of cookies**. Client-side cookie deletion alone does not log the user out — even with zero browser cookies, the SPA loads as authenticated because the OAM server still considers the session valid.

**The correct logout procedure is to navigate to the OAA logout endpoint:**

```
GET https://ssologin.cuny.edu/oaa/rui/user/v1/logout
```

This endpoint:
- Terminates the server-side OAA session
- Redirects the browser to `https://ssologin.cuny.edu/cunylogin/pages/Logout.jsp` ("You Have Logged Out")
- After which any navigation to `/oaa/rui` requires full re-authentication (redirects to `obrareq.cgi`)

The logout URL is also available from the authenticated API: `GET /oaa/rui/user/v1` returns `{"key":"logout_location","val":"/oaa/rui/user/v1/logout"}`.

### At the allow gate (pre-consent)

If the user has logged in and reached `mfaConsent.jsp` but has **not yet clicked Allow**, the session state is different:

- The logout endpoint **does not work** from this state. Navigating to or fetching `GET /oaa/rui/user/v1/logout` redirects back to a fresh `mfaConsent.jsp` rather than to `Logout.jsp`. The server-side session is not terminated.
- **Clearing all `ssologin.cuny.edu` cookies is sufficient for logout** at this stage. After cookie removal, navigating to `/oaa/rui` redirects to `obrareq.cgi` and requires full re-authentication.

This asymmetry is why the extension's `terminateOaaRuiSessions` function runs both the logout fetch **and** a full cookie sweep: the fetch handles the post-consent case, and the cookie sweep handles the pre-consent (allow-gate) case.

### Extension logout procedure (combined approach)

The extension `terminateOaaRuiSessions` function:
1. Navigates open SSO tabs to `OAA_RUI_LOGOUT_URL` (terminates post-consent sessions via redirect)
2. Fetches `OAA_RUI_LOGOUT_URL` with `credentials: "include"` (belt-and-suspenders server-side termination)
3. Calls `browser.cookies.getAll({ domain: SSO_LOGIN_HOST })` and removes every cookie (handles pre-consent sessions where the fetch fails)

## Cookies observed after a complete MFA login (May 2026, Chrome)

Extension `host_permissions`: `https://ssologin.cuny.edu/*`.

| Cookie | Domain | SameSite | Typical role |
|--------|--------|----------|--------------|
| **`OAM_ID`** | `ssologin.cuny.edu` | `no_restriction` | Oracle OAM session artifact (HttpOnly, Secure) |
| **`OAMAuthnCookie_ssologin.cuny.edu_443`** | `ssologin.cuny.edu` | `no_restriction` | Oracle WebGate bearer for this host/port (HttpOnly, Secure) |
| **`oaaCtx`** | `.ssologin.cuny.edu` | `unspecified` | OAM auxiliary context blob; domain cookie sent to all subdomains of ssologin.cuny.edu (HttpOnly, Secure) |
| **`_WL_AUTHCOOKIE_JSESSIONID`** | `ssologin.cuny.edu` | `unspecified` | WebLogic HTTP session affinity (HttpOnly, Secure) |
| `OAM_REQ_0`, `OAM_REQ_1` | `ssologin.cuny.edu` | `no_restriction` | In-flight request state; set to `invalid` after successful auth |
| `OAM_REQ_COUNT` | `ssologin.cuny.edu` | `no_restriction` | Request counter |
| `BIGipServer/…`, `BIGipServera/…` | `ssologin.cuny.edu` | `unspecified` | Load-balancer affinity — **not** auth proofs |
| `OAMAuthnHintCookie` | `.cuny.edu` | `no_restriction` | **Username hint only** — pre-fills login form username. Not a session token. Only visible to the extension with `https://*.cuny.edu/*` in `host_permissions` (intentionally absent — too broad). |

`ObSSOCookie`, `ORA_OSFS_SESSION`, and `OAM_JSESSIONID` were **not observed** in the May 2026 Chrome session post-login; they may be present in other flows or environments.

## Verification protocol

**Post-consent (past the allow gate):**
1. Establish a fully authenticated session at `https://ssologin.cuny.edu/oaa/rui` (past `mfaConsent.jsp`).
2. Trigger logout (`LOGOUT_CUNY_SESSIONS` runtime message).
3. Confirm the tab navigated to `Logout.jsp` ("You Have Logged Out").
4. Navigate to `https://ssologin.cuny.edu/oaa/rui` and verify redirect to `obrareq.cgi`.

**Pre-consent (at the allow gate):**
1. Log in through TOTP but stop at `mfaConsent.jsp` without clicking Allow.
2. Trigger logout (`LOGOUT_CUNY_SESSIONS` runtime message).
3. The tab will navigate to the logout URL, but it redirects back to `mfaConsent.jsp` (not `Logout.jsp`) — this is expected and not a failure.
4. Navigate to `https://ssologin.cuny.edu/oaa/rui` and verify redirect to `obrareq.cgi` (cookie sweep did the work).

Record evidence as final URL + visible page text (never cookie values).

## Disclaimer

Oracle and WebGate may add or rename cookies; always confirm in DevTools **Application → Cookies** for failing cases. Observations above are from `ssologin.cuny.edu` May 2026.
