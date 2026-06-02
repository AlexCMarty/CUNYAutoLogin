/**
 * CHOOSE_SETUP_PATH — the fork (bead 2, "First login").
 *
 * Three-way choice that branches onboarding right after the password step:
 *   • Set up a new code (guided) — the recommended, lead card.
 *   • I've used CUNYAutoLogin before — reuse a key from another device.
 *   • I use a 2FA app — import a key from Bitwarden/Aegis/Ente/…
 *
 * Dispatches CHOOSE_GUIDED / CHOOSE_REUSE_KEY / CHOOSE_IMPORT_KEY / BACK
 * (see advanced-key-flow.md §4).
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const HEADLINE = "Set up your six-digit code.";
const BODY =
  "This is the code CUNY asks for after your password. Pick the option that " +
  "fits — most students start fresh.";
const DIVIDER_LABEL = "Already have a key?";
const BACK_LABEL = "Back";

type ChoiceSpec = {
  readonly choice: "guided" | "reuse" | "import";
  readonly title: string;
  readonly desc: string;
  readonly lead?: boolean;
  readonly pill?: string;
};

const CHOICES: readonly ChoiceSpec[] = [
  {
    choice: "guided",
    title: "Set up a new code",
    desc: "We'll add a login code to your CUNY account together, one step at a time.",
    lead: true,
    pill: "Recommended",
  },
  {
    choice: "reuse",
    title: "I've used CUNYAutoLogin before",
    desc: "Reuse the secret key from your other computer.",
  },
  {
    choice: "import",
    title: "I use a 2FA app",
    desc: "Bitwarden, Aegis, Ente Auth, and the like.",
  },
];

const buildChoiceCard = (doc: Document, spec: ChoiceSpec): HTMLButtonElement => {
  const card = doc.createElement("button");
  card.type = "button";
  card.dataset.onboardingChoice = spec.choice;
  card.className = spec.lead
    ? "onboarding-choice onboarding-choice--lead"
    : "onboarding-choice";

  const main = doc.createElement("span");
  main.className = "onboarding-choice-main";

  if (spec.pill) {
    const titlerow = doc.createElement("span");
    titlerow.className = "onboarding-choice-titlerow";
    const title = doc.createElement("span");
    title.className = "onboarding-choice-title";
    title.textContent = spec.title;
    const pill = doc.createElement("span");
    pill.className = "onboarding-pill";
    pill.textContent = spec.pill;
    titlerow.appendChild(title);
    titlerow.appendChild(pill);
    main.appendChild(titlerow);
  } else {
    const title = doc.createElement("span");
    title.className = "onboarding-choice-title";
    title.textContent = spec.title;
    main.appendChild(title);
  }

  const desc = doc.createElement("span");
  desc.className = "onboarding-choice-desc";
  desc.textContent = spec.desc;
  main.appendChild(desc);

  const chevron = doc.createElement("span");
  chevron.className = "onboarding-choice-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›"; // ›

  card.appendChild(main);
  card.appendChild(chevron);
  return card;
};

export const mountChooseSetupPathScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "CHOOSE_SETUP_PATH";
  container.className = "onboarding-screen onboarding-screen-choose-setup-path";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;
  container.appendChild(headline);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;
  container.appendChild(body);

  // Lead card first, then a labelled divider, then the two "already have a key"
  // options — mirrors the wireframe order.
  container.appendChild(buildChoiceCard(doc, CHOICES[0]));

  const divider = doc.createElement("div");
  divider.className = "onboarding-divider";
  divider.textContent = DIVIDER_LABEL;
  container.appendChild(divider);

  container.appendChild(buildChoiceCard(doc, CHOICES[1]));
  container.appendChild(buildChoiceCard(doc, CHOICES[2]));

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions onboarding-actions-single";
  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingChooseBack = "true";
  back.className = "onboarding-btn-link";
  back.textContent = BACK_LABEL;
  actions.appendChild(back);
  container.appendChild(actions);

  root.appendChild(container);

  const backBtn = container.querySelector<HTMLButtonElement>('[data-onboarding-choose-back]');
  const choiceCards = container.querySelectorAll<HTMLButtonElement>('[data-onboarding-choice]');

  const handleBack = (): void => {
    dispatch("BACK");
  };
  const handleChoiceClick = (event: Event): void => {
    const card = event.currentTarget as HTMLButtonElement;
    const choice = card.dataset.onboardingChoice;
    if (choice === "guided") dispatch("CHOOSE_GUIDED");
    else if (choice === "reuse") dispatch("CHOOSE_REUSE_KEY");
    else if (choice === "import") dispatch("CHOOSE_IMPORT_KEY");
  };

  backBtn?.addEventListener("click", handleBack);
  choiceCards.forEach((card) => card.addEventListener("click", handleChoiceClick));

  return {
    unmount: () => {
      backBtn?.removeEventListener("click", handleBack);
      choiceCards.forEach((card) => card.removeEventListener("click", handleChoiceClick));
      container.remove();
    },
  };
};
