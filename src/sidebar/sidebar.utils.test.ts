// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import browser from "webextension-polyfill";
import {
  validateEmail,
  decryptStatusMessage,
  parseDraft,
  coerceDraft,
  saveDraft,
  clearDraft,
  setStatus,
  hideTotpSecretSourceHint,
  showTotpSecretSourceHint,
  applyPendingTotpFromPage,
  effectiveTotpSecretForSave,
  MIN_MASTER_PASSWORD_LENGTH,
  DRAFT_KEY,
  type SidebarDom,
} from "./sidebar.utils";
import { PENDING_TOTP_SECRET_SESSION_KEY } from "../cuny/ssoSite";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  },
}));

function makeHintEl(): HTMLElement {
  const el = document.createElement("div");
  el.classList.add("hidden");
  return el;
}

function makeTotpInput(value = ""): HTMLInputElement {
  const el = document.createElement("input");
  el.value = value;
  return el;
}

/** Build a minimal SidebarDom sufficient for hint + totp tests. */
function makeMinimalEls(totpValue = ""): SidebarDom {
  const hint = makeHintEl();
  const totpSecret = makeTotpInput(totpValue);
  return {
    totpSecret,
    totpSecretSourceHint: hint,
    form: document.createElement("form"),
    email: document.createElement("input") as HTMLInputElement,
    password: document.createElement("input") as HTMLInputElement,
    masterPassword: document.createElement("input") as HTMLInputElement,
    masterLabel: document.createElement("div"),
    newMasterPassword: document.createElement("input") as HTMLInputElement,
    confirmNewMasterPassword: document.createElement("input") as HTMLInputElement,
    submitBtn: document.createElement("button") as HTMLButtonElement,
    lockBtn: document.createElement("button") as HTMLButtonElement,
    modeHint: document.createElement("div"),
    credentialFields: document.createElement("div"),
    masterPasswordField: document.createElement("div"),
    changeMasterSection: document.createElement("div"),
  };
}

describe("MIN_MASTER_PASSWORD_LENGTH", () => {
  test("is at least 12", () => {
    expect(MIN_MASTER_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

describe("effectiveTotpSecretForSave", () => {
  test("uses trimmed field when non-empty", () => {
    expect(effectiveTotpSecretForSave("  AB CD  ", null, true)).toBe("ABCD");
  });

  test("uses session TOTP when sidebar management and field empty", () => {
    expect(effectiveTotpSecretForSave("", "JBSWY3DPEHPK3PXP", true)).toBe("JBSWY3DPEHPK3PXP");
  });

  test("returns empty when not management and field empty", () => {
    expect(effectiveTotpSecretForSave("", "JBSWY3DPEHPK3PXP", false)).toBe("");
  });
});

describe("validateEmail", () => {
  test("valid @login.cuny.edu address → true", () => {
    expect(validateEmail("student@login.cuny.edu")).toBe(true);
  });

  test("uppercase address is accepted (case-insensitive) → true", () => {
    expect(validateEmail("STUDENT@LOGIN.CUNY.EDU")).toBe(true);
  });

  test("leading and trailing whitespace is trimmed → true", () => {
    expect(validateEmail("  student@login.cuny.edu  ")).toBe(true);
  });

  test("wrong domain → false", () => {
    expect(validateEmail("student@cuny.edu")).toBe(false);
  });
});

describe("decryptStatusMessage", () => {
  test("decrypt_failed → wrong password message", () => {
    expect(decryptStatusMessage("decrypt_failed")).toBe(
      "Wrong master password or corrupted vault."
    );
  });
});

describe("parseDraft", () => {
  test("malformed JSON → null", () => {
    expect(parseDraft("{not json")).toBeNull();
  });
});

describe("setStatus", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="status"></div>';
  });

  test("sets textContent on #status element", () => {
    setStatus("Something went wrong.");
    expect(document.getElementById("status")?.textContent).toBe("Something went wrong.");
  });
});

describe("hideTotpSecretSourceHint", () => {
  test("clears textContent and adds hidden class", () => {
    const els = makeMinimalEls();
    els.totpSecretSourceHint.textContent = "some hint";
    els.totpSecretSourceHint.classList.remove("hidden");

    hideTotpSecretSourceHint(els);

    expect(els.totpSecretSourceHint.textContent).toBe("");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(true);
  });
});

describe("showTotpSecretSourceHint", () => {
  test("sets expected message text and removes hidden class", () => {
    const els = makeMinimalEls();
    showTotpSecretSourceHint(els);
    expect(els.totpSecretSourceHint.textContent).toContain("CUNY");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(false);
  });
});

describe("applyPendingTotpFromPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSessionGet = (returnVal: unknown) =>
    vi.spyOn(browser.storage.session, "get").mockResolvedValue(
      { [PENDING_TOTP_SECRET_SESSION_KEY]: returnVal } as Record<string, unknown>
    );

  const mockSessionRemove = () =>
    vi.spyOn(browser.storage.session, "remove").mockResolvedValue();

  test("new secret updates totp field and saves draft", async () => {
    const els = makeMinimalEls("");
    mockSessionGet("NEWSECRET");
    const removeSpy = mockSessionRemove();
    const setSpy = vi.spyOn(browser.storage.session, "set").mockResolvedValue();

    await applyPendingTotpFromPage(els);

    expect(els.totpSecret.value).toBe("NEWSECRET");
    expect(removeSpy).toHaveBeenCalledWith(PENDING_TOTP_SECRET_SESSION_KEY);
    expect(setSpy).toHaveBeenCalledWith({
      [DRAFT_KEY]: { email: "", password: "", totpSecret: "NEWSECRET" },
    });
  });
});

describe("coerceDraft", () => {
  test("plain object with all string fields → FormDraft", () => {
    expect(coerceDraft({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB" }))
      .toEqual({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB" });
  });
});

describe("saveDraft", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  test("writes FormDraft object to storage.session under DRAFT_KEY", async () => {
    const els = makeMinimalEls("");
    els.email.value = "a@login.cuny.edu";
    els.password.value = "pw";
    els.totpSecret.value = "ABCD";
    const setSpy = vi.spyOn(browser.storage.session, "set").mockResolvedValue();

    await saveDraft(els);

    expect(setSpy).toHaveBeenCalledWith({
      [DRAFT_KEY]: { email: "a@login.cuny.edu", password: "pw", totpSecret: "ABCD" },
    });
  });
});

describe("clearDraft", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  test("calls storage.session.remove with DRAFT_KEY", async () => {
    const removeSpy = vi.spyOn(browser.storage.session, "remove").mockResolvedValue();

    await clearDraft();

    expect(removeSpy).toHaveBeenCalledWith(DRAFT_KEY);
  });
});
