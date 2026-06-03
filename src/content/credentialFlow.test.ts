// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import browser from "webextension-polyfill";
import {
  fillCredentials,
  handleAutoFillFailureCredentialError,
  announceCunyTotpChallenge,
} from "./credentialFlow";
import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
  CREDENTIAL_INPUT_IDS,
  POST_SUBMIT_ERROR_OBSERVE_MS,
} from "../cuny/ssoSite";
import { unwrapErr } from "../testUtils/resultUnwrap";

describe("fillCredentials", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── content/credflow-fillcredentials-isolation [MEDIUM] ───────────────────
  // The happy-path test previously ran on real timers (elements pre-existed so
  // domWait returned immediately). Wrap in fake timers to be consistent with
  // the err-path block and remove the latent real-clock dependency.
  test("fills username/password and clicks submit", async () => {
    vi.useFakeTimers();
    const username = document.createElement("input");
    username.id = CREDENTIAL_INPUT_IDS.username;
    const password = document.createElement("input");
    password.id = CREDENTIAL_INPUT_IDS.password;
    const submit = document.createElement("button");
    submit.id = CREDENTIAL_INPUT_IDS.submitButton;
    const clickSpy = vi.spyOn(submit, "click");
    document.body.append(username, password, submit);

    const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
    // Elements already present so waitFor resolves on the first microtask tick;
    // no timer advancement needed — but we flush to be explicit.
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.isOk()).toBe(true);
    expect(username.value).toBe("student@login.cuny.edu");
    expect(password.value).toBe("hunter2");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  describe("err paths — missing elements", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("returns err when username input is missing", async () => {
      const password = document.createElement("input");
      password.id = CREDENTIAL_INPUT_IDS.password;
      const submit = document.createElement("button");
      submit.id = CREDENTIAL_INPUT_IDS.submitButton;
      document.body.append(password, submit);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("username_input_not_found");
    });

    test("returns err when password input is missing", async () => {
      const username = document.createElement("input");
      username.id = CREDENTIAL_INPUT_IDS.username;
      const submit = document.createElement("button");
      submit.id = CREDENTIAL_INPUT_IDS.submitButton;
      document.body.append(username, submit);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("password_input_not_found");
    });

    test("returns err when submit button is missing", async () => {
      const username = document.createElement("input");
      username.id = CREDENTIAL_INPUT_IDS.username;
      const password = document.createElement("input");
      password.id = CREDENTIAL_INPUT_IDS.password;
      document.body.append(username, password);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("submit_button_not_found");
    });
  });
});

// Helper: insert the credential error DOM element with the Oracle text marker
function insertCredentialError(): void {
  const el = document.createElement("div");
  el.id = CREDENTIAL_ERROR_ELEMENT_ID;
  el.textContent = CREDENTIAL_ERROR_TEXT_MARKER;
  document.body.appendChild(el);
}

describe("announceCunyTotpChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sends ONBOARDING_STAGE_DETECTED cuny_totp_challenge", async () => {
    await announceCunyTotpChallenge();
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "cuny_totp_challenge",
    });
  });

  test("does not throw when sendMessage rejects", async () => {
    vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error("port closed"));
    await expect(announceCunyTotpChallenge()).resolves.toBeUndefined();
  });
});

// handleCredentialPageFlow has module-level hasSubmitBeenAttempted state that
// persists for the module lifetime. Use vi.resetModules() + dynamic import so
// each test gets a pristine module instance.
// eslint-disable-next-line max-lines-per-function
describe("handleCredentialPageFlow", () => {
  const noop = (): void => { /* no-op logger */ };

  const importFresh = async () => {
    vi.resetModules();
    return import("./credentialFlow");
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/obrareq.cgi") as unknown as Location);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const validPayload = {
    email: "student@login.cuny.edu",
    password: "hunter2",
    totpSecret: "",
  };

  test("returns false when URL is neither credential page nor credential error", async () => {
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oaa-totp-factor/") as unknown as Location);
    const { handleCredentialPageFlow: fn } = await importFresh();
    const result = await fn(validPayload, noop);
    expect(result).toBe(false);
  });

  test("returns true and reports credential error when on credential-error URL and error in DOM", async () => {
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/auth_cred_submit") as unknown as Location);
    insertCredentialError();
    const { handleCredentialPageFlow: fn } = await importFresh();
    const result = await fn(validPayload, noop);
    expect(result).toBe(true);
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });

  test("returns true without immediate error message when on credential-error URL but no error in DOM yet", async () => {
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/auth_cred_submit") as unknown as Location);
    const { handleCredentialPageFlow: fn } = await importFresh();
    const result = await fn(validPayload, noop);
    expect(result).toBe(true);
  });

  test("fills credentials on credential page when no error in DOM and first visit", async () => {
    const username = document.createElement("input");
    username.id = CREDENTIAL_INPUT_IDS.username;
    const password = document.createElement("input");
    password.id = CREDENTIAL_INPUT_IDS.password;
    const submit = document.createElement("button");
    submit.id = CREDENTIAL_INPUT_IDS.submitButton;
    document.body.append(username, password, submit);

    const { handleCredentialPageFlow: fn } = await importFresh();
    const resultPromise = fn(validPayload, noop);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(true);
    expect(username.value).toBe("student@login.cuny.edu");
    expect(password.value).toBe("hunter2");
  });

  test("returns true and reports credential error when on credential page and error is already in DOM", async () => {
    insertCredentialError();
    const { handleCredentialPageFlow: fn } = await importFresh();
    const result = await fn(validPayload, noop);
    expect(result).toBe(true);
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });

  test("watchForPostSubmitCredentialError observer fires reportCredentialError when error appears via DOM mutation", async () => {
    vi.useRealTimers(); // MutationObserver needs real timers for microtask flushing
    const username = document.createElement("input");
    username.id = CREDENTIAL_INPUT_IDS.username;
    const password = document.createElement("input");
    password.id = CREDENTIAL_INPUT_IDS.password;
    const submit = document.createElement("button");
    submit.id = CREDENTIAL_INPUT_IDS.submitButton;
    document.body.append(username, password, submit);

    const { handleCredentialPageFlow: fn } = await importFresh();
    await fn(validPayload, noop);

    vi.clearAllMocks();

    // Simulate Oracle injecting the error element into the DOM after submit
    insertCredentialError();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });
});

describe("handleAutoFillFailureCredentialError", () => {
  const noop = (): void => { /* no-op logger */ };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/obrareq.cgi") as unknown as Location);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("does not send credential error when no error element in DOM", async () => {
    await handleAutoFillFailureCredentialError(noop, "no_session_master");
    expect(vi.mocked(browser.runtime.sendMessage)).not.toHaveBeenCalled();
  });

  test("sends credential error when on credential page with error in DOM", async () => {
    insertCredentialError();
    await handleAutoFillFailureCredentialError(noop, "no_session_master");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });

  test("sends credential error when on credential-error URL with error in DOM", async () => {
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/auth_cred_submit") as unknown as Location);
    insertCredentialError();
    await handleAutoFillFailureCredentialError(noop, "decrypt_error");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });

  test("does not throw when sendMessage rejects", async () => {
    insertCredentialError();
    vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error("closed"));
    await expect(
      handleAutoFillFailureCredentialError(noop, "storage_error")
    ).resolves.toBeUndefined();
  });

  // ── content/credflow-autofill-failure-reasons [LOW] ───────────────────────
  // The URL gate: an error element present on an UNRELATED page (e.g. the TOTP
  // factor page) must NOT report a credential error — keeps spurious banners off
  // pages where the error DOM is not a credential rejection.
  test("error DOM on an unrelated (TOTP) URL does NOT send a credential error", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oaa-totp-factor/") as unknown as Location
    );
    insertCredentialError();
    await handleAutoFillFailureCredentialError(noop, "no_session_master");
    expect(vi.mocked(browser.runtime.sendMessage)).not.toHaveBeenCalled();
  });
});

// ── content/credflow-refill-guard [MEDIUM] ────────────────────────────────────
// After one fill attempt per module lifetime (hasSubmitBeenAttempted), a
// re-render must NOT refill + resubmit (account-lockout guard).
// Uses a SINGLE importFresh so the latch persists across both calls.
describe("handleCredentialPageFlow refill guard (single module lifetime)", () => {
  const noop = (): void => { /* no-op logger */ };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.stubGlobal("location", new URL("https://ssologin.cuny.edu/oam/server/obrareq.cgi") as unknown as Location);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("second call does NOT re-set values or re-click submit", async () => {
    // One fresh import — the latch is shared between both calls
    vi.resetModules();
    const { handleCredentialPageFlow: fn } = await import("./credentialFlow");

    const username = document.createElement("input");
    username.id = CREDENTIAL_INPUT_IDS.username;
    const password = document.createElement("input");
    password.id = CREDENTIAL_INPUT_IDS.password;
    const submit = document.createElement("button");
    submit.id = CREDENTIAL_INPUT_IDS.submitButton;
    const clickSpy = vi.spyOn(submit, "click");
    document.body.append(username, password, submit);

    const validPayload = { email: "student@login.cuny.edu", password: "hunter2", totpSecret: "" };

    // First call — should fill and submit
    const first = fn(validPayload, noop);
    await vi.runAllTimersAsync();
    await first;

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(username.value).toBe("student@login.cuny.edu");

    // Reset values to detect a spurious second fill
    username.value = "";
    password.value = "";
    clickSpy.mockClear();

    // Second call on the same credential page — latch is set, must skip refill
    const second = fn(validPayload, noop);
    await vi.runAllTimersAsync();
    await second;

    expect(clickSpy).toHaveBeenCalledTimes(0);
    expect(username.value).toBe("");
    expect(password.value).toBe("");
  });
});

// ── content/watch-observer-timeout-leak [LOW] ─────────────────────────────────
// watchForPostSubmitCredentialError must disconnect its MutationObserver after
// POST_SUBMIT_ERROR_OBSERVE_MS with no error, so it never leaks across a real
// navigation. Driven via the credential-ERROR URL path with no DOM error, which
// installs ONLY the watch observer (no fillCredentials) so the disconnect spy is
// unambiguous.
describe("watchForPostSubmitCredentialError — teardown on observe-window timeout", () => {
  const noop = (): void => { /* no-op logger */ };
  const validPayload = { email: "student@login.cuny.edu", password: "hunter2", totpSecret: "" };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oam/server/auth_cred_submit") as unknown as Location
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("disconnects the observer and sends no report when the window elapses with no error", async () => {
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, "disconnect");
    vi.resetModules();
    const { handleCredentialPageFlow: fn } = await import("./credentialFlow");

    await fn(validPayload, noop); // installs the watch observer + 8s teardown timer
    expect(disconnectSpy).not.toHaveBeenCalled(); // still observing within the window

    await vi.advanceTimersByTimeAsync(POST_SUBMIT_ERROR_OBSERVE_MS + 1);

    expect(disconnectSpy).toHaveBeenCalled(); // torn down on timeout
    expect(vi.mocked(browser.runtime.sendMessage)).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_CREDENTIAL_ERROR" })
    );
  });
});
