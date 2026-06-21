import type { Json } from "@/types/supabase";

export type FoodIcon = {
  assetPath: string | null;
  fallbackEmoji: string | null;
  label: string;
};

type FoodIconInput = {
  name?: string | null;
  normalized_name?: string | null;
  metadata?: Json | null;
};

type FoodIconDefinition = {
  assetName: string | null;
  emoji: string | null;
  label: string;
};

const FLUENT_FOOD_ICON_BASE_PATH = "/food-icons/fluent";

const FOOD_ICON_DEFINITIONS = {
  apple: { assetName: "red_apple_3d.png", emoji: "🍎", label: "Red apple" },
  avocado: { assetName: "avocado_3d.png", emoji: "🥑", label: "Avocado" },
  bacon: { assetName: "bacon_3d.png", emoji: "🥓", label: "Bacon" },
  bagel: { assetName: "bagel_3d.png", emoji: "🥯", label: "Bagel" },
  banana: { assetName: "banana_3d.png", emoji: "🍌", label: "Banana" },
  basil: { assetName: "herb_3d.png", emoji: "🌿", label: "Herb" },
  beans: { assetName: "beans_3d.png", emoji: "🫘", label: "Beans" },
  beef: { assetName: "cut_of_meat_3d.png", emoji: "🥩", label: "Cut of meat" },
  bread: { assetName: "bread_3d.png", emoji: "🍞", label: "Bread" },
  broccoli: { assetName: "broccoli_3d.png", emoji: "🥦", label: "Broccoli" },
  carrot: { assetName: "carrot_3d.png", emoji: "🥕", label: "Carrot" },
  cheese: { assetName: "cheese_wedge_3d.png", emoji: "🧀", label: "Cheese wedge" },
  chicken: { assetName: "poultry_leg_3d.png", emoji: "🍗", label: "Poultry leg" },
  cilantro: { assetName: "herb_3d.png", emoji: "🌿", label: "Herb" },
  corn: { assetName: "ear_of_corn_3d.png", emoji: "🌽", label: "Ear of corn" },
  egg: { assetName: "egg_3d.png", emoji: "🥚", label: "Egg" },
  fish: { assetName: "fish_3d.png", emoji: "🐟", label: "Fish" },
  grapes: { assetName: "grapes_3d.png", emoji: "🍇", label: "Grapes" },
  lettuce: { assetName: "leafy_green_3d.png", emoji: "🥬", label: "Leafy green" },
  milk: { assetName: "glass_of_milk_3d.png", emoji: "🥛", label: "Glass of milk" },
  oats: { assetName: "bowl_with_spoon_3d.png", emoji: "🥣", label: "Bowl with spoon" },
  onion: { assetName: "onion_3d.png", emoji: "🧅", label: "Onion" },
  orange: { assetName: "tangerine_3d.png", emoji: "🍊", label: "Tangerine" },
  pasta: { assetName: "spaghetti_3d.png", emoji: "🍝", label: "Spaghetti" },
  peanuts: { assetName: "peanuts_3d.png", emoji: "🥜", label: "Peanuts" },
  pepper: { assetName: "bell_pepper_3d.png", emoji: "🫑", label: "Bell pepper" },
  potato: { assetName: "potato_3d.png", emoji: "🥔", label: "Potato" },
  rice: { assetName: "cooked_rice_3d.png", emoji: "🍚", label: "Cooked rice" },
  shrimp: { assetName: "shrimp_3d.png", emoji: "🦐", label: "Shrimp" },
  spinach: { assetName: "leafy_green_3d.png", emoji: "🥬", label: "Leafy green" },
  strawberry: { assetName: "strawberry_3d.png", emoji: "🍓", label: "Strawberry" },
  tomato: { assetName: "tomato_3d.png", emoji: "🍅", label: "Tomato" },
  tuna: { assetName: "fish_3d.png", emoji: "🐟", label: "Fish" },
  yogurt: { assetName: "custard_3d.png", emoji: "🍮", label: "Yogurt" },
} as const satisfies Record<string, FoodIconDefinition>;

const FOOD_ICON_ALIASES: Record<string, keyof typeof FOOD_ICON_DEFINITIONS> = {
  "2 milk": "milk",
  "almond butter": "peanuts",
  "beef roast": "beef",
  "bell pepper": "pepper",
  "black beans": "beans",
  "brown rice": "rice",
  "canned chicken": "chicken",
  "canned corn": "corn",
  "canned tomatoes": "tomato",
  "canned tuna": "tuna",
  "cashew": "peanuts",
  "cashews": "peanuts",
  "cheddar cheese": "cheese",
  "chicken breast": "chicken",
  "chicken nuggets": "chicken",
  "chicken thigh": "chicken",
  "chickpeas": "beans",
  "chocolate milk": "milk",
  "cooked rice": "rice",
  "cottage cheese": "cheese",
  "cream cheese": "cheese",
  "egg whites": "egg",
  "ground beef": "beef",
  "greek yogurt": "yogurt",
  "macaroni": "pasta",
  "mozzarella cheese": "cheese",
  "parsley": "basil",
  "peanut butter": "peanuts",
  "pinto beans": "beans",
  "ramen noodles": "pasta",
  "red apple": "apple",
  "regular yogurt": "yogurt",
  "romaine lettuce": "lettuce",
  "rotisserie chicken": "chicken",
  "sardines": "fish",
  "skim milk": "milk",
  "spaghetti": "pasta",
  "steak": "beef",
  "string cheese": "cheese",
  "sweet potato": "potato",
  "tangerine": "orange",
  "toast": "bread",
  "vanilla yogurt": "yogurt",
  "wheat bread": "bread",
  "white bread": "bread",
  "white rice": "rice",
  "whole milk": "milk",
};

function normalizeFoodIconKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getRecord(value: Json | null | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function getFoodMetadataIconName(metadata: Json | null | undefined) {
  const metadataRecord = getRecord(metadata);
  const icon = getRecord(metadataRecord?.icon);
  const name = icon?.name;

  return typeof name === "string" ? name : null;
}

function getFoodIconDefinition(key: string) {
  const directKey = key as keyof typeof FOOD_ICON_DEFINITIONS;
  if (directKey in FOOD_ICON_DEFINITIONS) return FOOD_ICON_DEFINITIONS[directKey];

  const aliasKey = FOOD_ICON_ALIASES[key];
  if (aliasKey) return FOOD_ICON_DEFINITIONS[aliasKey];

  const containedAlias = Object.entries(FOOD_ICON_ALIASES).find(([alias]) =>
    key.includes(alias),
  )?.[1];
  if (containedAlias) return FOOD_ICON_DEFINITIONS[containedAlias];

  const containedDefinitionKey = Object.keys(FOOD_ICON_DEFINITIONS).find((definitionKey) =>
    key.includes(definitionKey),
  ) as keyof typeof FOOD_ICON_DEFINITIONS | undefined;

  return containedDefinitionKey ? FOOD_ICON_DEFINITIONS[containedDefinitionKey] : null;
}

export function getFoodIcon(food: FoodIconInput): FoodIcon {
  const metadataIconName = normalizeFoodIconKey(getFoodMetadataIconName(food.metadata));
  const normalizedName = normalizeFoodIconKey(food.normalized_name || food.name);
  const definition =
    getFoodIconDefinition(metadataIconName) ?? getFoodIconDefinition(normalizedName);
  const label = definition?.label ?? titleCase(food.name?.trim() || "Food");

  return {
    assetPath: definition?.assetName
      ? `${FLUENT_FOOD_ICON_BASE_PATH}/${definition.assetName}`
      : null,
    fallbackEmoji: definition?.emoji ?? "🍽️",
    label,
  };
}
