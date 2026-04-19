import { describe, expect, test, vi } from "vitest";
import { VAULT_STORAGE_KEY, encryptVault, type StoredVault } from "../crypto/vault";
import { SESSION_MASTER_KEY } from "../cuny/ssoSite";
import { loadVaultSessionSnapshot, type SnapshotStorage } from "./snapshot";

const PAYLOAD = {
  email: "student@login.cuny.edu",
  password: "hunter2",
  totpSecret: "JBSWY3DPEHPK3PXP",
};
const MASTER = "correct-horse-battery-staple";

async function encryptOk(): Promise<StoredVault> {
  const r = await encryptVault(PAYLOAD, MASTER);
  expect(r.isOk()).toBe(true);
  if (r.isErr()) throw new Error("encryptVault");
  return r.value;
}

function makeStorage(mocks: {
  localGet: Record<string, unknown>;
  sessionGet?: Record<string, unknown>;
  sessionRemove?: ReturnType<typeof vi.fn>;
}): SnapshotStorage {
  return {
    local: { get: vi.fn().mockResolvedValue(mocks.localGet) },
    session: {
      get: vi.fn().mockResolvedValue(mocks.sessionGet ?? {}),
      remove: mocks.sessionRemove ?? vi.fn().mockResolvedValue(undefined),
    },
  } as SnapshotStorage;
}

describe("loadVaultSessionSnapshot", () => {
  test("no vault → setup", async () => {
    const storage = makeStorage({ localGet: {} });
    const snap = await loadVaultSessionSnapshot(storage);
    expect(snap.mode).toBe("setup");
    expect(snap.storedVault).toBeNull();
    expect(snap.sessionMasterPassword).toBeNull();
    expect(snap.sessionPayload).toBeNull();
    expect(storage.session?.remove).not.toHaveBeenCalled();
  });

  test("invalid vault payload → setup", async () => {
    const storage = makeStorage({ localGet: { [VAULT_STORAGE_KEY]: { not: "a vault" } } });
    const snap = await loadVaultSessionSnapshot(storage);
    expect(snap.mode).toBe("setup");
    expect(snap.storedVault).toBeNull();
  });

  test("vault and no session master → locked", async () => {
    const vault = await encryptOk();
    const storage = makeStorage({
      localGet: { [VAULT_STORAGE_KEY]: vault },
      sessionGet: {},
    });
    const snap = await loadVaultSessionSnapshot(storage);
    expect(snap.mode).toBe("locked");
    expect(snap.storedVault).toEqual(vault);
    expect(snap.sessionMasterPassword).toBeNull();
    expect(snap.sessionPayload).toBeNull();
  });

  test("vault and session master and decrypt ok → unlocked", async () => {
    const vault = await encryptOk();
    const storage = makeStorage({
      localGet: { [VAULT_STORAGE_KEY]: vault },
      sessionGet: { [SESSION_MASTER_KEY]: MASTER },
    });
    const snap = await loadVaultSessionSnapshot(storage);
    expect(snap.mode).toBe("unlocked");
    expect(snap.storedVault).toEqual(vault);
    expect(snap.sessionMasterPassword).toBe(MASTER);
    expect(snap.sessionPayload).toEqual(PAYLOAD);
    expect(storage.session?.remove).not.toHaveBeenCalled();
  });

  test("vault and wrong session master → locked and clears session", async () => {
    const vault = await encryptOk();
    const remove = vi.fn().mockResolvedValue(undefined);
    const storage = makeStorage({
      localGet: { [VAULT_STORAGE_KEY]: vault },
      sessionGet: { [SESSION_MASTER_KEY]: "wrong-password" },
      sessionRemove: remove,
    });
    const snap = await loadVaultSessionSnapshot(storage);
    expect(snap.mode).toBe("locked");
    expect(snap.storedVault).toEqual(vault);
    expect(snap.sessionMasterPassword).toBeNull();
    expect(snap.sessionPayload).toBeNull();
    expect(remove).toHaveBeenCalledWith(SESSION_MASTER_KEY);
  });
});
