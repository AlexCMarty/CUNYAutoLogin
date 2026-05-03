import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
} from "../crypto/vault";
import {
  CUNY_LOGIN_ENTRY_URL,
  OAA_RUI_LOGOUT_URL,
  PENDING_TOTP_SECRET_SESSION_KEY,
  SESSION_MASTER_KEY,
  normalizeTotpSecretCandidate,
} from "../cuny/ssoSite";
import {
  hasOnboardingMessageType,
  isClearOnboardingCredentials,
  isLogoutCunySessionsRequest,
  isOnboardingMessage,
  isOnboardingOverlayCommand,
  isOnboardingReopenCunyTab,
  isStageOnboardingCredentials,
  normalizeAutoFillOtpContext,
  type AutoFillResponse,
  type OnboardingAck,
  type OnboardingCredentialsAck,
  type OnboardingOverlayCommand,
} from "../onboarding/messages";
import { guardedRoute, routeByType } from "../runtime/messageRouter";

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
    void Promise.resolve(sidebarActionApi.open()).catch(() => undefined);
  });
};

void maybeEnableSidePanelOnActionClick();
maybeEnableSidebarActionOnToolbarClick();


browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[CUNYAutoLogin] installed/updated:", details.reason);
  }
});

/**
 * In-memory staging buffer for onboarding credentials.
 *
 * The sidebar sends `STAGE_ONBOARDING_CREDENTIALS { email, password }` when
 * OPENING_CUNY mounts. The content script's existing `AUTO_FILL_REQUEST` path
 * falls back to this buffer when the vault isn't set up yet (onboarding runs
 * pre-vault). The buffer lives only in this module scope — it is NEVER
 * written to `storage.local` or `storage.session`. It is cleared on:
 *   - explicit `CLEAR_ONBOARDING_CREDENTIALS` from the sidebar (unmount),
 *   - service-worker termination (implicit — the SW is ephemeral).
 *
 * Security invariant: if a real vault is present for the session master, the
 * AUTO_FILL handler prefers the vault. Onboarding staging is only used when
 * the vault hasn't been saved yet, so staged credentials never override real
 * vault contents.
 */
type StagedOnboardingCredentials = {
  readonly email: string;
  readonly password: string;
};
let stagedOnboardingCredentials: StagedOnboardingCredentials | null = null;

/**
 * Current pending overlay command. Stored when the sidebar sends
 * ONBOARDING_OVERLAY_COMMAND{action:"show"} and cleared on
 * ONBOARDING_OVERLAY_COMMAND{action:"hide"}. Content scripts pull this via
 * ONBOARDING_CONTENT_SCRIPT_READY when they load on a new CUNY page.
 */
let stagedOverlayCommand: OnboardingOverlayCommand | null = null;

const logOutOaaRuiInTabs = async (): Promise<void> => {
  const ssoTabs = await browser.tabs.query({ url: ["https://ssologin.cuny.edu/*"] });
  for (const ssoTab of ssoTabs) {
    if (typeof ssoTab.id !== "number") continue;
    try {
      await browser.tabs.update(ssoTab.id, { url: OAA_RUI_LOGOUT_URL });
    } catch {
      // Ignore tabs that cannot be navigated (e.g. already closed).
    }
  }
};

/**
 * Terminate the OAA server-side session via a direct fetch from the service
 * worker. Supplements tab navigation when no `ssologin.cuny.edu` tab is open.
 * Best-effort — a network failure does not block callers.
 */
const fetchLogOutOaaRui = async (): Promise<void> => {
  try {
    await fetch(OAA_RUI_LOGOUT_URL, { credentials: "include" });
  } catch {
    // Best-effort; proceed regardless.
  }
};

/** Navigate open SSO tabs to the OAA logout URL, then hit logout over fetch. */
const terminateOaaRuiSessions = async (): Promise<void> => {
  await logOutOaaRuiInTabs();
  await fetchLogOutOaaRui();
};

/** Exported only for tests; not part of any wire contract. */
export const __test_getStagedOverlayCommand = (): OnboardingOverlayCommand | null =>
  stagedOverlayCommand;

/** Exported only for tests; not part of any wire contract. */
export const __test_getStagedOnboardingCredentials = ():
  | StagedOnboardingCredentials
  | null => stagedOnboardingCredentials;

/**
 * Narrowed onboarding handler. Validates every onboarding message against
 * the shared guards in `src/onboarding/messages.ts` before acknowledging.
 *
 * Onboarding message contract:
 * - Well-formed onboarding messages resolve `{ ok: true }`.
 * - Malformed onboarding messages (correct discriminator, bad payload)
 *   resolve `{ ok: false, reason: "invalid_payload" }` — no state mutation.
 * - Unknown types are handled by the outer listener, which falls through to
 *   `undefined` (default-reject).
 *
 * Handles onboarding messages from the sidebar and content script. The
 * ONBOARDING_REOPEN_CUNY_TAB branch opens a tab at the provided URL (or the
 * default CUNY entry URL). Other onboarding messages are acknowledged only.
 */
const handleOnboardingMessage = async (
  message: unknown
): Promise<OnboardingAck> => {
  if (!isOnboardingMessage(message)) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (isOnboardingReopenCunyTab(message)) {
    const url = message.url ?? CUNY_LOGIN_ENTRY_URL;
    await terminateOaaRuiSessions();
    try {
      await browser.tabs.create({ url, active: true });
      return { ok: true };
    } catch {
      return { ok: false, reason: "forward_failed" };
    }
  }
  // Persist show commands so late-loading content scripts can pull them; clear on hide
  // so a stale overlay is not shown after the student leaves that step.
  if (isOnboardingOverlayCommand(message)) {
    if (message.action === "show") {
      stagedOverlayCommand = message;
    } else {
      stagedOverlayCommand = null;
    }
  }
  return { ok: true };
};

const handleStageOnboardingCredentials = (
  message: unknown
): OnboardingCredentialsAck => {
  if (!isStageOnboardingCredentials(message)) {
    return { ok: false };
  }
  stagedOnboardingCredentials = {
    email: message.email,
    password: message.password,
  };
  return { ok: true };
};

const handleClearOnboardingCredentials = (
  message: unknown
): OnboardingCredentialsAck => {
  if (!isClearOnboardingCredentials(message)) {
    return { ok: false };
  }
  stagedOnboardingCredentials = null;
  return { ok: true };
};

/**
 * Resolves the auto-fill response for the content script.
 *
 * Prefers the encrypted vault when a session master and valid vault are
 * present. Falls back to the in-memory onboarding staging buffer when the
 * vault hasn't been saved yet. The `otpContext` hint gates the pending-TOTP-
 * secret override so a freshly-scraped enroll secret only replaces the vault's
 * TOTP on `otp|input` (enroll_verify), never on the login challenge page
 * (login_totp).
 */
const resolveAutoFillResponse = async (
  otpContext: "login_totp" | "enroll_verify" | undefined
): Promise<AutoFillResponse> => {
  let sessionResult: Record<string, unknown> | undefined;
  try {
    sessionResult = await browser.storage.session?.get([
      SESSION_MASTER_KEY,
      PENDING_TOTP_SECRET_SESSION_KEY,
    ]);
  } catch {
    return { success: false, reason: "storage_error" };
  }

  const masterPassword = sessionResult?.[SESSION_MASTER_KEY];
  const pendingTotpSecret = sessionResult?.[PENDING_TOTP_SECRET_SESSION_KEY];
  // During mid-enrollment on `otp|input`, the freshly-scraped session
  // secret is authoritative. It must override any stale vault secret a
  // prior enrollment may have stored, otherwise the user types a code
  // from the old secret into the new factor's verify field. Gate on
  // `stagedOnboardingCredentials` so merely *viewing* an existing
  // factor's self-service page (vault set up, no onboarding in flight)
  // still returns the vault's authoritative secret.
  const enrollSecretOverride: string | null =
    otpContext === "enroll_verify" &&
    stagedOnboardingCredentials !== null &&
    typeof pendingTotpSecret === "string" &&
    pendingTotpSecret.length > 0
      ? pendingTotpSecret
      : null;

  if (typeof masterPassword === "string") {
    let localResult: Record<string, unknown>;
    try {
      localResult = await browser.storage.local.get(VAULT_STORAGE_KEY);
    } catch {
      return { success: false, reason: "storage_error" };
    }
    const raw = localResult[VAULT_STORAGE_KEY];
    if (isStoredVault(raw)) {
      const decResult = await decryptVault(raw, masterPassword);
      return decResult.match<AutoFillResponse>(
        (payload) => ({
          success: true,
          payload:
            enrollSecretOverride !== null
              ? { ...payload, totpSecret: enrollSecretOverride }
              : payload,
        }),
        () => ({ success: false, reason: "decrypt_error" })
      );
    }
  }

  if (stagedOnboardingCredentials) {
    return {
      success: true,
      payload: {
        email: stagedOnboardingCredentials.email,
        password: stagedOnboardingCredentials.password,
        // Login challenge (`otpValue|input`) must never consume the
        // staged enroll secret — only `otp|input` opts in via otpContext.
        totpSecret: enrollSecretOverride ?? "",
      },
    };
  }

  if (typeof masterPassword !== "string") {
    return { success: false, reason: "no_session_master" };
  }
  return { success: false, reason: "no_vault" };
};

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.Runtime.MessageSender) => {
    // Reject messages from other extensions or web pages. Optional chaining
    // degrades gracefully in unit tests that supply a partial sender object.
    if (sender?.id !== browser.runtime.id) return;

    const routed = routeByType(message, {
      TOTP_SECRET_FROM_PAGE: (typedMessage) =>
        (async () => {
          const secret = typedMessage.secret;
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
        })(),
      ONBOARDING_CONTENT_SCRIPT_READY: () =>
        // Poll response: no push channel, so the worker returns the last show command (or null).
        Promise.resolve({ overlayCommand: stagedOverlayCommand ?? null }),
      STAGE_ONBOARDING_CREDENTIALS: () =>
        Promise.resolve(
          guardedRoute(
            message,
            isStageOnboardingCredentials,
            (validMessage) => handleStageOnboardingCredentials(validMessage),
            () => ({ ok: false as const })
          )
        ),
      CLEAR_ONBOARDING_CREDENTIALS: () =>
        Promise.resolve(
          guardedRoute(
            message,
            isClearOnboardingCredentials,
            (validMessage) => handleClearOnboardingCredentials(validMessage),
            () => ({ ok: false as const })
          )
        ),
      LOGOUT_CUNY_SESSIONS: () =>
        (async () => {
          if (!isLogoutCunySessionsRequest(message)) {
            return { ok: false as const };
          }
          await terminateOaaRuiSessions();
          return { ok: true as const };
        })(),
      AUTO_FILL_REQUEST: (typedMessage) =>
        resolveAutoFillResponse(normalizeAutoFillOtpContext(typedMessage.otpContext)),
    });
    if (routed !== undefined) {
      return routed;
    }

    if (hasOnboardingMessageType(message)) {
      return handleOnboardingMessage(message);
    }

    return;
  }
);
