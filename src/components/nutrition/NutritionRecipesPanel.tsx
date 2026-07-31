"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNutritionRecipes } from "@/hooks/useNutritionRecipes";
import type { FoodSearchResult } from "@/lib/nutrition/foods";
import { getFoodIcon, type FoodIcon } from "@/lib/nutrition/foodIcons";
import type { Json } from "@/types/supabase";
import {
  buildRecipeSavePayload,
  formatRecipeNumber,
  getRecipeIngredientLineNutrition,
  getRecipeIngredientServingOptions,
  getRecipeInstructions,
  getRecipeTotals,
  makeRecipeIngredientFromFood,
  makeRecipeIngredientFromRecipeItem,
  makeRecipeIngredientFromResource,
  normalizeRecipeQuantity,
  normalizeRecipeServingUnit,
  toNullableRecipeNumber,
  type FoodResourceRecipeChoice,
  type NutritionRecipeIngredientDraft,
  type NutritionRecipeListItem,
  type NutritionRecipeServingUnit,
} from "@/lib/nutrition/recipes";

type FoodResponse = { foods?: FoodSearchResult[]; hasMore?: boolean; error?: string };
type ResourceResponse = { foodResources?: unknown; error?: string };

type EditorMode =
  | { type: "create" }
  | { type: "edit"; recipe: NutritionRecipeListItem }
  | { type: "duplicate"; recipe: NutritionRecipeListItem };

const RECIPE_VALIDATION_SAVE_ERROR = "Fix the highlighted recipe details before saving.";
const GROCERY_RESOURCE_REQUEST_LIMIT = 200;
const FOOD_BROWSE_PAGE_SIZE = 25;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function id(prefix = "recipe-ingredient") {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;
}

function normalizeResource(value: unknown): FoodResourceRecipeChoice | null {
  const row = record(value);
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    food_id: typeof row.food_id === "string" && row.food_id.trim() ? row.food_id : null,
    name: typeof row.name === "string" && row.name.trim() ? row.name : "Grocery item",
    brand_name: typeof row.brand_name === "string" && row.brand_name.trim() ? row.brand_name : null,
    quantity: toNullableRecipeNumber(row.quantity),
    unit: typeof row.unit === "string" ? row.unit : null,
    status: typeof row.status === "string" ? row.status : "active",
    metadata: row.metadata,
    catalog_food: row.catalog_food,
  };
}

function getRecipeServings(recipe: NutritionRecipeListItem) {
  return toNullableRecipeNumber(recipe.servings) ?? 1;
}

function getRecipeCaloriesPerServing(recipe: NutritionRecipeListItem) {
  const servings = getRecipeServings(recipe);
  const total = toNullableRecipeNumber(recipe.total_calories) ?? 0;
  return servings > 0 ? total / servings : total;
}

function getRecipeIngredientIssue(ingredient: NutritionRecipeIngredientDraft) {
  if (ingredient.sourceType !== "food") return null;
  if (!ingredient.foodId && !ingredient.foodResourceId) return "Food details needed";
  const line = getRecipeIngredientLineNutrition(ingredient);
  if (!line.complete) return "Nutrition incomplete";
  return null;
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getSavedFoodEmoji(metadata: Record<string, unknown>) {
  const iconMetadata = record(metadata.icon);
  return [
    metadata.food_emoji,
    metadata.emoji,
    iconMetadata.emoji,
    metadata.food_icon,
    typeof metadata.icon === "string" ? metadata.icon : null,
  ].find(
    (value): value is string =>
      typeof value === "string" && /\p{Extended_Pictographic}/u.test(value.trim()),
  )?.trim() ?? null;
}

function getFoodResultIcon(food: FoodSearchResult): FoodIcon {
  const metadata = record(food.metadata);
  const savedEmoji = getSavedFoodEmoji(metadata);
  if (savedEmoji) {
    return {
      assetPath: null,
      fallbackEmoji: savedEmoji,
      label: food.name || "Food",
    };
  }

  return getFoodIcon(food);
}

function getGroceryResourceIcon(resource: FoodResourceRecipeChoice): FoodIcon {
  const metadata = record(resource.metadata);
  const catalogFood = record(resource.catalog_food);
  const catalogMetadata = record(catalogFood.metadata);
  const mergedMetadata = { ...catalogMetadata, ...metadata };
  const savedEmoji = getSavedFoodEmoji(mergedMetadata);
  if (savedEmoji) {
    return {
      assetPath: null,
      fallbackEmoji: savedEmoji,
      label: resource.name || "Food",
    };
  }

  const iconMetadata = record(mergedMetadata.icon);
  const candidates = [
    getMetadataString(iconMetadata, "name"),
    getMetadataString(mergedMetadata, "food_icon"),
    getMetadataString(mergedMetadata, "food_family"),
    getMetadataString(mergedMetadata, "canonical_food_name"),
    resource.name,
    getMetadataString(mergedMetadata, "category"),
    getMetadataString(mergedMetadata, "food_category"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const icon = getFoodIcon({ name: resource.name, normalized_name: candidate });
    if (icon.assetPath || icon.fallbackEmoji !== "🍽️") return icon;
  }

  return getFoodIcon({ name: resource.name });
}

function getRecipeIngredientIcon(ingredient: NutritionRecipeIngredientDraft): FoodIcon {
  const metadata = record(ingredient.metadata);
  const savedEmoji = getSavedFoodEmoji(metadata);
  if (savedEmoji) {
    return {
      assetPath: null,
      fallbackEmoji: savedEmoji,
      label: ingredient.name || "Food",
    };
  }

  return getFoodIcon({
    name: ingredient.name,
    metadata: ingredient.metadata as Json | undefined,
  });
}

function RecipeFoodIconSlot({
  icon,
  fallbackInitial,
}: {
  icon: FoodIcon;
  fallbackInitial: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const assetPath = hasImageError ? null : icon.assetPath;
  const initial = fallbackInitial.trim().charAt(0).toUpperCase() || "F";

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.055] bg-black/44 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-hidden="true"
    >
      {assetPath ? (
        <Image
          src={assetPath}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
          onError={() => setHasImageError(true)}
        />
      ) : icon.fallbackEmoji ? (
        <span className="text-[21px] leading-none">{icon.fallbackEmoji}</span>
      ) : (
        <span className="text-xs font-bold text-white/52">{initial}</span>
      )}
    </span>
  );
}

function IngredientDisclosureRow({
  label,
  isOpen,
  onToggle,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-2 px-1 py-2 text-left outline-none transition hover:bg-white/[0.035] focus-visible:bg-white/[0.055]"
      aria-expanded={isOpen}
    >
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 text-white/36 transition-transform ${isOpen ? "rotate-90" : ""}`}
        aria-hidden="true"
      />
      <span className="text-sm font-semibold text-white/76">{label}</span>
    </button>
  );
}

function FoodResultButton({
  food,
  onAdd,
}: {
  food: FoodSearchResult;
  onAdd: (food: FoodSearchResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(food)}
      className="flex w-full items-center gap-3 border-b border-white/[0.035] px-3 py-2.5 text-left outline-none transition last:border-b-0 hover:bg-white/[0.045] focus-visible:bg-white/[0.06]"
    >
      <RecipeFoodIconSlot
        icon={getFoodResultIcon(food)}
        fallbackInitial={food.name.charAt(0)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/84">{food.name}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
          {food.brand_name ? `${food.brand_name} · ` : ""}
          {formatRecipeNumber(food.calories) ?? "Nutrition incomplete"} cal
        </span>
      </span>
      <Plus className="h-4 w-4 text-white/42" aria-hidden="true" />
    </button>
  );
}

function GroceryResourceButton({
  resource,
  onAdd,
}: {
  resource: FoodResourceRecipeChoice;
  onAdd: (ingredient: NutritionRecipeIngredientDraft) => void;
}) {
  const previewIngredient = makeRecipeIngredientFromResource(
    resource,
    `grocery-preview-${resource.id}`,
  );
  const issue = getRecipeIngredientIssue(previewIngredient);

  return (
    <button
      type="button"
      onClick={() => {
        if (issue) return;
        onAdd(makeRecipeIngredientFromResource(resource, id("grocery-ingredient")));
      }}
      disabled={Boolean(issue)}
      className="flex w-full items-center gap-3 border-b border-white/[0.035] px-3 py-2.5 text-left outline-none transition last:border-b-0 hover:bg-white/[0.045] focus-visible:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <RecipeFoodIconSlot
        icon={getGroceryResourceIcon(resource)}
        fallbackInitial={resource.name.charAt(0)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/84">{resource.name}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
          {resource.brand_name ? `${resource.brand_name} · ` : ""}
          {issue ?? `${formatRecipeNumber(previewIngredient.calories) ?? "0"} cal`}
        </span>
      </span>
      <Plus className="h-4 w-4 text-white/42" aria-hidden="true" />
    </button>
  );
}

function getFieldErrors(input: {
  name: string;
  servings: number;
  ingredients: NutritionRecipeIngredientDraft[];
}) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Name is required.";
  if (!Number.isFinite(input.servings) || input.servings <= 0) {
    errors.servings = "Servings must be greater than zero.";
  }
  if (input.ingredients.length === 0) errors.ingredients = "Add at least one ingredient.";
  input.ingredients.forEach((ingredient, index) => {
    if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
      errors[`ingredient-${ingredient.id}`] = "Quantity must be greater than zero.";
    }
    if (!ingredient.foodId && !ingredient.foodResourceId) {
      errors[`ingredient-${ingredient.id}`] = "Choose a food with reusable Nutrition details.";
    }
    if (ingredient.sourceType === "recipe") {
      errors[`ingredient-${ingredient.id}`] = "Recipes as ingredients are not available yet.";
    }
    if (index > 100) errors.ingredients = "Recipes cannot include more than 100 ingredients.";
  });
  return errors;
}

function SortableIngredientRow({
  ingredient,
  error,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  onQuantityChange,
  onUnitChange,
}: {
  ingredient: NutritionRecipeIngredientDraft;
  error?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onQuantityChange: (value: number) => void;
  onUnitChange: (value: NutritionRecipeServingUnit) => void;
}) {
  const sortable = useSortable({ id: ingredient.id });
  const line = getRecipeIngredientLineNutrition(ingredient);
  const issue = getRecipeIngredientIssue(ingredient);
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className="rounded-lg border border-white/[0.055] bg-black/28 px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-7 shrink-0 touch-none items-center justify-center rounded-md text-white/34 outline-none transition hover:bg-white/[0.06] hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/14"
          aria-label={`Reorder ${ingredient.name}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <RecipeFoodIconSlot
          icon={getRecipeIngredientIcon(ingredient)}
          fallbackInitial={ingredient.name.charAt(0)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white/86">
            {ingredient.name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
            {ingredient.brandName ? `${ingredient.brandName} · ` : ""}
            {line.complete
              ? `${formatRecipeNumber(line.calories) ?? "0"} cal · P ${formatRecipeNumber(line.protein_g) ?? "0"}g · C ${formatRecipeNumber(line.carbs_g) ?? "0"}g · F ${formatRecipeNumber(line.fat_g) ?? "0"}g`
              : issue}
          </span>
        </span>
        <div className="flex shrink-0 items-center rounded-lg border border-white/[0.07] bg-black/34">
          <input
            type="number"
            min="0"
            step="any"
            value={ingredient.quantity}
            onChange={(event) => onQuantityChange(normalizeRecipeQuantity(event.target.value))}
            className="h-8 w-14 border-r border-white/[0.055] bg-transparent px-1.5 text-center text-xs font-semibold tabular-nums text-white/84 outline-none"
            aria-label={`${ingredient.name} quantity`}
          />
          <select
            value={ingredient.servingUnit}
            onChange={(event) =>
              onUnitChange(normalizeRecipeServingUnit(event.target.value))
            }
            className="h-8 max-w-20 bg-[#101010] px-1.5 text-xs font-semibold text-white/72 outline-none"
            aria-label={`${ingredient.name} unit`}
          >
            {getRecipeIngredientServingOptions(ingredient).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/40 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/14"
          aria-label={`Remove ${ingredient.name}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex gap-1 pl-9 sm:hidden">
        <button
          type="button"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="h-7 rounded-md border border-white/[0.06] px-2 text-[11px] font-semibold text-white/50 disabled:opacity-30"
        >
          Up
        </button>
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="h-7 rounded-md border border-white/[0.06] px-2 text-[11px] font-semibold text-white/50 disabled:opacity-30"
        >
          Down
        </button>
      </div>
      {error ? <p className="mt-2 pl-9 text-xs font-medium text-red-200/72">{error}</p> : null}
    </div>
  );
}

export function NutritionRecipesPanel({
  onEditorOpenChange,
}: {
  onEditorOpenChange?: (isOpen: boolean) => void;
}) {
  const recipesQuery = useNutritionRecipes(50, true);
  const [librarySearch, setLibrarySearch] = useState("");
  const [openMenuRecipeId, setOpenMenuRecipeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🍽️");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<NutritionRecipeIngredientDraft[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([]);
  const [browseFoodResults, setBrowseFoodResults] = useState<FoodSearchResult[]>([]);
  const [groceryResources, setGroceryResources] = useState<FoodResourceRecipeChoice[]>([]);
  const [isFoodSearchLoading, setIsFoodSearchLoading] = useState(false);
  const [isFoodBrowseLoading, setIsFoodBrowseLoading] = useState(false);
  const [isFoodBrowseMoreLoading, setIsFoodBrowseMoreLoading] = useState(false);
  const [hasMoreBrowseFoods, setHasMoreBrowseFoods] = useState(false);
  const [isFoodsSectionOpen, setIsFoodsSectionOpen] = useState(false);
  const [isGrocerySectionOpen, setIsGrocerySectionOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  useEffect(() => {
    onEditorOpenChange?.(Boolean(editorMode));
    return () => onEditorOpenChange?.(false);
  }, [editorMode, onEditorOpenChange]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: "active",
      limit: String(GROCERY_RESOURCE_REQUEST_LIMIT),
    });
    fetch(`/api/food-resources?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as ResourceResponse;
        if (!response.ok) throw new Error(payload.error || "Unable to load Grocery.");
        setGroceryResources(
          Array.isArray(payload.foodResources)
            ? payload.foodResources
                .map(normalizeResource)
                .filter((resource): resource is FoodResourceRecipeChoice => Boolean(resource))
            : [],
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load recipe Grocery ingredients", { error });
        setGroceryResources([]);
      });
    return () => controller.abort();
  }, []);

  const loadBrowseFoods = useCallback(
    async ({
      append,
      offset,
      signal,
    }: {
      append: boolean;
      offset: number;
      signal?: AbortSignal;
    }) => {
      if (append) {
        setIsFoodBrowseMoreLoading(true);
      } else {
        setIsFoodBrowseLoading(true);
      }
      setPickerError(null);

      const params = new URLSearchParams({
        mode: "browse",
        limit: String(FOOD_BROWSE_PAGE_SIZE),
        offset: String(offset),
      });

      try {
        const response = await fetch(`/api/nutrition/foods/search?${params.toString()}`, {
          signal,
        });
        const payload = (await response.json()) as FoodResponse;
        if (!response.ok) throw new Error(payload.error || "Unable to browse foods.");

        const nextFoods = payload.foods ?? [];
        setBrowseFoodResults((current) => {
          if (!append) return nextFoods;
          const seen = new Set(current.map((food) => food.id));
          return [...current, ...nextFoods.filter((food) => !seen.has(food.id))];
        });
        setHasMoreBrowseFoods(Boolean(payload.hasMore));
      } catch (error) {
        if (signal?.aborted) return;
        console.error("Failed to browse recipe ingredients", { error });
        setPickerError("Food browse is unavailable right now.");
        if (!append) {
          setBrowseFoodResults([]);
          setHasMoreBrowseFoods(false);
        }
      } finally {
        if (signal?.aborted) return;
        if (append) {
          setIsFoodBrowseMoreLoading(false);
        } else {
          setIsFoodBrowseLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const query = ingredientSearch.trim();
    if (!editorMode || query.length < 2) {
      setFoodResults([]);
      setPickerError(null);
      setIsFoodSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsFoodSearchLoading(true);
      setPickerError(null);
      const params = new URLSearchParams({ q: query, limit: "8" });
      fetch(`/api/nutrition/foods/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as FoodResponse;
          if (!response.ok) throw new Error(payload.error || "Unable to search foods.");
          setFoodResults(payload.foods ?? []);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error("Failed to search recipe ingredients", { error });
          setPickerError("Food search is unavailable right now.");
          setFoodResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsFoodSearchLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [editorMode, ingredientSearch]);

  useEffect(() => {
    const query = ingredientSearch.trim();
    if (!editorMode || query || !isFoodsSectionOpen) {
      setBrowseFoodResults([]);
      setIsFoodBrowseLoading(false);
      setIsFoodBrowseMoreLoading(false);
      setHasMoreBrowseFoods(false);
      return;
    }
    const controller = new AbortController();
    void loadBrowseFoods({ append: false, offset: 0, signal: controller.signal });
    return () => controller.abort();
  }, [editorMode, ingredientSearch, isFoodsSectionOpen, loadBrowseFoods]);

  const visibleRecipes = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return recipesQuery.recipes;
    return recipesQuery.recipes.filter((recipe) =>
      `${recipe.name} ${recipe.description ?? ""}`.toLowerCase().includes(query),
    );
  }, [librarySearch, recipesQuery.recipes]);

  const filteredGroceryResources = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    if (query.length < 2) return [];
    return groceryResources.filter((resource) =>
      `${resource.name} ${resource.brand_name ?? ""}`.toLowerCase().includes(query),
    );
  }, [groceryResources, ingredientSearch]);

  const totals = useMemo(() => getRecipeTotals(ingredients), [ingredients]);
  const perServing = {
    calories: servings > 0 ? totals.calories / servings : 0,
    carbs_g: servings > 0 ? totals.carbs_g / servings : 0,
    protein_g: servings > 0 ? totals.protein_g / servings : 0,
    fat_g: servings > 0 ? totals.fat_g / servings : 0,
  };
  const errors = getFieldErrors({ name, servings, ingredients });
  const hasBlockingErrors = Object.keys(errors).length > 0;
  const visibleErrors: Record<string, string> = hasAttemptedSave ? errors : {};

  useEffect(() => {
    if (hasAttemptedSave && !hasBlockingErrors && saveError === RECIPE_VALIDATION_SAVE_ERROR) {
      setSaveError(null);
    }
  }, [hasAttemptedSave, hasBlockingErrors, saveError]);

  function resetIngredientPickerSections() {
    setIsFoodsSectionOpen(false);
    setIsGrocerySectionOpen(false);
  }

  function resetIngredientPicker() {
    setIngredientSearch("");
    setFoodResults([]);
    setBrowseFoodResults([]);
    setPickerError(null);
    setIsFoodSearchLoading(false);
    setIsFoodBrowseLoading(false);
    setIsFoodBrowseMoreLoading(false);
    setHasMoreBrowseFoods(false);
    resetIngredientPickerSections();
  }

  function updateIngredientSearch(value: string) {
    setIngredientSearch(value);
    if (!value.trim()) {
      resetIngredientPickerSections();
      setFoodResults([]);
      setPickerError(null);
    }
  }

  function loadMoreBrowseFoods() {
    if (isFoodBrowseMoreLoading || isFoodBrowseLoading || !hasMoreBrowseFoods) return;
    void loadBrowseFoods({
      append: true,
      offset: browseFoodResults.length,
    });
  }

  function openEditor(mode: EditorMode) {
    setEditorMode(mode);
    setOpenMenuRecipeId(null);
    setSaveError(null);
    setHasAttemptedSave(false);
    resetIngredientPicker();
    if (mode.type === "create") {
      setName("");
      setIcon("🍽️");
      setDescription("");
      setInstructions("");
      setServings(1);
      setIngredients([]);
      return;
    }
    const recipe = mode.recipe;
    setName(mode.type === "duplicate" ? `${recipe.name} Copy`.slice(0, 160) : recipe.name);
    setIcon(recipe.icon?.trim() || "🍽️");
    setDescription(recipe.description ?? "");
    setInstructions(getRecipeInstructions(recipe));
    setServings(getRecipeServings(recipe));
    setIngredients(
      [...(recipe.recipe_items ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((item) => ({
          ...makeRecipeIngredientFromRecipeItem(item),
          id: id("recipe-existing"),
        })),
    );
  }

  function closeEditor() {
    setEditorMode(null);
    setSaveError(null);
    setHasAttemptedSave(false);
    resetIngredientPicker();
  }

  function addIngredient(ingredient: NutritionRecipeIngredientDraft) {
    setIngredients((current) => [...current, ingredient]);
    resetIngredientPicker();
    setSaveError(null);
  }

  function updateIngredient(
    ingredientId: string,
    changes: Partial<NutritionRecipeIngredientDraft>,
  ) {
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === ingredientId ? { ...ingredient, ...changes } : ingredient,
      ),
    );
    setSaveError(null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setIngredients((current) => {
      const oldIndex = current.findIndex((ingredient) => ingredient.id === active.id);
      const newIndex = current.findIndex((ingredient) => ingredient.id === over.id);
      return oldIndex >= 0 && newIndex >= 0 ? arrayMove(current, oldIndex, newIndex) : current;
    });
  }

  async function saveRecipe() {
    if (!editorMode) return;
    setHasAttemptedSave(true);
    if (hasBlockingErrors) {
      setSaveError(RECIPE_VALIDATION_SAVE_ERROR);
      return;
    }
    const payload = buildRecipeSavePayload({
      name,
      icon,
      description,
      servings,
      instructions,
      ingredients,
    });
    const result =
      editorMode.type === "edit"
        ? await recipesQuery.updateRecipe(editorMode.recipe.id, payload)
        : await recipesQuery.createRecipe(payload);
    if (!result) {
      setSaveError(recipesQuery.actionError || "Unable to save this recipe.");
      return;
    }
    closeEditor();
  }

  if (editorMode) {
    return (
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
        <div className="sticky top-0 z-10 -mx-1 border-b border-white/[0.045] bg-[#070707]/96 px-1 pb-3 pt-1 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.045] text-white/62 outline-none transition hover:bg-white/[0.07] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/16"
              aria-label="Back to recipes"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white/86">
                {editorMode.type === "edit" ? "Edit Recipe" : "Create Recipe"}
              </p>
              <p className="truncate text-[11px] font-medium text-white/40">
                {totals.incompleteIngredientIds.length
                  ? "Nutrition incomplete"
                  : `${formatRecipeNumber(perServing.calories) ?? "0"} cal per serving`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveRecipe()}
              disabled={recipesQuery.pendingActionId !== null}
              className="h-9 shrink-0 rounded-lg border border-white/[0.42] bg-white/72 px-3 text-xs font-semibold text-zinc-950 outline-none transition hover:bg-white/84 disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/28"
            >
              {recipesQuery.pendingActionId ? "Saving..." : editorMode.type === "edit" ? "Save changes" : "Save recipe"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 [-webkit-overflow-scrolling:touch]">
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Recipe
            </p>
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
              <input
                value={icon}
                onChange={(event) => setIcon(event.target.value.slice(0, 8))}
                className="h-11 rounded-lg border border-white/[0.055] bg-white/[0.045] px-2 text-center text-lg text-white outline-none focus-visible:ring-1 focus-visible:ring-white/14"
                aria-label="Recipe icon"
              />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Recipe name"
                className="h-11 rounded-lg border border-white/[0.055] bg-white/[0.045] px-3 text-sm font-semibold text-white outline-none placeholder:text-white/26 focus-visible:ring-1 focus-visible:ring-white/14"
              />
            </div>
            {visibleErrors.name ? <p className="text-xs font-medium text-red-200/72">{visibleErrors.name}</p> : null}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/[0.055] bg-white/[0.04] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-white/24 focus-visible:ring-1 focus-visible:ring-white/14"
            />
            <label className="block">
              <span className="text-xs font-semibold text-white/46">Servings produced</span>
              <input
                type="number"
                min="0"
                step="any"
                value={servings}
                onChange={(event) => setServings(normalizeRecipeQuantity(event.target.value, 0))}
                className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.055] bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none focus-visible:ring-1 focus-visible:ring-white/14"
              />
            </label>
            {visibleErrors.servings ? <p className="text-xs font-medium text-red-200/72">{visibleErrors.servings}</p> : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                Ingredients
              </p>
              <span className="text-[11px] font-semibold text-white/42">{ingredients.length}</span>
            </div>
            {visibleErrors.ingredients ? <p className="text-xs font-medium text-red-200/72">{visibleErrors.ingredients}</p> : null}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ingredients.map((ingredient) => ingredient.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {ingredients.map((ingredient, index) => (
                    <SortableIngredientRow
                      key={ingredient.id}
                      ingredient={ingredient}
                      error={visibleErrors[`ingredient-${ingredient.id}`]}
                      canMoveUp={index > 0}
                      canMoveDown={index < ingredients.length - 1}
                      onMove={(offset) =>
                        setIngredients((current) =>
                          arrayMove(current, index, Math.max(0, Math.min(current.length - 1, index + offset))),
                        )
                      }
                      onRemove={() =>
                        setIngredients((current) => current.filter((item) => item.id !== ingredient.id))
                      }
                      onQuantityChange={(quantity) => updateIngredient(ingredient.id, { quantity })}
                      onUnitChange={(servingUnit) => updateIngredient(ingredient.id, { servingUnit })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" aria-hidden="true" />
              <input
                value={ingredientSearch}
                onChange={(event) => updateIngredientSearch(event.target.value)}
                placeholder="Add ingredient"
                className="h-11 w-full rounded-xl border border-white/[0.055] bg-black/42 pl-10 pr-3 text-sm font-medium text-white outline-none placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-white/14"
              />
            </div>
            {isFoodSearchLoading ? <p className="px-1 text-xs font-medium text-white/42">Searching...</p> : null}
            {pickerError ? <p className="px-1 text-xs font-medium text-red-200/72">{pickerError}</p> : null}
            {ingredientSearch.trim().length === 0 ? (
              <div className="border-y border-white/[0.055]">
                <IngredientDisclosureRow
                  label="Foods"
                  isOpen={isFoodsSectionOpen}
                  onToggle={() => setIsFoodsSectionOpen((current) => !current)}
                />
                {isFoodsSectionOpen ? (
                  <div className="border-t border-white/[0.045] bg-black/22">
                    {isFoodBrowseLoading ? (
                      <p className="px-3 py-2.5 text-xs font-medium text-white/42">Loading foods...</p>
                    ) : browseFoodResults.length > 0 ? (
                      <>
                        {browseFoodResults.map((food) => (
                          <FoodResultButton
                            key={food.id}
                            food={food}
                            onAdd={(selectedFood) =>
                              addIngredient(makeRecipeIngredientFromFood(selectedFood, id()))
                            }
                          />
                        ))}
                        {hasMoreBrowseFoods ? (
                          <button
                            type="button"
                            onClick={loadMoreBrowseFoods}
                            disabled={isFoodBrowseMoreLoading}
                            className="flex min-h-10 w-full items-center justify-center border-t border-white/[0.045] px-3 py-2 text-xs font-semibold text-white/58 outline-none transition hover:bg-white/[0.04] hover:text-white/78 disabled:cursor-not-allowed disabled:text-white/28"
                          >
                            {isFoodBrowseMoreLoading ? "Loading..." : "Show more"}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="px-3 py-2.5 text-xs font-medium text-white/42">
                        Search for a food above
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="border-t border-white/[0.045]">
                  <IngredientDisclosureRow
                    label="My Grocery"
                    isOpen={isGrocerySectionOpen}
                    onToggle={() => setIsGrocerySectionOpen((current) => !current)}
                  />
                </div>
                {isGrocerySectionOpen ? (
                  <div className="border-t border-white/[0.045] bg-black/22">
                    {groceryResources.length > 0 ? (
                      groceryResources.map((resource) => (
                        <GroceryResourceButton
                          key={resource.id}
                          resource={resource}
                          onAdd={addIngredient}
                        />
                      ))
                    ) : (
                      <p className="px-3 py-2.5 text-xs font-medium text-white/42">
                        No Grocery foods yet.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : ingredientSearch.trim().length < 2 ? (
              <p className="px-1 text-xs font-medium text-white/42">Keep typing to search.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.055] bg-black/34">
                {foodResults.length > 0 ? (
                  <div>
                    <p className="border-b border-white/[0.045] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/34">
                      Foods
                    </p>
                    {foodResults.map((food) => (
                      <FoodResultButton
                        key={food.id}
                        food={food}
                        onAdd={(selectedFood) =>
                          addIngredient(makeRecipeIngredientFromFood(selectedFood, id()))
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {filteredGroceryResources.length > 0 ? (
                  <div>
                    <p className="border-b border-white/[0.045] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/34">
                      My Grocery
                    </p>
                    {filteredGroceryResources.map((resource) => (
                      <GroceryResourceButton
                        key={resource.id}
                        resource={resource}
                        onAdd={addIngredient}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Nutrition
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Batch", totals],
                ["Per serving", perServing],
              ].map(([label, values]) => {
                const row = values as typeof totals;
                return (
                  <div key={label as string} className="rounded-lg border border-white/[0.055] bg-white/[0.035] p-2.5">
                    <p className="text-xs font-semibold text-white/74">{label as string}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-white/92">{formatRecipeNumber(row.calories) ?? "0"} cal</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-white/42">
                      P {formatRecipeNumber(row.protein_g) ?? "0"}g · C {formatRecipeNumber(row.carbs_g) ?? "0"}g · F {formatRecipeNumber(row.fat_g) ?? "0"}g
                    </p>
                  </div>
                );
              })}
            </div>
            {totals.incompleteIngredientIds.length > 0 ? (
              <p className="text-xs font-medium text-amber-100/72">
                Totals are incomplete for {totals.incompleteIngredientIds.length} ingredient{totals.incompleteIngredientIds.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Instructions
            </p>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Preparation instructions"
              rows={5}
              className="w-full resize-none rounded-lg border border-white/[0.055] bg-white/[0.04] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-white/24 focus-visible:ring-1 focus-visible:ring-white/14"
            />
          </section>
          {saveError ? <p className="text-xs font-medium text-red-200/72">{saveError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" aria-hidden="true" />
          <input
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
            placeholder="Search recipes"
            className="h-11 w-full rounded-xl border border-white/[0.055] bg-black/42 pl-10 pr-3 text-sm font-medium text-white outline-none placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-white/14"
          />
        </div>
        <button
          type="button"
          onClick={() => openEditor({ type: "create" })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/70 outline-none transition hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/18"
          aria-label="Create recipe"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {recipesQuery.error ? (
        <div className="rounded-xl border border-red-300/15 bg-red-500/[0.08] p-3">
          <p className="text-xs font-semibold text-red-100/82">{recipesQuery.error}</p>
          <button type="button" onClick={() => void recipesQuery.retry()} className="mt-2 text-xs font-semibold text-white/70">
            Retry
          </button>
        </div>
      ) : recipesQuery.isLoading ? (
        <p className="rounded-xl border border-white/[0.055] bg-black/34 px-3 py-4 text-xs font-medium text-white/42">
          Loading recipes...
        </p>
      ) : visibleRecipes.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
          {visibleRecipes.map((recipe) => {
            const servingsValue = getRecipeServings(recipe);
            const calories = getRecipeCaloriesPerServing(recipe);
            const menuOpen = openMenuRecipeId === recipe.id;
            return (
              <div key={recipe.id} className="relative flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 last:border-b-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.055] bg-black/44 text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {recipe.icon?.trim() || "🍽️"}
                </span>
                <button
                  type="button"
                  onClick={() => openEditor({ type: "edit", recipe })}
                  className="min-w-0 flex-1 text-left outline-none"
                >
                  <span className="block truncate text-sm font-semibold text-white/86">{recipe.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                    {formatRecipeNumber(calories) ?? "0"} cal/serving · {formatRecipeNumber(servingsValue) ?? "1"} servings
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenMenuRecipeId(menuOpen ? null : recipe.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/14"
                  aria-label={`${recipe.name} actions`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                {menuOpen ? (
                  <div className="absolute right-3 top-11 z-20 w-36 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101010]/98 py-1 shadow-[0_18px_36px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                    <button type="button" onClick={() => openEditor({ type: "edit", recipe })} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-white/72 hover:bg-white/[0.06]">
                      <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </button>
                    <button type="button" onClick={() => void recipesQuery.duplicateRecipe(recipe.id)} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-white/72 hover:bg-white/[0.06]">
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Duplicate
                    </button>
                    <button type="button" onClick={() => void recipesQuery.archiveRecipe(recipe.id)} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-red-100/78 hover:bg-red-500/[0.08]">
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archive
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/28 px-3 py-5 text-center">
          <p className="text-sm font-semibold text-white/64">No recipes yet.</p>
          <p className="mt-1 text-xs font-medium text-white/36">
            Build a reusable recipe from Nutrition foods and saved Grocery items.
          </p>
        </div>
      )}
      {recipesQuery.actionError ? (
        <p className="px-1 text-xs font-medium text-red-200/72">{recipesQuery.actionError}</p>
      ) : null}
    </div>
  );
}
