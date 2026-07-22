export type MealPlanSurface = "grocery" | "nutrition";
export type MealPlanStatus = "planned" | "logged" | "partially_logged" | "skipped";

export type MealPlanNutritionSnapshot = {
  version: 1;
  loggable: boolean;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  items: MealPlanSnapshotItem[];
  grocery_deductions: MealPlanGroceryDeduction[];
};

export type MealPlanSnapshotItem = {
  item_type: "food" | "recipe" | "custom";
  food_id: string | null;
  recipe_id: string | null;
  custom_name: string | null;
  quantity: number;
  serving_unit: string | null;
  serving_grams: number | null;
  snapshot_name: string;
  snapshot_brand_name: string | null;
  snapshot_calories: number;
  snapshot_carbs_g: number;
  snapshot_protein_g: number;
  snapshot_fat_g: number;
  metadata: Record<string, unknown>;
  sort_order: number;
};

export type MealPlanGroceryDeduction = {
  food_resource_id: string;
  amount: number;
  unit: string;
};

export type MealPlanGroceryDepletionResult = {
  index: number;
  food_resource_id: string;
  amount: number;
  unit: string;
  status: "pending" | "completed" | "failed";
  attempt_count: number;
  attempted_at?: string;
  completed_at?: string;
  last_error?: string;
  diagnostics: Array<{ at: string; error: string }>;
};

export type MealPlanLogResult = "logged" | "partially_logged" | "already_logged" | "retry_completed" | "retry_incomplete";
export type MealPlanLogResponse = {
  mealId: string;
  result: MealPlanLogResult;
  alreadyLogged: boolean;
  groceryDepletionPending: boolean;
  message?: string;
};

export type MealPlanItem = {
  id: string;
  meal_plan_day_id: string;
  position: number;
  label: string;
  meal_type: string | null;
  planned_time: string | null;
  status: MealPlanStatus;
  servings: number;
  food_id: string | null;
  meal_template_id: string | null;
  recipe_id: string | null;
  nutrition_snapshot: MealPlanNutritionSnapshot;
  source_surface: MealPlanSurface;
  consumed_meal_id: string | null;
  grocery_depletion_status: "not_applicable" | "pending" | "completed" | "failed";
  grocery_depletion_results: MealPlanGroceryDepletionResult[];
  created_at: string;
  updated_at: string;
};

export type MealPlanDay = {
  id: string;
  creator_day_date: string;
  timezone: string;
  timezone_source: "profile" | "device" | "utc";
  boundary_hour: 4;
  starts_at: string;
  ends_at: string;
  planning_mode: "flexible" | "scheduled";
  notes: string | null;
  items: MealPlanItem[];
};

export type MealPlanResponse = { plan: MealPlanDay | null; error?: string };

const statuses = new Set<MealPlanStatus>(["planned", "logged", "partially_logged", "skipped"]);
export function parseMealPlanStatus(value: unknown): MealPlanStatus | null {
  return typeof value === "string" && statuses.has(value as MealPlanStatus)
    ? (value as MealPlanStatus)
    : null;
}

export function statusLabel(status: MealPlanStatus) {
  return { planned: "Planned", logged: "Logged", partially_logged: "Partially Logged", skipped: "Skipped" }[status];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NUTRIENT = 100000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function number(value: unknown, max = MAX_NUTRIENT) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

export function parseMealPlanNutritionSnapshot(value: unknown): MealPlanNutritionSnapshot | null {
  const source = record(value);
  if (!source || source.version !== 1 || !Array.isArray(source.items) || !Array.isArray(source.grocery_deductions)) return null;
  const totals = ["calories", "carbs_g", "protein_g", "fat_g"].map((key) => number(source[key]));
  const loggable = source.loggable !== false;
  if (totals.some((item) => item === null) || source.items.length > 100 || (loggable && source.items.length === 0)) return null;
  const items: MealPlanSnapshotItem[] = [];
  for (const [index, raw] of source.items.entries()) {
    const item = record(raw);
    if (!item || !["food", "recipe", "custom"].includes(String(item.item_type))) return null;
    const name = typeof item.snapshot_name === "string" ? item.snapshot_name.trim().slice(0, 160) : "";
    const quantity = number(item.quantity, 10000);
    const nutrients = ["snapshot_calories", "snapshot_carbs_g", "snapshot_protein_g", "snapshot_fat_g"].map((key) => number(item[key]));
    if (!name || quantity === null || quantity <= 0 || nutrients.some((entry) => entry === null)) return null;
    const foodId = typeof item.food_id === "string" && UUID_PATTERN.test(item.food_id) ? item.food_id : null;
    const recipeId = typeof item.recipe_id === "string" && UUID_PATTERN.test(item.recipe_id) ? item.recipe_id : null;
    const itemType = item.item_type as MealPlanSnapshotItem["item_type"];
    if ((itemType === "food" && !foodId) || (itemType === "recipe" && !recipeId)) return null;
    const customName = itemType === "custom" && typeof item.custom_name === "string" ? item.custom_name.trim().slice(0, 160) : null;
    if (itemType === "custom" && !customName) return null;
    items.push({
      item_type: itemType, food_id: foodId, recipe_id: recipeId,
      custom_name: customName,
      quantity, serving_unit: typeof item.serving_unit === "string" ? item.serving_unit.trim().slice(0, 40) : null,
      serving_grams: item.serving_grams == null ? null : number(item.serving_grams, 5000),
      snapshot_name: name,
      snapshot_brand_name: typeof item.snapshot_brand_name === "string" ? item.snapshot_brand_name.trim().slice(0, 160) : null,
      snapshot_calories: nutrients[0]!, snapshot_carbs_g: nutrients[1]!, snapshot_protein_g: nutrients[2]!, snapshot_fat_g: nutrients[3]!,
      metadata: record(item.metadata) ?? {}, sort_order: index,
    });
  }
  const deductions: MealPlanGroceryDeduction[] = [];
  for (const raw of source.grocery_deductions) {
    const deduction = record(raw);
    const id = typeof deduction?.food_resource_id === "string" ? deduction.food_resource_id : "";
    const amount = number(deduction?.amount, 10000);
    const unit = typeof deduction?.unit === "string" ? deduction.unit.trim().slice(0, 24) : "";
    if (!UUID_PATTERN.test(id) || amount === null || amount <= 0 || !unit) return null;
    deductions.push({ food_resource_id: id, amount, unit });
  }
  if (!loggable && (items.length !== 0 || deductions.length !== 0)) return null;
  return { version: 1, loggable, calories: totals[0]!, carbs_g: totals[1]!, protein_g: totals[2]!, fat_g: totals[3]!, items, grocery_deductions: deductions };
}
