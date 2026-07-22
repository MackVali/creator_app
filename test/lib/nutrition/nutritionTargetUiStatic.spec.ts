import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/nutrition/NutritionTargetPanel.tsx", "utf8");
const dailyOverrideRoute = readFileSync("src/app/api/nutrition/targets/[id]/route.ts", "utf8");

describe("Nutrition target setup UI static contracts", () => {
  it("does not use browser prompt or alert interactions", () => {
    expect(panel).not.toContain("window.prompt");
    expect(panel).not.toContain("window.alert");
    expect(panel).not.toContain("prompt(");
    expect(panel).not.toContain("alert(");
  });

  it("supports explicit daily override reset and confirmed macro mismatch", () => {
    expect(dailyOverrideRoute).toContain("resetToGoalVersion");
    expect(dailyOverrideRoute).toContain("confirmMacroMismatch");
    expect(dailyOverrideRoute).toContain("is_daily_override: false");
    expect(dailyOverrideRoute).toContain("override_reason: null");
  });
});

