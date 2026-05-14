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

  test("covers the expected 18 states (all except CREDENTIAL_ERROR which has no screen)", () => {
    // CREDENTIAL_ERROR is a transient state with no screen mount
    const expectedCount = ONBOARDING_STATES.length - 1;
    expect(Object.keys(SCREEN_MOUNTS).length).toBe(expectedCount);
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
});
