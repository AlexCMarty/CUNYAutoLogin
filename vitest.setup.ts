/**
 * Vitest cannot `fetch` Vite root-absolute `?url` paths (`/node_modules/...`).
 * Serve those WASM files from disk so the production argon2idLoader (fetch-only)
 * works unchanged in unit tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.includes("argon2id") && url.endsWith(".wasm")) {
    const path = url.startsWith("/") ? resolve(process.cwd(), url.slice(1)) : url;
    const bytes = readFileSync(path);
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": "application/wasm" },
    });
  }
  if (url.startsWith("/") && url.includes("node_modules") && url.endsWith(".wasm")) {
    const path = resolve(process.cwd(), url.slice(1));
    const bytes = readFileSync(path);
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": "application/wasm" },
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;
