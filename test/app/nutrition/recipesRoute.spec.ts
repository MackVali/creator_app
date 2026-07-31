import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };
  return {
    query,
    supabase,
    rows: [] as unknown[],
  };
});

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockState.supabase),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => null),
}));

import { GET } from "@/app/api/nutrition/recipes/route";
import { DEFAULT_NUTRITION_RECIPE_ICON } from "@/lib/nutrition/meals";
import { RECIPE_SELECT } from "@/lib/nutrition/recipeServer";

function resetRecipeQuery() {
  mockState.query.select.mockReturnValue(mockState.query);
  mockState.query.eq.mockReturnValue(mockState.query);
  mockState.query.order.mockReturnValue(mockState.query);
  mockState.query.limit.mockImplementation(async () => ({
    data: mockState.rows,
    error: null,
  }));
  mockState.supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockState.supabase.from.mockReturnValue(mockState.query);
}

function recipeRequest() {
  return new NextRequest("http://localhost/api/nutrition/recipes?limit=50");
}

describe("nutrition recipes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.rows = [];
    resetRecipeQuery();
  });

  it("does not select recipes.icon", async () => {
    await GET(recipeRequest());

    expect(mockState.query.select).toHaveBeenCalledWith(RECIPE_SELECT);
    expect(RECIPE_SELECT).not.toContain("name,icon");
    expect(RECIPE_SELECT).not.toMatch(/(^|,)icon(,|$)/);
  });

  it("returns an empty recipe list", async () => {
    const response = await GET(recipeRequest());

    await expect(response.json()).resolves.toEqual({ recipes: [] });
    expect(response.status).toBe(200);
  });

  it("returns existing recipe rows with the client fallback icon", async () => {
    mockState.rows = [
      {
        id: "recipe-1",
        user_id: "user-1",
        name: "Overnight oats",
        description: null,
        servings: 2,
        total_calories: 300,
        total_carbs_g: 54,
        total_protein_g: 10,
        total_fat_g: 6,
        metadata: null,
        is_active: true,
        created_at: "2026-07-30T00:00:00.000Z",
        updated_at: "2026-07-30T00:00:00.000Z",
        recipe_items: [],
      },
    ];

    const response = await GET(recipeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.recipes).toHaveLength(1);
    expect(payload.recipes[0]).toMatchObject({
      id: "recipe-1",
      name: "Overnight oats",
      icon: DEFAULT_NUTRITION_RECIPE_ICON,
      recipe_items: [],
    });
  });
});
