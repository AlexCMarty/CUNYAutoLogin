// Rasterizes the social-share card (docs/assets/img/og-card.svg) to a 1200x630 PNG.
//
// Why a script: link scrapers (iMessage, Discord, Slack, Facebook, X) ignore an
// SVG og:image, so the asset that ships must be a raster PNG. We render the SVG
// through headless Chromium (already installed for E2E) so the Geist web font
// resolves and the text matches the live site rather than a fallback face.
//
// Run with: npm run og   (after editing og-card.svg)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const imageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/assets/img");
const cardSvgPath = resolve(imageDir, "og-card.svg");
const iconSvgPath = resolve(imageDir, "icon.svg");
const outputPngPath = resolve(imageDir, "og-card.png");

// The card references the favicon via <image href="icon.svg">, kept that way so
// the source stays readable and in sync. Inline it as a data URI before render:
// Chromium blocks file:// subresources loaded from an in-memory (setContent) page.
const iconDataUri = `data:image/svg+xml;base64,${readFileSync(iconSvgPath).toString("base64")}`;
const cardMarkup = readFileSync(cardSvgPath, "utf8").replace('href="icon.svg"', `href="${iconDataUri}"`);

const pageHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block}</style>${cardMarkup}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: CARD_WIDTH, height: CARD_HEIGHT } });
  await page.setContent(pageHtml, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready); // hold for Geist before capturing
  await page.screenshot({
    path: outputPngPath,
    clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT },
  });
  console.log(`Wrote ${outputPngPath} (${CARD_WIDTH}x${CARD_HEIGHT})`);
} finally {
  await browser.close();
}
