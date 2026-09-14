"use client";

import { useQuery } from "@tanstack/react-query";

export const FOOD_RESOURCES_QUERY_ROOT = ["food-resources"] as const;

type FoodResourcesResponse = {
  foodResources?: unknown;
  error?: string;
};

export function getFoodResourcesQueryKey(
  status = "active",
  limit = 200,
) {
  return [...FOOD_RESOURCES_QUERY_ROOT, status, limit] as const;
}

export async function fetchFoodResources({
  status = "active",
  limit = 200,
  signal,
}: {
  status?: string;
  limit?: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    status,
    limit: String(limit),
  });

  const response = await fetch(
    `/api/food-resources?${params.toString()}`,
    { signal },
  );
  const payload = (await response.json()) as FoodResourcesResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load food resources.");
  }

  return Array.isArray(payload.foodResources)
    ? payload.foodResources
    : [];
}

export function useFoodResources({
  status = "active",
  limit = 200,
  enabled = true,
}: {
  status?: string;
  limit?: number;
  enabled?: boolean;
} = {}) {
  const query = useQuery<unknown[]>({
    queryKey: getFoodResourcesQueryKey(status, limit),
    queryFn: ({ signal }) =>
      fetchFoodResources({ status, limit, signal }),
    enabled,

    // Keep cached inventory available instantly, but treat it as
    // refreshable whenever this surface becomes active again.
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    resources: query.data ?? [],
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error:
      !query.data && query.error
        ? "Grocery is unavailable right now."
        : null,
    refetch: query.refetch,
  };
}
