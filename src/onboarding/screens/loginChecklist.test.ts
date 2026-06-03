// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildLoginChecklist, DEFAULT_STEP_INTERVAL_MS } from "./loginChecklist";
import type { OnboardingMessage } from "../messages";

const STEPS = [
  "Opening CUNY Login",
  "Filling in your email / password",
  "Generating your login code",
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

describe("buildLoginChecklist — begin + timed fallback", () => {
  test("begin activates the first bead synchronously", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin();
    expect(dots(element)[0]?.dataset.active).toBe("true");
    expect(texts(element)[0]?.textContent).toBe("Opening CUNY Login…");
  });

  test("fallback advances one bead per interval", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin({ intervalMs: 1_000 });
    vi.advanceTimersByTime(1_000);
    expect(dots(element)[0]?.dataset.done).toBe("true");
    expect(dots(element)[1]?.dataset.active).toBe("true");
    vi.advanceTimersByTime(1_000);
    expect(dots(element)[2]?.dataset.active).toBe("true");
  });

  test("completeFinal:false holds the final bead active — never auto-done", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin({ intervalMs: 1_000, completeFinal: false });
    vi.advanceTimersByTime(10_000);
    const lastDot = dots(element)[3];
    expect(lastDot?.dataset.active).toBe("true");
    expect(lastDot?.dataset.done).not.toBe("true");
  });

  test("completeFinal:true marks every bead done and fires onComplete once", () => {
    const onComplete = vi.fn();
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin({ intervalMs: 1_000, completeFinal: true, onComplete });
    vi.advanceTimersByTime(10_000);
    dots(element).forEach((dot) => {
      expect(dot.dataset.done).toBe("true");
      expect(dot.dataset.active).not.toBe("true");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("defaults to DEFAULT_STEP_INTERVAL_MS when no interval is given", () => {
    const { element, begin } = buildLoginChecklist(document, STEPS);
    begin();
    vi.advanceTimersByTime(DEFAULT_STEP_INTERVAL_MS);
    expect(dots(element)[1]?.dataset.active).toBe("true");
  });
});

describe("buildLoginChecklist — real progress events", () => {
  test("credentials_filling -> credentials_done -> code_done walks the beads", () => {
    const { element, applyMessage } = buildLoginChecklist(document, STEPS);
    applyMessage(progress("credentials_filling"));
    expect(dots(element)[1]?.dataset.active).toBe("true");
    applyMessage(progress("credentials_done"));
    expect(dots(element)[1]?.dataset.done).toBe("true");
    expect(dots(element)[2]?.dataset.active).toBe("true");
    applyMessage(progress("code_done"));
    expect(dots(element)[3]?.dataset.active).toBe("true");
  });

  test("cuny_totp_challenge stage activates the code bead", () => {
    const { element, applyMessage } = buildLoginChecklist(document, STEPS);
    applyMessage({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "cuny_totp_challenge",
    });
    expect(dots(element)[2]?.dataset.active).toBe("true");
  });

  test("signed_in finishes the whole checklist and fires onComplete", () => {
    const onComplete = vi.fn();
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin({ completeFinal: false, onComplete });
    applyMessage(progress("signed_in"));
    dots(element).forEach((dot) => expect(dot.dataset.done).toBe("true"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("is monotonic — a stale earlier event never steps the beads backward", () => {
    const { element, applyMessage } = buildLoginChecklist(document, STEPS);
    applyMessage(progress("code_done")); // jump to bead 3
    applyMessage(progress("credentials_filling")); // stale, should be ignored
    expect(dots(element)[3]?.dataset.active).toBe("true");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
  });

  test("real events pre-empt the fallback without double-firing", () => {
    const { element, begin, applyMessage } = buildLoginChecklist(document, STEPS);
    begin({ intervalMs: 1_000 });
    applyMessage(progress("code_done")); // real event jumps ahead of the timer
    expect(dots(element)[3]?.dataset.active).toBe("true");
    // The fallback timer was rescheduled from the new position; with
    // completeFinal:false it must still hold the final bead.
    vi.advanceTimersByTime(5_000);
    expect(dots(element)[3]?.dataset.done).not.toBe("true");
  });

  test("ignores unrelated messages", () => {
    const { element, applyMessage } = buildLoginChecklist(document, STEPS);
    applyMessage({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: true });
    dots(element).forEach((dot) => {
      expect(dot.dataset.active).not.toBe("true");
      expect(dot.dataset.done).not.toBe("true");
    });
  });
});

describe("buildLoginChecklist — unmount", () => {
  test("unmount stops the fallback from advancing further", () => {
    const { element, begin, unmount } = buildLoginChecklist(document, STEPS);
    begin({ intervalMs: 1_000 });
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(dots(element)[0]?.dataset.active).toBe("true");
    expect(dots(element)[1]?.dataset.active).not.toBe("true");
  });
});
