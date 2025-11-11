import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/components/schedule", replacement: path.resolve(__dirname, "src/components/schedule") },
      { find: "@/components", replacement: path.resolve(__dirname, "components") },
      { find: "@/lib/time", replacement: path.resolve(__dirname, "src/lib/time") },
      { find: "@/lib/scheduler", replacement: path.resolve(__dirname, "src/lib/scheduler") },
      { find: "@/lib", replacement: path.resolve(__dirname, "lib") },
      { find: "@/types", replacement: path.resolve(__dirname, "src/types") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/ui/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
  },
});
