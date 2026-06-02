import { describe, expect, test } from "vitest";
import {
  CREDENTIAL_CULPRITS,
  ONBOARDING_MESSAGE_TYPES,
  ONBOARDING_PAGE_STAGES,
  OVERLAY_ACTIONS,
  VERIFY_STATUSES,
  hasOnboardingMessageType,
  isAutoFillResponse,
  isClearOnboardingCredentials,
  isLogoutCunySessionsAck,
  isLogoutCunySessionsRequest,
  isOnboardingCredentialError,
  isOnboardingCunyTabMissing,
  isOnboardingMessage,
  isOnboardingOverlayCommand,
  isOnboardingReopenCunyTab,
  isOnboardingStageDetected,
  isOnboardingTabReattached,
  isOnboardingVerifyStatus,
  isPersistOnboardingResumeSnapshot,
  isStageOnboardingCredentials,
  normalizeAutoFillOtpContext,
  type OnboardingMessageType,
} from "./messages";

// ──── constants (pinned) ──────────────────────────────────────────────────────

describe("constants", () => {
  test("exactly 7 onboarding message types are declared", () => {
    expect(ONBOARDING_MESSAGE_TYPES.length).toBe(7);
  });

  test("every declared message type string is unique", () => {
    const unique = new Set<OnboardingMessageType>(ONBOARDING_MESSAGE_TYPES);
    expect(unique.size).toBe(ONBOARDING_MESSAGE_TYPES.length);
  });

  test("page-stage, culprit, overlay-action, and verify-status enums are non-empty", () => {
    expect(ONBOARDING_PAGE_STAGES.length).toBeGreaterThan(0);
    expect(CREDENTIAL_CULPRITS).toEqual(["email", "password", "unknown"]);
    expect(OVERLAY_ACTIONS).toEqual(["show", "update", "hide"]);
    expect(VERIFY_STATUSES).toEqual(["pending", "success", "first_failure", "second_failure"]);
  });
});

// ──── hasOnboardingMessageType (loose type-only check) ────────────────────────

describe("hasOnboardingMessageType", () => {
  test("correct ONBOARDING_* type string → true, even with bad payload", () => {
    expect(
      hasOnboardingMessageType({ type: "ONBOARDING_STAGE_DETECTED", stage: "not-a-stage" })
    ).toBe(true);
  });

  test("AUTO_FILL_REQUEST → false (core message, not onboarding)", () => {
    expect(hasOnboardingMessageType({ type: "AUTO_FILL_REQUEST" })).toBe(false);
  });

  test("TOTP_SECRET_FROM_PAGE → false", () => {
    expect(hasOnboardingMessageType({ type: "TOTP_SECRET_FROM_PAGE", secret: "x" })).toBe(false);
  });

  test("non-record inputs → false", () => {
    expect(hasOnboardingMessageType(null)).toBe(false);
    expect(hasOnboardingMessageType(undefined)).toBe(false);
    expect(hasOnboardingMessageType("ONBOARDING_STAGE_DETECTED")).toBe(false);
    expect(hasOnboardingMessageType(42)).toBe(false);
  });

  test("record without string type → false", () => {
    expect(hasOnboardingMessageType({})).toBe(false);
    expect(hasOnboardingMessageType({ type: 7 })).toBe(false);
  });
});

// ──── isOnboardingStageDetected ──────────────────────────────────────────────

describe("isOnboardingStageDetected", () => {
  test("valid stage → true", () => {
    expect(
      isOnboardingStageDetected({ type: "ONBOARDING_STAGE_DETECTED", stage: "allow_gate" })
    ).toBe(true);
  });

  test("every declared stage is accepted", () => {
    for (const stage of ONBOARDING_PAGE_STAGES) {
      expect(
        isOnboardingStageDetected({ type: "ONBOARDING_STAGE_DETECTED", stage })
      ).toBe(true);
    }
  });

  test("unknown stage string → false", () => {
    expect(
      isOnboardingStageDetected({ type: "ONBOARDING_STAGE_DETECTED", stage: "welcome_screen" })
    ).toBe(false);
  });

  test("missing stage → false", () => {
    expect(isOnboardingStageDetected({ type: "ONBOARDING_STAGE_DETECTED" })).toBe(false);
  });

  test("wrong discriminator → false", () => {
    expect(
      isOnboardingStageDetected({ type: "ONBOARDING_VERIFY_STATUS", stage: "allow_gate" })
    ).toBe(false);
  });
});

// ──── isOnboardingCredentialError ────────────────────────────────────────────

describe("isOnboardingCredentialError", () => {
  test("culprit=email | password | unknown → true", () => {
    for (const culprit of CREDENTIAL_CULPRITS) {
      expect(
        isOnboardingCredentialError({ type: "ONBOARDING_CREDENTIAL_ERROR", culprit })
      ).toBe(true);
    }
  });

  test("unrecognised culprit → false", () => {
    expect(
      isOnboardingCredentialError({ type: "ONBOARDING_CREDENTIAL_ERROR", culprit: "pin" })
    ).toBe(false);
  });

  test("missing culprit → false", () => {
    expect(isOnboardingCredentialError({ type: "ONBOARDING_CREDENTIAL_ERROR" })).toBe(false);
  });
});

// ──── isOnboardingOverlayCommand ─────────────────────────────────────────────

describe("isOnboardingOverlayCommand", () => {
  test("bare action=show → true", () => {
    expect(
      isOnboardingOverlayCommand({ type: "ONBOARDING_OVERLAY_COMMAND", action: "show" })
    ).toBe(true);
  });

  test("all declared actions accepted", () => {
    for (const action of OVERLAY_ACTIONS) {
      expect(
        isOnboardingOverlayCommand({ type: "ONBOARDING_OVERLAY_COMMAND", action })
      ).toBe(true);
    }
  });

  test("full payload with all optional fields → true", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "update",
        target: "#allow-btn",
        tooltipText: "Click Allow to continue.",
        stepIndex: 2,
        stepTotal: 4,
      })
    ).toBe(true);
  });

  test("invalid action string → false", () => {
    expect(
      isOnboardingOverlayCommand({ type: "ONBOARDING_OVERLAY_COMMAND", action: "flash" })
    ).toBe(false);
  });

  test("non-string target → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        target: 42,
      })
    ).toBe(false);
  });

  test("non-integer stepIndex → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 1.5,
      })
    ).toBe(false);
  });

  test("negative stepTotal → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepTotal: -1,
      })
    ).toBe(false);
  });
});

// ──── isOnboardingVerifyStatus ───────────────────────────────────────────────

describe("isOnboardingVerifyStatus", () => {
  test("all declared statuses → true", () => {
    for (const status of VERIFY_STATUSES) {
      expect(
        isOnboardingVerifyStatus({ type: "ONBOARDING_VERIFY_STATUS", status })
      ).toBe(true);
    }
  });

  test("unknown status → false", () => {
    expect(
      isOnboardingVerifyStatus({ type: "ONBOARDING_VERIFY_STATUS", status: "maybe" })
    ).toBe(false);
  });
});

// ──── isOnboardingReopenCunyTab ──────────────────────────────────────────────

describe("isOnboardingReopenCunyTab", () => {
  test("bare reopen → true (url is optional)", () => {
    expect(isOnboardingReopenCunyTab({ type: "ONBOARDING_REOPEN_CUNY_TAB" })).toBe(true);
  });

  test("reopen with string url → true", () => {
    expect(
      isOnboardingReopenCunyTab({
        type: "ONBOARDING_REOPEN_CUNY_TAB",
        url: "https://ssologin.cuny.edu/",
      })
    ).toBe(true);
  });

  test("non-string url → false", () => {
    expect(
      isOnboardingReopenCunyTab({ type: "ONBOARDING_REOPEN_CUNY_TAB", url: 123 })
    ).toBe(false);
  });

  test("empty string url → false", () => {
    expect(isOnboardingReopenCunyTab({ type: "ONBOARDING_REOPEN_CUNY_TAB", url: "" })).toBe(
      false
    );
    expect(
      isOnboardingReopenCunyTab({ type: "ONBOARDING_REOPEN_CUNY_TAB", url: "   " })
    ).toBe(false);
  });
});

// ──── isOnboardingTabReattached ──────────────────────────────────────────────

describe("isOnboardingTabReattached", () => {
  test("integer tabId → true", () => {
    expect(
      isOnboardingTabReattached({ type: "ONBOARDING_TAB_REATTACHED", tabId: 17 })
    ).toBe(true);
  });

  test("missing tabId → false", () => {
    expect(isOnboardingTabReattached({ type: "ONBOARDING_TAB_REATTACHED" })).toBe(false);
  });

  test("non-integer tabId → false", () => {
    expect(
      isOnboardingTabReattached({ type: "ONBOARDING_TAB_REATTACHED", tabId: 1.5 })
    ).toBe(false);
  });

  test("string tabId → false", () => {
    expect(
      isOnboardingTabReattached({ type: "ONBOARDING_TAB_REATTACHED", tabId: "17" })
    ).toBe(false);
  });
});

describe("isOnboardingCunyTabMissing", () => {
  test("missing=true payload is accepted", () => {
    expect(
      isOnboardingCunyTabMissing({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: true })
    ).toBe(true);
  });

  test("missing=false payload is accepted", () => {
    expect(
      isOnboardingCunyTabMissing({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: false })
    ).toBe(true);
  });

  test("non-boolean missing is rejected", () => {
    expect(
      isOnboardingCunyTabMissing({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: "yes" })
    ).toBe(false);
  });
});

// ──── isOnboardingMessage (top-level discriminant) ───────────────────────────

describe("isOnboardingMessage", () => {
  test("valid stage-detected message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_STAGE_DETECTED", stage: "credential_page" })
    ).toBe(true);
  });

  test("valid credential-error message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_CREDENTIAL_ERROR", culprit: "password" })
    ).toBe(true);
  });

  test("valid overlay-command message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    ).toBe(true);
  });

  test("valid verify-status message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_VERIFY_STATUS", status: "success" })
    ).toBe(true);
  });

  test("valid reopen-cuny-tab message → true", () => {
    expect(isOnboardingMessage({ type: "ONBOARDING_REOPEN_CUNY_TAB" })).toBe(true);
  });

  test("valid tab-reattached message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_TAB_REATTACHED", tabId: 0 })
    ).toBe(true);
  });

  test("valid cuny-tab-missing message → true", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: true })
    ).toBe(true);
  });

  test("AUTO_FILL_REQUEST core message → false", () => {
    expect(isOnboardingMessage({ type: "AUTO_FILL_REQUEST" })).toBe(false);
  });

  test("TOTP_SECRET_FROM_PAGE core message → false", () => {
    expect(
      isOnboardingMessage({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" })
    ).toBe(false);
  });

  test("UNKNOWN type string → false", () => {
    expect(isOnboardingMessage({ type: "SOMETHING_ELSE" })).toBe(false);
  });

  test("right discriminator, wrong payload → false", () => {
    expect(
      isOnboardingMessage({ type: "ONBOARDING_STAGE_DETECTED", stage: "not-real" })
    ).toBe(false);
    expect(
      isOnboardingMessage({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        target: 123,
      })
    ).toBe(false);
  });

  test("null, undefined, non-record → false", () => {
    expect(isOnboardingMessage(null)).toBe(false);
    expect(isOnboardingMessage(undefined)).toBe(false);
    expect(isOnboardingMessage("ONBOARDING_STAGE_DETECTED")).toBe(false);
    expect(isOnboardingMessage([])).toBe(false);
  });
});

describe("normalizeAutoFillOtpContext", () => {
  test("undefined and recognised literals pass through unchanged", () => {
    expect(normalizeAutoFillOtpContext(undefined)).toBeUndefined();
    expect(normalizeAutoFillOtpContext("login_totp")).toBe("login_totp");
    expect(normalizeAutoFillOtpContext("enroll_verify")).toBe("enroll_verify");
  });

  test("unknown or mistyped values become undefined", () => {
    expect(normalizeAutoFillOtpContext("other")).toBeUndefined();
    expect(normalizeAutoFillOtpContext(42)).toBeUndefined();
    expect(normalizeAutoFillOtpContext(null)).toBeUndefined();
  });
});

// ──── isAutoFillResponse ──────────────────────────────────────────────────────

describe("isAutoFillResponse", () => {
  test("success=true payload is accepted", () => {
    expect(isAutoFillResponse({ success: true, payload: {} })).toBe(true);
  });

  test("success=false payload is accepted", () => {
    expect(
      isAutoFillResponse({ success: false, reason: "no_vault" })
    ).toBe(true);
  });

  test("object without success field → false", () => {
    expect(isAutoFillResponse({ reason: "no_vault" })).toBe(false);
  });

  test("null → false", () => {
    expect(isAutoFillResponse(null)).toBe(false);
  });

  test("non-object → false", () => {
    expect(isAutoFillResponse("yes")).toBe(false);
    expect(isAutoFillResponse(1)).toBe(false);
  });
});

// ──── isLogoutCunySessionsRequest ─────────────────────────────────────────────

describe("isLogoutCunySessionsRequest", () => {
  test("correct type string → true", () => {
    expect(isLogoutCunySessionsRequest({ type: "LOGOUT_CUNY_SESSIONS" })).toBe(true);
  });

  test("wrong type string → false", () => {
    expect(isLogoutCunySessionsRequest({ type: "OTHER" })).toBe(false);
  });

  test("null / non-object → false", () => {
    expect(isLogoutCunySessionsRequest(null)).toBe(false);
    expect(isLogoutCunySessionsRequest("LOGOUT_CUNY_SESSIONS")).toBe(false);
  });
});

// ──── isLogoutCunySessionsAck ──────────────────────────────────────────────────

describe("isLogoutCunySessionsAck", () => {
  test("ok=true is accepted", () => {
    expect(isLogoutCunySessionsAck({ ok: true })).toBe(true);
  });

  test("ok=false is accepted", () => {
    expect(isLogoutCunySessionsAck({ ok: false })).toBe(true);
  });

  test("non-boolean ok → false", () => {
    expect(isLogoutCunySessionsAck({ ok: "yes" })).toBe(false);
    expect(isLogoutCunySessionsAck({ ok: 1 })).toBe(false);
  });

  test("missing ok field → false", () => {
    expect(isLogoutCunySessionsAck({})).toBe(false);
  });

  test("null → false", () => {
    expect(isLogoutCunySessionsAck(null)).toBe(false);
  });
});

// ──── isStageOnboardingCredentials ────────────────────────────────────────────

describe("isStageOnboardingCredentials", () => {
  test("valid full payload → true", () => {
    expect(
      isStageOnboardingCredentials({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(true);
  });

  test("missing email → false", () => {
    expect(
      isStageOnboardingCredentials({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        password: "pw",
      })
    ).toBe(false);
  });

  test("missing password → false", () => {
    expect(
      isStageOnboardingCredentials({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        email: "a@login.cuny.edu",
      })
    ).toBe(false);
  });

  test("wrong type → false", () => {
    expect(
      isStageOnboardingCredentials({
        type: "OTHER",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(false);
  });

  test("null / non-object → false", () => {
    expect(isStageOnboardingCredentials(null)).toBe(false);
    expect(isStageOnboardingCredentials(42)).toBe(false);
  });
});

// ──── isClearOnboardingCredentials ────────────────────────────────────────────

describe("isClearOnboardingCredentials", () => {
  test("correct type → true", () => {
    expect(isClearOnboardingCredentials({ type: "CLEAR_ONBOARDING_CREDENTIALS" })).toBe(true);
  });

  test("wrong type → false", () => {
    expect(isClearOnboardingCredentials({ type: "OTHER" })).toBe(false);
  });

  test("null / non-object → false", () => {
    expect(isClearOnboardingCredentials(null)).toBe(false);
    expect(isClearOnboardingCredentials("CLEAR_ONBOARDING_CREDENTIALS")).toBe(false);
  });
});

// ──── isPersistOnboardingResumeSnapshot ───────────────────────────────────────

describe("isPersistOnboardingResumeSnapshot", () => {
  test("valid full payload with resumable state → true", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "ALLOW_GATE",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(true);
  });

  test("non-resumable state → false (isOnboardingState still accepts it but isResumeSnapshot would reject — guard checks isOnboardingState only)", () => {
    // isPersistOnboardingResumeSnapshot only checks isOnboardingState, not resumability
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "WELCOME",
        email: "",
        password: "",
      })
    ).toBe(true);
  });

  test("missing state → false", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(false);
  });

  test("unknown state string → false", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "NOT_A_STATE",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(false);
  });

  test("missing email → false", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "ALLOW_GATE",
        password: "pw",
      })
    ).toBe(false);
  });

  test("null → false", () => {
    expect(isPersistOnboardingResumeSnapshot(null)).toBe(false);
  });
});

describe("isPersistOnboardingResumeSnapshot advancedKeyFlow", () => {
  test("accepts a snapshot without advancedKeyFlow (backward compatible)", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "BIOMETRIC_OFFER",
        email: "e@login.cuny.edu",
        password: "p",
      })
    ).toBe(true);
  });

  test("accepts a boolean advancedKeyFlow", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "BIOMETRIC_OFFER",
        email: "e@login.cuny.edu",
        password: "p",
        advancedKeyFlow: true,
      })
    ).toBe(true);
  });

  test("rejects a non-boolean advancedKeyFlow", () => {
    expect(
      isPersistOnboardingResumeSnapshot({
        type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
        state: "BIOMETRIC_OFFER",
        email: "e@login.cuny.edu",
        password: "p",
        advancedKeyFlow: "yes",
      })
    ).toBe(false);
  });
});

// ──── isOnboardingOverlayCommand (targetSpec branch) ─────────────────────────

describe("isOnboardingOverlayCommand targetSpec", () => {
  test("valid css targetSpec → true", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "css", selector: "#allow-btn" },
      })
    ).toBe(true);
  });

  test("valid a11y targetSpec → true", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "a11y", text: "Allow" },
      })
    ).toBe(true);
  });

  test("targetSpec with unknown type → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "xpath", expression: "//button" },
      })
    ).toBe(false);
  });

  test("targetSpec with css type but missing selector → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "css" },
      })
    ).toBe(false);
  });

  test("targetSpec with a11y type but missing text → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "a11y" },
      })
    ).toBe(false);
  });

  test("non-object targetSpec → false", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: "button",
      })
    ).toBe(false);
  });

  test("stepIndex of zero is accepted (boundary: non-negative integer)", () => {
    expect(
      isOnboardingOverlayCommand({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 0,
      })
    ).toBe(true);
  });

  test("non-object payload → false", () => {
    expect(isOnboardingOverlayCommand(null)).toBe(false);
    expect(isOnboardingOverlayCommand("show")).toBe(false);
  });
});
