/**
 * Screen-level render context for onboarding screens.
 *
 * Distinct from `OnboardingRenderContext` in `render.ts` on purpose: the
 * skeleton context is a minimal public contract, while screens 1–3 need
 * direct access to the in-memory credential drafts held by the controller.
 * Keeping this richer shape scoped to `screens/` prevents the public contract
 * from bleeding internal mutability.
 *
 * Security: `email` and `password` are always the plain form values — no
 * hashing, no storage. Setters update only the in-memory controller snapshot.
 */

import type {
  OnboardingCredentialErrorInfo,
  OnboardingSnapshot,
} from "../controller";
import type { OnboardingEvent } from "../transitions";

export type OnboardingScreenContext = {
  readonly doc: Document;
  readonly root: HTMLElement;
  /**
   * Dev/QA-only visual variant from the `#qa=…&qaVariant=…` deep link (see
   * `devQaJump.ts`). Lets a single screen state render one of several looks for
   * `capture-sidebar` (e.g. `TEST_LOGIN` in-progress vs signed-in). `undefined`
   * in production — screens fall back to their default appearance.
   */
  readonly qaVariant?: string;
  readonly getSnapshot: () => OnboardingSnapshot;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setCredentialError: (
    error: OnboardingCredentialErrorInfo | null
  ) => void;
  readonly dispatch: (event: OnboardingEvent) => void;
};

export type ScreenMount = (ctx: OnboardingScreenContext) => ScreenHandle;

export type ScreenHandle = {
  readonly unmount: () => void;
};
