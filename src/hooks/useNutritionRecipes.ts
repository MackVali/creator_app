"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NutritionRecipeListItem } from "@/lib/nutrition/recipes";

export const NUTRITION_RECIPES_QUERY_ROOT = ["nutrition", "recipes"] as const;

type NutritionRecipesResponse = {
  recipes?: unknown;
  recipe?: NutritionRecipeListItem | null;
  error?: string;
};

function isAbortError(value: unknown) {
  return (
    typeof DOMException !== "undefined" &&
    value instanceof DOMException &&
    value.name === "AbortError"
  ) || (value instanceof Error && value.name === "AbortError");
}

function isRecipe(value: unknown): value is NutritionRecipeListItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { name?: unknown }).name === "string",
  );
}

export function getNutritionRecipesQueryKey(limit = 50) {
  return [...NUTRITION_RECIPES_QUERY_ROOT, limit] as const;
}

export async function fetchNutritionRecipes({
  limit = 50,
  signal,
}: {
  limit?: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  let response: Response;
  try {
    response = await fetch(`/api/nutrition/recipes?${params.toString()}`, {
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return [];
    throw error;
  }
  const payload = (await response.json()) as NutritionRecipesResponse;
  if (!response.ok) throw new Error(payload.error || "Unable to load recipes.");
  return Array.isArray(payload.recipes)
    ? payload.recipes.filter(isRecipe)
    : [];
}

export function useNutritionRecipes(limit = 50, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => getNutritionRecipesQueryKey(limit), [limit]);
  const pending = useRef(new Set<string>());
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const query = useQuery<NutritionRecipeListItem[]>({
    queryKey,
    queryFn: ({ signal }) => fetchNutritionRecipes({ limit, signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: NUTRITION_RECIPES_QUERY_ROOT }),
    [queryClient],
  );

  const mutateRecipe = useCallback(
    async (
      key: string,
      request: () => Promise<Response>,
      optimistic?: (recipe: NutritionRecipeListItem) => void,
    ) => {
      if (pending.current.has(key)) return null;
      pending.current.add(key);
      setActionError(null);
      setPendingActionId(key);
      try {
        const response = await request();
        const payload = (await response.json()) as NutritionRecipesResponse;
        if (!response.ok) throw new Error(payload.error || "Recipe action failed.");
        if (payload.recipe && optimistic) optimistic(payload.recipe);
        await invalidate();
        return payload.recipe ?? null;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Recipe action failed.");
        return null;
      } finally {
        pending.current.delete(key);
        setPendingActionId((current) => (current === key ? null : current));
      }
    },
    [invalidate],
  );

  const upsertInCache = useCallback(
    (recipe: NutritionRecipeListItem) => {
      queryClient.setQueryData<NutritionRecipeListItem[]>(queryKey, (current) => {
        const rows = current ?? [];
        const without = rows.filter((row) => row.id !== recipe.id);
        return [recipe, ...without];
      });
    },
    [queryClient, queryKey],
  );

  const removeFromCache = useCallback(
    (recipeId: string) => {
      queryClient.setQueryData<NutritionRecipeListItem[]>(queryKey, (current) =>
        (current ?? []).filter((row) => row.id !== recipeId),
      );
    },
    [queryClient, queryKey],
  );

  const createRecipe = useCallback(
    (payload: unknown) =>
      mutateRecipe(
        "create",
        () =>
          fetch("/api/nutrition/recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        upsertInCache,
      ),
    [mutateRecipe, upsertInCache],
  );

  const updateRecipe = useCallback(
    (recipeId: string, payload: unknown) =>
      mutateRecipe(
        `update:${recipeId}`,
        () =>
          fetch(`/api/nutrition/recipes/${recipeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        upsertInCache,
      ),
    [mutateRecipe, upsertInCache],
  );

  const duplicateRecipe = useCallback(
    (recipeId: string) =>
      mutateRecipe(
        `duplicate:${recipeId}`,
        () => fetch(`/api/nutrition/recipes/${recipeId}/duplicate`, { method: "POST" }),
        upsertInCache,
      ),
    [mutateRecipe, upsertInCache],
  );

  const archiveRecipe = useCallback(
    (recipeId: string) =>
      mutateRecipe(
        `archive:${recipeId}`,
        () =>
          fetch(`/api/nutrition/recipes/${recipeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "archive" }),
          }),
        () => removeFromCache(recipeId),
      ),
    [mutateRecipe, removeFromCache],
  );

  return {
    recipes: query.data ?? [],
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error: !query.data && query.error ? "Recipes couldn’t load" : null,
    actionError,
    pendingActionId,
    retry: query.refetch,
    createRecipe,
    updateRecipe,
    duplicateRecipe,
    archiveRecipe,
  };
}
