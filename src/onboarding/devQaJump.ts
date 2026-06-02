/**
 * Dev/e2e-only: parse `sidebar.html` hash to jump straight to an onboarding
 * screen for visual QA. See extension-live-testing skill (Visual QA section).
 */

import { LOGIN_EMAIL_SUFFIX } from "../cuny/ssoSite";
import type { OnboardingControllerInit } from "./controller";
import { DEV_MODE_NAMES } from "./devModes";
import { SCREEN_MOUNTS } from "./screenMounts";
import {
  type CredentialCulprit,
  CREDENTIAL_CULPRITS,
} from "./messages";
import type { OnboardingState } from "./state";
import { isOnboardingState } from "./state";

export const QA_DEFAULT_EMAIL = `visual-qa${LOGIN_EMAIL_SUFFIX}`;
export const QA_DEFAULT_PASSWORD = "Dev-QA-password-seed-not-real";

const QA_HASH_PARAM = "qa";
const QA_EMAIL_PARAM = "qaEmail";
const QA_PASSWORD_PARAM = "qaPassword";
const QA_CRED_PARAM = "qaCred";
/** Free-form visual variant token (e.g. `open`, `valid`, `success`) — see `OnboardingScreenContext.qaVariant`. */
const QA_VARIANT_PARAM = "qaVariant";

/** States that have a real screen mount (excludes CREDENTIAL_ERROR placeholder). */
const QA_JUMPABLE_STATES = Object.keys(SCREEN_MOUNTS).filter(
  (key): key is OnboardingState =>
    isOnboardingState(key) && SCREEN_MOUNTS[key] !== undefined
);

const QA_JUMPABLE_SET: ReadonlySet<string> = new Set(QA_JUMPABLE_STATES);

const isCredentialCulprit = (value: string): value is CredentialCulprit =>
  (CREDENTIAL_CULPRITS as readonly string[]).includes(value);

export type DevQaJumpParseResult = {
  readonly controllerInit: OnboardingControllerInit;
  /** Optional visual variant token passed to the active screen (dev/QA only). */
  readonly qaVariant?: string;
};

/**
 * Pure parser for tests and for boot code. Returns null if `mode` is not dev/e2e,
 * if `hash` has no `qa` param, or if `qa` is not a jumpable screen id.
 */
export function parseDevQaOnboardingJumpFromHash(
  hash: string,
  mode: string
): DevQaJumpParseResult | null {
  if (!(DEV_MODE_NAMES as readonly string[]).includes(mode)) {
    return null;
  }
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  const rawState = params.get(QA_HASH_PARAM);
  if (rawState === null || rawState.length === 0) {
    return null;
  }
  const trimmed = rawState.trim();
  if (!isOnboardingState(trimmed)) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console -- onboarding QA URLs only (dev/e2e)
      console.warn(`[devQaJump] Ignoring unknown onboarding state "${rawState}".`);
    }
    return null;
  }
  if (!QA_JUMPABLE_SET.has(trimmed)) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console -- onboarding QA URLs only (dev/e2e)
      console.warn(
        `[devQaJump] State "${trimmed}" has no mounted screen — use qa=PASSWORD_ENTRY&qaCred=… for credential errors.`
      );
    }
    return null;
  }

  const qaEmail =
    params.get(QA_EMAIL_PARAM)?.trim() || QA_DEFAULT_EMAIL;
  const qaPassword =
    params.get(QA_PASSWORD_PARAM)?.trim() || QA_DEFAULT_PASSWORD;

  const qaCredRaw = params.get(QA_CRED_PARAM)?.trim().toLowerCase();
  let initialCredentialError: OnboardingControllerInit["initialCredentialError"];
  if (qaCredRaw !== undefined && qaCredRaw.length > 0) {
    if (!isCredentialCulprit(qaCredRaw)) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console -- onboarding QA URLs only (dev/e2e)
        console.warn(
          `[devQaJump] Ignoring invalid qaCred="${params.get(QA_CRED_PARAM)}" — use email or password.`
        );
      }
    } else {
      initialCredentialError = { culprit: qaCredRaw };
    }
  }

  const controllerInit: OnboardingControllerInit = {
    initialState: trimmed,
    initialEmail: qaEmail,
    initialPassword: qaPassword,
    initialCredentialError: initialCredentialError ?? null,
  };

  const qaVariant = params.get(QA_VARIANT_PARAM)?.trim() || undefined;

  return { controllerInit, qaVariant };
}

/**
 * Sidebar entry: reads `window.location.hash` when Vite mode is development/e2e.
 */
export function tryParseDevQaOnboardingJumpFromWindow(mode: string): DevQaJumpParseResult | null {
  if (typeof window === "undefined") {
    return null;
  }
  return parseDevQaOnboardingJumpFromHash(window.location.hash, mode);
}
