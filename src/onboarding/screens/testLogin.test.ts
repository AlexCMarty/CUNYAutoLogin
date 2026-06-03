// @vitest-environment jsdom
// testLogin.ts imports webextension-polyfill at module scope. In jsdom we
// replace it with a stub so we can assert on browser.tabs.create and
// browser.runtime.sendMessage without pulling in the real polyfill.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { sendMessageMock, tabsCreateMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
  tabsCreateMock: vi.fn<
    (options: { url: string; active?: boolean }) => Promise<unknown>
  >(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
    tabs: { create: tabsCreateMock },
  },
}));

import { mountTestLoginScreen } from "./testLogin";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (qaVariant?: string): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    qaVariant,
    getSnapshot: () => ({
      state: "TEST_LOGIN",
      email: "",
      password: "",
      credentialError: null,
      advancedKeyFlow: false,
    }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
};

// waitForMicrotasks — the mount schedules an async IIFE for the side effects.
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  sendMessageMock.mockReset();
  tabsCreateMock.mockReset();
  sendMessageMock.mockResolvedValue({ ok: true });
  tabsCreateMock.mockResolvedValue({ id: 42 });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("mountTestLoginScreen", () => {
  test("default (in-progress) frame: progress phase + demo-status, no success status", () => {
    mountTestLoginScreen(makeCtx());
    const section = document.querySelector<HTMLElement>(
      "[data-onboarding-screen='TEST_LOGIN']"
    )!;
    expect(section.dataset.onboardingTestPhase).toBe("progress");
    expect(document.querySelector("h2")?.textContent).toBe(
      "Let's make sure it works."
    );
    expect(document.querySelector(".onboarding-demo-status")).not.toBeNull();
    expect(document.querySelector(".onboarding-status")).toBeNull();
  });

  test("in-progress frame starts with the first bead ('Opening Brightspace') active", () => {
    mountTestLoginScreen(makeCtx());
    const activeDots = document.querySelectorAll(
      ".onboarding-demo-dot[data-active='true']"
    );
    expect(activeDots).toHaveLength(1);
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".onboarding-demo-row")
    );
    expect(rows).toHaveLength(4);
    const firstDot = rows[0]?.querySelector<HTMLElement>(".onboarding-demo-dot");
    expect(firstDot?.dataset.active).toBe("true");
    expect(rows[0]?.querySelector(".onboarding-demo-text")?.textContent).toBe(
      "Opening Brightspace…"
    );
  });
});

describe("mountTestLoginScreen — live progress beads", () => {
  test("beads advance as real login-progress events arrive via onMessage", () => {
    const handle = mountTestLoginScreen(makeCtx());
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "credentials_done" });
    const dots = Array.from(
      document.querySelectorAll<HTMLElement>(".onboarding-demo-dot")
    );
    // credentials_done -> "Generating your login code" (index 2) active.
    expect(dots[2]?.dataset.active).toBe("true");
    expect(dots[0]?.dataset.done).toBe("true");
    expect(dots[1]?.dataset.done).toBe("true");
  });

  test("the fallback never marks 'Signed in' on its own (held for the real success)", () => {
    mountTestLoginScreen(makeCtx());
    vi.advanceTimersByTime(60_000);
    const dots = Array.from(
      document.querySelectorAll<HTMLElement>(".onboarding-demo-dot")
    );
    expect(dots[3]?.dataset.done).not.toBe("true");
    expect(dots[3]?.dataset.active).toBe("true");
  });

  test("a real 'signed_in' completes every bead", () => {
    const handle = mountTestLoginScreen(makeCtx());
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "signed_in" });
    document
      .querySelectorAll<HTMLElement>(".onboarding-demo-dot")
      .forEach((dot) => expect(dot.dataset.done).toBe("true"));
  });
});

describe("mountTestLoginScreen — success frame", () => {
  test("qaVariant='success': success phase, signed-in headline, status line", () => {
    mountTestLoginScreen(makeCtx("success"));
    const section = document.querySelector<HTMLElement>(
      "[data-onboarding-screen='TEST_LOGIN']"
    )!;
    expect(section.dataset.onboardingTestPhase).toBe("success");
    expect(document.querySelector("h2")?.textContent).toBe("Your key works.");
    expect(document.querySelector(".onboarding-status")?.textContent).toContain(
      "Saving your vault"
    );
  });

  test("success frame marks every row done and none active", () => {
    mountTestLoginScreen(makeCtx("success"));
    expect(
      document.querySelectorAll(".onboarding-demo-dot[data-active='true']")
    ).toHaveLength(0);
    expect(
      document.querySelectorAll(".onboarding-demo-dot[data-done='true']")
    ).toHaveLength(4);
  });
});

describe("mountTestLoginScreen — lifecycle & side effects", () => {
  test("unmount removes the container", () => {
    const handle = mountTestLoginScreen(makeCtx());
    handle.unmount();
    expect(
      document.querySelector("[data-onboarding-screen='TEST_LOGIN']")
    ).toBeNull();
  });

  test("on mount: sends LOGOUT_CUNY_SESSIONS, then stages credentials, then opens CUNY tab", async () => {
    const ctx: OnboardingScreenContext = {
      ...makeCtx(),
      getSnapshot: () => ({
        state: "TEST_LOGIN",
        email: "student@login.cuny.edu",
        password: "secret123",
        credentialError: null,
        advancedKeyFlow: false,
      }),
    };
    mountTestLoginScreen(ctx);
    await flush();

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(sendMessageMock).toHaveBeenNthCalledWith(1, { type: "LOGOUT_CUNY_SESSIONS" });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "student@login.cuny.edu",
      password: "secret123",
    });
    expect(tabsCreateMock).toHaveBeenCalledTimes(1);
    expect((tabsCreateMock.mock.calls[0]?.[0] as { active: boolean }).active).toBe(true);
  });

  test("on mount: recovers silently if sendMessage rejects", async () => {
    sendMessageMock.mockRejectedValue(new Error("SW down"));
    expect(() => mountTestLoginScreen(makeCtx())).not.toThrow();
    await flush();
    // tabs.create is still attempted even if sendMessage failed
    expect(tabsCreateMock).toHaveBeenCalledTimes(1);
  });
});
