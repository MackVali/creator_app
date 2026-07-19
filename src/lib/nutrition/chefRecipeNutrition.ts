import { resolveChefRecipeIngredients, type ChefRecipe, type ChefRecipeIngredient, type ChefRecipeSelectedOptions } from "@/lib/nutrition/chefRecipes";

export type ChefPantryNutritionEntry = {
  foodKey: string; displayName: string; icon: string; aliases: string[];
  baseAmount: number; baseUnit: string; calories: number; protein_g: number; carbs_g: number; fat_g: number;
  commonUnits?: Record<string, number>;
};

export type ChefNutritionTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number; estimated: boolean; unknownCount: number };
export type ChefIngredientNutrition = ChefNutritionTotals & { unknownNutrition: boolean };
export type ChefAvailability = "have" | "partial" | "missing" | "unknown";
export type ChefFoodResourceLike = { id?: unknown; name?: unknown; brand_name?: unknown; quantity?: unknown; unit?: unknown; metadata?: unknown };
export type ChefIngredientAvailability = { availability: ChefAvailability; matchedResourceId?: string; matchedResourceName?: string; onHandQuantity?: number; onHandUnit?: string; neededQuantity: number; neededUnit: string };
export type ChefRecipeAvailability = { totalIngredients: number; haveCount: number; partialCount: number; missingCount: number; unknownCount: number; missingIngredientNames: string[]; summary: string; ingredients: Record<string, ChefIngredientAvailability> };

const entry = (foodKey: string, displayName: string, icon: string, baseAmount: number, baseUnit: string, calories: number, protein_g: number, carbs_g: number, fat_g: number, aliases: string[] = [], commonUnits?: Record<string, number>): ChefPantryNutritionEntry => ({ foodKey, displayName, icon, aliases, baseAmount, baseUnit, calories, protein_g, carbs_g, fat_g, ...(commonUnits ? { commonUnits } : {}) });

export const CHEF_PANTRY_NUTRITION = [
  entry("tortilla-flour", "Flour tortilla", "🌯", 1, "each", 140, 4, 24, 4, ["flour tortillas", "wrap"], { serving: 1 }),
  entry("tortilla-corn", "Corn tortilla", "🌮", 1, "each", 55, 1.5, 11, 0.7, ["corn tortillas"], { serving: 1 }),
  entry("chicken-breast", "Chicken breast", "🍗", 4, "oz", 187, 35, 0, 4, ["chicken", "cooked chicken"]),
  entry("ground-beef", "Ground beef", "🥩", 4, "oz", 287, 29, 0, 19, ["minced beef", "hamburger meat"]),
  entry("steak", "Steak", "🥩", 4, "oz", 250, 28, 0, 15, ["beef", "lean beef"]),
  entry("egg", "Eggs", "🥚", 1, "each", 72, 6.3, 0.4, 4.8, ["egg"], { serving: 1 }),
  entry("cheddar-cheese", "Cheddar cheese", "🧀", 1, "oz", 114, 7, 0.4, 9.4, ["cheddar", "shredded cheese"], { cup: 4 }),
  entry("mozzarella", "Mozzarella", "🧀", 1, "oz", 85, 6.3, 0.6, 6.3),
  entry("rice-white", "White rice", "🍚", 1, "cup", 205, 4.3, 44.5, 0.4, ["rice", "cooked rice"]),
  entry("pasta", "Pasta", "🍝", 2, "oz", 200, 7, 42, 1, ["spaghetti", "noodles", "fettuccine"]),
  entry("black-beans", "Black beans", "🫘", 0.5, "cup", 114, 7.6, 20, 0.5, ["black bean"]),
  entry("pinto-beans", "Pinto beans", "🫘", 0.5, "cup", 123, 7.7, 22, 0.6, ["refried beans"]),
  entry("potato", "Potato", "🥔", 1, "each", 161, 4.3, 37, 0.2, ["potatoes", "russet potato"]),
  entry("bread", "Bread", "🍞", 1, "slice", 80, 3, 15, 1, ["sandwich bread"]),
  entry("oats", "Oats", "🥣", 0.5, "cup", 150, 5, 27, 3, ["oatmeal", "rolled oats"]),
  entry("greek-yogurt", "Greek yogurt", "🥣", 1, "cup", 130, 23, 9, 0, ["yogurt"]),
  entry("tuna", "Tuna", "🐟", 1, "can", 120, 26, 0, 1, ["canned tuna", "tuna fish"]),
  entry("milk", "Milk", "🥛", 1, "cup", 122, 8, 12, 4.8, ["dairy milk"]),
  entry("peanut-butter", "Peanut butter", "🥜", 2, "tbsp", 190, 7, 7, 16),
  entry("banana", "Banana", "🍌", 1, "each", 105, 1.3, 27, 0.4, ["bananas"]),
  entry("salsa", "Salsa", "🍅", 0.25, "cup", 20, 1, 4, 0, ["tomato salsa"]),
  entry("sour-cream", "Sour cream", "🥛", 2, "tbsp", 60, 1, 1, 5),
  entry("olive-oil", "Olive oil", "🫒", 1, "tbsp", 119, 0, 0, 13.5),
  entry("butter", "Butter", "🧈", 1, "tbsp", 102, 0.1, 0, 11.5),
  entry("taco-shell", "Taco shell", "🌮", 1, "each", 60, 1, 8, 3, ["hard taco shell"], { serving: 1 }),
] as const satisfies readonly ChefPantryNutritionEntry[];

const nutritionByKey = new Map(CHEF_PANTRY_NUTRITION.map((item) => [item.foodKey, item]));
const safeNumber = (value: unknown) => { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; };
const normalize = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
const normalizeUnit = (value: unknown) => { const unit = normalize(value); return ({ ounces: "oz", ounce: "oz", pounds: "lb", pound: "lb", cups: "cup", tablespoons: "tbsp", tablespoon: "tbsp", teaspoons: "tsp", teaspoon: "tsp", slices: "slice", cans: "can", servings: "serving", items: "each" } as Record<string, string>)[unit] ?? unit; };
const unitGroup = (unit: string) => (["g", "oz", "lb"].includes(unit) ? "mass" : ["ml", "cup", "tbsp", "tsp", "fl oz"].includes(unit) ? "volume" : ["each", "slice", "can", "serving"].includes(unit) ? "count" : "unknown");
const toGroupBase = (quantity: number, unit: string) => { const factor = ({ g: 1, oz: 28.3495, lb: 453.592, ml: 1, cup: 236.588, tbsp: 14.7868, tsp: 4.92892, "fl oz": 29.5735 } as Record<string, number>)[unit]; return factor === undefined ? null : quantity * factor; };

function servingMultiplier(ingredient: ChefRecipeIngredient, nutrition: ChefPantryNutritionEntry) {
  const quantity = safeNumber(ingredient.quantity); if (quantity === null) return null;
  const from = normalizeUnit(ingredient.unit); const base = normalizeUnit(nutrition.baseUnit);
  if (from === base) return quantity / nutrition.baseAmount;
  if (nutrition.commonUnits?.[from] !== undefined) return quantity * nutrition.commonUnits[from] / nutrition.baseAmount;
  if (unitGroup(from) !== "unknown" && unitGroup(from) === unitGroup(base)) { const converted = toGroupBase(quantity, from); const convertedBase = toGroupBase(nutrition.baseAmount, base); return converted !== null && convertedBase ? converted / convertedBase : null; }
  return null;
}

export function calculateChefIngredientNutrition(ingredient: ChefRecipeIngredient): ChefIngredientNutrition {
  const nutrition = nutritionByKey.get(ingredient.foodKey);
  if (!nutrition) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, estimated: true, unknownCount: 1, unknownNutrition: true };
  const multiplier = servingMultiplier(ingredient, nutrition);
  if (multiplier === null) return { calories: nutrition.calories, protein_g: nutrition.protein_g, carbs_g: nutrition.carbs_g, fat_g: nutrition.fat_g, estimated: true, unknownCount: 0, unknownNutrition: false };
  return { calories: nutrition.calories * multiplier, protein_g: nutrition.protein_g * multiplier, carbs_g: nutrition.carbs_g * multiplier, fat_g: nutrition.fat_g * multiplier, estimated: false, unknownCount: 0, unknownNutrition: false };
}

export function calculateChefRecipeNutrition(recipe: ChefRecipe): ChefNutritionTotals {
  return recipe.ingredients.reduce<ChefNutritionTotals>((total, ingredient) => { const value = calculateChefIngredientNutrition(ingredient); return { calories: total.calories + value.calories, protein_g: total.protein_g + value.protein_g, carbs_g: total.carbs_g + value.carbs_g, fat_g: total.fat_g + value.fat_g, estimated: total.estimated || value.estimated, unknownCount: total.unknownCount + value.unknownCount }; }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, estimated: false, unknownCount: 0 });
}

export function calculateResolvedChefRecipeNutrition(recipe: ChefRecipe, selectedOptions: ChefRecipeSelectedOptions = {}): ChefNutritionTotals {
  return resolveChefRecipeIngredients(recipe, selectedOptions).reduce<ChefNutritionTotals>((total, ingredient) => {
    const value = calculateChefIngredientNutrition(ingredient);
    return { calories: total.calories + value.calories, protein_g: total.protein_g + value.protein_g, carbs_g: total.carbs_g + value.carbs_g, fat_g: total.fat_g + value.fat_g, estimated: total.estimated || value.estimated, unknownCount: total.unknownCount + value.unknownCount };
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, estimated: false, unknownCount: 0 });
}

export const formatChefNutritionNumber = (value: unknown) => { const number = safeNumber(value); return number === null ? "—" : Math.round(number).toLocaleString(); };
export const formatChefMacroSummary = (totals: ChefNutritionTotals) => `${totals.estimated ? "~" : ""}${formatChefNutritionNumber(totals.calories)} cal · ${formatChefNutritionNumber(totals.protein_g)}g protein`;

function metadataKey(metadata: unknown) { if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""; const value = metadata as Record<string, unknown>; return normalize(value.foodKey ?? value.food_key ?? value.canonicalKey ?? value.canonical_key); }
function matchesIngredient(ingredient: ChefRecipeIngredient, resource: ChefFoodResourceLike) {
  if (!resource || typeof resource !== "object") return false;
  const key = normalize(ingredient.foodKey); if (metadataKey(resource.metadata) === key) return true;
  const names = [resource.name, resource.brand_name].map(normalize).filter(Boolean); const candidates = [ingredient.name, ...(ingredient.aliases ?? [])].map(normalize).filter((item) => item.length >= 3 && !["sauce", "meat", "cheese"].includes(item));
  return names.some((name) => candidates.some((candidate) => name === candidate || (candidate.length >= 5 && name.includes(candidate))));
}

export function calculateChefIngredientAvailability(ingredient: ChefRecipeIngredient, resources: readonly ChefFoodResourceLike[]): ChefIngredientAvailability {
  const result: ChefIngredientAvailability = { availability: "missing", neededQuantity: safeNumber(ingredient.quantity) ?? 0, neededUnit: ingredient.unit };
  const resource = resources.find((item) => matchesIngredient(ingredient, item)); if (!resource) return result;
  const quantity = safeNumber(resource.quantity); const resourceUnit = normalizeUnit(resource.unit); const neededUnit = normalizeUnit(ingredient.unit);
  const details = { matchedResourceId: typeof resource.id === "string" ? resource.id : undefined, matchedResourceName: typeof resource.name === "string" ? resource.name : undefined, onHandQuantity: quantity ?? undefined, onHandUnit: typeof resource.unit === "string" ? resource.unit : undefined };
  if (quantity === null || !resourceUnit || !neededUnit || unitGroup(resourceUnit) !== unitGroup(neededUnit) || unitGroup(resourceUnit) === "unknown") return { ...result, ...details, availability: "unknown" };
  const onHand = resourceUnit === neededUnit ? quantity : toGroupBase(quantity, resourceUnit); const needed = resourceUnit === neededUnit ? result.neededQuantity : toGroupBase(result.neededQuantity, neededUnit);
  if (onHand === null || needed === null) return { ...result, ...details, availability: "unknown" };
  return { ...result, ...details, availability: onHand >= needed ? "have" : onHand > 0 ? "partial" : "missing" };
}

export function calculateChefRecipeAvailability(recipe: ChefRecipe, resources: readonly ChefFoodResourceLike[]): ChefRecipeAvailability {
  return calculateIngredientsAvailability(recipe.ingredients, resources);
}

export function calculateResolvedChefRecipeAvailability(recipe: ChefRecipe, selectedOptions: ChefRecipeSelectedOptions = {}, resources: readonly ChefFoodResourceLike[]): ChefRecipeAvailability {
  return calculateIngredientsAvailability(resolveChefRecipeIngredients(recipe, selectedOptions), resources);
}

const CHEF_STAPLE_FOOD_KEYS = new Set(["olive-oil", "butter", "salt", "black-pepper", "water"]);

export function isResolvedChefRecipeAvailable(recipe: ChefRecipe, selectedOptions: ChefRecipeSelectedOptions = {}, resources: readonly ChefFoodResourceLike[] = []): boolean {
  const resolvedIngredients = resolveChefRecipeIngredients(recipe, selectedOptions);
  const availability = calculateIngredientsAvailability(resolvedIngredients, Array.isArray(resources) ? resources : []);
  return resolvedIngredients.every((ingredient) => {
    if (ingredient.optional || CHEF_STAPLE_FOOD_KEYS.has(ingredient.foodKey)) return true;
    return availability.ingredients[ingredient.id]?.availability !== "missing";
  });
}

function calculateIngredientsAvailability(recipeIngredients: readonly ChefRecipeIngredient[], resources: readonly ChefFoodResourceLike[]): ChefRecipeAvailability {
  const ingredients: Record<string, ChefIngredientAvailability> = {}; let haveCount = 0; let partialCount = 0; let missingCount = 0; let unknownCount = 0; const missingIngredientNames: string[] = [];
  recipeIngredients.forEach((ingredient) => { const value = calculateChefIngredientAvailability(ingredient, resources); ingredients[ingredient.id] = value; if (value.availability === "have") haveCount += 1; else if (value.availability === "partial") partialCount += 1; else if (value.availability === "unknown") unknownCount += 1; else { missingCount += 1; if (!ingredient.optional) missingIngredientNames.push(ingredient.name); } });
  const totalIngredients = recipeIngredients.length; return { totalIngredients, haveCount, partialCount, missingCount, unknownCount, missingIngredientNames, summary: `You have ${haveCount}/${totalIngredients} ingredients`, ingredients };
}
