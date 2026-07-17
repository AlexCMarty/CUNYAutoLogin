/**
 * Loads the OpenPGP.js Argon2id WASM once and caches the hash function.
 * Uses `setupWasm` + `?url` assets so Vite (sidebar / service worker) and Vitest
 * share one path without a custom wasm-loader.
 *
 * Node/Vitest cannot `fetch` filesystem paths; the fallback reads bytes via a
 * dynamic `node:fs` import guarded by `@vite-ignore` so the browser bundle
 * never statically depends on Node builtins.
 */

import setupWasm from "argon2id/lib/setup.js";
import type { computeHash } from "argon2id/lib/setup.js";
import simdWasmUrl from "argon2id/dist/simd.wasm?url";
import nonSimdWasmUrl from "argon2id/dist/no-simd.wasm?url";

let argon2idPromise: Promise<computeHash> | null = null;

const resolveWasmPath = async (url: string): Promise<string> => {
  const [{ fileURLToPath }, { resolve: resolvePath }] = await Promise.all([
    import(/* @vite-ignore */ "node:url"),
    import(/* @vite-ignore */ "node:path"),
  ]);
  if (url.startsWith("file:")) return fileURLToPath(url);
  // Vitest serves Vite `?url` imports as root-absolute paths (`/node_modules/...`).
  if (url.startsWith("/") && typeof process !== "undefined" && typeof process.cwd === "function") {
    return resolvePath(process.cwd(), url.slice(1));
  }
  return url;
};

const readWasmBytesFromNode = async (url: string): Promise<Uint8Array> => {
  const { readFileSync } = await import(/* @vite-ignore */ "node:fs");
  // Copy into a plain Uint8Array so TypeScript picks the BufferSource overload of
  // WebAssembly.instantiate (Node's Buffer can confuse the Module overload).
  return new Uint8Array(readFileSync(await resolveWasmPath(url)));
};

const instantiateFromBytes = async (
  bytes: BufferSource,
  imports: WebAssembly.Imports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> => {
  // Explicit cast: TS's WebAssembly.instantiate overloads sometimes resolve the
  // Module→Instance variant for Node BufferSource shapes; at runtime this is
  // always the bytes→InstantiatedSource path.
  return (await WebAssembly.instantiate(
    bytes,
    imports
  )) as WebAssembly.WebAssemblyInstantiatedSource;
};

const instantiateWasm = async (
  url: string,
  imports: WebAssembly.Imports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> => {
  try {
    const response = await fetch(url);
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(response.clone(), imports);
      } catch {
        // Non-WASM MIME (common for extension / file assets) — fall through.
      }
    }
    return instantiateFromBytes(await response.arrayBuffer(), imports);
  } catch {
    const bytes = await readWasmBytesFromNode(url);
    return instantiateFromBytes(bytes as BufferSource, imports);
  }
};

/** Returns a cached Argon2id hash function (WASM loaded on first call). */
export const getArgon2id = (): Promise<computeHash> => {
  argon2idPromise ??= setupWasm(
    (imports) => instantiateWasm(simdWasmUrl, imports),
    (imports) => instantiateWasm(nonSimdWasmUrl, imports)
  );
  return argon2idPromise;
};
