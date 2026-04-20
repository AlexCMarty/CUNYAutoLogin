import { defineConfig, type Plugin } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestSrc =
  process.env.E2E_MANIFEST === "1" ? "src/manifest.e2e.json" : "src/manifest.json";

function emitMergedManifestPlugin(): Plugin {
  return {
    name: "emit-merged-manifest",
    closeBundle() {
      const base = JSON.parse(readFileSync(manifestSrc, "utf8")) as Record<string, unknown>;
      writeFileSync(
        resolve(__dirname, "dist/manifest.json"),
        `${JSON.stringify(base, null, 2)}\n`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    root: ".",
    base: "./",
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: true,
      minify: isDev ? false : "esbuild",
      rollupOptions: {
        input: {
          sidebar: resolve(__dirname, "sidebar.html"),
          background: resolve(__dirname, "src/background/service-worker.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name]-[hash].js",
          assetFileNames: "[name][extname]",
        },
      },
      target: "es2022",
      sourcemap: isDev,
    },
    plugins: [
      emitMergedManifestPlugin(),
    ],
  };
});
