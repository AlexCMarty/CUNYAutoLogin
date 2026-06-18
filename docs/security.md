---
title: Security
layout: default
nav_order: 3
description: "How CUNYAutoLogin protects your CUNY credentials: an on-device AES-256-GCM vault, PBKDF2 key derivation, WebAuthn biometric unlock, no server, and open MIT source you can verify."
---

# Is CUNYAutoLogin secure?
{: .no_toc }

**Last updated:** June 18, 2026

You're trusting it with your CUNY password *and* your authenticator secret. That's exactly the right thing to be suspicious about — and you shouldn't take anyone's word for the answer, including ours. Here's precisely what happens to your credentials, and where you can verify every claim in the source code.
{: .fs-5 }

1. TOC
{:toc}

---

## It does exactly what you'd do by hand

CUNYAutoLogin doesn't bypass anything or exploit a loophole — it performs the **same login steps you already do by hand**, on CUNY's own official sign-in page, with your own credentials, just without the typing. The six-digit code comes from a 2FA method *you* enrolled through CUNY's official MFA Self-Service, so nothing about your account's security is weakened or worked around. It's an independent project, so if you're unsure about your campus's policy, check with your campus IT office.

## Everything stays on your machine

There is no CUNYAutoLogin server. No account, no sync, no analytics, no telemetry. Your email, password, and TOTP secret are sealed into an encrypted vault in your browser's local extension storage and never transmitted anywhere. The only network requests involved in logging you in are the ones your browser was already making — to CUNY.

## The vault is real cryptography, not obfuscation

Your master password is run through PBKDF2-SHA256 with 310,000 iterations and a random 32-byte salt — the iteration count OWASP recommends — to derive an AES-256-GCM key. A fresh random IV is generated on every save. What hits disk is salt, IV, and ciphertext. Nothing readable, nothing recoverable without your master password. (See [`src/crypto/vault.ts`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/crypto/vault.ts) — it's 167 lines, you can read the whole thing with your coffee.)

## Fingerprint unlock isn't a backdoor

Biometric unlock uses the WebAuthn PRF extension: your device's secure hardware (Windows Hello, Touch ID) derives a key that wraps your master password. The wrapped copy is useless without your physical device *and* your face or finger. It's the same class of mechanism real password managers use. ([`src/crypto/biometric.ts`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/crypto/biometric.ts))

## Unlocking is per-session, on purpose

When you unlock the vault, the session lives in `storage.session` — memory the browser erases when you quit. Close your browser, and the vault is locked again. Walk away from a library computer, and your credentials aren't sitting open.

## The extension can't touch the rest of your browsing

The manifest requests access to exactly two domains: `ssologin.cuny.edu` and `brightspace.cuny.edu`. Not `<all_urls>`, not your bank, not your email. Your browser enforces this — it's not a promise, it's a permission boundary. Check [`src/manifest.json`](https://github.com/AlexCMarty/CUNYAutoLogin/blob/main/src/manifest.json), or just look at the permission prompt when you install.

So how does it sign you into CUNYFirst, Brightspace, *and* DegreeWorks? It never touches them directly — they all hand sign-in off to the **same** CUNY Login page. Fill that one page and you're into everything, while the extension still can't see anything you do inside those services. Narrow access, full coverage.

## It's all open source (MIT)

Every claim above is a file path, not a marketing line. Read it, build it from source, run the test suite. If you find a hole, [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) — security reports get priority.

## What you should still know

Honesty section: storing your TOTP secret means anyone who gets your **master password** on your **unlocked device** could log in as you. That's the same trade-off as putting CUNY in 1Password or Bitwarden — the security collapses to the strength of your master password and the physical security of your machine. So pick a real master password, not `password123`. And if you ever change your CUNY password or re-enroll MFA, update the vault — old secrets don't linger anywhere else.

---

Still have questions? Check the [FAQ](/faq/), read the full [Privacy Policy](/privacy/), or [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues).
