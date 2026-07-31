import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "../../lib/supabase";
import {
  consumeManualMyListUpgradeSource,
  deleteManualMyListItem,
  MY_LIST_MANUAL_ITEM_CONSUMED_EVENT,
} from "../../src/lib/my-list/myListItemsStorage";

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
  vi.unstubAllGlobals();
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

  it("dispatches a consumed event only after the guarded delete succeeds", async () => {
    const { client } = createManualDeleteClient({
      data: [{ id: itemId }],
      error: null,
    });
    const dispatchEvent = vi.fn();
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "CustomEvent",
      class TestCustomEvent<T = unknown> extends Event {
        detail: T;

        constructor(type: string, init?: CustomEventInit<T>) {
          super(type);
          this.detail = init?.detail as T;
        }
      },
    );

    await consumeManualMyListUpgradeSource({
      userId: "user-1",
      itemId,
      createdEntityType: "TASK",
      createdEntityId: "task-1",
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(MY_LIST_MANUAL_ITEM_CONSUMED_EVENT);
    expect(event.detail).toEqual({
      origin: "manual-my-list-upgrade",
      userId: "user-1",
      itemId,
      createdEntityType: "TASK",
      createdEntityId: "task-1",
    });
  });

  it("does not dispatch consumed when source deletion fails", async () => {
    const { client } = createManualDeleteClient({
      data: [],
      error: null,
    });
    const dispatchEvent = vi.fn();
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);
    vi.stubGlobal("window", { dispatchEvent });

    await expect(
      consumeManualMyListUpgradeSource({
        userId: "user-1",
        itemId,
        createdEntityType: "HABIT",
        createdEntityId: "habit-1",
      })
    ).rejects.toThrow("affected no persisted rows");

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
