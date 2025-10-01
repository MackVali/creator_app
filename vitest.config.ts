import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",                 // jsdom not needed for this env sanity test
    setupFiles: ["./vitest.setup.ts"],   // loads .env.test
    include: ["test/**/*.spec.ts", "test/**/*.spec.tsx"],      // your tests
    reporters: ["default"],
    coverage: {
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
