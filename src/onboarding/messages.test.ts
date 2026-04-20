import { describe, expect, test } from "vitest";
import {
  CREDENTIAL_CULPRITS,
  ONBOARDING_MESSAGE_TYPES,
  ONBOARDING_PAGE_STAGES,
  OVERLAY_ACTIONS,
  VERIFY_STATUSES,
  hasOnboardingMessageType,
  isOnboardingCredentialError,
  isOnboardingMessage,
  isOnboardingOverlayCommand,
  isOnboardingReopenCunyTab,
  isOnboardingStageDetected,
  isOnboardingTabReattached,
  isOnboardingVerifyStatus,
  type OnboardingMessageType,
} from "./messages";

// ──── constants (pinned) ──────────────────────────────────────────────────────

describe("constants", () => {
  test("exactly 6 onboarding message types are declared", () => {
    expect(ONBOARDING_MESSAGE_TYPES.length).toBe(6);
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
