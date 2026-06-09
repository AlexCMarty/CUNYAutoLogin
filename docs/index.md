---
title: Home
layout: home-custom
nav_order: 1
description: "CUNYAutoLogin fills your CUNY email, password, and 2FA code on the official sign-in page. Encrypted on your device. No cloud sync, no analytics."
---

## Why do you log in so much?!

Here's the problem us CUNY students all face:

0. Open Brightspace for the 8th time today
0. Get bounced to portal, enter email &amp; password
0. Take out phone and enter 2FA code
0. It logs you out anyway!!!
0. **Repeat several times a day, for four years.**

{: .central-point bold }
That's hours of your degree spent on a login form.

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


## "Hold on — you want my password *and* my authenticator secret?"

Yes. That's exactly the right question to ask, and you shouldn't take anyone's word for the answer — including ours. Here's precisely what happens to your credentials, and where you can verify every claim in the source code.

### Everything stays on your machine

There is no CUNYAutoLogin server. No account, no sync, no analytics, no telemetry. Your email, password, and TOTP secret are sealed into an encrypted vault in your browser's local extension storage and never transmitted anywhere. The only network requests involved in logging you in are the ones your browser was already making — to CUNY.

### The vault is real cryptography, not obfuscation

Your master password is run through PBKDF2-SHA256 with 310,000 iterations and a random 32-byte salt — the iteration count OWASP recommends — to derive an AES-256-GCM key. A fresh random IV is generated on every save. What hits disk is salt, IV, and ciphertext. Nothing readable, nothing recoverable without your master password. (See [`src/crypto/vault.ts`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/crypto/vault.ts) — it's 167 lines, you can read the whole thing with your coffee.)

### Fingerprint unlock isn't a backdoor

Biometric unlock uses the WebAuthn PRF extension: your device's secure hardware (Windows Hello, Touch ID) derives a key that wraps your master password. The wrapped copy is useless without your physical device *and* your face or finger. It's the same class of mechanism real password managers use. ([`src/crypto/biometric.ts`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/crypto/biometric.ts))

### Unlocking is per-session, on purpose

When you unlock the vault, the session lives in `storage.session` — memory the browser erases when you quit. Close your browser, and the vault is locked again. Walk away from a library computer, and your credentials aren't sitting open.

### The extension can't touch the rest of your browsing

The manifest requests access to exactly two domains: `ssologin.cuny.edu` and `brightspace.cuny.edu`. Not `<all_urls>`, not your bank, not your email. Your browser enforces this — it's not a promise, it's a permission boundary. Check [`src/manifest.json`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/manifest.json), or just look at the permission prompt when you install.

### It's all open source (MIT)

Every claim above is a file path, not a marketing line. Read it, build it from source, run the test suite. If you find a hole, [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) — security reports get priority.

### What you should still know

Honesty section: storing your TOTP secret means anyone who gets your **master password** on your **unlocked device** could log in as you. That's the same trade-off as putting CUNY in 1Password or Bitwarden — the security collapses to the strength of your master password and the physical security of your machine. So pick a real master password, not `password123`. And if you ever change your CUNY password or re-enroll MFA, update the vault — old secrets don't linger anywhere else.

## Questions, comments, concerns?

If you have questions, first check the [FAQ](/faq/). If that doesn't help, please [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues). Also see our [Privacy Policy](/privacy).
