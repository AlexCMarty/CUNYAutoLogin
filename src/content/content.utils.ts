import {
  TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY,
  TOTP_SECRET_LEN_MIN,
  TOTP_SECRET_LEN_MAX,
  normalizeTotpSecretCandidate,
} from "../cuny/ssoSite";

export { TOTP_SECRET_LEN_MIN, TOTP_SECRET_LEN_MAX, normalizeTotpSecretCandidate };

export const TOTP_SECRET_SELECTOR = `[aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}"]`;

export function parseTotpSecretFromEnrollDom(): string | null {
  const el = document.querySelector(TOTP_SECRET_SELECTOR);
  if (!(el instanceof HTMLElement)) {
    return null;
  }
  return normalizeTotpSecretCandidate(el.textContent ?? "");
}

/**
 * Sets an input's value in a way that notifies Oracle JET's Knockout.js bindings.
 * A plain `.value =` assignment bypasses the framework's change detection, so we
 * use the native HTMLInputElement prototype setter and then dispatch the events
 * that KO listens for.
 */
export function setInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface FillMessage {
  type: "FILL_CREDENTIALS";
  payload: {
    email: string;
    password: string;
    totpSecret: string;
  };
}

export function isFillMessage(msg: unknown): msg is FillMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "FILL_CREDENTIALS") return false;
  const p = m.payload;
  if (typeof p !== "object" || p === null) return false;
  const payload = p as Record<string, unknown>;
  return (
    typeof payload.email === "string" &&
    typeof payload.password === "string" &&
    typeof payload.totpSecret === "string"
  );
}
