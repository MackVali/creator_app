import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "../../lib/supabase";
import {
  createManualMyListItem,
  consumeManualMyListUpgradeSource,
  deleteManualMyListItem,
  MY_LIST_MANUAL_ITEM_CREATED_EVENT,
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

function createManualLocalIdDeleteClient({
  localRows,
  deleteResult,
}: {
  localRows: unknown[];
  deleteResult: DeleteResult;
}) {
  const fetchFilters: Array<{ column: string; value: unknown }> = [];
  const deleteFilters: Array<{ column: string; value: unknown }> = [];
  const fetchChain = {
    select: vi.fn(() => fetchChain),
    eq: vi.fn((column: string, value: unknown) => {
      fetchFilters.push({ column, value });
      return fetchChain;
    }),
    order: vi.fn(() => fetchChain),
    then: vi.fn((resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: localRows, error: null }).then(resolve),
    ),
  };
  const deleteChain = {
    delete: vi.fn(() => deleteChain),
    eq: vi.fn((column: string, value: unknown) => {
      deleteFilters.push({ column, value });
      return deleteChain;
    }),
    select: vi.fn(async () => deleteResult),
  };
  const client = {
    from: vi
      .fn()
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(deleteChain),
  };

  return { client, deleteChain, deleteFilters, fetchChain, fetchFilters };
}

function createManualInsertClient({
  existingRows = [],
  insertedRows,
}: {
  existingRows?: unknown[];
  insertedRows: unknown[];
}) {
  const fetchFilters: Array<{ column: string; value: unknown }> = [];
  const insertedValues: unknown[] = [];
  const fetchChain = {
    select: vi.fn(() => fetchChain),
    eq: vi.fn((column: string, value: unknown) => {
      fetchFilters.push({ column, value });
      return fetchChain;
    }),
    order: vi.fn(() => fetchChain),
    then: vi.fn((resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: existingRows, error: null }).then(resolve),
    ),
  };
  const insertChain = {
    insert: vi.fn((value: unknown) => {
      insertedValues.push(value);
      return insertChain;
    }),
    select: vi.fn(async () => ({ data: insertedRows, error: null })),
  };
  const client = {
    from: vi
      .fn()
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain),
  };

  return { client, fetchChain, fetchFilters, insertChain, insertedValues };
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

  it("resolves a local manual row id before deleting the persisted row", async () => {
    const localRowId = "manual-123";
    const persistedItemId = "22222222-2222-4222-8222-222222222222";
    const { client, deleteChain, deleteFilters, fetchFilters } =
      createManualLocalIdDeleteClient({
        localRows: [
          {
            id: persistedItemId,
            item_kind: "MANUAL",
            metadata: { local_row_id: localRowId },
          },
        ],
        deleteResult: {
          data: [{ id: persistedItemId }],
          error: null,
        },
      });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await deleteManualMyListItem({ userId: "user-1", itemId: localRowId });

    expect(fetchFilters).toEqual([
      { column: "user_id", value: "user-1" },
      { column: "item_kind", value: "MANUAL" },
    ]);
    expect(deleteChain.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.select).toHaveBeenCalledWith("id");
    expect(deleteFilters).toEqual([
      { column: "user_id", value: "user-1" },
      { column: "item_kind", value: "MANUAL" },
      { column: "id", value: persistedItemId },
    ]);
  });

  it("does not delete when a local manual row id cannot be resolved", async () => {
    const { client, deleteChain } = createManualLocalIdDeleteClient({
      localRows: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          item_kind: "MANUAL",
          metadata: { local_row_id: "other-local-row" },
        },
      ],
      deleteResult: { data: [], error: null },
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      deleteManualMyListItem({ userId: "user-1", itemId: "manual-123" }),
    ).rejects.toThrow("found no persisted row");

    expect(deleteChain.delete).not.toHaveBeenCalled();
  });

  it("treats an empty delete result as failure", async () => {
    const { client } = createManualDeleteClient({ data: [], error: null });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      deleteManualMyListItem({ userId: "user-1", itemId }),
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
      }),
    ).rejects.toThrow("affected no persisted rows");

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

describe("createManualMyListItem", () => {
  it("inserts one canonical MANUAL my_list_items row and dispatches a created event", async () => {
    const itemId = "22222222-2222-4222-8222-222222222222";
    const listId = "33333333-3333-4333-8333-333333333333";
    const { client, fetchFilters, insertChain, insertedValues } =
      createManualInsertClient({
        existingRows: [{ id: "existing" }],
        insertedRows: [
          {
            id: itemId,
            user_id: "user-1",
            list_id: listId,
            item_kind: "MANUAL",
            source_type: null,
            source_id: null,
            text: "Ship edit",
            done: false,
            completed_at: null,
            priority_id: "HIGH",
            day_bucket_id: null,
            skill_id: "skill-1",
            skill_name: "Editing",
            skill_icon: "E",
            icon: null,
            insert_after_row_key: null,
            sort_order: 1,
            metadata: {},
          },
        ],
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

    const item = await createManualMyListItem({
      userId: "user-1",
      listId,
      text: "  Ship edit  ",
      skillId: "skill-1",
      skillName: "Editing",
      skillIcon: "E",
      priorityId: "HIGH",
    });

    expect(client.from).toHaveBeenCalledWith("my_list_items");
    expect(fetchFilters).toEqual([
      { column: "user_id", value: "user-1" },
      { column: "item_kind", value: "MANUAL" },
    ]);
    expect(insertChain.insert).toHaveBeenCalledTimes(1);
    expect(insertedValues[0]).toMatchObject({
      user_id: "user-1",
      list_id: listId,
      item_kind: "MANUAL",
      source_type: null,
      source_id: null,
      text: "Ship edit",
      done: false,
      completed_at: null,
      priority_id: "HIGH",
      skill_id: "skill-1",
      skill_name: "Editing",
      skill_icon: "E",
      sort_order: 1,
    });
    expect(item).toMatchObject({
      id: itemId,
      listId,
      text: "Ship edit",
      priorityId: "HIGH",
      skillId: "skill-1",
      skillName: "Editing",
      skillIcon: "E",
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(MY_LIST_MANUAL_ITEM_CREATED_EVENT);
    expect(event.detail).toEqual({
      origin: "manual-my-list-create",
      userId: "user-1",
      item,
    });
  });

  it("maps a legacy row without list_id to the default My List", async () => {
    const itemId = "44444444-4444-4444-8444-444444444444";
    const { client } = createManualInsertClient({
      insertedRows: [
        {
          id: itemId,
          user_id: "user-1",
          item_kind: "MANUAL",
          text: "Legacy",
          done: false,
        },
      ],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);
    const item = await createManualMyListItem({
      userId: "user-1",
      text: "Legacy",
    });
    expect(item.listId).toBeNull();
  });
});
