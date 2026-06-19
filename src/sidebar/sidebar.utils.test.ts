// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import browser from "webextension-polyfill";
import {
  validateEmail,
  decryptStatusMessage,
  setStatus,
  clearPendingTotpFromSession,
  effectiveTotpSecretForSave,
  groupSecretForDisplay,
  MIN_MASTER_PASSWORD_LENGTH,
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

describe("groupSecretForDisplay", () => {
  test("groups a 32-char Base32 secret into 4-char blocks", () => {
    expect(groupSecretForDisplay("JBSWY3DPEHPK3PXPNVSWG33OMFWWK3DM")).toBe(
      "JBSW Y3DP EHPK 3PXP NVSW G33O MFWW K3DM"
    );
  });

  test("keeps a trailing partial block when length is not a multiple of 4", () => {
    expect(groupSecretForDisplay("JBSWY3DPEHPK3PXPNV")).toBe("JBSW Y3DP EHPK 3PXP NV");
  });

  test("strips existing whitespace before regrouping", () => {
    expect(groupSecretForDisplay("  JBSW Y3DP EHPK 3PXP  ")).toBe("JBSW Y3DP EHPK 3PXP");
  });

  test("returns empty string for an empty secret", () => {
    expect(groupSecretForDisplay("")).toBe("");
    expect(groupSecretForDisplay("   ")).toBe("");
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

  // ── email-spoof-rejection [HIGH] ──────────────────────────────────────────
  // The `@` prefix in the suffix is the entire security boundary.
  // Any address whose domain merely ENDS with `login.cuny.edu` but is not
  // exactly `@login.cuny.edu` must be rejected to prevent domain-spoofing.

  test("domain that appends evil TLD after @login.cuny.edu → false", () => {
    // e.g. attacker registers login.cuny.edu.evil.com
    expect(validateEmail("x@login.cuny.edu.evil.com")).toBe(false);
  });

  test("subdomain of login.cuny.edu → false", () => {
    expect(validateEmail("foo@sublogin.cuny.edu")).toBe(false);
  });

  test("domain with different prefix that still ends with login.cuny.edu → false", () => {
    expect(validateEmail("foo@xlogin.cuny.edu")).toBe(false);
  });

  test("bare domain with no local-part or @ → false", () => {
    expect(validateEmail("login.cuny.edu")).toBe(false);
  });

  // ── email-empty-and-no-at [MEDIUM] ───────────────────────────────────────

  test("empty string → false", () => {
    expect(validateEmail("")).toBe(false);
  });

  test("no @ sign (no domain separator) → false", () => {
    expect(validateEmail("loginatcuny")).toBe(false);
  });

  // Contract: an address with an empty local-part is currently accepted
  // because `"@login.cuny.edu".endsWith("@login.cuny.edu")` is true.
  // This test documents and locks that behaviour; change it only if the
  // product spec explicitly requires a non-empty local part.
  test("empty local-part (@login.cuny.edu) → true (current contract)", () => {
    expect(validateEmail("@login.cuny.edu")).toBe(true);
  });
});

describe("decryptStatusMessage", () => {
  test("decrypt_failed → wrong password message", () => {
    expect(decryptStatusMessage("decrypt_failed")).toBe(
      "Wrong extension password or corrupted vault."
    );
  });

  test("invalid_payload → generic could not decrypt message", () => {
    expect(decryptStatusMessage("invalid_payload")).toBe("Could not decrypt vault.");
  });

  test("crypto_failed → generic could not decrypt message", () => {
    expect(decryptStatusMessage("crypto_failed")).toBe("Could not decrypt vault.");
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

  test("ok=true adds the ok CSS class", () => {
    setStatus("Saved.", true);
    expect(document.getElementById("status")?.classList.contains("ok")).toBe(true);
  });

  test("ok=false (default) removes the ok CSS class", () => {
    const el = document.getElementById("status")!;
    el.classList.add("ok");
    setStatus("Error.");
    expect(el.classList.contains("ok")).toBe(false);
  });

  test("does not throw when #status element is absent", () => {
    document.body.innerHTML = "";
    expect(() => setStatus("no element")).not.toThrow();
  });

  test("a non-empty message un-hides the element", () => {
    const el = document.getElementById("status")!;
    el.hidden = true;
    setStatus("Saved.");
    expect(el.hidden).toBe(false);
  });

  test("an empty message collapses the element (hidden) so it reserves no space", () => {
    const el = document.getElementById("status")!;
    setStatus("");
    expect(el.hidden).toBe(true);
  });
});

describe("clearPendingTotpFromSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls storage.session.remove with the pending TOTP key", async () => {
    const removeSpy = vi
      .spyOn(browser.storage.session, "remove")
      .mockResolvedValue();

    await clearPendingTotpFromSession();

    expect(removeSpy).toHaveBeenCalledWith(PENDING_TOTP_SECRET_SESSION_KEY);
  });

  test("does not throw when storage.session.remove rejects", async () => {
    vi.spyOn(browser.storage.session, "remove").mockRejectedValue(
      new Error("session unavailable")
    );

    await expect(clearPendingTotpFromSession()).resolves.toBeUndefined();
  });
});
