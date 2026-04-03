import browser from "webextension-polyfill";
import { ResultAsync } from "neverthrow";
import type { VaultPayload } from "../crypto/vault";
import { SSO_LOGIN_HOST } from "../cuny/ssoSite";
import type { PopupDom } from "./popup";

export interface DebugPanelDeps {
  els: PopupDom;
  setStatus: (message: string, ok?: boolean) => void;
  getSessionPayload: () => VaultPayload | null;
  onClearVault: () => void;
}

export function mountDebugPanel(deps: DebugPanelDeps): void {
  const section = document.createElement("section");
  section.className = "dev-test";
  section.setAttribute("aria-label", "Development test");

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.id = "test-message-btn";
  testBtn.className = "secondary";
  testBtn.textContent = "Send test FILL_CREDENTIALS to active tab";

  const clearVaultBtn = document.createElement("button");
  clearVaultBtn.type = "button";
  clearVaultBtn.id = "clear-vault-debug-btn";
  clearVaultBtn.className = "secondary";
  clearVaultBtn.textContent = "Clear vault — debug (reset like fresh install)";

  section.append(testBtn, clearVaultBtn);
  deps.els.form.parentElement?.appendChild(section);

  testBtn.addEventListener("click", async () => {
    const sessionPayload = deps.getSessionPayload();
    if (!sessionPayload) {
      deps.setStatus("Vault is locked. Unlock it first.");
      return;
    }
    const tabsResult = await ResultAsync.fromPromise(
      browser.tabs.query({ active: true, currentWindow: true }),
      () => "tabs_query_failed" as const
    );
    if (tabsResult.isErr()) {
      deps.setStatus("No active tab.");
      return;
    }
    const tabId = tabsResult.value[0]?.id;
    if (tabId === undefined) {
      deps.setStatus("No active tab.");
      return;
    }
    const sendResult = await ResultAsync.fromPromise(
      browser.tabs.sendMessage(tabId, {
        type: "FILL_CREDENTIALS" as const,
        payload: sessionPayload,
      }),
      () => "send_failed" as const
    );
    if (sendResult.isErr()) {
      deps.setStatus(
        `Could not send message (open ${SSO_LOGIN_HOST} in the active tab?).`
      );
      return;
    }
    deps.setStatus("Filling…", true);
  });

  clearVaultBtn.addEventListener("click", () => {
    if (
      !window.confirm(
        "Clear the encrypted vault and all session data? This cannot be undone (debug only)."
      )
    ) {
      return;
    }
    deps.onClearVault();
  });
}
