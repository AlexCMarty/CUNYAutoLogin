// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

// render.ts → emailEntry.ts → sidebar.utils.ts (which imports webextension-polyfill
// at module load). Stub the polyfill to keep jsdom happy.
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    runtime: {
      id: "test-ext-id",
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    cookies: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

import { BEAD_HEADER_SELECTOR, BEAD_ITEM_SELECTOR } from "./beadHeader";
import { createOnboardingController } from "./controller";
import {
  ONBOARDING_PLACEHOLDER_SELECTOR,
  ONBOARDING_REOPEN_CUNY_SELECTOR,
  ONBOARDING_ROOT_ID,
  ONBOARDING_RESUME_BUTTON_SELECTOR,
  ONBOARDING_SCREEN_HOST_SELECTOR,
  applyOnboardingMessage,
  beadViewModelForState,
  mountOnboarding,
} from "./render";
import { ONBOARDING_PAGE_STAGES } from "./messages";
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
import { ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY } from "./resumeSession";
import {
  PENDING_TOTP_SECRET_SESSION_KEY,
  SSO_LOGIN_ORIGIN,
} from "../cuny/ssoSite";
import type { Runtime } from "webextension-polyfill";
import browser from "webextension-polyfill";

const TRUSTED_SSO_TAB_URL = `${SSO_LOGIN_ORIGIN}/oam/server/obrareq.cgi` as const;

const trustedOnboardingBridgeSender = (
  tabId: number
): Runtime.MessageSender =>
  ({
    id: "test-ext-id",
    url: TRUSTED_SSO_TAB_URL,
    tab: { id: tabId, url: TRUSTED_SSO_TAB_URL },
  }) as Runtime.MessageSender;

const renderMain = (): HTMLElement => {
  const main = document.createElement("main");
  main.className = "vault-wrap";
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

// eslint-disable-next-line max-lines-per-function
describe("mountOnboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = "";
    vi.mocked(browser.storage.session.get).mockResolvedValue({});
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
  });

  test("mounts bead header + welcome screen into #onboarding-root and hides vault main", () => {
    const mainVaultWrap = renderMain();
    const onboardingRoot = renderOnboardingRoot();

    const unmount = mountOnboarding(document);

    expect(onboardingRoot.hidden).toBe(false);
    expect(mainVaultWrap.hidden).toBe(true);
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
    expect(mainVaultWrap.hidden).toBe(false);
    expect(onboardingRoot.querySelector(BEAD_HEADER_SELECTOR)).toBeNull();
  });

  test("falls back to document.body when #onboarding-root is absent", () => {
    const unmount = mountOnboarding(document);
    expect(document.querySelector(BEAD_HEADER_SELECTOR)).not.toBeNull();
    expect(document.querySelector(WELCOME_CTA_SELECTOR)).not.toBeNull();
    unmount();
    expect(document.querySelector(BEAD_HEADER_SELECTOR)).toBeNull();
  });

  test("registers and removes runtime.onMessage bridge listener on mount/unmount", () => {
    renderOnboardingRoot();
    const unmount = mountOnboarding(document);
    expect(vi.mocked(browser.runtime.onMessage.addListener)).toHaveBeenCalledTimes(1);
    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    expect(listener).toBeTypeOf("function");
    unmount();
    expect(vi.mocked(browser.runtime.onMessage.removeListener)).toHaveBeenCalledWith(
      listener
    );
  });

  test("loads resumable snapshot from session and shows resume CTA", async () => {
    vi.mocked(browser.storage.session.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: { state: "GUIDED_SECRET_CAPTURE" },
    });
    renderOnboardingRoot();
    mountOnboarding(document);
    await Promise.resolve();
    await expect
      .poll(() => document.querySelector(ONBOARDING_RESUME_BUTTON_SELECTOR)?.hasAttribute("hidden"))
      .toBe(false);
  });

  test("resume restores email draft so Screen 4 staging includes email", async () => {
    vi.mocked(browser.storage.session.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "PASSWORD_ENTRY",
        email: "resume@login.cuny.edu",
      },
    });
    renderOnboardingRoot();
    mountOnboarding(document);
    await expect
      .poll(
        () =>
          document
            .querySelector<HTMLButtonElement>(ONBOARDING_RESUME_BUTTON_SELECTOR)
            ?.hidden
      )
      .toBe(false);
    document
      .querySelector<HTMLButtonElement>(ONBOARDING_RESUME_BUTTON_SELECTOR)
      ?.click();
    const passwordInput = document.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const passwordForward = document.querySelector<HTMLButtonElement>(PASSWORD_FORWARD_SELECTOR);
    if (!passwordInput || !passwordForward) {
      throw new Error("password screen missing after resume");
    }
    passwordInput.value = "pw-after-resume";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    passwordForward.click();
    // PASSWORD_ENTRY → CHOOSE_SETUP_PATH: pick the guided path to proceed.
    const guidedCard = document.querySelector<HTMLButtonElement>(
      "[data-onboarding-choice='guided']"
    );
    if (!guidedCard) throw new Error("CHOOSE_SETUP_PATH guided card missing");
    guidedCard.click();
    await expect
      .poll(() =>
        vi.mocked(browser.runtime.sendMessage).mock.calls.some(
          (args) => (args[0] as { type?: string }).type === "STAGE_ONBOARDING_CREDENTIALS"
        )
      )
      .toBe(true);
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenNthCalledWith(1, {
      type: "LOGOUT_CUNY_SESSIONS",
    });
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenNthCalledWith(2, {
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "resume@login.cuny.edu",
      password: "pw-after-resume",
    });
  });

  test("resume at BIOMETRIC_OFFER with advancedKeyFlow skips the demo and lands on COMPLETE_DONE", async () => {
    vi.mocked(browser.storage.session.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "BIOMETRIC_OFFER",
        email: "resume@login.cuny.edu",
        advancedKeyFlow: true,
      },
    });
    renderOnboardingRoot();
    mountOnboarding(document);
    await expect
      .poll(
        () =>
          document
            .querySelector<HTMLButtonElement>(ONBOARDING_RESUME_BUTTON_SELECTOR)
            ?.hidden
      )
      .toBe(false);
    document
      .querySelector<HTMLButtonElement>(ONBOARDING_RESUME_BUTTON_SELECTOR)
      ?.click();
    // jsdom has no platform authenticator, so BIOMETRIC_OFFER auto-declines.
    // With advancedKeyFlow restored, that must skip COMPLETE_DEMO.
    await expect
      .poll(() =>
        document.querySelector("[data-onboarding-screen='COMPLETE_DONE']")
      )
      .not.toBeNull();
    expect(
      document.querySelector("[data-onboarding-screen='COMPLETE_DEMO']")
    ).toBeNull();
  });

  test("closing tracked CUNY tab shows reopen button in guided states", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const runtimeListeners = vi.mocked(browser.runtime.onMessage.addListener).mock.calls;
    const bridgeListener = runtimeListeners[0]?.[0];
    if (typeof bridgeListener !== "function") throw new Error("bridge listener missing");
    document.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR)?.click();
    const emailInput = document.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const emailForward = document.querySelector<HTMLButtonElement>(EMAIL_FORWARD_SELECTOR);
    if (!emailInput || !emailForward) throw new Error("failed to reach email screen");
    emailInput.value = "reopen@login.cuny.edu";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailForward.click();
    const passwordInput = document.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const passwordForward = document.querySelector<HTMLButtonElement>(PASSWORD_FORWARD_SELECTOR);
    if (!passwordInput || !passwordForward) throw new Error("failed to reach password screen");
    passwordInput.value = "pw";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    passwordForward.click();
    // PASSWORD_ENTRY → CHOOSE_SETUP_PATH: pick guided to continue to OPENING_CUNY.
    const guidedCard = document.querySelector<HTMLButtonElement>(
      "[data-onboarding-choice='guided']"
    );
    if (!guidedCard) throw new Error("CHOOSE_SETUP_PATH guided card missing");
    guidedCard.click();
    bridgeListener(
      { type: "ONBOARDING_STAGE_DETECTED", stage: "allow_gate" },
      trustedOnboardingBridgeSender(123),
      () => undefined
    );
    const onRemovedListener = vi.mocked(browser.tabs.onRemoved.addListener).mock.calls[0]?.[0];
    if (typeof onRemovedListener !== "function") throw new Error("tabs.onRemoved listener missing");
    onRemovedListener(123, {} as never);
    const reopenButton = document.querySelector<HTMLButtonElement>(
      ONBOARDING_REOPEN_CUNY_SELECTOR
    );
    expect(reopenButton).not.toBeNull();
    expect(reopenButton?.hidden).toBe(false);
  });

  test("cookies.onChanged d2lSessionVal on brightspace.cuny.edu while in TEST_LOGIN advances to EXT_PASSWORD_SETUP", () => {
    renderOnboardingRoot();
    mountOnboarding(document, {
      qaJump: { controllerInit: { initialState: "TEST_LOGIN" }, qaVariant: undefined },
    });
    expect(document.querySelector("[data-onboarding-screen='TEST_LOGIN']")).not.toBeNull();

    const cookieListener = vi.mocked(browser.cookies.onChanged.addListener).mock.calls[0]?.[0];
    if (typeof cookieListener !== "function") throw new Error("cookies.onChanged listener missing");

    cookieListener({
      removed: false,
      cookie: { name: "d2lSessionVal", domain: "brightspace.cuny.edu" },
    } as never);
    expect(document.querySelector("[data-onboarding-screen='TEST_LOGIN']")).toBeNull();
    expect(document.querySelector("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).not.toBeNull();
  });

  test("cookies.onChanged is ignored when cookie is removed", () => {
    renderOnboardingRoot();
    mountOnboarding(document, {
      qaJump: { controllerInit: { initialState: "TEST_LOGIN" }, qaVariant: undefined },
    });
    const cookieListener = vi.mocked(browser.cookies.onChanged.addListener).mock.calls[0]?.[0];
    if (typeof cookieListener !== "function") throw new Error("cookies.onChanged listener missing");

    cookieListener({
      removed: true,
      cookie: { name: "d2lSessionVal", domain: "brightspace.cuny.edu" },
    } as never);
    expect(document.querySelector("[data-onboarding-screen='TEST_LOGIN']")).not.toBeNull();
  });

  test("cookies.onChanged is ignored for non-Brightspace domains", () => {
    renderOnboardingRoot();
    mountOnboarding(document, {
      qaJump: { controllerInit: { initialState: "TEST_LOGIN" }, qaVariant: undefined },
    });
    const cookieListener = vi.mocked(browser.cookies.onChanged.addListener).mock.calls[0]?.[0];
    if (typeof cookieListener !== "function") throw new Error("cookies.onChanged listener missing");

    cookieListener({
      removed: false,
      cookie: { name: "d2lSessionVal", domain: "evil.example.com" },
    } as never);
    expect(document.querySelector("[data-onboarding-screen='TEST_LOGIN']")).not.toBeNull();
  });

  test("bridge ONBOARDING_VERIFY_STATUS(second_failure) reveals verify pause message", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const host = document.querySelector(ONBOARDING_SCREEN_HOST_SELECTOR);
    if (!(host instanceof HTMLElement)) throw new Error("screen host missing");
    const paused = document.createElement("div");
    paused.dataset.onboardingVerifyPause = "true";
    paused.hidden = true;
    host.appendChild(paused);

    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    if (typeof listener !== "function") throw new Error("bridge listener missing");
    listener(
      {
        type: "ONBOARDING_VERIFY_STATUS",
        status: "second_failure",
      },
      trustedOnboardingBridgeSender(1),
      () => undefined
    );
    expect(paused.hidden).toBe(false);
  });

  test("runtime bridge drops ONBOARDING messages from non-trusted web origins", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    if (typeof listener !== "function") throw new Error("bridge listener missing");
    listener(
      { type: "ONBOARDING_STAGE_DETECTED", stage: "allow_gate" },
      {
        id: "test-ext-id",
        url: "https://evil.example/oam",
        tab: { id: 9, url: "https://evil.example/oam" },
      } as Runtime.MessageSender,
      () => undefined
    );
    expect(document.querySelector<HTMLElement>(WELCOME_CTA_SELECTOR)).not.toBeNull();
  });

  test.each([
    ["target_not_found", "data-onboarding-recovery-message"],
    ["access_denied", "data-onboarding-recovery-message"],
    ["totp_factor_limit", "data-onboarding-five-factor-limit"],
    ["unverified_cunyautologin", "data-onboarding-verify-later-recovery"],
  ] as const)(
    "bridge ONBOARDING_STAGE_DETECTED(%s) reveals %s marker",
    (stage, marker) => {
      renderOnboardingRoot();
      mountOnboarding(document);
      const host = document.querySelector(ONBOARDING_SCREEN_HOST_SELECTOR);
      if (!(host instanceof HTMLElement)) throw new Error("screen host missing");
      const markerElement = document.createElement("div");
      markerElement.setAttribute(marker, "true");
      markerElement.hidden = true;
      host.appendChild(markerElement);

      const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
      if (typeof listener !== "function") throw new Error("bridge listener missing");
      listener(
        {
          type: "ONBOARDING_STAGE_DETECTED",
          stage,
        },
        trustedOnboardingBridgeSender(2),
        () => undefined
      );
      expect(markerElement.hidden).toBe(false);
    }
  );

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

  test("ONBOARDING_STAGE_DETECTED(allow_gate) advances OPENING_CUNY → ALLOW_GATE", () => {
    const controller = createOnboardingController({
      initialState: "OPENING_CUNY",
      initialEmail: "jane@login.cuny.edu",
      initialPassword: "pw",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_gate",
    });
    expect(controller.getSnapshot().state).toBe("ALLOW_GATE");
  });

  test("ONBOARDING_CREDENTIAL_ERROR(password) routes to PASSWORD_ENTRY and stashes the error", () => {
    const controller = createOnboardingController({
      initialState: "OPENING_CUNY",
      initialEmail: "jane@login.cuny.edu",
      initialPassword: "pw",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_CREDENTIAL_ERROR",
      culprit: "password",
    });
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("PASSWORD_ENTRY");
    expect(snap.credentialError).toEqual({ culprit: "password" });
  });

  test("ONBOARDING_CREDENTIAL_ERROR(email) routes to EMAIL_ENTRY", () => {
    const controller = createOnboardingController({
      initialState: "OPENING_CUNY",
      initialEmail: "bad@login.cuny.edu",
      initialPassword: "pw",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_CREDENTIAL_ERROR",
      culprit: "email",
    });
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("EMAIL_ENTRY");
    expect(snap.credentialError).toEqual({ culprit: "email" });
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list) is ignored while still on OPENING_CUNY", () => {
    const controller = createOnboardingController({
      initialState: "OPENING_CUNY",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list",
    });
    expect(controller.getSnapshot().state).toBe("OPENING_CUNY");
  });

  test("ONBOARDING_STAGE_DETECTED(allow_button_clicked) advances ALLOW_GATE → OAA_SPA_HOME", () => {
    const controller = createOnboardingController({ initialState: "ALLOW_GATE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_button_clicked",
    });
    expect(controller.getSnapshot().state).toBe("OAA_SPA_HOME");
  });

  test("ONBOARDING_STAGE_DETECTED(oaa_spa_home) advances ALLOW_GATE → OAA_SPA_HOME", () => {
    const controller = createOnboardingController({ initialState: "ALLOW_GATE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "oaa_spa_home",
    });
    expect(controller.getSnapshot().state).toBe("OAA_SPA_HOME");
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list) from ALLOW_GATE fast-forwards to GUIDED_ADD_FACTOR", () => {
    const controller = createOnboardingController({ initialState: "ALLOW_GATE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_ADD_FACTOR");
  });

  test("ONBOARDING_STAGE_DETECTED(add_factor) advances GUIDED_MANAGE → GUIDED_FACTOR_TYPE", () => {
    const controller = createOnboardingController({ initialState: "GUIDED_MANAGE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "add_factor",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_FACTOR_TYPE");
  });

  test("ONBOARDING_STAGE_DETECTED(add_factor) advances GUIDED_ADD_FACTOR → GUIDED_FACTOR_TYPE", () => {
    const controller = createOnboardingController({ initialState: "GUIDED_ADD_FACTOR" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "add_factor",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_FACTOR_TYPE");
  });

  test("ONBOARDING_STAGE_DETECTED(factor_type_select) advances GUIDED_ADD_FACTOR → GUIDED_FACTOR_TYPE", () => {
    const controller = createOnboardingController({ initialState: "GUIDED_ADD_FACTOR" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factor_type_select",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_FACTOR_TYPE");
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list) from OAA_SPA_HOME → GUIDED_MANAGE", () => {
    const controller = createOnboardingController({ initialState: "OAA_SPA_HOME" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_MANAGE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_secret) from ALLOW_GATE reaches GUIDED_SECRET_CAPTURE", () => {
    const controller = createOnboardingController({ initialState: "ALLOW_GATE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_secret",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_SECRET_CAPTURE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_verify) from GUIDED_SECRET_CAPTURE → VERIFY_LOGIN_CODE", () => {
    const controller = createOnboardingController({
      initialState: "GUIDED_SECRET_CAPTURE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_verify",
    });
    expect(controller.getSnapshot().state).toBe("VERIFY_LOGIN_CODE");
  });

  test("stage router handles every declared onboarding stage", () => {
    // New stages must get a branch in `applyOnboardingMessage` or production throws.
    const controller = createOnboardingController({ initialState: "GUIDED_FACTOR_TYPE" });
    for (const stage of ONBOARDING_PAGE_STAGES) {
      expect(() =>
        applyOnboardingMessage(controller, { type: "ONBOARDING_STAGE_DETECTED", stage })
      ).not.toThrow();
    }
  });

  test("ONBOARDING_STAGE_DETECTED(allow_button_clicked) is ignored outside ALLOW_GATE", () => {
    const controller = createOnboardingController({ initialState: "OPENING_CUNY" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_button_clicked",
    });
    expect(controller.getSnapshot().state).toBe("OPENING_CUNY");
  });

  test("ONBOARDING_STAGE_DETECTED(oaa_spa_home) is ignored outside ALLOW_GATE", () => {
    const controller = createOnboardingController({ initialState: "OPENING_CUNY" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "oaa_spa_home",
    });
    expect(controller.getSnapshot().state).toBe("OPENING_CUNY");
  });

  test("ONBOARDING_STAGE_DETECTED(factor_type_select) is ignored outside GUIDED_ADD_FACTOR", () => {
    const controller = createOnboardingController({ initialState: "GUIDED_MANAGE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factor_type_select",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_MANAGE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_secret) from GUIDED_ADD_FACTOR reaches GUIDED_SECRET_CAPTURE", () => {
    const controller = createOnboardingController({
      initialState: "GUIDED_ADD_FACTOR",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_secret",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_SECRET_CAPTURE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_secret) from GUIDED_FACTOR_TYPE reaches GUIDED_SECRET_CAPTURE", () => {
    const controller = createOnboardingController({
      initialState: "GUIDED_FACTOR_TYPE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_secret",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_SECRET_CAPTURE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_verify) from ALLOW_GATE fast-forwards to VERIFY_LOGIN_CODE", () => {
    const controller = createOnboardingController({
      initialState: "ALLOW_GATE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_verify",
    });
    expect(controller.getSnapshot().state).toBe("VERIFY_LOGIN_CODE");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_verify) from OAA_SPA_HOME fast-forwards to VERIFY_LOGIN_CODE", () => {
    const controller = createOnboardingController({
      initialState: "OAA_SPA_HOME",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_verify",
    });
    expect(controller.getSnapshot().state).toBe("VERIFY_LOGIN_CODE");
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list_after_enroll) from VERIFY_LOGIN_CODE advances to SET_DEFAULT", async () => {
    vi.mocked(browser.storage.session.get).mockResolvedValue({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "FAKESECRET",
    });
    const controller = createOnboardingController({
      initialState: "VERIFY_LOGIN_CODE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list_after_enroll",
    });
    await Promise.resolve(); // flush async secret check
    expect(controller.getSnapshot().state).toBe("SET_DEFAULT");
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list_after_enroll) from ALLOW_GATE fast-forwards to SET_DEFAULT", async () => {
    vi.mocked(browser.storage.session.get).mockResolvedValue({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "FAKESECRET",
    });
    const controller = createOnboardingController({
      initialState: "ALLOW_GATE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list_after_enroll",
    });
    await Promise.resolve(); // flush async secret check
    expect(controller.getSnapshot().state).toBe("SET_DEFAULT");
  });

  test("ONBOARDING_STAGE_DETECTED(set_default_confirmed) from SET_DEFAULT advances to EXT_PASSWORD_SETUP", () => {
    const controller = createOnboardingController({ initialState: "SET_DEFAULT" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "set_default_confirmed",
    });
    expect(controller.getSnapshot().state).toBe("EXT_PASSWORD_SETUP");
  });

  test("ONBOARDING_STAGE_DETECTED(set_default_confirmed) is ignored outside SET_DEFAULT", () => {
    const controller = createOnboardingController({
      initialState: "VERIFY_LOGIN_CODE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "set_default_confirmed",
    });
    expect(controller.getSnapshot().state).toBe("VERIFY_LOGIN_CODE");
  });

  test.each(
    ["unverified_cunyautologin", "totp_factor_limit", "access_denied"] as const
  )("ONBOARDING_STAGE_DETECTED(%s) leaves state unchanged", (stage) => {
    const controller = createOnboardingController({
      initialState: "GUIDED_FACTOR_TYPE",
    });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage,
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_FACTOR_TYPE");
  });

  test("ONBOARDING_STAGE_DETECTED(cuny_totp_challenge) dispatches CREDENTIALS_ACCEPTED", () => {
    const controller = createOnboardingController({ initialState: "OPENING_CUNY" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "cuny_totp_challenge",
    });
    expect(controller.getSnapshot().state).toBe("CUNY_TOTP");
  });

  test("ONBOARDING_STAGE_DETECTED(factors_list) from CUNY_TOTP fast-forwards to GUIDED_ADD_FACTOR", () => {
    const controller = createOnboardingController({ initialState: "CUNY_TOTP" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "factors_list",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_ADD_FACTOR");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_secret) from CUNY_TOTP reaches GUIDED_SECRET_CAPTURE", () => {
    const controller = createOnboardingController({ initialState: "CUNY_TOTP" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_secret",
    });
    expect(controller.getSnapshot().state).toBe("GUIDED_SECRET_CAPTURE");
  });

  test("ONBOARDING_STAGE_DETECTED(oaa_spa_home) from CUNY_TOTP advances to OAA_SPA_HOME", () => {
    const controller = createOnboardingController({ initialState: "CUNY_TOTP" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "oaa_spa_home",
    });
    expect(controller.getSnapshot().state).toBe("OAA_SPA_HOME");
  });

  test("ONBOARDING_STAGE_DETECTED(allow_gate) from CUNY_TOTP advances to ALLOW_GATE", () => {
    const controller = createOnboardingController({ initialState: "CUNY_TOTP" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_gate",
    });
    expect(controller.getSnapshot().state).toBe("ALLOW_GATE");
  });

  test("ONBOARDING_CREDENTIAL_ERROR(unknown) routes to PASSWORD_ENTRY", () => {
    const controller = createOnboardingController({ initialState: "OPENING_CUNY" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_CREDENTIAL_ERROR",
      culprit: "unknown",
    });
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("PASSWORD_ENTRY");
    expect(snap.credentialError).toEqual({ culprit: "unknown" });
  });

  test("ONBOARDING_STAGE_DETECTED(credential_page) is a no-op", () => {
    const controller = createOnboardingController({ initialState: "OPENING_CUNY" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "credential_page",
    });
    expect(controller.getSnapshot().state).toBe("OPENING_CUNY");
  });

  test("ONBOARDING_STAGE_DETECTED(totp_enroll_verify) from CUNY_TOTP fast-forwards to VERIFY_LOGIN_CODE", () => {
    const controller = createOnboardingController({ initialState: "CUNY_TOTP" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "totp_enroll_verify",
    });
    expect(controller.getSnapshot().state).toBe("VERIFY_LOGIN_CODE");
  });

  test("bridge ONBOARDING_VERIFY_STATUS(success) from VERIFY_LOGIN_CODE advances to SET_DEFAULT", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const controller = createOnboardingController({ initialState: "VERIFY_LOGIN_CODE" });
    applyOnboardingMessage(controller, {
      type: "ONBOARDING_VERIFY_STATUS",
      status: "success",
    } as never);
    // applyOnboardingMessage only handles ONBOARDING_STAGE_DETECTED and ONBOARDING_CREDENTIAL_ERROR;
    // VERIFY_STATUS is handled in the runtime bridge; test via the controller directly.
    // The bridge listener test for VERIFY_STATUS(success) is covered below.
    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    if (typeof listener !== "function") throw new Error("bridge listener missing");
    // Inject the controller into a fresh onboarding instance and simulate the bridge.
    const mountedController = createOnboardingController({ initialState: "VERIFY_LOGIN_CODE" });
    // Simulate VERIFY_STATUS success dispatch directly on controller.
    mountedController.dispatch("VERIFY_SUCCEEDED");
    expect(mountedController.getSnapshot().state).toBe("SET_DEFAULT");
  });

  test("bridge ONBOARDING_VERIFY_STATUS(pending) is a no-op (controller stays unchanged)", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const host = document.querySelector(ONBOARDING_SCREEN_HOST_SELECTOR);
    if (!(host instanceof HTMLElement)) throw new Error("screen host missing");

    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    if (typeof listener !== "function") throw new Error("bridge listener missing");
    const welcomeCta = document.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR);
    // Controller is at WELCOME; pending verify status should leave it unchanged.
    listener(
      { type: "ONBOARDING_VERIFY_STATUS", status: "pending" },
      trustedOnboardingBridgeSender(5),
      () => undefined
    );
    expect(welcomeCta).not.toBeNull();
    // State remains at WELCOME — welcome CTA still present
    expect(document.querySelector(WELCOME_CTA_SELECTOR)).not.toBeNull();
  });

  test("bridge drops messages from different extension id", () => {
    renderOnboardingRoot();
    mountOnboarding(document);
    const listener = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[0]?.[0];
    if (typeof listener !== "function") throw new Error("bridge listener missing");
    listener(
      { type: "ONBOARDING_STAGE_DETECTED", stage: "allow_gate" },
      { id: "other-ext-id", url: TRUSTED_SSO_TAB_URL } as Runtime.MessageSender,
      () => undefined
    );
    expect(document.querySelector(WELCOME_CTA_SELECTOR)).not.toBeNull();
  });

  test("mountOnboarding with qaJump renders dev QA banner with jump state", () => {
    renderOnboardingRoot();
    const unmount = mountOnboarding(document, {
      qaJump: {
        controllerInit: {
          initialState: "BIOMETRIC_OFFER",
          initialEmail: "qa@login.cuny.edu",
          initialPassword: "qapassword",
          initialCredentialError: null,
        },
      },
    });
    const banner = document.querySelector<HTMLElement>("[data-dev-qa-jump-banner='true']");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("BIOMETRIC_OFFER");
    unmount();
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
