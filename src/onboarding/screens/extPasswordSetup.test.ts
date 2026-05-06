// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import browser from "webextension-polyfill";
import type { OnboardingSnapshot } from "../controller";
import { computePasswordStrength, mountExtPasswordSetupScreen } from "./extPasswordSetup";
import type { OnboardingScreenContext } from "./screenContext";

describe("computePasswordStrength", () => {
  test("returns Weak for short passwords (< 8 chars)", () => {
    expect(computePasswordStrength("abc")).toBe("Weak");
    expect(computePasswordStrength("Abc1!")).toBe("Weak");
  });

  test("returns Weak for 8+ chars with fewer than 3 variety classes", () => {
    expect(computePasswordStrength("aaaaaaaa")).toBe("Weak");
    expect(computePasswordStrength("AAAAAAAA")).toBe("Weak");
    expect(computePasswordStrength("Abcdefgh")).toBe("Weak");
  });

  test("returns Fair for 8–11 chars with 3+ variety classes", () => {
    expect(computePasswordStrength("Passw0rd!")).toBe("Fair");
    expect(computePasswordStrength("Abcdefgh1!")).toBe("Fair");
  });

  test("returns Strong for 12+ chars with 3+ variety classes", () => {
    expect(computePasswordStrength("CorrectHorseBatteryStaple42!")).toBe("Strong");
    expect(computePasswordStrength("Abcdefgh1!xy")).toBe("Strong");
  });
});

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      local: {
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock("../../crypto/vault", () => ({
  VAULT_STORAGE_KEY: "cunyVault",
  encryptVault: vi.fn().mockReturnValue({
    isErr: () => false,
    value: { version: 1, saltB64: "s", ivB64: "i", ciphertextB64: "c" },
  }),
}));

const makeCtx = (
  root?: HTMLElement,
  snapshotOverrides?: Partial<Pick<OnboardingSnapshot, "email" | "password">>
): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const el = root ?? document.createElement("div");
  if (!root) document.body.appendChild(el);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root: el,
    getSnapshot: () => ({
      state: "EXT_PASSWORD_SETUP",
      email: snapshotOverrides?.email ?? "student@login.cuny.edu",
      password: snapshotOverrides?.password ?? "cunyPass1!",
      credentialError: null,
    }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root: el, dispatched };
};

describe("mountExtPasswordSetupScreen — DOM structure", () => {
  let root: HTMLElement;

  beforeEach(() => {
    const setup = makeCtx();
    root = setup.root;
    mountExtPasswordSetupScreen(setup.ctx);
  });

  afterEach(() => {
    root.remove();
  });

  test("renders container with data-onboarding-screen='EXT_PASSWORD_SETUP'", () => {
    expect(root.querySelector("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeTruthy();
  });

  test("renders password input with correct data attribute", () => {
    expect(root.querySelector("[data-onboarding-ext-password-input='true']")).toBeTruthy();
  });

  test("renders confirm input with correct data attribute", () => {
    expect(root.querySelector("[data-onboarding-ext-password-confirm='true']")).toBeTruthy();
  });

  test("renders strength indicator with correct data attribute", () => {
    expect(root.querySelector("[data-onboarding-ext-password-strength='true']")).toBeTruthy();
  });

  test("renders match indicator with correct data attribute (hidden initially)", () => {
    const indicator = root.querySelector<HTMLElement>("[data-onboarding-ext-password-match-indicator='true']");
    expect(indicator).toBeTruthy();
    expect(indicator!.hidden).toBe(true);
  });

  test("renders forward button with correct data attribute (disabled initially)", () => {
    const btn = root.querySelector<HTMLButtonElement>("[data-onboarding-ext-password-forward='true']");
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
  });
});

describe("mountExtPasswordSetupScreen — validation", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    const { ctx } = makeCtx(root);
    mountExtPasswordSetupScreen(ctx);
  });

  afterEach(() => {
    root.remove();
  });

  const pwInput = () => root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-input='true']")!;
  const confirmInput = () => root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-confirm='true']")!;
  const strengthSpan = () => root.querySelector<HTMLElement>("[data-onboarding-ext-password-strength='true']")!;
  const matchIndicator = () => root.querySelector<HTMLElement>("[data-onboarding-ext-password-match-indicator='true']")!;
  const forwardBtn = () => root.querySelector<HTMLButtonElement>("[data-onboarding-ext-password-forward='true']")!;

  const setInput = (el: HTMLInputElement, value: string): void => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  test("strength indicator shows Weak for short password", () => {
    setInput(pwInput(), "abc");
    expect(strengthSpan().textContent).toBe("Weak");
    expect(forwardBtn().disabled).toBe(true);
  });

  test("strength indicator shows Fair for 'Passw0rd!'", () => {
    setInput(pwInput(), "Passw0rd!");
    expect(strengthSpan().textContent).toBe("Fair");
  });

  test("strength indicator shows Strong for long complex passphrase", () => {
    setInput(pwInput(), "CorrectHorseBatteryStaple42!");
    expect(strengthSpan().textContent).toBe("Strong");
  });

  test("match indicator stays hidden while confirm is empty", () => {
    setInput(pwInput(), "Passw0rd!");
    expect(matchIndicator().hidden).toBe(true);
  });

  test("match indicator shows data-match-ok=false when passwords differ", () => {
    setInput(pwInput(), "Passw0rd!");
    setInput(confirmInput(), "Different!");
    expect(matchIndicator().hidden).toBe(false);
    expect(matchIndicator().dataset.matchOk).toBe("false");
  });

  test("match indicator shows data-match-ok=true when passwords match", () => {
    setInput(pwInput(), "Passw0rd!");
    setInput(confirmInput(), "Passw0rd!");
    expect(matchIndicator().hidden).toBe(false);
    expect(matchIndicator().dataset.matchOk).toBe("true");
  });

  test("forward button disabled when password is Weak", () => {
    setInput(pwInput(), "abc");
    setInput(confirmInput(), "abc");
    expect(forwardBtn().disabled).toBe(true);
  });

  test("forward button disabled when passwords do not match", () => {
    setInput(pwInput(), "Passw0rd!");
    setInput(confirmInput(), "Different!");
    expect(forwardBtn().disabled).toBe(true);
  });

  test("forward button enabled when strength is Fair and passwords match", () => {
    setInput(pwInput(), "Passw0rd!");
    setInput(confirmInput(), "Passw0rd!");
    expect(forwardBtn().disabled).toBe(false);
  });

  test("forward button enabled when strength is Strong and passwords match", () => {
    setInput(pwInput(), "CorrectHorseBatteryStaple42!");
    setInput(confirmInput(), "CorrectHorseBatteryStaple42!");
    expect(forwardBtn().disabled).toBe(false);
  });
});

describe("mountExtPasswordSetupScreen — must differ from CUNY password", () => {
  test("forward button stays disabled when extension password matches CUNY password", () => {
    const shared = "UniqueSharedPw999!!";
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { ctx } = makeCtx(root, { password: shared });
    mountExtPasswordSetupScreen(ctx);

    const fireInput = (el: HTMLInputElement, value: string): void => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const pw = root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-input='true']")!;
    const confirm = root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-confirm='true']")!;
    const btn = root.querySelector<HTMLButtonElement>("[data-onboarding-ext-password-forward='true']")!;
    const sameAsCuny = root.querySelector<HTMLElement>("[data-onboarding-ext-password-same-as-cuny='true']")!;

    fireInput(pw, shared);
    fireInput(confirm, shared);
    expect(btn.disabled).toBe(true);
    expect(sameAsCuny.hidden).toBe(false);
    root.remove();
  });
});

describe("mountExtPasswordSetupScreen — unmount", () => {
  test("removes the container from the DOM", () => {
    const { ctx, root } = makeCtx();
    const handle = mountExtPasswordSetupScreen(ctx);
    expect(root.querySelector("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeTruthy();
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeNull();
    root.remove();
  });
});

describe("mountExtPasswordSetupScreen — vault save failure", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("shows error message when storage.local.set rejects", async () => {
    const { ctx, root } = makeCtx();
    mountExtPasswordSetupScreen(ctx);

    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error("disk full"));

    const pwInput = root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-input='true']")!;
    const confirmInput = root.querySelector<HTMLInputElement>("[data-onboarding-ext-password-confirm='true']")!;
    const forwardBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-ext-password-forward='true']")!;
    const errorMsg = root.querySelector<HTMLElement>(".onboarding-ext-password-error")!;

    const setInput = (el: HTMLInputElement, value: string): void => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setInput(pwInput, "Passw0rd!");
    setInput(confirmInput, "Passw0rd!");

    forwardBtn.click();

    await vi.waitFor(() => {
      expect(errorMsg.hidden).toBe(false);
    });
    root.remove();
  });
});
