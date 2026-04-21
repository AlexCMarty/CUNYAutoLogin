// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from "vitest";
import {
  normalizeTotpSecretCandidate,
  parseTotpSecretFromEnrollDom,
  setInputValue,
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
