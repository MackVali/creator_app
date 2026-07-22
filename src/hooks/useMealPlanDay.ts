"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MealPlanDay, MealPlanLogResponse, MealPlanResponse, MealPlanSurface, MealPlanStatus } from "@/lib/nutrition/mealPlans";

const CHANGE_EVENT = "creator:meal-plan-changed";

export function useMealPlanDay(surface: MealPlanSurface, creatorDayDate?: string | null) {
  const [plan, setPlan] = useState<MealPlanDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingItemId, setLoggingItemId] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const params = new URLSearchParams({ device_timezone: timezone });
      if (creatorDayDate) params.set("creator_day_date", creatorDayDate);
      const response = await fetch(`/api/nutrition/meal-plan?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as MealPlanResponse;
      if (!response.ok || !payload.plan) throw new Error(payload.error || "Unable to load Meal Plan.");
      payload.plan.items.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
      setPlan(payload.plan);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Meal Plan.");
    } finally { setIsLoading(false); }
  }, [creatorDayDate]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const listener = () => void refresh();
    window.addEventListener(CHANGE_EVENT, listener);
    return () => window.removeEventListener(CHANGE_EVENT, listener);
  }, [refresh]);

  const mutate = useCallback(async (key: string, request: () => Promise<Response>) => {
    if (pending.current.has(key)) return false;
    pending.current.add(key);
    setError(null);
    try {
      const response = await request();
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Meal Plan action failed.");
      await refresh();
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Meal Plan action failed.");
      return false;
    } finally { pending.current.delete(key); }
  }, [refresh]);

  const addItem = useCallback((selection: { foodId?: string; mealTemplateId?: string; foodResourceId?: string; manualLabel?: string }) => {
    if (!plan) return Promise.resolve(false);
    const key = selection.foodResourceId ?? selection.foodId ?? selection.mealTemplateId ?? selection.manualLabel ?? "invalid";
    return mutate(`add:${key}`, () => fetch("/api/nutrition/meal-plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealPlanDayId: plan.id, ...selection, sourceSurface: surface, position: plan.items.length, servings: 1 }),
    }));
  }, [mutate, plan, surface]);

  const updateItem = useCallback((id: string, changes: { servings?: number; status?: MealPlanStatus; mealType?: string | null; plannedTime?: string | null }) => mutate(`update:${id}`, () => fetch(`/api/nutrition/meal-plan/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) })), [mutate]);
  const removeItem = useCallback((id: string) => mutate(`remove:${id}`, () => fetch(`/api/nutrition/meal-plan/items/${id}`, { method: "DELETE" })), [mutate]);
  const logItem = useCallback(async (id: string) => {
    const key = `log:${id}`;
    if (pending.current.has(key)) return null;
    pending.current.add(key);
    setLoggingItemId(id);
    setError(null);
    try {
      const response = await fetch(`/api/nutrition/meal-plan/items/${id}/log`, { method: "POST" });
      const payload = (await response.json()) as MealPlanLogResponse & { error?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error || "Meal Plan logging failed.");
      if (payload.result === "partially_logged" || payload.result === "retry_incomplete") {
        setError(payload.message || "Some Grocery items still need to be updated.");
      }
      await refresh();
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return payload;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Meal Plan logging failed.");
      return null;
    } finally {
      pending.current.delete(key);
      setLoggingItemId((current) => current === id ? null : current);
    }
  }, [refresh]);

  return { plan, isLoading, error, loggingItemId, refresh, addItem, updateItem, removeItem, logItem };
}
