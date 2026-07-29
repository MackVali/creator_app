import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_NUTRITION_TARGET_QUERY_ROOT,
  fetchActiveNutritionTarget,
  getActiveNutritionTargetQueryKey,
  getCurrentNutritionTargetCreatorDayDate,
  getNutritionProgressTargetsFromActiveTarget,
  writeActiveNutritionTargetCache,
  type ActiveNutritionTarget,
} from "@/hooks/useActiveNutritionTarget";

const fallback = { calories: 2000, carbs: 250, protein: 150, fat: 70 };

const goalTarget: ActiveNutritionTarget = {
  id: "target-goal",
  creator_day_date: "2026-07-29",
  calorie_target_kcal: 2400,
  protein_target_g: 160,
  carb_target_g: 260,
  fat_target_g: 80,
  is_daily_override: false,
};

const overrideTarget: ActiveNutritionTarget = {
  id: "target-goal",
  creator_day_date: "2026-07-29",
  calorie_target_kcal: 2100,
  protein_target_g: 180,
  carb_target_g: 180,
  fat_target_g: 70,
  is_daily_override: true,
};

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60 * 1000 },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("active Nutrition target query helpers", () => {
  it("separates current-day target keys at the 4 AM Creator-day boundary", () => {
    expect(getCurrentNutritionTargetCreatorDayDate(new Date(2026, 6, 29, 3, 59))).toBe("2026-07-28");
    expect(getCurrentNutritionTargetCreatorDayDate(new Date(2026, 6, 29, 4, 0))).toBe("2026-07-29");
    expect(getActiveNutritionTargetQueryKey(null, "America/Chicago", new Date(2026, 6, 29, 3, 59))).not.toEqual(
      getActiveNutritionTargetQueryKey(null, "America/Chicago", new Date(2026, 6, 29, 4, 0)),
    );
  });

  it("fetches the shared current-day daily_nutrition_targets response shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ target: goalTarget }), { status: 200 }),
    );

    await expect(fetchActiveNutritionTarget({
      creatorDayDate: "2026-07-29",
      deviceTimezone: "America/Chicago",
    })).resolves.toEqual({ target: goalTarget, setupRequired: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nutrition/targets?device_timezone=America%2FChicago&creator_day_date=2026-07-29",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses the permanent goal snapshot as progress denominators when no override exists", () => {
    expect(getNutritionProgressTargetsFromActiveTarget(goalTarget, fallback)).toEqual({
      calories: 2400,
      protein: 160,
      carbs: 260,
      fat: 80,
    });
  });

  it("uses a daily override as progress denominators when one exists", () => {
    expect(getNutritionProgressTargetsFromActiveTarget(overrideTarget, fallback)).toEqual({
      calories: 2100,
      protein: 180,
      carbs: 180,
      fat: 70,
    });
  });

  it("retains existing no-target fallback behavior for missing or invalid target rows", () => {
    expect(getNutritionProgressTargetsFromActiveTarget(null, fallback)).toEqual(fallback);
    expect(getNutritionProgressTargetsFromActiveTarget({ ...goalTarget, calorie_target_kcal: 0 }, fallback)).toEqual(fallback);
  });

  it("saving a target can update progress denominators without a page refresh", () => {
    const client = createClient();
    const key = getActiveNutritionTargetQueryKey("2026-07-29", "America/Chicago");
    client.setQueryData(key, { target: goalTarget, setupRequired: false });

    writeActiveNutritionTargetCache(client, overrideTarget, "America/Chicago");

    const cached = client.getQueryData<{ target: ActiveNutritionTarget }>(key);
    expect(getNutritionProgressTargetsFromActiveTarget(cached?.target, fallback).calories).toBe(2100);
  });

  it("update and restore mutations invalidate or update the shared target query root", async () => {
    const client = createClient();
    const key = getActiveNutritionTargetQueryKey("2026-07-29", "America/Chicago");
    client.setQueryData(key, { target: goalTarget, setupRequired: false });
    writeActiveNutritionTargetCache(client, overrideTarget, "America/Chicago");
    await client.invalidateQueries({ queryKey: ACTIVE_NUTRITION_TARGET_QUERY_ROOT });

    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryData<{ target: ActiveNutritionTarget }>(key)?.target.calorie_target_kcal).toBe(2100);
  });
});
