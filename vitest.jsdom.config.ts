import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/components\/ui/,
        replacement: path.resolve(__dirname, "components/ui"),
      },
      {
        find: /^@\/lib\/supabase/,
        replacement: path.resolve(__dirname, "lib/supabase"),
      },
      { find: /^@\/lib/, replacement: path.resolve(__dirname, "src/lib") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: "@/components",
        replacement: path.resolve(__dirname, "src/components"),
      },
      { find: "@/lib", replacement: path.resolve(__dirname, "src/lib") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/ui/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
  },
});
