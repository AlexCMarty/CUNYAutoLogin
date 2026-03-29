import browser from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  isStoredVault,
  type StoredVault,
} from "../crypto/vault";

const REQUIRED_EMAIL_SUFFIX = "@login.cuny.edu";

function setStatus(message: string, ok = false): void {
  console.log(message);
  const el = document.getElementById("status");
  if (!el) {
    console.log(el); 
    return;
  };
  el.textContent = message;
  el.classList.toggle("ok", ok);
}

function validateEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(REQUIRED_EMAIL_SUFFIX);
}

async function loadStoredVault(): Promise<StoredVault | null> {
  const result = await browser.storage.local.get(VAULT_STORAGE_KEY);
  const raw = result[VAULT_STORAGE_KEY];
  if (raw === undefined || raw === null) return null;
  if (!isStoredVault(raw)) return null;
  return raw;
}

function getFormElements(): {
  form: HTMLFormElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
  totpSecret: HTMLInputElement;
  masterPassword: HTMLInputElement;
  submitBtn: HTMLButtonElement;
  modeHint: HTMLElement;
} {
  const form = document.getElementById("vault-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const totpSecret = document.getElementById("totpSecret");
  const masterPassword = document.getElementById("masterPassword");
  const submitBtn = document.getElementById("submit-btn");
  const modeHint = document.getElementById("mode-hint");
  if (
    !(form instanceof HTMLFormElement) ||
    !(email instanceof HTMLInputElement) ||
    !(password instanceof HTMLInputElement) ||
    !(totpSecret instanceof HTMLInputElement) ||
    !(masterPassword instanceof HTMLInputElement) ||
    !(submitBtn instanceof HTMLButtonElement) ||
    !(modeHint instanceof HTMLElement)
  ) {
    throw new Error("Missing form elements");
  }
  return {
    form,
    email,
    password,
    totpSecret,
    masterPassword,
    submitBtn,
    modeHint,
  };
}

async function init(): Promise<void> {
  console.log("Function init called");
  const els = getFormElements();
  const stored = await loadStoredVault();

  if (stored) {
    els.modeHint.textContent =
      "Credentials are saved (encrypted). Enter all fields below and your master password to update. All fields are required on each update.";
    els.submitBtn.textContent = "Update encrypted vault";
  } else {
    els.modeHint.textContent =
      "First-time setup: enter your CUNY login email, password, TOTP secret (Base32), and a strong master password used only by this extension. The master password is never stored.";
    els.submitBtn.textContent = "Save encrypted vault";
  }

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("Form submitted");
    setStatus("");

    const email = els.email.value.trim();
    const password = els.password.value;
    const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
    const masterPassword = els.masterPassword.value;

    if (!validateEmail(email)) {
      setStatus(`Email must end with ${REQUIRED_EMAIL_SUFFIX}`);
      return;
    }
    if (!totpSecret.length) {
      setStatus("TOTP secret is required.");
      return;
    }

    els.submitBtn.disabled = true;
    try {
      if (stored) {
        try {
          await decryptVault(stored, masterPassword);
        } catch (err) {
          const msg =
            err instanceof Error && err.message === "DECRYPT_FAILED"
              ? "Wrong master password or corrupted vault."
              : "Could not decrypt vault.";
          setStatus(msg);
          return;
        }
      }

      const newVault = await encryptVault(
        { email, password, totpSecret },
        masterPassword
      );
      await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
      els.masterPassword.value = "";
      setStatus("Saved. Secrets are encrypted locally.", true);
    } catch (err) {
      console.error(err);
      setStatus("Save failed. Try again.");
    } finally {
      els.submitBtn.disabled = false;
    }
  });

  const testBtn = document.getElementById("test-message-btn");
  if (testBtn instanceof HTMLButtonElement) {
    testBtn.addEventListener("click", async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabId = tabs[0]?.id;
        if (tabId === undefined) {
          setStatus("No active tab.");
          return;
        }
        await browser.tabs.sendMessage(tabId, {
          type: "FILL_CREDENTIALS",
          payload: { demo: true },
        });
        setStatus("Sent FILL_CREDENTIALS to active tab.", true);
      } catch (err) {
        console.error(err);
        setStatus(
          "Could not send message (open ssologin.cuny.edu in the active tab?)."
        );
      }
    });
  }
}

void init();
