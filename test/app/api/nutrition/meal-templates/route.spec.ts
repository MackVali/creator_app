import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));

import { GET } from "@/app/api/nutrition/meal-templates/route";

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

const user = { id: "user-1" };

function request(url = "http://localhost/api/nutrition/meal-templates?limit=50") {
  return new NextRequest(url);
}

function createListQuery(result: QueryResult) {
  const query = {
    selectedColumns: "",
    filters: [] as Array<[string, unknown]>,
    orderedBy: null as null | [string, { ascending?: boolean } | undefined],
    limitValue: null as number | null,
    select: vi.fn((columns: string) => {
      query.selectedColumns = columns;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters.push([column, value]);
      return query;
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      query.orderedBy = [column, options];
      return query;
    }),
    limit: vi.fn(async (limit: number) => {
      query.limitValue = limit;
      return result;
    }),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user }, error: null });
});

describe("Nutrition meal templates route", () => {
  it("queries the canonical saved-template parent table with template-item relationship", async () => {
    const query = createListQuery({ data: [], error: null });
    from.mockReturnValue(query);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("meal_templates");
    expect(query.selectedColumns).toContain("meal_template_items(");
    expect(query.selectedColumns).not.toContain("meal_items(");
    expect(query.filters).toEqual([
      ["user_id", user.id],
      ["is_active", true],
    ]);
    expect(query.orderedBy).toEqual(["updated_at", { ascending: false }]);
    expect(query.limitValue).toBe(50);
  });

  it("returns a successful empty list as loaded-empty", async () => {
    from.mockReturnValue(createListQuery({ data: [], error: null }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ meals: [] });
  });

  it("serializes valid templates and ordered template items", async () => {
    from.mockReturnValue(
      createListQuery({
        data: [
          {
            id: "template-1",
            user_id: user.id,
            name: "Breakfast",
            icon: "B",
            total_calories: 420,
            total_carbs_g: 40,
            total_protein_g: 30,
            total_fat_g: 12,
            metadata: {},
            is_active: true,
            created_at: "2026-07-29T14:00:00.000Z",
            updated_at: "2026-07-29T15:00:00.000Z",
            meal_template_items: [
              {
                id: "item-2",
                meal_template_id: "template-1",
                sort_order: 1,
                created_at: "2026-07-29T15:01:00.000Z",
                snapshot_name: "Eggs",
              },
              {
                id: "item-1",
                meal_template_id: "template-1",
                sort_order: 0,
                created_at: "2026-07-29T15:00:00.000Z",
                snapshot_name: "Toast",
              },
            ],
          },
        ],
        error: null,
      }),
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meals).toHaveLength(1);
    expect(payload.meals[0]).toMatchObject({
      id: "template-1",
      name: "Breakfast",
      icon: "B",
      meal_items: [{ id: "item-1" }, { id: "item-2" }],
    });
  });

  it("does not crash when nullable legacy item fields are returned", async () => {
    from.mockReturnValue(
      createListQuery({
        data: [
          {
            id: "template-legacy",
            user_id: user.id,
            name: "Legacy",
            icon: null,
            total_calories: null,
            total_carbs_g: null,
            total_protein_g: null,
            total_fat_g: null,
            metadata: null,
            is_active: true,
            created_at: null,
            updated_at: null,
            meal_template_items: [
              {
                id: "legacy-item",
                meal_template_id: "template-legacy",
                sort_order: null,
                created_at: null,
                snapshot_name: null,
              },
            ],
          },
        ],
        error: null,
      }),
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meals[0]).toMatchObject({
      id: "template-legacy",
      icon: "🍽️",
      meal_items: [{ id: "legacy-item" }],
    });
  });

  it("returns 401 for authentication failure", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("returns a controlled non-2xx response for schema failures", async () => {
    from.mockReturnValue(
      createListQuery({
        data: null,
        error: {
          code: "PGRST205",
          message: "Could not find the table 'public.meal_templates' in the schema cache",
        },
      }),
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "Saved meal storage is not installed",
      code: "MEAL_TEMPLATES_SCHEMA_UNAVAILABLE",
    });
  });

  it("returns a controlled non-2xx response for genuine database errors", async () => {
    from.mockReturnValue(
      createListQuery({
        data: null,
        error: { code: "XX000", message: "database unavailable" },
      }),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to load meals" });
  });
});
