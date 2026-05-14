import { describe, expect, test } from "vitest";
import { SHOW_PASSWORD_LABEL, HIDE_PASSWORD_LABEL } from "./passwordToggleLabels";

describe("passwordToggleLabels", () => {
  test('SHOW_PASSWORD_LABEL is "Show password"', () => {
    expect(SHOW_PASSWORD_LABEL).toBe("Show password");
  });

  test('HIDE_PASSWORD_LABEL is "Hide password"', () => {
    expect(HIDE_PASSWORD_LABEL).toBe("Hide password");
  });

  test("SHOW and HIDE labels are different strings", () => {
    expect(SHOW_PASSWORD_LABEL).not.toBe(HIDE_PASSWORD_LABEL);
  });
});
