import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/sidebar/sidebar.ts",
    "src/background/service-worker.ts",
    "src/content/content.ts",
    "e2e/**/*.spec.ts",
  ],
  project: ["src/**/*.ts", "e2e/**/*.ts", "scripts/*.mjs"],
};

export default config;
