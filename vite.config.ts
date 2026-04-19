import { defineConfig, type Plugin } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { devSideSurfaceManifestPatch } from "./src/dev/sideSurface.manifest.patch";

const manifestSrc =
  process.env.E2E_MANIFEST === "1" ? "src/manifest.e2e.json" : "src/manifest.json";

function emitMergedManifestPlugin(mode: string): Plugin {
  return {
    name: "emit-merged-manifest",
    closeBundle() {
      const base = JSON.parse(readFileSync(manifestSrc, "utf8")) as Record<string, unknown>;
      const merged =
        mode === "development"
          ? {
              ...base,
              ...devSideSurfaceManifestPatch,
              minimum_chrome_version: "114",
            }
          : base;
      writeFileSync(
        resolve(__dirname, "dist/manifest.json"),
        `${JSON.stringify(merged, null, 2)}\n`
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
          popup: resolve(__dirname, "popup.html"),
          background: resolve(__dirname, "src/background/service-worker.ts"),
          ...(isDev ? { sidebar: resolve(__dirname, "sidebar.html") } : {}),
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
      ...(isDev
        ? [
            viteStaticCopy({
              targets: [{ src: "icons/dev-sidebar-48.png", dest: "icons" }],
            }),
          ]
        : []),
      emitMergedManifestPlugin(mode),
    ],
  };
});
