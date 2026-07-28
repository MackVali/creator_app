import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/nutrition/NutritionTargetPanel.tsx", "utf8");
const sharedMealPlanPanel = readFileSync("src/components/nutrition/SharedMealPlanPanel.tsx", "utf8");
const mealPlans = readFileSync("src/lib/nutrition/mealPlans.ts", "utf8");
const dailyOverrideRoute = readFileSync("src/app/api/nutrition/targets/[id]/route.ts", "utf8");

function functionBlock(name: string) {
  const start = panel.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = panel.indexOf("\nfunction ", start + 1);
  return panel.slice(start, next === -1 ? undefined : next);
}

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

  it("uses two primary setup screens followed by a result view", () => {
    expect(panel).toContain('"What do you want to change?"');
    expect(panel).toContain('"Tell us where you’re starting"');
    expect(panel).toContain("Your daily target");
    expect(panel).toContain('type SetupView = "wizard" | "result" | "advanced"');
    expect(panel).toContain('type SetupStep = 0 | 1');
    expect(panel).toContain('step === 0 ? (');
    expect(panel).toContain("<DirectionStep");
    expect(panel).toContain("<BaselineStep");
    expect(panel).toContain('`${setupStep + 1} of 2`');
    expect(panel.indexOf('"What do you want to change?"')).toBeLessThan(panel.indexOf('"Tell us where you’re starting"'));
    expect(panel).not.toContain("WizardProgress");
    expect(panel).not.toContain("grid-cols-4 gap-1.5");
    expect(panel).not.toContain('title="Profile inputs"');
    expect(panel).not.toContain('title="Daily macros"');
    expect(panel).not.toContain('title="Preview and save"');
  });

  it("keeps advanced settings accessible without removing manual target controls", () => {
    expect(panel).toContain('setSetupView("advanced")');
    expect(panel).toContain("Adjust details");
    expect(panel).toContain("Manual calories");
    expect(panel).toContain("Goal details");
    expect(panel).toContain("Pace");
    expect(panel).toContain("Slow");
    expect(panel).toContain("Steady");
    expect(panel).toContain("Fast");
    expect(panel).toContain("Goal weight");
    expect(panel).toContain("Body-fat percentage");
    expect(panel).toContain("Nutrition considerations");
    expect(panel).toContain("Adaptive adjustment suggestions");
    expect(panel).toContain("custom_grams");
    expect(panel).toContain("custom_percentages");
    expect(panel).toContain("Object.entries(macroModeLabels)");
    expect(panel).not.toContain("Calculation setting");
    expect(panel).not.toContain("Male equation");
    expect(panel).not.toContain("Female equation");
    expect(panel).not.toContain("BMI screening");
    expect(panel).not.toContain("Activity coefficient");
  });

  it("places goal type, current weight, conditional goal weight, and conditional pace on Direction", () => {
    const direction = functionBlock("DirectionStep");
    expect(panel).toContain('lose: "Lose weight"');
    expect(panel).toContain('gain: "Gain weight"');
    expect(direction).toContain("goalLabels");
    expect(direction).toContain("Current weight");
    expect(direction).toContain("Goal weight");
    expect(direction).toContain("<DirectionPaceSelector");
    expect(direction).toContain('form.goalType === "lose" || form.goalType === "gain"');
    expect(direction).toContain("Keep your daily target near estimated maintenance.");
    expect(direction).toContain("Stay near maintenance while prioritizing protein.");
    expect(functionBlock("DirectionPaceSelector")).toContain("weeklyRateLabel");
  });

  it("does not render current weight again on Baseline", () => {
    const baseline = functionBlock("BaselineStep");
    expect(baseline).toContain("Sex");
    expect(baseline).toContain("Age");
    expect(baseline).toContain("Height");
    expect(baseline).toContain("Daily activity");
    expect(baseline).not.toContain("Current weight");
    expect(baseline).not.toContain("setWeightDisplay");
  });

  it("keeps units on Direction and only a compact current-unit action on Baseline", () => {
    expect(functionBlock("BasicsStep")).not.toContain("UnitToggle");
    expect(functionBlock("ActivityStep")).not.toContain("UnitToggle");
    expect(functionBlock("DefineGoalStep")).not.toContain("UnitToggle");
    expect(functionBlock("DirectionStep")).toContain("UnitToggle");
    expect(functionBlock("BaselineStep")).not.toContain("UnitToggle");
    expect(functionBlock("MeasurementsStep")).toContain("UnitToggle");
    expect(functionBlock("BaselineStep")).toContain('form.units === "metric" ? "Metric" : "US"');
  });

  it("presents sex as Male/Female and expands activity inline", () => {
    const baseline = functionBlock("BaselineStep");
    expect(panel).toContain('"Male"');
    expect(panel).toContain('"Female"');
    expect(baseline).toContain("Daily activity");
    expect(baseline).toContain("activityExpanded");
    expect(baseline).toContain("setActivityExpanded(false)");
    expect(baseline).not.toContain("role=\"dialog\"");
    expect(panel).toContain("Mostly seated");
    expect(panel).toContain("Lightly active");
    expect(panel).toContain("Extremely active");
    expect(panel).toContain('value: "sedentary"');
    expect(panel).toContain('value: "very_active"');
  });

  it("keeps goal labels mapped to the existing engine goal values", () => {
    expect(panel).toContain('lose: "Lose weight"');
    expect(panel).toContain('maintain: "Maintain"');
    expect(panel).toContain('gain: "Gain weight"');
    expect(panel).toContain('recomposition: "Recomposition"');
    expect(panel).toContain('const nextRate = goalType === "lose"');
    expect(panel).toContain('Goal weight is required.');
    expect(panel).toContain('Choose a goal weight below your current weight.');
    expect(panel).toContain('Choose a goal weight above your current weight.');
    expect(panel).toContain("directionTouched");
    expect(panel).toContain("setupAttempted");
  });

  it("does not render old redundant primary path titles or bright glass controls", () => {
    expect(panel).not.toContain('"About you"');
    expect(panel).not.toContain('"Your body"');
    expect(panel).not.toContain('"Your activity"');
    expect(panel).not.toContain('"Your goal"');
    expect(panel).not.toContain('"Your target"');
    expect(panel).not.toContain('"What are you building toward?"');
    expect(panel).not.toContain('"Tell us about your body."');
    expect(panel).not.toContain('"How active are you most days?"');
    expect(panel).not.toContain('"Define your goal."');
    expect(panel).not.toContain("radial-gradient");
    expect(panel).not.toContain("backdrop-blur-sm");
    expect(panel).not.toContain("bg-white px");
  });

  it("uses server preview and existing goal save actions", () => {
    expect(panel).toContain('fetch("/api/nutrition/targets/preview"');
    expect(panel).toContain('fetch("/api/nutrition/goals"');
    expect(panel).toContain("See my target");
    expect(panel).toContain("Use target");
    expect(panel).toContain("View calculation");
  });

  it("renders result values from the server preview without default BMI details", () => {
    const result = functionBlock("ResultSurface");
    expect(result).toContain("preview.calorieTargetKcal");
    expect(result).toContain("preview.proteinTargetG");
    expect(result).toContain("preview.carbTargetG");
    expect(result).toContain("preview.fatTargetG");
    expect(result).toContain("preview.estimatedMaintenanceKcal");
    expect(result).toContain("formatSignedCalories(calorieAdjustment)");
    expect(result).toContain("Targeted near maintenance");
    expect(result).toContain("Maintenance calories with protein prioritized");
    expect(result).not.toContain("bmi");
  });

  it("hides the visible Meal Plan budget while preserving target prompts and planned-total helper", () => {
    expect(sharedMealPlanPanel).not.toContain("MealPlanBudgetSummary");
    expect(sharedMealPlanPanel).not.toContain("Today&apos;s plan");
    expect(sharedMealPlanPanel).not.toContain("calculateMealPlanPlannedTotals");
    expect(sharedMealPlanPanel).toContain("<NutritionTargetPanel");
    expect(panel).toContain("Set your daily target");
    expect(panel).toContain("Get a calorie and macro target for your meal plan.");
    expect(sharedMealPlanPanel).toContain("No meals planned");
    expect(mealPlans).toContain("export function calculateMealPlanPlannedTotals");
  });
});
