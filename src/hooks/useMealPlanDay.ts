"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MealPlanDay, MealPlanLogResponse, MealPlanResponse, MealPlanSurface, MealPlanStatus } from "@/lib/nutrition/mealPlans";

export const MEAL_PLAN_DAY_QUERY_ROOT = ["nutrition", "meal-plan-day"] as const;

export function getMealPlanDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getCurrentMealPlanCreatorDayDate(instant = new Date()) {
  const local = new Date(instant);
  if (local.getHours() < 4) local.setDate(local.getDate() - 1);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMealPlanDayQueryKey(
  creatorDayDate?: string | null,
  deviceTimezone = getMealPlanDeviceTimezone(),
  instant = new Date(),
) {
  return [
    ...MEAL_PLAN_DAY_QUERY_ROOT,
    creatorDayDate ?? getCurrentMealPlanCreatorDayDate(instant),
    deviceTimezone,
  ] as const;
}

export async function fetchMealPlanDay({
  creatorDayDate,
  deviceTimezone,
  signal,
}: {
  creatorDayDate?: string | null;
  deviceTimezone?: string;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ device_timezone: deviceTimezone ?? getMealPlanDeviceTimezone() });
  if (creatorDayDate) params.set("creator_day_date", creatorDayDate);
  const response = await fetch(`/api/nutrition/meal-plan?${params.toString()}`, { cache: "no-store", signal });
  const payload = (await response.json()) as MealPlanResponse;
  if (!response.ok || !payload.plan) throw new Error(payload.error || "Unable to load Meal Plan.");
  payload.plan.items.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return payload.plan;
}

export function useMealPlanDay(surface: MealPlanSurface, creatorDayDate?: string | null) {
  const queryClient = useQueryClient();
  const deviceTimezone = useMemo(() => getMealPlanDeviceTimezone(), []);
  const queryKey = useMemo(
    () => getMealPlanDayQueryKey(creatorDayDate, deviceTimezone),
    [creatorDayDate, deviceTimezone],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [loggingItemId, setLoggingItemId] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const query = useQuery<MealPlanDay>({
    queryKey,
    queryFn: ({ signal }) => fetchMealPlanDay({ creatorDayDate, deviceTimezone, signal }),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    setActionError(null);
    await query.refetch();
  }, [query]);

  const mutate = useCallback(async (key: string, request: () => Promise<Response>) => {
    if (pending.current.has(key)) return false;
    pending.current.add(key);
    setActionError(null);
    try {
      const response = await request();
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Meal Plan action failed.");
      await queryClient.invalidateQueries({ queryKey });
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Meal Plan action failed.");
      return false;
    } finally { pending.current.delete(key); }
  }, [queryClient, queryKey]);

  const addItem = useCallback((selection: { foodId?: string; mealTemplateId?: string; foodResourceId?: string; manualLabel?: string }) => {
    if (!query.data) return Promise.resolve(false);
    const key = selection.foodResourceId ?? selection.foodId ?? selection.mealTemplateId ?? selection.manualLabel ?? "invalid";
    return mutate(`add:${key}`, () => fetch("/api/nutrition/meal-plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealPlanDayId: query.data.id, ...selection, sourceSurface: surface, position: query.data.items.length, servings: 1 }),
    }));
  }, [mutate, query.data, surface]);

  const updateItem = useCallback((id: string, changes: { servings?: number; status?: MealPlanStatus; mealType?: string | null; plannedTime?: string | null }) => mutate(`update:${id}`, () => fetch(`/api/nutrition/meal-plan/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) })), [mutate]);
  const removeItem = useCallback((id: string) => mutate(`remove:${id}`, () => fetch(`/api/nutrition/meal-plan/items/${id}`, { method: "DELETE" })), [mutate]);
  const logItem = useCallback(async (id: string) => {
    const key = `log:${id}`;
    if (pending.current.has(key)) return null;
    pending.current.add(key);
    setLoggingItemId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/nutrition/meal-plan/items/${id}/log`, { method: "POST" });
      const payload = (await response.json()) as MealPlanLogResponse & { error?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error || "Meal Plan logging failed.");
      if (payload.result === "partially_logged" || payload.result === "retry_incomplete") {
        setActionError(payload.message || "Some Grocery items still need to be updated.");
      }
      await queryClient.invalidateQueries({ queryKey });
      return payload;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Meal Plan logging failed.");
      return null;
    } finally {
      pending.current.delete(key);
      setLoggingItemId((current) => current === id ? null : current);
    }
  }, [queryClient, queryKey]);

  const queryError = query.error
    ? query.error instanceof Error ? query.error.message : "Unable to load Meal Plan."
    : null;
  return {
    plan: query.data ?? null,
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error: !query.data ? actionError ?? queryError : null,
    backgroundError: query.data ? actionError ?? queryError : null,
    loggingItemId,
    refresh,
    addItem,
    updateItem,
    removeItem,
    logItem,
  };
}
