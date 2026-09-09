import { describe, expect, it, vi } from "vitest";

import {
  NOTE_TODO_DEFAULT_PRIORITY,
  buildNoteTodoMarker,
  createNoteTodoId,
  parseStandaloneNoteTodoMarker,
  readNoteTodos,
  setGoalNoteTodoCompleted,
  upsertNoteTodo,
  writeNoteTodosMetadata,
  type NoteTodo,
} from "@/lib/notes/noteTodos";

const baseTodo: NoteTodo = {
  id: "todo-1",
  title: "Ship the draft",
  completed: false,
  priority: "MEDIUM",
  skillId: null,
  energy: "MEDIUM",
};

describe("note todo metadata", () => {
  it("serializes and parses stable note-owned todo markers without duplicating title", () => {
    const marker = buildNoteTodoMarker("todo-1");

    expect(marker).toBe("[Todo](creator-note-todo:todo-1)");
    expect(parseStandaloneNoteTodoMarker(marker)).toEqual({ todoId: "todo-1" });
  });

  it("does not parse My List or checklist rows as note todos", () => {
    expect(parseStandaloneNoteTodoMarker("- [ ] Ship the draft")).toBeNull();
    expect(parseStandaloneNoteTodoMarker("[Todo](creator-my-list:todo-1)")).toBeNull();
  });

  it("reads todos from note metadata and normalizes priority", () => {
    expect(
      readNoteTodos({
        noteTodos: [{ ...baseTodo, priority: "not-real", completed: true }],
      }),
    ).toEqual([
      {
        ...baseTodo,
        completed: true,
        priority: NOTE_TODO_DEFAULT_PRIORITY,
      },
    ]);
  });

  it("writes note todos without touching existing metadata", () => {
    expect(writeNoteTodosMetadata({ icon: "x" }, [baseTodo])).toEqual({
      icon: "x",
      noteTodos: [baseTodo],
    });
  });

  it("upserts by stable todo id", () => {
    expect(
      upsertNoteTodo([baseTodo], {
        ...baseTodo,
        title: "Updated",
        completed: true,
      }),
    ).toEqual([{ ...baseTodo, title: "Updated", completed: true }]);
  });

  it("creates stable unique ids through crypto when available", () => {
    const randomUUID = vi.fn(() => "uuid-1");
    vi.stubGlobal("crypto", { randomUUID });

    expect(createNoteTodoId()).toBe("uuid-1");
    expect(randomUUID).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("marks a goal note todo complete in goal workspace metadata", async () => {
    const calls: Array<{
      table: string;
      update?: Record<string, unknown>;
      filters: Array<{ column: string; value: unknown }>;
    }> = [];
    const row = {
      goal_id: "goal-1",
      metadata: {
        icon: "x",
        noteTodos: [baseTodo],
      },
    };
    const client = {
      from: vi.fn((table: string) => {
        const call = { table, filters: [] as Array<{ column: string; value: unknown }> };
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            call.filters.push({ column, value });
            return builder;
          },
          maybeSingle: async () => {
            calls.push(call);
            return { data: row, error: null };
          },
          update: (update: Record<string, unknown>) => {
            calls.push({ ...call, update });
            return builder;
          },
        };
        return builder;
      }),
    };

    await expect(
      setGoalNoteTodoCompleted({
        client: client as never,
        userId: "user-1",
        goalId: "goal-1",
        todoId: "todo-1",
        completed: true,
      })
    ).resolves.toEqual({ ok: true });

    expect(client.from).not.toHaveBeenCalledWith("tasks");
    const updateCall = calls.find((call) => call.update);
    expect(updateCall?.table).toBe("goal_workspaces");
    expect(updateCall?.filters).toEqual([
      { column: "user_id", value: "user-1" },
      { column: "goal_id", value: "goal-1" },
    ]);
    expect(updateCall?.update?.metadata).toMatchObject({
      icon: "x",
      noteTodos: [{ ...baseTodo, completed: true }],
    });
  });
});
