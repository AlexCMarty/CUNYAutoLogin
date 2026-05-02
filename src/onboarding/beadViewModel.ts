import {
  BEAD_LABELS,
  type BeadStage,
  type OnboardingState,
  beadForState,
} from "./state";

export type BeadViewModel = {
  readonly stage: BeadStage;
  readonly label: string;
  readonly status: "pending" | "active" | "completed";
};

export const beadViewModelForState = (
  state: OnboardingState
): readonly BeadViewModel[] => {
  const activeBead = beadForState(state);
  const stages: readonly BeadStage[] = [1, 2, 3, 4, 5];
  return stages.map((stage) => ({
    stage,
    label: BEAD_LABELS[stage],
    status: stage < activeBead ? "completed" : stage === activeBead ? "active" : "pending",
  }));
};
