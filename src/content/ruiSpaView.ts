/**
 * Oracle RUI SPA view detection (`.map/README.md` order). No `browser` imports —
 * safe for unit tests and content script.
 */

const isAccessDeniedUrl = (href: string): boolean => {
  try {
    return new URL(href, "https://placeholder.local").searchParams.get("error") === "access_denied";
  } catch {
    return false;
  }
};

export type RuiSpaView =
  | "access_denied"
  | "totp_enroll_verify"
  | "totp_enroll_secret"
  | "factors_list"
  | "oaa_spa_home"
  | "loading";

/** Same order as `.map/README.md` — use `href` only for OAuth deny detection. */
export const detectRuiSpaView = (doc: Document, href: string): RuiSpaView => {
  if (isAccessDeniedUrl(href)) return "access_denied";
  if (doc.getElementById("otp|input")) return "totp_enroll_verify";
  if (doc.querySelector('[aria-labelledby="key-labelled-by|label"]')) return "totp_enroll_secret";
  if (doc.querySelector("factor-panel")) return "factors_list";
  if (doc.getElementById("categoryActionheader")) return "oaa_spa_home";
  return "loading";
};
