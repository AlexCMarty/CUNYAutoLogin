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
  MIN_MASTER_PASSWORD_LENGTH,
  DRAFT_KEY,
  type PopupDom,
} from "./popup.utils";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Build a minimal PopupDom sufficient for hint + totp tests. */
function makeMinimalEls(totpValue = ""): PopupDom {
  const hint = makeHintEl();
  const totpSecret = makeTotpInput(totpValue);
  return {
    totpSecret,
    totpSecretSourceHint: hint,
    // The remaining fields are not exercised by the tests in this file.
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

// ---------------------------------------------------------------------------
// MIN_MASTER_PASSWORD_LENGTH
// ---------------------------------------------------------------------------

describe("MIN_MASTER_PASSWORD_LENGTH", () => {
  test("is at least 12", () => {
    expect(MIN_MASTER_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------

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

  test("close but different suffix → false", () => {
    expect(validateEmail("bad@notlogin.cuny.edu")).toBe(false);
  });

  test("unrelated domain → false", () => {
    expect(validateEmail("user@example.com")).toBe(false);
  });

  test("empty string → false", () => {
    expect(validateEmail("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decryptStatusMessage
// ---------------------------------------------------------------------------

describe("decryptStatusMessage", () => {
  test("decrypt_failed → wrong password message", () => {
    expect(decryptStatusMessage("decrypt_failed")).toBe(
      "Wrong master password or corrupted vault."
    );
  });

  test("invalid_payload → generic message", () => {
    expect(decryptStatusMessage("invalid_payload")).toBe("Could not decrypt vault.");
  });

  test("crypto_failed → generic message", () => {
    expect(decryptStatusMessage("crypto_failed")).toBe("Could not decrypt vault.");
  });
});

// ---------------------------------------------------------------------------
// parseDraft
// ---------------------------------------------------------------------------

describe("parseDraft", () => {
  test("malformed JSON → null", () => {
    expect(parseDraft("{not json")).toBeNull();
  });

  test("JSON null → null", () => {
    expect(parseDraft("null")).toBeNull();
  });

  test("JSON array → empty FormDraft (arrays are objects; no matching string keys)", () => {
    expect(parseDraft('["a","b"]')).toEqual({ email: "", password: "", totpSecret: "" });
  });

  test("JSON string → null", () => {
    expect(parseDraft('"hello"')).toBeNull();
  });

  test("all three valid string fields → full FormDraft", () => {
    const result = parseDraft(
      JSON.stringify({ email: "a@login.cuny.edu", password: "pw", totpSecret: "ABCD" })
    );
    expect(result).toEqual({ email: "a@login.cuny.edu", password: "pw", totpSecret: "ABCD" });
  });

  test("only email present → email populated, others empty string", () => {
    const result = parseDraft(JSON.stringify({ email: "a@login.cuny.edu" }));
    expect(result).toEqual({ email: "a@login.cuny.edu", password: "", totpSecret: "" });
  });

  test("empty string field is preserved as empty (falsy guard is caller's responsibility)", () => {
    const result = parseDraft(
      JSON.stringify({ email: "", password: "pw", totpSecret: "" })
    );
    expect(result).toEqual({ email: "", password: "pw", totpSecret: "" });
  });

  test("numeric field values are ignored (not strings) → empty string fallback", () => {
    const result = parseDraft(JSON.stringify({ email: 42, password: "pw", totpSecret: true }));
    expect(result).toEqual({ email: "", password: "pw", totpSecret: "" });
  });

  test("extra unknown fields are ignored", () => {
    const result = parseDraft(
      JSON.stringify({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB", extra: "x" })
    );
    expect(result).toEqual({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB" });
  });
});

// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------

describe("setStatus", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="status"></div>';
  });

  test("sets textContent on #status element", () => {
    setStatus("Something went wrong.");
    expect(document.getElementById("status")?.textContent).toBe("Something went wrong.");
  });

  test("ok=true adds 'ok' class", () => {
    setStatus("All good.", true);
    expect(document.getElementById("status")?.classList.contains("ok")).toBe(true);
  });

  test("ok=false (default) removes 'ok' class", () => {
    const el = document.getElementById("status")!;
    el.classList.add("ok");
    setStatus("Error.");
    expect(el.classList.contains("ok")).toBe(false);
  });

  test("no-ops when #status element is absent", () => {
    document.body.innerHTML = "";
    expect(() => setStatus("msg")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hideTotpSecretSourceHint / showTotpSecretSourceHint
// ---------------------------------------------------------------------------

describe("hideTotpSecretSourceHint", () => {
  test("clears textContent and adds 'hidden' class", () => {
    const els = makeMinimalEls();
    els.totpSecretSourceHint.textContent = "some hint";
    els.totpSecretSourceHint.classList.remove("hidden");

    hideTotpSecretSourceHint(els);

    expect(els.totpSecretSourceHint.textContent).toBe("");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(true);
  });
});

describe("showTotpSecretSourceHint", () => {
  test("sets expected message text and removes 'hidden' class", () => {
    const els = makeMinimalEls();

    showTotpSecretSourceHint(els);

    expect(els.totpSecretSourceHint.textContent).toContain("CUNY");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyPendingTotpFromPage
// ---------------------------------------------------------------------------

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

  test("new secret → updates totp field, shows hint, clears session key, saves draft", async () => {
    const els = makeMinimalEls(""); // field is currently empty
    mockSessionGet("NEWSECRET");
    const removeSpy = mockSessionRemove();
    const setSpy = vi.spyOn(browser.storage.session, "set").mockResolvedValue();

    await applyPendingTotpFromPage(els);

    expect(els.totpSecret.value).toBe("NEWSECRET");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith(PENDING_TOTP_SECRET_SESSION_KEY);
    expect(setSpy).toHaveBeenCalledWith({
      [DRAFT_KEY]: { email: "", password: "", totpSecret: "NEWSECRET" },
    });
  });

  test("secret matches current field value (normalized) → field unchanged, hint stays hidden", async () => {
    // Field has "newsecret" in mixed case with spaces — normalizes to "NEWSECRET"
    const els = makeMinimalEls("new secret");
    mockSessionGet("NEWSECRET");
    const removeSpy = mockSessionRemove();

    await applyPendingTotpFromPage(els);

    expect(els.totpSecret.value).toBe("new secret"); // unchanged
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith(PENDING_TOTP_SECRET_SESSION_KEY);
  });

  test("session returns empty string → no changes", async () => {
    const els = makeMinimalEls("existing");
    mockSessionGet("");

    await applyPendingTotpFromPage(els);

    expect(els.totpSecret.value).toBe("existing");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(true);
  });

  test("session returns non-string → no changes", async () => {
    const els = makeMinimalEls("existing");
    mockSessionGet(null);

    await applyPendingTotpFromPage(els);

    expect(els.totpSecret.value).toBe("existing");
    expect(els.totpSecretSourceHint.classList.contains("hidden")).toBe(true);
  });

  test("session storage throws → no changes, no uncaught error", async () => {
    const els = makeMinimalEls("existing");
    vi.spyOn(browser.storage.session, "get").mockRejectedValue(new Error("unavailable"));

    await expect(applyPendingTotpFromPage(els)).resolves.toBeUndefined();
    expect(els.totpSecret.value).toBe("existing");
  });
});

// ---------------------------------------------------------------------------
// coerceDraft
// ---------------------------------------------------------------------------

describe("coerceDraft", () => {
  test("plain object with all string fields → FormDraft", () => {
    expect(coerceDraft({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB" }))
      .toEqual({ email: "a@login.cuny.edu", password: "pw", totpSecret: "AB" });
  });

  test("null → null", () => {
    expect(coerceDraft(null)).toBeNull();
  });

  test("primitive string → null", () => {
    expect(coerceDraft("string")).toBeNull();
  });

  test("number → null", () => {
    expect(coerceDraft(42)).toBeNull();
  });

  test("missing fields default to empty string", () => {
    expect(coerceDraft({})).toEqual({ email: "", password: "", totpSecret: "" });
  });

  test("non-string field values fall back to empty string", () => {
    expect(coerceDraft({ email: 123, password: null, totpSecret: true }))
      .toEqual({ email: "", password: "", totpSecret: "" });
  });

  test("extra unknown fields are ignored", () => {
    expect(coerceDraft({ email: "a@b.c", password: "pw", totpSecret: "AB", extra: "x" }))
      .toEqual({ email: "a@b.c", password: "pw", totpSecret: "AB" });
  });
});

// ---------------------------------------------------------------------------
// saveDraft
// ---------------------------------------------------------------------------

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

  test("does not throw when storage.session.set rejects", async () => {
    const els = makeMinimalEls("");
    vi.spyOn(browser.storage.session, "set").mockRejectedValue(new Error("unavailable"));

    await expect(saveDraft(els)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// clearDraft
// ---------------------------------------------------------------------------

describe("clearDraft", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  test("calls storage.session.remove with DRAFT_KEY", async () => {
    const removeSpy = vi.spyOn(browser.storage.session, "remove").mockResolvedValue();

    await clearDraft();

    expect(removeSpy).toHaveBeenCalledWith(DRAFT_KEY);
  });

  test("does not throw when storage.session.remove rejects", async () => {
    vi.spyOn(browser.storage.session, "remove").mockRejectedValue(new Error("unavailable"));

    await expect(clearDraft()).resolves.toBeUndefined();
  });
});
