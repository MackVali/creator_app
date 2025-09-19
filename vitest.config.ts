import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",                 // jsdom not needed for this env sanity test
    setupFiles: ["./vitest.setup.ts"],   // loads .env.test
    include: ["test/**/*.spec.ts"],      // your tests
    reporters: ["default"],
    coverage: {
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
