/**
 * Extension-authored banner shown on the CUNY tab when the content script
 * detects wrong credentials.
 *
 * Design goals (credential-error UX):
 *   - Visually distinct from CUNY's own alerts. A banner that blends into
 *     CUNY's error UI can read as phishing; a clearly extension-owned banner
 *     reads as the student's extension talking to them.
 *   - Includes an obvious extension-author mark so the source is unambiguous.
 *   - Anchored at the top of the viewport so the student notices even if
 *     their eyes were on the sidebar.
 *   - Idempotent: called multiple times (observer re-fires, etc.) still
 *     results in a single banner in the DOM.
 *
 * Implementation notes:
 *   - Styles are inlined because we can't rely on a stylesheet loading on
 *     CUNY's pages — shadow DOM is a heavier knob than we need for a static
 *     banner, and inline styles resist CUNY's own CSS via !important.
 *   - The element is appended to `document.documentElement` (not
 *     `document.body`) so it survives late body mutations by CUNY's JET app.
 *   - Z-index is `2147483647` (INT_MAX) so CUNY overlays can't hide it.
 */

import { EXTENSION_NAME } from "../cuny/ssoSite";

export const CREDENTIAL_ERROR_BANNER_ID =
  "cunyautologin-credential-error-banner" as const;

export const CREDENTIAL_ERROR_BANNER_TEXT_SELECTOR =
  "[data-cunyautologin-banner-text='credential-error']" as const;

export const CREDENTIAL_ERROR_BANNER_COPY =
  "CUNYAutoLogin: your email or password didn't work. Fix it in the sidebar to keep going." as const;

const BANNER_ICON_TEXT = EXTENSION_NAME;

type BannerStyle = Partial<CSSStyleDeclaration>;

const BANNER_STYLE: BannerStyle = {
  position: "fixed",
  top: "16px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: "2147483647",
  padding: "12px 18px",
  minWidth: "min(560px, calc(100vw - 32px))",
  maxWidth: "calc(100vw - 32px)",
  background: "#1b1233",
  color: "#ffffff",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSize: "14px",
  lineHeight: "1.35",
  borderRadius: "12px",
  border: "2px solid #ffd666",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  pointerEvents: "auto",
};

const BADGE_STYLE: BannerStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  background: "#ffd666",
  color: "#1b1233",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "12px",
  letterSpacing: "0.02em",
  textTransform: "none",
  flex: "0 0 auto",
};

const TEXT_STYLE: BannerStyle = {
  fontWeight: "600",
  flex: "1 1 auto",
};

const applyStyle = (el: HTMLElement, style: BannerStyle): void => {
  for (const key of Object.keys(style) as Array<keyof CSSStyleDeclaration>) {
    const value = style[key];
    if (typeof value === "string") {
      (el.style as unknown as Record<string, string>)[key as string] = value;
    }
  }
};

export const mountCredentialErrorBanner = (doc: Document = document): HTMLElement => {
  const existing = doc.getElementById(CREDENTIAL_ERROR_BANNER_ID);
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const banner = doc.createElement("div");
  banner.id = CREDENTIAL_ERROR_BANNER_ID;
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.dataset.cunyautologinBanner = "credential-error";
  applyStyle(banner, BANNER_STYLE);

  const badge = doc.createElement("span");
  badge.dataset.cunyautologinBannerBadge = "true";
  badge.textContent = BANNER_ICON_TEXT;
  badge.setAttribute("aria-hidden", "false");
  applyStyle(badge, BADGE_STYLE);

  const text = doc.createElement("span");
  text.dataset.cunyautologinBannerText = "credential-error";
  text.textContent = CREDENTIAL_ERROR_BANNER_COPY;
  applyStyle(text, TEXT_STYLE);

  banner.appendChild(badge);
  banner.appendChild(text);
  doc.documentElement.appendChild(banner);
  return banner;
};

export const unmountCredentialErrorBanner = (
  doc: Document = document
): void => {
  const existing = doc.getElementById(CREDENTIAL_ERROR_BANNER_ID);
  existing?.remove();
};

export const TOTP_ERROR_BANNER_ID = "cunyautologin-totp-error-banner" as const;

export const TOTP_ERROR_BANNER_COPY =
  "CUNYAutoLogin: TOTP was rejected — you might be on the wrong factor or the timer rolled over." as const;

const RETRY_BUTTON_STYLE: BannerStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 14px",
  background: "#ffd666",
  color: "#1b1233",
  border: "none",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "12px",
  letterSpacing: "0.02em",
  cursor: "pointer",
  flex: "0 0 auto",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export const mountTotpErrorBanner = (
  onRetry: () => void,
  doc: Document = document
): HTMLElement => {
  const existing = doc.getElementById(TOTP_ERROR_BANNER_ID);
  if (existing instanceof HTMLElement) return existing;

  const banner = doc.createElement("div");
  banner.id = TOTP_ERROR_BANNER_ID;
  banner.setAttribute("role", "alert");
  banner.setAttribute("aria-live", "assertive");
  banner.dataset.cunyautologinBanner = "totp-error";
  applyStyle(banner, BANNER_STYLE);

  const badge = doc.createElement("span");
  badge.textContent = BANNER_ICON_TEXT;
  badge.setAttribute("aria-hidden", "false");
  applyStyle(badge, BADGE_STYLE);

  const text = doc.createElement("span");
  text.dataset.cunyautologinBannerText = "totp-error";
  text.textContent = TOTP_ERROR_BANNER_COPY;
  applyStyle(text, TEXT_STYLE);

  const retryBtn = doc.createElement("button");
  retryBtn.textContent = "Try again";
  retryBtn.setAttribute("type", "button");
  applyStyle(retryBtn, RETRY_BUTTON_STYLE);
  retryBtn.addEventListener("click", () => {
    banner.remove();
    onRetry();
  });

  banner.appendChild(badge);
  banner.appendChild(text);
  banner.appendChild(retryBtn);
  doc.documentElement.appendChild(banner);
  return banner;
};

export const unmountTotpErrorBanner = (doc: Document = document): void => {
  doc.getElementById(TOTP_ERROR_BANNER_ID)?.remove();
};
