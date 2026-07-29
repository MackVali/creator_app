"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

export type ActiveNutritionTarget = Record<string, unknown> & {
  id?: string;
  creator_day_date?: string;
  calorie_target_kcal?: number | string | null;
  protein_target_g?: number | string | null;
  carb_target_g?: number | string | null;
  fat_target_g?: number | string | null;
  goal?: Record<string, unknown> | null;
};

export type ActiveNutritionTargetResponse = {
  target: ActiveNutritionTarget | null;
  setupRequired?: boolean;
  error?: string;
};

export type NutritionProgressTargets = {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
};

export const ACTIVE_NUTRITION_TARGET_QUERY_ROOT = ["nutrition", "active-target"] as const;

export function getNutritionTargetDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getCurrentNutritionTargetCreatorDayDate(instant = new Date()) {
  const local = new Date(instant);
  if (local.getHours() < 4) local.setDate(local.getDate() - 1);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getActiveNutritionTargetQueryKey(
  creatorDayDate?: string | null,
  deviceTimezone = getNutritionTargetDeviceTimezone(),
  instant = new Date(),
) {
  return [
    ...ACTIVE_NUTRITION_TARGET_QUERY_ROOT,
    creatorDayDate ?? getCurrentNutritionTargetCreatorDayDate(instant),
    deviceTimezone,
  ] as const;
}

export async function fetchActiveNutritionTarget({
  creatorDayDate,
  deviceTimezone,
  signal,
}: {
  creatorDayDate?: string | null;
  deviceTimezone?: string;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ device_timezone: deviceTimezone ?? getNutritionTargetDeviceTimezone() });
  if (creatorDayDate) params.set("creator_day_date", creatorDayDate);
  const response = await fetch(`/api/nutrition/targets?${params.toString()}`, { cache: "no-store", signal });
  const payload = (await response.json()) as ActiveNutritionTargetResponse;
  if (response.status === 404 && payload.setupRequired) return { target: null, setupRequired: true };
  if (!response.ok) throw new Error(payload.error || "Unable to load daily target.");
  return { target: payload.target ?? null, setupRequired: false };
}

function numericTarget(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function getNutritionProgressTargetsFromActiveTarget(
  target: ActiveNutritionTarget | null | undefined,
  fallback: NutritionProgressTargets,
): NutritionProgressTargets {
  const calories = numericTarget(target?.calorie_target_kcal);
  const carbs = numericTarget(target?.carb_target_g);
  const protein = numericTarget(target?.protein_target_g);
  const fat = numericTarget(target?.fat_target_g);
  if (calories === null || carbs === null || protein === null || fat === null) return fallback;
  return { calories, carbs, protein, fat };
}

export function writeActiveNutritionTargetCache(
  queryClient: QueryClient,
  target: ActiveNutritionTarget | null | undefined,
  deviceTimezone = getNutritionTargetDeviceTimezone(),
) {
  if (!target) return;
  const creatorDayDate = typeof target.creator_day_date === "string" ? target.creator_day_date : null;
  if (creatorDayDate) {
    queryClient.setQueryData<ActiveNutritionTargetResponse>(
      getActiveNutritionTargetQueryKey(creatorDayDate, deviceTimezone),
      { target, setupRequired: false },
    );
  }
  queryClient.setQueriesData<ActiveNutritionTargetResponse>(
    { queryKey: ACTIVE_NUTRITION_TARGET_QUERY_ROOT },
    (current) => {
      if (!current) return current;
      const currentDay = typeof current.target?.creator_day_date === "string" ? current.target.creator_day_date : null;
      const currentId = typeof current.target?.id === "string" ? current.target.id : null;
      const nextId = typeof target.id === "string" ? target.id : null;
      if ((creatorDayDate && currentDay === creatorDayDate) || (nextId && currentId === nextId)) {
        return { ...current, target, setupRequired: false };
      }
      return current;
    },
  );
}

export function useActiveNutritionTarget(
  creatorDayDate?: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const deviceTimezone = useMemo(() => getNutritionTargetDeviceTimezone(), []);
  const queryKey = useMemo(
    () => getActiveNutritionTargetQueryKey(creatorDayDate, deviceTimezone),
    [creatorDayDate, deviceTimezone],
  );
  const query = useQuery<ActiveNutritionTargetResponse>({
    queryKey,
    queryFn: ({ signal }) => fetchActiveNutritionTarget({ creatorDayDate, deviceTimezone, signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const setTargetInCache = useCallback((target: ActiveNutritionTarget | null | undefined) => {
    writeActiveNutritionTargetCache(queryClient, target, deviceTimezone);
  }, [deviceTimezone, queryClient]);
  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ACTIVE_NUTRITION_TARGET_QUERY_ROOT });
  }, [queryClient]);
  const error = query.error
    ? query.error instanceof Error ? query.error.message : "Unable to load daily target."
    : null;

  return {
    target: query.data?.target ?? null,
    setupRequired: query.data?.setupRequired ?? false,
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error,
    queryKey,
    refetch: query.refetch,
    invalidate,
    setTargetInCache,
  };
}
