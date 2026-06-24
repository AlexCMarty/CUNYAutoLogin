---
title: "Auto-fill your CUNY login, password & 2FA"
layout: home-custom
nav_exclude: true
description: "CUNYAutoLogin fills your CUNY email, password, and 2FA code on the official sign-in page. Encrypted on your device. No cloud sync, no analytics."
---

## Why do you log in so much?!

Here's the problem us CUNY students all face:

1. Open Brightspace for the 8th time today
2. Get bounced to portal, enter email &amp; password
3. Take out phone and enter 2FA code
4. It logs you out anyway!!!
5. **Repeat several times a day, for four years.**

{: .central-point bold }
That's hours of your degree spent on a login form.

Wondering *why* CUNY does this to you? [Here's the actual reason CUNY logs you out so often →](/why-does-cuny-log-you-out/)

## How it works

<div class="feature-grid" markdown="0">
  <div class="feature-card">
    <h3><a href="{{ '/install/' | relative_url }}">Install</a> the extension</h3>
    <p>Set it up with your CUNY credentials <b>once</b></p>
  </div>

  <div class="feature-card">
    <h3>Lock</h3>
    <p>Lock your credentials behind your fingerprint, face, or an extension password</p>
  </div>

  <div class="feature-card">
    <h3>Forget</h3>
    <p>Next time a CUNY login page loads, it's already filled and submitted before you touch the keyboard.</p>
  </div>
</div>

{: .central-point }
Set it up once, and you get those hours of your degree back.

## "Hold on — you want my password *and* my authenticator secret?"

Yes. That's exactly the right question to ask, and you shouldn't take anyone's word for the answer — including ours. Everything stays sealed in an encrypted vault on your own machine: there's no server, no account, no analytics, and the extension can only touch CUNY's sign-in pages. Every claim is a file path you can verify in the open MIT source, not a marketing line.

[See exactly what happens to your credentials →](/security/)

## Questions, comments, concerns?

If you have questions, first check the [FAQ](/faq/). If that doesn't help, please [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues). Also see our [Privacy Policy](/privacy).

<!-- SoftwareApplication structured data for search engines + AI answer engines.
     Keep claims (browser minimums, price, license) in sync with src/manifest.json and the site copy. -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CUNYAutoLogin",
  "applicationCategory": "BrowserApplication",
  "operatingSystem": "Windows, macOS, Linux, ChromeOS",
  "browserRequirements": "Requires Firefox 140+ or Chromium 141+ (Chrome, Edge).",
  "description": "Free, open-source browser extension that automatically fills and submits your CUNY Login — email, password, and six-digit 2FA code — on CUNY's official sign-in page. Credentials are encrypted on your device; no account, no cloud sync, no analytics.",
  "url": "https://cunyautologin.alexmarty.dev/",
  "image": "https://cunyautologin.alexmarty.dev/assets/img/og-card.png",
  "downloadUrl": "https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin",
  "isAccessibleForFree": true,
  "license": "https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/LICENSE",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Alexander C. Marty"
  },
  "sameAs": [
    "https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin",
    "https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/",
    "https://github.com/AlexCMarty/CUNYAutoLogin"
  ]
}
</script>
