---
title: Home
layout: home-custom
nav_order: 1
description: "CUNYAutoLogin fills your CUNY email, password, and 2FA code on the official sign-in page. Encrypted on your device. No cloud sync, no analytics."
---

## How many times a day do you log into CUNYFirst?

Probably more than once. CUNY signs you out often. CUNYAutoLogin fills in your CUNY login and authenticator code on the official sign-in page, so you spend less time typing and more time studying.

<div class="feature-grid" markdown="0">
  <div class="feature-card">
    <h3>Fills everything</h3>
    <p>Email, password, and the 6-digit authenticator code &mdash; entered for you on CUNY Login.</p>
  </div>
  <div class="feature-card">
    <h3>Encrypted on your device</h3>
    <p>Your credentials are encrypted with PBKDF2 + AES-GCM and a vault password only you know.</p>
  </div>
  <div class="feature-card">
    <h3>Unlock with biometrics</h3>
    <p>Optionally use Face ID, Touch ID, or Windows Hello instead of typing your vault password.</p>
  </div>
  <div class="feature-card">
    <h3>No cloud, no tracking</h3>
    <p>No account system, no cloud sync, and no analytics. Everything stays on your computer.</p>
  </div>
</div>

<div class="trust-callout" markdown="1">
**Your secrets never leave your machine.** CUNYAutoLogin does not send your email, password, or authenticator secret to any server. There is no account to create. Read the full [Privacy Policy](/privacy/).
</div>

## See it in action

<div class="shot-strip" markdown="0">
  <figure>
    <img src="{{ '/assets/screenshots/guided-setup.png' | relative_url }}" alt="Guided setup step walking through your first CUNY login" width="380" height="800" loading="lazy">
    <figcaption>Guided setup</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/screenshots/locked-vault.png' | relative_url }}" alt="Locked vault asking for biometrics or your vault password" width="380" height="800" loading="lazy">
    <figcaption>Locked vault</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/screenshots/2fa-autofill.png' | relative_url }}" alt="Unlocked vault showing the six-digit code that auto-fills on CUNY sign-in" width="380" height="800" loading="lazy">
    <figcaption>2FA auto-fill</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/screenshots/done.png' | relative_url }}" alt="Setup complete confirmation screen" width="380" height="800" loading="lazy">
    <figcaption>Done in ~5 min</figcaption>
  </figure>
</div>

## Get started

1. [Install the extension](/install/) from the Chrome Web Store (or load a GitHub release on Firefox).
2. The sidebar walks you through setup in about five minutes: your CUNY email &rarr; first login &rarr; login codes &rarr; vault password &rarr; optional biometrics.
3. From then on, visit CUNYFirst, Brightspace, or DegreeWorks and it fills automatically while the vault is unlocked.

Questions? Check the [FAQ](/faq/) or [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues).
