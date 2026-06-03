import { describe, expect, test } from "vitest";
import {
  BRIGHTSPACE_HOME_URL,
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
  CREDENTIAL_INPUT_IDS,
  CREDENTIAL_PAGE_PATH_MARKERS,
  CUNY_ALLOW_GATE_BTN_SELECTOR,
  CUNY_LOGIN_ENTRY_URL,
  ENROLLED_FACTOR_ALIAS_SESSION_KEY,
  EXTENSION_NAME,
  LOGIN_EMAIL_SUFFIX,
  MFA_CONSENT_PAGE_PATH_MARKER,
  OAA_RUI_LOGOUT_URL,
  OAA_RUI_OIDC_ACCESS_DENIED_ERROR,
  OAA_RUI_OIDC_REDIRECT_PATH,
  PENDING_TOTP_SECRET_SESSION_KEY,
  RUI_MFA_ENROLL_VERIFY_PAGE_URL,
  SESSION_MASTER_KEY,
  SSO_LOGIN_HOST,
  SSO_LOGIN_ORIGIN,
  SSO_LOGIN_TABS_QUERY_URL_PATTERN,
  TOTP_ERROR_EMSG_PARAM,
  TOTP_OTP_INPUT_ID,
  TOTP_SECRET_LEN_MAX,
  TOTP_SECRET_LEN_MIN,
  TOTP_VERIFY_BUTTON_LABEL,
  WEBAUTHN_RP_ID,
  isAllowedReopenCunyTabUrl,
  isBrightspaceUrl,
  isTrustedContentScriptMessageHostname,
  matchesCredentialErrorUrl,
  matchesCredentialPage,
  matchesMfaConsentPage,
  matchesOaaRuiAccessDeniedRedirect,
  matchesRuiMfaEnrollVerifyPage,
  matchesTotpEnrollPage,
  matchesTotpPage,
  normalizeTotpSecretCandidate,
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

describe("additional constants", () => {
  test('BRIGHTSPACE_HOME_URL is "https://brightspace.cuny.edu/d2l/home"', () => {
    expect(BRIGHTSPACE_HOME_URL).toBe("https://brightspace.cuny.edu/d2l/home");
  });

  test('OAA_RUI_LOGOUT_URL is "https://ssologin.cuny.edu/oaa/rui/user/v1/logout"', () => {
    expect(OAA_RUI_LOGOUT_URL).toBe("https://ssologin.cuny.edu/oaa/rui/user/v1/logout");
  });

  test('CUNY_LOGIN_ENTRY_URL is "https://ssologin.cuny.edu/oaa/rui"', () => {
    expect(CUNY_LOGIN_ENTRY_URL).toBe("https://ssologin.cuny.edu/oaa/rui");
  });

  test('EXTENSION_NAME is "CUNYAutoLogin"', () => {
    expect(EXTENSION_NAME).toBe("CUNYAutoLogin");
  });

  test('WEBAUTHN_RP_ID is "ssologin.cuny.edu"', () => {
    expect(WEBAUTHN_RP_ID).toBe("ssologin.cuny.edu");
  });

  test('SESSION_MASTER_KEY is "cunySessionMaster"', () => {
    expect(SESSION_MASTER_KEY).toBe("cunySessionMaster");
  });

  test('PENDING_TOTP_SECRET_SESSION_KEY is "cunyPendingTotpSecretFromSso"', () => {
    expect(PENDING_TOTP_SECRET_SESSION_KEY).toBe("cunyPendingTotpSecretFromSso");
  });

  test('ENROLLED_FACTOR_ALIAS_SESSION_KEY is "cunyEnrolledFactorAlias"', () => {
    expect(ENROLLED_FACTOR_ALIAS_SESSION_KEY).toBe("cunyEnrolledFactorAlias");
  });

  test('TOTP_OTP_INPUT_ID is "otpValue|input"', () => {
    expect(TOTP_OTP_INPUT_ID).toBe("otpValue|input");
  });

  test('TOTP_VERIFY_BUTTON_LABEL is "Verify"', () => {
    expect(TOTP_VERIFY_BUTTON_LABEL).toBe("Verify");
  });

  test('TOTP_ERROR_EMSG_PARAM is "emsg"', () => {
    expect(TOTP_ERROR_EMSG_PARAM).toBe("emsg");
  });

  test("TOTP_SECRET_LEN_MIN is 10", () => {
    expect(TOTP_SECRET_LEN_MIN).toBe(10);
  });

  test("TOTP_SECRET_LEN_MAX is 128", () => {
    expect(TOTP_SECRET_LEN_MAX).toBe(128);
  });

  test('CUNY_ALLOW_GATE_BTN_SELECTOR is \'button[onclick="allow()"]\' ', () => {
    expect(CUNY_ALLOW_GATE_BTN_SELECTOR).toBe('button[onclick="allow()"]');
  });

  test('MFA_CONSENT_PAGE_PATH_MARKER is "mfaConsent"', () => {
    expect(MFA_CONSENT_PAGE_PATH_MARKER).toBe("mfaConsent");
  });

  test("CREDENTIAL_INPUT_IDS has correct field values", () => {
    expect(CREDENTIAL_INPUT_IDS.username).toBe("CUNYLoginUsernameDisplay");
    expect(CREDENTIAL_INPUT_IDS.password).toBe("CUNYLoginPassword");
    expect(CREDENTIAL_INPUT_IDS.submitButton).toBe("submit");
  });

  test('CREDENTIAL_ERROR_ELEMENT_ID is "serverError"', () => {
    expect(CREDENTIAL_ERROR_ELEMENT_ID).toBe("serverError");
  });

  test('CREDENTIAL_ERROR_TEXT_MARKER is "Incorrect Username or Password"', () => {
    expect(CREDENTIAL_ERROR_TEXT_MARKER).toBe("Incorrect Username or Password");
  });
});

describe("normalizeTotpSecretCandidate", () => {
  test("valid uppercase Base32 → returned unchanged", () => {
    expect(normalizeTotpSecretCandidate("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  test("lowercase → uppercased", () => {
    expect(normalizeTotpSecretCandidate("jbswy3dpehpk3pxp")).toBe("JBSWY3DPEHPK3PXP");
  });

  test("spaces stripped", () => {
    expect(normalizeTotpSecretCandidate("JBSWY3DP EHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  test("trailing padding stripped", () => {
    expect(normalizeTotpSecretCandidate("JBSWY3DPEHPK3PXP==")).toBe("JBSWY3DPEHPK3PXP");
  });

  test("exactly 10 chars (lower boundary) → accepted", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGHIJ")).toBe("ABCDEFGHIJ");
  });

  test("exactly 128 chars (upper boundary) → accepted", () => {
    const secret = "A".repeat(128);
    expect(normalizeTotpSecretCandidate(secret)).toBe(secret);
  });

  test("9 chars after normalization → null (below minimum)", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGHI")).toBeNull();
  });

  test("129 chars after normalization → null (above maximum)", () => {
    expect(normalizeTotpSecretCandidate("A".repeat(129))).toBeNull();
  });

  test("invalid char '0' → null", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGH0J")).toBeNull();
  });

  test("invalid char '1' → null", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGH1J")).toBeNull();
  });

  test("invalid char '8' → null", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGH8J")).toBeNull();
  });

  test("digits 2-7 are accepted", () => {
    expect(normalizeTotpSecretCandidate("ABCDE23456")).toBe("ABCDE23456");
  });

  test("empty string → null", () => {
    expect(normalizeTotpSecretCandidate("")).toBeNull();
  });

  test("spaces + lowercase + padding all normalized together", () => {
    expect(normalizeTotpSecretCandidate("jbswy3dp ehpk3pxp=")).toBe("JBSWY3DPEHPK3PXP");
  });

  // vault-session/normalizer-dash-unpinned: authenticator/QR exports hyphenate Base32 groups
  test("single hyphen between groups stripped → accepted", () => {
    expect(normalizeTotpSecretCandidate("JBSWY3DP-EHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  test("fully grouped form with multiple hyphens stripped → accepted", () => {
    expect(normalizeTotpSecretCandidate("JBSW-Y3DP-EHPK-3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  // vault-session/normalizer-whitespace-variety: \s covers tabs and newlines, not just spaces
  test("tabs and newlines stripped", () => {
    expect(normalizeTotpSecretCandidate("JBSWY3DP\tEHPK\n3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  // vault-session/normalizer-embedded-padding: mid-string = survives end-anchored strip and fails charset
  test("mid-string = rejected (not trailing padding)", () => {
    expect(normalizeTotpSecretCandidate("JBSW=Y3DPEHPK")).toBeNull();
  });

  // vault-session/normalizer-padding-undershoot: trailing padding stripped before length gate, 8 chars < min
  test("trailing padding stripped before length check leaves too-short secret → null", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGH=====")).toBeNull();
  });

  // vault-session/normalizer-duplicate-drift: digit 9 is invalid Base32 (was only in content.test.ts)
  test("invalid char '9' → null", () => {
    expect(normalizeTotpSecretCandidate("ABCDEFGH9J")).toBeNull();
  });
});

describe("isAllowedReopenCunyTabUrl", () => {
  test("ssologin.cuny.edu https URL → true", () => {
    expect(isAllowedReopenCunyTabUrl(`${SSO_LOGIN_ORIGIN}/oam/server/obrareq.cgi`)).toBe(true);
  });

  test("brightspace.cuny.edu https URL → true", () => {
    expect(isAllowedReopenCunyTabUrl(BRIGHTSPACE_HOME_URL)).toBe(true);
  });

  test("http scheme → false (not https)", () => {
    expect(isAllowedReopenCunyTabUrl(`http://${SSO_LOGIN_HOST}/oam/`)).toBe(false);
  });

  test("different host → false", () => {
    expect(isAllowedReopenCunyTabUrl("https://example.com/page")).toBe(false);
  });

  test("URL with userinfo → false", () => {
    expect(isAllowedReopenCunyTabUrl(`https://user@${SSO_LOGIN_HOST}/`)).toBe(false);
  });

  test("invalid URL string → false without throwing", () => {
    expect(isAllowedReopenCunyTabUrl("not a url")).toBe(false);
  });

  test("empty string → false without throwing", () => {
    expect(isAllowedReopenCunyTabUrl("")).toBe(false);
  });
});

describe("isBrightspaceUrl", () => {
  test("brightspace.cuny.edu URL → true", () => {
    expect(isBrightspaceUrl(BRIGHTSPACE_HOME_URL)).toBe(true);
  });

  test("ssologin.cuny.edu URL → false", () => {
    expect(isBrightspaceUrl(SSO_LOGIN_ORIGIN)).toBe(false);
  });

  test("invalid URL → false without throwing", () => {
    expect(isBrightspaceUrl("not a url")).toBe(false);
  });

  test("empty string → false without throwing", () => {
    expect(isBrightspaceUrl("")).toBe(false);
  });

  test("http brightspace URL → true (scheme not checked)", () => {
    expect(isBrightspaceUrl("http://brightspace.cuny.edu/d2l/home")).toBe(true);
  });
});

describe("isTrustedContentScriptMessageHostname", () => {
  test("ssologin.cuny.edu → true", () => {
    expect(isTrustedContentScriptMessageHostname("ssologin.cuny.edu")).toBe(true);
  });

  test("127.0.0.1 → true (local E2E fixture)", () => {
    expect(isTrustedContentScriptMessageHostname("127.0.0.1")).toBe(true);
  });

  test("localhost → true (local E2E fixture)", () => {
    expect(isTrustedContentScriptMessageHostname("localhost")).toBe(true);
  });

  test("example.com → false", () => {
    expect(isTrustedContentScriptMessageHostname("example.com")).toBe(false);
  });

  test("brightspace.cuny.edu → false (not in trust list)", () => {
    expect(isTrustedContentScriptMessageHostname("brightspace.cuny.edu")).toBe(false);
  });

  test("evil-ssologin.cuny.edu → false (not exact match)", () => {
    expect(isTrustedContentScriptMessageHostname("evil-ssologin.cuny.edu")).toBe(false);
  });

  test("empty string → false", () => {
    expect(isTrustedContentScriptMessageHostname("")).toBe(false);
  });
});

describe("matchesCredentialErrorUrl", () => {
  test("URL with auth_cred_submit path → true", () => {
    expect(matchesCredentialErrorUrl(
      `${SSO_LOGIN_ORIGIN}/oam/server/auth_cred_submit`
    )).toBe(true);
  });

  test("credential page URL → false", () => {
    expect(matchesCredentialErrorUrl(
      `${SSO_LOGIN_ORIGIN}/oam/server/obrareq.cgi`
    )).toBe(false);
  });

  test("empty string → false", () => {
    expect(matchesCredentialErrorUrl("")).toBe(false);
  });
});

describe("matchesMfaConsentPage", () => {
  test("URL with mfaConsent path marker → true", () => {
    expect(matchesMfaConsentPage(
      `${SSO_LOGIN_ORIGIN}/cunylogin/pages/mfaConsent.jsp`
    )).toBe(true);
  });

  test("credential page URL → false", () => {
    expect(matchesMfaConsentPage(
      `${SSO_LOGIN_ORIGIN}/oam/server/obrareq.cgi`
    )).toBe(false);
  });

  test("empty string → false", () => {
    expect(matchesMfaConsentPage("")).toBe(false);
  });
});
