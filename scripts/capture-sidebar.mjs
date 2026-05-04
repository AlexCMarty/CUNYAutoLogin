#!/usr/bin/env node
/**
 * Capture a PNG of the extension sidebar (chrome-extension URL) for visual QA.
 *
 * Requires a built extension: `npm run build:e2e` (writes to dist/).
 *
 * Usage:
 *   node scripts/capture-sidebar.mjs '#vault=1'
 *   node scripts/capture-sidebar.mjs --hash '#qa=SOME_STATE'
 *   node scripts/capture-sidebar.mjs --out-dir /tmp/caps '#vault=1'
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

function usage() {
  process.stderr.write(`Usage: capture-sidebar.mjs [options] [<hash-fragment>]

Options:
  --hash <string>     URL hash (e.g. #vault=1). Overrides positional fragment.
  --out-dir <path>    Directory for PNG (default: agent_screenshots under repo root)
  --extension-dir     Unpacked extension directory (default: dist)
  --full-page         Use full-page screenshot (default: true)
  --no-full-page      Viewport-only screenshot

Positional <hash-fragment> may be "#vault=1" or "vault=1" (leading # optional).

Requires: npm run build:e2e (or equivalent) so dist/ exists.
`);
}

function parseArgs(argv) {
  /** @type {{ hash: string; outDir: string; extensionDir: string; fullPage: boolean }} */
  const opts = {
    hash: "",
    outDir: defaultOutDir,
    extensionDir: defaultExtensionDir,
    fullPage: true,
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
    if (a === "--full-page") {
      opts.fullPage = true;
      continue;
    }
    if (a === "--no-full-page") {
      opts.fullPage = false;
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
    args: [
      `--disable-extensions-except=${opts.extensionDir}`,
      `--load-extension=${opts.extensionDir}`,
    ],
  });

  try {
    const extensionId = await getExtensionId(context);
    const url = `chrome-extension://${extensionId}/sidebar.html${fragment}`;
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    // Onboarding mounts hide `main.wrap`; vault / management keeps it visible.
    await page
      .locator("#onboarding-root:not([hidden]), main.wrap:not([hidden])")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
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
