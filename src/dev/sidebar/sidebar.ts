import browser from "webextension-polyfill";
import { VAULT_STORAGE_KEY } from "../../crypto/vault";
import { SESSION_MASTER_KEY } from "../../cuny/ssoSite";
import { loadVaultSessionSnapshot } from "../../vaultSession/snapshot";

const el = document.getElementById("vault-state");

function labelForMode(mode: "setup" | "locked" | "unlocked"): string {
  if (mode === "setup") return "Onboarding";
  if (mode === "locked") return "Locked";
  return "Unlocked";
}

async function refresh(): Promise<void> {
  if (!el) return;
  const snap = await loadVaultSessionSnapshot();
  el.textContent = labelForMode(snap.mode);
}

function watchStorage(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[VAULT_STORAGE_KEY] !== undefined) {
      void refresh();
      return;
    }
    if (areaName === "session" && changes[SESSION_MASTER_KEY] !== undefined) {
      void refresh();
    }
  });
}

void refresh();
watchStorage();
