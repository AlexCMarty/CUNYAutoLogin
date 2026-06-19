import { describe, expect, test } from "vitest";
import {
  BRIGHTSPACE_HOME_URL,
  LOGIN_EMAIL_SUFFIX,
  OAA_RUI_OIDC_ACCESS_DENIED_ERROR,
  OAA_RUI_OIDC_REDIRECT_PATH,
  SSO_LOGIN_HOST,
  SSO_LOGIN_ORIGIN,
  WEBAUTHN_RP_ID,
  isAllowedReopenCunyTabUrl,
  isBrightspaceUrl,
  isTrustedContentScriptMessageHostname,
  matchesCredentialErrorUrl,
  matchesCredentialPage,
  matchesMfaConsentPage,
  matchesOaaRuiAccessDeniedRedirect,
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

  test("RUI MFA enroll-verify URL (h_ra=1) → true", () => {
    expect(
      matchesTotpEnrollPage("https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1")
    ).toBe(true);
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

// ── vault-session/mirrored-constant-asserts [LOW] ─────────────────────────────
// Pure "CONST === its own literal" self-mirror tests were removed (net-negative
// coverage: they pin no behavior and break only on an intentional edit). Kept:
// only constants that encode a genuine cross-file / security contract.
describe("cross-module constant invariants", () => {
  test("SSO_LOGIN_ORIGIN matches the host the manifest + content scripts are pinned to", () => {
    expect(SSO_LOGIN_ORIGIN).toBe("https://ssologin.cuny.edu");
  });

  test("LOGIN_EMAIL_SUFFIX is the @login.cuny.edu hard rule for saved emails", () => {
    expect(LOGIN_EMAIL_SUFFIX).toBe("@login.cuny.edu");
  });

  test("WEBAUTHN_RP_ID equals the SSO host (a mismatch breaks biometric unlock)", () => {
    expect(WEBAUTHN_RP_ID).toBe(SSO_LOGIN_HOST);
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
