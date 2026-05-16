import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/sidebar/sidebar.ts",
    "src/background/service-worker.ts",
    "src/content/content.ts",
  ],
  project: ["src/**/*.ts"],
};

export default config;
