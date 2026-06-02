import { describe, expect, test } from "vitest";
import { showOnboardingIllustrationPlaceholders } from "./illustrationPlaceholders";

describe("showOnboardingIllustrationPlaceholders", () => {
  test("exported constant is a boolean", () => {
    expect(typeof showOnboardingIllustrationPlaceholders).toBe("boolean");
  });

  test("is true in vitest (import.meta.env.PROD is false in test environment)", () => {
    // Vitest sets import.meta.env.PROD = false, so the constant should be true.
    expect(showOnboardingIllustrationPlaceholders).toBe(true);
  });
});
