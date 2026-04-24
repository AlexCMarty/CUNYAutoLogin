/**
 * Plan-07: Oracle RUI (`/oaa/rui/*`) onboarding — stage posts,
 * friendly-name fill, and edge-case signals for the sidebar.
 */

import browser from "webextension-polyfill";
import { setInputValue } from "./content.utils";
import type { OnboardingPageStage } from "../onboarding/messages";
import { detectRuiSpaView } from "./ruiSpaView";

export { detectRuiSpaView } from "./ruiSpaView";
export type { RuiSpaView } from "./ruiSpaView";

const CUNY_ONBOARDING_ALIAS = "CUNYAutoLogin";
const NAME_INPUT_ID = "name|input";

const posted = new Set<OnboardingPageStage>();

const postStage = (stage: OnboardingPageStage): void => {
  if (posted.has(stage)) return;
  posted.add(stage);
  void browser.runtime
    .sendMessage({ type: "ONBOARDING_STAGE_DETECTED", stage })
    .catch(() => undefined);
};

const findUnverifiedCunyAutologin = (doc: Document): boolean => {
  for (const el of doc.querySelectorAll("factor-panel")) {
    const raw = el.getAttribute("factor");
    if (!raw) continue;
    try {
      const j = JSON.parse(raw) as {
        factorAlias?: string;
        factorIsValidated?: boolean;
      };
      if (j.factorAlias === CUNY_ONBOARDING_ALIAS && j.factorIsValidated === false) {
        return true;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return false;
};

const totpOptionIsDisabled = (doc: Document): boolean => {
  const opt = doc.querySelector("oj-option#ChallengeOMATOTP");
  return opt?.classList.contains("oj-disabled") ?? false;
};

let pollId: number | null = null;

const installMenuProgressClickReporters = (): void => {
  document.addEventListener(
    "click",
    (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (t.closest("oj-menu-button.menu-button button")) {
        void browser.runtime
          .sendMessage({
            type: "ONBOARDING_STAGE_DETECTED",
            stage: "add_factor",
          })
          .catch(() => undefined);
        return;
      }
      const totpOpt = t.closest("oj-option#ChallengeOMATOTP");
      if (totpOpt && !totpOpt.classList.contains("oj-disabled")) {
        void browser.runtime
          .sendMessage({
            type: "ONBOARDING_STAGE_DETECTED",
            stage: "factor_type_select",
          })
          .catch(() => undefined);
      }
    },
    true
  );
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
      if (document.querySelectorAll("factor-panel").length > 0) {
        postStage("factors_list");
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
      const nameInput = document.getElementById(NAME_INPUT_ID);
      if (nameInput instanceof HTMLInputElement) {
        setInputValue(nameInput, CUNY_ONBOARDING_ALIAS);
      }
      return;
    }

    if (view === "totp_enroll_verify") {
      postStage("totp_enroll_verify");
    }
  };

  tick();
  pollId = window.setInterval(tick, 400);
};
