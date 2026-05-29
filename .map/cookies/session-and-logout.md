# Session cookies — CUNY SSO / OAM (`ssologin.cuny.edu`)

Observed May 2026 via live flows through `ssologin.cuny.edu` MFA. Values are intentionally omitted — only cookie **names**, hosts, attachment points, and behavior.

## Logging out of `/oaa/rui` — server-side session, not cookie-based

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

## Onboarding Screen 4 — no open SSO tab (`openTabAfterOaaLogout`)

When the student closes every `ssologin.cuny.edu` tab before Screen 4, `LOGOUT_CUNY_SESSIONS` alone only performs a best-effort service-worker `fetch` — **that does not terminate the OAA server session**. Screen 4 therefore uses `src/cuny/openTabAfterOaaLogout.ts`:

1. `browser.tabs.create({ active: true })` — blank tab (no URL on create).
2. `browser.tabs.update(tabId, { url: OAA_RUI_LOGOUT_URL })` — same navigation shape as the dev-panel logout button.
3. Wait until the tab URL contains **`Logout.jsp`** and `status === "complete"`. Do **not** treat an early `complete` on `chrome://newtab` as logout finished (May 2026 regression: racing to `/oaa/rui` while still authenticated skipped credential validation and landed on MFA consent).
4. `browser.tabs.update(tabId, { url: CUNY_LOGIN_ENTRY_URL })` — credential demo tab.

**E2E / fixture targets** (`127.0.0.1`, `localhost`) skip steps 1–4 and open the fixture URL directly — there is no live OAA session to terminate (`requiresOaaLogoutBeforeNavigation` in `ssoSite.ts`).

`ONBOARDING_REOPEN_CUNY_TAB` for SSO hosts uses the same helper. Brightspace reopen still clears D2L cookies and opens the target URL directly.

Unit regression tests: `src/cuny/openTabAfterOaaLogout.test.ts` (describe **pre-auth onboarding regression**), `src/onboarding/screens/openingCuny.test.ts`, `src/background/service-worker.test.ts`.

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

1. Establish a logged-in state at `https://ssologin.cuny.edu/oaa/rui`.
2. Trigger logout (dev panel button or `LOGOUT_CUNY_SESSIONS` runtime message).
3. Confirm the tab navigated to `Logout.jsp` ("You Have Logged Out").
4. Navigate to `https://ssologin.cuny.edu/oaa/rui` and verify redirect to `obrareq.cgi`.
5. Record evidence as final URL + visible page text (never cookie values).

## Disclaimer

Oracle and WebGate may add or rename cookies; always confirm in DevTools **Application → Cookies** for failing cases. Observations above are from `ssologin.cuny.edu` May 2026.
