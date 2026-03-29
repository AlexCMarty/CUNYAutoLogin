import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  console.log("[CUNY SSO Helper] installed/updated:", details.reason);
});
