# CUNYAutoLogin

<p align="center">
  <a href="https://cunyautologin.alexmarty.dev/">
    <img src="docs/assets/img/og-card.png" alt="CUNYAutoLogin — log in to CUNY once. Encrypted on-device. No cloud sync, no analytics, open source." width="680">
  </a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin"><img src="https://img.shields.io/chrome-web-store/v/nkkoameonkenaahfjkkicaphfncjikin?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white" alt="Chrome Web Store version"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/"><img src="https://img.shields.io/amo/v/cunyautologin?label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white" alt="Firefox Add-ons version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License"></a>
</p>

How many times a day do you log into CUNYFirst? Probably more than once. CUNY signs you out often. This browser extension fills in your CUNY login and authenticator code on the official sign-in page so you spend less time typing and more time studying.

*An independent, open-source project — not affiliated with or endorsed by CUNY.*

**Privacy:** Your email, password, and authenticator secret are **encrypted** on your computer. You choose an **extension password** that unlocks the vault. Nothing syncs to a server. [See exactly how your credentials are handled →](https://cunyautologin.alexmarty.dev/security/) · [Privacy policy](https://cunyautologin.alexmarty.dev/privacy/)

If something breaks or feels confusing, please [open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues).

**Browsers:** Firefox **140+** or Chrome / Edge **141+**.

---

## Install

### Recommended: official stores

- **Chrome / Edge:** **[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin)**
- **Firefox:** **[Install from Firefox Add-ons (AMO) →](https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/)**

Either store gives you automatic updates and doesn’t require enabling Developer mode.

### Advanced: GitHub Release

Prefer to load it yourself or want to try a pre-release before it reaches the stores? Grab a release zip.

1. On GitHub, open this repository’s **[Releases](https://github.com/AlexCMarty/CUNYAutoLogin/releases)** page (also linked from the right-hand sidebar).
2. Download the **zip** for the version you want (for example `CUNYAutoLogin-v0.9.2.zip`).
3. Unzip it. You should see a folder that contains `manifest.json` at the top level—not a zip inside a zip.
4. Follow **Chrome or Edge** or **Firefox** below and point the browser at **that unzipped folder** when it asks you to pick a folder.

#### Chrome or Edge

1. Copy `chrome://extensions` into the address bar and press Enter (Edge: `edge://extensions`).
2. Turn **Developer mode** **on** (browsers require this to load an extension from a folder you provide).
3. Click **Load unpacked**.
4. Choose the unzipped folder (the one with `manifest.json` inside).

#### Firefox

1. Copy `about:debugging#/runtime/this-firefox` into the address bar and press Enter.
2. Click **Load Temporary Add-on…**.
3. Open the unzipped folder and select `manifest.json`.

After updates, download a new release zip, unzip to replace the old folder, then in **Manage extensions** use **Reload** (Chrome) or remove and **Load Temporary Add-on** again (Firefox).

---

## First-time setup

The first time you use the extension, the **sidebar** walks you through setup in a few stages. **Your info** → **First login** → **Set up login codes** → **Extension password** → **Optional biometrics** → **Done**. Plan on about **ten minutes**.

1. **Open the extension** (puzzle piece → pin CUNYAutoLogin if you want it visible)
2. **Your CUNY email** must end with `@login.cuny.edu` (your CUNY Login address — not a campus @stu-mail.school.cuny.edu). Enter the password for this email too.
3. **Autofill (partially)** — then the extension opens **CUNY Login** in a new tab and can fill your email and password for that first sign-in. You need to type a six digit code, but this is the **last time** you'll have to do that.
4. **Set up login codes** — the flow guides you through **CUNY MFA Self-Service** so you can add a **Mobile Authenticator (TOTP)**. **Do not share the secret** with anyone; it is equivalent to your authenticator for sign-in. **Keep your existing login method too** — don't delete it; you may still need it to sign in on another device.
5. **Extension password** — this is your **vault master password**. It encrypts everything stored locally. It is kept in the browser session while unlocked, not shipped to a server.
6. **Biometrics (optional)** — you may be offered **Face ID, Touch ID, or Windows Hello** so you can unlock the vault without typing the extension password each time. You can skip this and use your password only; both paths keep secrets on your device.
7. **Log in!** You will be redirected to Brightspace to watch the automatic login. **It fills the six digit code for you**.

If you close the sidebar mid-setup, **open it again in the same browser session**; the flow can often resume from a safe point. If something goes wrong on the CUNY page, the sidebar usually explains the next step.

---

## Everyday use

- Open your browser and **unlock** the extension if it asks for your extension password.
- Go to CUNYFirst, Brightspace, DegreeWorks, or any site that sends you through **CUNY Login**. It will fill automatically while the vault is unlocked.

---

## If something goes wrong

- **Wrong email:** Use your CUNY Login address ending in `@login.cuny.edu`.
- **Nothing fills:** Unlock the extension first. Try refreshing the CUNY page after unlocking.
- **You changed your CUNY password:** Update the saved credentials in the extension (unlock, then edit and save).
- **Still stuck:** [Open an issue](https://github.com/AlexCMarty/CUNYAutoLogin/issues) and describe what you clicked and what you expected

---

## FAQ

Is it secure? How does it fill your 2FA code? Does it work on mobile? What if you forget your extension password? These and more are answered in the **[FAQ on the project site](https://cunyautologin.alexmarty.dev/faq/)**, which is kept current.

---

## For developers

Build, test, and project layout are in [CONTRIBUTING.md](CONTRIBUTING.md); the release process is in [RELEASING.md](RELEASING.md).

---

## Licensing

Code licensed under [MIT License](LICENSE). Icons in `icons/` derived from [Wikimedia](https://commons.wikimedia.org/wiki/File:Hutkachel.svg): © Mabit1, CC BY-SA 4.0; modifications © Alexander Marty, same license.