"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveNutritionTarget } from "@/hooks/useActiveNutritionTarget";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  aggregateNutritionMealTotals,
  getNutritionCreatorDayWindow,
  type NutritionDailyTotals,
  type NutritionMealTotalsSource,
} from "@/lib/nutrition/dailyTotals";
import { CREATOR_NUTRITION_MEAL_SAVED_EVENT } from "@/lib/nutrition/logEvents";

type NutritionMealsListResponse = {
  meals?: NutritionMealTotalsSource[];
  error?: string;
};

export const NUTRITION_DAILY_TOTALS_QUERY_ROOT = [
  "nutrition",
  "daily-totals",
] as const;

function getDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function numericTarget(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function getNutritionTargetsFromActiveTarget(
  target: ReturnType<typeof useActiveNutritionTarget>["target"],
) {
  if (!target) return null;

  return {
    calories: numericTarget(target.calorie_target_kcal),
    carbs: numericTarget(target.carb_target_g),
    protein: numericTarget(target.protein_target_g),
    fat: numericTarget(target.fat_target_g),
  };
}

async function fetchNutritionDailyTotals({
  start,
  end,
  signal,
}: {
  start: Date;
  end: Date;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "100",
  });
  const response = await fetch(`/api/nutrition/meals?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as NutritionMealsListResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load nutrition meals.");
  }

  return aggregateNutritionMealTotals(payload.meals ?? []);
}

export function useNutritionDailyTotals() {
  const queryClient = useQueryClient();
  const { localTimeZone } = useProfile();
  const deviceTimezone = useMemo(() => getDeviceTimezone(), []);
  const dayWindow = useMemo(
    () =>
      getNutritionCreatorDayWindow({
        profileTimezone: localTimeZone,
        deviceTimezone,
      }),
    [deviceTimezone, localTimeZone],
  );
  const target = useActiveNutritionTarget(dayWindow.creatorDayDate);
  const queryKey = useMemo(
    () =>
      [
        ...NUTRITION_DAILY_TOTALS_QUERY_ROOT,
        dayWindow.creatorDayDate,
        dayWindow.timezone,
      ] as const,
    [dayWindow.creatorDayDate, dayWindow.timezone],
  );
  const query = useQuery<NutritionDailyTotals>({
    queryKey,
    queryFn: ({ signal }) =>
      fetchNutritionDailyTotals({
        start: dayWindow.startsAt,
        end: dayWindow.endsAt,
        signal,
      }),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMealSaved = () => {
      void refresh();
    };

    window.addEventListener(CREATOR_NUTRITION_MEAL_SAVED_EVENT, handleMealSaved);
    window.addEventListener("creator:pinned-body-databases-changed", handleMealSaved);
    return () => {
      window.removeEventListener(CREATOR_NUTRITION_MEAL_SAVED_EVENT, handleMealSaved);
      window.removeEventListener("creator:pinned-body-databases-changed", handleMealSaved);
    };
  }, [refresh]);

  return {
    totals: query.data ?? null,
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Unable to load nutrition meals."
      : null,
    creatorDayDate: dayWindow.creatorDayDate,
    timezone: dayWindow.timezone,
    target: target.target,
    targets: getNutritionTargetsFromActiveTarget(target.target),
    targetSetupRequired: target.setupRequired,
    targetIsLoading: target.isLoading,
    targetError: target.error,
    refresh,
  };
}

