---
title: FAQ
layout: default
nav_order: 4
description: "Common questions about CUNYAutoLogin: whether it's secure, how it fills your 2FA code, mobile support, cloud sync, and troubleshooting tips."
---

# Frequently asked questions
{: .no_toc }

1. TOC
{:toc}

---

## Security & privacy

### Is this secure?

Your credentials never leave your device. Your CUNY email, password, and 2FA secret are sealed in an encrypted vault (PBKDF2 + AES-256-GCM) in your browser's extension storage — there is no server, no account, and no analytics. The extension can only access the CUNY sign-in pages, and the code is open source, so every claim is verifiable. The [Security page](/security/) walks through the cryptography claim by claim, and the [Privacy Policy](/privacy/) covers everything else.

### Where is my data stored?

Only on your device, encrypted, in your browser's extension storage — never on a server. The [Privacy Policy](/privacy/) lists exactly what is stored where and how it is protected.

### Does my data sync to the cloud?

No. There is no account system and no cloud sync. If you uninstall the extension or switch browsers, the data does not come with you.

### What if I forget my extension password?

There is no way to recover it — no server means nobody can send you a reset email. Remove the extension (which deletes its encrypted data), reinstall it, and run setup again. Your CUNY account itself is unaffected: you can still sign in manually with the 2FA method on your phone — which is exactly why you should never delete it.

## Using it

### How does it fill the six-digit code?

The extension generates the code itself, on your device — the same way an authenticator app does. During setup it walks you through adding a new 2FA method to your CUNY account and saves that method's secret (the key behind the QR code you would normally scan) into your encrypted vault. From then on it can produce the current six-digit code on every sign-in.

### Does it work on mobile?

No — CUNYAutoLogin is desktop-only. It runs on Firefox 140+ and Chrome or Edge 141+ on desktop. Its interface lives in the browser sidebar, which mobile browsers do not provide — and Chrome for Android does not run extensions at all. If that ever changes, it will be announced on [GitHub](https://github.com/AlexCMarty/CUNYAutoLogin).

### What if I change my CUNY password?

Update the saved password in the extension: unlock it, edit your credentials, and save. Until you do, auto-fill will submit your old password and the sign-in will fail.

### Can I remove the 2FA method on my phone?

**Absolutely not.** Keep your existing method tied to your account. You might need it in the future to log in — for example on a new device, or if you ever forget your extension password.

## About the project

### Is CUNYAutoLogin affiliated with CUNY?

No. This is an independent open-source project, not affiliated with or endorsed by CUNY.

### Am I allowed to use this?

CUNYAutoLogin automates the same steps you already perform by hand on the official sign-in page — it does not bypass 2FA or weaken CUNY's security; it completes the normal login with your own credentials, on your own device. That said, it is an independent project, so if you are unsure about your campus's policies, check with your campus IT office.

---

## Troubleshooting

### Why won't it accept my email?

Use your CUNY Login address ending in `@login.cuny.edu` — not a campus address like `@stu-mail.school.cuny.edu`.

### Why isn't anything filling in?

Unlock the extension first. Then try refreshing the CUNY page after unlocking.

### Still stuck?

[Open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) and describe what you clicked and what you expected.

<!-- Keep this structured data in sync with the visible Q&As above. -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is this secure?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Your credentials never leave your device. Your CUNY email, password, and 2FA secret are sealed in an encrypted vault (PBKDF2 + AES-256-GCM) in your browser's extension storage — there is no server, no account, and no analytics. The extension can only access the CUNY sign-in pages, and the code is open source, so every claim is verifiable."
      }
    },
    {
      "@type": "Question",
      "name": "Where is my data stored?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Only on your device, encrypted, in your browser's extension storage — never on a server. The Privacy Policy lists exactly what is stored where and how it is protected."
      }
    },
    {
      "@type": "Question",
      "name": "Does my data sync to the cloud?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. There is no account system and no cloud sync. If you uninstall the extension or switch browsers, the data does not come with you."
      }
    },
    {
      "@type": "Question",
      "name": "What if I forget my extension password?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "There is no way to recover it — no server means nobody can send you a reset email. Remove the extension (which deletes its encrypted data), reinstall it, and run setup again. Your CUNY account itself is unaffected: you can still sign in manually with the 2FA method on your phone — which is exactly why you should never delete it."
      }
    },
    {
      "@type": "Question",
      "name": "How does it fill the six-digit code?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The extension generates the code itself, on your device — the same way an authenticator app does. During setup it walks you through adding a new 2FA method to your CUNY account and saves that method's secret (the key behind the QR code you would normally scan) into your encrypted vault. From then on it can produce the current six-digit code on every sign-in."
      }
    },
    {
      "@type": "Question",
      "name": "Does it work on mobile?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No — CUNYAutoLogin is desktop-only. It runs on Firefox 140+ and Chrome or Edge 141+ on desktop. Its interface lives in the browser sidebar, which mobile browsers do not provide — and Chrome for Android does not run extensions at all. If that ever changes, it will be announced on GitHub."
      }
    },
    {
      "@type": "Question",
      "name": "What if I change my CUNY password?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Update the saved password in the extension: unlock it, edit your credentials, and save. Until you do, auto-fill will submit your old password and the sign-in will fail."
      }
    },
    {
      "@type": "Question",
      "name": "Can I remove the 2FA method on my phone?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Absolutely not. Keep your existing method tied to your account. You might need it in the future to log in — for example on a new device, or if you ever forget your extension password."
      }
    },
    {
      "@type": "Question",
      "name": "Is CUNYAutoLogin affiliated with CUNY?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. This is an independent open-source project, not affiliated with or endorsed by CUNY."
      }
    },
    {
      "@type": "Question",
      "name": "Am I allowed to use this?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "CUNYAutoLogin automates the same steps you already perform by hand on the official sign-in page — it does not bypass 2FA or weaken CUNY's security; it completes the normal login with your own credentials, on your own device. That said, it is an independent project, so if you are unsure about your campus's policies, check with your campus IT office."
      }
    },
    {
      "@type": "Question",
      "name": "Why won't it accept my email?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Use your CUNY Login address ending in @login.cuny.edu — not a campus address like @stu-mail.school.cuny.edu."
      }
    },
    {
      "@type": "Question",
      "name": "Why isn't anything filling in?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Unlock the extension first. Then try refreshing the CUNY page after unlocking."
      }
    }
  ]
}
</script>
