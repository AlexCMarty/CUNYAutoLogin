import { afterEach, describe, expect, test, vi } from "vitest";
import { getArgon2id, resetArgon2idCacheForTests } from "./argon2idLoader";

describe("getArgon2id", () => {
  afterEach(() => {
    resetArgon2idCacheForTests();
    vi.restoreAllMocks();
  });

  test("loads WASM and hashes at OWASP-minimum params", async () => {
    const argon2id = await getArgon2id();
    const hash = argon2id({
      password: new Uint8Array(new TextEncoder().encode("correct-horse-battery-staple")),
      salt: new Uint8Array(16),
      parallelism: 1,
      passes: 2,
      memorySize: 19 * 1024,
      tagLength: 32,
    });
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  test("a failed load is not sticky — the next call retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(getArgon2id()).rejects.toThrow();

    vi.mocked(globalThis.fetch).mockRestore();

    const argon2id = await getArgon2id();
    const hash = argon2id({
      password: new Uint8Array(new TextEncoder().encode("correct-horse-battery-staple")),
      salt: new Uint8Array(16),
      parallelism: 1,
      passes: 2,
      memorySize: 19 * 1024,
      tagLength: 32,
    });
    expect(hash.length).toBe(32);
  });
});
