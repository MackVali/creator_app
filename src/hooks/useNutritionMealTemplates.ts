"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

export const NUTRITION_MEAL_TEMPLATES_QUERY_ROOT = [
  "nutrition",
  "meal-templates",
] as const;

export type NutritionMealTemplateChoice = {
  id: string;
  name: string;
  icon?: string | null;
  total_calories?: number | string | null;
  total_carbs_g?: number | string | null;
  total_protein_g?: number | string | null;
  total_fat_g?: number | string | null;
  meal_items?: unknown[] | null;
};

type MealTemplatesResponse = {
  meals?: unknown;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNutritionValue(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function isAbortError(value: unknown) {
  return (
    typeof DOMException !== "undefined" &&
    value instanceof DOMException &&
    value.name === "AbortError"
  ) || (
    value instanceof Error && value.name === "AbortError"
  );
}

export function normalizeNutritionMealTemplateChoice(
  value: unknown,
): NutritionMealTemplateChoice | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const name = typeof value.name === "string" && value.name.trim()
    ? value.name
    : "Saved meal";

  return {
    id: value.id,
    name,
    icon: optionalString(value.icon),
    total_calories: optionalNutritionValue(value.total_calories),
    total_carbs_g: optionalNutritionValue(value.total_carbs_g),
    total_protein_g: optionalNutritionValue(value.total_protein_g),
    total_fat_g: optionalNutritionValue(value.total_fat_g),
    meal_items: Array.isArray(value.meal_items) ? value.meal_items : [],
  };
}

export function getNutritionMealTemplatesQueryKey(limit = 50) {
  return [...NUTRITION_MEAL_TEMPLATES_QUERY_ROOT, limit] as const;
}

export async function fetchNutritionMealTemplates({
  limit = 50,
  signal,
}: {
  limit?: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  let response: Response;
  try {
    response = await fetch(`/api/nutrition/meal-templates?${params.toString()}`, {
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return [];
    throw error;
  }
  const payload = (await response.json()) as MealTemplatesResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load meals.");
  }

  const meals = Array.isArray(payload.meals) ? payload.meals : [];
  return meals
    .map(normalizeNutritionMealTemplateChoice)
    .filter((meal): meal is NutritionMealTemplateChoice => Boolean(meal));
}

export function useNutritionMealTemplates(limit = 50, enabled = true) {
  const query = useQuery<NutritionMealTemplateChoice[]>({
    queryKey: getNutritionMealTemplatesQueryKey(limit),
    queryFn: ({ signal }) => fetchNutritionMealTemplates({ limit, signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const retry = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    templates: query.data ?? [],
    hasTemplates: Boolean(query.data && query.data.length > 0),
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error: !query.data && query.error ? "Meals couldn’t load" : null,
    retry,
  };
}
