// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import {
  CREDENTIAL_ERROR_BANNER_ID,
  CREDENTIAL_ERROR_BANNER_TEXT_SELECTOR,
  CREDENTIAL_ERROR_BANNER_COPY,
  TOTP_ERROR_BANNER_ID,
  TOTP_ERROR_BANNER_COPY,
  mountCredentialErrorBanner,
  unmountCredentialErrorBanner,
  mountTotpErrorBanner,
  unmountTotpErrorBanner,
} from "./banner";

beforeEach(() => {
  document.documentElement.innerHTML = "<head></head><body></body>";
});

afterEach(() => {
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("constants", () => {
  test('CREDENTIAL_ERROR_BANNER_ID is "cunyautologin-credential-error-banner"', () => {
    expect(CREDENTIAL_ERROR_BANNER_ID).toBe("cunyautologin-credential-error-banner");
  });

  test('TOTP_ERROR_BANNER_ID is "cunyautologin-totp-error-banner"', () => {
    expect(TOTP_ERROR_BANNER_ID).toBe("cunyautologin-totp-error-banner");
  });

  test("CREDENTIAL_ERROR_BANNER_COPY mentions email and password", () => {
    expect(CREDENTIAL_ERROR_BANNER_COPY).toContain("email or password");
  });

  test("TOTP_ERROR_BANNER_COPY mentions TOTP", () => {
    expect(TOTP_ERROR_BANNER_COPY).toContain("TOTP");
  });

  test('CREDENTIAL_ERROR_BANNER_TEXT_SELECTOR targets data attribute "credential-error"', () => {
    expect(CREDENTIAL_ERROR_BANNER_TEXT_SELECTOR).toContain("credential-error");
  });
});

describe("mountCredentialErrorBanner", () => {
  test("appends banner to documentElement", () => {
    mountCredentialErrorBanner(document);
    const banner = document.getElementById(CREDENTIAL_ERROR_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(document.documentElement.contains(banner)).toBe(true);
  });

  test("banner has the expected id", () => {
    const banner = mountCredentialErrorBanner(document);
    expect(banner.id).toBe(CREDENTIAL_ERROR_BANNER_ID);
  });

  test("banner contains the credential error copy text", () => {
    mountCredentialErrorBanner(document);
    const textEl = document.querySelector(CREDENTIAL_ERROR_BANNER_TEXT_SELECTOR);
    expect(textEl?.textContent).toBe(CREDENTIAL_ERROR_BANNER_COPY);
  });

  test("banner has role=status", () => {
    const banner = mountCredentialErrorBanner(document);
    expect(banner.getAttribute("role")).toBe("status");
  });

  test("banner has aria-live=polite", () => {
    const banner = mountCredentialErrorBanner(document);
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });

  test("idempotent — calling twice returns the same element", () => {
    const first = mountCredentialErrorBanner(document);
    const second = mountCredentialErrorBanner(document);
    expect(first).toBe(second);
  });

  test("idempotent — only one banner in DOM after two calls", () => {
    mountCredentialErrorBanner(document);
    mountCredentialErrorBanner(document);
    const all = document.querySelectorAll(`#${CREDENTIAL_ERROR_BANNER_ID}`);
    expect(all.length).toBe(1);
  });

  test("returns the existing element on second call", () => {
    mountCredentialErrorBanner(document);
    const second = mountCredentialErrorBanner(document);
    expect(second.id).toBe(CREDENTIAL_ERROR_BANNER_ID);
  });
});

describe("unmountCredentialErrorBanner", () => {
  test("removes the banner from the DOM", () => {
    mountCredentialErrorBanner(document);
    unmountCredentialErrorBanner(document);
    expect(document.getElementById(CREDENTIAL_ERROR_BANNER_ID)).toBeNull();
  });

  test("no-op when banner is not present", () => {
    expect(() => unmountCredentialErrorBanner(document)).not.toThrow();
  });

  test("calling unmount twice does not throw", () => {
    mountCredentialErrorBanner(document);
    unmountCredentialErrorBanner(document);
    expect(() => unmountCredentialErrorBanner(document)).not.toThrow();
  });
});

describe("mountTotpErrorBanner", () => {
  test("appends TOTP error banner to documentElement", () => {
    mountTotpErrorBanner(vi.fn(), document);
    const banner = document.getElementById(TOTP_ERROR_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(document.documentElement.contains(banner)).toBe(true);
  });

  test("banner has role=alert", () => {
    const banner = mountTotpErrorBanner(vi.fn(), document);
    expect(banner.getAttribute("role")).toBe("alert");
  });

  test("banner has aria-live=assertive", () => {
    const banner = mountTotpErrorBanner(vi.fn(), document);
    expect(banner.getAttribute("aria-live")).toBe("assertive");
  });

  test("banner contains the TOTP error copy text", () => {
    mountTotpErrorBanner(vi.fn(), document);
    const textEl = document.querySelector("[data-cunyautologin-banner-text='totp-error']");
    expect(textEl?.textContent).toBe(TOTP_ERROR_BANNER_COPY);
  });

  test("banner contains a retry button", () => {
    mountTotpErrorBanner(vi.fn(), document);
    const btn = document.querySelector<HTMLButtonElement>("button");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe("Try again");
  });

  test("clicking retry button calls onRetry callback", () => {
    const onRetry = vi.fn();
    mountTotpErrorBanner(onRetry, document);
    const btn = document.querySelector<HTMLButtonElement>("button")!;
    btn.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("clicking retry button removes the banner from DOM", () => {
    const onRetry = vi.fn();
    mountTotpErrorBanner(onRetry, document);
    const btn = document.querySelector<HTMLButtonElement>("button")!;
    btn.click();
    expect(document.getElementById(TOTP_ERROR_BANNER_ID)).toBeNull();
  });

  test("idempotent — calling twice returns the same element", () => {
    const first = mountTotpErrorBanner(vi.fn(), document);
    const second = mountTotpErrorBanner(vi.fn(), document);
    expect(first).toBe(second);
  });

  test("idempotent — only one TOTP banner in DOM after two calls", () => {
    mountTotpErrorBanner(vi.fn(), document);
    mountTotpErrorBanner(vi.fn(), document);
    const all = document.querySelectorAll(`#${TOTP_ERROR_BANNER_ID}`);
    expect(all.length).toBe(1);
  });
});

describe("unmountTotpErrorBanner", () => {
  test("removes the TOTP banner from the DOM", () => {
    mountTotpErrorBanner(vi.fn(), document);
    unmountTotpErrorBanner(document);
    expect(document.getElementById(TOTP_ERROR_BANNER_ID)).toBeNull();
  });

  test("no-op when banner is not present", () => {
    expect(() => unmountTotpErrorBanner(document)).not.toThrow();
  });
});

describe("mountCredentialErrorBanner — badge text", () => {
  test("badge element contains the extension name text", () => {
    const banner = mountCredentialErrorBanner(document);
    const badge = banner.querySelector("[data-cunyautologin-banner-badge]");
    expect(badge?.textContent).toBeTruthy();
  });

  test("badge aria-hidden is 'false'", () => {
    const banner = mountCredentialErrorBanner(document);
    const badge = banner.querySelector("[data-cunyautologin-banner-badge]");
    expect(badge?.getAttribute("aria-hidden")).toBe("false");
  });
});

describe("mountTotpErrorBanner — badge text and retry interaction", () => {
  test("badge element contains the extension name text", () => {
    const banner = mountTotpErrorBanner(vi.fn(), document);
    // Badge is the first span child
    const badge = banner.querySelector("span");
    expect(badge?.textContent).toBeTruthy();
  });

  test("retry button has type='button'", () => {
    mountTotpErrorBanner(vi.fn(), document);
    const btn = document.querySelector<HTMLButtonElement>("button");
    expect(btn?.getAttribute("type")).toBe("button");
  });

  test("clicking retry on the existing banner (second mountTotpErrorBanner call) still calls original onRetry once", () => {
    const onRetry1 = vi.fn();
    const onRetry2 = vi.fn();
    mountTotpErrorBanner(onRetry1, document);
    // Second call is a no-op returning the existing element — onRetry2 is never wired
    mountTotpErrorBanner(onRetry2, document);
    const btn = document.querySelector<HTMLButtonElement>("button")!;
    btn.click();
    expect(onRetry1).toHaveBeenCalledOnce();
    expect(onRetry2).not.toHaveBeenCalled();
  });

  test("calling unmountTotpErrorBanner twice does not throw", () => {
    mountTotpErrorBanner(vi.fn(), document);
    unmountTotpErrorBanner(document);
    expect(() => unmountTotpErrorBanner(document)).not.toThrow();
  });
});
