export type ChefDifficulty = "easy" | "medium";
export type ChefMealType = "breakfast" | "lunch" | "dinner" | "snack";

export type ChefCuisine = {
  id: string;
  icon: string;
  label: string;
  description: string;
  sortOrder: number;
};

export type ChefDishFamily = {
  id: string;
  cuisineId: string;
  icon: string;
  label: string;
  description?: string;
  sortOrder: number;
};

export type ChefStyle = {
  id: string;
  cuisineId: string;
  dishFamilyId: string;
  label: string;
  aliases?: string[];
  sortOrder: number;
};

export type ChefRecipeIngredient = {
  id: string;
  foodKey: string;
  icon: string;
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
  notes?: string;
  aliases?: string[];
};

export type ChefRecipeOptionKind = "protein" | "filling" | "sauce" | "base" | "topping" | "style";
export type ChefRecipeOption = {
  id: string;
  label: string;
  shortLabel?: string;
  foodKeys?: string[];
  aliases?: string[];
  tags?: string[];
  ingredients: ChefRecipeIngredient[];
  unavailableForRecipeIds?: string[];
  onlyForRecipeIds?: string[];
};
export type ChefRecipeOptionGroup = {
  id: string;
  cuisineId: string;
  dishFamilyIds: string[];
  label: string;
  kind: ChefRecipeOptionKind;
  selectionMode: "single";
  defaultOptionId: string;
  options: ChefRecipeOption[];
};
export type ChefRecipeSelectedOptions = Readonly<Record<string, string>>;

export type ChefDishSlotRole = "structural" | "recommended" | "optional";
export type ChefDishSlotCandidate = {
  id: string;
  label: string;
  ingredient: ChefRecipeIngredient;
  foodFamilies?: string[];
  contextualAliases?: string[];
  preferred?: boolean;
};
export type ChefDishTemplateSlot = {
  id: string;
  label: string;
  role: ChefDishSlotRole;
  minimumSelections: number;
  maximumSelections: number;
  blocksAvailability: boolean;
  includeInSummary?: boolean;
  candidates: ChefDishSlotCandidate[];
};
export type ChefDishTemplate = {
  templateId: string;
  permanentTitle: string;
  displayNameMode: "permanent";
  slots: ChefDishTemplateSlot[];
  anchorSlotIds?: string[];
  stepTemplates: string[];
};

export type ChefRecipe = {
  id: string;
  name: string;
  cuisineId: string;
  dishFamilyId: string;
  styleId?: string;
  shortDescription: string;
  timeMinutes: number;
  difficulty: ChefDifficulty;
  mealTypes: ChefMealType[];
  tags: string[];
  ingredients: ChefRecipeIngredient[];
  baseIngredients?: ChefRecipeIngredient[];
  optionGroupIds?: string[];
  defaultSelectedOptions?: Record<string, string>;
  nameTemplate?: string;
  allowOptionLabelInName?: boolean;
  steps: string[];
  groceryKeywords?: string[];
  dishTemplate?: ChefDishTemplate;
};

export const chefCuisines: readonly ChefCuisine[] = [
  { id: "mexican", icon: "🌮", label: "Mexican & Tex-Mex", description: "Tacos, burritos, plates, and shareable favorites.", sortOrder: 10 },
  { id: "italian", icon: "🍝", label: "Italian & Pasta", description: "Simple red-sauce, creamy, and baked pasta dinners.", sortOrder: 20 },
  { id: "american", icon: "🍔", label: "American Comfort", description: "Familiar, filling classics for any night.", sortOrder: 30 },
  { id: "breakfast", icon: "🍳", label: "Breakfast & Brunch", description: "Practical hot breakfasts, bowls, and handhelds.", sortOrder: 40 },
  { id: "sandwiches", icon: "🥪", label: "Sandwiches & Wraps", description: "Fast handheld meals with everyday ingredients.", sortOrder: 50 },
  { id: "rice-bowls", icon: "🍚", label: "Rice Bowls", description: "Flexible protein, vegetable, and pantry bowls.", sortOrder: 60 },
  { id: "chinese", icon: "🥡", label: "Chinese", description: "Takeout-inspired stir-fries, rice, and noodles.", sortOrder: 70 },
  { id: "japanese", icon: "🍣", label: "Japanese", description: "Approachable rice bowls, noodles, and curry.", sortOrder: 80 },
  { id: "korean", icon: "🍜", label: "Korean", description: "Savory bowls, noodles, and quick pantry meals.", sortOrder: 90 },
  { id: "vietnamese-sea", icon: "🥢", label: "Vietnamese & Southeast Asian", description: "Fresh bowls, noodles, and aromatic curries.", sortOrder: 100 },
  { id: "mediterranean", icon: "🫒", label: "Mediterranean", description: "Bright bowls, wraps, salads, and pantry plates.", sortOrder: 110 },
  { id: "indian", icon: "🍛", label: "Indian", description: "Comforting curries, rice dishes, and quick pantry meals.", sortOrder: 120 },
] as const;

const family = (cuisineId: string, id: string, icon: string, label: string, sortOrder: number, description?: string): ChefDishFamily => ({ id, cuisineId, icon, label, sortOrder, ...(description ? { description } : {}) });

export const chefDishFamilies: readonly ChefDishFamily[] = [
  family("mexican", "tacos", "🌮", "Tacos", 10), family("mexican", "burritos", "🌯", "Burritos", 20), family("mexican", "quesadillas", "🧀", "Quesadillas", 30), family("mexican", "bowls", "🍚", "Bowls", 40), family("mexican", "nachos", "🧀", "Nachos", 50), family("mexican", "plates", "🍽️", "Plates", 60),
  family("italian", "pasta-red", "🍝", "Red Sauce Pasta", 10), family("italian", "pasta-creamy", "🍝", "Creamy Pasta", 20), family("italian", "pasta-simple", "🍝", "Simple Pasta", 30),
  family("american", "burgers", "🍔", "Burgers", 10), family("american", "classics", "🍲", "Comfort Classics", 20), family("american", "meal-prep", "🍽️", "Protein Plates", 30),
  family("breakfast", "hot-breakfast", "🍳", "Hot Breakfast", 10), family("breakfast", "breakfast-bowls", "🥣", "Breakfast Bowls", 20), family("breakfast", "handheld", "🥪", "Handhelds", 30), family("breakfast", "drinks", "🥤", "Smoothies", 40),
  family("sandwiches", "wraps", "🌯", "Wraps", 10), family("sandwiches", "sandwiches", "🥪", "Sandwiches", 20), family("sandwiches", "toast", "🍞", "Toast", 30),
  family("rice-bowls", "protein-bowls", "🍚", "Protein Bowls", 10), family("rice-bowls", "quick-bowls", "🍚", "Quick Bowls", 20),
  family("chinese", "stir-fries", "🥘", "Stir-Fries", 10), family("chinese", "fried-rice", "🍚", "Fried Rice", 20), family("chinese", "noodles", "🍜", "Noodles", 30),
  family("japanese", "donburi", "🍚", "Rice Bowls", 10), family("japanese", "japanese-noodles", "🍜", "Noodles", 20), family("japanese", "curry", "🍛", "Curry", 30),
  family("korean", "korean-bowls", "🍚", "Rice Bowls", 10), family("korean", "korean-noodles", "🍜", "Noodles", 20),
  family("vietnamese-sea", "noodle-bowls", "🍜", "Noodle Bowls", 10), family("vietnamese-sea", "sea-curries", "🍛", "Curries", 20),
  family("mediterranean", "med-bowls", "🥗", "Bowls", 10), family("mediterranean", "med-wraps", "🌯", "Wraps", 20), family("mediterranean", "med-plates", "🍽️", "Pantry Plates", 30),
  family("indian", "curries", "🍛", "Curries", 10), family("indian", "indian-rice", "🍚", "Rice Dishes", 20),
] as const;

const style = (cuisineId: string, dishFamilyId: string, id: string, label: string, sortOrder: number, aliases?: string[]): ChefStyle => ({ id, cuisineId, dishFamilyId, label, sortOrder, ...(aliases ? { aliases } : {}) });

export const chefStyles: readonly ChefStyle[] = [
  ...["Asada", "Pollo", "Pastor", "Carnitas", "Ground Beef", "Bean & Cheese", "Fish"].map((label, index) => style("mexican", "tacos", `tacos-${label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`, label, index + 1)),
  ...["Asada", "Pollo", "Pastor", "Breakfast", "Bean & Cheese", "Ground Beef"].map((label, index) => style("mexican", "burritos", `burrito-${label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`, label, index + 1)),
  ...["Cheese", "Pollo", "Beef", "Breakfast"].map((label, index) => style("mexican", "quesadillas", `quesadilla-${label.toLowerCase()}`, label, index + 1)),
  style("mexican", "bowls", "burrito-bowl", "Burrito Bowl", 1), style("mexican", "bowls", "taco-rice-bowl", "Taco Rice Bowl", 2), style("mexican", "bowls", "fajita-bowl", "Fajita Bowl", 3),
  ...["Beef", "Chicken", "Bean"].map((label, index) => style("mexican", "nachos", `nachos-${label.toLowerCase()}`, label, index + 1)),
  style("mexican", "plates", "rice-plate", "Rice Plate", 1), style("mexican", "plates", "fajita-plate", "Fajita Plate", 2),
  style("italian", "pasta-red", "marinara", "Marinara", 1), style("italian", "pasta-red", "meat-sauce", "Meat Sauce", 2), style("italian", "pasta-creamy", "alfredo", "Alfredo", 1), style("italian", "pasta-simple", "butter-garlic", "Butter & Garlic", 1),
  style("american", "burgers", "beef-burger", "Beef", 1), style("american", "classics", "cheesy", "Cheesy", 1), style("american", "classics", "one-pot", "One Pot", 2),
  style("breakfast", "hot-breakfast", "eggs", "Eggs", 1), style("breakfast", "breakfast-bowls", "oats", "Oats", 1), style("breakfast", "breakfast-bowls", "yogurt", "Yogurt", 2),
  style("sandwiches", "wraps", "poultry-wrap", "Chicken & Turkey", 1), style("sandwiches", "sandwiches", "tuna", "Tuna", 1),
  style("rice-bowls", "protein-bowls", "chicken-bowl", "Chicken", 1), style("rice-bowls", "protein-bowls", "beef-bowl", "Beef", 2), style("rice-bowls", "quick-bowls", "pantry-bowl", "Pantry", 1),
  style("chinese", "stir-fries", "chicken-stir-fry", "Chicken", 1), style("chinese", "fried-rice", "egg-fried-rice", "Egg", 1), style("chinese", "noodles", "ramen", "Ramen", 1),
  style("japanese", "donburi", "teriyaki", "Teriyaki", 1), style("japanese", "japanese-noodles", "udon", "Udon", 1), style("japanese", "curry", "chicken-curry", "Chicken", 1),
  style("korean", "korean-bowls", "beef-bibimbap", "Beef", 1), style("korean", "korean-noodles", "sesame-noodles", "Sesame", 1),
  style("vietnamese-sea", "noodle-bowls", "rice-noodles", "Rice Noodles", 1), style("vietnamese-sea", "sea-curries", "coconut-curry", "Coconut", 1),
  style("mediterranean", "med-bowls", "chicken-med-bowl", "Chicken", 1), style("mediterranean", "med-wraps", "chickpea-wrap", "Chickpea", 1), style("mediterranean", "med-plates", "tuna-white-bean", "Tuna & Bean", 1),
  style("indian", "curries", "chicken-curry-indian", "Chicken", 1), style("indian", "curries", "chickpea-curry", "Chickpea", 2), style("indian", "indian-rice", "spiced-rice", "Spiced Rice", 1),
] as const;

type RecipeSeed = Omit<ChefRecipe, "id" | "shortDescription" | "timeMinutes" | "difficulty" | "mealTypes" | "tags" | "ingredients" | "baseIngredients" | "steps" | "groceryKeywords"> & Partial<Pick<ChefRecipe, "shortDescription" | "timeMinutes" | "difficulty" | "mealTypes" | "tags" | "steps" | "optionGroupIds" | "defaultSelectedOptions" | "nameTemplate" | "allowOptionLabelInName">> & { ingredients: string[] };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CHEF_INGREDIENT_DEFINITIONS: Record<string, { foodKey: string; icon: string; quantity?: number; unit?: string; aliases?: string[] }> = {
  "flour tortilla": { foodKey: "tortilla-flour", icon: "🌯", unit: "each", aliases: ["flour tortillas", "tortillas", "wrap"] },
  "flour tortillas": { foodKey: "tortilla-flour", icon: "🌯", quantity: 2, unit: "each", aliases: ["flour tortilla", "tortillas", "wrap"] },
  "corn tortillas": { foodKey: "tortilla-corn", icon: "🌮", quantity: 3, unit: "each", aliases: ["corn tortilla", "tortillas"] },
  "taco shells": { foodKey: "taco-shell", icon: "🌮", quantity: 3, unit: "each", aliases: ["hard taco shells"] },
  chicken: { foodKey: "chicken-breast", icon: "🍗", quantity: 4, unit: "oz", aliases: ["chicken breast", "cooked chicken"] },
  "cooked chicken": { foodKey: "chicken-breast", icon: "🍗", quantity: 4, unit: "oz", aliases: ["chicken", "chicken breast"] },
  "chicken breast": { foodKey: "chicken-breast", icon: "🍗", quantity: 4, unit: "oz", aliases: ["chicken", "cooked chicken"] },
  "ground beef": { foodKey: "ground-beef", icon: "🥩", quantity: 4, unit: "oz", aliases: ["minced beef", "hamburger meat"] },
  "lean beef": { foodKey: "steak", icon: "🥩", quantity: 4, unit: "oz", aliases: ["beef", "steak"] },
  rice: { foodKey: "rice-white", icon: "🍚", unit: "cup", aliases: ["white rice", "cooked rice"] },
  "cooked rice": { foodKey: "rice-white", icon: "🍚", unit: "cup", aliases: ["rice", "white rice"] },
  eggs: { foodKey: "egg", icon: "🥚", quantity: 2, unit: "each", aliases: ["egg"] },
  egg: { foodKey: "egg", icon: "🥚", unit: "each", aliases: ["eggs"] },
  "shredded cheese": { foodKey: "cheddar-cheese", icon: "🧀", quantity: 0.25, unit: "cup", aliases: ["cheddar", "shredded cheddar"] },
  cheddar: { foodKey: "cheddar-cheese", icon: "🧀", quantity: 1, unit: "oz", aliases: ["cheddar cheese", "shredded cheddar"] },
  cheese: { foodKey: "cheddar-cheese", icon: "🧀", quantity: 1, unit: "oz", aliases: ["cheddar cheese"] },
  pasta: { foodKey: "pasta", icon: "🍝", quantity: 2, unit: "oz", aliases: ["noodles"] },
  spaghetti: { foodKey: "pasta", icon: "🍝", quantity: 2, unit: "oz", aliases: ["pasta", "spaghetti noodles"] },
  fettuccine: { foodKey: "pasta", icon: "🍝", quantity: 2, unit: "oz", aliases: ["pasta", "fettuccine noodles"] },
  bread: { foodKey: "bread", icon: "🍞", quantity: 2, unit: "slice", aliases: ["sandwich bread"] },
  oats: { foodKey: "oats", icon: "🥣", quantity: 0.5, unit: "cup", aliases: ["oatmeal", "rolled oats"] },
  "Greek yogurt": { foodKey: "greek-yogurt", icon: "🥣", quantity: 1, unit: "cup", aliases: ["greek yogurt", "yogurt"] },
  "canned tuna": { foodKey: "tuna", icon: "🐟", quantity: 1, unit: "can", aliases: ["tuna", "tuna fish"] },
  milk: { foodKey: "milk", icon: "🥛", unit: "cup", aliases: ["dairy milk"] },
  "peanut butter": { foodKey: "peanut-butter", icon: "🥜", quantity: 2, unit: "tbsp", aliases: ["peanut spread"] },
  banana: { foodKey: "banana", icon: "🍌", unit: "each", aliases: ["bananas"] },
  salsa: { foodKey: "salsa", icon: "🍅", quantity: 0.25, unit: "cup", aliases: ["tomato salsa"] },
  "sour cream": { foodKey: "sour-cream", icon: "🥛", quantity: 2, unit: "tbsp" },
  "olive oil": { foodKey: "olive-oil", icon: "🫒", quantity: 1, unit: "tbsp" },
  butter: { foodKey: "butter", icon: "🧈", quantity: 1, unit: "tbsp" },
  "black beans": { foodKey: "black-beans", icon: "🫘", quantity: 0.5, unit: "cup", aliases: ["black bean"] },
  "refried beans": { foodKey: "pinto-beans", icon: "🫘", quantity: 0.5, unit: "cup", aliases: ["pinto beans"] },
  potatoes: { foodKey: "potato", icon: "🥔", quantity: 1, unit: "each", aliases: ["potato"] },
  potato: { foodKey: "potato", icon: "🥔", quantity: 1, unit: "each", aliases: ["potatoes"] },
  "russet potato": { foodKey: "potato", icon: "🥔", quantity: 1, unit: "each", aliases: ["potato", "russet potatoes"] },
};

function makeIngredient(name: string, index: number): ChefRecipeIngredient {
  const definition = CHEF_INGREDIENT_DEFINITIONS[name] ?? { foodKey: slug(name), icon: "🍽️" };
  return { id: `${definition.foodKey}-${index + 1}`, foodKey: definition.foodKey, icon: definition.icon, name, quantity: definition.quantity ?? 1, unit: definition.unit ?? "serving", ...(definition.aliases ? { aliases: definition.aliases } : {}) };
}
const slotCandidate = (id: string, label: string, name: string, extra: Partial<ChefDishSlotCandidate> = {}): ChefDishSlotCandidate => ({ id, label, ingredient: { ...makeIngredient(name, 0), id: `slot-${id}` }, ...extra });
const dishSlot = (id: string, label: string, role: ChefDishSlotRole, candidates: ChefDishSlotCandidate[], extra: Partial<ChefDishTemplateSlot> = {}): ChefDishTemplateSlot => ({ id, label, role, minimumSelections: role === "structural" ? 1 : 0, maximumSelections: 1, blocksAvailability: role === "structural", includeInSummary: true, candidates, ...extra });
const dishTemplate = (templateId: string, permanentTitle: string, slots: ChefDishTemplateSlot[], stepTemplates: string[], anchorSlotIds?: string[]): ChefDishTemplate => ({ templateId, permanentTitle, displayNameMode: "permanent", slots, stepTemplates, ...(anchorSlotIds ? { anchorSlotIds } : {}) });
const makeRecipe = (seed: RecipeSeed): ChefRecipe => ({
  id: slug(seed.name), shortDescription: `A simple, everyday ${seed.name.toLowerCase()}.`, timeMinutes: 20, difficulty: "easy", mealTypes: ["lunch", "dinner"], tags: ["quick", "low-effort"],
  ...seed,
  ingredients: seed.ingredients.map(makeIngredient),
  steps: seed.steps ?? ["Gather and prep the ingredients.", "Cook the main ingredients until hot and done.", "Assemble, season to taste, and serve."],
  groceryKeywords: seed.ingredients.map((name) => name.toLowerCase()),
});
const r = (name: string, cuisineId: string, dishFamilyId: string, ingredients: string[], options: Partial<RecipeSeed> = {}) => makeRecipe({ name, cuisineId, dishFamilyId, ingredients, ...options });

const option = (id: string, label: string, ingredients: string[], extra: Partial<ChefRecipeOption> = {}): ChefRecipeOption => ({
  id, label, ingredients: ingredients.map((name, index) => ({ ...makeIngredient(name, index), id: `option-${id}-${index + 1}` })), ...extra,
});
const group = (id: string, cuisineId: string, dishFamilyIds: string[], label: string, kind: ChefRecipeOptionKind, defaultOptionId: string, options: ChefRecipeOption[]): ChefRecipeOptionGroup => ({ id, cuisineId, dishFamilyIds, label, kind, selectionMode: "single", defaultOptionId, options });

export const chefRecipeOptionGroups: readonly ChefRecipeOptionGroup[] = [
  group("mexican-taco-filling", "mexican", ["tacos"], "Filling", "filling", "pollo", [option("asada", "Asada", ["lean beef"]), option("pollo", "Pollo", ["cooked chicken"]), option("pastor", "Pastor", ["pork"]), option("carnitas", "Carnitas", ["pulled pork"]), option("ground-beef", "Ground Beef", ["ground beef"]), option("bean", "Bean", ["black beans"]), option("fish", "Fish", ["white fish"])]),
  group("mexican-burrito-filling", "mexican", ["burritos"], "Filling", "filling", "pollo", [option("asada", "Asada", ["lean beef"]), option("pollo", "Pollo", ["cooked chicken"]), option("pastor", "Pastor", ["pork"]), option("breakfast", "Breakfast", ["eggs", "potato"]), option("bean-cheese", "Bean & Cheese", ["refried beans", "shredded cheese"]), option("ground-beef", "Ground Beef", ["ground beef"])]),
  group("mexican-quesadilla-filling", "mexican", ["quesadillas"], "Filling", "filling", "cheese", [option("cheese", "Cheese", []), option("pollo", "Pollo", ["cooked chicken"]), option("beef", "Beef", ["ground beef"]), option("breakfast", "Breakfast", ["eggs", "potato"])]),
  group("mexican-bowl-protein", "mexican", ["bowls"], "Protein", "protein", "chicken", [option("chicken", "Chicken", ["cooked chicken"]), option("beef", "Beef", ["ground beef"]), option("asada", "Asada", ["lean beef"]), option("beans", "Beans", ["black beans"]), option("carnitas", "Carnitas", ["pulled pork"])]),
  group("italian-pasta-style", "italian", ["pasta-red", "pasta-creamy", "pasta-simple"], "Sauce / style", "sauce", "marinara", [option("marinara", "Marinara", ["marinara"]), option("meat-sauce", "Meat Sauce", ["marinara", "ground beef"]), option("alfredo", "Alfredo", ["alfredo sauce"]), option("chicken", "Chicken", ["cooked chicken", "alfredo sauce"]), option("tuna", "Tuna", ["canned tuna", "mayonnaise"]), option("garlic-butter", "Garlic Butter", ["butter", "garlic"])]),
  group("rice-bowl-protein", "rice-bowls", ["protein-bowls", "quick-bowls"], "Build", "protein", "chicken", [option("chicken", "Chicken", ["cooked chicken"]), option("beef", "Beef", ["ground beef"]), option("egg", "Egg", ["eggs"]), option("tuna", "Tuna", ["canned tuna"]), option("beans", "Beans", ["black beans"]), option("teriyaki-chicken", "Teriyaki Chicken", ["cooked chicken", "teriyaki sauce"])]),
  group("wrap-filling", "sandwiches", ["wraps"], "Filling", "filling", "chicken", [option("chicken", "Chicken", ["cooked chicken"]), option("turkey", "Turkey", ["turkey"]), option("tuna", "Tuna", ["canned tuna"]), option("beans", "Beans", ["black beans"]), option("egg", "Egg", ["eggs"])]),
  group("sandwich-filling", "sandwiches", ["sandwiches"], "Filling", "filling", "tuna", [option("tuna", "Tuna", ["canned tuna"]), option("turkey", "Turkey", ["turkey"]), option("chicken", "Chicken", ["cooked chicken"]), option("egg", "Egg", ["eggs"]), option("peanut-butter", "Peanut Butter", ["peanut butter"])]),
] as const;

const shells = [slotCandidate("flour-tortilla", "Flour tortilla", "flour tortillas", { preferred: true, contextualAliases: ["soft taco flour tortillas"] }), slotCandidate("corn-tortilla", "Corn tortilla", "corn tortillas")];
const proteins = [
  slotCandidate("ground-beef", "Ground beef", "ground beef"), slotCandidate("chicken", "Chicken", "cooked chicken", { preferred: true }), slotCandidate("steak", "Steak", "lean beef"),
  slotCandidate("pork", "Pork", "pork"), slotCandidate("white-fish", "White fish", "white fish"), slotCandidate("salmon", "Salmon", "salmon"), slotCandidate("shrimp", "Shrimp", "shrimp"),
  slotCandidate("tuna", "Tuna", "canned tuna", { contextualAliases: ["chunk light tuna", "tuna in water"] }), slotCandidate("beans", "Beans", "black beans"), slotCandidate("eggs", "Eggs", "eggs"), slotCandidate("cheese", "Cheese", "shredded cheese"),
];
const extras = (names: string[]) => names.map((name) => slotCandidate(slug(name), name.replace(/\b\w/g, (letter) => letter.toUpperCase()), name));
const tacoTemplate = dishTemplate("dish-tacos", "Tacos", [
  dishSlot("shell", "Tortillas", "structural", shells), dishSlot("filling", "Filling", "structural", proteins),
  dishSlot("add-ons", "Add-ons", "recommended", extras(["shredded cheese", "lettuce", "tomato", "onion", "salsa", "hot sauce", "sour cream", "guacamole", "taco seasoning", "lime", "cilantro"]), { maximumSelections: 11 }),
], ["Warm the selected {shell}.", "Cook or prepare {filling} and season to taste.", "Fill the shells and finish with the selected {add-ons}."], ["shell", "filling"]);
const burritoTemplate = dishTemplate("dish-burrito", "Burritos", [
  dishSlot("base", "Tortilla / wrap", "structural", [slotCandidate("large-tortilla", "Large tortilla", "flour tortilla", { contextualAliases: ["burrito tortilla", "large wrap"] })]),
  dishSlot("filling", "Filling", "structural", [...proteins.filter((item) => ["ground-beef", "chicken", "steak", "pork", "tuna", "beans", "eggs", "cheese"].includes(item.id)), slotCandidate("rice", "Rice", "rice")]),
  dishSlot("add-ons", "Add-ons", "recommended", extras(["rice", "black beans", "shredded cheese", "salsa", "sour cream", "mixed vegetables", "taco seasoning", "hot sauce", "guacamole"]), { maximumSelections: 9 }),
], ["Warm {base} until flexible.", "Prepare {filling} and any selected {add-ons}.", "Fill, fold, and serve the burrito."], ["base", "filling"]);
const quesadillaTemplate = dishTemplate("dish-quesadilla", "Quesadillas", [
  dishSlot("tortilla", "Tortilla", "structural", shells), dishSlot("cheese", "Melting cheese", "structural", [slotCandidate("cheddar", "Cheddar", "shredded cheese"), slotCandidate("mozzarella", "Mozzarella", "mozzarella")]),
  dishSlot("filling", "Optional filling", "optional", proteins.filter((item) => ["chicken", "ground-beef", "pork", "beans", "tuna", "eggs"].includes(item.id)).concat(extras(["mixed vegetables"])), { maximumSelections: 3 }),
  dishSlot("extras", "Extras", "recommended", extras(["salsa", "sour cream", "hot sauce", "taco seasoning"]), { maximumSelections: 4 }),
], ["Layer {cheese} and the selected {filling} on {tortilla}.", "Cook until crisp and the cheese has melted.", "Slice and serve with the selected {extras}."], ["tortilla", "cheese"]);
const riceBowlTemplate = dishTemplate("dish-rice-bowl", "Rice Bowls", [
  dishSlot("base", "Bowl base", "structural", [slotCandidate("rice", "Rice", "rice", { preferred: true }), slotCandidate("quinoa", "Quinoa", "quinoa")]),
  dishSlot("topping", "Topping / filling", "structural", proteins.filter((item) => !["steak", "salmon", "cheese"].includes(item.id)).concat(extras(["mixed vegetables"]))),
  dishSlot("extras", "Extras", "recommended", extras(["shredded cheese", "mixed vegetables", "salsa", "soy sauce", "hot sauce", "seasoning", "cilantro"]), { maximumSelections: 7 }),
], ["Prepare {base}.", "Cook or warm {topping}.", "Assemble the bowl and finish with {extras}."], ["base", "topping"]);
const sandwichTemplate = dishTemplate("dish-sandwich-wrap", "Sandwiches / Wraps", [
  dishSlot("base", "Bread / wrap", "structural", [slotCandidate("bread", "Bread", "bread"), slotCandidate("bun", "Bun", "burger bun"), slotCandidate("wrap", "Wrap", "flour tortilla")]),
  dishSlot("filling", "Filling", "structural", [slotCandidate("deli-meat", "Deli meat", "turkey"), ...proteins.filter((item) => ["chicken", "tuna", "eggs", "cheese", "beans"].includes(item.id)), slotCandidate("burger-patty", "Burger patty", "burger patty"), slotCandidate("peanut-butter", "Peanut butter", "peanut butter")]),
  dishSlot("extras", "Condiments / vegetables", "recommended", extras(["mayonnaise", "mustard", "lettuce", "tomato", "onion", "pickles"]), { maximumSelections: 6 }),
], ["Prepare {base}.", "Add {filling} and the selected {extras}.", "Close, slice if desired, and serve."], ["base", "filling"]);
const pastaTemplate = dishTemplate("dish-pasta", "Pasta", [
  dishSlot("pasta", "Pasta", "structural", [slotCandidate("pasta", "Pasta", "pasta")]),
  dishSlot("finish", "Sauce / finish", "structural", [slotCandidate("marinara", "Marinara", "marinara"), slotCandidate("alfredo", "Alfredo", "alfredo sauce"), slotCandidate("pesto", "Pesto", "pesto"), slotCandidate("butter", "Butter", "butter"), slotCandidate("olive-oil", "Olive oil", "olive oil"), slotCandidate("cheese", "Cheese", "parmesan")]),
  dishSlot("add-ins", "Add-ins", "recommended", [...proteins.filter((item) => ["ground-beef", "chicken", "tuna"].includes(item.id)), ...extras(["mixed vegetables", "garlic", "seasoning", "parsley"])], { maximumSelections: 7 }),
], ["Cook {pasta} until tender.", "Toss with {finish}.", "Fold in the selected {add-ins}, season, and serve."], ["pasta"]);

const templateRecipe = (name: string, cuisineId: string, dishFamilyId: string, template: ChefDishTemplate, tags: string[]) => r(name, cuisineId, dishFamilyId, [], { dishTemplate: template, tags, steps: template.stepTemplates });

export const chefRecipes: readonly ChefRecipe[] = [
  templateRecipe("Burritos", "mexican", "burritos", burritoTemplate, ["quick", "high-protein", "bulk"]),
  templateRecipe("Tacos", "mexican", "tacos", tacoTemplate, ["quick", "high-protein", "cheap"]),
  templateRecipe("Quesadillas", "mexican", "quesadillas", quesadillaTemplate, ["quick", "cheap", "low-effort"]),
  r("Burrito bowl", "mexican", "bowls", ["rice", "black beans", "salsa"], { optionGroupIds: ["mexican-bowl-protein"], nameTemplate: "{protein} burrito bowl", allowOptionLabelInName: true, tags: ["bulk", "high-protein"] }),
  r("Beef nachos", "mexican", "nachos", ["tortilla chips", "ground beef", "shredded cheese", "salsa"], { styleId: "nachos-beef", mealTypes: ["snack", "dinner"], tags: ["comfort", "snack"] }),
  r("Chicken fajita plate", "mexican", "plates", ["chicken", "bell peppers", "onion", "rice"], { styleId: "fajita-plate", tags: ["high-protein", "meal-prep"] }),
  templateRecipe("Pasta", "italian", "pasta-simple", pastaTemplate, ["comfort", "quick", "pantry"]),
  r("Burger bowl", "american", "burgers", ["ground beef", "lettuce", "cheddar", "pickles"], { styleId: "beef-burger", tags: ["high-protein", "comfort"] }),
  r("Cheeseburger", "american", "burgers", ["burger bun", "ground beef", "cheddar"], { styleId: "beef-burger", tags: ["comfort", "quick"] }),
  r("Grilled cheese", "american", "classics", ["bread", "cheddar", "butter"], { styleId: "cheesy", tags: ["cheap", "comfort"] }),
  r("Chili", "american", "classics", ["ground beef", "kidney beans", "diced tomatoes", "chili seasoning"], { styleId: "one-pot", timeMinutes: 35, difficulty: "medium", tags: ["bulk", "comfort", "meal-prep"] }),
  r("Loaded baked potato", "american", "classics", ["russet potato", "shredded cheese", "sour cream"], { tags: ["cheap", "comfort"] }),
  r("Chicken, rice, and vegetables", "american", "meal-prep", ["chicken breast", "rice", "mixed vegetables"], { tags: ["high-protein", "bulk", "meal-prep"] }),
  r("Beef, potatoes, and vegetables", "american", "meal-prep", ["lean beef", "potatoes", "mixed vegetables"], { tags: ["high-protein", "bulk", "meal-prep"] }),
  r("Eggs and toast", "breakfast", "hot-breakfast", ["eggs", "bread", "butter"], { styleId: "eggs", mealTypes: ["breakfast"], tags: ["quick", "cheap"] }),
  r("Oatmeal bowl", "breakfast", "breakfast-bowls", ["oats", "milk", "banana"], { styleId: "oats", mealTypes: ["breakfast"], tags: ["cheap", "pantry"] }),
  r("Yogurt granola bowl", "breakfast", "breakfast-bowls", ["Greek yogurt", "granola", "berries"], { styleId: "yogurt", mealTypes: ["breakfast", "snack"], tags: ["high-protein", "quick"] }),
  r("Breakfast sandwich", "breakfast", "handheld", ["English muffin", "egg", "cheddar", "ham"], { mealTypes: ["breakfast"], tags: ["quick", "meal-prep"] }),
  r("Protein smoothie", "breakfast", "drinks", ["protein powder", "milk", "banana", "peanut butter"], { mealTypes: ["breakfast", "snack"], tags: ["high-protein", "quick"] }),
  r("Greek yogurt protein bowl", "breakfast", "breakfast-bowls", ["Greek yogurt", "protein powder", "berries"], { styleId: "yogurt", mealTypes: ["breakfast", "snack"], tags: ["high-protein", "snack"] }),
  r("Cottage cheese fruit bowl", "breakfast", "breakfast-bowls", ["cottage cheese", "fruit", "honey"], { mealTypes: ["breakfast", "snack"], tags: ["snack", "high-protein", "low-effort"] }),
  templateRecipe("Sandwiches / Wraps", "sandwiches", "sandwiches", sandwichTemplate, ["quick", "cheap", "high-protein"]),
  r("Peanut butter banana toast", "sandwiches", "toast", ["bread", "peanut butter", "banana"], { mealTypes: ["breakfast", "snack"], tags: ["cheap", "snack", "quick"] }),
  r("Chicken salad bowl", "sandwiches", "wraps", ["cooked chicken", "salad greens", "dressing"], { tags: ["high-protein", "low-effort"] }),
  templateRecipe("Rice Bowls", "rice-bowls", "protein-bowls", riceBowlTemplate, ["high-protein", "bulk", "meal-prep"]),
  r("Egg fried rice", "chinese", "fried-rice", ["cooked rice", "eggs", "frozen peas", "soy sauce"], { styleId: "egg-fried-rice", tags: ["cheap", "quick", "pantry"] }),
  r("Ramen upgrade", "chinese", "noodles", ["instant ramen", "egg", "frozen vegetables"], { styleId: "ramen", tags: ["cheap", "quick", "pantry"] }),
  r("Chicken vegetable stir-fry", "chinese", "stir-fries", ["chicken", "frozen stir-fry vegetables", "soy sauce", "rice"], { styleId: "chicken-stir-fry", tags: ["high-protein", "quick"] }),
  r("Teriyaki chicken donburi", "japanese", "donburi", ["chicken", "rice", "teriyaki sauce", "scallions"], { styleId: "teriyaki", tags: ["high-protein", "meal-prep"] }),
  r("Quick chicken udon", "japanese", "japanese-noodles", ["udon noodles", "chicken", "frozen vegetables", "soy sauce"], { styleId: "udon", tags: ["quick", "comfort"] }),
  r("Japanese curry rice", "japanese", "curry", ["curry roux", "chicken", "potato", "rice"], { styleId: "chicken-curry", timeMinutes: 35, difficulty: "medium", tags: ["comfort", "bulk"] }),
  r("Ground beef bibimbap bowl", "korean", "korean-bowls", ["ground beef", "rice", "egg", "mixed vegetables"], { styleId: "beef-bibimbap", tags: ["high-protein", "comfort"] }),
  r("Spicy sesame noodles", "korean", "korean-noodles", ["noodles", "sesame oil", "gochujang", "egg"], { styleId: "sesame-noodles", tags: ["quick", "pantry"] }),
  r("Chicken rice noodle bowl", "vietnamese-sea", "noodle-bowls", ["rice noodles", "chicken", "cucumber", "lime"], { styleId: "rice-noodles", tags: ["high-protein", "quick"] }),
  r("Coconut chickpea curry", "vietnamese-sea", "sea-curries", ["chickpeas", "coconut milk", "curry paste", "rice"], { styleId: "coconut-curry", tags: ["pantry", "bulk"] }),
  r("Mediterranean chicken bowl", "mediterranean", "med-bowls", ["chicken", "rice", "cucumber", "hummus"], { styleId: "chicken-med-bowl", tags: ["high-protein", "meal-prep"] }),
  r("Chickpea hummus wrap", "mediterranean", "med-wraps", ["flour tortilla", "chickpeas", "hummus", "greens"], { styleId: "chickpea-wrap", tags: ["cheap", "quick"] }),
  r("Tuna white bean plate", "mediterranean", "med-plates", ["canned tuna", "white beans", "olive oil", "lemon"], { styleId: "tuna-white-bean", tags: ["high-protein", "pantry", "low-effort"] }),
  r("Easy chicken curry", "indian", "curries", ["chicken", "curry powder", "diced tomatoes", "rice"], { styleId: "chicken-curry-indian", tags: ["high-protein", "bulk"] }),
  r("Chana masala", "indian", "curries", ["chickpeas", "diced tomatoes", "garam masala", "rice"], { styleId: "chickpea-curry", tags: ["cheap", "pantry", "bulk"] }),
  r("Egg masala rice", "indian", "indian-rice", ["rice", "eggs", "curry powder", "frozen peas"], { styleId: "spiced-rice", tags: ["cheap", "pantry", "quick"] }),
  r("Chips and salsa plate", "mexican", "nachos", ["tortilla chips", "salsa"], { mealTypes: ["snack"], tags: ["snack", "quick", "low-effort"], timeMinutes: 5 }),
] as const;

export function getChefCuisinesWithCounts() {
  return chefCuisines.map((cuisine) => ({ ...cuisine, recipeCount: chefRecipes.filter((recipe) => recipe.cuisineId === cuisine.id).length })).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getChefDishFamiliesForCuisine(cuisineId: string) {
  return chefDishFamilies.filter((item) => item.cuisineId === cuisineId).map((item) => ({ ...item, recipeCount: chefRecipes.filter((recipe) => recipe.cuisineId === cuisineId && recipe.dishFamilyId === item.id).length })).filter((item) => item.recipeCount > 0).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getChefStylesForDishFamily(cuisineId: string, dishFamilyId: string) {
  return chefStyles.filter((item) => item.cuisineId === cuisineId && item.dishFamilyId === dishFamilyId).filter((item) => chefRecipes.some((recipe) => recipe.cuisineId === cuisineId && recipe.dishFamilyId === dishFamilyId && recipe.styleId === item.id)).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getChefOptionGroupsForDishFamily(cuisineId: string, dishFamilyId: string) {
  const usedGroupIds = new Set(chefRecipes.filter((recipe) => recipe.cuisineId === cuisineId && recipe.dishFamilyId === dishFamilyId).flatMap((recipe) => recipe.optionGroupIds ?? []));
  return chefRecipeOptionGroups.filter((item) => item.cuisineId === cuisineId && item.dishFamilyIds.includes(dishFamilyId) && usedGroupIds.has(item.id));
}

function getAvailableChefOptions(group: ChefRecipeOptionGroup, recipe: ChefRecipe) {
  return group.options.filter((item) => !item.unavailableForRecipeIds?.includes(recipe.id) && (!item.onlyForRecipeIds || item.onlyForRecipeIds.includes(recipe.id)));
}

export function getDefaultChefRecipeOptions(recipe: ChefRecipe): Record<string, string> {
  return (recipe.optionGroupIds ?? []).reduce<Record<string, string>>((selected, groupId) => {
    const group = chefRecipeOptionGroups.find((item) => item.id === groupId);
    if (!group) return selected;
    const available = getAvailableChefOptions(group, recipe);
    const requested = recipe.defaultSelectedOptions?.[groupId] ?? group.defaultOptionId;
    const chosen = available.find((item) => item.id === requested) ?? available[0];
    if (chosen) selected[groupId] = chosen.id;
    return selected;
  }, {});
}

export function resolveChefRecipeIngredients(recipe: ChefRecipe, selectedOptions: ChefRecipeSelectedOptions = {}): ChefRecipeIngredient[] {
  const defaults = getDefaultChefRecipeOptions(recipe);
  const additions = (recipe.optionGroupIds ?? []).flatMap((groupId) => {
    const group = chefRecipeOptionGroups.find((item) => item.id === groupId);
    if (!group) return [];
    const available = getAvailableChefOptions(group, recipe);
    const selectedId = selectedOptions[groupId] ?? defaults[groupId];
    return (available.find((item) => item.id === selectedId) ?? available[0])?.ingredients ?? [];
  });
  return [...(recipe.baseIngredients ?? recipe.ingredients), ...additions].map((ingredient) => ({ ...ingredient, aliases: ingredient.aliases ? [...ingredient.aliases] : undefined }));
}

export function resolveChefRecipeName(recipe: ChefRecipe, selectedOptions: ChefRecipeSelectedOptions = {}): string {
  if (!recipe.allowOptionLabelInName) return recipe.name;
  const defaults = getDefaultChefRecipeOptions(recipe);
  let name = recipe.nameTemplate ?? recipe.name;
  for (const groupId of recipe.optionGroupIds ?? []) {
    const group = chefRecipeOptionGroups.find((item) => item.id === groupId);
    const selectedId = selectedOptions[groupId] ?? defaults[groupId];
    const selected = group?.options.find((item) => item.id === selectedId);
    if (group && selected) name = name.replaceAll(`{${group.kind}}`, selected.label).replaceAll(`{${group.label.toLowerCase()}}`, selected.label);
  }
  return name;
}

export function getChefRecipesForNode({ cuisineId, dishFamilyId, styleId, tags }: { cuisineId: string; dishFamilyId?: string; styleId?: string; tags?: readonly string[] }) {
  return chefRecipes.filter((recipe) => recipe.cuisineId === cuisineId && (!dishFamilyId || recipe.dishFamilyId === dishFamilyId) && (!styleId || recipe.styleId === styleId) && (!tags?.length || tags.every((tag) => recipe.tags.includes(tag))));
}
