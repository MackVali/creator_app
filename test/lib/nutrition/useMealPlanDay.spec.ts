import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMealPlanDay,
  getCurrentMealPlanCreatorDayDate,
  getMealPlanDayQueryKey,
} from "@/hooks/useMealPlanDay";
import type { MealPlanDay } from "@/lib/nutrition/mealPlans";

const basePlan: MealPlanDay = {
  id: "day",
  creator_day_date: "2026-07-28",
  timezone: "America/Chicago",
  timezone_source: "device",
  boundary_hour: 4,
  starts_at: "2026-07-28T09:00:00.000Z",
  ends_at: "2026-07-29T09:00:00.000Z",
  planning_mode: "flexible",
  notes: null,
  items: [],
};

function ok(plan: MealPlanDay = basePlan) {
  return new Response(JSON.stringify({ plan }), { status: 200 });
}

function fail(message = "Unable to load Meal Plan.") {
  return new Response(JSON.stringify({ error: message }), { status: 500 });
}

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

describe("Meal Plan day query helpers", () => {
  it("uses the 4 AM local Creator-day boundary for current-day cache keys", () => {
    expect(getCurrentMealPlanCreatorDayDate(new Date(2026, 6, 29, 3, 59))).toBe("2026-07-28");
    expect(getCurrentMealPlanCreatorDayDate(new Date(2026, 6, 29, 4, 0))).toBe("2026-07-29");
  });

  it("separates cached plans by Creator-day key and timezone", () => {
    expect(getMealPlanDayQueryKey("2026-07-28", "America/Chicago")).not.toEqual(
      getMealPlanDayQueryKey("2026-07-29", "America/Chicago"),
    );
    expect(getMealPlanDayQueryKey("2026-07-28", "America/Chicago")).not.toEqual(
      getMealPlanDayQueryKey("2026-07-28", "America/Denver"),
    );
  });
});

describe("Meal Plan day request caching", () => {
  it("deduplicates concurrent identical Creator-day fetches through QueryClient", async () => {
    let resolveResponse: (response: Response) => void = () => {};
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(responsePromise as Promise<Response>);
    const client = createClient();
    const queryKey = getMealPlanDayQueryKey("2026-07-28", "America/Chicago");
    const queryFn = () => fetchMealPlanDay({ creatorDayDate: "2026-07-28", deviceTimezone: "America/Chicago" });

    const first = client.fetchQuery({ queryKey, queryFn });
    const second = client.fetchQuery({ queryKey, queryFn });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(ok());
    await expect(Promise.all([first, second])).resolves.toEqual([basePlan, basePlan]);
  });

  it("reuses cached day data without a second request while the query is fresh", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const client = createClient();
    const queryKey = getMealPlanDayQueryKey("2026-07-28", "America/Chicago");
    const queryFn = () => fetchMealPlanDay({ creatorDayDate: "2026-07-28", deviceTimezone: "America/Chicago" });

    await client.fetchQuery({ queryKey, queryFn });
    await client.fetchQuery({ queryKey, queryFn });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed loads permanently", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fail("Temporary failure"))
      .mockResolvedValueOnce(ok());
    const client = createClient();
    const queryKey = getMealPlanDayQueryKey("2026-07-28", "America/Chicago");
    const queryFn = () => fetchMealPlanDay({ creatorDayDate: "2026-07-28", deviceTimezone: "America/Chicago" });

    await expect(client.fetchQuery({ queryKey, queryFn })).rejects.toThrow("Temporary failure");
    await expect(client.fetchQuery({ queryKey, queryFn })).resolves.toEqual(basePlan);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
