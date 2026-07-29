import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/nutrition/NutritionTargetPanel.tsx", "utf8");
const noteSlashTextarea = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");
const sharedMealPlanPanel = readFileSync("src/components/nutrition/SharedMealPlanPanel.tsx", "utf8");
const mealPlans = readFileSync("src/lib/nutrition/mealPlans.ts", "utf8");
const mealPlanHook = readFileSync("src/hooks/useMealPlanDay.ts", "utf8");
const activeTargetHook = readFileSync("src/hooks/useActiveNutritionTarget.ts", "utf8");
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
    const weightPicker = functionBlock("WeightPicker");
    expect(panel).toContain('lose: "Lose weight"');
    expect(panel).toContain('gain: "Gain weight"');
    expect(direction).toContain("goalLabels");
    expect(direction).toContain('field="current"');
    expect(direction).toContain('field="goal"');
    expect(weightPicker).toContain("Current weight");
    expect(weightPicker).toContain("Goal weight");
    expect(direction).toContain("<DirectionPaceSelector");
    expect(direction).toContain('form.goalType === "lose" || form.goalType === "gain"');
    expect(direction).toContain("Keep your daily target near estimated maintenance.");
    expect(direction).toContain("Stay near maintenance while prioritizing protein.");
    expect(functionBlock("DirectionPaceSelector")).toContain("weeklyRateLabel");
  });

  it("renders Direction weights as editable inline picker controls", () => {
    const direction = functionBlock("DirectionStep");
    const weightPicker = functionBlock("WeightPicker");

    expect(direction).toContain("<WeightPicker");
    expect(weightPicker).toContain('type="button"');
    expect(weightPicker).toContain('aria-label={field === "current" ? "Decrease current weight" : "Decrease goal weight"}');
    expect(weightPicker).toContain('aria-label={field === "current" ? "Increase current weight" : "Increase goal weight"}');
    expect(weightPicker).toContain('aria-label={label}');
    expect(weightPicker).toContain('inputMode="decimal"');
    expect(weightPicker).toContain('type="text"');
    expect(weightPicker).toContain("event.currentTarget.select()");
    expect(weightPicker).toContain('event.key !== "Enter"');
    expect(functionBlock("updateWeightFieldDisplay")).toContain("setWeightDisplay");
    expect(functionBlock("updateWeightFieldDisplay")).toContain("setGoalWeightDisplay");
    expect(weightPicker).toContain("poundsToKilograms(1)");
    expect(weightPicker).toContain("0.5");
    expect(functionBlock("clampWeightKg")).toContain("weightMinKg");
    expect(functionBlock("clampWeightKg")).toContain("weightMaxKg");
    expect(weightPicker).not.toContain('type="number"');
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
    expect(panel).toContain("setupAttempted");
    expect(panel).not.toContain("directionTouched");
  });

  it("keeps first Direction validation hidden until Continue is attempted", () => {
    const setupRender = panel.slice(panel.indexOf("if (setupOpen)"));
    const continueSetup = panel.slice(panel.indexOf("const continueSetup"), panel.indexOf("if (setupOpen)"));

    expect(setupRender).toContain("showDirectionIssues={setupAttempted}");
    expect(setupRender).not.toContain("setupAttempted ||");
    expect(continueSetup).toContain("setSetupAttempted(true)");
    expect(continueSetup).toContain("focusFirstDirectionInvalidInput()");
    expect(continueSetup).toContain("setSetupAttempted(false)");
  });

  it("renders quiet field-level Direction errors with reserved layout lines", () => {
    const direction = functionBlock("DirectionStep");
    const weightPicker = functionBlock("WeightPicker");
    const validationLine = functionBlock("ValidationLine");

    expect(direction).toContain("currentWeightIssue");
    expect(direction).toContain("goalWeightIssue");
    expect(direction).toContain("paceIssue");
    expect(direction).toContain("issue={currentWeightIssue}");
    expect(direction).toContain("issue={goalWeightIssue}");
    expect(weightPicker).toContain("directionErrorIds.currentWeight");
    expect(weightPicker).toContain("directionErrorIds.goalWeight");
    expect(weightPicker).toContain("aria-describedby={issue ? errorId : undefined}");
    expect(weightPicker).toContain("aria-invalid={issue ? true : undefined}");
    expect(validationLine).toContain("min-h-3");
    expect(validationLine).toContain("text-[11px]");
    expect(validationLine).toContain("leading-3");
    expect(validationLine).toContain("text-red-300/78");
    expect(validationLine).toContain("{message ?? \"\"}");
  });

  it("assigns Direction validation to the field it belongs to", () => {
    const issues = functionBlock("directionFieldIssues");
    const direction = functionBlock("DirectionStep");
    const weightPicker = functionBlock("WeightPicker");

    expect(issues).toContain('issues.currentWeight = "Enter your current weight."');
    expect(issues).toContain('issues.goalWeight = "Goal weight is required."');
    expect(issues).toContain('issues.goalWeight = "Choose a goal weight below your current weight."');
    expect(issues).toContain('issues.goalWeight = "Choose a goal weight above your current weight."');
    expect(issues).toContain('issues.pace = "Choose a pace."');
    expect(direction.indexOf("field=\"goal\"")).toBeLessThan(direction.indexOf("issue={goalWeightIssue}"));
    expect(weightPicker.indexOf("directionErrorIds.goalWeight")).toBeLessThan(weightPicker.indexOf("aria-describedby={issue ? errorId : undefined}"));
  });

  it("removes the old amber Direction validation presentation", () => {
    const direction = functionBlock("DirectionStep");

    expect(direction).not.toContain("border-amber-300/15");
    expect(direction).not.toContain("bg-amber-300/[0.06]");
    expect(direction).not.toContain("text-amber-100/75");
    expect(direction).not.toContain("{showIssue && issue");
  });

  it("uses one bounded scroll body for the Nutrition target takeover", () => {
    const setupTakeover = panel.slice(panel.indexOf("if (setupOpen)"), panel.indexOf('return (\n    <div className="border-b'));

    expect(setupTakeover.match(/overflow-y-auto/g) ?? []).toHaveLength(1);
    expect(setupTakeover).toContain("flex h-full max-h-full min-h-0 flex-1 touch-pan-y flex-col overflow-hidden");
    expect(setupTakeover).toContain("pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:py-3");
    expect(setupTakeover).toContain("min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain");
    expect(setupTakeover).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]");
    expect(noteSlashTextarea).toContain('"flex h-full min-h-0 flex-col"');
    expect(noteSlashTextarea).toContain("h-full max-h-full min-h-0 rounded-none");
    expect(noteSlashTextarea).not.toContain("h-[100dvh] max-h-[100dvh] min-h-0");
    expect(noteSlashTextarea).toContain("items-stretch justify-center p-0");
    expect(noteSlashTextarea).toContain('? "min-h-0 flex-1 overflow-hidden p-0"');
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

  it("keeps Meal Plan saved-template selection on the shared template loader", () => {
    expect(sharedMealPlanPanel).toContain("useNutritionMealTemplates(50");
    expect(sharedMealPlanPanel).toContain("meal.meal_items?.length");
    expect(sharedMealPlanPanel).toContain("mealTemplateId: meal.id");
    expect(sharedMealPlanPanel).toContain('add(`meal:${meal.id}`');
    expect(sharedMealPlanPanel).toContain("mealTemplates.error");
    expect(sharedMealPlanPanel).toContain("mealTemplates.retry()");
  });

  it("keeps the Nutrition Meals tab on reusable meal templates", () => {
    const reusableMeals = noteSlashTextarea.slice(
      noteSlashTextarea.indexOf("function renderNutritionReusableMealsContent"),
      noteSlashTextarea.indexOf("function renderNutritionSavedMealsContent"),
    );

    expect(noteSlashTextarea).toContain("useNutritionMealTemplates(");
    expect(reusableMeals).toContain("nutritionMealTemplates.map");
    expect(reusableMeals).toContain("meal.meal_items?.length");
    expect(reusableMeals).toContain('selectNutritionSavedMeal(meal, "meal_template")');
    expect(reusableMeals).toContain("Create reusable meals for one-tap logging.");
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
    expect(result).toContain("calculateGoalTimelineEstimate");
    expect(result).toContain("preview.effectiveGoalRateKgPerWeek");
    expect(result).toContain("Estimated timeline");
    expect(result).not.toContain("bmi");
  });

  it("limits Meal Plan active target presentation to the compact two-line strip", () => {
    const compactStart = panel.indexOf('<button type="button" onClick={() => openSetup("update_goal")} className="w-full rounded-xl');
    const compactBranch = panel.slice(compactStart, panel.indexOf("</button>", compactStart));
    expect(sharedMealPlanPanel).toContain('presentation="compact"');
    expect(compactBranch).toContain("Daily target");
    expect(compactBranch).toContain('formatNumber(target.calorie_target_kcal, " kcal")');
    expect(compactBranch).toContain('formatNumber(target.protein_target_g)}P');
    expect(compactBranch).toContain('formatNumber(target.carb_target_g)}C');
    expect(compactBranch).toContain('formatNumber(target.fat_target_g)}F');
    expect(compactBranch).toContain("Edit");
    expect(compactBranch).toContain('bg-[#141416]');
    expect(compactBranch).not.toContain("Estimated maintenance");
    expect(compactBranch).not.toContain("Goal weight");
    expect(compactBranch).not.toContain("Daily override");
    expect(compactBranch).not.toContain("View calculation");
    expect(compactBranch).not.toContain("Source");
  });

  it("hides verbose target management in Meal Plan while preserving target prompts and planned-total helper", () => {
    expect(sharedMealPlanPanel).not.toContain("MealPlanBudgetSummary");
    expect(sharedMealPlanPanel).not.toContain("Today&apos;s plan");
    expect(sharedMealPlanPanel).not.toContain("calculateMealPlanPlannedTotals");
    expect(sharedMealPlanPanel).toContain("<NutritionTargetPanel");
    expect(sharedMealPlanPanel).toContain('presentation="compact"');
    expect(panel).toContain("Set your daily target");
    expect(panel).toContain("Get a calorie and macro target for your meal plan.");
    expect(sharedMealPlanPanel).toContain("No meals planned");
    expect(mealPlans).toContain("export function calculateMealPlanPlannedTotals");
  });

  it("keeps the missing-target prompt unchanged", () => {
    expect(panel).toContain("Set your daily target");
    expect(panel).toContain("Get a calorie and macro target for your meal plan.");
    expect(panel).toContain("Set target");
  });

  it("keeps Meal Plan data cached by Creator day and avoids manual duplicate refresh broadcasts", () => {
    expect(mealPlanHook).toContain("useQuery<MealPlanDay>");
    expect(mealPlanHook).toContain("useQueryClient");
    expect(mealPlanHook).toContain("getMealPlanDayQueryKey");
    expect(mealPlanHook).toContain("queryClient.invalidateQueries({ queryKey })");
    expect(mealPlanHook).toContain("getCurrentMealPlanCreatorDayDate");
    expect(mealPlanHook).not.toContain("window.dispatchEvent(new Event");
    expect(sharedMealPlanPanel).toContain("isRefreshing");
    expect(sharedMealPlanPanel).toContain("backgroundError");
    expect(sharedMealPlanPanel).toContain("Loading Meal Plan...");
    expect(sharedMealPlanPanel).not.toContain("Loading Meal Plan…");
  });

  it("uses the shared active daily target for Nutrition progress denominators", () => {
    const progressBars = noteSlashTextarea.slice(noteSlashTextarea.indexOf("function NutritionDailyProgressBars"), noteSlashTextarea.indexOf("function getNutritionMealOccurredAt"));
    expect(noteSlashTextarea).toContain("useActiveNutritionTarget");
    expect(noteSlashTextarea).toContain("getNutritionProgressTargetsFromActiveTarget");
    expect(noteSlashTextarea).toContain("targetGoals={nutritionDailyTargetGoals}");
    expect(progressBars).toContain("targetGoals.calories");
    expect(progressBars).toContain("targetGoals[macroKey]");
    expect(progressBars).not.toContain("target: DEFAULT_DAILY_NUTRITION_GOALS.calories");
    expect(progressBars).not.toContain("target: DEFAULT_DAILY_NUTRITION_GOALS[macroKey]");
    expect(activeTargetHook).toContain('ACTIVE_NUTRITION_TARGET_QUERY_ROOT = ["nutrition", "active-target"]');
    expect(activeTargetHook).toContain('fetch(`/api/nutrition/targets?${params.toString()}`');
    expect(activeTargetHook).toContain("getCurrentNutritionTargetCreatorDayDate");
  });

  it("keeps logged totals as progress numerators and does not count planned Meal Plan totals", () => {
    const entryProgress = noteSlashTextarea.slice(noteSlashTextarea.indexOf("const nutritionDailyProgress = shouldRenderNutritionDailyProgress"), noteSlashTextarea.indexOf("const refreshNutritionDailyTotals = useCallback", noteSlashTextarea.indexOf("const nutritionDailyProgress = shouldRenderNutritionDailyProgress")));
    expect(entryProgress).toContain("nutritionDailySavedTotals");
    expect(entryProgress).toContain("aggregateSelectedNutritionFoodSnapshots");
    expect(entryProgress).toContain("aggregateNutritionDraftTotals");
    expect(entryProgress).not.toContain("calculateMealPlanPlannedTotals");
    expect(noteSlashTextarea).toContain('fetch(`/api/nutrition/meals?${params.toString()}`)');
    expect(noteSlashTextarea).not.toContain("plannedTotals");
  });

  it("writes saved target rows into the shared query cache before background revalidation", () => {
    expect(panel).toContain("targetQuery.setTargetInCache(body.target)");
    expect(panel).toContain("targetQuery.invalidate()");
    expect(activeTargetHook).toContain("writeActiveNutritionTargetCache");
    expect(activeTargetHook).toContain("queryClient.setQueryData<ActiveNutritionTargetResponse>");
    expect(activeTargetHook).toContain("queryClient.setQueriesData<ActiveNutritionTargetResponse>");
    expect(activeTargetHook).toContain("queryClient.invalidateQueries({ queryKey: ACTIVE_NUTRITION_TARGET_QUERY_ROOT })");
  });
});
