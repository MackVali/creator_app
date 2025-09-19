import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/components": path.resolve(__dirname, "src/components"),
      "@/lib": path.resolve(__dirname, "src/lib"),
      "@/types": path.resolve(__dirname, "src/types"),
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
