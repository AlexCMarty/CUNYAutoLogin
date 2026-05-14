import { describe, expect, test } from "vitest";
import { beadViewModelForState } from "./beadViewModel";
import { BEAD_LABELS, type OnboardingState } from "./state";

describe("beadViewModelForState", () => {
  test("returns exactly 5 bead view models", () => {
    const models = beadViewModelForState("WELCOME");
    expect(models.length).toBe(5);
  });

  test("beads are numbered 1 through 5", () => {
    const models = beadViewModelForState("WELCOME");
    expect(models.map((bead) => bead.stage)).toEqual([1, 2, 3, 4, 5]);
  });

  test("each bead label matches BEAD_LABELS", () => {
    const models = beadViewModelForState("WELCOME");
    for (const model of models) {
      expect(model.label).toBe(BEAD_LABELS[model.stage]);
    }
  });

  test("active bead is stage 1 for WELCOME (bead 1 state)", () => {
    const models = beadViewModelForState("WELCOME");
    const active = models.filter((bead) => bead.status === "active");
    expect(active.length).toBe(1);
    expect(active[0]!.stage).toBe(1);
  });

  test("no completed beads for WELCOME (first state)", () => {
    const models = beadViewModelForState("WELCOME");
    const completed = models.filter((bead) => bead.status === "completed");
    expect(completed.length).toBe(0);
  });

  test("beads after active are pending for WELCOME", () => {
    const models = beadViewModelForState("WELCOME");
    const pending = models.filter((bead) => bead.status === "pending");
    expect(pending.map((bead) => bead.stage)).toEqual([2, 3, 4, 5]);
  });

  test("active bead is stage 4 for EXT_PASSWORD_SETUP", () => {
    const models = beadViewModelForState("EXT_PASSWORD_SETUP");
    const active = models.find((bead) => bead.status === "active");
    expect(active?.stage).toBe(4);
  });

  test("beads 1–3 are completed for EXT_PASSWORD_SETUP", () => {
    const models = beadViewModelForState("EXT_PASSWORD_SETUP");
    const completed = models.filter((bead) => bead.status === "completed");
    expect(completed.map((bead) => bead.stage)).toEqual([1, 2, 3]);
  });

  test("bead 5 is pending for EXT_PASSWORD_SETUP", () => {
    const models = beadViewModelForState("EXT_PASSWORD_SETUP");
    const pending = models.find((bead) => bead.stage === 5);
    expect(pending?.status).toBe("pending");
  });

  test("active bead is stage 5 for COMPLETE_DONE (final state)", () => {
    const models = beadViewModelForState("COMPLETE_DONE");
    const active = models.find((bead) => bead.status === "active");
    expect(active?.stage).toBe(5);
  });

  test("beads 1–4 are completed for COMPLETE_DONE", () => {
    const models = beadViewModelForState("COMPLETE_DONE");
    const completed = models.filter((bead) => bead.status === "completed");
    expect(completed.map((bead) => bead.stage)).toEqual([1, 2, 3, 4]);
  });

  test("no pending beads for COMPLETE_DONE", () => {
    const models = beadViewModelForState("COMPLETE_DONE");
    const pending = models.filter((bead) => bead.status === "pending");
    expect(pending.length).toBe(0);
  });

  test("active bead is stage 3 for OAA_SPA_HOME (bead 3 state)", () => {
    const models = beadViewModelForState("OAA_SPA_HOME");
    const active = models.find((bead) => bead.status === "active");
    expect(active?.stage).toBe(3);
  });

  test("exactly one active bead for any onboarding state", () => {
    const states: OnboardingState[] = [
      "WELCOME", "EMAIL_ENTRY", "PASSWORD_ENTRY", "OPENING_CUNY",
      "ALLOW_GATE", "OAA_SPA_HOME", "EXT_PASSWORD_SETUP",
      "COMPLETE_DEMO", "COMPLETE_DONE",
    ];
    for (const state of states) {
      const models = beadViewModelForState(state);
      const activeCount = models.filter((bead) => bead.status === "active").length;
      expect(activeCount, `state ${state} should have exactly one active bead`).toBe(1);
    }
  });
});
