import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
} from "../crypto/vault";
import {
  PENDING_TOTP_SECRET_SESSION_KEY,
  SESSION_MASTER_KEY,
  normalizeTotpSecretCandidate,
} from "../cuny/ssoSite";

type SidePanelApi = {
  setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
};

type SidebarActionApi = {
  open: () => Promise<void>;
};

const maybeEnableSidePanelOnActionClick = async (): Promise<void> => {
  const sidePanelApi = (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
  if (!sidePanelApi) {
    return;
  }
  try {
    await sidePanelApi.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Side panel behavior is Chromium-only; ignore unsupported runtimes.
  }
};

const maybeEnableSidebarActionOnToolbarClick = (): void => {
  const sidebarActionApi = (browser as unknown as { sidebarAction?: SidebarActionApi })
    .sidebarAction;
  if (!sidebarActionApi?.open) {
    return;
  }

  browser.action.onClicked.addListener(() => {
    void sidebarActionApi.open();
  });
};

void maybeEnableSidePanelOnActionClick();
maybeEnableSidebarActionOnToolbarClick();

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  if (import.meta.env.DEV) {
    console.log("[CUNYAutoLogin] installed/updated:", details.reason);
  }
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null) {
    return;
  }
  const m = message as Record<string, unknown>;

  if (m.type === "TOTP_SECRET_FROM_PAGE") {
    return (async () => {
      const secret = m.secret;
      if (typeof secret !== "string" || !secret.length) {
        return { ok: false as const };
      }
      const normalized = normalizeTotpSecretCandidate(secret);
      if (!normalized) {
        return { ok: false as const };
      }
      try {
        await browser.storage.session?.set({
          [PENDING_TOTP_SECRET_SESSION_KEY]: normalized,
        });
        return { ok: true as const };
      } catch {
        return { ok: false as const };
      }
    })();
  }

  if (m.type !== "AUTO_FILL_REQUEST") {
    return;
  }

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
