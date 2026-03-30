import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
} from "../crypto/vault";

const SESSION_MASTER_KEY = "cunySessionMaster";

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  console.log("[CUNY SSO Helper] installed/updated:", details.reason);
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as Record<string, unknown>).type !== "AUTO_FILL_REQUEST"
  ) return;

  return (async () => {
    try {
      const sessionResult = await browser.storage.session?.get(SESSION_MASTER_KEY);
      const masterPassword = sessionResult?.[SESSION_MASTER_KEY];
      if (typeof masterPassword !== "string") {
        return { success: false, reason: "no_session_master" };
      }
      const localResult = await browser.storage.local.get(VAULT_STORAGE_KEY);
      const raw = localResult[VAULT_STORAGE_KEY];
      if (!isStoredVault(raw)) {
        return { success: false, reason: "no_vault" };
      }
      const payload = await decryptVault(raw, masterPassword);
      return { success: true, payload };
    } catch {
      return { success: false, reason: "decrypt_error" };
    }
  })();
});
