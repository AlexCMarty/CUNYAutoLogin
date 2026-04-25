/**
 * Shared runtime-message wire contract for sidebar ↔ background ↔ content.
 *
 * Two layers of messages are defined here:
 *
 * 1. **Core** (already in production): `AUTO_FILL_REQUEST` and `TOTP_SECRET_FROM_PAGE`.
 *    These power the existing setup/locked/unlocked vault flow and MUST NOT
 *    change their wire shape — plan-03 only codifies them as named types so
 *    the content script and service worker stop duplicating inline unions.
 *
 * 2. **Onboarding** (new in plan-03): six discriminated messages enumerated
 *    by `engineering-scope-onboarding-overhaul.md §5.2`. Every onboarding
 *    message is validated by a runtime guard; the service worker default-
 *    rejects anything that isn't a recognised (type, payload) pair.
 *
 * Type narrowing rules:
 * - The `type` field is the single discriminant.
 * - Guards never `throw` — they return a boolean. Callers decide what to do.
 * - Optional fields must be absent or of the declared type; no `any` leaks.
 *
 * Security:
 * - No credential payload is ever embedded in an *onboarding* message. Stage
 *   detection, culprit hints, overlay commands, verify status, and tab
 *   reattachment signals are metadata-only.
 */

import type { VaultPayload } from "../crypto/vault";

// ──── core messages (existing, now named) ────────────────────────────────────

export type AutoFillRequest = {
  readonly type: "AUTO_FILL_REQUEST";
  /**
   * Optional caller hint for which OTP context is being filled.
   * - login_totp: /oaa-totp-factor (existing factor challenge)
   * - enroll_verify: /oaa/rui/... otp|input (new-factor verification)
   */
  readonly otpContext?: "login_totp" | "enroll_verify";
};

export type AutoFillResponse =
  | { readonly success: true; readonly payload: VaultPayload }
  | {
      readonly success: false;
      readonly reason: "no_session_master" | "no_vault" | "decrypt_error";
    };

export type TotpSecretFromPage = {
  readonly type: "TOTP_SECRET_FROM_PAGE";
  readonly secret: string;
};

export type TotpSecretFromPageAck = { readonly ok: boolean };

/**
 * Sidebar → service-worker: stage the in-memory onboarding credentials so the
 * content script can auto-fill them on the CUNY tab opened by Screen 4. The
 * service worker holds the payload in a module-level variable and NEVER writes
 * it to `storage.*`. The payload is cleared when the sidebar tears down (or
 * the service worker stops, which is equivalent).
 *
 * This is a *core* message — not an onboarding protocol message — because:
 *   1. it carries secret material (email + password), and grouping it with
 *      metadata-only onboarding messages would muddy plan-03's "no credential
 *      payload in onboarding messages" contract.
 *   2. it is consumed by the `AUTO_FILL_REQUEST` path the content script
 *      already uses, not by the onboarding protocol default-reject router.
 */
export type StageOnboardingCredentials = {
  readonly type: "STAGE_ONBOARDING_CREDENTIALS";
  readonly email: string;
  readonly password: string;
};

/** Sidebar → service-worker: drop any staged onboarding credentials. */
export type ClearOnboardingCredentials = {
  readonly type: "CLEAR_ONBOARDING_CREDENTIALS";
};

export type OnboardingCredentialsAck = { readonly ok: boolean };

export const isStageOnboardingCredentials = (
  value: unknown
): value is StageOnboardingCredentials => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "STAGE_ONBOARDING_CREDENTIALS" &&
    typeof v.email === "string" &&
    typeof v.password === "string"
  );
};

export const isClearOnboardingCredentials = (
  value: unknown
): value is ClearOnboardingCredentials => {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>).type === "CLEAR_ONBOARDING_CREDENTIALS";
};

// ──── plan-06: target spec types (shared with content/overlay.ts) ────────────

/** Click a CUNY element via CSS selector (works for most elements). */
export type CssTarget = { readonly type: "css"; readonly selector: string };

/**
 * Click a CUNY element via accessibility-tree text match. Required for
 * oj-option items inside Oracle JET menus, which have display:none even when
 * the menu is visually open — they cannot be clicked via CSS selector.
 */
export type A11yTarget = { readonly type: "a11y"; readonly text: string };

/** Union of the two click patterns the overlay engine supports. */
export type TargetSpec = CssTarget | A11yTarget;

// ──── onboarding wire values ─────────────────────────────────────────────────

/** Recognised CUNY-side page stages the content script can announce. */
export const ONBOARDING_PAGE_STAGES = [
  "credential_page",
  "allow_gate",
  "allow_button_clicked",
  "oaa_spa_home",
  "factors_list",
  "add_factor",
  "factor_type_select",
  "totp_enroll_secret",
  "totp_enroll_verify",
  "factors_list_after_enroll",
  "set_default_menu_opened",
  "set_default_confirmed",
  "unverified_cunyautologin",
  "totp_factor_limit",
  "access_denied",
  "target_not_found",
] as const;
export type OnboardingPageStage = (typeof ONBOARDING_PAGE_STAGES)[number];

/** Hint from the content script about which field likely failed auth. */
export const CREDENTIAL_CULPRITS = ["email", "password", "unknown"] as const;
export type CredentialCulprit = (typeof CREDENTIAL_CULPRITS)[number];

export const OVERLAY_ACTIONS = ["show", "update", "hide"] as const;
export type OverlayAction = (typeof OVERLAY_ACTIONS)[number];

export const VERIFY_STATUSES = [
  "pending",
  "success",
  "first_failure",
  "second_failure",
] as const;
export type VerifyStatus = (typeof VERIFY_STATUSES)[number];

// ──── onboarding message shapes ──────────────────────────────────────────────

export type OnboardingStageDetected = {
  readonly type: "ONBOARDING_STAGE_DETECTED";
  readonly stage: OnboardingPageStage;
};

export type OnboardingCredentialError = {
  readonly type: "ONBOARDING_CREDENTIAL_ERROR";
  readonly culprit: CredentialCulprit;
};

export type OnboardingOverlayCommand = {
  readonly type: "ONBOARDING_OVERLAY_COMMAND";
  readonly action: OverlayAction;
  /** CSS selector hint (legacy; prefer targetSpec for new commands). */
  readonly target?: string;
  /** Typed target spec — supports css and a11y click patterns (plan-06). */
  readonly targetSpec?: TargetSpec;
  readonly tooltipText?: string;
  readonly stepIndex?: number;
  readonly stepTotal?: number;
};

export type OnboardingVerifyStatus = {
  readonly type: "ONBOARDING_VERIFY_STATUS";
  readonly status: VerifyStatus;
};

export type OnboardingReopenCunyTab = {
  readonly type: "ONBOARDING_REOPEN_CUNY_TAB";
  readonly url?: string;
};

export type OnboardingTabReattached = {
  readonly type: "ONBOARDING_TAB_REATTACHED";
  readonly tabId: number;
};

export type OnboardingMessage =
  | OnboardingStageDetected
  | OnboardingCredentialError
  | OnboardingOverlayCommand
  | OnboardingVerifyStatus
  | OnboardingReopenCunyTab
  | OnboardingTabReattached;

export const ONBOARDING_MESSAGE_TYPES = [
  "ONBOARDING_STAGE_DETECTED",
  "ONBOARDING_CREDENTIAL_ERROR",
  "ONBOARDING_OVERLAY_COMMAND",
  "ONBOARDING_VERIFY_STATUS",
  "ONBOARDING_REOPEN_CUNY_TAB",
  "ONBOARDING_TAB_REATTACHED",
] as const;
export type OnboardingMessageType = (typeof ONBOARDING_MESSAGE_TYPES)[number];

// ──── ack shape (default-reject contract) ────────────────────────────────────

export type OnboardingRejectReason =
  | "invalid_payload"
  | "unknown_type"
  | "forward_failed";

export type OnboardingAck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: OnboardingRejectReason };

// ──── low-level helpers ──────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTargetSpec = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (value.type === "css") return typeof value.selector === "string";
  if (value.type === "a11y") return typeof value.text === "string";
  return false;
};

const isOneOf = <T extends readonly string[]>(
  value: unknown,
  allowed: T
): value is T[number] =>
  typeof value === "string" && (allowed as readonly string[]).includes(value);

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

const isOptionalNonNegativeInt = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "number" && Number.isInteger(value) && value >= 0);

// ──── per-type guards ────────────────────────────────────────────────────────

export const isOnboardingStageDetected = (
  value: unknown
): value is OnboardingStageDetected => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_STAGE_DETECTED") return false;
  return isOneOf(value.stage, ONBOARDING_PAGE_STAGES);
};

export const isOnboardingCredentialError = (
  value: unknown
): value is OnboardingCredentialError => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_CREDENTIAL_ERROR") return false;
  return isOneOf(value.culprit, CREDENTIAL_CULPRITS);
};

export const isOnboardingOverlayCommand = (
  value: unknown
): value is OnboardingOverlayCommand => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_OVERLAY_COMMAND") return false;
  if (!isOneOf(value.action, OVERLAY_ACTIONS)) return false;
  if (!isOptionalString(value.target)) return false;
  if (value.targetSpec !== undefined && !isTargetSpec(value.targetSpec)) return false;
  if (!isOptionalString(value.tooltipText)) return false;
  if (!isOptionalNonNegativeInt(value.stepIndex)) return false;
  if (!isOptionalNonNegativeInt(value.stepTotal)) return false;
  return true;
};

export const isOnboardingVerifyStatus = (
  value: unknown
): value is OnboardingVerifyStatus => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_VERIFY_STATUS") return false;
  return isOneOf(value.status, VERIFY_STATUSES);
};

export const isOnboardingReopenCunyTab = (
  value: unknown
): value is OnboardingReopenCunyTab => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_REOPEN_CUNY_TAB") return false;
  return isOptionalString(value.url);
};

export const isOnboardingTabReattached = (
  value: unknown
): value is OnboardingTabReattached => {
  if (!isRecord(value)) return false;
  if (value.type !== "ONBOARDING_TAB_REATTACHED") return false;
  return typeof value.tabId === "number" && Number.isInteger(value.tabId);
};

/**
 * Returns true iff `value` is a well-formed onboarding message with a known
 * `type` discriminator AND all payload fields match their declared shape.
 * This is the gate the service worker uses before accepting any onboarding
 * message — anything else is rejected with `{ ok: false, reason: … }`.
 */
export const isOnboardingMessage = (
  value: unknown
): value is OnboardingMessage => {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (typeof type !== "string") return false;
  if (!(ONBOARDING_MESSAGE_TYPES as readonly string[]).includes(type)) return false;

  switch (type as OnboardingMessageType) {
    case "ONBOARDING_STAGE_DETECTED":
      return isOnboardingStageDetected(value);
    case "ONBOARDING_CREDENTIAL_ERROR":
      return isOnboardingCredentialError(value);
    case "ONBOARDING_OVERLAY_COMMAND":
      return isOnboardingOverlayCommand(value);
    case "ONBOARDING_VERIFY_STATUS":
      return isOnboardingVerifyStatus(value);
    case "ONBOARDING_REOPEN_CUNY_TAB":
      return isOnboardingReopenCunyTab(value);
    case "ONBOARDING_TAB_REATTACHED":
      return isOnboardingTabReattached(value);
  }
};

/**
 * True iff `value` *claims* to be an onboarding message by having an
 * `ONBOARDING_*` `type` field, regardless of whether the payload is valid.
 * Used by routers to decide which ack path (validation-error vs. unknown)
 * should be returned.
 */
export const hasOnboardingMessageType = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (typeof type !== "string") return false;
  return (ONBOARDING_MESSAGE_TYPES as readonly string[]).includes(type);
};
