---
title: FAQ
layout: default
nav_order: 3
description: "Common questions about CUNYAutoLogin: how it fills your 2FA code, whether it syncs to the cloud, and troubleshooting tips."
---

# Frequently asked questions
{: .no_toc }

1. TOC
{:toc}

---

## How does it fill the six-digit code?

It walks you through adding a new 2FA factor to log in. During that process it captures the key (think of the QR code you usually scan) and saves it locally, so it can generate the code for you on every future sign-in.

## Is this synced to the cloud?

No. There is no account system and no cloud sync. If you uninstall the extension or switch browsers, the data does not come with you.

## Can I delete my existing login method?

**Absolutely not.** Keep your existing method tied to your account. You might need it in the future to log in.

## Is this created by CUNY?

No. This is an independent open-source project, not affiliated with or endorsed by CUNY.

## Where is my data stored?

Your CUNY email, password, and authenticator secret are encrypted (PBKDF2 + AES-GCM) and stored only in your browser's local storage. Your vault password is never written to disk — it's kept in the browser session while the vault is unlocked. See the [Privacy Policy](/privacy/) for details.

---

## Troubleshooting

### Wrong email

Use your CUNY Login address ending in `@login.cuny.edu` — not a campus address like `@stu-mail.school.cuny.edu`.

### Nothing fills

Unlock the extension first. Then try refreshing the CUNY page after unlocking.

### You changed your CUNY password

Update the saved credentials in the extension: unlock it, then edit and save.

### Still stuck

[Open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) and describe what you clicked and what you expected.
