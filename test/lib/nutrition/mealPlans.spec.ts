import { describe, expect, it } from "vitest";
import { calculateMealPlanPlannedTotals, parseMealPlanNutritionSnapshot, type MealPlanDay } from "@/lib/nutrition/mealPlans";

const valid = {
  version: 1, calories: 320, carbs_g: 30, protein_g: 24, fat_g: 10, grocery_deductions: [],
  items: [{ item_type: "food", food_id: "11111111-1111-4111-8111-111111111111", recipe_id: null, custom_name: null, quantity: 1, serving_unit: "serving", serving_grams: 100, snapshot_name: "Food", snapshot_brand_name: null, snapshot_calories: 320, snapshot_carbs_g: 30, snapshot_protein_g: 24, snapshot_fat_g: 10, metadata: {}, sort_order: 0 }],
};

const basePlan = {
  id: "day",
  creator_day_date: "2026-07-28",
  timezone: "America/Chicago",
  timezone_source: "device",
  boundary_hour: 4,
  starts_at: "2026-07-28T09:00:00.000Z",
  ends_at: "2026-07-29T09:00:00.000Z",
  planning_mode: "flexible",
  notes: null,
} satisfies Omit<MealPlanDay, "items">;

function item(overrides: Partial<MealPlanDay["items"][number]>): MealPlanDay["items"][number] {
  return {
    id: "item",
    meal_plan_day_id: "day",
    position: 0,
    label: "Planned food",
    meal_type: null,
    planned_time: null,
    status: "planned",
    servings: 1,
    food_id: null,
    meal_template_id: null,
    recipe_id: null,
    nutrition_snapshot: {
      version: 1,
      loggable: true,
      calories: 100,
      carbs_g: 10,
      protein_g: 8,
      fat_g: 4,
      items: [{
        item_type: "custom",
        food_id: null,
        recipe_id: null,
        custom_name: "Planned food",
        quantity: 1,
        serving_unit: "serving",
        serving_grams: null,
        snapshot_name: "Planned food",
        snapshot_brand_name: null,
        snapshot_calories: 100,
        snapshot_carbs_g: 10,
        snapshot_protein_g: 8,
        snapshot_fat_g: 4,
        metadata: {},
        sort_order: 0,
      }],
      grocery_deductions: [],
    },
    source_surface: "nutrition",
    consumed_meal_id: null,
    grocery_depletion_status: "not_applicable",
    grocery_depletion_results: [],
    created_at: "2026-07-28T12:00:00.000Z",
    updated_at: "2026-07-28T12:00:00.000Z",
    ...overrides,
  };
}

describe("parseMealPlanNutritionSnapshot", () => {
  it("accepts a versioned loggable snapshot", () => expect(parseMealPlanNutritionSnapshot(valid)?.items).toHaveLength(1));
  it("accepts only an explicitly non-loggable empty manual snapshot", () => {
    const manual = { version: 1, loggable: false, calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, grocery_deductions: [], items: [] };
    expect(parseMealPlanNutritionSnapshot(manual)).toMatchObject({ loggable: false, items: [] });
    expect(parseMealPlanNutritionSnapshot({ ...manual, items: [valid.items[0]] })).toBeNull();
    expect(parseMealPlanNutritionSnapshot({ ...manual, grocery_deductions: [{ food_resource_id: "11111111-1111-4111-8111-111111111111", amount: 1, unit: "g" }] })).toBeNull();
  });
  it.each([{}, { ...valid, version: 2 }, { ...valid, calories: "bad" }, { ...valid, items: [] }, { ...valid, items: [{ ...valid.items[0], food_id: "bad" }] }, { ...valid, grocery_deductions: [{ food_resource_id: "bad", amount: 1, unit: "g" }] }])("rejects malformed snapshots", (snapshot) => expect(parseMealPlanNutritionSnapshot(snapshot)).toBeNull());
  it("preserves expanded template components", () => {
    const second = { ...valid.items[0], food_id: "22222222-2222-4222-8222-222222222222", snapshot_name: "Second", sort_order: 1 };
    expect(parseMealPlanNutritionSnapshot({ ...valid, items: [valid.items[0], second] })?.items.map((entry) => entry.snapshot_name)).toEqual(["Food", "Second"]);
  });
});

describe("Meal Plan planned totals", () => {
  it("sums loggable non-skipped plan item nutrition snapshots with servings", () => {
    const plan: MealPlanDay = {
      ...basePlan,
      items: [
        item({ id: "one", servings: 2 }),
        item({ id: "manual", nutrition_snapshot: { version: 1, loggable: false, calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, items: [], grocery_deductions: [] } }),
        item({ id: "skipped", status: "skipped", servings: 3 }),
      ],
    };

    expect(calculateMealPlanPlannedTotals(plan)).toEqual({
      calories: 200,
      carbs_g: 20,
      protein_g: 16,
      fat_g: 8,
    });
  });
});
