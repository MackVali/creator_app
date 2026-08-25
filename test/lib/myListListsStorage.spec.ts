import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "../../lib/supabase";
import {
  createMyListList,
  loadMyListLists,
} from "../../src/lib/my-list/myListListsStorage";

vi.mock("../../lib/supabase", () => ({ getSupabaseBrowser: vi.fn() }));

function query(result: unknown) {
  const filters: Array<[string, unknown]> = [];
  const inserted: unknown[] = [];
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
    then: vi.fn((resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
    ),
  };
  return { chain, filters, inserted };
}

beforeEach(() => vi.mocked(getSupabaseBrowser).mockReset());

describe("myListListsStorage", () => {
  it("loads lists scoped to the authenticated user", async () => {
    const { chain, filters } = query({ data: [], error: null });
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

  it("rejects empty names before accessing Supabase", async () => {
    await expect(
      createMyListList({ userId: "user-1", name: "   " }),
    ).rejects.toThrow("cannot be empty");
    expect(getSupabaseBrowser).not.toHaveBeenCalled();
  });
});
