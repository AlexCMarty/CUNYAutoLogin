// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: {} }));

import {
  QA_DEFAULT_EMAIL,
  QA_DEFAULT_PASSWORD,
  parseDevQaOnboardingJumpFromHash,
  tryParseDevQaOnboardingJumpFromWindow,
} from "./devQaJump";

describe("parseDevQaOnboardingJumpFromHash", () => {
  test("returns null when Vite mode is not development or e2e", () => {
    expect(
      parseDevQaOnboardingJumpFromHash("#qa=EXT_PASSWORD_SETUP", "production")
    ).toBeNull();
    expect(
      parseDevQaOnboardingJumpFromHash("#qa=EXT_PASSWORD_SETUP", "test")
    ).toBeNull();
  });

  test("returns null when hash has no qa param", () => {
    expect(parseDevQaOnboardingJumpFromHash("#onboarding=1", "development")).toBeNull();
  });

  test("parses qa=EXT_PASSWORD_SETUP with defaults under development mode", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=EXT_PASSWORD_SETUP",
      "development"
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.controllerInit.initialState).toBe("EXT_PASSWORD_SETUP");
    expect(parsed?.controllerInit.initialEmail).toBe(QA_DEFAULT_EMAIL);
    expect(parsed?.controllerInit.initialPassword).toBe(QA_DEFAULT_PASSWORD);
    expect(parsed?.controllerInit.initialCredentialError ?? null).toBeNull();
  });

  test("parses qa= under e2e mode", () => {
    const parsed = parseDevQaOnboardingJumpFromHash("#qa=WELCOME", "e2e");
    expect(parsed?.controllerInit.initialState).toBe("WELCOME");
  });

  test("supports qaEmail and qaPassword overrides", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=EMAIL_ENTRY&qaEmail=other%40login.cuny.edu&qaPassword=secret",
      "development"
    );
    expect(parsed?.controllerInit.initialEmail).toBe("other@login.cuny.edu");
    expect(parsed?.controllerInit.initialPassword).toBe("secret");
  });

  test("maps qaCred=password to initialCredentialError", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=PASSWORD_ENTRY&qaCred=password",
      "development"
    );
    expect(parsed?.controllerInit.initialCredentialError).toEqual({ culprit: "password" });
  });

  test("maps qaCred=email (case-insensitive)", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=PASSWORD_ENTRY&qaCred=Email",
      "development"
    );
    expect(parsed?.controllerInit.initialCredentialError).toEqual({ culprit: "email" });
  });
});

describe("parseDevQaOnboardingJumpFromHash — edge cases", () => {
  test("ignores invalid qaCred and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=WELCOME&qaCred=pin",
      "development"
    );
    expect(parsed?.controllerInit.initialCredentialError ?? null).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("returns null for unknown qa state token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      parseDevQaOnboardingJumpFromHash("#qa=TYPO_SCREEN", "development")
    ).toBeNull();
    warn.mockRestore();
  });

  test("returns null for CREDENTIAL_ERROR (no mounted screen)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      parseDevQaOnboardingJumpFromHash("#qa=CREDENTIAL_ERROR", "development")
    ).toBeNull();
    warn.mockRestore();
  });

  test("returns null for empty qa param value", () => {
    expect(parseDevQaOnboardingJumpFromHash("#qa=", "development")).toBeNull();
  });

  test("qaEmail / qaPassword whitespace-only falls back to defaults", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=WELCOME&qaEmail=   &qaPassword=   ",
      "development"
    );
    expect(parsed?.controllerInit.initialEmail).toBe(QA_DEFAULT_EMAIL);
    expect(parsed?.controllerInit.initialPassword).toBe(QA_DEFAULT_PASSWORD);
  });

  test("hash without leading # is still parsed correctly", () => {
    const parsed = parseDevQaOnboardingJumpFromHash("qa=WELCOME", "development");
    expect(parsed?.controllerInit.initialState).toBe("WELCOME");
  });

  test("no qa param at all returns null", () => {
    expect(parseDevQaOnboardingJumpFromHash("", "development")).toBeNull();
    expect(parseDevQaOnboardingJumpFromHash("#", "development")).toBeNull();
  });
});

describe("tryParseDevQaOnboardingJumpFromWindow", () => {
  test("returns null in non-dev mode even when window is defined", () => {
    expect(tryParseDevQaOnboardingJumpFromWindow("production")).toBeNull();
  });

  test("reads window.location.hash and returns result in dev mode", () => {
    // jsdom sets window.location.hash from the test URL; override it.
    Object.defineProperty(window, "location", {
      value: { hash: "#qa=WELCOME" },
      configurable: true,
    });
    const result = tryParseDevQaOnboardingJumpFromWindow("development");
    expect(result?.controllerInit.initialState).toBe("WELCOME");
  });

  test("returns null when hash has no qa param", () => {
    Object.defineProperty(window, "location", {
      value: { hash: "" },
      configurable: true,
    });
    expect(tryParseDevQaOnboardingJumpFromWindow("development")).toBeNull();
  });
});

describe("parseDevQaOnboardingJumpFromHash qaVariant", () => {
  test("parses qaVariant for advanced key-flow screens", () => {
    const parsed = parseDevQaOnboardingJumpFromHash(
      "#qa=TEST_LOGIN&qaVariant=success",
      "development"
    );
    expect(parsed?.controllerInit.initialState).toBe("TEST_LOGIN");
    expect(parsed?.qaVariant).toBe("success");
  });

  test("qaVariant is undefined when the param is absent", () => {
    const parsed = parseDevQaOnboardingJumpFromHash("#qa=TEST_LOGIN", "development");
    expect(parsed?.qaVariant).toBeUndefined();
  });
});
