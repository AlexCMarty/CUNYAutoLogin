import { describe, expect, test } from "vitest";
import {
  CREDENTIAL_PAGE_PATH_MARKERS,
  CUNY_LOGIN_ENTRY_URL,
  LOGIN_EMAIL_SUFFIX,
  OAA_RUI_OIDC_ACCESS_DENIED_ERROR,
  OAA_RUI_OIDC_REDIRECT_PATH,
  RUI_MFA_ENROLL_VERIFY_PAGE_URL,
  SSO_LOGIN_HOST,
  SSO_LOGIN_ORIGIN,
  SSO_LOGIN_TABS_QUERY_URL_PATTERN,
  matchesCredentialPage,
  matchesOaaRuiAccessDeniedRedirect,
  matchesRuiMfaEnrollVerifyPage,
  matchesTotpEnrollPage,
  matchesTotpPage,
  requiresOaaLogoutBeforeNavigation,
} from "./ssoSite";

describe("matchesCredentialPage", () => {
  test("URL contains obrareq.cgi path marker → true", () => {
    expect(matchesCredentialPage("https://ssologin.cuny.edu/oam/server/obrareq.cgi?querystring")).toBe(true);
  });

  test("URL contains samlv20 path marker → true", () => {
    expect(matchesCredentialPage("https://ssologin.cuny.edu/oamfed/idp/samlv20")).toBe(true);
  });

  test("bare path substring obrareq.cgi → true", () => {
    expect(matchesCredentialPage("/oam/server/obrareq.cgi")).toBe(true);
  });

  test("bare path substring samlv20 → true", () => {
    expect(matchesCredentialPage("/oamfed/idp/samlv20")).toBe(true);
  });

  test("TOTP page URL → false", () => {
    expect(matchesCredentialPage("https://ssologin.cuny.edu/oaa-totp-factor/")).toBe(false);
  });

  test("unrelated URL → false", () => {
    expect(matchesCredentialPage("https://example.com/login")).toBe(false);
  });

  test("empty string → false", () => {
    expect(matchesCredentialPage("")).toBe(false);
  });

  test("partial obrareq marker without .cgi extension → false", () => {
    expect(matchesCredentialPage("https://ssologin.cuny.edu/oam/server/obrareq")).toBe(false);
  });
});

describe("matchesTotpPage", () => {
  test("URL contains /oaa-totp-factor/ → true", () => {
    expect(matchesTotpPage("https://ssologin.cuny.edu/oaa-totp-factor/step1")).toBe(true);
  });

  test("bare path substring /oaa-totp-factor/ → true", () => {
    expect(matchesTotpPage("/oaa-totp-factor/")).toBe(true);
  });

  test("credential page URL → false", () => {
    expect(matchesTotpPage("https://ssologin.cuny.edu/oam/server/obrareq.cgi")).toBe(false);
  });

  test("enroll page URL → false", () => {
    expect(matchesTotpPage("https://ssologin.cuny.edu/oaa/rui/index.html")).toBe(false);
  });

  test("empty string → false", () => {
    expect(matchesTotpPage("")).toBe(false);
  });

  test("/oaa-totp-factor without trailing slash → false", () => {
    expect(matchesTotpPage("https://ssologin.cuny.edu/oaa-totp-factor")).toBe(false);
  });
});

describe("matchesTotpEnrollPage", () => {
  test("URL contains /oaa/rui/ → true", () => {
    expect(matchesTotpEnrollPage("https://ssologin.cuny.edu/oaa/rui/index.html")).toBe(true);
  });

  test("RUI_MFA_ENROLL_VERIFY_PAGE_URL → true", () => {
    expect(matchesTotpEnrollPage(RUI_MFA_ENROLL_VERIFY_PAGE_URL)).toBe(true);
  });

  test("credential page URL → false", () => {
    expect(matchesTotpEnrollPage("https://ssologin.cuny.edu/oam/server/obrareq.cgi")).toBe(false);
  });

  test("TOTP page URL → false", () => {
    expect(matchesTotpEnrollPage("https://ssologin.cuny.edu/oaa-totp-factor/")).toBe(false);
  });

  test("empty string → false", () => {
    expect(matchesTotpEnrollPage("")).toBe(false);
  });
});

describe("matchesRuiMfaEnrollVerifyPage", () => {
  test("exact production URL → true", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1")).toBe(true);
  });

  test("extra query params alongside h_ra=1 → true", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1&other=2")).toBe(true);
  });

  test("local fixture URL with same path and h_ra=1 → true", () => {
    expect(matchesRuiMfaEnrollVerifyPage("http://127.0.0.1:4173/oaa/rui/index.html?h_ra=1")).toBe(true);
  });

  test("missing h_ra param entirely → false", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/index.html")).toBe(false);
  });

  test("h_ra=0 → false", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=0")).toBe(false);
  });

  test("h_ra=2 → false", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=2")).toBe(false);
  });

  test("wrong pathname with correct h_ra=1 → false", () => {
    expect(matchesRuiMfaEnrollVerifyPage("https://ssologin.cuny.edu/oaa/rui/other.html?h_ra=1")).toBe(false);
  });

  test("not a valid URL → false without throwing", () => {
    expect(matchesRuiMfaEnrollVerifyPage("not a url")).toBe(false);
  });

  test("empty string → false without throwing", () => {
    expect(matchesRuiMfaEnrollVerifyPage("")).toBe(false);
  });
});

describe("matchesOaaRuiAccessDeniedRedirect", () => {
  test("OIDC redirect with access_denied → true", () => {
    expect(
      matchesOaaRuiAccessDeniedRedirect(
        `${SSO_LOGIN_ORIGIN}${OAA_RUI_OIDC_REDIRECT_PATH}?error=${OAA_RUI_OIDC_ACCESS_DENIED_ERROR}`
      )
    ).toBe(true);
  });

  test("relative href with access_denied → true", () => {
    expect(
      matchesOaaRuiAccessDeniedRedirect(
        `${OAA_RUI_OIDC_REDIRECT_PATH}?error=${OAA_RUI_OIDC_ACCESS_DENIED_ERROR}`
      )
    ).toBe(true);
  });

  test("missing error param → false", () => {
    expect(matchesOaaRuiAccessDeniedRedirect(`${SSO_LOGIN_ORIGIN}/oaa/rui/`)).toBe(false);
  });
});

describe("requiresOaaLogoutBeforeNavigation", () => {
  test("live ssologin entry URL requires OAA logout first", () => {
    expect(requiresOaaLogoutBeforeNavigation(CUNY_LOGIN_ENTRY_URL)).toBe(true);
  });

  test("e2e fixture URLs skip OAA logout", () => {
    expect(
      requiresOaaLogoutBeforeNavigation("http://127.0.0.1:4173/oam/server/obrareq.cgi")
    ).toBe(false);
  });
});

describe("constants", () => {
  test("SSO_LOGIN_TABS_QUERY_URL_PATTERN matches manifest host pattern", () => {
    expect(SSO_LOGIN_TABS_QUERY_URL_PATTERN).toBe(`${SSO_LOGIN_ORIGIN}/*`);
  });

  test('OAA_RUI_OIDC_ACCESS_DENIED_ERROR is "access_denied"', () => {
    expect(OAA_RUI_OIDC_ACCESS_DENIED_ERROR).toBe("access_denied");
  });

  test('OAA_RUI_OIDC_REDIRECT_PATH is "/oaa/rui/oidc/redirect"', () => {
    expect(OAA_RUI_OIDC_REDIRECT_PATH).toBe("/oaa/rui/oidc/redirect");
  });

  test('SSO_LOGIN_HOST is "ssologin.cuny.edu"', () => {
    expect(SSO_LOGIN_HOST).toBe("ssologin.cuny.edu");
  });

  test('SSO_LOGIN_ORIGIN is "https://ssologin.cuny.edu"', () => {
    expect(SSO_LOGIN_ORIGIN).toBe("https://ssologin.cuny.edu");
  });

  test('LOGIN_EMAIL_SUFFIX is "@login.cuny.edu"', () => {
    expect(LOGIN_EMAIL_SUFFIX).toBe("@login.cuny.edu");
  });

  test("CREDENTIAL_PAGE_PATH_MARKERS has exactly 2 entries", () => {
    expect(CREDENTIAL_PAGE_PATH_MARKERS).toHaveLength(2);
  });

  test('RUI_MFA_ENROLL_VERIFY_PAGE_URL is "https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1"', () => {
    expect(RUI_MFA_ENROLL_VERIFY_PAGE_URL).toBe("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1");
  });
});
