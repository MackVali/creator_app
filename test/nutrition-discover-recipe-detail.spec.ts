import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  combineNutritionDiscoverIngredients,
  convertFoodSearchResultToTemporaryChefIngredient,
  getNutritionDiscoverDefaultIngredientSelected,
  normalizeNutritionDiscoverGroceryText,
} from "../src/components/nutrition/NutritionDiscoverRecipeDetail";
import {
  calculateChefIngredientNutrition,
  totalIngredientNutrition,
  type ChefIngredientAvailability,
} from "@/lib/nutrition/chefRecipeNutrition";
import type { ChefRecipeIngredient } from "@/lib/nutrition/chefRecipes";
import type { FoodSearchResult } from "@/lib/nutrition/foods";

const root = resolve(__dirname, "..");
const noteSlashTextareaSource = readFileSync(
  resolve(root, "src/components/notes/NoteSlashTextarea.tsx"),
  "utf8",
);
const detailSource = readFileSync(
  resolve(root, "src/components/nutrition/NutritionDiscoverRecipeDetail.tsx"),
  "utf8",
);

function availability(
  value: ChefIngredientAvailability["availability"],
): ChefIngredientAvailability {
  return {
    availability: value,
    neededQuantity: 1,
    neededUnit: "each",
  };
}

function sourceBetween(start: string, end: string) {
  const startIndex = noteSlashTextareaSource.indexOf(start);
  const endIndex = noteSlashTextareaSource.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return noteSlashTextareaSource.slice(startIndex, endIndex);
}

describe("Nutrition Discover recipe detail", () => {
  it("keeps the collapsed recipe row as an opener without the old Add shortcut", () => {
    const collapsedRecipeRowSource = sourceBetween(
      "recipes.length > 0 ? recipes.map((recipe, recipeIndex) => {",
      "</article></Fragment>",
    );

    expect(collapsedRecipeRowSource).toContain("setOpenNutritionDiscoverRecipe");
    expect(collapsedRecipeRowSource).not.toContain("Add ${resolvedName} to meal");
    expect(collapsedRecipeRowSource).not.toContain(">Add</button>");
  });

  it("exposes the focused recipe actions and preserves Add to Meal through addSelectedChefRecipe", () => {
    const openRecipeSource = sourceBetween(
      "if (openRecipe) {",
      "onHandFoods={groceryResourceItems.map(mapFoodResourceToFoodSearchResult)}",
    );

    expect(detailSource).toContain("Get Ingredients");
    expect(detailSource).toContain("Add to Meal");
    expect(openRecipeSource).toContain("addSelectedChefRecipe({");
    expect(openRecipeSource).toContain("chefRecipeId: openRecipe.id");
    expect(openRecipeSource).toContain("selectedOptions: resolvedSelectedOptions");
    expect(openRecipeSource).toContain("ingredients: mealSnapshot.ingredients");
    expect(openRecipeSource).toContain("nutrition: mealSnapshot.nutrition");
    expect(detailSource).toContain("onHandFoods: FoodSearchResult[]");
  });

  it("builds combined ingredients from base plus temporary additions without mutating the creator recipe", () => {
    const baseIngredient: ChefRecipeIngredient = {
      id: "base-tortilla",
      foodKey: "tortilla-flour",
      icon: "t",
      name: "Flour tortilla",
      quantity: 1,
      unit: "each",
    };
    const temporaryIngredient: ChefRecipeIngredient = {
      id: "temporary-hot-sauce",
      foodKey: "valentina",
      icon: "v",
      name: "Valentina",
      quantity: 1,
      unit: "tbsp",
      nutrition: {
        baseQuantity: 1,
        baseUnit: "tbsp",
        calories: 5,
        protein_g: 0,
        carbs_g: 1,
        fat_g: 0,
      },
    };
    const creatorIngredients = [baseIngredient];

    const combined = combineNutritionDiscoverIngredients(creatorIngredients, [temporaryIngredient]);

    expect(combined.map((ingredient) => ingredient.name)).toEqual(["Flour tortilla", "Valentina"]);
    expect(creatorIngredients).toEqual([baseIngredient]);
  });

  it("deduplicates equivalent temporary additions by food key", () => {
    const baseIngredient: ChefRecipeIngredient = {
      id: "base-cheese",
      foodKey: "cheddar-cheese",
      icon: "c",
      name: "Cheddar cheese",
      quantity: 1,
      unit: "oz",
    };
    const duplicateTemporary: ChefRecipeIngredient = {
      id: "temporary-cheese",
      foodKey: "cheddar-cheese",
      icon: "c",
      name: "Fiesta cheese",
      quantity: 1,
      unit: "oz",
    };

    expect(combineNutritionDiscoverIngredients([baseIngredient], [duplicateTemporary])).toEqual([
      baseIngredient,
    ]);
  });

  it("converts On Hand foods into adjustable temporary chef ingredients with food nutrition", () => {
    const food: FoodSearchResult = {
      id: "food-1",
      name: "Fiesta cheese",
      normalized_name: "fiesta cheese",
      brand_name: "Store",
      source: "grocery_resource",
      serving_size: 0.25,
      serving_unit: "cup",
      serving_grams: 28,
      calories: 110,
      carbs_g: 1,
      protein_g: 7,
      fat_g: 9,
      metadata: { foodResourceId: "resource-1", foodKey: "cheddar-cheese" },
      catalog_metadata: null,
    };

    const ingredient = convertFoodSearchResultToTemporaryChefIngredient(food, "on-hand");

    expect(ingredient.id).toBe("temporary-on-hand-resource-1");
    expect(ingredient.name).toBe("Fiesta cheese (Store)");
    expect(ingredient.quantity).toBe(0.25);
    expect(ingredient.unit).toBe("cup");
    expect(calculateChefIngredientNutrition({ ...ingredient, quantity: 0.5 }).calories).toBe(220);
  });

  it("calculates displayed nutrition from combined ingredients", () => {
    const baseIngredient: ChefRecipeIngredient = {
      id: "base-tortilla",
      foodKey: "tortilla-flour",
      icon: "t",
      name: "Flour tortilla",
      quantity: 1,
      unit: "each",
    };
    const temporaryIngredient: ChefRecipeIngredient = {
      id: "temporary-cheese",
      foodKey: "temporary-cheese",
      icon: "c",
      name: "Fiesta cheese",
      quantity: 1,
      unit: "oz",
      nutrition: {
        baseQuantity: 1,
        baseUnit: "oz",
        calories: 100,
        protein_g: 6,
        carbs_g: 1,
        fat_g: 8,
      },
    };

    const totals = totalIngredientNutrition(
      combineNutritionDiscoverIngredients([baseIngredient], [temporaryIngredient]),
    );

    expect(totals.calories).toBe(240);
    expect(totals.protein_g).toBe(10);
  });

  it("removes temporary additions only from the temporary build", () => {
    const baseIngredient: ChefRecipeIngredient = {
      id: "base-salsa",
      foodKey: "salsa",
      icon: "s",
      name: "Salsa",
      quantity: 0.25,
      unit: "cup",
    };
    const temporaryIngredient: ChefRecipeIngredient = {
      id: "temporary-valentina",
      foodKey: "valentina",
      icon: "v",
      name: "Valentina",
      quantity: 1,
      unit: "tbsp",
    };

    expect(combineNutritionDiscoverIngredients([baseIngredient], [temporaryIngredient])).toHaveLength(2);
    expect(combineNutritionDiscoverIngredients([baseIngredient], [])).toEqual([baseIngredient]);
  });

  it("keeps logged chef recipe serialization based on the selected meal instance", () => {
    const serializerSource = sourceBetween(
      "function buildSelectedChefRecipeMealItem",
      "function getNutritionMealDraftItemTotals",
    );

    expect(serializerSource).toContain('source: "chef-recipe"');
    expect(serializerSource).toContain("resolvedIngredients: item.ingredients");
  });

  it("does not change Meal Plan behavior for temporary discover ingredients", () => {
    expect(detailSource).not.toContain("useMealPlanDay");
    expect(detailSource).not.toContain("/api/nutrition/meal-plan");
    expect(noteSlashTextareaSource).toContain("<SharedMealPlanPanel");
  });

  it("routes Get Ingredients to My List Grocery and avoids food_resources writes", () => {
    const groceryWriterSource = sourceBetween(
      "async function addChefIngredientsToGroceryList",
      "function openNutritionMealBuilder()",
    );

    expect(groceryWriterSource).toContain("getSupabaseBrowser()");
    expect(groceryWriterSource).toContain("loadMyListLists(user.id)");
    expect(groceryWriterSource).toContain("MY_LIST_GROCERY_SYSTEM_KEY");
    expect(groceryWriterSource).toContain("loadManualMyListItems({");
    expect(groceryWriterSource).toContain("createManualMyListItem({");
    expect(groceryWriterSource).toContain("activeGroceryTexts.has(duplicateKey)");
    expect(groceryWriterSource).not.toContain("/api/food-resources");
    expect(groceryWriterSource).not.toContain("food_resources");
  });

  it("removes the old duplicated template configuration controls from open recipe detail", () => {
    expect(detailSource).not.toContain(" · required");
    expect(detailSource).not.toContain("No matching groceries");
    expect(detailSource).not.toContain("slot.availableCandidates.map((candidate)");
    expect(detailSource).toContain("ingredientSurfaceRows.map((row)");
  });

  it("removes the old macro dashboard and readiness cards from open recipe detail", () => {
    expect(detailSource).not.toContain(">Calories<");
    expect(detailSource).not.toContain(">Carbs<");
    expect(detailSource).not.toContain(">Fat<");
    expect(detailSource).not.toContain("Almost ready");
    expect(detailSource).not.toContain("resolvedBuild.state");
    expect(detailSource).not.toContain("Missing required:");
    expect(detailSource).not.toContain("Missing extras");
    expect(detailSource).not.toContain("resolvedBuild.missingExtras");
  });

  it("keeps one primary Ingredients surface with On Hand suggestions below it", () => {
    expect(detailSource.match(/>\s*Ingredients\s*</g)).toHaveLength(1);
    expect(detailSource).toContain("Suggested from On Hand");
    expect(detailSource).toContain("addTemporaryIngredient(convertFoodSearchResultToTemporaryChefIngredient(food, \"on-hand\"))");
  });

  it("defaults missing and partial ingredients selected, but have and unknown unselected", () => {
    expect(getNutritionDiscoverDefaultIngredientSelected(availability("missing"))).toBe(true);
    expect(getNutritionDiscoverDefaultIngredientSelected(availability("partial"))).toBe(true);
    expect(getNutritionDiscoverDefaultIngredientSelected(availability("have"))).toBe(false);
    expect(getNutritionDiscoverDefaultIngredientSelected(availability("unknown"))).toBe(false);
  });

  it("normalizes grocery labels for duplicate comparison", () => {
    expect(normalizeNutritionDiscoverGroceryText("  2   cup   rice  ")).toBe("2 cup rice");
  });
});
