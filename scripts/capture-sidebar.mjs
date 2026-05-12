#!/usr/bin/env node
/**
 * Capture a PNG of the extension sidebar (chrome-extension URL) for visual QA.
 *
 * Requires a built extension: `npm run build:e2e` (writes to dist/).
 *
 * Usage:
 *   node scripts/capture-sidebar.mjs '#qa=WELCOME'
 *   node scripts/capture-sidebar.mjs --hash '#qa=SOME_STATE'
 *   node scripts/capture-sidebar.mjs --out-dir /tmp/caps '#qa=EMAIL_ENTRY'
 *   node scripts/capture-sidebar.mjs --width 400 --height 900 '#qa=WELCOME'
 *   node scripts/capture-sidebar.mjs --qa-vault-locked
 *   node scripts/capture-sidebar.mjs --qa-vault-unlocked
 *   node scripts/capture-sidebar.mjs --capture-all
 *
 * On success, prints one absolute path per captured PNG to stdout.
 * Logs and errors go to stderr.
 */

import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const defaultExtensionDir = path.join(repoRoot, "dist");
const defaultOutDir = path.join(repoRoot, "agent_screenshots");
/** Defaults approximate a Chrome side panel (narrow, tall). */
const defaultViewportWidth = 380;
const defaultViewportHeight = 800;

/**
 * QA vault constants — mirror devQaJump.ts defaults and src/cuny/ssoSite.ts.
 * The master password is only used for a synthetic in-memory vault; it is never
 * stored in extension storage beyond this QA session.
 */
const QA_MASTER_PASSWORD = "Dev-QA-master-123";
const QA_VAULT_PAYLOAD = {
  email: "visual-qa@login.cuny.edu",
  password: "Dev-QA-password-seed-not-real",
  totpSecret: "JBSWY3DPEHPK3PXP",
};
const SESSION_MASTER_KEY = "cunySessionMaster"; // src/cuny/ssoSite.ts

/**
 * All 22 visual states the sidebar can show, in logical order.
 * Vault-locked and vault-unlocked are special strings handled separately.
 */
const ALL_STATES = [
  "#qa=WELCOME",
  "#qa=EMAIL_ENTRY",
  "#qa=EMAIL_ENTRY&qaCred=email",
  "#qa=PASSWORD_ENTRY",
  "#qa=PASSWORD_ENTRY&qaCred=password",
  "#qa=OPENING_CUNY",
  "#qa=CUNY_TOTP",
  "#qa=ALLOW_GATE",
  "#qa=OAA_SPA_HOME",
  "#qa=GUIDED_MANAGE",
  "#qa=GUIDED_ADD_FACTOR",
  "#qa=GUIDED_FACTOR_TYPE",
  "#qa=GUIDED_SECRET_CAPTURE",
  "#qa=VERIFY_LOGIN_CODE",
  "#qa=SET_DEFAULT",
  "#qa=EXT_PASSWORD_SETUP",
  "#qa=BIOMETRIC_OFFER",
  "#qa=BIOMETRIC_PREP",
  "#qa=COMPLETE_DEMO",
  "#qa=COMPLETE_DONE",
  "--qa-vault-locked",
  "--qa-vault-unlocked",
];

function usage() {
  process.stderr.write(`Usage: capture-sidebar.mjs [options] [<hash-fragment>]

Options:
  --hash <string>       URL hash (e.g. #qa=WELCOME). Overrides positional fragment.
  --out-dir <path>      Directory for PNG (default: agent_screenshots under repo root)
  --extension-dir       Unpacked extension directory (default: dist)
  --width <px>          Browser viewport width (default: ${defaultViewportWidth})
  --height <px>         Browser viewport height (default: ${defaultViewportHeight})
  --full-page           Use full-page screenshot (default: true)
  --no-full-page        Viewport-only screenshot
  --qa-vault-locked     Inject a dummy vault so the sidebar renders in locked-vault mode
                        (biometric unlock button force-shown for QA)
  --qa-vault-locked-no-biometric
                        Same as --qa-vault-locked but without the biometric button —
                        reflects the locked state for users who have not enrolled biometrics
  --qa-vault-unlocked   Inject a real encrypted vault + session master so the sidebar
                        renders in unlocked-vault / management mode
  --capture-all         Capture all 22 visual states, one PNG each; prints one path per
                        line. Ignores --hash / positional fragment.

Hash-fragment shortcuts:
  Positional may be "#qa=WELCOME" or "qa=WELCOME" (leading # optional).
  Onboarding states:
    WELCOME, EMAIL_ENTRY, PASSWORD_ENTRY, OPENING_CUNY, CUNY_TOTP, ALLOW_GATE,
    OAA_SPA_HOME, GUIDED_MANAGE, GUIDED_ADD_FACTOR, GUIDED_FACTOR_TYPE,
    GUIDED_SECRET_CAPTURE, VERIFY_LOGIN_CODE, SET_DEFAULT, EXT_PASSWORD_SETUP,
    BIOMETRIC_OFFER, BIOMETRIC_PREP, COMPLETE_DEMO, COMPLETE_DONE
  Credential-error variants (no dedicated state — renders inline on the screen):
    #qa=EMAIL_ENTRY&qaCred=email        email field error
    #qa=PASSWORD_ENTRY&qaCred=password  password field error
  CREDENTIAL_ERROR has no screen mount — use the qaCred variants above instead.

Requires: npm run build:e2e (or equivalent) so dist/ exists.
`);
}

function parseArgs(argv) {
  /** @type {{ hash: string; outDir: string; extensionDir: string; fullPage: boolean; viewportWidth: number; viewportHeight: number; qaVaultLocked: boolean; qaVaultUnlocked: boolean; captureAll: boolean }} */
  const opts = {
    hash: "",
    outDir: defaultOutDir,
    extensionDir: defaultExtensionDir,
    fullPage: true,
    viewportWidth: defaultViewportWidth,
    viewportHeight: defaultViewportHeight,
    qaVaultLocked: false,
    qaVaultLockedNoBiometric: false,
    qaVaultUnlocked: false,
    captureAll: false,
  };
  const positionals = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      return { help: true, opts, positionals };
    }
    if (a === "--hash") {
      opts.hash = argv[++i] ?? "";
      continue;
    }
    if (a === "--out-dir") {
      opts.outDir = path.resolve(argv[++i] ?? "");
      continue;
    }
    if (a === "--extension-dir") {
      opts.extensionDir = path.resolve(argv[++i] ?? "");
      continue;
    }
    if (a === "--width") {
      opts.viewportWidth = parseViewportPx(argv[++i], "width");
      continue;
    }
    if (a === "--height") {
      opts.viewportHeight = parseViewportPx(argv[++i], "height");
      continue;
    }
    if (a === "--full-page") {
      opts.fullPage = true;
      continue;
    }
    if (a === "--no-full-page") {
      opts.fullPage = false;
      continue;
    }
    if (a === "--qa-vault-locked") {
      opts.qaVaultLocked = true;
      continue;
    }
    if (a === "--qa-vault-locked-no-biometric") {
      opts.qaVaultLockedNoBiometric = true;
      continue;
    }
    if (a === "--qa-vault-unlocked") {
      opts.qaVaultUnlocked = true;
      continue;
    }
    if (a === "--capture-all") {
      opts.captureAll = true;
      continue;
    }
    if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    }
    positionals.push(a);
  }
  if (!opts.hash && positionals[0]) {
    opts.hash = positionals[0];
  }
  return { help: false, opts, positionals };
}

/** @param {string | undefined} raw @param {"width" | "height"} label */
function parseViewportPx(raw, label) {
  if (raw === undefined || raw === "") {
    throw new Error(`Missing value for --${label}`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || String(n) !== raw.trim() || n < 1 || n > 4096) {
    throw new Error(`--${label} must be an integer between 1 and 4096, got: ${raw}`);
  }
  return n;
}

/** @param {string} raw */
function normalizeHash(raw) {
  const t = raw.trim();
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
}

/** @param {string} hash */
function fileSlug(hash) {
  if (!hash) return "default";
  const body = hash.replace(/^#/, "");
  const safe = body.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const short = (safe || "hash").slice(0, 64);
  const digest = createHash("sha256").update(hash).digest("hex").slice(0, 8);
  return `${short}-${digest}`;
}

async function getExtensionId(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker");
  }
  const id = sw.url().split("/")[2];
  if (!id) {
    throw new Error("Could not parse extension id from service worker URL");
  }
  return id;
}

/**
 * Encrypt a vault payload using PBKDF2 + AES-GCM — same parameters as
 * src/crypto/vault.ts so loadVaultSessionSnapshot() can decrypt it successfully.
 *
 * @param {string} masterPassword
 * @param {{ email: string; password: string; totpSecret: string }} payload
 * @returns {Promise<{ version: 1; saltB64: string; ivB64: string; ciphertextB64: string }>}
 */
async function encryptQaVault(masterPassword, payload) {
  const subtle = webcrypto.subtle;
  const salt = webcrypto.getRandomValues(new Uint8Array(32));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();

  const km = await subtle.importKey("raw", enc.encode(masterPassword), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(payload)),
  );

  const b64 = (/** @type {ArrayBuffer | Uint8Array} */ buf) =>
    Buffer.from(buf).toString("base64");
  return {
    version: /** @type {1} */ (1),
    saltB64: b64(salt),
    ivB64: b64(iv),
    ciphertextB64: b64(new Uint8Array(ct)),
  };
}

/**
 * Capture the vault-locked UI. Injects a dummy (non-decryptable) StoredVault
 * so the sidebar controller renders instead of onboarding, then shows the locked state.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} url  Base sidebar URL (no fragment)
 * @param {{ fullPage: boolean }} opts
 * @param {string} outPath
 * @param {boolean} [showBiometric=true]  Force-show the biometric unlock button for QA.
 *   Pass false to capture the locked state as it appears with no biometric enrolled.
 */
async function captureVaultLocked(page, url, opts, outPath, showBiometric = true) {
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  await page.evaluate(() => {
    return chrome.storage.local.set({
      cunyVault: {
        version: 1,
        saltB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
        ivB64: "AAAAAAAAAAAAAAAA",
        ciphertextB64:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
    });
  });
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  // Wait for vaultController to finish renderMode("locked") — locked header starts hidden in HTML.
  await page
    .locator("#vault-locked-header:not([hidden])")
    .waitFor({ state: "visible", timeout: 15_000 });
  if (showBiometric) {
    await page.evaluate(() => {
      const btn = document.getElementById("biometric-unlock-btn");
      if (btn) btn.hidden = false;
    });
  }
  await page.screenshot({ path: outPath, fullPage: opts.fullPage });
}

/**
 * Capture the vault-unlocked / management UI. Generates a real encrypted vault
 * and injects both the vault and the session master so the sidebar boots in
 * unlocked mode and populates the credential fields.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} url  Base sidebar URL (no fragment)
 * @param {{ fullPage: boolean }} opts
 * @param {string} outPath
 */
async function captureVaultUnlocked(page, url, opts, outPath) {
  // First nav — required to get extension storage access from the page context.
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  const vault = await encryptQaVault(QA_MASTER_PASSWORD, QA_VAULT_PAYLOAD);
  // Return the Promise so page.evaluate awaits both writes before resolving.
  await page.evaluate(
    ({ cunyVault, masterKey, masterPwd }) => {
      return Promise.all([
        chrome.storage.local.set({ cunyVault }),
        chrome.storage.session.set({ [masterKey]: masterPwd }),
      ]);
    },
    { cunyVault: vault, masterKey: SESSION_MASTER_KEY, masterPwd: QA_MASTER_PASSWORD },
  );
  // Second nav — sidebar boots, loadVaultSessionSnapshot decrypts, mode=unlocked.
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  // Wait for vaultController to finish renderMode("unlocked") — status bar starts hidden in HTML.
  await page
    .locator("#vault-status-bar:not([hidden])")
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.screenshot({ path: outPath, fullPage: opts.fullPage });
}

/**
 * Capture the BIOMETRIC_OFFER screen. Uses a CDP virtual internal authenticator so
 * PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() returns true,
 * preventing the screen from immediately dispatching BIOMETRIC_DECLINED and
 * transitioning to COMPLETE_DEMO (its behaviour in headless Chromium without hardware).
 *
 * Chrome stores the virtual authenticator environment at the WebContents (tab) level,
 * so it survives the page.goto() navigation below.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} url  Base sidebar URL (no fragment)
 * @param {{ fullPage: boolean }} opts
 * @param {string} outPath
 */
async function captureBiometricOffer(page, url, opts, outPath) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  try {
    await page.goto(`${url}#qa=BIOMETRIC_OFFER`, { waitUntil: "load", timeout: 30_000 });
    // This button is only appended inside the `if (available)` branch of biometricOffer.ts.
    // Waiting for it proves the offer rendered — not just that the container existed
    // briefly before the auto-transition to COMPLETE_DEMO replaced it.
    await page
      .locator("[data-onboarding-biometric-use='true']")
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.screenshot({ path: outPath, fullPage: opts.fullPage });
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
}

/**
 * Capture an onboarding state via a hash fragment (the common path).
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} url  Full sidebar URL including fragment
 * @param {{ fullPage: boolean }} opts
 * @param {string} outPath
 */
async function captureHash(page, url, opts, outPath) {
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  await page
    .locator("#onboarding-root:not([hidden]), main.vault-wrap:not([hidden])")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.screenshot({ path: outPath, fullPage: opts.fullPage });
}

async function main() {
  const { help, opts } = parseArgs(process.argv);
  if (help) {
    usage();
    process.exit(0);
  }

  const manifestPath = path.join(opts.extensionDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Extension not found at ${opts.extensionDir} (missing manifest.json). Run: npm run build:e2e`,
    );
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: opts.viewportWidth, height: opts.viewportHeight },
    args: [
      `--disable-extensions-except=${opts.extensionDir}`,
      `--load-extension=${opts.extensionDir}`,
    ],
  });

  try {
    const extensionId = await getExtensionId(context);
    const baseUrl = `chrome-extension://${extensionId}/sidebar.html`;
    const page = context.pages()[0] ?? (await context.newPage());

    if (opts.captureAll) {
      for (const state of ALL_STATES) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const slug =
          state === "--qa-vault-locked"
            ? "vault-locked"
            : state === "--qa-vault-unlocked"
              ? "vault-unlocked"
              : fileSlug(normalizeHash(state));
        const outPath = path.join(opts.outDir, `sidebar-${slug}-${stamp}.png`);

        if (state === "--qa-vault-locked") {
          await captureVaultLocked(page, baseUrl, opts, outPath);
        } else if (state === "--qa-vault-unlocked") {
          await captureVaultUnlocked(page, baseUrl, opts, outPath);
        } else if (state === "#qa=BIOMETRIC_OFFER") {
          await captureBiometricOffer(page, baseUrl, opts, outPath);
        } else {
          const fragment = normalizeHash(state);
          await captureHash(page, `${baseUrl}${fragment}`, opts, outPath);
        }

        process.stdout.write(`${path.resolve(outPath)}\n`);
      }
    } else if (opts.qaVaultLockedNoBiometric) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outPath = path.join(opts.outDir, `sidebar-vault-locked-no-biometric-${stamp}.png`);
      await captureVaultLocked(page, baseUrl, opts, outPath, false);
      process.stdout.write(`${path.resolve(outPath)}\n`);
    } else if (opts.qaVaultLocked) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outPath = path.join(opts.outDir, `sidebar-vault-locked-${stamp}.png`);
      await captureVaultLocked(page, baseUrl, opts, outPath);
      process.stdout.write(`${path.resolve(outPath)}\n`);
    } else if (opts.qaVaultUnlocked) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outPath = path.join(opts.outDir, `sidebar-vault-unlocked-${stamp}.png`);
      await captureVaultUnlocked(page, baseUrl, opts, outPath);
      process.stdout.write(`${path.resolve(outPath)}\n`);
    } else {
      const fragment = normalizeHash(opts.hash);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outPath = path.join(opts.outDir, `sidebar-${fileSlug(fragment)}-${stamp}.png`);
      if (fragment === "#qa=BIOMETRIC_OFFER") {
        await captureBiometricOffer(page, baseUrl, opts, outPath);
      } else {
        await captureHash(page, `${baseUrl}${fragment}`, opts, outPath);
      }
      process.stdout.write(`${path.resolve(outPath)}\n`);
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
