// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from "vitest";
import { detectRuiSpaView } from "./ruiSpaView";
import {
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  RUI_FACTOR_PANEL_SELECTOR,
  RUI_OAA_HOME_HEADER_ID,
  TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY,
} from "../cuny/ssoSite";

const NORMAL_HREF = "https://ssologin.cuny.edu/oaa/rui";
const ACCESS_DENIED_HREF = "https://ssologin.cuny.edu/oaa/rui/oidc/redirect?error=access_denied";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("detectRuiSpaView", () => {
  test("returns loading when document is empty and href is normal", () => {
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("loading");
  });

  test("returns access_denied when href contains error=access_denied", () => {
    expect(detectRuiSpaView(document, ACCESS_DENIED_HREF)).toBe("access_denied");
  });

  test("access_denied takes priority over all DOM checks", () => {
    document.body.innerHTML = `
      <input id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}" />
      <div aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}">SECRET</div>
      <factor-panel></factor-panel>
      <div id="${RUI_OAA_HOME_HEADER_ID}"></div>
    `;
    expect(detectRuiSpaView(document, ACCESS_DENIED_HREF)).toBe("access_denied");
  });

  test("returns totp_enroll_verify when otp|input element is present", () => {
    document.body.innerHTML = `<input id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}" />`;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("totp_enroll_verify");
  });

  test("totp_enroll_verify takes priority over totp_enroll_secret", () => {
    document.body.innerHTML = `
      <input id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}" />
      <div aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}">SECRET</div>
    `;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("totp_enroll_verify");
  });

  test("returns totp_enroll_secret when TOTP secret display element is present", () => {
    document.body.innerHTML = `<div aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}">JBSWY3DPEHPK3PXP</div>`;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("totp_enroll_secret");
  });

  test("totp_enroll_secret takes priority over factors_list", () => {
    document.body.innerHTML = `
      <div aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}">SECRET</div>
      <factor-panel></factor-panel>
    `;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("totp_enroll_secret");
  });

  test("returns factors_list when factor-panel element is present", () => {
    document.body.innerHTML = `<factor-panel></factor-panel>`;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("factors_list");
  });

  test("factors_list takes priority over oaa_spa_home", () => {
    document.body.innerHTML = `
      <factor-panel></factor-panel>
      <div id="${RUI_OAA_HOME_HEADER_ID}"></div>
    `;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("factors_list");
  });

  test("returns oaa_spa_home when categoryActionheader element is present", () => {
    document.body.innerHTML = `<div id="${RUI_OAA_HOME_HEADER_ID}"></div>`;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("oaa_spa_home");
  });

  test("returns loading when no matching elements found and href is normal", () => {
    document.body.innerHTML = `<div id="some-other-element"></div>`;
    expect(detectRuiSpaView(document, NORMAL_HREF)).toBe("loading");
  });

  test("non-access-denied query param in href still returns loading for empty doc", () => {
    const href = "https://ssologin.cuny.edu/oaa/rui/oidc/redirect?error=something_else";
    expect(detectRuiSpaView(document, href)).toBe("loading");
  });

  test("empty string href still returns based on DOM state", () => {
    document.body.innerHTML = `<div id="${RUI_OAA_HOME_HEADER_ID}"></div>`;
    expect(detectRuiSpaView(document, "")).toBe("oaa_spa_home");
  });
});
