import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "../../lib/supabase";
import {
  createMyListList,
  loadMyListLists,
  MY_LIST_GROCERY_NAME,
  MY_LIST_GROCERY_SYSTEM_KEY,
} from "../../src/lib/my-list/myListListsStorage";

vi.mock("../../lib/supabase", () => ({ getSupabaseBrowser: vi.fn() }));

function query(...results: unknown[]) {
  const filters: Array<[string, unknown]> = [];
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  let resultIndex = 0;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    }),
    order: vi.fn(() => chain),
    insert: vi.fn((value: unknown) => {
      inserted.push(value);
      return chain;
    }),
    update: vi.fn((value: unknown) => {
      updated.push(value);
      return chain;
    }),
    then: vi.fn((resolve: (value: unknown) => unknown) =>
      Promise.resolve(
        results[Math.min(resultIndex++, results.length - 1)],
      ).then(resolve),
    ),
  };
  return { chain, filters, inserted, updated };
}

beforeEach(() => vi.mocked(getSupabaseBrowser).mockReset());

describe("myListListsStorage", () => {
  it("loads lists scoped to the authenticated user", async () => {
    const groceryRow = {
      id: "list-grocery",
      user_id: "user-1",
      name: MY_LIST_GROCERY_NAME,
      system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const { chain, filters } = query({ data: [groceryRow], error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue({
      from: vi.fn(() => chain),
    } as never);
    await loadMyListLists("user-1");
    expect(filters).toEqual([["user_id", "user-1"]]);
    expect(chain.order).toHaveBeenCalledTimes(3);
  });

  it("trims and creates a user-scoped list", async () => {
    const row = {
      id: "list-1",
      user_id: "user-1",
      name: "Groceries",
      system_key: null,
      sort_order: 0,
      created_at: "now",
      updated_at: "now",
    };
    const { chain, inserted } = query({ data: [row], error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue({
      from: vi.fn(() => chain),
    } as never);
    await expect(
      createMyListList({ userId: "user-1", name: "  Groceries  " }),
    ).resolves.toMatchObject({
      id: "list-1",
      userId: "user-1",
      name: "Groceries",
    });
    expect(inserted).toEqual([{ user_id: "user-1", name: "Groceries" }]);
  });

  it("provisions Grocery List when it is missing", async () => {
    const groceryRow = {
      id: "list-grocery",
      user_id: "user-1",
      name: MY_LIST_GROCERY_NAME,
      system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const { chain, inserted } = query(
      { data: [], error: null },
      { data: [groceryRow], error: null },
      { data: [groceryRow], error: null },
    );
    vi.mocked(getSupabaseBrowser).mockReturnValue({
      from: vi.fn(() => chain),
    } as never);

    await expect(loadMyListLists("user-1")).resolves.toMatchObject([
      {
        id: "list-grocery",
        name: MY_LIST_GROCERY_NAME,
        systemKey: MY_LIST_GROCERY_SYSTEM_KEY,
      },
    ]);
    expect(inserted).toEqual([
      {
        user_id: "user-1",
        name: MY_LIST_GROCERY_NAME,
        system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      },
    ]);
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: MY_LIST_GROCERY_NAME,
      system_key: MY_LIST_GROCERY_SYSTEM_KEY,
    });
  });

  it("adopts an existing case-insensitive Grocery List", async () => {
    const existingRow = {
      id: "list-existing",
      user_id: "user-1",
      name: " grocery   list ",
      system_key: null,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const adoptedRow = {
      ...existingRow,
      name: MY_LIST_GROCERY_NAME,
      system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      updated_at: "2026-01-01T00:00:01.000Z",
    };
    const { chain, updated } = query(
      { data: [existingRow], error: null },
      { data: [adoptedRow], error: null },
      { data: [adoptedRow], error: null },
    );
    vi.mocked(getSupabaseBrowser).mockReturnValue({
      from: vi.fn(() => chain),
    } as never);

    await expect(loadMyListLists("user-1")).resolves.toMatchObject([
      {
        id: "list-existing",
        name: MY_LIST_GROCERY_NAME,
        systemKey: MY_LIST_GROCERY_SYSTEM_KEY,
      },
    ]);
    expect(updated).toEqual([
      {
        name: MY_LIST_GROCERY_NAME,
        system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      },
    ]);
  });

  it("orders Grocery List before ordinary custom lists", async () => {
    const rows = [
      {
        id: "list-custom",
        user_id: "user-1",
        name: "Alpha",
        system_key: null,
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "list-grocery",
        user_id: "user-1",
        name: MY_LIST_GROCERY_NAME,
        system_key: MY_LIST_GROCERY_SYSTEM_KEY,
        sort_order: 0,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    const { chain } = query({ data: rows, error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue({
      from: vi.fn(() => chain),
    } as never);

    await expect(loadMyListLists("user-1")).resolves.toMatchObject([
      { id: "list-grocery" },
      { id: "list-custom" },
    ]);
  });

  it("rejects empty names before accessing Supabase", async () => {
    await expect(
      createMyListList({ userId: "user-1", name: "   " }),
    ).rejects.toThrow("cannot be empty");
    expect(getSupabaseBrowser).not.toHaveBeenCalled();
  });
});
