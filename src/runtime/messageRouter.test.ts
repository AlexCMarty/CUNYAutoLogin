import { describe, expect, test, vi } from "vitest";
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

  test("passes the original value to the valid callback", () => {
    const received: unknown[] = [];
    const isXRecord = (val: unknown): val is { x: number } =>
      typeof val === "object" && val !== null && typeof (val as { x?: unknown }).x === "number";
    guardedRoute(
      { x: 42 },
      isXRecord,
      (val) => { received.push(val); return "ok"; },
      () => "fail"
    );
    expect(received).toEqual([{ x: 42 }]);
  });

  test("uses invalid branch for non-object value", () => {
    const isOkTrue = (val: unknown): val is { ok: true } =>
      typeof val === "object" && val !== null && (val as { ok?: boolean }).ok === true;
    const result = guardedRoute(
      "not-an-object",
      isOkTrue,
      () => "valid",
      () => "invalid"
    );
    expect(result).toBe("invalid");
  });

  test("uses invalid branch for null", () => {
    const isOkTrue = (val: unknown): val is { ok: true } =>
      typeof val === "object" && val !== null && (val as { ok?: boolean }).ok === true;
    const result = guardedRoute(
      null,
      isOkTrue,
      () => "valid",
      () => "invalid"
    );
    expect(result).toBe("invalid");
  });
});

describe("routeByType — additional edge cases", () => {
  test("null message returns undefined", () => {
    expect(routeByType(null, { FOO: () => "bar" })).toBeUndefined();
  });

  test("array message returns undefined", () => {
    expect(routeByType(["a", "b"], { "0": () => "bar" })).toBeUndefined();
  });

  test("type field is a number → undefined", () => {
    expect(routeByType({ type: 42 }, {})).toBeUndefined();
  });

  test("type field is null → undefined", () => {
    expect(routeByType({ type: null }, {})).toBeUndefined();
  });

  test("handler receives the full message record", () => {
    const received: Record<string, unknown>[] = [];
    routeByType(
      { type: "PING", payload: 99 },
      {
        PING: (msg) => { received.push(msg); return "pong"; },
      }
    );
    expect(received).toEqual([{ type: "PING", payload: 99 }]);
  });

  test("only the matching handler is called", () => {
    const aFn = vi.fn(() => "a");
    const bFn = vi.fn(() => "b");
    const result = routeByType({ type: "A" }, { A: aFn, B: bFn });
    expect(result).toBe("a");
    expect(aFn).toHaveBeenCalledTimes(1);
    expect(bFn).not.toHaveBeenCalled();
  });
});
