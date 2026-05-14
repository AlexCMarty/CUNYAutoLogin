/**
 * WebAuthn PRF-based biometric vault unlock.
 *
 * Enrollment: credentials.create() registers a platform credential and
 * requests the PRF extension. If the platform authenticator returns the PRF
 * output during create() (Windows Hello / Chrome does), enrollment completes
 * in one prompt. Otherwise a second credentials.get() prompt derives it.
 *
 * Unlock: credentials.get() re-derives the same PRF secret (one prompt),
 * decrypts the wrapped master password, and returns it for decryptVault().
 *
 * Requires Chrome 122+ or Firefox 150+ (host_permissions over ssologin.cuny.edu
 * allows rp.id to be set from an extension page). On Firefox 128–149 the
 * credentials call throws SecurityError → "unsupported_browser".
 */

import browser from "webextension-polyfill";
import { ResultAsync } from "neverthrow";
import { EXTENSION_NAME, WEBAUTHN_RP_ID } from "../cuny/ssoSite";

export const BIOMETRIC_STORAGE_KEY = "cunyBiometricCredential" as const;

const WEBAUTHN_TIMEOUT_MS = 60_000;
const IV_LENGTH = 12;
const WEBAUTHN_CHALLENGE_BYTES = 32;
const WEBAUTHN_PRF_SALT_BYTES = 32;
const WEBAUTHN_USER_ID_BYTES = 16;
const COSE_ALG_ES256 = -7;
const COSE_ALG_RS256 = -257;

const KNOWN_AUTHENTICATOR_TRANSPORTS: ReadonlySet<AuthenticatorTransport> = new Set([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "usb",
]);

const isAuthenticatorTransport = (value: string): value is AuthenticatorTransport =>
  (KNOWN_AUTHENTICATOR_TRANSPORTS as ReadonlySet<string>).has(value);

const narrowTransports = (transports: readonly string[]): AuthenticatorTransport[] =>
  transports.filter(isAuthenticatorTransport);

const prfExtensionInputs = (
  prfSalt: Uint8Array<ArrayBuffer>
): AuthenticationExtensionsClientInputs =>
  ({ prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs);

const extractPrfResult = (credential: PublicKeyCredential): ArrayBuffer | undefined => {
  const extResults = credential.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: unknown } };
  };
  const candidate = extResults.prf?.results?.first;
  return candidate instanceof ArrayBuffer ? candidate : undefined;
};

export type BiometricError =
  | "unsupported_browser" // SecurityError / NotSupportedError — Firefox < 150 or no platform authenticator
  | "user_cancelled"      // NotAllowedError / AbortError — user dismissed or timed out
  | "prf_unavailable"     // Authenticator connected but HMAC-secret / PRF extension not supported
  | "storage_error"
  | "crypto_error"
  | "not_enrolled";

interface StoredBiometricCredential {
  version: 1;
  credentialIdB64: string;
  /** Transports from getTransports() — used in allowCredentials so Chrome routes to platform authenticator. */
  transports: string[];
  prfSaltB64: string;
  ivB64: string;
  wrappedMasterB64: string;
}

class PrfUnavailableError extends Error {}
class NotEnrolledError extends Error {}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let idx = 0; idx < bytes.length; idx++) {
    binary += String.fromCharCode(bytes[idx]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx++) {
    out[idx] = binary.charCodeAt(idx);
  }
  return out;
}

const mapWebAuthnError = (error: unknown): BiometricError => {
  if (error instanceof PrfUnavailableError) return "prf_unavailable";
  if (error instanceof NotEnrolledError) return "not_enrolled";
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return "user_cancelled";
    }
    if (
      error.name === "SecurityError" ||
      error.name === "NotSupportedError" ||
      error.name === "InvalidStateError"
    ) {
      return "unsupported_browser";
    }
  }
  return "crypto_error";
};

const isStoredBiometricCredential = (value: unknown): value is StoredBiometricCredential => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.credentialIdB64 === "string" &&
    Array.isArray(candidate.transports) &&
    typeof candidate.prfSaltB64 === "string" &&
    typeof candidate.ivB64 === "string" &&
    typeof candidate.wrappedMasterB64 === "string"
  );
};

const readStoredCredential = async (): Promise<StoredBiometricCredential | null> => {
  const stored = await browser.storage.local.get(BIOMETRIC_STORAGE_KEY);
  const value = stored[BIOMETRIC_STORAGE_KEY];
  return isStoredBiometricCredential(value) ? value : null;
};

async function prfViaGet(
  credentialId: Uint8Array<ArrayBuffer>,
  transports: readonly string[],
  prfSalt: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  const rawAssertion = await navigator.credentials.get({
    publicKey: {
      rpId: WEBAUTHN_RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(WEBAUTHN_CHALLENGE_BYTES)),
      allowCredentials: [{
        id: credentialId,
        type: "public-key" as const,
        transports: narrowTransports(transports),
      }],
      userVerification: "required",
      timeout: WEBAUTHN_TIMEOUT_MS,
      extensions: prfExtensionInputs(prfSalt),
    },
  });
  if (!(rawAssertion instanceof PublicKeyCredential)) {
    throw new TypeError("unexpected assertion type");
  }
  const prfOutput = extractPrfResult(rawAssertion);
  if (!prfOutput) throw new PrfUnavailableError();
  return prfOutput;
}

async function wrapMasterPassword(
  prfOutput: ArrayBuffer,
  masterPassword: string
): Promise<{ iv: Uint8Array; wrappedMaster: Uint8Array }> {
  const aesKey = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrappedMaster = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      new TextEncoder().encode(masterPassword)
    )
  );
  return { iv, wrappedMaster };
}

/**
 * Enrollment:
 * - Requests PRF during create() — on Windows Hello / Chrome the PRF output
 *   is returned immediately (one prompt total).
 * - If the platform doesn't return PRF from create(), falls back to a second
 *   get() call (two prompts).
 * - Transports from getTransports() are stored so future get() calls can
 *   specify them in allowCredentials, routing Chrome to the platform
 *   authenticator instead of the security-key fallback.
 */
export const enrollBiometric = (masterPassword: string): ResultAsync<void, BiometricError> =>
  ResultAsync.fromPromise(
    (async () => {
      const prfSalt = crypto.getRandomValues(new Uint8Array(WEBAUTHN_PRF_SALT_BYTES));

      // Step 1 — register the platform credential, requesting PRF eval in one shot
      const rawCredential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(WEBAUTHN_CHALLENGE_BYTES)),
          rp: { name: EXTENSION_NAME, id: WEBAUTHN_RP_ID },
          user: {
            id: crypto.getRandomValues(new Uint8Array(WEBAUTHN_USER_ID_BYTES)),
            name: "cuny-user",
            displayName: "CUNY User",
          },
          pubKeyCredParams: [
            { type: "public-key" as const, alg: COSE_ALG_ES256 },
            { type: "public-key" as const, alg: COSE_ALG_RS256 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
          attestation: "none" as const,
          timeout: WEBAUTHN_TIMEOUT_MS,
          // Request PRF during create — platform authenticators (Windows Hello,
          // Touch ID) return the output here, saving a second get() prompt.
          extensions: prfExtensionInputs(prfSalt),
        },
      });

      if (!(rawCredential instanceof PublicKeyCredential)) {
        throw new TypeError("unexpected credential type");
      }

      const credentialId = new Uint8Array(rawCredential.rawId);

      // Capture transports so allowCredentials in future get() calls can route
      // directly to the platform authenticator, avoiding the security-key dialog.
      const attestationResponse = rawCredential.response as AuthenticatorAttestationResponse;
      const transports: string[] =
        typeof attestationResponse.getTransports === "function"
          ? attestationResponse.getTransports()
          : ["internal"];

      // Step 2 — check whether the platform supports PRF at all
      const createExtResults = rawCredential.getClientExtensionResults() as {
        prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
      };

      const prfFromCreate = extractPrfResult(rawCredential);

      if (import.meta.env.MODE !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[CUNYAutoLogin] biometric create ext results", JSON.stringify({
          prfEnabled: createExtResults.prf?.enabled,
          prfHasResults: prfFromCreate !== undefined,
          transports,
        }));
      }

      // prf.enabled === false means the platform (e.g. Windows Hello pre-25H2,
      // Chrome GPM) does not support HMAC-secret. Calling get() with PRF would
      // cause Windows to show "Something went wrong". Bail immediately so the
      // prep screen shows the graceful fallback instead.
      if (createExtResults.prf?.enabled === false) throw new PrfUnavailableError();

      // Prefer PRF from create() (one prompt); fall back to get() if enabled but deferred.
      const prfOutput: ArrayBuffer =
        prfFromCreate ?? await prfViaGet(credentialId, transports, prfSalt);

      // Step 3 — AES-GCM-wrap the master password with a key derived from PRF output
      const { iv, wrappedMaster } = await wrapMasterPassword(prfOutput, masterPassword);

      // Step 4 — persist (no plaintext secrets in this blob)
      const stored: StoredBiometricCredential = {
        version: 1,
        credentialIdB64: bytesToBase64(credentialId),
        transports,
        prfSaltB64: bytesToBase64(prfSalt),
        ivB64: bytesToBase64(iv),
        wrappedMasterB64: bytesToBase64(wrappedMaster),
      };
      await browser.storage.local.set({ [BIOMETRIC_STORAGE_KEY]: stored });
    })(),
    mapWebAuthnError
  );

/**
 * Single get() prompt: re-derives the PRF secret, decrypts the wrapped master
 * password, and returns it for the normal decryptVault() path.
 */
export const unlockWithBiometric = (): ResultAsync<string, BiometricError> =>
  ResultAsync.fromPromise(
    (async () => {
      const stored = await readStoredCredential();
      if (!stored) throw new NotEnrolledError();

      const credentialId = base64ToBytes(stored.credentialIdB64);
      const prfSalt = base64ToBytes(stored.prfSaltB64);
      const iv = base64ToBytes(stored.ivB64);
      const wrappedMaster = base64ToBytes(stored.wrappedMasterB64);

      const rawAssertion = await navigator.credentials.get({
        publicKey: {
          rpId: WEBAUTHN_RP_ID,
          challenge: crypto.getRandomValues(new Uint8Array(WEBAUTHN_CHALLENGE_BYTES)),
          allowCredentials: [{
            id: credentialId,
            type: "public-key" as const,
            transports: narrowTransports(stored.transports),
          }],
          userVerification: "required",
          timeout: WEBAUTHN_TIMEOUT_MS,
          extensions: prfExtensionInputs(prfSalt),
        },
      });

      if (!(rawAssertion instanceof PublicKeyCredential)) {
        throw new TypeError("unexpected assertion type");
      }

      const prfOutput = extractPrfResult(rawAssertion);
      if (!prfOutput) throw new PrfUnavailableError();

      const aesKey = await crypto.subtle.importKey(
        "raw",
        prfOutput,
        "AES-GCM",
        false,
        ["encrypt", "decrypt"]
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        aesKey,
        wrappedMaster as BufferSource
      );
      return new TextDecoder().decode(plaintext);
    })(),
    mapWebAuthnError
  );

const logStorageWarning = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] biometric: ${context}`, error);
  }
};

export const isBiometricEnrolled = async (): Promise<boolean> => {
  try {
    return (await readStoredCredential()) !== null;
  } catch (error) {
    logStorageWarning("isBiometricEnrolled read failed", error);
    return false;
  }
};

export const clearBiometricCredential = async (): Promise<void> => {
  try {
    await browser.storage.local.remove(BIOMETRIC_STORAGE_KEY);
  } catch (error) {
    logStorageWarning("clearBiometricCredential failed", error);
  }
};
