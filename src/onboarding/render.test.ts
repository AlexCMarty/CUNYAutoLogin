// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

// render.ts → emailEntry.ts → popup.utils.ts (which imports webextension-polyfill
// at module load). Stub the polyfill to keep jsdom happy.
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    runtime: { sendMessage: vi.fn() },
  },
}));

import { BEAD_HEADER_SELECTOR, BEAD_ITEM_SELECTOR } from "./beadHeader";
import {
  ONBOARDING_PLACEHOLDER_SELECTOR,
  ONBOARDING_ROOT_ID,
  ONBOARDING_SCREEN_HOST_SELECTOR,
  beadViewModelForState,
  mountOnboarding,
} from "./render";
import {
  EMAIL_FORWARD_SELECTOR,
  EMAIL_INPUT_SELECTOR,
} from "./screens/emailEntry";
import {
  PASSWORD_BACK_SELECTOR,
  PASSWORD_FORWARD_SELECTOR,
  PASSWORD_INPUT_SELECTOR,
} from "./screens/passwordEntry";
import { WELCOME_CTA_SELECTOR } from "./screens/welcome";

const renderMain = (): HTMLElement => {
  const main = document.createElement("main");
  main.className = "wrap";
  main.innerHTML = `<form id="vault-form"></form>`;
  document.body.appendChild(main);
  return main;
};

const renderOnboardingRoot = (): HTMLElement => {
  const root = document.createElement("div");
  root.id = ONBOARDING_ROOT_ID;
  root.hidden = true;
  document.body.appendChild(root);
  return root;
};

describe("beadViewModelForState", () => {
  test("screens 1-3 all leave bead 1 active and beads 2-5 pending", () => {
    for (const state of ["WELCOME", "EMAIL_ENTRY", "PASSWORD_ENTRY"] as const) {
      const models = beadViewModelForState(state);
      expect(models).toHaveLength(5);
      expect(models[0]?.status).toBe("active");
      expect(models[1]?.status).toBe("pending");
      expect(models[4]?.status).toBe("pending");
    }
  });

  test("OPENING_CUNY completes bead 1 and activates bead 2", () => {
    const models = beadViewModelForState("OPENING_CUNY");
    expect(models[0]?.status).toBe("completed");
    expect(models[1]?.status).toBe("active");
  });
});

describe("mountOnboarding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("mounts bead header + welcome screen into #onboarding-root and hides legacy main", () => {
    const legacy = renderMain();
    const onboardingRoot = renderOnboardingRoot();

    const unmount = mountOnboarding(document);

    expect(onboardingRoot.hidden).toBe(false);
    expect(legacy.hidden).toBe(true);
    expect(onboardingRoot.querySelector(BEAD_HEADER_SELECTOR)).not.toBeNull();
    expect(
      onboardingRoot.querySelector(BEAD_ITEM_SELECTOR)?.textContent
    ).toContain("Your info");
    expect(
      onboardingRoot.querySelector(ONBOARDING_SCREEN_HOST_SELECTOR)
    ).not.toBeNull();
    expect(onboardingRoot.querySelector(WELCOME_CTA_SELECTOR)).not.toBeNull();

    unmount();
    expect(onboardingRoot.hidden).toBe(true);
    expect(legacy.hidden).toBe(false);
    expect(onboardingRoot.querySelector(BEAD_HEADER_SELECTOR)).toBeNull();
  });

  test("falls back to document.body when #onboarding-root is absent", () => {
    const unmount = mountOnboarding(document);
    expect(document.querySelector(BEAD_HEADER_SELECTOR)).not.toBeNull();
    expect(document.querySelector(WELCOME_CTA_SELECTOR)).not.toBeNull();
    unmount();
    expect(document.querySelector(BEAD_HEADER_SELECTOR)).toBeNull();
  });

  test("screen 1 → 2 → 3 walkable via Let's go / Continue, bead 1 stays active throughout", () => {
    renderOnboardingRoot();
    mountOnboarding(document);

    const welcomeCta = document.querySelector<HTMLButtonElement>(
      WELCOME_CTA_SELECTOR
    );
    welcomeCta?.click();

    const emailInput = document.querySelector<HTMLInputElement>(
      EMAIL_INPUT_SELECTOR
    );
    const emailForward = document.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    if (!emailInput || !emailForward) throw new Error("email screen missing");
    emailInput.value = "jane.doe@login.cuny.edu";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailForward.click();

    const passwordInput = document.querySelector<HTMLInputElement>(
      PASSWORD_INPUT_SELECTOR
    );
    expect(passwordInput).not.toBeNull();
    expect(passwordInput?.value).toBe("");

    const beads = Array.from(
      document.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    expect(beads[0]?.dataset.beadStatus).toBe("active");
    expect(beads[1]?.dataset.beadStatus).toBe("pending");
  });

  test("back from Screen 3 returns to Screen 2 with email preserved", () => {
    renderOnboardingRoot();
    mountOnboarding(document);

    document.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR)?.click();

    const emailInput = document.querySelector<HTMLInputElement>(
      EMAIL_INPUT_SELECTOR
    );
    const emailForward = document.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    if (!emailInput || !emailForward) throw new Error("email screen missing");
    emailInput.value = "returning@login.cuny.edu";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailForward.click();

    document
      .querySelector<HTMLButtonElement>(PASSWORD_BACK_SELECTOR)
      ?.click();

    const emailInputAfterBack = document.querySelector<HTMLInputElement>(
      EMAIL_INPUT_SELECTOR
    );
    expect(emailInputAfterBack).not.toBeNull();
    expect(emailInputAfterBack?.value).toBe("returning@login.cuny.edu");
  });

  test("password forward on empty input does not advance past screen 3", () => {
    renderOnboardingRoot();
    mountOnboarding(document);

    document.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR)?.click();

    const emailInput = document.querySelector<HTMLInputElement>(
      EMAIL_INPUT_SELECTOR
    );
    const emailForward = document.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    if (!emailInput || !emailForward) throw new Error("email screen missing");
    emailInput.value = "jane@login.cuny.edu";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailForward.click();

    const forward = document.querySelector<HTMLButtonElement>(
      PASSWORD_FORWARD_SELECTOR
    );
    expect(forward?.disabled).toBe(true);
    forward?.click();
    expect(
      document.querySelector(ONBOARDING_PLACEHOLDER_SELECTOR)
    ).toBeNull();
    expect(
      document.querySelector(PASSWORD_INPUT_SELECTOR)
    ).not.toBeNull();
  });
});
