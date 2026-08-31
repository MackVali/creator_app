import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(__dirname);

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",                 // jsdom not needed for this env sanity test
    setupFiles: ["./vitest.setup.ts"],   // loads .env.test
    include: [
      "test/**/*.spec.ts",
      "src/lib/scheduler/__tests__/**/*.spec.ts",
      "src/lib/monuments/__tests__/**/*.spec.ts",
      "src/lib/scheduler/**/*.test.ts",
    ],      // your tests
    reporters: ["default"],
    coverage: {
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: [
      {
        find: "@/components/ui/FabCreationContext",
        replacement: path.resolve(projectRoot, "components/ui/FabCreationContext.tsx"),
      },
      {
        find: "@/components/ui/LazyFab",
        replacement: path.resolve(projectRoot, "components/ui/LazyFab.tsx"),
      },
      {
        find: "@/components/ui/fab-form-classes",
        replacement: path.resolve(projectRoot, "components/ui/fab-form-classes.ts"),
      },
      {
        find: "@/components/ui/button",
        replacement: path.resolve(projectRoot, "components/ui/button.tsx"),
      },
      {
        find: "@/components/ui/input",
        replacement: path.resolve(projectRoot, "components/ui/input.tsx"),
      },
      {
        find: "@/components/ui/label",
        replacement: path.resolve(projectRoot, "components/ui/label.tsx"),
      },
      {
        find: "@/components/ui/select",
        replacement: path.resolve(projectRoot, "components/ui/select.tsx"),
      },
      {
        find: "@/components/ui/textarea",
        replacement: path.resolve(projectRoot, "components/ui/textarea.tsx"),
      },
      {
        find: "@/components/auth/AuthProvider",
        replacement: path.resolve(projectRoot, "components/auth/AuthProvider.tsx"),
      },
      {
        find: "@/components/entitlement/EntitlementProvider",
        replacement: path.resolve(projectRoot, "components/entitlement/EntitlementProvider.tsx"),
      },
      {
        find: "@/components/habits/habit-form-fields",
        replacement: path.resolve(projectRoot, "components/habits/habit-form-fields.tsx"),
      },
      { find: "@/components", replacement: path.resolve(projectRoot, "src/components") },
      { find: "@/lib/utils/logGate", replacement: path.resolve(projectRoot, "src/lib/utils/logGate.ts") },
      { find: "@/lib/utils", replacement: path.resolve(projectRoot, "lib/utils.ts") },
      { find: "@/lib/auth", replacement: path.resolve(projectRoot, "lib/auth.ts") },
      { find: "@/lib/scheduler", replacement: path.resolve(projectRoot, "src/lib/scheduler") },
      { find: "@/lib/supabase/server", replacement: path.resolve(projectRoot, "lib/supabase/server.ts") },
      { find: "@/lib/supabase/admin", replacement: path.resolve(projectRoot, "src/lib/supabase/admin.ts") },
      { find: "@/lib/supabase/retry-fetch", replacement: path.resolve(projectRoot, "lib/supabase/retry-fetch.ts") },
      { find: "@/lib/supabase", replacement: path.resolve(projectRoot, "lib/supabase.ts") },
      { find: "@/types", replacement: path.resolve(projectRoot, "src/types") },
      {
        find: /^@\/lib\/(.*)$/,
        replacement: (importPath: string) => {
          const relativePath = importPath.replace(/^@\/lib\//, "");
          const srcPath = path.resolve(projectRoot, "src/lib", relativePath);
          const libPath = path.resolve(projectRoot, "lib", relativePath);
          const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"];
          const existsInSrc = extensions.some((ext) =>
            fs.existsSync(srcPath + ext)
          );
          return existsInSrc ? srcPath : libPath;
        },
      },
      { find: "@", replacement: path.resolve(projectRoot, "src") },
    ],
  },
});
