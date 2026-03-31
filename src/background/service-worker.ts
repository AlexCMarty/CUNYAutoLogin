import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
} from "../crypto/vault";

const SESSION_MASTER_KEY = "cunySessionMaster";

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  console.log("[CUNYAutoLogin] installed/updated:", details.reason);
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
        return { success: false, reason: "no_session_master" as const };
      }
      const localResult = await browser.storage.local.get(VAULT_STORAGE_KEY);
      const raw = localResult[VAULT_STORAGE_KEY];
      if (!isStoredVault(raw)) {
        return { success: false, reason: "no_vault" as const };
      }
      const decResult = await decryptVault(raw, masterPassword);
      return decResult.match(
        (payload) => ({ success: true as const, payload }),
        () => ({ success: false as const, reason: "decrypt_error" as const })
      );
    } catch {
      return { success: false as const, reason: "decrypt_error" as const };
    }
  })();
});
