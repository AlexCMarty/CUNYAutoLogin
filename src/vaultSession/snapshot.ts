/**
 * Single source of truth for vault + session master state (matches sidebar vault controller `init()`).
 *
 * Avoids a static `import "webextension-polyfill"` so unit tests can import this module in Node
 * (the polyfill throws outside an extension). Extension callers omit `storage` and we lazy-load
 * `browser.storage` on first use.
 */

import {
  VAULT_STORAGE_KEY,
  decryptVault,
  isStoredVault,
  type StoredVault,
  type VaultPayload,
} from "../crypto/vault";
import { SESSION_MASTER_KEY } from "../cuny/ssoSite";

type VaultSessionMode = "setup" | "locked" | "unlocked";

export type VaultSessionSnapshot = {
  mode: VaultSessionMode;
  storedVault: StoredVault | null;
  sessionMasterPassword: string | null;
  sessionPayload: VaultPayload | null;
};

/** Subset of `browser.storage` used by the snapshot (injectable for unit tests). */
export type SnapshotStorage = {
  local: { get(keys: string): Promise<Record<string, unknown>> };
  session?: {
    get(keys: string): Promise<Record<string, unknown>>;
    remove(keys: string): Promise<void>;
  };
};

let cachedExtensionStorage: SnapshotStorage | null = null;

async function extensionStorage(): Promise<SnapshotStorage> {
  if (!cachedExtensionStorage) {
    const { default: browser } = await import("webextension-polyfill");
    cachedExtensionStorage = browser.storage;
  }
  return cachedExtensionStorage;
}

const warnSnapshotFailure = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] vaultSession.snapshot: ${context}`, error);
  }
};

async function readSessionMaster(storage: SnapshotStorage): Promise<string | null> {
  try {
    const result = await storage.session?.get(SESSION_MASTER_KEY);
    const sessionMasterCandidate = result?.[SESSION_MASTER_KEY];
    return typeof sessionMasterCandidate === "string" ? sessionMasterCandidate : null;
  } catch (error) {
    warnSnapshotFailure("readSessionMaster failed", error);
    return null;
  }
}

async function clearBadSessionMaster(storage: SnapshotStorage): Promise<void> {
  try {
    await storage.session?.remove(SESSION_MASTER_KEY);
  } catch (error) {
    warnSnapshotFailure("clearBadSessionMaster failed", error);
  }
}

/**
 * @param storage — omit in extension pages (lazy `browser.storage`). Unit tests pass a mock.
 */
export async function loadVaultSessionSnapshot(
  storage?: SnapshotStorage
): Promise<VaultSessionSnapshot> {
  const resolvedStorage = storage ?? (await extensionStorage());
  let localResult: Record<string, unknown>;
  try {
    localResult = await resolvedStorage.local.get(VAULT_STORAGE_KEY);
  } catch (error) {
    warnSnapshotFailure("local.get failed", error);
    return {
      mode: "setup",
      storedVault: null,
      sessionMasterPassword: null,
      sessionPayload: null,
    };
  }
  const raw = localResult[VAULT_STORAGE_KEY];
  let storedVault: StoredVault | null = null;
  if (raw !== undefined && raw !== null && isStoredVault(raw)) {
    storedVault = raw;
  }

  if (!storedVault) {
    return {
      mode: "setup",
      storedVault: null,
      sessionMasterPassword: null,
      sessionPayload: null,
    };
  }

  const savedMaster = await readSessionMaster(resolvedStorage);
  if (!savedMaster) {
    return {
      mode: "locked",
      storedVault,
      sessionMasterPassword: null,
      sessionPayload: null,
    };
  }

  const decResult = await decryptVault(storedVault, savedMaster);
  if (decResult.isOk()) {
    return {
      mode: "unlocked",
      storedVault,
      sessionMasterPassword: savedMaster,
      sessionPayload: decResult.value,
    };
  }

  await clearBadSessionMaster(resolvedStorage);
  return {
    mode: "locked",
    storedVault,
    sessionMasterPassword: null,
    sessionPayload: null,
  };
}
