import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVELS,
  NUTRITION_TARGET_ALGORITHM_VERSION,
  NutritionTargetError,
  adultBmiCategory,
  calculateBmi,
  calculateNutritionTarget,
  mifflinStJeor,
} from "@/lib/nutrition/targets";

const base = {
  ageYears: 30,
  formulaInput: "male" as const,
  heightCm: 180,
  weightKg: 80,
  preferredUnits: "metric" as const,
  activityLevel: "moderate" as const,
  goalType: "maintain" as const,
  macroMode: "suggested_grams" as const,
  pregnancyStatus: "none" as const,
  timestamp: "2026-07-22T12:00:00.000Z",
};

describe("nutrition target v1", () => {
  it("calculates BMI and gates adult categories", () => {
    expect(calculateBmi(80, 180)).toBeCloseTo(24.691, 3);
    expect(adultBmiCategory(24.69, 20)).toBe("Healthy weight range");
    expect(adultBmiCategory(24.69, 19)).toBeNull();
  });

  it("calculates both Mifflin equations exactly", () => {
    expect(mifflinStJeor(80, 180, 30, "male")).toBe(1780);
    expect(mifflinStJeor(80, 180, 30, "female")).toBe(1614);
  });

  it("stores every behavior-based activity coefficient", () => {
    expect(Object.values(ACTIVITY_LEVELS).map((value) => value.coefficient)).toEqual([1.4, 1.5, 1.6, 1.75, 1.9]);
  });

  it("calculates and rounds maintenance", () => {
    const result = calculateNutritionTarget(base);
    expect(result.rawEstimatedMaintenanceKcal).toBe(2848);
    expect(result.estimatedMaintenanceKcal).toBe(2850);
    expect(result.calorieTargetKcal).toBe(2850);
  });

  it("calculates loss rate and applies the 20% deficit cap", () => {
    const result = calculateNutritionTarget({ ...base, goalType: "lose", goalRatePctPerWeek: 1 });
    expect(result.provisionalCalorieDeltaKcal).toBeCloseTo(880, 8);
    expect(result.acceptedCalorieDeltaKcal).toBeCloseTo(569.6, 8);
    expect(result.calorieTargetKcal).toBe(2280);
  });

  it("calculates gain rate and applies the 15% surplus cap", () => {
    const result = calculateNutritionTarget({ ...base, goalType: "gain", goalRatePctPerWeek: 0.5 });
    expect(result.provisionalCalorieDeltaKcal).toBeCloseTo(440, 8);
    expect(result.acceptedCalorieDeltaKcal).toBeCloseTo(427.2, 8);
    expect(result.calorieTargetKcal).toBe(3280);
  });

  it.each([
    ["maintain", 128, 64],
    ["lose", 144, 56],
    ["gain", 128, 69],
    ["recomposition", 144, 64],
  ] as const)("uses the %s default macro strategy", (goalType, protein, fat) => {
    const result = calculateNutritionTarget({ ...base, goalType });
    expect(result.proteinTargetG).toBe(protein);
    expect(result.fatTargetG).toBe(fat);
    expect(result.carbTargetG).toBeGreaterThan(0);
  });

  it("supports consistent custom grams", () => {
    const result = calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 2000, macroMode: "custom_grams", customProteinG: 150, customCarbG: 200, customFatG: 67 });
    expect(result.isManual).toBe(true);
    expect(result.macroCaloriesKcal).toBe(2003);
  });

  it("supports custom percentages with label-rounding tolerance", () => {
    const result = calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 2010, macroMode: "custom_percentages", proteinPct: 30, carbPct: 40, fatPct: 30 });
    expect(result.proteinTargetG).toBe(151);
    expect(result.carbTargetG).toBe(201);
    expect(result.fatTargetG).toBe(67);
    expect(result.calculationInputs).toMatchObject({ macroMode: "custom_percentages", proteinPct: 30, carbPct: 40, fatPct: 30 });
  });

  it("uses manual maintenance as the goal-delta basis while preserving the resting estimate", () => {
    const result = calculateNutritionTarget({ ...base, goalType: "lose", goalRatePctPerWeek: 0.5, manualMaintenanceKcal: 2400 });
    expect(result.rawRestingEstimateKcal).toBe(1780);
    expect(result.rawEstimatedMaintenanceKcal).toBe(2400);
    expect(result.estimatedMaintenanceKcal).toBe(2400);
    expect(result.calorieTargetKcal).toBe(1960);
    expect(result.calculationInputs).toMatchObject({ maintenanceSource: "manual_estimate", manualMaintenanceKcal: 2400 });
  });

  it("stores optional goal weight and custom gram inputs in calculation inputs", () => {
    const result = calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 2750, goalType: "gain", goalRatePctPerWeek: 0.25, goalWeightKg: 85, macroMode: "custom_grams", customProteinG: 160, customCarbG: 320, customFatG: 92 });
    expect(result.goalWeightKg).toBe(85);
    expect(result.calculationInputs).toMatchObject({
      goalWeightKg: 85,
      macroMode: "custom_grams",
      customProteinG: 160,
      customCarbG: 320,
      customFatG: 92,
    });
  });

  it("rejects negative carbohydrate remainder and mismatched custom macros", () => {
    expect(() => calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 1200, weightKg: 300 })).toThrow(NutritionTargetError);
    expect(() => calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 2000, macroMode: "custom_grams", customProteinG: 50, customCarbG: 50, customFatG: 20 })).toThrow(/do not match/);
  });

  it("requires manual targets for unsupported automatic paths", () => {
    expect(() => calculateNutritionTarget({ ...base, ageYears: 17 })).toThrow(/under 18/);
    expect(() => calculateNutritionTarget({ ...base, formulaInput: "female", goalType: "lose", pregnancyStatus: "pregnant" })).toThrow(/pregnancy/);
    expect(calculateNutritionTarget({ ...base, ageYears: 17, formulaInput: "manual", manualCalorieTargetKcal: 2000 }).isManual).toBe(true);
  });

  it("enforces low-calorie confirmation and automatic floors", () => {
    const lowBase = { ...base, formulaInput: "female" as const, heightCm: 150, weightKg: 45, activityLevel: "sedentary" as const, goalType: "lose" as const, goalRatePctPerWeek: 1 };
    expect(() => calculateNutritionTarget(lowBase)).toThrow(/below 1,500|1,200/);
    const manual = calculateNutritionTarget({ ...base, formulaInput: "manual", manualCalorieTargetKcal: 1000, macroMode: "custom_grams", customProteinG: 100, customCarbG: 100, customFatG: 22 });
    expect(manual.warnings).toHaveLength(1);
  });

  it("is deterministic when timestamp is supplied", () => {
    expect(calculateNutritionTarget(base)).toEqual(calculateNutritionTarget(base));
    expect(calculateNutritionTarget(base).algorithmVersion).toBe(NUTRITION_TARGET_ALGORITHM_VERSION);
  });
});
