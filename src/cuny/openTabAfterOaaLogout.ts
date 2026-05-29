import browser from "webextension-polyfill";
import {
  OAA_LOGOUT_COMPLETE_PATH_MARKER,
  OAA_RUI_LOGOUT_URL,
  requiresOaaLogoutBeforeNavigation,
} from "./ssoSite";

/** Max wait for the logout navigation before proceeding to the target URL. */
const OAA_LOGOUT_TAB_LOAD_TIMEOUT_MS = 15_000;

const tabUrlIndicatesLogoutComplete = (url: string | undefined): boolean => {
  if (typeof url !== "string" || url.length === 0) return false;
  return url.includes(OAA_LOGOUT_COMPLETE_PATH_MARKER);
};

/**
 * Resolves when `tabId` finishes loading {@link OAA_LOGOUT_COMPLETE_PATH_MARKER}.
 * Ignores spurious early `complete` events on chrome:// or about: pages that
 * caused Screen 4 to race ahead to `/oaa/rui` while the OAA session was live.
 */
export const waitForTabLogoutLanding = (
  tabId: number,
  timeoutMs: number = OAA_LOGOUT_TAB_LOAD_TIMEOUT_MS
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };

    const finishResolve = (): void => {
      cleanup();
      resolve();
    };

    const finishReject = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const consider = (url: string | undefined, status: string | undefined): void => {
      if (status === "complete" && tabUrlIndicatesLogoutComplete(url)) {
        finishResolve();
      }
    };

    const onUpdated = (
      updatedTabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      tab: browser.Tabs.Tab
    ): void => {
      if (updatedTabId !== tabId) return;
      const url = changeInfo.url ?? tab.url;
      const status = changeInfo.status ?? tab.status;
      consider(url, status);
    };

    const timeoutId = setTimeout(() => {
      finishReject(new Error("logout_landing_timeout"));
    }, timeoutMs);

    browser.tabs.onUpdated.addListener(onUpdated);

    void (async (): Promise<void> => {
      try {
        const tab = await browser.tabs.get(tabId);
        if (settled) return;
        consider(tab.url, tab.status);
      } catch {
        // wait for onUpdated or timeout
      }
    })();
  });

/**
 * Opens a tab, navigates it to the OAA server-side logout URL via
 * `browser.tabs.update` (same shape as the dev-panel logout path), waits for
 * `Logout.jsp`, then navigates the same tab to `targetUrl`.
 *
 * @returns Tab id on success, or `null` if tab creation/navigation failed.
 */
export const openTabAfterOaaLogout = async (targetUrl: string): Promise<number | null> => {
  if (!requiresOaaLogoutBeforeNavigation(targetUrl)) {
    try {
      const tab = await browser.tabs.create({ url: targetUrl, active: true });
      const tabId = tab.id;
      return typeof tabId === "number" ? tabId : null;
    } catch {
      return null;
    }
  }

  let createdTab: browser.Tabs.Tab;
  try {
    // Create an empty tab first; logout is applied via tabs.update so Chrome
    // follows the full redirect chain to Logout.jsp (create+url can complete
    // before the server-side session is actually terminated).
    createdTab = await browser.tabs.create({ active: true });
  } catch {
    return null;
  }

  const tabId = createdTab.id;
  if (typeof tabId !== "number") {
    return null;
  }

  try {
    await browser.tabs.update(tabId, { url: OAA_RUI_LOGOUT_URL });
  } catch {
    return null;
  }

  try {
    await waitForTabLogoutLanding(tabId);
  } catch {
    // Timed out waiting for Logout.jsp — still attempt the entry navigation.
  }

  try {
    await browser.tabs.update(tabId, { url: targetUrl });
    return tabId;
  } catch {
    return null;
  }
};
