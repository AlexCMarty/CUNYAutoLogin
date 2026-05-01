import { parseTotpSecretFromEnrollDom } from "./content.utils";
import {
  WAIT_FOR_ELEMENT_TIMEOUT_MS,
  WAIT_FOR_TOTP_SECRET_TIMEOUT_MS,
} from "../cuny/ssoSite";

/**
 * Waits for a DOM element to appear by repeatedly calling `find()` on every
 * DOM mutation. Uses MutationObserver so it fires the moment the element is
 * inserted — no polling. Needed because both CUNY SSO pages render their form
 * inputs asynchronously via Oracle JET / RequireJS, long after document_idle
 * fires.
 *
 * Resolves null after timeoutMs if find() never returns a non-null value.
 */
export const waitForElement = <T extends HTMLElement>(
  find: () => T | null,
  timeoutMs = WAIT_FOR_ELEMENT_TIMEOUT_MS
): Promise<T | null> =>
  new Promise((resolve) => {
    const existing = find();
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });

/**
 * Convenience wrapper around waitForElement for inputs looked up by ID.
 * Uses getElementById rather than querySelector so special characters in IDs
 * (e.g. the | in "otpValue|input") are treated as plain strings, not CSS
 * namespace syntax.
 */
export const waitForInputById = (
  id: string,
  timeoutMs = WAIT_FOR_ELEMENT_TIMEOUT_MS
): Promise<HTMLInputElement | null> =>
  waitForElement(() => {
    const el = document.getElementById(id);
    return el instanceof HTMLInputElement ? el : null;
  }, timeoutMs);

/** Waits until the enroll page injects a plausible Base32 secret into the labelled node. */
export const waitForEnrollTotpSecret = (timeoutMs = WAIT_FOR_TOTP_SECRET_TIMEOUT_MS): Promise<string | null> =>
  new Promise((resolve) => {
    const existing = parseTotpSecretFromEnrollDom();
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const secret = parseTotpSecretFromEnrollDom();
      if (secret) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(secret);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
