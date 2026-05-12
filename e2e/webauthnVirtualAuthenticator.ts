/**
 * Chrome DevTools Protocol bridge for installing a virtual platform authenticator
 * during E2E runs. Mirrors the configuration used by `scripts/capture-sidebar.mjs`
 * so onboarding `BIOMETRIC_OFFER` / `BIOMETRIC_PREP` and vault biometric unlock
 * behave deterministically in headless Chromium.
 *
 * The CDP `WebAuthn` domain is documented at:
 * https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
 *
 * The virtual authenticator is scoped to a single WebContents (tab), so the
 * caller must attach it to the page that runs the WebAuthn ceremony — the
 * sidebar page in every flow this project tests.
 */
import type { CDPSession, Page } from "@playwright/test";

export interface VirtualAuthenticatorOptions {
  /** Advertise the PRF extension. Defaults to true (matches Windows Hello / Touch ID for our PRF-based unlock). */
  hasPrf?: boolean;
  /** Whether user verification (PIN / biometric gesture) automatically succeeds. Defaults to true. */
  isUserVerified?: boolean;
  /** Whether tests of user presence resolve immediately. Defaults to true. */
  automaticPresenceSimulation?: boolean;
}

export interface VirtualPlatformAuthenticator {
  /** CDP session bound to the page; reusable for `setUserVerified`, `getCredentials`, etc. */
  readonly cdp: CDPSession;
  /** Opaque CDP identifier; pass to further `WebAuthn.*` calls. */
  readonly authenticatorId: string;
  /** Tear down the authenticator and detach the CDP session. Safe to call multiple times. */
  remove(): Promise<void>;
  /** Toggle whether subsequent ceremonies treat user verification as successful. */
  setUserVerified(isUserVerified: boolean): Promise<void>;
  /** List credentials currently held by this authenticator. */
  getCredentials(): Promise<Array<{ credentialId: string; rpId: string }>>;
}

/**
 * Adds a CTAP2 platform (`internal` transport) virtual authenticator with
 * automatic presence and user verification. Returns a controller bound to the
 * given `page`.
 */
export async function addVirtualPlatformAuthenticator(
  page: Page,
  options: VirtualAuthenticatorOptions = {}
): Promise<VirtualPlatformAuthenticator> {
  const {
    hasPrf = true,
    isUserVerified = true,
    automaticPresenceSimulation = true,
  } = options;

  const cdp = await page.context().newCDPSession(page);
  // `enableUI: false` is recommended for automation per the CDP docs — avoids
  // the platform credential picker that would block the test.
  await cdp.send("WebAuthn.enable", { enableUI: false });

  const { authenticatorId } = (await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified,
      hasPrf,
      automaticPresenceSimulation,
    },
  })) as { authenticatorId: string };

  let removed = false;
  const remove = async (): Promise<void> => {
    if (removed) return;
    removed = true;
    await cdp
      .send("WebAuthn.removeVirtualAuthenticator", { authenticatorId })
      .catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  };

  return {
    cdp,
    authenticatorId,
    remove,
    async setUserVerified(nextIsUserVerified: boolean): Promise<void> {
      await cdp.send("WebAuthn.setUserVerified", {
        authenticatorId,
        isUserVerified: nextIsUserVerified,
      });
    },
    async getCredentials(): Promise<Array<{ credentialId: string; rpId: string }>> {
      const result = (await cdp.send("WebAuthn.getCredentials", {
        authenticatorId,
      })) as { credentials: Array<{ credentialId: string; rpId: string }> };
      return result.credentials;
    },
  };
}

/**
 * Convenience scope helper: installs a virtual authenticator, runs `fn`, and
 * always tears down — even on assertion failure. Prefer this when a single
 * test owns the authenticator end-to-end.
 */
export async function withVirtualPlatformAuthenticator<T>(
  page: Page,
  fn: (authenticator: VirtualPlatformAuthenticator) => Promise<T>,
  options: VirtualAuthenticatorOptions = {}
): Promise<T> {
  const authenticator = await addVirtualPlatformAuthenticator(page, options);
  try {
    return await fn(authenticator);
  } finally {
    await authenticator.remove();
  }
}
