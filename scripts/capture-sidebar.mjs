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
 *
 * On success, prints a single absolute path to stdout (the PNG file).
 * Logs and errors go to stderr.
 */

import { createHash } from "node:crypto";
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

function usage() {
  process.stderr.write(`Usage: capture-sidebar.mjs [options] [<hash-fragment>]

Options:
  --hash <string>     URL hash (e.g. #qa=WELCOME). Overrides positional fragment.
  --out-dir <path>    Directory for PNG (default: agent_screenshots under repo root)
  --extension-dir     Unpacked extension directory (default: dist)
  --width <px>        Browser viewport width (default: ${defaultViewportWidth})
  --height <px>       Browser viewport height (default: ${defaultViewportHeight})
  --full-page         Use full-page screenshot (default: true)
  --no-full-page      Viewport-only screenshot

Positional <hash-fragment> may be "#qa=WELCOME" or "qa=WELCOME" (leading # optional).

Requires: npm run build:e2e (or equivalent) so dist/ exists.
`);
}

function parseArgs(argv) {
  /** @type {{ hash: string; outDir: string; extensionDir: string; fullPage: boolean; viewportWidth: number; viewportHeight: number; qaVaultLocked: boolean }} */
  const opts = {
    hash: "",
    outDir: defaultOutDir,
    extensionDir: defaultExtensionDir,
    fullPage: true,
    viewportWidth: defaultViewportWidth,
    viewportHeight: defaultViewportHeight,
    qaVaultLocked: false,
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

async function main() {
  const { help, opts } = parseArgs(process.argv);
  if (help) {
    usage();
    process.exit(0);
  }

  const fragment = normalizeHash(opts.hash);
  const manifestPath = path.join(opts.extensionDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Extension not found at ${opts.extensionDir} (missing manifest.json). Run: npm run build:e2e`,
    );
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(opts.outDir, `sidebar-${fileSlug(fragment)}-${stamp}.png`);

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
    const url = `chrome-extension://${extensionId}/sidebar.html${fragment}`;
    const page = context.pages()[0] ?? (await context.newPage());

    if (opts.qaVaultLocked) {
      // Inject a dummy StoredVault so sidebar.ts routes to the vault controller
      // instead of onboarding. Navigates twice: once to get extension storage
      // access, then again so sidebar.ts reads the injected vault on boot.
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      await page.evaluate(() => {
        return chrome.storage.local.set({
          cunyVault: {
            version: 1,
            saltB64: "AAAAAAAAAAAAAAAAAAAAAA==",
            ivB64: "AAAAAAAAAAAAAAAA",
            ciphertextB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          },
        });
      });
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      await page
        .locator("main.vault-wrap:not([hidden])")
        .waitFor({ state: "visible", timeout: 15_000 });
      // Show the biometric button for visual QA even without real enrollment.
      await page.evaluate(() => {
        const btn = document.getElementById("biometric-unlock-btn");
        if (btn) btn.hidden = false;
      });
    } else {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      // Onboarding mounts hide `main.vault-wrap`; vault / management keeps it visible.
      await page
        .locator("#onboarding-root:not([hidden]), main.vault-wrap:not([hidden])")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    }

    await page.screenshot({ path: outPath, fullPage: opts.fullPage });
  } finally {
    await context.close();
  }

  process.stdout.write(`${path.resolve(outPath)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
