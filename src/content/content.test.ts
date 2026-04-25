// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from "vitest";
import {
  normalizeTotpSecretCandidate,
  parseTotpSecretFromEnrollDom,
  setInputValue,
  simulateKeystrokes,
  isFillMessage,
  hasCredentialErrorInDom,
  TOTP_SECRET_LEN_MIN,
  TOTP_SECRET_LEN_MAX,
  TOTP_SECRET_SELECTOR,
} from "./content.utils";
import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
} from "../cuny/ssoSite";
import { detectRuiSpaView } from "./ruiSpaView";
import {
  CREDENTIAL_ERROR_BANNER_COPY,
  CREDENTIAL_ERROR_BANNER_ID,
  mountCredentialErrorBanner,
  unmountCredentialErrorBanner,
} from "./banner";

// ─── normalizeTotpSecretCandidate ────────────────────────────────────────────

describe("normalizeTotpSecretCandidate", () => {
  describe("valid secrets", () => {
    test("trims leading/trailing whitespace", () => {
      expect(normalizeTotpSecretCandidate("  JBSWY3DPEHPK3PXP  ")).toBe("JBSWY3DPEHPK3PXP");
    });

    test("uppercases lowercase input", () => {
      expect(normalizeTotpSecretCandidate("jbswy3dpehpk3pxp")).toBe("JBSWY3DPEHPK3PXP");
    });

    test("strips trailing = padding", () => {
      expect(normalizeTotpSecretCandidate("JBSWY3DPEHPK3PXP======")).toBe("JBSWY3DPEHPK3PXP");
    });

    test("applies all transforms together: whitespace + lowercase + padding", () => {
      expect(normalizeTotpSecretCandidate("  jbswy3dp ehpk3pxp  ====  ")).toBe("JBSWY3DPEHPK3PXP");
    });

    test("collapses internal whitespace before normalizing", () => {
      expect(normalizeTotpSecretCandidate("JBSWY3DP EHPK 3PXP")).toBe("JBSWY3DPEHPK3PXP");
    });

    test("accepts exact minimum length", () => {
      const secret = "A".repeat(TOTP_SECRET_LEN_MIN);
      expect(normalizeTotpSecretCandidate(secret)).toBe(secret);
    });

    test("accepts exact maximum length", () => {
      const secret = "A".repeat(TOTP_SECRET_LEN_MAX);
      expect(normalizeTotpSecretCandidate(secret)).toBe(secret);
    });

    test("accepts all valid Base32 characters (A-Z, 2-7)", () => {
      const allValidChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2); // 64 chars, within range
      expect(normalizeTotpSecretCandidate(allValidChars)).toBe(allValidChars);
    });
  });

  describe("invalid secrets → null", () => {
    test("empty string", () => {
      expect(normalizeTotpSecretCandidate("")).toBeNull();
    });

    test("too short (below minimum length)", () => {
      expect(normalizeTotpSecretCandidate("A".repeat(TOTP_SECRET_LEN_MIN - 1))).toBeNull();
    });

    test("too long (above maximum length)", () => {
      expect(normalizeTotpSecretCandidate("A".repeat(TOTP_SECRET_LEN_MAX + 1))).toBeNull();
    });

    test("contains digit 0 (invalid Base32)", () => {
      // Pad to minimum length so only the charset check triggers
      expect(normalizeTotpSecretCandidate("0BSWY3DPEH")).toBeNull();
    });

    test("contains digit 1 (invalid Base32)", () => {
      expect(normalizeTotpSecretCandidate("1BSWY3DPEH")).toBeNull();
    });

    test("contains digit 8 (invalid Base32)", () => {
      expect(normalizeTotpSecretCandidate("8BSWY3DPEH")).toBeNull();
    });

    test("contains digit 9 (invalid Base32)", () => {
      expect(normalizeTotpSecretCandidate("9BSWY3DPEH")).toBeNull();
    });

    test("whitespace-only input", () => {
      expect(normalizeTotpSecretCandidate("          ")).toBeNull();
    });

    test("only padding characters", () => {
      expect(normalizeTotpSecretCandidate("==========")).toBeNull();
    });
  });
});

// ─── isFillMessage ───────────────────────────────────────────────────────────

describe("isFillMessage", () => {
  const valid = {
    type: "FILL_CREDENTIALS" as const,
    payload: { email: "user@login.cuny.edu", password: "secret", totpSecret: "JBSWY3DP" },
  };

  describe("valid messages → true", () => {
    test("well-formed message", () => {
      expect(isFillMessage(valid)).toBe(true);
    });

    test("extra top-level fields are ignored", () => {
      expect(isFillMessage({ ...valid, extra: true })).toBe(true);
    });

    test("extra payload fields are ignored", () => {
      expect(isFillMessage({ ...valid, payload: { ...valid.payload, bonus: 42 } })).toBe(true);
    });

    test("empty string values are still strings", () => {
      expect(isFillMessage({ ...valid, payload: { email: "", password: "", totpSecret: "" } })).toBe(true);
    });
  });

  describe("invalid messages → false", () => {
    test("null", () => {
      expect(isFillMessage(null)).toBe(false);
    });

    test("string primitive", () => {
      expect(isFillMessage("FILL_CREDENTIALS")).toBe(false);
    });

    test("number primitive", () => {
      expect(isFillMessage(42)).toBe(false);
    });

    test("empty object", () => {
      expect(isFillMessage({})).toBe(false);
    });

    test("wrong type value", () => {
      expect(isFillMessage({ ...valid, type: "WRONG_TYPE" })).toBe(false);
    });

    test("missing payload", () => {
      expect(isFillMessage({ type: "FILL_CREDENTIALS" })).toBe(false);
    });

    test("payload is null", () => {
      expect(isFillMessage({ type: "FILL_CREDENTIALS", payload: null })).toBe(false);
    });

    test("payload is a string", () => {
      expect(isFillMessage({ type: "FILL_CREDENTIALS", payload: "bad" })).toBe(false);
    });

    test("email is not a string", () => {
      expect(isFillMessage({ ...valid, payload: { ...valid.payload, email: 123 } })).toBe(false);
    });

    test("password is null", () => {
      expect(isFillMessage({ ...valid, payload: { ...valid.payload, password: null } })).toBe(false);
    });

    test("totpSecret is undefined", () => {
      const { totpSecret: _, ...noSecret } = valid.payload;
      expect(isFillMessage({ ...valid, payload: noSecret })).toBe(false);
    });
  });
});

// ─── parseTotpSecretFromEnrollDom ────────────────────────────────────────────

describe("parseTotpSecretFromEnrollDom", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const ariaValue = TOTP_SECRET_SELECTOR.match(/aria-labelledby="([^"]+)"/)?.[1] ?? "";

  function insertSecretElement(text: string): void {
    const el = document.createElement("span");
    el.setAttribute("aria-labelledby", ariaValue);
    el.textContent = text;
    document.body.appendChild(el);
  }

  test("returns null when no matching element exists", () => {
    expect(parseTotpSecretFromEnrollDom()).toBeNull();
  });

  test("returns normalized secret from matching element", () => {
    insertSecretElement("JBSWY3DPEHPK3PXP");
    expect(parseTotpSecretFromEnrollDom()).toBe("JBSWY3DPEHPK3PXP");
  });

  test("normalizes lowercase and whitespace from DOM text", () => {
    insertSecretElement("  jbswy3dp ehpk3pxp  ");
    expect(parseTotpSecretFromEnrollDom()).toBe("JBSWY3DPEHPK3PXP");
  });

  test("strips = padding from DOM text", () => {
    insertSecretElement("JBSWY3DPEHPK3PXP======");
    expect(parseTotpSecretFromEnrollDom()).toBe("JBSWY3DPEHPK3PXP");
  });

  test("returns null when element text contains invalid Base32 characters", () => {
    insertSecretElement("INVALID0SECRET1");
    expect(parseTotpSecretFromEnrollDom()).toBeNull();
  });

  test("returns null when element text is empty", () => {
    insertSecretElement("");
    expect(parseTotpSecretFromEnrollDom()).toBeNull();
  });

  test("returns null when element text is only whitespace", () => {
    insertSecretElement("   ");
    expect(parseTotpSecretFromEnrollDom()).toBeNull();
  });
});

// ─── setInputValue ───────────────────────────────────────────────────────────

describe("setInputValue", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function createInput(): HTMLInputElement {
    const el = document.createElement("input");
    document.body.appendChild(el);
    return el;
  }

  test("sets the input value", () => {
    const el = createInput();
    setInputValue(el, "hello");
    expect(el.value).toBe("hello");
  });

  test("dispatches an 'input' event", () => {
    const el = createInput();
    let fired = false;
    el.addEventListener("input", () => { fired = true; });
    setInputValue(el, "hello");
    expect(fired).toBe(true);
  });

  test("dispatches a 'change' event", () => {
    const el = createInput();
    let fired = false;
    el.addEventListener("change", () => { fired = true; });
    setInputValue(el, "hello");
    expect(fired).toBe(true);
  });

  test("'input' event bubbles", () => {
    const el = createInput();
    let bubbled = false;
    document.body.addEventListener("input", () => { bubbled = true; });
    setInputValue(el, "hello");
    expect(bubbled).toBe(true);
  });

  test("'change' event bubbles", () => {
    const el = createInput();
    let bubbled = false;
    document.body.addEventListener("change", () => { bubbled = true; });
    setInputValue(el, "hello");
    expect(bubbled).toBe(true);
  });

  test("uses the native HTMLInputElement prototype setter", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const nativeSetter = descriptor?.set;
    if (!nativeSetter) {
      // Environment doesn't expose the native setter — skip rather than false-fail
      return;
    }
    const spy = vi.spyOn(descriptor as { set: (v: string) => void }, "set");
    // Re-register the spy on the prototype so setInputValue picks it up
    Object.defineProperty(HTMLInputElement.prototype, "value", { ...descriptor, set: spy });

    const el = createInput();
    setInputValue(el, "test");
    expect(spy).toHaveBeenCalledWith("test");

    // Restore the original descriptor
    Object.defineProperty(HTMLInputElement.prototype, "value", descriptor);
  });

  test("both events fire on the same call", () => {
    const el = createInput();
    const fired: string[] = [];
    el.addEventListener("input", () => fired.push("input"));
    el.addEventListener("change", () => fired.push("change"));
    setInputValue(el, "x");
    expect(fired).toContain("input");
    expect(fired).toContain("change");
  });
});

// ─── simulateKeystrokes ──────────────────────────────────────────────────────

describe("simulateKeystrokes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function createInput(): HTMLInputElement {
    const el = document.createElement("input");
    document.body.appendChild(el);
    return el;
  }

  test("sets the full value correctly", () => {
    const el = createInput();
    simulateKeystrokes(el, "123456");
    expect(el.value).toBe("123456");
  });

  test("empty string leaves value empty and does not throw", () => {
    const el = createInput();
    expect(() => simulateKeystrokes(el, "")).not.toThrow();
    expect(el.value).toBe("");
  });

  test("dispatches one keydown per character", () => {
    const el = createInput();
    const keys: string[] = [];
    el.addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key));
    simulateKeystrokes(el, "42");
    expect(keys).toEqual(["4", "2"]);
  });

  test("dispatches one keyup per character", () => {
    const el = createInput();
    const keys: string[] = [];
    el.addEventListener("keyup", (e) => keys.push((e as KeyboardEvent).key));
    simulateKeystrokes(el, "42");
    expect(keys).toEqual(["4", "2"]);
  });

  test("dispatches beforeinput with insertText type and correct data per character", () => {
    const el = createInput();
    const entries: { type: string; data: string | null }[] = [];
    el.addEventListener("beforeinput", (e) => {
      entries.push({ type: (e as InputEvent).inputType, data: (e as InputEvent).data });
    });
    simulateKeystrokes(el, "12");
    expect(entries).toEqual([
      { type: "insertText", data: "1" },
      { type: "insertText", data: "2" },
    ]);
  });

  test("dispatches input with insertText type per character", () => {
    const el = createInput();
    const types: string[] = [];
    el.addEventListener("input", (e) => types.push((e as InputEvent).inputType));
    simulateKeystrokes(el, "12");
    expect(types).toEqual(["insertText", "insertText"]);
  });

  test("dispatches a single change event at the end", () => {
    const el = createInput();
    let count = 0;
    el.addEventListener("change", () => count++);
    simulateKeystrokes(el, "123");
    expect(count).toBe(1);
  });

  test("keydown and input events bubble", () => {
    const el = createInput();
    let keydownBubbled = false;
    let inputBubbled = false;
    document.body.addEventListener("keydown", () => { keydownBubbled = true; });
    document.body.addEventListener("input", () => { inputBubbled = true; });
    simulateKeystrokes(el, "x");
    expect(keydownBubbled).toBe(true);
    expect(inputBubbled).toBe(true);
  });

  test("builds value incrementally — each input event sees one more character", () => {
    const el = createInput();
    const snapshots: string[] = [];
    el.addEventListener("input", () => snapshots.push(el.value));
    simulateKeystrokes(el, "abc");
    expect(snapshots).toEqual(["a", "ab", "abc"]);
  });

  test("replaces a pre-existing value rather than appending (retry safety)", () => {
    const el = createInput();
    el.value = "876345";
    simulateKeystrokes(el, "901234");
    expect(el.value).toBe("901234");
  });

  test("dispatches deleteContentBackward input event before insertText when input had a prior value", () => {
    const el = createInput();
    el.value = "999999";
    const inputTypes: string[] = [];
    el.addEventListener("input", (e) => inputTypes.push((e as InputEvent).inputType));
    simulateKeystrokes(el, "12");
    // First event clears the prior value, then one insertText per character.
    expect(inputTypes).toEqual(["deleteContentBackward", "insertText", "insertText"]);
  });
});

// ─── hasCredentialErrorInDom ─────────────────────────────────────────────────

describe("hasCredentialErrorInDom", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("returns false when the #serverError element is absent", () => {
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });

  test("returns false when #serverError exists but doesn't contain the marker", () => {
    const el = document.createElement("div");
    el.id = CREDENTIAL_ERROR_ELEMENT_ID;
    el.textContent = "Session expired. Please log in again.";
    document.body.appendChild(el);
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });

  test("returns true when #serverError contains the Oracle marker", () => {
    const el = document.createElement("div");
    el.id = CREDENTIAL_ERROR_ELEMENT_ID;
    el.textContent = CREDENTIAL_ERROR_TEXT_MARKER;
    document.body.appendChild(el);
    expect(hasCredentialErrorInDom(document)).toBe(true);
  });

  test("matches the marker as a substring inside longer Oracle copy", () => {
    const el = document.createElement("div");
    el.id = CREDENTIAL_ERROR_ELEMENT_ID;
    el.textContent = `Error: ${CREDENTIAL_ERROR_TEXT_MARKER}. Please retry.`;
    document.body.appendChild(el);
    expect(hasCredentialErrorInDom(document)).toBe(true);
  });
});

// ─── credential-error banner ─────────────────────────────────────────────────

describe("mountCredentialErrorBanner", () => {
  afterEach(() => {
    unmountCredentialErrorBanner(document);
    document.body.innerHTML = "";
  });

  test("inserts a single banner with the extension-branded copy", () => {
    mountCredentialErrorBanner(document);
    const banner = document.getElementById(CREDENTIAL_ERROR_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(CREDENTIAL_ERROR_BANNER_COPY);
    // Extension-author mark: a visible "CUNYAutoLogin" badge distinct from
    // CUNY's own error alerts.
    expect(banner?.textContent).toContain("CUNYAutoLogin");
  });

  test("is idempotent — calling twice leaves exactly one banner", () => {
    mountCredentialErrorBanner(document);
    mountCredentialErrorBanner(document);
    const banners = document.querySelectorAll(`#${CREDENTIAL_ERROR_BANNER_ID}`);
    expect(banners.length).toBe(1);
  });

  test("banner carries role=status and aria-live=polite", () => {
    mountCredentialErrorBanner(document);
    const banner = document.getElementById(CREDENTIAL_ERROR_BANNER_ID);
    expect(banner?.getAttribute("role")).toBe("status");
    expect(banner?.getAttribute("aria-live")).toBe("polite");
  });

  test("unmountCredentialErrorBanner removes the banner", () => {
    mountCredentialErrorBanner(document);
    expect(
      document.getElementById(CREDENTIAL_ERROR_BANNER_ID)
    ).not.toBeNull();
    unmountCredentialErrorBanner(document);
    expect(
      document.getElementById(CREDENTIAL_ERROR_BANNER_ID)
    ).toBeNull();
  });

  test("banner is appended to documentElement so it survives body mutations", () => {
    mountCredentialErrorBanner(document);
    const banner = document.getElementById(CREDENTIAL_ERROR_BANNER_ID);
    expect(banner?.parentElement).toBe(document.documentElement);
  });
});

describe("detectRuiSpaView", () => {
  test("access_denied URL wins before DOM probes", () => {
    document.body.innerHTML = "";
    expect(
      detectRuiSpaView(
        document,
        "https://ssologin.cuny.edu/oaa/rui/oidc/redirect?error=access_denied"
      )
    ).toBe("access_denied");
  });

  test("otp|input present → totp_enroll_verify", () => {
    document.body.innerHTML = '<input id="otp|input" />';
    expect(detectRuiSpaView(document, "https://x/oaa/rui/?h_ra=1")).toBe(
      "totp_enroll_verify"
    );
  });

  test("factor-panel without otp → factors_list", () => {
    document.body.innerHTML = "<factor-panel></factor-panel>";
    expect(detectRuiSpaView(document, "https://x")).toBe("factors_list");
  });

  test("categoryActionheader → oaa_spa_home", () => {
    document.body.innerHTML = '<span id="categoryActionheader">Hi</span>';
    expect(detectRuiSpaView(document, "https://x")).toBe("oaa_spa_home");
  });
});
