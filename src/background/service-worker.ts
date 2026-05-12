import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
} from "../crypto/vault";
import {
  BRIGHTSPACE_HOME_URL,
  CUNY_LOGIN_ENTRY_URL,
  ENROLLED_FACTOR_ALIAS_SESSION_KEY,
  OAA_RUI_LOGOUT_URL,
  PENDING_TOTP_SECRET_SESSION_KEY,
  SESSION_MASTER_KEY,
  SSO_LOGIN_TABS_QUERY_URL_PATTERN,
  isAllowedReopenCunyTabUrl,
  isBrightspaceUrl,
  isTrustedContentScriptMessageHostname,
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
  type EnrolledAliasFromPage,
  type OnboardingAck,
  type OnboardingCredentialsAck,
  type OnboardingOverlayCommand,
} from "../onboarding/messages";
import { guardedRoute, routeByType, type RouteTable } from "../runtime/messageRouter";

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

const clearBrightspaceSessionCookies = async (): Promise<void> => {
  const cookieNames = ["d2lSessionVal", "d2lSecureSessionVal"] as const;
  for (const cookieName of cookieNames) {
    try {
      await browser.cookies.remove({
        name: cookieName,
        url: BRIGHTSPACE_HOME_URL,
      });
    } catch {
      // Keep logout best-effort if one cookie is already missing.
    }
  }
};

const logOutOaaRuiInTabs = async (): Promise<void> => {
  const ssoTabs = await browser.tabs.query({ url: [SSO_LOGIN_TABS_QUERY_URL_PATTERN] });
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
 * worker. Supplements tab navigation when no SSO login host tab is open.
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
 * Frame URL for the message sender: extension pages set `sender.url` to a
 * `chrome-extension:` (or `moz-extension:`) URL; content scripts set it to the
 * page URL. When `sender.url` is missing, fall back to `sender.tab.url` — the
 * sidebar can still have a `tab` handle even though it is not a web-page script.
 */
const resolvedSenderFrameUrl = (sender: browser.Runtime.MessageSender): string | null => {
  if (typeof sender.url === "string" && sender.url.length > 0) {
    return sender.url;
  }
  const tabUrl = sender.tab?.url;
  if (typeof tabUrl === "string" && tabUrl.length > 0) {
    return tabUrl;
  }
  return null;
};

const senderIsPrivilegedExtensionUi = (sender: browser.Runtime.MessageSender): boolean => {
  const resolved = resolvedSenderFrameUrl(sender);
  if (resolved === null) {
    return sender.tab === undefined;
  }
  return (
    resolved.startsWith("chrome-extension://") ||
    resolved.startsWith("moz-extension://") ||
    resolved.startsWith("safari-web-extension://")
  );
};

/** Content scripts on SSO or local E2E fixture origins (never extension pages). */
const senderIsTrustedContentScript = (sender: browser.Runtime.MessageSender): boolean => {
  const resolved = resolvedSenderFrameUrl(sender);
  if (resolved === null) {
    return false;
  }
  if (
    resolved.startsWith("chrome-extension://") ||
    resolved.startsWith("moz-extension://") ||
    resolved.startsWith("safari-web-extension://")
  ) {
    return false;
  }
  try {
    return isTrustedContentScriptMessageHostname(new URL(resolved).hostname);
  } catch {
    return false;
  }
};

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
 * Sender rules: overlay + reopen tab are accepted only from extension UI
 * (`chrome-extension:` / `moz-extension:` / `safari-web-extension:` frame URLs,
 * including when `sender.tab` is present). All other onboarding signals are
 * accepted only from trusted web origins on the content-script path.
 * `ONBOARDING_REOPEN_CUNY_TAB` URLs are allow-listed to CUNY HTTPS hosts before `tabs.create`.
 */
const handleOnboardingMessage = async (
  message: unknown,
  sender: browser.Runtime.MessageSender
): Promise<OnboardingAck> => {
  if (!isOnboardingMessage(message)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const extensionOnlyOnboarding =
    message.type === "ONBOARDING_OVERLAY_COMMAND" ||
    message.type === "ONBOARDING_REOPEN_CUNY_TAB";
  if (extensionOnlyOnboarding) {
    if (!senderIsPrivilegedExtensionUi(sender)) {
      return { ok: false, reason: "invalid_payload" };
    }
  } else if (!senderIsTrustedContentScript(sender)) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (isOnboardingReopenCunyTab(message)) {
    const raw = message.url?.trim();
    const resolvedUrl =
      raw && raw.length > 0
        ? isAllowedReopenCunyTabUrl(raw)
          ? raw
          : null
        : CUNY_LOGIN_ENTRY_URL;
    if (resolvedUrl === null) {
      return { ok: false, reason: "invalid_payload" };
    }
    await terminateOaaRuiSessions();
    if (isBrightspaceUrl(resolvedUrl)) {
      await clearBrightspaceSessionCookies();
    }
    try {
      await browser.tabs.create({ url: resolvedUrl, active: true });
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
    // Staged credentials are only for the pre-vault onboarding flow. If a vault
    // already exists the user has locked it — staged creds must not bypass the
    // lock. Read storage.local here (master was absent, so we skipped it above).
    let stagedLocalResult: Record<string, unknown>;
    try {
      stagedLocalResult = await browser.storage.local.get(VAULT_STORAGE_KEY);
    } catch {
      return { success: false, reason: "storage_error" };
    }
    if (!isStoredVault(stagedLocalResult[VAULT_STORAGE_KEY])) {
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
  }

  if (typeof masterPassword !== "string") {
    return { success: false, reason: "no_session_master" };
  }
  return { success: false, reason: "no_vault" };
};

const handleTotpSecretFromPageMessage = async (
  sender: browser.Runtime.MessageSender,
  typedMessage: Record<string, unknown>
): Promise<{ ok: boolean }> => {
  if (!senderIsTrustedContentScript(sender)) {
    return { ok: false };
  }
  const secret = typedMessage.secret;
  if (typeof secret !== "string" || !secret.length) {
    return { ok: false };
  }
  const normalized = normalizeTotpSecretCandidate(secret);
  if (!normalized) {
    return { ok: false };
  }
  try {
    await browser.storage.session?.set({
      [PENDING_TOTP_SECRET_SESSION_KEY]: normalized,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
};

const handleEnrolledAliasFromPageMessage = async (
  sender: browser.Runtime.MessageSender,
  typedMessage: EnrolledAliasFromPage
): Promise<{ ok: boolean }> => {
  if (!senderIsTrustedContentScript(sender)) {
    return { ok: false };
  }
  const alias = typedMessage.alias;
  if (typeof alias !== "string" || !alias.length) {
    return { ok: false };
  }
  try {
    await browser.storage.session?.set({
      [ENROLLED_FACTOR_ALIAS_SESSION_KEY]: alias,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
};

const coreMessageRoutes = (
  sender: browser.Runtime.MessageSender,
  message: unknown
): RouteTable => ({
  TOTP_SECRET_FROM_PAGE: (typedMessage) =>
    handleTotpSecretFromPageMessage(sender, typedMessage),
  ENROLLED_ALIAS_FROM_PAGE: (typedMessage) =>
    handleEnrolledAliasFromPageMessage(sender, typedMessage as EnrolledAliasFromPage),
  ONBOARDING_CONTENT_SCRIPT_READY: () =>
    Promise.resolve({
      overlayCommand:
        senderIsTrustedContentScript(sender) && stagedOverlayCommand !== null
          ? stagedOverlayCommand
          : null,
    }),
  STAGE_ONBOARDING_CREDENTIALS: () =>
    Promise.resolve(
      !senderIsPrivilegedExtensionUi(sender)
        ? ({ ok: false as const } satisfies OnboardingCredentialsAck)
        : guardedRoute(
            message,
            isStageOnboardingCredentials,
            (validMessage) => handleStageOnboardingCredentials(validMessage),
            () => ({ ok: false as const })
          )
    ),
  CLEAR_ONBOARDING_CREDENTIALS: () =>
    Promise.resolve(
      !senderIsPrivilegedExtensionUi(sender)
        ? ({ ok: false as const } satisfies OnboardingCredentialsAck)
        : guardedRoute(
            message,
            isClearOnboardingCredentials,
            (validMessage) => handleClearOnboardingCredentials(validMessage),
            () => ({ ok: false as const })
          )
    ),
  LOGOUT_CUNY_SESSIONS: () =>
    (async () => {
      if (!senderIsPrivilegedExtensionUi(sender)) {
        return { ok: false as const };
      }
      if (!isLogoutCunySessionsRequest(message)) {
        return { ok: false as const };
      }
      await terminateOaaRuiSessions();
      return { ok: true as const };
    })(),
  AUTO_FILL_REQUEST: (typedMessage) =>
    senderIsTrustedContentScript(sender)
      ? resolveAutoFillResponse(normalizeAutoFillOtpContext(typedMessage.otpContext))
      : Promise.resolve({ success: false, reason: "invalid_sender" } as const),
});

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.Runtime.MessageSender) => {
    // Reject messages from other extensions or web pages. Optional chaining
    // degrades gracefully in unit tests that supply a partial sender object.
    if (sender?.id !== browser.runtime.id) return;

    const routed = routeByType(message, coreMessageRoutes(sender, message));
    if (routed !== undefined) {
      return routed;
    }

    if (hasOnboardingMessageType(message)) {
      return handleOnboardingMessage(message, sender);
    }

    return;
  }
);
