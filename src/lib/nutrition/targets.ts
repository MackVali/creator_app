import { z } from "zod";

export const NUTRITION_TARGET_ALGORITHM_VERSION = "nutrition-target-v1" as const;
export const NUTRITION_TARGET_FORMULA = "Mifflin–St Jeor" as const;
export const MACRO_CALORIE_TOLERANCE = 25;

export const ACTIVITY_LEVELS = {
  sedentary: { label: "Sedentary", coefficient: 1.4, description: "Mostly seated, with little intentional exercise and low daily walking." },
  light: { label: "Light", coefficient: 1.5, description: "Regular walking or light exercise one to three days per week." },
  moderate: { label: "Moderate", coefficient: 1.6, description: "Intentional training three to five days per week or moderately active work." },
  active: { label: "Active", coefficient: 1.75, description: "Hard training most days, physical work, or high daily movement." },
  very_active: { label: "Very active", coefficient: 1.9, description: "High-volume training, demanding physical work, or multiple active sessions." },
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;
export type FormulaInput = "male" | "female" | "manual";
export type GoalType = "lose" | "maintain" | "gain" | "recomposition";
export type PreferredUnits = "metric" | "us";
export type MacroMode = "suggested_grams" | "custom_grams" | "custom_percentages";
export type PregnancyStatus = "none" | "pregnant" | "breastfeeding";

const finiteNumber = z.number().finite();
export const nutritionTargetInputSchema = z.object({
  ageYears: z.number().int().min(13).max(120),
  formulaInput: z.enum(["male", "female", "manual"]),
  heightCm: finiteNumber.min(100).max(260),
  weightKg: finiteNumber.min(25).max(500),
  preferredUnits: z.enum(["metric", "us"]),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goalType: z.enum(["lose", "maintain", "gain", "recomposition"]),
  goalRatePctPerWeek: finiteNumber.min(0).max(1).optional(),
  goalWeightKg: finiteNumber.min(25).max(500).optional(),
  manualMaintenanceKcal: finiteNumber.min(800).max(10000).optional(),
  manualCalorieTargetKcal: finiteNumber.min(800).max(10000).optional(),
  macroMode: z.enum(["suggested_grams", "custom_grams", "custom_percentages"]),
  proteinGPerKg: finiteNumber.min(0.5).max(3).optional(),
  customProteinG: finiteNumber.positive().max(1000).optional(),
  customCarbG: finiteNumber.positive().max(2000).optional(),
  customFatG: finiteNumber.positive().max(500).optional(),
  proteinPct: finiteNumber.positive().max(100).optional(),
  carbPct: finiteNumber.positive().max(100).optional(),
  fatPct: finiteNumber.positive().max(100).optional(),
  pregnancyStatus: z.enum(["none", "pregnant", "breastfeeding"]).default("none"),
  lowCalorieConfirmed: z.boolean().default(false),
  timestamp: z.string().datetime().optional(),
}).strict();

export type NutritionTargetInput = z.input<typeof nutritionTargetInputSchema>;
export type ValidNutritionTargetInput = z.output<typeof nutritionTargetInputSchema>;

export type NutritionTargetResult = {
  algorithmVersion: typeof NUTRITION_TARGET_ALGORITHM_VERSION;
  formulaName: typeof NUTRITION_TARGET_FORMULA | "Manual";
  formulaVersion: "mifflin-st-jeor-v1" | "manual-v1";
  ageYears: number;
  formulaInput: FormulaInput;
  heightCm: number;
  weightKg: number;
  preferredUnits: PreferredUnits;
  activityLevel: ActivityLevel;
  activityLabel: string;
  activityCoefficient: number;
  rawRestingEstimateKcal: number | null;
  restingEstimateDisplayKcal: number | null;
  rawEstimatedMaintenanceKcal: number;
  estimatedMaintenanceKcal: number;
  goalType: GoalType;
  goalRatePctPerWeek: number;
  goalWeightKg: number | null;
  provisionalCalorieDeltaKcal: number;
  acceptedCalorieDeltaKcal: number;
  calorieTargetKcal: number;
  macroMode: MacroMode;
  proteinStrategy: string;
  proteinTargetG: number;
  carbStrategy: string;
  carbTargetG: number;
  fatStrategy: string;
  fatTargetG: number;
  macroCaloriesKcal: number;
  bmi: number;
  bmiCategory: string | null;
  warnings: string[];
  isManual: boolean;
  timestamp: string;
  explanation: string[];
  calculationInputs: Record<string, unknown>;
};

export class NutritionTargetError extends Error {
  constructor(message: string, readonly issues: string[] = [message]) {
    super(message);
    this.name = "NutritionTargetError";
  }
}

export const roundToNearestTen = (value: number) => Math.round(value / 10) * 10;
export const calculateBmi = (weightKg: number, heightCm: number) => weightKg / ((heightCm / 100) ** 2);
export function adultBmiCategory(bmi: number, ageYears: number) {
  if (ageYears < 20) return null;
  if (bmi < 18.5) return "Underweight range";
  if (bmi < 25) return "Healthy weight range";
  if (bmi < 30) return "Overweight range";
  return "Obesity range";
}
export function mifflinStJeor(weightKg: number, heightCm: number, ageYears: number, formulaInput: Exclude<FormulaInput, "manual">) {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (formulaInput === "male" ? 5 : -161);
}

function defaultRate(goalType: GoalType) {
  return goalType === "lose" ? 0.5 : goalType === "gain" ? 0.25 : 0;
}

function validateRate(goalType: GoalType, rate: number) {
  const max = goalType === "lose" ? 1 : goalType === "gain" ? 0.5 : 0;
  if ((goalType === "maintain" || goalType === "recomposition") && rate !== 0) throw new NutritionTargetError("Maintain and Recomposition use a zero initial goal rate.");
  if ((goalType === "lose" || goalType === "gain") && (rate <= 0 || rate > max)) throw new NutritionTargetError(`${goalType === "lose" ? "Loss" : "Gain"} rate must be above 0% and no more than ${max.toFixed(2)}% per week.`);
}

function macroCalories(protein: number, carbs: number, fat: number) {
  return protein * 4 + carbs * 4 + fat * 9;
}

function macroTargets(input: ValidNutritionTargetInput, calorieTarget: number) {
  let protein: number;
  let carbs: number;
  let fat: number;
  let proteinStrategy: string;
  let carbStrategy: string;
  let fatStrategy: string;
  if (input.macroMode === "custom_grams") {
    if (!input.customProteinG || !input.customCarbG || !input.customFatG) throw new NutritionTargetError("Enter positive protein, carbohydrate, and fat gram targets.");
    protein = input.customProteinG; carbs = input.customCarbG; fat = input.customFatG;
    proteinStrategy = carbStrategy = fatStrategy = "custom_grams";
  } else if (input.macroMode === "custom_percentages") {
    if (!input.proteinPct || !input.carbPct || !input.fatPct || Math.abs(input.proteinPct + input.carbPct + input.fatPct - 100) > 0.01) throw new NutritionTargetError("Custom macro percentages must be positive and add up to 100%.");
    protein = calorieTarget * input.proteinPct / 100 / 4;
    carbs = calorieTarget * input.carbPct / 100 / 4;
    fat = calorieTarget * input.fatPct / 100 / 9;
    proteinStrategy = `${input.proteinPct}%`; carbStrategy = `${input.carbPct}%`; fatStrategy = `${input.fatPct}%`;
  } else {
    const defaults = input.goalType === "lose"
      ? { protein: 1.8, proteinMax: 2.2, fat: 0.7 }
      : input.goalType === "recomposition"
        ? { protein: 1.8, proteinMax: 1.8, fat: 0.8 }
        : input.goalType === "gain"
          ? { protein: 1.6, proteinMax: 1.8, fat: 0.8 }
          : { protein: 1.6, proteinMax: 1.6, fat: 0.8 };
    const proteinRate = input.proteinGPerKg ?? defaults.protein;
    if (proteinRate > defaults.proteinMax) throw new NutritionTargetError(`Protein may be set up to ${defaults.proteinMax.toFixed(1)} g/kg for this goal.`);
    protein = Math.round(input.weightKg * proteinRate);
    fat = Math.ceil(Math.max(input.weightKg * defaults.fat, calorieTarget * 0.2 / 9));
    const remaining = calorieTarget - protein * 4 - fat * 9;
    if (remaining <= 0) throw new NutritionTargetError("Protein and fat targets exceed the available calories. Increase calories or reduce one or more macro targets.");
    carbs = Math.round(remaining / 4);
    proteinStrategy = `${proteinRate.toFixed(1)} g/kg`; fatStrategy = `greater of ${defaults.fat.toFixed(1)} g/kg or 20%`; carbStrategy = "remaining_calories";
  }
  protein = Math.round(protein); carbs = Math.round(carbs); fat = Math.round(fat);
  if (protein <= 0 || carbs <= 0 || fat <= 0) throw new NutritionTargetError("Macro targets must all be greater than zero.");
  const calories = macroCalories(protein, carbs, fat);
  const tolerance = Math.max(MACRO_CALORIE_TOLERANCE, calorieTarget * 0.01);
  if (Math.abs(calories - calorieTarget) > tolerance) throw new NutritionTargetError("Your macro targets do not match your daily calorie target. Adjust calories or one or more macro targets.");
  return { protein, carbs, fat, calories, proteinStrategy, carbStrategy, fatStrategy };
}

export function calculateNutritionTarget(rawInput: NutritionTargetInput): NutritionTargetResult {
  const parsed = nutritionTargetInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new NutritionTargetError("Review the target details and try again.", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  const input = parsed.data;
  const isManual = input.formulaInput === "manual" || input.manualCalorieTargetKcal !== undefined;
  if (!isManual && input.ageYears < 18) throw new NutritionTargetError("Automatic recommendations are unavailable for users under 18. Enter a manual target instead.");
  if (!isManual && input.goalType === "lose" && input.pregnancyStatus !== "none") throw new NutritionTargetError("Automatic deficit recommendations are unavailable during pregnancy or breastfeeding. Enter a manual target instead.");
  if (input.formulaInput === "manual" && input.manualCalorieTargetKcal === undefined) throw new NutritionTargetError("Manual calories are required when Use manual calories is selected.");
  const rate = input.goalRatePctPerWeek ?? defaultRate(input.goalType);
  validateRate(input.goalType, rate);
  const activity = ACTIVITY_LEVELS[input.activityLevel];
  const rawResting = input.formulaInput === "manual" ? null : mifflinStJeor(input.weightKg, input.heightCm, input.ageYears, input.formulaInput);
  const rawMaintenance = input.manualMaintenanceKcal ?? (rawResting === null ? input.manualCalorieTargetKcal! : rawResting * activity.coefficient);
  let provisionalDelta = 0;
  let acceptedDelta = 0;
  if (!isManual && (input.goalType === "lose" || input.goalType === "gain")) {
    provisionalDelta = input.weightKg * (rate / 100) * 7700 / 7;
    acceptedDelta = input.goalType === "lose"
      ? Math.min(provisionalDelta, rawMaintenance * 0.2, 750)
      : Math.min(provisionalDelta, rawMaintenance * 0.15, 500);
  }
  const signedDelta = input.goalType === "lose" ? -acceptedDelta : input.goalType === "gain" ? acceptedDelta : 0;
  const calorieTarget = roundToNearestTen(input.manualCalorieTargetKcal ?? rawMaintenance + signedDelta);
  if (!isManual && calorieTarget <= 800) throw new NutritionTargetError("CREATOR will not provide an automatic recommendation of 800 calories or lower.");
  if (!isManual && calorieTarget < 1200) throw new NutritionTargetError("This automatic recommendation is below CREATOR's 1,200 calorie guardrail. Use a manual target instead.");
  const warnings: string[] = [];
  if (calorieTarget < 1500) {
    warnings.push("This target is below 1,500 calories. Review the estimate carefully before saving.");
    if (!isManual && !input.lowCalorieConfirmed) throw new NutritionTargetError("Confirm the additional warning before using an automatic target below 1,500 calories.");
  }
  const macros = macroTargets(input, calorieTarget);
  const bmi = calculateBmi(input.weightKg, input.heightCm);
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    algorithmVersion: NUTRITION_TARGET_ALGORITHM_VERSION,
    formulaName: input.formulaInput === "manual" ? "Manual" : NUTRITION_TARGET_FORMULA,
    formulaVersion: input.formulaInput === "manual" ? "manual-v1" : "mifflin-st-jeor-v1",
    ageYears: input.ageYears, formulaInput: input.formulaInput, heightCm: input.heightCm, weightKg: input.weightKg,
    preferredUnits: input.preferredUnits, activityLevel: input.activityLevel, activityLabel: activity.label, activityCoefficient: activity.coefficient,
    rawRestingEstimateKcal: rawResting, restingEstimateDisplayKcal: rawResting === null ? null : Math.round(rawResting),
    rawEstimatedMaintenanceKcal: rawMaintenance, estimatedMaintenanceKcal: roundToNearestTen(rawMaintenance),
    goalType: input.goalType, goalRatePctPerWeek: rate, goalWeightKg: input.goalWeightKg ?? null,
    provisionalCalorieDeltaKcal: provisionalDelta, acceptedCalorieDeltaKcal: acceptedDelta, calorieTargetKcal: calorieTarget,
    macroMode: input.macroMode, proteinStrategy: macros.proteinStrategy, proteinTargetG: macros.protein,
    carbStrategy: macros.carbStrategy, carbTargetG: macros.carbs, fatStrategy: macros.fatStrategy, fatTargetG: macros.fat,
    macroCaloriesKcal: macros.calories, bmi, bmiCategory: adultBmiCategory(bmi, input.ageYears), warnings, isManual, timestamp,
    explanation: [
      rawResting === null ? "Calories were entered manually; no resting equation was applied." : `The ${NUTRITION_TARGET_FORMULA} resting estimate uses the supplied age, height, weight, and equation input.`,
      input.manualMaintenanceKcal ? "Estimated maintenance was entered manually." : `Estimated maintenance applies the ${activity.label} activity coefficient of ${activity.coefficient.toFixed(2)}.`,
      isManual ? "This is a Manual target." : `${input.goalType === "lose" ? "A capped deficit" : input.goalType === "gain" ? "A capped surplus" : "No initial calorie adjustment"} produced the suggested starting target.`,
      "Protein and fat are assigned first, then remaining calories are assigned to carbohydrate.",
    ],
    calculationInputs: {
      ageYears: input.ageYears,
      formulaInput: input.formulaInput,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      preferredUnits: input.preferredUnits,
      activityLevel: input.activityLevel,
      activityCoefficient: activity.coefficient,
      goalType: input.goalType,
      goalRatePctPerWeek: rate,
      goalWeightKg: input.goalWeightKg ?? null,
      maintenanceSource: input.manualMaintenanceKcal === undefined ? "activity_calculation" : "manual_estimate",
      manualMaintenanceKcal: input.manualMaintenanceKcal ?? null,
      manualCalorieTargetKcal: input.manualCalorieTargetKcal ?? null,
      macroMode: input.macroMode,
      proteinGPerKg: input.proteinGPerKg ?? null,
      customProteinG: input.customProteinG ?? null,
      customCarbG: input.customCarbG ?? null,
      customFatG: input.customFatG ?? null,
      proteinPct: input.proteinPct ?? null,
      carbPct: input.carbPct ?? null,
      fatPct: input.fatPct ?? null,
      pregnancyStatus: input.pregnancyStatus,
    },
  };
}

export const poundsToKilograms = (pounds: number) => pounds * 0.45359237;
export const inchesToCentimeters = (inches: number) => inches * 2.54;
