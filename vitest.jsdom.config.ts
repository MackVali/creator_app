import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      { find: "@/components/ai/OperatorAiSheet", replacement: path.resolve(__dirname, "src/components/ai/OperatorAiSheet.tsx") },
      { find: "@/app", replacement: path.resolve(__dirname, "src/app") },
      { find: "@/components/FlameEmber", replacement: path.resolve(__dirname, "src/components/FlameEmber.tsx") },
      { find: "@/components/notes", replacement: path.resolve(__dirname, "src/components/notes") },
      { find: "@/components/nutrition", replacement: path.resolve(__dirname, "src/components/nutrition") },
      { find: "@/components/schedule", replacement: path.resolve(__dirname, "src/components/schedule") },
      { find: "@/components/ui/Progress", replacement: path.resolve(__dirname, "components/ui/Progress.tsx") },
      { find: "@/components/ui/toast", replacement: path.resolve(__dirname, "components/ui/toast.tsx") },
      { find: "@/components/xp", replacement: path.resolve(__dirname, "src/components/xp") },
      { find: "@/hooks", replacement: path.resolve(__dirname, "src/hooks") },
      { find: "@/components", replacement: path.resolve(__dirname, "components") },
      { find: "@/lib/haptics", replacement: path.resolve(__dirname, "src/lib/haptics") },
      { find: "@/lib/supabase", replacement: path.resolve(__dirname, "lib/supabase.ts") },
      { find: "@/lib/utils/logGate", replacement: path.resolve(__dirname, "src/lib/utils/logGate.ts") },
      { find: "@/lib/utils", replacement: path.resolve(__dirname, "lib/utils.ts") },
      { find: "@/lib/auth", replacement: path.resolve(__dirname, "lib/auth.ts") },
      { find: "@/lib/time", replacement: path.resolve(__dirname, "src/lib/time") },
      { find: "@/lib/scheduler", replacement: path.resolve(__dirname, "src/lib/scheduler") },
      {
        find: /^@\/lib\/(.*)$/,
        replacement: (importPath: string) => {
          const relativePath = importPath.replace(/^@\/lib\//, "");
          const srcPath = path.resolve(__dirname, "src/lib", relativePath);
          const libPath = path.resolve(__dirname, "lib", relativePath);
          const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"];
          const existsInSrc = extensions.some((ext) =>
            fs.existsSync(srcPath + ext)
          );
          return existsInSrc ? srcPath : libPath;
        },
      },
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
