import { defineConfig } from "vite";
import { resolve } from "node:path";
import { viteStaticCopy } from "vite-plugin-static-copy";

const manifestSrc =
  process.env.E2E_MANIFEST === "1" ? "src/manifest.e2e.json" : "src/manifest.json";

export default defineConfig(({ mode }) => ({
  root: ".",
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: mode === "development" ? false : "esbuild",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
    target: "es2022",
    sourcemap: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: manifestSrc,
          dest: ".",
          rename: "manifest.json",
        },
      ],
    }),
  ],
}));
