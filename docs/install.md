---
title: Install
layout: default
nav_order: 2
description: "How to install CUNYAutoLogin on Chrome, Edge, and Firefox — from the Chrome Web Store, Firefox Add-ons, or a GitHub release."
---

# Install CUNYAutoLogin
{: .no_toc }

**Browsers:** Firefox 140+ or Chrome / Edge 141+.
{: .fs-5 }

1. TOC
{:toc}

---

## Recommended: official stores

[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin){: .btn .btn-primary }
[Install from Firefox Add-ons →](https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/){: .btn }

The Chrome Web Store listing works in Chrome, Edge, and other Chromium browsers; Firefox users get it from Add-ons (AMO). Either store gives you automatic updates and doesn't require enabling Developer mode.

---

## Advanced: GitHub Release

Prefer to load it yourself or want to try a pre-release before it reaches the stores? Grab a release zip.

1. Open the repository's [Releases](https://github.com/AlexCMarty/CUNYAutoLogin/releases) page.
2. Download the **zip** for the version you want (for example `CUNYAutoLogin-v0.9.1.zip`).
3. Unzip it. You should see a folder that contains `manifest.json` at the top level — not a zip inside a zip.
4. Follow the steps for your browser below and point it at **that unzipped folder**.

### Chrome or Edge

1. Copy `chrome://extensions` into the address bar and press Enter (Edge: `edge://extensions`).
2. Turn **Developer mode** **on** (browsers require this to load an extension from a folder you provide).
3. Click **Load unpacked**.
4. Choose the unzipped folder (the one with `manifest.json` inside).

### Firefox

1. Copy `about:debugging#/runtime/this-firefox` into the address bar and press Enter.
2. Click **Load Temporary Add-on…**.
3. Open the unzipped folder and select `manifest.json`.

After updates, download a new release zip, unzip to replace the old folder, then in **Manage extensions** use **Reload** (Chrome) or remove and **Load Temporary Add-on** again (Firefox).

---

## After installing

Open the extension (puzzle-piece menu → pin CUNYAutoLogin if you want it visible). The sidebar walks you through first-time setup in about five minutes. See the [FAQ](/faq/) if you get stuck, or [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues).
