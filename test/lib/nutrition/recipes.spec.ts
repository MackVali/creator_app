import { describe, expect, it } from "vitest";
import {
  buildFoodInsertFromOwnedResource,
  buildRecipeSavePayload,
  getRecipeIngredientLineNutrition,
  getRecipeTotals,
  makeRecipeIngredientFromFood,
} from "@/lib/nutrition/recipes";

describe("nutrition recipes", () => {
  it("scales ingredient nutrition without treating unknown values as zero", () => {
    const complete = makeRecipeIngredientFromFood(
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Chicken Breast",
        brand_name: null,
        serving_size: 100,
        serving_unit: "g",
        serving_grams: 100,
        calories: 165,
        carbs_g: 0,
        protein_g: 31,
        fat_g: 3.6,
      },
      "a",
    );
    complete.quantity = 200;
    complete.servingUnit = "g";
    const incomplete = { ...complete, id: "b", name: "Mystery Sauce", calories: null };

    expect(getRecipeIngredientLineNutrition(complete)).toMatchObject({
      complete: true,
      calories: 330,
      protein_g: 62,
    });
    expect(getRecipeIngredientLineNutrition(incomplete).complete).toBe(false);
    expect(getRecipeTotals([complete, incomplete])).toMatchObject({
      calories: 330,
      carbs_g: 0,
      protein_g: 62,
      incompleteIngredientIds: ["b"],
    });
  });

  it("builds line snapshots and preparation metadata for recipe saves", () => {
    const ingredient = makeRecipeIngredientFromFood(
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Oats",
        brand_name: "CREATOR",
        serving_size: 40,
        serving_unit: "g",
        serving_grams: 40,
        calories: 150,
        carbs_g: 27,
        protein_g: 5,
        fat_g: 3,
      },
      "oats",
    );
    ingredient.quantity = 80;
    ingredient.servingUnit = "g";
    const payload = buildRecipeSavePayload({
      name: "Overnight oats",
      icon: "🥣",
      description: "Cold oats",
      servings: 2,
      instructions: "Stir and chill.",
      ingredients: [ingredient],
    });

    expect(payload.metadata).toMatchObject({
      preparation_instructions: "Stir and chill.",
    });
    expect(payload.items[0]).toMatchObject({
      foodId: "11111111-1111-4111-8111-111111111111",
      snapshot: { calories: 300, protein_g: 10 },
      metadata: { snapshotTotals: "line" },
    });
  });

  it("creates an idempotent user-owned food insert from a complete Grocery barcode row", () => {
    const insert = buildFoodInsertFromOwnedResource(
      {
        id: "resource-1",
        name: "Protein Bar",
        brand_name: "Lift",
        metadata: {
          barcode: " 012345678905 ",
          serving_quantity: 1,
          serving_unit: "bar",
          serving_grams: 60,
          calories: 220,
          carbs_g: 24,
          protein_g: 20,
          fat_g: 7,
        },
      },
      "user-1",
    );

    expect(insert).toMatchObject({
      normalized_barcode: "012345678905",
      dedupe_key: "barcode:012345678905",
      external_source: "user_food_resource",
      external_id: "resource-1",
      created_by_user_id: "user-1",
    });
  });
});
