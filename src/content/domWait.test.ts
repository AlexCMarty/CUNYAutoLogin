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
});
