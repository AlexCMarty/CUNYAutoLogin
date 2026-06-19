// Tests for screenMounts.ts — central registry of onboarding screen mount functions.
// Since screenMounts.ts imports browser-dependent screen modules, we mock webextension-polyfill
// and the biometric module to keep this a Node-safe unit test.

import { vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    storage: {
      session: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock("../crypto/biometric", () => ({
  enrollBiometric: vi.fn(),
  isBiometricEnrolled: vi.fn(),
  clearBiometricCredential: vi.fn(),
  unlockWithBiometric: vi.fn(),
}));

import { describe, expect, test } from "vitest";
import { SCREEN_MOUNTS } from "./screenMounts";
import { ONBOARDING_STATES } from "./state";

describe("SCREEN_MOUNTS", () => {
  test("is a non-null object", () => {
    expect(typeof SCREEN_MOUNTS).toBe("object");
    expect(SCREEN_MOUNTS).not.toBeNull();
  });

  test("all values are functions (mount functions)", () => {
    for (const [, fn] of Object.entries(SCREEN_MOUNTS)) {
      expect(typeof fn).toBe("function");
    }
  });

  test("all keys are valid onboarding states", () => {
    const stateSet = new Set(ONBOARDING_STATES);
    for (const key of Object.keys(SCREEN_MOUNTS)) {
      expect(stateSet.has(key as never)).toBe(true);
    }
  });

  test("covers every onboarding state — set equality, not just a count", () => {
    // Every state must have a mount entry. Using set equality means adding a
    // state without a mount will cause a real failure (not just a count mismatch).
    const expectedStates = new Set(ONBOARDING_STATES);
    const actualStates = new Set(Object.keys(SCREEN_MOUNTS));
    expect(actualStates).toEqual(expectedStates);
  });

  test("WELCOME state has a mount function", () => {
    expect(typeof SCREEN_MOUNTS.WELCOME).toBe("function");
  });

  test("COMPLETE_DONE state has a mount function", () => {
    expect(typeof SCREEN_MOUNTS.COMPLETE_DONE).toBe("function");
  });

  test("BIOMETRIC_OFFER state has a mount function", () => {
    expect(typeof SCREEN_MOUNTS.BIOMETRIC_OFFER).toBe("function");
  });

  test("BIOMETRIC_PREP state has a mount function", () => {
    expect(typeof SCREEN_MOUNTS.BIOMETRIC_PREP).toBe("function");
  });

  test("every state with a bead-3 guided screen has a mount function", () => {
    const guidedStates = [
      "OAA_SPA_HOME",
      "GUIDED_MANAGE",
      "GUIDED_ADD_FACTOR",
      "GUIDED_FACTOR_TYPE",
      "GUIDED_SECRET_CAPTURE",
      "VERIFY_LOGIN_CODE",
      "SET_DEFAULT",
    ] as const;
    for (const state of guidedStates) {
      expect(typeof SCREEN_MOUNTS[state], `${state} should have a mount`).toBe("function");
    }
  });

  test("credential-entry states (EMAIL_ENTRY, PASSWORD_ENTRY) have mount functions", () => {
    expect(typeof SCREEN_MOUNTS.EMAIL_ENTRY).toBe("function");
    expect(typeof SCREEN_MOUNTS.PASSWORD_ENTRY).toBe("function");
  });

  test("early-login states (OPENING_CUNY, CUNY_TOTP, ALLOW_GATE) have mount functions", () => {
    expect(typeof SCREEN_MOUNTS.OPENING_CUNY).toBe("function");
    expect(typeof SCREEN_MOUNTS.CUNY_TOTP).toBe("function");
    expect(typeof SCREEN_MOUNTS.ALLOW_GATE).toBe("function");
  });

  test("EXT_PASSWORD_SETUP and COMPLETE_DEMO have mount functions", () => {
    expect(typeof SCREEN_MOUNTS.EXT_PASSWORD_SETUP).toBe("function");
    expect(typeof SCREEN_MOUNTS.COMPLETE_DEMO).toBe("function");
  });
});
