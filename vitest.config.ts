import path from "node:path";

import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(__dirname);

export default defineConfig({
  test: {
    environment: "node",                 // jsdom not needed for this env sanity test
    setupFiles: ["./vitest.setup.ts"],   // loads .env.test
    include: [
      "test/**/*.spec.ts",
      "src/lib/scheduler/__tests__/**/*.spec.ts",
    ],      // your tests
    reporters: ["default"],
    coverage: {
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: [
      { find: "@/components", replacement: path.resolve(projectRoot, "src/components") },
      { find: "@/lib/scheduler", replacement: path.resolve(projectRoot, "src/lib/scheduler") },
      { find: "@/lib", replacement: path.resolve(projectRoot, "lib") },
      { find: "@/types", replacement: path.resolve(projectRoot, "src/types") },
      { find: "@", replacement: path.resolve(projectRoot, "src") },
    ],
  },
});
