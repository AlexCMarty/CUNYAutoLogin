import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
  TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY,
  TOTP_SECRET_LEN_MIN,
  TOTP_SECRET_LEN_MAX,
  normalizeTotpSecretCandidate,
} from "../cuny/ssoSite";

export { TOTP_SECRET_LEN_MIN, TOTP_SECRET_LEN_MAX, normalizeTotpSecretCandidate };

/**
 * How long to watch the DOM for a post-submit `serverError` alert before
 * giving up. Oracle usually renders the alert within ~300ms after POST; 8s
 * is generous but still bounded so we never leak an observer across a real
 * navigation.
 */
export const POST_SUBMIT_ERROR_OBSERVE_MS = 8000;

/**
 * True if the credential-page `#serverError` alert element is present AND
 * its text still contains the Oracle-produced "Incorrect Username or
 * Password" marker. We check the text because Oracle re-uses the same
 * element ID for other transient server messages.
 */
export function hasCredentialErrorInDom(doc: Document = document): boolean {
  const el = doc.getElementById(CREDENTIAL_ERROR_ELEMENT_ID);
  if (!el) return false;
  const text = (el.textContent ?? "").trim();
  return text.includes(CREDENTIAL_ERROR_TEXT_MARKER);
}

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
 *
 * Works for most JET inputs. Does NOT work for otp|input on totp-enroll-verify —
 * use simulateKeystrokes for that specific input instead.
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

/**
 * Fills an input by dispatching per-character keyboard and input events, then
 * updating the value one character at a time. Required for otp|input on the
 * totp-enroll-verify SPA view, where JET's Knockout.js observable does not
 * respond to the bulk native-setter approach used by setInputValue — the model
 * stays empty and Oracle returns a client-side "Enter a OTP code" error.
 */
export function simulateKeystrokes(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  el.focus();
  // Clear any prior value first so retries replace rather than append. Drive
  // the JET observable to empty via a deletion `input` event before keystrokes
  // start; otherwise a wrong-code retry produces "876345901234" not "901234".
  if (el.value.length > 0) {
    if (setter) setter.call(el, "");
    else el.value = "";
    el.dispatchEvent(
      new InputEvent("input", { inputType: "deleteContentBackward", bubbles: true })
    );
  }
  for (const char of value) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }));
    el.dispatchEvent(new InputEvent("beforeinput", { data: char, inputType: "insertText", bubbles: true, cancelable: true }));
    if (setter) {
      setter.call(el, el.value + char);
    } else {
      el.value += char;
    }
    el.dispatchEvent(new InputEvent("input", { data: char, inputType: "insertText", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
  }
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
