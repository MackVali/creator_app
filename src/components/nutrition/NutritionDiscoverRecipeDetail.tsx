"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, ShoppingBasket, Trash2, X } from "lucide-react";

import type {
  ChefDishSlotCandidate,
  ChefRecipe,
  ChefRecipeIngredient,
} from "@/lib/nutrition/chefRecipes";
import type {
  ChefIngredientAvailability,
  ChefNutritionTotals,
  ChefRecipeAvailability,
  ChefResolvedDishTemplate,
} from "@/lib/nutrition/chefRecipeNutrition";
import {
  calculateChefIngredientNutrition,
  totalIngredientNutrition,
  formatChefNutritionNumber,
} from "@/lib/nutrition/chefRecipeNutrition";
import type { FoodSearchResult } from "@/lib/nutrition/foods";

export type NutritionDiscoverRecipeDetailIngredientReviewItem = {
  ingredient: ChefRecipeIngredient;
  availability: ChefIngredientAvailability | undefined;
  selected: boolean;
};

type NutritionDiscoverRecipeDetailProps = {
  recipe: ChefRecipe;
  resolvedName: string;
  resolvedIngredients: ChefRecipeIngredient[];
  availability: ChefRecipeAvailability;
  resolvedBuild: ChefResolvedDishTemplate | null;
  contextLabel: string;
  selectedChefOptions: Record<string, string>;
  onBack: () => void;
  onChangeSelectedChefOptions: (
    updater: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  onAddToMeal: (input: {
    ingredients: ChefRecipeIngredient[];
    nutrition: ChefNutritionTotals;
  }) => void;
  onAddIngredientsToGroceryList: (
    items: NutritionDiscoverRecipeDetailIngredientReviewItem[],
  ) => Promise<{ addedCount: number; skippedDuplicateCount: number }>;
  onHandFoods: FoodSearchResult[];
};

type TemporaryIngredientDraft = ChefRecipeIngredient & {
  temporary: true;
  source: "on-hand" | "search";
};

type IngredientSurfaceRow =
  | {
      kind: "ingredient";
      key: string;
      title: string;
      ingredient: ChefRecipeIngredient;
      availability: ChefIngredientAvailability | undefined;
      temporary: boolean;
    }
  | {
      kind: "slot";
      key: string;
      slotId: string;
      title: string;
      ingredient: ChefRecipeIngredient;
      availability: ChefIngredientAvailability | undefined;
      candidates: ChefDishSlotCandidate[];
      selectedCandidateIds: string[];
    };

const DEFAULT_TEMPORARY_INGREDIENT_ICON = "🍽️";

function safePositiveNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safeMacroNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeIngredientIdentity(value: string) {
  return normalizeNutritionDiscoverGroceryText(value).toLowerCase();
}

function normalizeComparableText(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

export function combineNutritionDiscoverIngredients(
  baseIngredients: readonly ChefRecipeIngredient[],
  temporaryIngredients: readonly ChefRecipeIngredient[],
) {
  const seen = new Set<string>();
  return [...baseIngredients, ...temporaryIngredients].filter((ingredient) => {
    const key = normalizeIngredientIdentity(ingredient.foodKey || ingredient.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getFoodSearchMetadataFoodKey(food: FoodSearchResult) {
  const metadata = metadataRecord(food.metadata);
  const catalogMetadata = metadataRecord(food.catalog_metadata);
  const candidates = [
    metadata.foodKey,
    metadata.food_key,
    metadata.canonicalKey,
    metadata.canonical_key,
    catalogMetadata.foodKey,
    catalogMetadata.food_key,
    food.normalized_name,
    food.name,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || food.id;
}

export function convertFoodSearchResultToTemporaryChefIngredient(
  food: FoodSearchResult,
  source: TemporaryIngredientDraft["source"],
): TemporaryIngredientDraft {
  const servingQuantity = safePositiveNumber(food.serving_size) ?? 1;
  const servingUnit = food.serving_unit?.trim() || "serving";
  const calories = safeMacroNumber(food.calories);
  const protein = safeMacroNumber(food.protein_g);
  const carbs = safeMacroNumber(food.carbs_g);
  const fat = safeMacroNumber(food.fat_g);
  const idSource = source === "on-hand" ? metadataRecord(food.metadata).foodResourceId ?? food.id : food.id;
  const nutrition = [calories, protein, carbs, fat].some((value) => value !== null)
    ? {
        baseQuantity: servingQuantity,
        baseUnit: servingUnit,
        calories: calories ?? 0,
        protein_g: protein ?? 0,
        carbs_g: carbs ?? 0,
        fat_g: fat ?? 0,
      }
    : undefined;

  return {
    id: `temporary-${source}-${String(idSource)}`,
    foodKey: getFoodSearchMetadataFoodKey(food),
    icon: DEFAULT_TEMPORARY_INGREDIENT_ICON,
    name: food.brand_name ? `${food.name} (${food.brand_name})` : food.name,
    quantity: servingQuantity,
    unit: servingUnit,
    temporary: true,
    source,
    ...(nutrition ? { nutrition } : {}),
  };
}

export function normalizeNutritionDiscoverGroceryText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getNutritionDiscoverDefaultIngredientSelected(
  availability: ChefIngredientAvailability | undefined,
) {
  return (
    availability?.availability === "missing" ||
    availability?.availability === "partial"
  );
}

function ingredientGroceryLabel(ingredient: ChefRecipeIngredient) {
  const quantity =
    Number.isFinite(ingredient.quantity) && ingredient.quantity > 0
      ? `${ingredient.quantity} `
      : "";
  const unit = ingredient.unit.trim() ? `${ingredient.unit.trim()} ` : "";
  return normalizeNutritionDiscoverGroceryText(
    `${quantity}${unit}${ingredient.name}`,
  );
}

function ingredientQuantityLabel(ingredient: ChefRecipeIngredient) {
  const quantity =
    Number.isFinite(ingredient.quantity) && ingredient.quantity > 0
      ? String(ingredient.quantity)
      : "";
  const unit = ingredient.unit.trim();
  return normalizeNutritionDiscoverGroceryText(`${quantity} ${unit}`);
}

function availabilityLabel(
  availability: ChefIngredientAvailability | undefined,
) {
  if (availability?.availability === "have") return "On hand";
  if (availability?.availability === "partial") return "Partial";
  if (availability?.availability === "unknown") return "Unknown";
  return "Missing";
}

function availabilityClassName(label: string) {
  if (label === "On hand") {
    return "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-100/65";
  }
  if (label === "Partial") {
    return "border-amber-200/15 bg-amber-200/[0.07] text-amber-100/65";
  }
  return "border-white/[0.055] bg-black/25 text-white/38";
}

function ingredientSurfaceTitle(label: string, slotId?: string) {
  if (slotId === "add-ons" || slotId === "extras" || slotId === "add-ins") return "Extras";
  if (label === "Tortillas") return "Tortilla";
  if (label.includes(" / ")) return label.split(" / ")[0] ?? label;
  return label;
}

function selectedSlotIds(
  recipeId: string,
  slot: ChefResolvedDishTemplate["slots"][number],
  selectedChefOptions: Record<string, string>,
) {
  return (
    selectedChefOptions[`${recipeId}:${slot.slotId}`] ??
    slot.selected.map((item) => item.id).join(",")
  )
    .split(",")
    .filter(Boolean);
}

function chooseMissingSlotCandidate(recipe: ChefRecipe, slotId: string) {
  const slot = recipe.dishTemplate?.slots.find((item) => item.id === slotId);
  return [...(slot?.candidates ?? [])].sort(
    (a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)),
  )[0];
}

function getFoodSuggestionLabel(food: FoodSearchResult) {
  return food.brand_name ? `${food.name} (${food.brand_name})` : food.name;
}

function candidateMatchesFood(candidate: ChefDishSlotCandidate, food: FoodSearchResult) {
  const foodKey = getFoodSearchMetadataFoodKey(food);
  const names = [
    food.name,
    food.normalized_name,
    food.brand_name,
    foodKey.replace(/-/g, " "),
  ]
    .map(normalizeComparableText)
    .filter(Boolean);
  const candidateTerms = [
    candidate.id,
    candidate.label,
    candidate.ingredient.foodKey,
    candidate.ingredient.name,
    ...(candidate.ingredient.aliases ?? []),
    ...(candidate.foodFamilies ?? []),
    ...(candidate.contextualAliases ?? []),
  ]
    .map(normalizeComparableText)
    .filter((term) => term.length >= 3);
  const candidateKey = normalizeComparableText(candidate.ingredient.foodKey);
  const normalizedFoodKey = normalizeComparableText(foodKey);

  return (
    normalizedFoodKey === candidateKey ||
    candidateTerms.some((term) =>
      names.some((name) => name === term || name.includes(term) || term.includes(name)),
    )
  );
}

export function NutritionDiscoverRecipeDetail({
  recipe,
  resolvedName,
  resolvedIngredients,
  availability,
  resolvedBuild,
  contextLabel,
  selectedChefOptions,
  onBack,
  onChangeSelectedChefOptions,
  onAddToMeal,
  onAddIngredientsToGroceryList,
  onHandFoods,
}: NutritionDiscoverRecipeDetailProps) {
  const [isReviewingIngredients, setIsReviewingIngredients] = useState(false);
  const [isAddingTemporaryIngredient, setIsAddingTemporaryIngredient] = useState(false);
  const [temporaryIngredients, setTemporaryIngredients] = useState<TemporaryIngredientDraft[]>([]);
  const [temporaryFoodQuery, setTemporaryFoodQuery] = useState("");
  const [temporaryFoodResults, setTemporaryFoodResults] = useState<FoodSearchResult[]>([]);
  const [temporaryFoodSearchError, setTemporaryFoodSearchError] = useState<string | null>(null);
  const [isSearchingTemporaryFoods, setIsSearchingTemporaryFoods] = useState(false);
  const [openSlotPickerId, setOpenSlotPickerId] = useState<string | null>(null);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<
    Record<string, boolean>
  >({});
  const [isAddingIngredients, setIsAddingIngredients] = useState(false);
  const [ingredientMessage, setIngredientMessage] = useState<string | null>(null);
  const [ingredientError, setIngredientError] = useState<string | null>(null);

  useEffect(() => {
    setTemporaryIngredients([]);
    setIsAddingTemporaryIngredient(false);
    setOpenSlotPickerId(null);
    setTemporaryFoodQuery("");
    setTemporaryFoodResults([]);
    setTemporaryFoodSearchError(null);
  }, [recipe.id]);

  const combinedIngredients = useMemo(
    () => combineNutritionDiscoverIngredients(resolvedIngredients, temporaryIngredients),
    [resolvedIngredients, temporaryIngredients],
  );
  const combinedNutrition = useMemo(
    () => totalIngredientNutrition(combinedIngredients),
    [combinedIngredients],
  );
  const temporaryIngredientIds = useMemo(
    () => new Set(temporaryIngredients.map((ingredient) => ingredient.id)),
    [temporaryIngredients],
  );
  const combinedAvailability = useMemo(() => {
    const ingredients = {
      ...availability.ingredients,
      ...Object.fromEntries(
        temporaryIngredients.map((ingredient) => [
          ingredient.id,
          {
            availability: ingredient.source === "on-hand" ? "have" : "unknown",
            neededQuantity: ingredient.quantity,
            neededUnit: ingredient.unit,
          } satisfies ChefIngredientAvailability,
        ]),
      ),
    };
    return { ...availability, ingredients };
  }, [availability, temporaryIngredients]);
  const visibleOnHandFoods = useMemo(() => {
    const query = normalizeIngredientIdentity(temporaryFoodQuery);
    const existing = new Set(combinedIngredients.map((ingredient) => normalizeIngredientIdentity(ingredient.name)));
    return onHandFoods
      .filter((food) => !existing.has(normalizeIngredientIdentity(food.name)))
      .filter((food) => !query || normalizeIngredientIdentity(`${food.name} ${food.brand_name ?? ""}`).includes(query))
      .slice(0, 8);
  }, [combinedIngredients, onHandFoods, temporaryFoodQuery]);
  const ingredientSurfaceRows = useMemo<IngredientSurfaceRow[]>(() => {
    if (!resolvedBuild) {
      return combinedIngredients.map((ingredient) => ({
        kind: "ingredient",
        key: ingredient.id,
        title: ingredient.name,
        ingredient,
        availability: combinedAvailability.ingredients[ingredient.id],
        temporary: temporaryIngredientIds.has(ingredient.id),
      }));
    }

    const rows: IngredientSurfaceRow[] = [];
    resolvedBuild.slots.forEach((slot) => {
      const selectedIds = selectedSlotIds(recipe.id, slot, selectedChefOptions);
      const selectedCandidates = slot.selected.length > 0
        ? slot.selected
        : slot.missing
          ? [chooseMissingSlotCandidate(recipe, slot.slotId)].filter(
              (candidate): candidate is ChefDishSlotCandidate => Boolean(candidate),
            )
          : [];

      selectedCandidates.forEach((candidate) => {
        const ingredient = {
          ...candidate.ingredient,
          id: `${slot.slotId}-${candidate.id}`,
          optional: slot.role !== "structural",
        };
        rows.push({
          kind: "slot",
          key: `${slot.slotId}-${candidate.id}`,
          slotId: slot.slotId,
          title: ingredientSurfaceTitle(slot.label, slot.slotId),
          ingredient,
          availability: slot.missing
            ? {
                availability: "missing",
                neededQuantity: ingredient.quantity,
                neededUnit: ingredient.unit,
              }
            : combinedAvailability.ingredients[ingredient.id],
          candidates: slot.availableCandidates,
          selectedCandidateIds: selectedIds,
        });
      });
    });

    temporaryIngredients.forEach((ingredient) => {
      rows.push({
        kind: "ingredient",
        key: ingredient.id,
        title: "Added",
        ingredient,
        availability: combinedAvailability.ingredients[ingredient.id],
        temporary: true,
      });
    });

    return rows;
  }, [
    combinedAvailability.ingredients,
    combinedIngredients,
    recipe,
    resolvedBuild,
    selectedChefOptions,
    temporaryIngredientIds,
    temporaryIngredients,
  ]);
  const suggestedOnHandFoods = useMemo(() => {
    if (!resolvedBuild) return [];

    const existing = new Set(
      combinedIngredients.flatMap((ingredient) => [
        normalizeIngredientIdentity(ingredient.foodKey || ingredient.name),
        normalizeIngredientIdentity(ingredient.name),
      ]),
    );
    const candidatePool = resolvedBuild.slots
      .filter((slot) => slot.role !== "structural")
      .flatMap((slot) => {
        const selectedIds = new Set(slot.selected.map((candidate) => candidate.id));
        const templateSlot = recipe.dishTemplate?.slots.find((item) => item.id === slot.slotId);
        const candidates = templateSlot?.candidates ?? slot.availableCandidates;
        return candidates.filter((candidate) => !selectedIds.has(candidate.id));
      });

    return onHandFoods
      .filter((food) => {
        const foodKey = getFoodSearchMetadataFoodKey(food);
        return (
          !existing.has(normalizeIngredientIdentity(foodKey)) &&
          !existing.has(normalizeIngredientIdentity(food.name)) &&
          candidatePool.some((candidate) => candidateMatchesFood(candidate, food))
        );
      })
      .slice(0, 5);
  }, [combinedIngredients, onHandFoods, recipe.dishTemplate?.slots, resolvedBuild]);

  useEffect(() => {
    setSelectedIngredientIds(
      Object.fromEntries(
        combinedIngredients.map((ingredient) => [
          ingredient.id,
          getNutritionDiscoverDefaultIngredientSelected(
            combinedAvailability.ingredients[ingredient.id],
          ),
        ]),
      ),
    );
    setIngredientMessage(null);
    setIngredientError(null);
  }, [combinedAvailability.ingredients, combinedIngredients]);

  const reviewItems = useMemo(
    () =>
      combinedIngredients.map((ingredient) => ({
        ingredient,
        availability: combinedAvailability.ingredients[ingredient.id],
        selected: Boolean(selectedIngredientIds[ingredient.id]),
      })),
    [combinedAvailability.ingredients, combinedIngredients, selectedIngredientIds],
  );
  const selectedCount = reviewItems.filter((item) => item.selected).length;

  function addTemporaryIngredient(ingredient: TemporaryIngredientDraft) {
    setTemporaryIngredients((current) => {
      const combined = combineNutritionDiscoverIngredients(resolvedIngredients, current);
      const nextKey = normalizeIngredientIdentity(ingredient.foodKey || ingredient.name);
      if (combined.some((item) => normalizeIngredientIdentity(item.foodKey || item.name) === nextKey)) {
        return current;
      }
      return [...current, ingredient];
    });
  }

  function updateTemporaryIngredientQuantity(ingredientId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setTemporaryIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === ingredientId ? { ...ingredient, quantity } : ingredient,
      ),
    );
  }

  function changeSlotCandidate(
    slot: ChefResolvedDishTemplate["slots"][number],
    candidate: ChefDishSlotCandidate,
  ) {
    const optionKey = `${recipe.id}:${slot.slotId}`;
    onChangeSelectedChefOptions((current) => {
      const currentIds = (
        current[optionKey] ??
        slot.selected.map((item) => item.id).join(",")
      )
        .split(",")
        .filter(Boolean);
      const nextIds =
        slot.role === "structural" ||
        slot.availableCandidates.length === 1
          ? [candidate.id]
          : currentIds.includes(candidate.id)
            ? currentIds.filter((id) => id !== candidate.id)
            : [...currentIds, candidate.id].slice(0, Math.max(1, slot.availableCandidates.length));
      return { ...current, [optionKey]: nextIds.join(",") };
    });
  }

  async function searchTemporaryFoods() {
    const query = temporaryFoodQuery.trim();
    if (!query) {
      setTemporaryFoodResults([]);
      setTemporaryFoodSearchError(null);
      return;
    }
    setIsSearchingTemporaryFoods(true);
    setTemporaryFoodSearchError(null);
    try {
      const params = new URLSearchParams({ q: query, limit: "8" });
      const response = await fetch(`/api/nutrition/foods/search?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json() as { foods?: FoodSearchResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Food search failed.");
      setTemporaryFoodResults(Array.isArray(payload.foods) ? payload.foods : []);
    } catch (error) {
      setTemporaryFoodSearchError(error instanceof Error ? error.message : "Food search failed.");
      setTemporaryFoodResults([]);
    } finally {
      setIsSearchingTemporaryFoods(false);
    }
  }

  async function handleConfirmIngredients() {
    setIsAddingIngredients(true);
    setIngredientError(null);
    setIngredientMessage(null);
    try {
      const result = await onAddIngredientsToGroceryList(
        reviewItems.filter((item) => item.selected),
      );
      const skipped =
        result.skippedDuplicateCount > 0
          ? ` · ${result.skippedDuplicateCount} already listed`
          : "";
      setIngredientMessage(`Added ${result.addedCount} to Grocery List${skipped}`);
    } catch (error) {
      setIngredientError(
        error instanceof Error
          ? error.message
          : "Could not add ingredients to Grocery List.",
      );
    } finally {
      setIsAddingIngredients(false);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-[14px] border border-white/[0.07] bg-black/44">
      <div className="border-b border-white/[0.055] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/48 outline-none transition hover:bg-white/[0.055] hover:text-white/72 focus-visible:ring-1 focus-visible:ring-white/14"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Discover
        </button>
        <div className="mt-2 flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-white/86">
              {resolvedName}
            </h3>
            <p className="mt-0.5 text-[11px] font-medium capitalize text-white/38">
              {recipe.timeMinutes} min · {recipe.difficulty}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.06] bg-black/30 px-2 py-1 text-[9px] font-semibold text-white/52">
            {formatChefNutritionNumber(combinedNutrition.calories)} cal ·{" "}
            {formatChefNutritionNumber(combinedNutrition.protein_g)}g protein
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        {recipe.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.05] bg-black/25 px-2 py-0.5 text-[9px] font-semibold text-white/40"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-white/50">
          {recipe.shortDescription}
        </p>

        <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">
          Ingredients
        </p>
        <ul className="mt-1 divide-y divide-white/[0.055] border-y border-white/[0.055]">
          {ingredientSurfaceRows.map((row) => {
            const ingredient = row.ingredient;
            const itemNutrition = calculateChefIngredientNutrition(ingredient);
            const label = availabilityLabel(row.availability);
            const pickerOpen = row.kind === "slot" && openSlotPickerId === row.slotId;
            const slot = row.kind === "slot"
              ? resolvedBuild?.slots.find((item) => item.slotId === row.slotId)
              : undefined;
            const canChange = row.kind === "slot" && row.candidates.length > 1 && Boolean(slot);
            return (
              <li
                key={`${recipe.id}-${row.key}`}
                className="py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sm" aria-hidden="true">
                    {ingredient.icon}
                  </span>
                  <button
                    type="button"
                    disabled={!canChange}
                    onClick={() =>
                      row.kind === "slot"
                        ? setOpenSlotPickerId((current) => current === row.slotId ? null : row.slotId)
                        : undefined
                    }
                    className="min-w-0 flex-1 text-left outline-none disabled:cursor-default focus-visible:ring-1 focus-visible:ring-white/14"
                  >
                    <span className="block truncate text-[11px] font-bold text-white/74">
                      {row.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-white/38">
                      {ingredient.name}
                      {ingredientQuantityLabel(ingredient)
                        ? ` · ${ingredientQuantityLabel(ingredient)}`
                        : ""}
                      {!itemNutrition.unknownNutrition
                        ? ` · ${formatChefNutritionNumber(itemNutrition.calories)} cal`
                        : ""}
                      {itemNutrition.estimated && !itemNutrition.unknownNutrition ? " · est." : ""}
                    </span>
                  </button>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${availabilityClassName(label)}`}
                  >
                    {label}
                  </span>
                  {canChange ? (
                    <button
                      type="button"
                      aria-label={`Change ${row.title}`}
                      onClick={() =>
                        row.kind === "slot"
                          ? setOpenSlotPickerId((current) => current === row.slotId ? null : row.slotId)
                          : undefined
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/36 hover:bg-white/[0.06] hover:text-white/72"
                    >
                      {pickerOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                  {row.kind === "ingredient" && row.temporary ? (
                    <>
                    <input
                      aria-label={`Quantity for ${ingredient.name}`}
                      type="number"
                      min="0.01"
                      step="0.25"
                      value={ingredient.quantity}
                      onChange={(event) =>
                        updateTemporaryIngredientQuantity(ingredient.id, Number(event.target.value))
                      }
                      className="h-8 w-16 rounded-md border border-white/[0.07] bg-black/30 px-2 text-[11px] font-semibold text-white/68 outline-none focus-visible:ring-1 focus-visible:ring-white/16"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${ingredient.name}`}
                      onClick={() =>
                        setTemporaryIngredients((current) =>
                          current.filter((item) => item.id !== ingredient.id),
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/36 hover:bg-white/[0.06] hover:text-white/72"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    </>
                  ) : null}
                </div>
                {row.kind === "slot" && pickerOpen && slot ? (
                  <div className="ml-7 mt-1.5 flex flex-wrap gap-1">
                    {row.candidates.map((candidate) => {
                      const isSelected = row.selectedCandidateIds.includes(candidate.id);
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => changeSlotCandidate(slot, candidate)}
                          className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${
                            isSelected
                              ? "border-white/[0.16] bg-white/[0.1] text-white/78"
                              : "border-white/[0.05] text-white/38 hover:bg-white/[0.045] hover:text-white/62"
                          }`}
                        >
                          {candidate.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setIsAddingTemporaryIngredient((value) => !value)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.035] px-3 text-xs font-semibold text-white/62 hover:bg-white/[0.07] hover:text-white/82"
          >
            {isAddingTemporaryIngredient ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Add ingredient
          </button>
        </div>

        {isAddingTemporaryIngredient ? (
          <div className="mt-2.5 rounded-xl border border-white/[0.055] bg-white/[0.025] p-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/32">
              From On Hand
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-2">
              <Search className="h-3.5 w-3.5 text-white/30" aria-hidden="true" />
              <input
                value={temporaryFoodQuery}
                onChange={(event) => setTemporaryFoodQuery(event.target.value)}
                placeholder="Search ingredients"
                className="h-9 min-w-0 flex-1 bg-transparent text-xs font-medium text-white/70 outline-none placeholder:text-white/26"
              />
              <button
                type="button"
                disabled={isSearchingTemporaryFoods}
                onClick={() => void searchTemporaryFoods()}
                className="rounded-md px-2 py-1 text-[10px] font-semibold text-white/44 hover:bg-white/[0.055] hover:text-white/70 disabled:opacity-45"
              >
                Search foods
              </button>
            </div>

            <div className="mt-2 space-y-1">
              {visibleOnHandFoods.map((food) => (
                <button
                  key={`on-hand-${food.id}`}
                  type="button"
                  onClick={() =>
                    addTemporaryIngredient(convertFoodSearchResultToTemporaryChefIngredient(food, "on-hand"))
                  }
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-white/[0.04] bg-black/20 px-2 text-left text-[11px] font-semibold text-white/62 hover:bg-white/[0.045] hover:text-white/78"
                >
                  <span className="min-w-0 flex-1 truncate">{food.name}</span>
                  <span className="shrink-0 text-[10px] font-medium text-white/30">
                    {formatChefNutritionNumber(food.calories)} cal
                  </span>
                </button>
              ))}
              {visibleOnHandFoods.length === 0 ? (
                <p className="px-1 py-1 text-[11px] font-medium text-white/34">
                  No On Hand matches.
                </p>
              ) : null}
            </div>

            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-white/32">
              Search foods
            </p>
            <div className="mt-2 space-y-1">
              {temporaryFoodResults.map((food) => (
                <button
                  key={`search-${food.id}`}
                  type="button"
                  onClick={() =>
                    addTemporaryIngredient(convertFoodSearchResultToTemporaryChefIngredient(food, "search"))
                  }
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-white/[0.04] bg-black/20 px-2 text-left text-[11px] font-semibold text-white/62 hover:bg-white/[0.045] hover:text-white/78"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {food.brand_name ? `${food.name} · ${food.brand_name}` : food.name}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium text-white/30">
                    {formatChefNutritionNumber(food.calories)} cal
                  </span>
                </button>
              ))}
              {temporaryFoodSearchError ? (
                <p className="px-1 py-1 text-[11px] font-medium text-rose-100/66">
                  {temporaryFoodSearchError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {suggestedOnHandFoods.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">
              Suggested from On Hand
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestedOnHandFoods.map((food) => (
                <button
                  key={`suggested-${food.id}`}
                  type="button"
                  onClick={() =>
                    addTemporaryIngredient(convertFoodSearchResultToTemporaryChefIngredient(food, "on-hand"))
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.035] px-2.5 text-[11px] font-semibold text-white/58 hover:bg-white/[0.07] hover:text-white/78"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {getFoodSuggestionLabel(food)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">
          Steps
        </p>
        <ol className="mt-1 space-y-1 text-xs leading-5 text-white/50">
          {(resolvedBuild?.steps ?? recipe.steps).map((step, index) => (
            <li key={`${recipe.id}-step-${index}`} className="flex gap-2">
              <span className="text-white/25">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {isReviewingIngredients ? (
          <div className="mt-3 rounded-xl border border-white/[0.055] bg-white/[0.025] p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/32">
                Grocery Review
              </p>
              <button
                type="button"
                onClick={() => setIsReviewingIngredients(false)}
                className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-white/38 hover:bg-white/[0.05] hover:text-white/62"
              >
                Close
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {reviewItems.map((item) => {
                const label = availabilityLabel(item.availability);
                return (
                  <label
                    key={`review-${item.ingredient.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.04] bg-black/25 px-2 py-1.5"
                  >
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/[0.14] bg-black/40">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) =>
                          setSelectedIngredientIds((current) => ({
                            ...current,
                            [item.ingredient.id]: event.target.checked,
                          }))
                        }
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                      {item.selected ? (
                        <Check className="h-3 w-3 text-white/76" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-white/68">
                        {ingredientGroceryLabel(item.ingredient)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${availabilityClassName(label)}`}
                    >
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              disabled={selectedCount === 0 || isAddingIngredients}
              onClick={handleConfirmIngredients}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.075] bg-white/[0.075] px-3 text-xs font-semibold text-white/76 outline-none transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-1 focus-visible:ring-white/16"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {isAddingIngredients
                ? "Adding..."
                : `Add ${selectedCount} to Grocery List`}
            </button>
            {ingredientMessage ? (
              <p className="mt-2 text-[11px] font-medium text-emerald-100/62">
                {ingredientMessage}
              </p>
            ) : null}
            {ingredientError ? (
              <p className="mt-2 text-[11px] font-medium text-rose-100/66">
                {ingredientError}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-2.5 rounded-lg border border-white/[0.04] bg-black/25 px-2.5 py-2 text-[11px] font-medium text-white/42">
          {contextLabel}
        </p>
      </div>

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-white/[0.055] bg-black/88 p-2.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => {
            setIsReviewingIngredients(true);
            setIngredientError(null);
            setIngredientMessage(null);
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.075] bg-white/[0.045] px-3 text-xs font-semibold text-white/68 outline-none transition hover:bg-white/[0.08] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/16"
        >
          <ShoppingBasket className="h-3.5 w-3.5" aria-hidden="true" />
          Get Ingredients
        </button>
        <button
          type="button"
          onClick={() =>
            onAddToMeal({
              ingredients: combinedIngredients,
              nutrition: combinedNutrition,
            })
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200/15 bg-emerald-300/[0.09] px-3 text-xs font-semibold text-emerald-50/78 outline-none transition hover:bg-emerald-300/[0.14] hover:text-emerald-50 focus-visible:ring-1 focus-visible:ring-emerald-100/24"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add to Meal
        </button>
      </div>
    </div>
  );
}
