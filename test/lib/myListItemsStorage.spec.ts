import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "../../lib/supabase";
import { deleteManualMyListItem } from "../../src/lib/my-list/myListItemsStorage";

vi.mock("../../lib/supabase", () => ({
  getSupabaseBrowser: vi.fn(),
}));

type DeleteResult = {
  data: Array<{ id: string }> | null;
  error: { message?: string } | null;
};

function createManualDeleteClient(result: DeleteResult) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      return chain;
    }),
    select: vi.fn(async () => result),
  };
  const client = {
    from: vi.fn(() => chain),
  };

  return { chain, client, filters };
}

beforeEach(() => {
  vi.mocked(getSupabaseBrowser).mockReset();
});

describe("deleteManualMyListItem", () => {
  const itemId = "11111111-1111-4111-8111-111111111111";

  it("deletes by the persisted my_list_items id and user scope", async () => {
    const { chain, client, filters } = createManualDeleteClient({
      data: [{ id: itemId }],
      error: null,
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await deleteManualMyListItem({ userId: "user-1", itemId });

    expect(client.from).toHaveBeenCalledWith("my_list_items");
    expect(chain.delete).toHaveBeenCalledTimes(1);
    expect(chain.select).toHaveBeenCalledWith("id");
    expect(filters).toEqual([
      { column: "user_id", value: "user-1" },
      { column: "item_kind", value: "MANUAL" },
      { column: "id", value: itemId },
    ]);
  });

  it("rejects sortable manual row keys before calling Supabase", async () => {
    const { client } = createManualDeleteClient({ data: [], error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      deleteManualMyListItem({ userId: "user-1", itemId: `manual:${itemId}` })
    ).rejects.toThrow("persisted my_list_items.id");

    expect(client.from).not.toHaveBeenCalled();
  });

  it("treats an empty delete result as failure", async () => {
    const { client } = createManualDeleteClient({ data: [], error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      deleteManualMyListItem({ userId: "user-1", itemId })
    ).rejects.toThrow("affected no persisted rows");
  });
});
