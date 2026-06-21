import type { Database, Json } from "@/types/supabase";

export type NutritionSnapshot = {
  name?: unknown;
  displayName?: unknown;
  brandName?: unknown;
  brand_name?: unknown;
  calories?: unknown;
  carbs?: unknown;
  carbs_g?: unknown;
  protein?: unknown;
  protein_g?: unknown;
  fat?: unknown;
  fat_g?: unknown;
};

export type NutritionMealDraft = {
  occurredAt: string;
  timezone?: string;
  name?: string;
  note?: string;
  sourceNoteId?: string;
  sourceNoteEntryId?: string;
  habitId?: string;
  metadata?: Json;
  items: Array<
    | {
        type: "food";
        foodId: string;
        quantity?: number;
        servingUnit?: string;
        servingGrams?: number;
        snapshot: NutritionSnapshot;
        metadata?: Json;
      }
    | {
        type: "recipe";
        recipeId: string;
        quantity?: number;
        servingUnit?: string;
        servingGrams?: number;
        snapshot: NutritionSnapshot;
        metadata?: Json;
      }
    | {
        type: "custom";
        name: string;
        quantity?: number;
        servingUnit?: string;
        servingGrams?: number;
        snapshot: NutritionSnapshot;
        metadata?: Json;
      }
  >;
};

export type NutritionMealTotals = {
  total_calories: number;
  total_carbs_g: number;
  total_protein_g: number;
  total_fat_g: number;
};

export type NutritionMealRpcItem = {
  item_type: "food" | "recipe" | "custom";
  food_id?: string;
  recipe_id?: string;
  custom_name?: string;
  quantity: number;
  serving_unit?: string;
  serving_grams?: number;
  snapshot_name: string;
  snapshot_brand_name?: string;
  snapshot_calories: number;
  snapshot_carbs_g: number;
  snapshot_protein_g: number;
  snapshot_fat_g: number;
  metadata: Json;
  sort_order: number;
};

export type NutritionMealRpcPayload = {
  meal: {
    occurred_at: string;
    timezone: string;
    name?: string;
    note?: string;
    source_note_id?: string;
    source_note_entry_id?: string;
    habit_id?: string;
    metadata: Json;
  };
  items: NutritionMealRpcItem[];
  totals: NutritionMealTotals;
  foodIds: string[];
  recipeIds: string[];
};

export type NutritionMealRow = Database["public"]["Tables"]["meals"]["Row"];
export type NutritionMealItemRow = Database["public"]["Tables"]["meal_items"]["Row"];

const MAX_ITEMS = 100;
const MAX_TEXT_LENGTH = 5000;
const MAX_NAME_LENGTH = 160;
const MAX_SERVING_UNIT_LENGTH = 40;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalTrimmedString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function requiredTrimmedString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = optionalTrimmedString(value, maxLength);
  if (!trimmed) return { ok: false, error: `${field} is required` };
  return { ok: true, value: trimmed };
}

function optionalUuid(
  value: unknown,
  field: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  const trimmed = optionalTrimmedString(value, 64);
  if (!trimmed) return { ok: true };
  if (!UUID_PATTERN.test(trimmed)) {
    return { ok: false, error: `${field} must be a valid UUID` };
  }
  return { ok: true, value: trimmed };
}

function requiredUuid(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = optionalUuid(value, field);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: false, error: `${field} is required` };
  return { ok: true, value: parsed.value };
}

function optionalPositiveNumber(
  value: unknown,
  field: string,
  max: number,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    return { ok: false, error: `${field} must be a positive number` };
  }
  return { ok: true, value: parsed };
}

function requiredNutritionNumber(
  value: unknown,
  field: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    return { ok: false, error: `${field} must be a non-negative number` };
  }
  return { ok: true, value: parsed };
}

function jsonObject(value: unknown): Json {
  return isRecord(value) ? (value as Json) : {};
}

function snapshotNumber(
  snapshot: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string,
  field: string,
) {
  return requiredNutritionNumber(
    snapshot[primaryKey] ?? snapshot[fallbackKey],
    field,
  );
}

function addUnique(target: Set<string>, value: string | undefined) {
  if (value) target.add(value);
}

export function parseNutritionMealDraft(
  payload: unknown,
):
  | { ok: true; value: NutritionMealRpcPayload }
  | { ok: false; error: string } {
  if (!isRecord(payload)) {
    return { ok: false, error: "Meal payload must be an object" };
  }

  const occurredAt = requiredTrimmedString(payload.occurredAt, "occurredAt", 80);
  if (!occurredAt.ok) return occurredAt;
  const occurredAtDate = new Date(occurredAt.value);
  if (Number.isNaN(occurredAtDate.getTime())) {
    return { ok: false, error: "occurredAt must be a valid date" };
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, error: "Meal must include at least one item" };
  }

  if (payload.items.length > MAX_ITEMS) {
    return { ok: false, error: `Meal cannot include more than ${MAX_ITEMS} items` };
  }

  const sourceNoteId = optionalUuid(payload.sourceNoteId, "sourceNoteId");
  if (!sourceNoteId.ok) return sourceNoteId;
  const habitId = optionalUuid(payload.habitId, "habitId");
  if (!habitId.ok) return habitId;

  const timezone =
    optionalTrimmedString(payload.timezone, 64) ?? "UTC";
  const meal = {
    occurred_at: occurredAtDate.toISOString(),
    timezone,
    name: optionalTrimmedString(payload.name, MAX_NAME_LENGTH),
    note: optionalTrimmedString(payload.note, MAX_TEXT_LENGTH),
    source_note_id: sourceNoteId.value,
    source_note_entry_id: optionalTrimmedString(
      payload.sourceNoteEntryId,
      MAX_NAME_LENGTH,
    ),
    habit_id: habitId.value,
    metadata: jsonObject(payload.metadata),
  };

  const totals: NutritionMealTotals = {
    total_calories: 0,
    total_carbs_g: 0,
    total_protein_g: 0,
    total_fat_g: 0,
  };
  const foodIds = new Set<string>();
  const recipeIds = new Set<string>();
  const items: NutritionMealRpcItem[] = [];

  for (const [index, rawItem] of payload.items.entries()) {
    if (!isRecord(rawItem)) {
      return { ok: false, error: `items[${index}] must be an object` };
    }

    const itemType = rawItem.type;
    if (itemType !== "food" && itemType !== "recipe" && itemType !== "custom") {
      return { ok: false, error: `items[${index}].type is invalid` };
    }

    const snapshot = rawItem.snapshot;
    if (!isRecord(snapshot)) {
      return { ok: false, error: `items[${index}].snapshot is required` };
    }

    const quantity = optionalPositiveNumber(
      rawItem.quantity,
      `items[${index}].quantity`,
      10000,
    );
    if (!quantity.ok) return quantity;

    const servingGrams = optionalPositiveNumber(
      rawItem.servingGrams,
      `items[${index}].servingGrams`,
      5000,
    );
    if (!servingGrams.ok) return servingGrams;

    const snapshotName =
      optionalTrimmedString(snapshot.displayName, MAX_NAME_LENGTH) ??
      optionalTrimmedString(snapshot.name, MAX_NAME_LENGTH) ??
      optionalTrimmedString(rawItem.name, MAX_NAME_LENGTH);

    if (!snapshotName) {
      return {
        ok: false,
        error: `items[${index}].snapshot.name is required`,
      };
    }

    const calories = snapshotNumber(
      snapshot,
      "calories",
      "calories",
      `items[${index}].snapshot.calories`,
    );
    if (!calories.ok) return calories;
    const carbs = snapshotNumber(
      snapshot,
      "carbs_g",
      "carbs",
      `items[${index}].snapshot.carbs_g`,
    );
    if (!carbs.ok) return carbs;
    const protein = snapshotNumber(
      snapshot,
      "protein_g",
      "protein",
      `items[${index}].snapshot.protein_g`,
    );
    if (!protein.ok) return protein;
    const fat = snapshotNumber(snapshot, "fat_g", "fat", `items[${index}].snapshot.fat_g`);
    if (!fat.ok) return fat;

    const rpcItem: NutritionMealRpcItem = {
      item_type: itemType,
      quantity: quantity.value ?? 1,
      serving_unit: optionalTrimmedString(
        rawItem.servingUnit,
        MAX_SERVING_UNIT_LENGTH,
      ),
      serving_grams: servingGrams.value,
      snapshot_name: snapshotName,
      snapshot_brand_name:
        optionalTrimmedString(snapshot.brandName, MAX_NAME_LENGTH) ??
        optionalTrimmedString(snapshot.brand_name, MAX_NAME_LENGTH),
      snapshot_calories: calories.value,
      snapshot_carbs_g: carbs.value,
      snapshot_protein_g: protein.value,
      snapshot_fat_g: fat.value,
      metadata: jsonObject(rawItem.metadata),
      sort_order: index,
    };

    if (itemType === "food") {
      const foodId = requiredUuid(rawItem.foodId, `items[${index}].foodId`);
      if (!foodId.ok) return foodId;
      rpcItem.food_id = foodId.value;
      addUnique(foodIds, foodId.value);
    } else if (itemType === "recipe") {
      const recipeId = requiredUuid(rawItem.recipeId, `items[${index}].recipeId`);
      if (!recipeId.ok) return recipeId;
      rpcItem.recipe_id = recipeId.value;
      addUnique(recipeIds, recipeId.value);
    } else {
      const customName = requiredTrimmedString(
        rawItem.name,
        `items[${index}].name`,
        MAX_NAME_LENGTH,
      );
      if (!customName.ok) return customName;
      rpcItem.custom_name = customName.value;
    }

    totals.total_calories += rpcItem.snapshot_calories;
    totals.total_carbs_g += rpcItem.snapshot_carbs_g;
    totals.total_protein_g += rpcItem.snapshot_protein_g;
    totals.total_fat_g += rpcItem.snapshot_fat_g;
    items.push(rpcItem);
  }

  return {
    ok: true,
    value: {
      meal,
      items,
      totals,
      foodIds: [...foodIds],
      recipeIds: [...recipeIds],
    },
  };
}
