import fs from "node:fs";
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
      { find: "@/components", replacement: path.resolve(projectRoot, "src/components") },
      { find: "@/lib/scheduler", replacement: path.resolve(projectRoot, "src/lib/scheduler") },
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
