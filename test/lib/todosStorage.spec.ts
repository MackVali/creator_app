import { describe, expect, it, vi } from "vitest";

import * as todosStorage from "../../src/lib/todos/todosStorage";
import {
  createTodo,
  getTodo,
  loadTodos,
  setTodoCompleted,
  softDeleteTodo,
  todoRowToTodo,
  updateTodo,
  type TodoRow,
} from "../../src/lib/todos/todosStorage";

const row: TodoRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  owner_type: "MY_LIST",
  owner_id: null,
  note_id: null,
  list_id: "22222222-2222-4222-8222-222222222222",
  title: "Ship it",
  completed: false,
  completed_at: null,
  priority_id: "MEDIUM",
  day_bucket_id: null,
  skill_id: null,
  energy_id: "MEDIUM",
  sort_order: 7,
  insert_after_row_key: null,
  deleted_at: null,
  metadata: { legacySource: "test" },
  created_at: "2026-09-15T05:00:00.000Z",
  updated_at: "2026-09-15T05:00:00.000Z",
};

type CapturedCall = {
  table: string;
  select?: string;
  insert?: unknown;
  update?: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown; operator: "eq" | "is" }>;
  order?: { column: string; options?: Record<string, unknown> };
};

function createClient(result: TodoRow | TodoRow[] | null = row) {
  const calls: CapturedCall[] = [];
  const call: CapturedCall = { table: "", filters: [] };
  const builder = {
    select: vi.fn((columns?: string) => {
      call.select = columns;
      return builder;
    }),
    insert: vi.fn((value: unknown) => {
      call.insert = value;
      return builder;
    }),
    update: vi.fn((value: Record<string, unknown>) => {
      call.update = value;
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, value, operator: "eq" });
      return builder;
    }),
    is: vi.fn((column: string, value: null) => {
      call.filters.push({ column, value, operator: "is" });
      return builder;
    }),
    order: vi.fn((column: string, options?: Record<string, unknown>) => {
      call.order = { column, options };
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: Array.isArray(result) ? (result[0] ?? null) : result,
      error: null,
    })),
    then: vi.fn(
      (
        resolve: (value: {
          data: TodoRow | TodoRow[] | null;
          error: null;
        }) => unknown,
      ) => Promise.resolve({ data: result, error: null }).then(resolve),
    ),
  };

  const client = {
    from: vi.fn((table: string) => {
      call.table = table;
      calls.push(call);
      return builder;
    }),
  };

  return { builder, calls, client };
}

describe("todosStorage", () => {
  it("maps preserved todo ids cleanly into the domain model", () => {
    expect(todoRowToTodo(row)).toMatchObject({
      id: row.id,
      userId: "user-1",
      ownerType: "MY_LIST",
      title: "Ship it",
      sortOrder: 7,
      deletedAt: null,
    });
  });

  it("createTodo uses insert semantics, not upsert", async () => {
    const { builder, calls, client } = createClient(row);

    await createTodo({
      client: client as never,
      userId: "user-1",
      id: row.id,
      ownerType: "MY_LIST",
      listId: row.list_id,
      title: "Ship it",
    });

    expect(client.from).toHaveBeenCalledWith("todos");
    expect(builder.insert).toHaveBeenCalledTimes(1);
    expect("upsert" in builder).toBe(false);
    expect(calls[0]?.insert).toMatchObject({
      id: row.id,
      user_id: "user-1",
      owner_type: "MY_LIST",
      title: "Ship it",
    });
  });

  it("updateTodo targets one existing user-owned active id", async () => {
    const { calls, client } = createClient(row);

    await updateTodo({
      client: client as never,
      userId: "user-1",
      id: row.id,
      updates: { title: "Updated" },
    });

    expect(calls[0]?.update).toMatchObject({ title: "Updated" });
    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
      { column: "id", value: row.id, operator: "eq" },
      { column: "deleted_at", value: null, operator: "is" },
    ]);
  });

  it("does not revive a todo when a stale device updates an already-deleted row", async () => {
    const { builder, calls, client } = createClient(null);

    const result = await updateTodo({
      client: client as never,
      userId: "user-1",
      id: row.id,
      updates: {
        title: "Stale device edit",
        priorityId: "HIGH",
      },
    });

    expect(result).toBeNull();
    expect(builder.update).toHaveBeenCalledTimes(1);
    expect("insert" in builder && builder.insert).toBeTruthy();
    expect(calls[0]?.update).toMatchObject({
      title: "Stale device edit",
      priority_id: "HIGH",
    });
    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
      { column: "id", value: row.id, operator: "eq" },
      { column: "deleted_at", value: null, operator: "is" },
    ]);
  });

  it("getTodo and default loading exclude deleted rows", async () => {
    const getClient = createClient(row);
    await getTodo({
      client: getClient.client as never,
      userId: "user-1",
      id: row.id,
    });

    expect(getClient.calls[0]?.filters).toContainEqual({
      column: "deleted_at",
      value: null,
      operator: "is",
    });

    const loadClient = createClient([row]);
    await loadTodos({
      client: loadClient.client as never,
      userId: "user-1",
      ownerType: "MY_LIST",
    });

    expect(loadClient.calls[0]?.filters).toContainEqual({
      column: "deleted_at",
      value: null,
      operator: "is",
    });
  });

  it("loadTodos includes deleted rows only when explicitly requested", async () => {
    const { calls, client } = createClient([row]);

    await loadTodos({
      client: client as never,
      userId: "user-1",
      includeDeleted: true,
    });

    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
    ]);
  });

  it("uses IS NULL for explicitly null nullable filters", async () => {
    const { calls, client } = createClient([row]);

    await loadTodos({
      client: client as never,
      userId: "user-1",
      ownerId: null,
      listId: null,
      noteId: null,
    });

    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
      { column: "deleted_at", value: null, operator: "is" },
      { column: "owner_id", value: null, operator: "is" },
      { column: "list_id", value: null, operator: "is" },
      { column: "note_id", value: null, operator: "is" },
    ]);
  });

  it("completion is a guarded row-level update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T05:30:00.000Z"));
    const { calls, client } = createClient({ ...row, completed: true });

    await setTodoCompleted({
      client: client as never,
      userId: "user-1",
      id: row.id,
      completed: true,
    });

    expect(calls[0]?.update).toMatchObject({
      completed: true,
      completed_at: "2026-09-15T05:30:00.000Z",
    });
    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
      { column: "id", value: row.id, operator: "eq" },
      { column: "deleted_at", value: null, operator: "is" },
    ]);
    vi.useRealTimers();
  });

  it("softDeleteTodo writes a tombstone instead of issuing DELETE", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T06:00:00.000Z"));
    const { builder, calls, client } = createClient({
      ...row,
      deleted_at: "2026-09-15T06:00:00.000Z",
    });

    await softDeleteTodo({
      client: client as never,
      userId: "user-1",
      id: row.id,
    });

    expect("delete" in builder).toBe(false);
    expect(calls[0]?.update).toEqual({
      deleted_at: "2026-09-15T06:00:00.000Z",
      updated_at: "2026-09-15T06:00:00.000Z",
    });
    expect(calls[0]?.filters).toEqual([
      { column: "user_id", value: "user-1", operator: "eq" },
      { column: "id", value: row.id, operator: "eq" },
      { column: "deleted_at", value: null, operator: "is" },
    ]);
    vi.useRealTimers();
  });

  it("does not expose collection replacement APIs", () => {
    expect(todosStorage).not.toHaveProperty("replaceTodos");
    expect(todosStorage).not.toHaveProperty("replaceEntireTodoCollection");
    expect(todosStorage).not.toHaveProperty("syncLocalSnapshot");
    expect(todosStorage).not.toHaveProperty("upsertUnknownTodos");
  });
});
