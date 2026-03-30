import { defineConfig } from "vite";
import { resolve } from "node:path";

/** Single-file IIFE for MV3 content script (no shared ES chunks). */
export default defineConfig({
  root: ".",
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    minify: false, // for debugging
    lib: {
      entry: resolve(__dirname, "src/content/content.ts"),
      name: "cunyContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    target: "es2022",
    sourcemap: true,
  },
});
