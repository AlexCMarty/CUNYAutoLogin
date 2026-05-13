# Privacy Policy — CUNYAutoLogin

**Last updated:** May 11, 2026  

**Operator:** This extension is an independent open source project maintained by **Alexander C. Marty**. It is **not** affiliated with, endorsed by, or operated by the City University of New York (CUNY) or its vendors.

This policy describes how the **CUNYAutoLogin** browser extension (“the extension,” “we”) handles information on **your device**. It does not replace CUNY’s own privacy notices for **CUNY websites** you visit (for example CUNY Login, Brightspace, or MFA enrollment pages).

> **Not legal advice.** This document is written to reflect the extension’s current design as understood from its source code. You should have qualified counsel review it before you rely on it for compliance, store listings, or institutional requirements.

---

## Summary

- The extension is designed so that your **CUNY login email, password, and TOTP (authenticator) secret** are stored **only on your computer**, inside the browser, **encrypted** with a **vault password (extension password)** you choose.
- **Optional biometric unlock** (for example Face ID, Touch ID, or Windows Hello): if you turn it on, the extension stores **only** a WebAuthn passkey record and a **cryptographic wrapper** around your vault password so the OS can prompt you instead of typing the password each time. That enrollment runs **on your device** through the browser’s WebAuthn APIs; **no biometric templates** and **no plaintext vault password** are sent to the extension developer or written to ordinary extension logs.
- Your **vault password** is **not** written to persistent extension storage; it is kept in the browser’s **session** storage (and in memory while unlocked), which is cleared when the browser session ends according to browser rules.
- The extension **does not** send your credentials or vault contents to the developer’s servers. There is **no account system**, **no cloud sync**, and **no analytics or crash-reporting** built into the extension code for those purposes.
- The extension **does** interact with **official CUNY sites** you already use (for example to fill sign-in fields and to complete logout flows), using only the permissions declared in its `manifest.json`.

---

## Information the extension processes

### Stored locally (on your device)


| Category              | What                                                                                                                                                  | Where / how                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Vault (encrypted)** | CUNY Login email (`@login.cuny.edu`), password, TOTP secret material needed to generate one-time codes, and related vault metadata                    | `browser.storage.local` as a single encrypted blob (PBKDF2 + AES-GCM). Readable only with your vault password. |
| **Biometric unlock (optional)** | WebAuthn credential identifiers, authenticator metadata the browser needs for later prompts, and your vault password **re-encrypted** with a key derived inside the platform authenticator (not stored in plaintext) | `browser.storage.local` as a separate small record **only if you enroll**. Skipping onboarding biometrics leaves this empty. |
| **Onboarding flag**   | Whether you finished first-time setup                                                                                                                 | `browser.storage.local` as a non-secret boolean.                                                               |
| **Session-only data** | Vault unlock key derived from your vault password; optional **setup drafts** during onboarding; **pending TOTP secret** scraped during MFA enrollment | `browser.storage.session` (not persisted like normal disk storage; cleared when the session ends).             |
| **In-memory staging** | Email and password during a narrow onboarding window before the vault exists                                                                          | Held only in the extension **service worker** memory until cleared or the worker terminates.                   |


If you **uninstall** the extension or **clear** extension data, locally stored vault, optional biometric enrollment data, and flags are removed according to your browser’s behavior.

### Information we do not collect as a product feature

The extension does **not** collect:

- Your name, student ID, or grades  
- Browsing history outside the flows needed for CUNY login assistance  
- Payment information  
- Advertising identifiers

There is **no** built-in telemetry, analytics SDK, or remote logging of your vault contents in the application.

---

## How the extension uses permissions

The manifest requests **storage**, **sidePanel** (and Firefox **sidebar** equivalents), and **cookies**, with access limited to:

- `https://ssologin.cuny.edu/*`  
- `https://brightspace.cuny.edu/*`

**Typical uses:**

- **Storage:** Encrypted vault, optional biometric-enrollment record, session keys, onboarding state (as above).  
- **Side panel / sidebar:** User interface for setup, unlock, and settings.  
- **Tab coordination:** Opening or navigating browser tabs to official CUNY Login / Brightspace URLs during onboarding and logout (for example first-time login), within the extension’s declared host access—without broad access to all websites.  
- **Host access + content script on `ssologin.cuny.edu`:** Detecting the sign-in and MFA pages the extension supports and filling fields **only in that origin’s documents**, in line with the extension’s purpose. The same host permission is also used so WebAuthn “relying party” checks align with CUNY Login’s domain when you **optionally** enroll biometric unlock from the extension UI—still **no** credential upload to the extension operator.  
- **Cookies:** Best-effort removal of **named Brightspace session cookies** on specific flows (for example when reopening a clean session). The extension does **not** read arbitrary cookie jars for unrelated sites or exfiltrate cookie values to third parties.

**Network:** The extension may issue **same-origin** requests to **CUNY SSO** URLs that are part of documented logout behavior (for example to end an IdP session when the flow requires it), using the browser’s normal cookie jar for that origin. It does not send your vault blob or master password over the network.

---

## Third parties and your responsibilities

- **CUNY and its vendors** operate the websites you sign in to. Their privacy policies govern data you submit **to them**. This extension automates interactions you would otherwise perform manually on those sites; it does not change CUNY’s role as a data controller for information you give **to CUNY**.  
- **Browser vendors** (Mozilla, Google, Microsoft, Apple, etc.) provide the runtime, storage APIs, and sync features. If you use **browser sync** or backups, understand your vendor’s policies—**this extension does not implement its own cloud backup**, but your browser might sync extension data if you enable that.  
- **Operating system / device authenticators:** If you use **biometric unlock**, your OS and hardware-backed authenticator perform the biometric check. The extension does **not** receive raw fingerprint, face image, or similar **biometric templates** from the OS—only the cryptographic outputs the browser exposes through **WebAuthn** after a successful verification.  
- **GitHub** (or other hosts) may process IP addresses and similar metadata when you visit the project page or download releases; that is governed by GitHub’s policies, not this extension’s code.

---

## Security practices (high level)

- Vault data at rest uses **PBKDF2** (SHA-256) with a high iteration count and **AES-GCM** with per-save random salt and IV.  
- The **vault password** is not stored in `storage.local` in plaintext. If you use biometric unlock, an additional **AES-GCM**-wrapped copy of the vault password is stored tied to a **WebAuthn** credential; unlocking re-derives the wrapping key through a **platform-only** prompt (your OS / authenticator), not over the network to this project.  
- Production builds avoid logging secrets; development logging is gated behind development flags.

No method of electronic storage is 100% secure. You are responsible for choosing a **strong vault password**, locking your device, and keeping your browser up to date.

---

## Children’s privacy

The extension is intended for users who need access to **CUNY institutional** accounts. It is not directed at children under 13. If you believe a child has used the extension in a way that concerns you, uninstall the extension and contact your institution.

---

## International users

If you use CUNY systems from outside the United States, your information may be processed by **CUNY** and **your browser** according to their terms. The extension operator does not operate a separate cross-border data service for vault contents.

---

## Changes to this policy

This policy may be updated when the extension’s behavior or legal expectations change. The **“Last updated”** date at the top will be revised. Material changes should also be noted in the project **changelog** or **release notes** when practical.

---

## Open source

Source code is available in this repository under the terms of the **LICENSE** file. You may inspect how data is handled; this policy is meant to describe that behavior in plain language.

---

## Contact

Questions or reports related to this extension: please use **[GitHub Issues](https://github.com/AlexCMarty/CUNYAutoLogin/issues)** for the repository you obtained the software from.

For **account security, password resets, or CUNY MFA policy**, contact **CUNY** or your campus IT office—the extension maintainer cannot access your CUNY account or reset your CUNY password.