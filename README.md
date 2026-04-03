# CUNYAutoLogin

How many times a day do you log into CUNYFirst? Probably more than once. CUNY signs you out often. This browser extension fills in your CUNY login and authenticator code on the official sign-in page so you spend less time typing and more time doing school stuff.

**Privacy:** Your email, password, and authenticator secret stay on **your computer**, encrypted. You choose a **master password** that unlocks the vault; it is not sent to the extension author or any third-party server. The extension only needs access to CUNY’s sign-in site (`ssologin.cuny.edu`) to fill the page.

**Beta:** You’re helping try this out. If something breaks or feels confusing, please [open an issue](./issues).

**Browsers:** Firefox **115+** or Chrome / Edge **102+** (older browsers may not keep you signed in to the extension between restarts).

---

## Install (recommended: GitHub Release)

1. On GitHub, open this repository’s [**Releases**](./releases) page (also linked from the right-hand sidebar on the repo home page).
2. Download the **zip** for the version you want (for example `CUNYAutoLogin-v0.2.2.zip`).
3. Unzip it. You should see a folder that contains **`manifest.json`** at the top level—not a zip inside a zip.
4. Follow **Chrome or Edge** or **Firefox** below and point the browser at **that unzipped folder** when it asks you to pick a folder.

### Chrome or Edge

1. Copy `chrome://extensions` into the address bar and press Enter (Edge: `edge://extensions`).
2. Turn **Developer mode** **on** (browsers require this to load an extension from a folder you provide).
3. Click **Load unpacked**.
4. Choose the unzipped folder (the one with `manifest.json` inside).

### Firefox

1. Copy `about:debugging#/runtime/this-firefox` into the address bar and press Enter.
2. Click **Load Temporary Add-on…**.
3. Open the unzipped folder and select **`manifest.json`**.

After updates, download a new release zip, unzip to replace the old folder, then in **Manage extensions** use **Reload** (Chrome) or remove and **Load Temporary Add-on** again (Firefox).

---

## First-time setup

1. Click the extension’s icon (puzzle piece → pin CUNYAutoLogin if you want it visible).
2. Enter your CUNY email (**must** end with `@login.cuny.edu`), your CUNY password, your **TOTP secret** (see below), and a **strong master password** for the vault.
3. Save. The next time you open the browser, unlock with your master password when the popup asks.

Until the vault is unlocked for that session, the extension will not auto-fill sign-in pages.

---

## Getting your TOTP secret (CUNY MFA)

You need an authenticator-style factor enrolled at CUNY before the extension can generate codes.

1. Visit [CUNY MFA Self-Service](https://ssologin.cuny.edu/oaa/rui) and sign in as usual.
2. On **Allow CUNY Login to Access MFA Self-Service?**, click **Allow**.
3. Under **My authentication factors**, click **Manage**.
4. Choose **Add authentication factor**.
5. Select **Mobile Authenticator - TOTP**.
6. You will see a **secret key** (letters and digits) and a QR code. **Do not share the secret with anyone**—it can generate the same codes as your password for sign-in.
7. Open the extension popup while this enrollment screen is still showing; the secret can be picked up from the page to save you typing.
8. Enter your `@login.cuny.edu` email, password, master password, and save in the extension.

Finish on the CUNY site: give the factor a name (for example `CUNYAutoLogin`), save it, then click **Verify Now**. When the site asks for a one-time code, **unlock the extension** if it is locked. The six-digit code should fill in automatically once the box appears. If it does not, confirm you saved the vault and the popup shows **unlocked**.

---

## Everyday use

- Open your browser and **unlock** the extension if it asks for your master password.
- Go to CUNYFirst, Brightspace, DegreeWorks, or any site that sends you through **CUNY Login**—the sign-in and MFA steps on `ssologin.cuny.edu` can fill automatically while the vault is unlocked.

---

## If something goes wrong

- **Wrong email:** Use your CUNY Login address ending in **`@login.cuny.edu`**.
- **Nothing fills:** Unlock the extension first. Try refreshing the CUNY page after unlocking.
- **You changed your CUNY password or MFA:** Update the saved credentials in the extension (unlock, then edit and save).
- **Still stuck:** [Open an issue](./issues) and describe what you clicked and what you expected.

---

## For developers

Build instructions, release process, and project layout are in [CONTRIBUTING.md](CONTRIBUTING.md).
