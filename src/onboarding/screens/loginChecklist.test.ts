// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildLoginChecklist } from "./loginChecklist";
import type { OnboardingMessage } from "../messages";

const STEPS = [
  "Opening CUNY Login",
  "Filling in your email / password",
  "Filling in your login code",
  "Signed in",
] as const;

const progress = (step: string): OnboardingMessage =>
  ({ type: "ONBOARDING_LOGIN_PROGRESS", step } as OnboardingMessage);

const dots = (el: HTMLElement): HTMLElement[] =>
  Array.from(el.querySelectorAll<HTMLElement>(".onboarding-demo-dot"));
const texts = (el: HTMLElement): HTMLElement[] =>
  Array.from(el.querySelectorAll<HTMLElement>(".onboarding-demo-text"));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("buildLoginChecklist — structure", () => {
  test("renders one row/dot/text per step with the given labels", () => {
    const { element } = buildLoginChecklist(document, STEPS);
    expect(element.classList.contains("onboarding-demo-list")).toBe(true);
    expect(element.querySelectorAll(".onboarding-demo-row")).toHaveLength(4);
    expect(texts(element).map((node) => node.textContent)).toEqual([...STEPS]);
  });

  test("starts idle — no dot active or done", () => {
    const { element } = buildLoginChecklist(document, STEPS);
    dots(element).forEach((dot) => {
      expect(dot.dataset.active).not.toBe("true");
      expect(dot.dataset.done).not.toBe("true");
    });
  });
});

describe("buildLoginChecklist — begin", () => {
  test("begin activates the first bead synchronously, with the '…' affordance", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin();
    expect(dots(element)[0]?.dataset.active).toBe("true");
    expect(texts(element)[0]?.textContent).toBe("Opening CUNY Login…");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
  });

  test("no timer ever advances the beads on its own", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin();
    vi.advanceTimersByTime(60_000);
    // Still on bead 0 — nothing fires without a real event.
    expect(dots(element)[0]?.dataset.active).toBe("true");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
    expect(dots(element)[3]?.dataset.done).not.toBe("true");
  });
});

describe("buildLoginChecklist — real progress events", () => {
  test("credentials_filling completes 'Opening' and activates the credentials bead", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("credentials_filling"));
    expect(dots(element)[0]?.dataset.done).toBe("true");
    expect(dots(element)[1]?.dataset.active).toBe("true");
    expect(texts(element)[1]?.textContent).toBe("Filling in your email / password…");
  });

  test("credentials_done is ignored — the credentials bead keeps spinning", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("credentials_filling"));
    applyMessage(progress("credentials_done"));
    // The code bead must NOT light up until the code phase actually begins.
    expect(dots(element)[1]?.dataset.active).toBe("true");
    expect(dots(element)[2]?.dataset.active).not.toBe("true");
    expect(dots(element)[2]?.dataset.done).not.toBe("true");
  });

  test("code_filling completes credentials and activates the code bead", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("credentials_filling"));
    applyMessage(progress("code_filling"));
    expect(dots(element)[1]?.dataset.done).toBe("true");
    expect(dots(element)[2]?.dataset.active).toBe("true");
    expect(texts(element)[2]?.textContent).toBe("Filling in your login code…");
  });

  test("code_done completes the code bead and activates 'Signed in'", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("code_filling"));
    applyMessage(progress("code_done"));
    expect(dots(element)[2]?.dataset.done).toBe("true");
    expect(dots(element)[3]?.dataset.active).toBe("true");
  });

  test("cuny_totp_challenge stage activates the code bead", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "cuny_totp_challenge",
    });
    expect(dots(element)[2]?.dataset.active).toBe("true");
  });
});

describe("buildLoginChecklist — completion, monotonicity & filtering", () => {
  test("'Signed in' is never marked done until the real signed_in arrives", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("code_done")); // bead 3 active, not done
    vi.advanceTimersByTime(60_000);
    expect(dots(element)[3]?.dataset.active).toBe("true");
    expect(dots(element)[3]?.dataset.done).not.toBe("true");
  });

  test("signed_in finishes every bead and fires onComplete once", () => {
    const onComplete = vi.fn();
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin({ onComplete });
    applyMessage(progress("signed_in"));
    dots(element).forEach((dot) => {
      expect(dot.dataset.done).toBe("true");
      expect(dot.dataset.active).not.toBe("true");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    applyMessage(progress("signed_in")); // idempotent
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("signed_in is a catch-all completer even when intermediate events were skipped", () => {
    const onComplete = vi.fn();
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin({ onComplete });
    applyMessage(progress("credentials_filling")); // login with no TOTP page
    applyMessage(progress("signed_in"));
    dots(element).forEach((dot) => expect(dot.dataset.done).toBe("true"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("is monotonic — a stale earlier event never steps the beads backward", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage(progress("code_done")); // jump to bead 3
    applyMessage(progress("credentials_filling")); // stale, should be ignored
    expect(dots(element)[3]?.dataset.active).toBe("true");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
  });

  test("ignores unrelated messages", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin();
    applyMessage({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: true });
    expect(dots(element)[0]?.dataset.active).toBe("true");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
  });
});

describe("buildLoginChecklist — unmount", () => {
  test("after unmount, further messages are ignored", () => {
    const onComplete = vi.fn();
    const { element, begin, applyMessage, unmount } = buildLoginChecklist(document, STEPS);
    begin({ onComplete });
    unmount();
    applyMessage(progress("signed_in"));
    expect(dots(element)[3]?.dataset.done).not.toBe("true");
    expect(onComplete).not.toHaveBeenCalled();
  });
});
