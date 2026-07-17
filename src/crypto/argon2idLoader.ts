/**
 * Loads the OpenPGP.js Argon2id WASM once and caches the hash function.
 * Browser/extension path only — `fetch` of Vite `?url` assets (inlined as
 * `data:` URLs in production). Vitest wires a fetch polyfill in
 * `vitest.setup.ts` so root-absolute `?url` paths resolve from disk.
 */

import setupWasm from "argon2id/lib/setup.js";
import type { computeHash } from "argon2id/lib/setup.js";
import simdWasmUrl from "argon2id/dist/simd.wasm?url";
import nonSimdWasmUrl from "argon2id/dist/no-simd.wasm?url";

let argon2idPromise: Promise<computeHash> | null = null;

const instantiateFromBytes = async (
  bytes: BufferSource,
  imports: WebAssembly.Imports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> =>
  (await WebAssembly.instantiate(
    bytes,
    imports
  )) as WebAssembly.WebAssemblyInstantiatedSource;

const instantiateWasm = async (
  url: string,
  imports: WebAssembly.Imports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> => {
  const response = await fetch(url);
  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      return await WebAssembly.instantiateStreaming(response.clone(), imports);
    } catch {
      // Non-WASM MIME (common for extension / file assets) — fall through.
    }
  }
  return instantiateFromBytes(await response.arrayBuffer(), imports);
};

/** Returns a cached Argon2id hash function (WASM loaded on first call). */
export const getArgon2id = (): Promise<computeHash> => {
  if (!argon2idPromise) {
    argon2idPromise = setupWasm(
      (imports) => instantiateWasm(simdWasmUrl, imports),
      (imports) => instantiateWasm(nonSimdWasmUrl, imports)
    ).catch((error: unknown) => {
      // Do not permanently cache a rejected load — a transient WASM failure
      // must allow the next unlock/save to retry.
      argon2idPromise = null;
      throw error;
    });
  }
  return argon2idPromise;
};

/** Test-only: drop the cached loader so the next call reloads WASM. */
export const resetArgon2idCacheForTests = (): void => {
  argon2idPromise = null;
};
