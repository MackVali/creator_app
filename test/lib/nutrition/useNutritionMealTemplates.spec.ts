import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNutritionMealTemplates,
  getNutritionMealTemplatesQueryKey,
  normalizeNutritionMealTemplateChoice,
} from "@/hooks/useNutritionMealTemplates";

const meal = {
  id: "meal-1",
  name: "Breakfast",
  icon: null,
  total_calories: 420,
  total_carbs_g: 40,
  total_protein_g: 30,
  total_fat_g: 12,
  meal_items: [{ id: "item-1" }],
};

function ok(meals: unknown[] = [meal]) {
  return new Response(JSON.stringify({ meals }), { status: 200 });
}

function fail(message = "Unable to load meals") {
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

describe("Nutrition meal template request", () => {
  it("loads successful meal template responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    await expect(fetchNutritionMealTemplates({ limit: 50 })).resolves.toEqual([meal]);
  });

  it("treats a valid empty response as loaded-empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));

    await expect(fetchNutritionMealTemplates({ limit: 50 })).resolves.toEqual([]);
  });

  it("does not turn an aborted request into a visible meals error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await expect(fetchNutritionMealTemplates({ limit: 50 })).resolves.toEqual([]);
  });

  it("keeps malformed optional legacy fields from crashing the list", () => {
    expect(
      normalizeNutritionMealTemplateChoice({
        id: "legacy",
        name: "",
        icon: 12,
        total_calories: null,
        meal_items: "not-an-array",
      }),
    ).toEqual({
      id: "legacy",
      name: "Saved meal",
      icon: null,
      total_calories: null,
      total_carbs_g: null,
      total_protein_g: null,
      total_fat_g: null,
      meal_items: [],
    });
  });
});

describe("Nutrition meal template request caching", () => {
  it("deduplicates concurrent identical template requests", async () => {
    let resolveResponse: (response: Response) => void = () => {};
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(responsePromise as Promise<Response>);
    const client = createClient();
    const queryKey = getNutritionMealTemplatesQueryKey(50);
    const queryFn = () => fetchNutritionMealTemplates({ limit: 50 });

    const first = client.fetchQuery({ queryKey, queryFn });
    const second = client.fetchQuery({ queryKey, queryFn });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(ok());
    await expect(Promise.all([first, second])).resolves.toEqual([[meal], [meal]]);
  });

  it("keeps cached meals visible instead of refetching while fresh", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const client = createClient();
    const queryKey = getNutritionMealTemplatesQueryKey(50);
    const queryFn = () => fetchNutritionMealTemplates({ limit: 50 });

    await client.fetchQuery({ queryKey, queryFn });
    await client.fetchQuery({ queryKey, queryFn });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries the exact failed query and accepts the later success", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok());
    const client = createClient();
    const queryKey = getNutritionMealTemplatesQueryKey(50);
    const queryFn = () => fetchNutritionMealTemplates({ limit: 50 });

    await expect(client.fetchQuery({ queryKey, queryFn })).rejects.toThrow("Unable to load meals");
    expect(client.getQueryState(queryKey)?.error).toBeInstanceOf(Error);
    await expect(client.fetchQuery({ queryKey, queryFn })).resolves.toEqual([meal]);
    expect(client.getQueryState(queryKey)).toMatchObject({
      data: [meal],
      error: null,
      status: "success",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/nutrition/meal-templates?limit=50",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/nutrition/meal-templates?limit=50",
      expect.any(Object),
    );
  });
});
