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

  it("uses a four-step setup wizard followed by a result view", () => {
    expect(panel).toContain('"About you"');
    expect(panel).toContain('"Your body"');
    expect(panel).toContain('"Your activity"');
    expect(panel).toContain('"Your goal"');
    expect(panel).toContain('"Your target"');
    expect(panel).toContain('Step ${setupStep + 1} of 4');
    expect(panel).toContain('type SetupView = "wizard" | "result" | "advanced"');
    expect(panel).toContain('type SetupStep = 0 | 1 | 2 | 3');
    expect(panel).not.toContain('title="Profile inputs"');
    expect(panel).not.toContain('title="Daily macros"');
    expect(panel).not.toContain('title="Preview and save"');
  });

  it("keeps advanced and manual target controls out of the primary setup path", () => {
    expect(panel).toContain("Adjust target");
    expect(panel).toContain("Manual calories");
    expect(panel).toContain("custom_grams");
    expect(panel).toContain("custom_percentages");
    expect(panel).toContain("Object.entries(macroModeLabels)");
    expect(panel).not.toContain("Calculation setting");
    expect(panel).not.toContain("Male equation");
    expect(panel).not.toContain("Female equation");
    expect(panel).not.toContain("BMI screening");
    expect(panel).not.toContain("Activity coefficient");
  });

  it("presents sex as Male and Female and maps activity with user-facing rows", () => {
    expect(panel).toContain('"Male"');
    expect(panel).toContain('"Female"');
    expect(panel).toContain("Mostly seated");
    expect(panel).toContain("Lightly active");
    expect(panel).toContain("Extremely active");
    expect(panel).toContain('value: "sedentary"');
    expect(panel).toContain('value: "very_active"');
  });

  it("uses server preview and existing goal save actions", () => {
    expect(panel).toContain('fetch("/api/nutrition/targets/preview"');
    expect(panel).toContain('fetch("/api/nutrition/goals"');
    expect(panel).toContain("Use this target");
  });
});
