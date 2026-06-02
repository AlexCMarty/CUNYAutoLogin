// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CREDENTIAL_INPUT_IDS,
  TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY,
} from "../cuny/ssoSite";
import { waitForElement, waitForEnrollTotpSecret, waitForInputById } from "./domWait";

/** Ensures MutationObserver microtasks from prior tests are drained (jsdom). */
async function yieldToMutationObservers(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForElement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("resolves immediately when find() already returns an element", async () => {
    const el = document.createElement("span");
    document.body.appendChild(el);
    const found = await waitForElement(() => el);
    expect(found).toBe(el);
  });

  test("resolves after a DOM mutation makes find() return an element", async () => {
    const el = document.createElement("button");
    document.body.appendChild(document.createElement("div"));
    let expose = false;
    const pending = waitForElement(() => (expose ? el : null));
    await yieldToMutationObservers();
    expose = true;
    document.body.appendChild(el);
    const found = await pending;
    expect(found).toBe(el);
  });

  test("resolves null when timeout elapses before find() succeeds", async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForElement(() => null, 500);
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("waitForInputById", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("resolves when an input with the given id appears", async () => {
    const input = document.createElement("input");
    input.id = CREDENTIAL_INPUT_IDS.username;
    const pending = waitForInputById(CREDENTIAL_INPUT_IDS.username);
    await yieldToMutationObservers();
    document.body.appendChild(input);
    const found = await pending;
    expect(found).toBe(input);
  });
});

describe("waitForEnrollTotpSecret", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("resolves immediately when a normalised secret is already in the DOM", async () => {
    const holder = document.createElement("div");
    holder.setAttribute("aria-labelledby", TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY);
    holder.textContent = "  JBSWY3DPEHPK3PXP  ";
    document.body.appendChild(holder);
    await expect(waitForEnrollTotpSecret()).resolves.toBe("JBSWY3DPEHPK3PXP");
  });

  test("resolves null when the secret never appears before timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForEnrollTotpSecret(300);
      await vi.advanceTimersByTimeAsync(300);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("resolves when secret appears after a DOM mutation", async () => {
    const pending = waitForEnrollTotpSecret();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const holder = document.createElement("div");
    holder.setAttribute("aria-labelledby", TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY);
    holder.textContent = "JBSWY3DPEHPK3PXP";
    document.body.appendChild(holder);
    await expect(pending).resolves.toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("waitForElement — disconnect safety", () => {
  test("resolves immediately with null for zero-ms timeout when element absent", async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForElement(() => null, 0);
      await vi.advanceTimersByTimeAsync(0);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("find() returning non-null for a non-HTMLInputElement returns it from waitForElement", async () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const found = await waitForElement(() => btn);
    expect(found).toBe(btn);
  });
});

describe("waitForInputById — non-input element is ignored", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("returns null when element with the id is not an input (uses fake timers)", async () => {
    vi.useFakeTimers();
    try {
      // Insert a div with the requested id — waitForInputById must not resolve it
      const div = document.createElement("div");
      div.id = CREDENTIAL_INPUT_IDS.password;
      document.body.appendChild(div);
      const pending = waitForInputById(CREDENTIAL_INPUT_IDS.password, 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("resolves when the correct input later replaces a non-input element", async () => {
    const div = document.createElement("div");
    div.id = CREDENTIAL_INPUT_IDS.username;
    document.body.appendChild(div);

    const pending = waitForInputById(CREDENTIAL_INPUT_IDS.username);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    div.remove();
    const input = document.createElement("input");
    input.id = CREDENTIAL_INPUT_IDS.username;
    document.body.appendChild(input);
    const found = await pending;
    expect(found).toBe(input);
  });
});
