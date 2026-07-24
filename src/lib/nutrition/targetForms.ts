import {
  ACTIVITY_LEVELS,
  inchesToCentimeters,
  poundsToKilograms,
  type ActivityLevel,
  type FormulaInput,
  type GoalType,
  type MacroMode,
  type NutritionTargetInput,
  type PreferredUnits,
  type PregnancyStatus,
} from "@/lib/nutrition/targets";

const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 1 / 2.54;

export type TargetSetupMode = "new_goal" | "edit_profile" | "update_goal";

export type TargetSetupForm = {
  age: string;
  formulaInput: FormulaInput;
  units: PreferredUnits;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  heightCmCanonical: string;
  weight: string;
  weightKgCanonical: string;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  rate: string;
  goalWeight: string;
  goalWeightKgCanonical: string;
  manualMaintenance: string;
  bodyFatPct: string;
  pregnancyStatus: PregnancyStatus;
  adjustmentsEnabled: boolean;
  macroMode: MacroMode;
  proteinGPerKg: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  proteinPct: string;
  carbPct: string;
  fatPct: string;
  lowCalorieConfirmed: boolean;
};

export type NutritionProfileRow = Record<string, unknown> | null | undefined;
export type NutritionGoalRow = Record<string, unknown> | null | undefined;
export type DailyNutritionTargetRow = Record<string, unknown> | null | undefined;

export type PrefillSource = {
  profile?: NutritionProfileRow;
  activeGoal?: NutritionGoalRow;
  dailyTarget?: DailyNutritionTargetRow;
};

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const stringOrEmpty = (value: unknown) => {
  const parsed = numberOrNull(value);
  return parsed === null ? "" : trimNumber(parsed, 2);
};

const isFormulaInput = (value: unknown): value is FormulaInput =>
  value === "male" || value === "female" || value === "manual";

export const isPreferredUnits = (value: unknown): value is PreferredUnits => value === "metric" || value === "us";

const isGoalType = (value: unknown): value is GoalType =>
  value === "lose" || value === "maintain" || value === "gain" || value === "recomposition";

const isMacroMode = (value: unknown): value is MacroMode =>
  value === "suggested_grams" || value === "custom_grams" || value === "custom_percentages";

const isPregnancyStatus = (value: unknown): value is PregnancyStatus =>
  value === "none" || value === "pregnant" || value === "breastfeeding";

const isActivityLevel = (value: unknown): value is ActivityLevel =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_LEVELS, value);

export function trimNumber(value: number, decimals = 1) {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(decimals)).toString();
}

export function kilogramsToPounds(kg: number) {
  return kg * KG_TO_LB;
}

export function centimetersToInches(cm: number) {
  return cm * CM_TO_IN;
}

export function createInitialTargetForm(overrides: Partial<TargetSetupForm> = {}): TargetSetupForm {
  const heightCm = "175";
  const weightKg = "75";
  const form: TargetSetupForm = {
    age: "30",
    formulaInput: "male",
    units: "metric",
    heightCm,
    heightFeet: "5",
    heightInches: "9",
    heightCmCanonical: heightCm,
    weight: weightKg,
    weightKgCanonical: weightKg,
    activityLevel: "moderate",
    goalType: "maintain",
    rate: "0",
    goalWeight: "",
    goalWeightKgCanonical: "",
    manualMaintenance: "",
    bodyFatPct: "",
    pregnancyStatus: "none",
    adjustmentsEnabled: true,
    macroMode: "suggested_grams",
    proteinGPerKg: "",
    calories: "2200",
    protein: "160",
    carbs: "230",
    fat: "72",
    proteinPct: "30",
    carbPct: "40",
    fatPct: "30",
    lowCalorieConfirmed: false,
  };
  return normalizeDisplayForUnits({ ...form, ...overrides });
}

function localeRegion(locale: string) {
  const trimmed = locale.trim();
  if (!trimmed) return null;
  try {
    const parsed = new Intl.Locale(trimmed);
    if (parsed.region) return parsed.region.toUpperCase();
  } catch {
    // Fall back to lightweight parsing for older runtimes or malformed tags.
  }
  const parts = trimmed.replace("_", "-").split("-");
  const region = parts.find((part) => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));
  return region ? region.toUpperCase() : null;
}

export function inferPreferredUnitsFromLocales(locales: readonly string[] | string | null | undefined): PreferredUnits {
  const candidates = typeof locales === "string" ? [locales] : locales ?? [];
  return candidates.some((locale) => localeRegion(locale) === "US") ? "us" : "metric";
}

export function resolveInitialTargetUnits(input: {
  profile?: NutritionProfileRow;
  unsavedForm?: TargetSetupForm | null;
  localeUnits?: PreferredUnits;
}): PreferredUnits {
  const savedUnits = input.profile && typeof input.profile === "object" ? input.profile.preferred_units : null;
  if (isPreferredUnits(savedUnits)) return savedUnits;
  if (input.unsavedForm && isPreferredUnits(input.unsavedForm.units)) return input.unsavedForm.units;
  return input.localeUnits ?? "metric";
}

export function normalizeDisplayForUnits(form: TargetSetupForm): TargetSetupForm {
  const heightCm = numberOrNull(form.heightCmCanonical);
  const weightKg = numberOrNull(form.weightKgCanonical);
  const goalWeightKg = numberOrNull(form.goalWeightKgCanonical);

  if (form.units === "metric") {
    return {
      ...form,
      heightCm: heightCm === null ? "" : trimNumber(heightCm, 1),
      weight: weightKg === null ? "" : trimNumber(weightKg, 1),
      goalWeight: goalWeightKg === null ? "" : trimNumber(goalWeightKg, 1),
    };
  }

  const totalInches = heightCm === null ? null : centimetersToInches(heightCm);
  const feet = totalInches === null ? "" : Math.floor(totalInches / 12).toString();
  const inches = totalInches === null ? "" : trimNumber(totalInches - Number(feet) * 12, 1);
  return {
    ...form,
    heightFeet: feet,
    heightInches: inches,
    weight: weightKg === null ? "" : trimNumber(kilogramsToPounds(weightKg), 1),
    goalWeight: goalWeightKg === null ? "" : trimNumber(kilogramsToPounds(goalWeightKg), 1),
  };
}

export function setTargetFormUnits(form: TargetSetupForm, units: PreferredUnits): TargetSetupForm {
  return normalizeDisplayForUnits({ ...form, units });
}

export function setHeightMetric(form: TargetSetupForm, value: string): TargetSetupForm {
  return { ...form, heightCm: value, heightCmCanonical: value };
}

export function setHeightUs(form: TargetSetupForm, field: "heightFeet" | "heightInches", value: string): TargetSetupForm {
  const next = { ...form, [field]: value };
  const feet = numberOrNull(next.heightFeet);
  const inches = numberOrNull(next.heightInches);
  return {
    ...next,
    heightCmCanonical: feet === null && inches === null ? "" : trimNumber(inchesToCentimeters((feet ?? 0) * 12 + (inches ?? 0)), 2),
  };
}

export function setWeightDisplay(form: TargetSetupForm, value: string): TargetSetupForm {
  return {
    ...form,
    weight: value,
    weightKgCanonical: value.trim() === "" ? "" : form.units === "metric" ? value : trimNumber(poundsToKilograms(Number(value)), 2),
  };
}

export function setGoalWeightDisplay(form: TargetSetupForm, value: string): TargetSetupForm {
  return {
    ...form,
    goalWeight: value,
    goalWeightKgCanonical: value.trim() === "" ? "" : form.units === "metric" ? value : trimNumber(poundsToKilograms(Number(value)), 2),
  };
}

export function macroPercentTotal(form: Pick<TargetSetupForm, "proteinPct" | "carbPct" | "fatPct">) {
  const protein = numberOrNull(form.proteinPct) ?? 0;
  const carbs = numberOrNull(form.carbPct) ?? 0;
  const fat = numberOrNull(form.fatPct) ?? 0;
  return protein + carbs + fat;
}

export function derivePercentageMacroDetails(form: Pick<TargetSetupForm, "calories" | "proteinPct" | "carbPct" | "fatPct">, calorieTarget?: number | null) {
  const calories = calorieTarget ?? numberOrNull(form.calories);
  const proteinPct = numberOrNull(form.proteinPct);
  const carbPct = numberOrNull(form.carbPct);
  const fatPct = numberOrNull(form.fatPct);
  if (calories === null || proteinPct === null || carbPct === null || fatPct === null) return null;
  return {
    protein: { grams: calories * proteinPct / 100 / 4, calories: calories * proteinPct / 100 },
    carbs: { grams: calories * carbPct / 100 / 4, calories: calories * carbPct / 100 },
    fat: { grams: calories * fatPct / 100 / 9, calories: calories * fatPct / 100 },
  };
}

function calculationInputs(goal?: NutritionGoalRow): Record<string, unknown> {
  const value = goal?.calculation_inputs;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function prefillTargetSetupForm(source: PrefillSource, fallback: TargetSetupForm = createInitialTargetForm()): TargetSetupForm {
  const profile = source.profile ?? {};
  const goal = source.activeGoal ?? {};
  const inputs = calculationInputs(goal);
  const units = isPreferredUnits(profile.preferred_units) ? profile.preferred_units : fallback.units;
  const heightCm = stringOrEmpty(profile.height_cm);
  const weightKg = stringOrEmpty(profile.current_weight_kg);
  const goalWeightKg = stringOrEmpty(goal.goal_weight_kg ?? inputs.goalWeightKg);
  const macroMode = isMacroMode(inputs.macroMode) ? inputs.macroMode : fallback.macroMode;
  const storedGoalType = goal.goal_type ?? inputs.goalType;

  const next: TargetSetupForm = {
    ...fallback,
    age: stringOrEmpty(profile.age_years) || fallback.age,
    formulaInput: isFormulaInput(profile.formula_sex) ? profile.formula_sex : fallback.formulaInput,
    units,
    heightCmCanonical: heightCm || fallback.heightCmCanonical,
    weightKgCanonical: weightKg || fallback.weightKgCanonical,
    activityLevel: isActivityLevel(profile.activity_level) ? profile.activity_level : fallback.activityLevel,
    goalType: isGoalType(storedGoalType) ? storedGoalType : fallback.goalType,
    rate: stringOrEmpty(goal.target_rate_pct_per_week ?? inputs.goalRatePctPerWeek) || fallback.rate,
    goalWeightKgCanonical: goalWeightKg,
    manualMaintenance: stringOrEmpty(inputs.manualMaintenanceKcal),
    bodyFatPct: stringOrEmpty(profile.body_fat_pct),
    pregnancyStatus: isPregnancyStatus(profile.pregnancy_status) ? profile.pregnancy_status : "none",
    adjustmentsEnabled: typeof profile.adjustments_enabled === "boolean" ? profile.adjustments_enabled : fallback.adjustmentsEnabled,
    macroMode,
    proteinGPerKg: stringOrEmpty(inputs.proteinGPerKg),
    calories: stringOrEmpty(inputs.manualCalorieTargetKcal ?? goal.calorie_target_kcal) || fallback.calories,
    protein: stringOrEmpty(inputs.customProteinG ?? goal.protein_target_g) || fallback.protein,
    carbs: stringOrEmpty(inputs.customCarbG ?? goal.carb_target_g) || fallback.carbs,
    fat: stringOrEmpty(inputs.customFatG ?? goal.fat_target_g) || fallback.fat,
    proteinPct: stringOrEmpty(inputs.proteinPct) || fallback.proteinPct,
    carbPct: stringOrEmpty(inputs.carbPct) || fallback.carbPct,
    fatPct: stringOrEmpty(inputs.fatPct) || fallback.fatPct,
  };
  return normalizeDisplayForUnits(next);
}

export function buildProfilePayload(form: TargetSetupForm) {
  return {
    ageYears: Number(form.age),
    formulaInput: form.formulaInput,
    heightCm: Number(form.heightCmCanonical),
    weightKg: Number(form.weightKgCanonical),
    preferredUnits: form.units,
    activityLevel: form.activityLevel,
    bodyFatPct: form.bodyFatPct.trim() === "" ? undefined : Number(form.bodyFatPct),
    pregnancyStatus: form.pregnancyStatus,
    adjustmentsEnabled: form.adjustmentsEnabled,
  };
}

export function buildTargetPayload(form: TargetSetupForm, deviceTimezone?: string | null): NutritionTargetInput & Record<string, unknown> {
  const manualCalories = form.formulaInput === "manual";
  const payload: NutritionTargetInput & Record<string, unknown> = {
    ...buildProfilePayload(form),
    goalType: form.goalType,
    goalRatePctPerWeek: form.goalType === "lose" || form.goalType === "gain" ? Number(form.rate) : 0,
    macroMode: form.macroMode,
    lowCalorieConfirmed: form.lowCalorieConfirmed,
    deviceTimezone: deviceTimezone ?? undefined,
  };
  if (form.goalWeightKgCanonical.trim() !== "" && (form.goalType === "lose" || form.goalType === "gain")) {
    payload.goalWeightKg = Number(form.goalWeightKgCanonical);
  }
  if (form.manualMaintenance.trim() !== "") payload.manualMaintenanceKcal = Number(form.manualMaintenance);
  if (manualCalories) payload.manualCalorieTargetKcal = Number(form.calories);
  if (form.macroMode === "suggested_grams" && form.proteinGPerKg.trim() !== "") payload.proteinGPerKg = Number(form.proteinGPerKg);
  if (form.macroMode === "custom_grams") {
    payload.customProteinG = Number(form.protein);
    payload.customCarbG = Number(form.carbs);
    payload.customFatG = Number(form.fat);
  }
  if (form.macroMode === "custom_percentages") {
    payload.proteinPct = Number(form.proteinPct);
    payload.carbPct = Number(form.carbPct);
    payload.fatPct = Number(form.fatPct);
  }
  return payload;
}
