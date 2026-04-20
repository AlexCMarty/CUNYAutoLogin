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
import {
  hasOnboardingMessageType,
  isOnboardingMessage,
  type AutoFillResponse,
  type OnboardingAck,
} from "../onboarding/messages";

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

/**
 * Narrowed onboarding handler. Validates every onboarding message against
 * the shared guards in `src/onboarding/messages.ts` before acknowledging.
 *
 * Plan-03 contract:
 * - Well-formed onboarding messages resolve `{ ok: true }`.
 * - Malformed onboarding messages (correct discriminator, bad payload)
 *   resolve `{ ok: false, reason: "invalid_payload" }` — no state mutation.
 * - Unknown types are handled by the outer listener, which falls through to
 *   `undefined` (default-reject).
 *
 * Concrete side-effectful behavior (forwarding overlay commands to the active
 * CUNY tab, pushing verify-status updates to the sidebar, etc.) lands in
 * plan-06 onward; today the handler only enforces the typed protocol.
 */
const handleOnboardingMessage = (message: unknown): Promise<OnboardingAck> => {
  if (!isOnboardingMessage(message)) {
    return Promise.resolve({ ok: false, reason: "invalid_payload" });
  }
  return Promise.resolve({ ok: true });
};

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

  if (hasOnboardingMessageType(message)) {
    return handleOnboardingMessage(message);
  }

  if (m.type !== "AUTO_FILL_REQUEST") {
    return;
  }

  return (async (): Promise<AutoFillResponse> => {
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
      const decResult = await decryptVault(raw, masterPassword);
      return decResult.match<AutoFillResponse>(
        (payload) => ({ success: true, payload }),
        () => ({ success: false, reason: "decrypt_error" })
      );
    } catch {
      return { success: false, reason: "decrypt_error" };
    }
  })();
});
