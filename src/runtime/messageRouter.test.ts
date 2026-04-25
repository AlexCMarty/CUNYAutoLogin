import { describe, expect, test } from "vitest";
import { guardedRoute, routeByType } from "./messageRouter";

describe("routeByType", () => {
  test("non-object message returns undefined", () => {
    const result = routeByType("hello", {});
    expect(result).toBeUndefined();
  });

  test("object without string type returns undefined", () => {
    expect(routeByType({}, {})).toBeUndefined();
    expect(routeByType({ type: 1 }, {})).toBeUndefined();
  });

  test("unknown type returns undefined", () => {
    const result = routeByType({ type: "UNKNOWN" }, {});
    expect(result).toBeUndefined();
  });

  test("dispatches matching sync handler", () => {
    const result = routeByType(
      { type: "SYNC", value: 7 },
      {
        SYNC: (msg) => (msg.value as number) + 1,
      }
    );
    expect(result).toBe(8);
  });

  test("dispatches matching async handler", async () => {
    const result = routeByType(
      { type: "ASYNC", value: "ok" },
      {
        ASYNC: async (msg) => `${msg.value as string}!`,
      }
    );
    await expect(result).resolves.toBe("ok!");
  });
});

describe("guardedRoute", () => {
  test("uses valid branch when guard matches", () => {
    const result = guardedRoute(
      { ok: true },
      (value): value is { ok: true } =>
        typeof value === "object" && value !== null && (value as { ok?: boolean }).ok === true,
      () => "valid",
      () => "invalid"
    );
    expect(result).toBe("valid");
  });

  test("uses invalid branch when guard fails", () => {
    const result = guardedRoute(
      { ok: false },
      (value): value is { ok: true } =>
        typeof value === "object" && value !== null && (value as { ok?: boolean }).ok === true,
      () => "valid",
      () => "invalid"
    );
    expect(result).toBe("invalid");
  });

  test("supports async valid branch", async () => {
    const result = guardedRoute(
      { type: "READY" },
      (value): value is { type: "READY" } =>
        typeof value === "object" &&
        value !== null &&
        (value as { type?: string }).type === "READY",
      async () => ({ ok: true as const }),
      async () => ({ ok: false as const })
    );
    await expect(result).resolves.toEqual({ ok: true });
  });
});
