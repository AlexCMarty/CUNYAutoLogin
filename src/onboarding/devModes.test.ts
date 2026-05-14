import { describe, expect, test } from "vitest";
import { DEV_MODE_NAMES } from "./devModes";

describe("DEV_MODE_NAMES", () => {
  test('contains "development"', () => {
    expect(DEV_MODE_NAMES).toContain("development");
  });

  test('contains "e2e"', () => {
    expect(DEV_MODE_NAMES).toContain("e2e");
  });

  test("has exactly 2 entries", () => {
    expect(DEV_MODE_NAMES.length).toBe(2);
  });

  test('does not contain "production"', () => {
    expect(DEV_MODE_NAMES).not.toContain("production");
  });
});
