import { describe, expect, it, vi } from "vitest";

import {
  NOTE_TODO_DEFAULT_PRIORITY,
  buildNoteTodoMarker,
  createNoteTodoId,
  parseStandaloneNoteTodoMarker,
  readNoteTodos,
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
});
