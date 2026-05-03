# CUNYAutoLogin

How many times a day do you log into CUNYFirst? Probably more than once. CUNY signs you out often. This browser extension fills in your CUNY login and authenticator code on the official sign-in page so you spend less time typing and more time doing school stuff.

**Privacy:** Your email, password, and authenticator secret stay on **your computer**, encrypted. You choose a **master password** (called your extension password in setup) that unlocks the vault; it is not sent to the extension author or any third-party server. The extension only needs access to CUNY’s sign-in site (`ssologin.cuny.edu`) to fill the page.

**Beta:** You’re helping try this out. If something breaks or feels confusing, please [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues).

**Browsers:** Firefox **115+** or Chrome / Edge **114+** (matches `src/manifest.json`; older builds may not install or may not keep the vault unlocked between restarts).

---

## Install (recommended: GitHub Release)

1. On GitHub, open this repository’s **[Releases](https://github.com/AlexCMarty/CUNYAutoLogin/releases)** page (also linked from the right-hand sidebar).
2. Download the **zip** for the version you want (for example `CUNYAutoLogin-v0.4.0.zip`).
3. Unzip it. You should see a folder that contains `manifest.json` at the top level—not a zip inside a zip.
4. Follow **Chrome or Edge** or **Firefox** below and point the browser at **that unzipped folder** when it asks you to pick a folder.

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

## First-time setup (guided onboarding)

The first time you use the extension, the **sidebar** walks you through setup in a few stages (progress beads at the top: **Your info** → **First login** → **Set up login codes** → **Extension password** → **Done**). Plan on about **five minutes**, and keep the extension sidebar handy while you work in the CUNY tab it opens.

1. **Open the extension** (puzzle piece → pin CUNYAutoLogin if you want it visible) and read the welcome screen, then continue.
2. **Your CUNY email** must end with `@login.cuny.edu` (your CUNY Login address—not a campus Gmail).
3. **Your CUNY password** — then the extension opens **CUNY Login** in a new tab and can fill your email and password for that first sign-in while you complete CUNY’s own prompts (for example **Allow** on the access gate). Follow the on-screen directions in the sidebar between steps.
4. **Set up login codes (TOTP)** — the flow guides you through **CUNY MFA Self-Service** so you can add a **Mobile Authenticator (TOTP)** factor if you do not already have one. When CUNY shows the **secret key** (and QR code), the extension can **read the secret from the enrollment page** so you do not have to type it by hand. **Do not share that secret** with anyone; it is equivalent to your authenticator for sign-in.
5. After CUNY asks you to verify the new factor, keep the vault path in mind: **unlock** when the sidebar needs a code so the one-time password can fill where CUNY expects it.
6. **Extension password** — this is your **vault master password**. It encrypts everything stored locally. It is kept in the browser session while unlocked, not shipped to a server.
7. **Optional: biometrics** — if your device supports it, you may be offered **Face ID / fingerprint** to unlock the sidebar instead of typing the extension password each time (you can skip this).

If you close the sidebar mid-setup, **open it again in the same browser session**; the flow can often resume from a safe point. If something goes wrong on the CUNY page, the sidebar usually explains the next step.

---

## Already enrolled in CUNY MFA?

If you **already** use an authenticator app with CUNY, you still go through the guided steps where the extension needs your **TOTP secret** (the Base32 key CUNY showed when you added the factor—not the six-digit codes). You can add a **new** Mobile Authenticator factor for this extension and retire the old enrollment later in CUNY MFA Self-Service, or use your existing secret if you still have it stored securely—follow the sidebar copy for your situation.

---

## Everyday use

- Open your browser and **unlock** the extension if it asks for your extension password (or use biometrics if you turned that on).
- Go to CUNYFirst, Brightspace, DegreeWorks, or any site that sends you through **CUNY Login**—the sign-in and MFA steps on `ssologin.cuny.edu` can fill automatically while the vault is unlocked.

---

## If something goes wrong

- **Wrong email:** Use your CUNY Login address ending in `@login.cuny.edu`.
- **Nothing fills:** Unlock the extension first. Try refreshing the CUNY page after unlocking.
- **You changed your CUNY password or MFA:** Update the saved credentials in the extension (unlock, then edit and save).
- **Still stuck:** [Open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) and describe what you clicked and what you expected.

---

## For developers

Build instructions, release process, and project layout are in [CONTRIBUTING.md](CONTRIBUTING.md).