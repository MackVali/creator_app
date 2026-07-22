import { describe, expect, it } from "vitest";
import { parseMealPlanNutritionSnapshot } from "@/lib/nutrition/mealPlans";

const valid = {
  version: 1, calories: 320, carbs_g: 30, protein_g: 24, fat_g: 10, grocery_deductions: [],
  items: [{ item_type: "food", food_id: "11111111-1111-4111-8111-111111111111", recipe_id: null, custom_name: null, quantity: 1, serving_unit: "serving", serving_grams: 100, snapshot_name: "Food", snapshot_brand_name: null, snapshot_calories: 320, snapshot_carbs_g: 30, snapshot_protein_g: 24, snapshot_fat_g: 10, metadata: {}, sort_order: 0 }],
};

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
    expect(parseMealPlanNutritionSnapshot({ ...valid, items: [valid.items[0], second] })?.items.map((item) => item.snapshot_name)).toEqual(["Food", "Second"]);
  });
});
