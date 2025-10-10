import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
