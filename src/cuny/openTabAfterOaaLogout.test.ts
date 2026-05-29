import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { tabsCreateMock, tabsUpdateMock, tabsGetMock, onUpdatedAddMock, onUpdatedRemoveMock } =
  vi.hoisted(() => ({
    tabsCreateMock: vi.fn(),
    tabsUpdateMock: vi.fn(),
    tabsGetMock: vi.fn(),
    onUpdatedAddMock: vi.fn(),
    onUpdatedRemoveMock: vi.fn(),
  }));

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
      update: tabsUpdateMock,
      get: tabsGetMock,
      onUpdated: {
        addListener: onUpdatedAddMock,
        removeListener: onUpdatedRemoveMock,
      },
    },
  },
}));

import {
  CUNY_LOGIN_ENTRY_URL,
  OAA_LOGOUT_COMPLETE_PATH_MARKER,
  OAA_RUI_LOGOUT_URL,
  SSO_LOGIN_ORIGIN,
} from "./ssoSite";
import { openTabAfterOaaLogout, waitForTabLogoutLanding } from "./openTabAfterOaaLogout";

const LOGOUT_LANDING_URL =
  `${SSO_LOGIN_ORIGIN}/cunylogin/pages/${OAA_LOGOUT_COMPLETE_PATH_MARKER}` as const;

describe("waitForTabLogoutLanding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tabsGetMock.mockResolvedValue({ id: 5, status: "loading", url: "chrome://newtab/" });
    onUpdatedAddMock.mockReset();
    onUpdatedRemoveMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves when tabs.get already shows Logout.jsp complete", async () => {
    tabsGetMock.mockResolvedValue({
      id: 5,
      status: "complete",
      url: LOGOUT_LANDING_URL,
    });
    await expect(waitForTabLogoutLanding(5)).resolves.toBeUndefined();
    expect(onUpdatedRemoveMock).toHaveBeenCalledTimes(1);
  });

  test("ignores spurious complete on chrome://newtab", async () => {
    onUpdatedAddMock.mockImplementation(
      (listener: (id: number, info: { status?: string }, tab: { url?: string }) => void) => {
        listener(5, { status: "complete" }, { url: "chrome://newtab/" });
      }
    );
    const pending = expect(waitForTabLogoutLanding(5, 100)).rejects.toThrow(
      "logout_landing_timeout"
    );
    await vi.advanceTimersByTimeAsync(100);
    await pending;
  });

  test("resolves when onUpdated reports Logout.jsp complete", async () => {
    onUpdatedAddMock.mockImplementation(
      (listener: (id: number, info: { status?: string; url?: string }) => void) => {
        listener(5, { status: "complete", url: LOGOUT_LANDING_URL });
      }
    );
    await expect(waitForTabLogoutLanding(5)).resolves.toBeUndefined();
    expect(onUpdatedRemoveMock).toHaveBeenCalledTimes(1);
  });
});

describe("openTabAfterOaaLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tabsCreateMock.mockReset();
    tabsUpdateMock.mockReset();
    tabsGetMock.mockReset();
    onUpdatedAddMock.mockReset();
    onUpdatedRemoveMock.mockReset();
    tabsCreateMock.mockResolvedValue({ id: 42 });
    tabsGetMock.mockResolvedValue({
      id: 42,
      status: "complete",
      url: LOGOUT_LANDING_URL,
    });
    tabsUpdateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates a blank tab, updates to logout URL, waits, then opens target", async () => {
    await expect(openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL)).resolves.toBe(42);
    expect(tabsCreateMock).toHaveBeenCalledWith({ active: true });
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(1, 42, { url: OAA_RUI_LOGOUT_URL });
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(2, 42, { url: CUNY_LOGIN_ENTRY_URL });
  });

  test("returns null when tabs.create throws", async () => {
    tabsCreateMock.mockRejectedValueOnce(new Error("no permission"));
    await expect(openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL)).resolves.toBeNull();
    expect(tabsUpdateMock).not.toHaveBeenCalled();
  });

  test("opens fixture targets directly without OAA logout (e2e)", async () => {
    const fixtureUrl = "http://127.0.0.1:4173/oam/server/obrareq.cgi";
    await expect(openTabAfterOaaLogout(fixtureUrl)).resolves.toBe(42);
    expect(tabsCreateMock).toHaveBeenCalledWith({ url: fixtureUrl, active: true });
    expect(tabsUpdateMock).not.toHaveBeenCalled();
  });

  test("still navigates to target when Logout.jsp wait times out", async () => {
    tabsGetMock.mockResolvedValue({ id: 42, status: "loading", url: "chrome://newtab/" });
    onUpdatedAddMock.mockImplementation(() => undefined);
    const pending = openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toBe(42);
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(1, 42, { url: OAA_RUI_LOGOUT_URL });
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(2, 42, { url: CUNY_LOGIN_ENTRY_URL });
  });
});

describe("openTabAfterOaaLogout — pre-auth onboarding regression", () => {
  type TabUpdatedListener = (
    tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: { url?: string; status?: string }
  ) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    tabsCreateMock.mockReset();
    tabsUpdateMock.mockReset();
    tabsGetMock.mockReset();
    onUpdatedAddMock.mockReset();
    onUpdatedRemoveMock.mockReset();
    tabsCreateMock.mockResolvedValue({ id: 42 });
    tabsUpdateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("never tabs.create with logout or entry URL (blank tab + update only)", async () => {
    tabsGetMock.mockResolvedValue({
      id: 42,
      status: "complete",
      url: LOGOUT_LANDING_URL,
    });
    await openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL);
    expect(tabsCreateMock).toHaveBeenCalledTimes(1);
    expect(tabsCreateMock).toHaveBeenCalledWith({ active: true });
    for (const call of tabsCreateMock.mock.calls) {
      const options = call[0] as { url?: string };
      expect(options.url).toBeUndefined();
    }
  });

  test("ignores chrome://newtab complete before Logout.jsp (May 2026 skip-login bug)", async () => {
    tabsGetMock.mockResolvedValue({ id: 42, status: "loading", url: "chrome://newtab/" });
    let capturedListener: TabUpdatedListener | undefined;
    onUpdatedAddMock.mockImplementation((listener: TabUpdatedListener) => {
      capturedListener = listener;
    });

    const pending = openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL);
    await Promise.resolve();
    await Promise.resolve();

    expect(tabsUpdateMock).toHaveBeenCalledTimes(1);
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(1, 42, { url: OAA_RUI_LOGOUT_URL });

    capturedListener?.(42, { status: "complete" }, { url: "chrome://newtab/" });
    await Promise.resolve();
    expect(tabsUpdateMock).toHaveBeenCalledTimes(1);

    capturedListener?.(42, { status: "complete", url: LOGOUT_LANDING_URL }, {});
    await expect(pending).resolves.toBe(42);
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(2, 42, { url: CUNY_LOGIN_ENTRY_URL });
  });

  test("does not navigate to entry when only status complete without Logout.jsp URL", async () => {
    tabsGetMock.mockResolvedValue({ id: 42, status: "loading", url: "chrome://newtab/" });
    let capturedListener: TabUpdatedListener | undefined;
    onUpdatedAddMock.mockImplementation((listener: TabUpdatedListener) => {
      capturedListener = listener;
    });

    const pending = openTabAfterOaaLogout(CUNY_LOGIN_ENTRY_URL);
    await Promise.resolve();
    await Promise.resolve();

    capturedListener?.(42, { status: "complete" }, { url: `${SSO_LOGIN_ORIGIN}/oaa/rui` });
    await Promise.resolve();
    expect(tabsUpdateMock).toHaveBeenCalledTimes(1);

    capturedListener?.(42, { status: "complete", url: LOGOUT_LANDING_URL }, {});
    await expect(pending).resolves.toBe(42);
    expect(tabsUpdateMock).toHaveBeenNthCalledWith(2, 42, { url: CUNY_LOGIN_ENTRY_URL });
  });
});
