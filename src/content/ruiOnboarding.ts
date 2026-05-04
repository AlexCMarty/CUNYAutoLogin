/**
 * Oracle RUI (`/oaa/rui/*`) onboarding — stage posts, friendly-name fill, and
 * edge-case signals for the sidebar.
 */

import browser from "webextension-polyfill";
import { setInputValue } from "./content.utils";
import type { OnboardingPageStage } from "../onboarding/messages";
import { detectRuiSpaView } from "./ruiSpaView";
import {
  EXTENSION_NAME,
  RUI_FACTOR_NAME_INPUT_ID,
  RUI_FACTOR_PANEL_SELECTOR,
  RUI_TOTP_OPTION_SELECTOR,
  RUI_KEBAB_BTN_SELECTOR,
  RUI_KEBAB_MENU_BTN_SELECTOR,
  RUI_ONBOARDING_POLL_INTERVAL_MS,
} from "../cuny/ssoSite";

export { detectRuiSpaView } from "./ruiSpaView";
export type { RuiSpaView } from "./ruiSpaView";

const posted = new Set<OnboardingPageStage>();

let enrolledFactorAlias: string | null = null;

const generateFactorAlias = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${EXTENSION_NAME}-${hex}`;
};

type RuiFactorJson = {
  readonly factorAlias?: unknown;
  readonly factorIsValidated?: unknown;
  readonly factorIsPreferred?: unknown;
};

const parseRuiFactorAttribute = (raw: string): RuiFactorJson | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as RuiFactorJson;
  } catch {
    return null;
  }
};

const postStage = (stage: OnboardingPageStage): void => {
  if (posted.has(stage)) return;
  posted.add(stage);
  void browser.runtime
    .sendMessage({ type: "ONBOARDING_STAGE_DETECTED", stage })
    .catch(() => undefined);
};

const findUnverifiedCunyAutologin = (doc: Document): boolean => {
  const targetAlias = enrolledFactorAlias ?? EXTENSION_NAME;
  for (const el of doc.querySelectorAll(RUI_FACTOR_PANEL_SELECTOR)) {
    const raw = el.getAttribute("factor");
    if (!raw) continue;
    const parsedFactor = parseRuiFactorAttribute(raw);
    if (!parsedFactor) continue;
    if (parsedFactor.factorAlias === targetAlias && parsedFactor.factorIsValidated === false) {
      return true;
    }
  }
  return false;
};

const findCunyAutologinPanel = (doc: Document): {
  isValidated: boolean;
  isPreferred: boolean;
} | null => {
  const targetAlias = enrolledFactorAlias ?? EXTENSION_NAME;
  for (const el of doc.querySelectorAll(RUI_FACTOR_PANEL_SELECTOR)) {
    const raw = el.getAttribute("factor");
    if (!raw) continue;
    const parsedFactor = parseRuiFactorAttribute(raw);
    if (!parsedFactor) continue;
    if (parsedFactor.factorAlias !== targetAlias) continue;
    return {
      isValidated: parsedFactor.factorIsValidated === true,
      isPreferred: parsedFactor.factorIsPreferred === true,
    };
  }
  return null;
};

const totpOptionIsDisabled = (doc: Document): boolean => {
  const opt = doc.querySelector(RUI_TOTP_OPTION_SELECTOR);
  return opt?.classList.contains("oj-disabled") ?? false;
};

let pollId: number | null = null;
let setDefaultTimeoutId: number | null = null;

const SET_DEFAULT_CONFIRM_TIMEOUT_MS = 2000;

const armSetDefaultTimeout = (): void => {
  if (setDefaultTimeoutId !== null) return;
  setDefaultTimeoutId = window.setTimeout(() => {
    setDefaultTimeoutId = null;
    if (posted.has("set_default_confirmed")) return;
    postStage("target_not_found");
  }, SET_DEFAULT_CONFIRM_TIMEOUT_MS);
};

const disarmSetDefaultTimeout = (): void => {
  if (setDefaultTimeoutId === null) return;
  window.clearTimeout(setDefaultTimeoutId);
  setDefaultTimeoutId = null;
};

const isCunyAutologinKebabClick = (target: Element): boolean => {
  const kebab = target.closest(RUI_KEBAB_BTN_SELECTOR);
  if (!kebab) return false;
  const panel = kebab.closest(RUI_FACTOR_PANEL_SELECTOR);
  if (!panel) return false;
  const raw = panel.getAttribute("factor");
  if (!raw) return false;
  const parsedFactor = parseRuiFactorAttribute(raw);
  return parsedFactor !== null && parsedFactor.factorAlias === (enrolledFactorAlias ?? EXTENSION_NAME);
};

const installMenuProgressClickReporters = (): void => {
  document.addEventListener(
    "click",
    (ev) => {
      const clickTarget = ev.target;
      if (!(clickTarget instanceof Element)) return;
      if (clickTarget.closest(RUI_KEBAB_MENU_BTN_SELECTOR)) {
        void browser.runtime
          .sendMessage({
            type: "ONBOARDING_STAGE_DETECTED",
            stage: "add_factor",
          })
          .catch(() => undefined);
        return;
      }
      const totpOpt = clickTarget.closest(RUI_TOTP_OPTION_SELECTOR);
      if (totpOpt && !totpOpt.classList.contains("oj-disabled")) {
        void browser.runtime
          .sendMessage({
            type: "ONBOARDING_STAGE_DETECTED",
            stage: "factor_type_select",
          })
          .catch(() => undefined);
        return;
      }
      if (isCunyAutologinKebabClick(clickTarget)) {
        postStage("set_default_menu_opened");
        armSetDefaultTimeout();
      }
    },
    true
  );
};

export const stopRuiOnboardingObserversForTest = (): void => {
  if (pollId !== null) {
    window.clearInterval(pollId);
    pollId = null;
  }
  disarmSetDefaultTimeout();
  posted.clear();
};

export const startRuiOnboardingObservers = (): void => {
  if (pollId !== null) return;

  installMenuProgressClickReporters();

  const tick = (): void => {
    const href = window.location.href;
    const view = detectRuiSpaView(document, href);

    if (view === "access_denied") {
      postStage("access_denied");
      return;
    }

    if (view === "oaa_spa_home") {
      postStage("oaa_spa_home");
      return;
    }

    if (view === "factors_list") {
      if (document.querySelectorAll(RUI_FACTOR_PANEL_SELECTOR).length > 0) {
        postStage("factors_list");
        const cunyFactor = findCunyAutologinPanel(document);
        if (cunyFactor?.isValidated) {
          postStage("factors_list_after_enroll");
        }
        if (cunyFactor?.isPreferred) {
          postStage("set_default_confirmed");
          disarmSetDefaultTimeout();
        }
        if (totpOptionIsDisabled(document)) {
          postStage("totp_factor_limit");
        }
        if (findUnverifiedCunyAutologin(document)) {
          postStage("unverified_cunyautologin");
        }
      }
      return;
    }

    if (view === "totp_enroll_secret") {
      postStage("totp_enroll_secret");
      const nameInput = document.getElementById(RUI_FACTOR_NAME_INPUT_ID);
      if (nameInput instanceof HTMLInputElement) {
        // Regenerate if the input doesn't already show our alias.
        // This handles both fresh enrollment (empty input) and the case where
        // a stale alias was restored from a prior session but this is a new
        // enrollment attempt.
        if (nameInput.value !== enrolledFactorAlias) {
          enrolledFactorAlias = generateFactorAlias();
          // Route through the service worker — content scripts cannot write
          // to storage.session directly in Firefox.
          void browser.runtime
            .sendMessage({ type: "ENROLLED_ALIAS_FROM_PAGE", alias: enrolledFactorAlias })
            .catch(() => undefined);
        }
        setInputValue(nameInput, enrolledFactorAlias);
      }
      return;
    }

    if (view === "totp_enroll_verify") {
      postStage("totp_enroll_verify");
    }
  };

  tick();
  pollId = window.setInterval(tick, RUI_ONBOARDING_POLL_INTERVAL_MS);
};
