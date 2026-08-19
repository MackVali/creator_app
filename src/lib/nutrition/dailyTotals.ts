import { resolveCreatorDay } from "@/lib/creatorDay";

export type NutritionDailyMetricKey = "calories" | "carbs" | "protein" | "fat";

export type NutritionDailyTotals = Record<NutritionDailyMetricKey, number>;

export type NutritionMealTotalsSource = {
  total_calories?: number | string | null;
  total_carbs_g?: number | string | null;
  total_protein_g?: number | string | null;
  total_fat_g?: number | string | null;
};

export type NutritionCreatorDayWindow = {
  creatorDayDate: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
};

export const DEFAULT_DAILY_NUTRITION_GOALS = {
  calories: 2000,
  carbs: 250,
  protein: 150,
  fat: 70,
} as const satisfies NutritionDailyTotals;

export const EMPTY_NUTRITION_TOTALS = {
  calories: 0,
  carbs: 0,
  protein: 0,
  fat: 0,
} as const satisfies NutritionDailyTotals;

export const NUTRITION_DAILY_MACRO_KEYS = ["carbs", "protein", "fat"] as const;

export function parseNutritionProgressNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

export function aggregateNutritionMealTotals(
  meals: NutritionMealTotalsSource[],
): NutritionDailyTotals {
  return meals.reduce<NutritionDailyTotals>(
    (totals, meal) => {
      totals.calories += parseNutritionProgressNumber(meal.total_calories);
      totals.carbs += parseNutritionProgressNumber(meal.total_carbs_g);
      totals.protein += parseNutritionProgressNumber(meal.total_protein_g);
      totals.fat += parseNutritionProgressNumber(meal.total_fat_g);
      return totals;
    },
    { ...EMPTY_NUTRITION_TOTALS },
  );
}

export function getNutritionCreatorDayWindow({
  referenceDate = new Date(),
  profileTimezone,
  deviceTimezone,
}: {
  referenceDate?: Date;
  profileTimezone?: string | null;
  deviceTimezone?: string | null;
} = {}): NutritionCreatorDayWindow {
  const creatorDay = resolveCreatorDay({
    instant: referenceDate,
    profileTimezone,
    deviceTimezone,
  });

  return {
    creatorDayDate: creatorDay.creatorDayDate,
    timezone: creatorDay.timezone,
    startsAt: new Date(creatorDay.startsAt),
    endsAt: new Date(creatorDay.endsAt),
  };
}

