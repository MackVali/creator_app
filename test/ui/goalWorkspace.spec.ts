// @vitest-environment jsdom

import React, { forwardRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteTodo } from "../../src/lib/notes/noteTodos";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workspaceStorageMocks = vi.hoisted(() => ({
  loadGoalWorkspace: vi.fn(),
  saveGoalWorkspace: vi.fn(),
}));

const noteTextareaProps: Array<Record<string, unknown>> = [];

const MockNoteSlashTextarea = forwardRef(
  (
    props: {
      value: string;
      onValueChange: (value: string) => void;
      noteTodos: NoteTodo[];
      onNoteTodosChange: (todos: NoteTodo[]) => void;
    },
    ref,
  ) => {
    noteTextareaProps.push(props as unknown as Record<string, unknown>);
    useImperativeHandle(ref, () => ({
      applyBlockFormat: vi.fn(),
      applyTextFormat: vi.fn(),
    }));
    return React.createElement(
      "div",
      null,
      React.createElement("textarea", {
        "aria-label": "Goal workspace",
        value: props.value,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          props.onValueChange(event.target.value),
      }),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            props.onNoteTodosChange([
              {
                id: "todo-1",
                title: "Promoted todo",
                completed: false,
                priority: "HIGH",
                skillId: "skill-1",
                energy: "MEDIUM",
              },
            ]),
        },
        "promote",
      ),
    );
  },
);
MockNoteSlashTextarea.displayName = "MockNoteSlashTextarea";

vi.mock("../../src/lib/goals/goalWorkspace", () => workspaceStorageMocks);
vi.mock("@/lib/goals/goalWorkspace", () => workspaceStorageMocks);

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: () => ({
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: [], error: null })),
    })),
  }),
}));

vi.mock("@/components/notes/NoteTextActionBar", () => ({
  NoteTextActionBar: () =>
    React.createElement("div", { "data-testid": "note-toolbar" }),
}));

vi.mock("@/components/notes/NoteSlashTextarea", () => ({
  NoteSlashTextarea: MockNoteSlashTextarea,
}));

vi.mock("@/components/ui/Progress", () => ({
  Progress: () => React.createElement("div", { "data-testid": "progress" }),
}));

vi.mock("../../src/app/(app)/goals/components/ProjectsDropdown", () => ({
  ProjectsDropdown: () =>
    React.createElement("div", { "data-testid": "projects-dropdown" }),
}));

vi.mock(
  "/Users/validtali/premium-app/src/app/(app)/goals/components/ProjectsDropdown.tsx",
  () => ({
    ProjectsDropdown: () =>
      React.createElement("div", { "data-testid": "projects-dropdown" }),
  }),
);

describe("GoalWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    workspaceStorageMocks.loadGoalWorkspace.mockReset();
    workspaceStorageMocks.saveGoalWorkspace.mockReset();
    workspaceStorageMocks.loadGoalWorkspace.mockResolvedValue({
      content: "Existing workspace note",
      goalId: "goal-1",
      noteTodos: [],
      updatedAt: null,
    });
    workspaceStorageMocks.saveGoalWorkspace.mockResolvedValue(null);
    noteTextareaProps.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads and persists goal-owned workspace note and todos", async () => {
    const { GoalWorkspace } = await import(
      "../../src/app/(app)/goals/components/GoalWorkspace"
    );
    const goal = {
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      energy: "Medium",
      id: "goal-1",
      priority: "High",
      progress: 0,
      projects: [],
      status: "ACTIVE",
      title: "Goal",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as React.ComponentProps<typeof GoalWorkspace>["goal"];

    await act(async () => {
      root.render(React.createElement(GoalWorkspace, { goal, loading: false }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLTextAreaElement>('[aria-label="Goal workspace"]')
        ?.value,
    ).toBe("Existing workspace note");
    expect(noteTextareaProps.at(-1)?.noteTodoOwner).toEqual({
      type: "GOAL",
      id: "goal-1",
    });

    await act(async () => {
      container
        .querySelector<HTMLTextAreaElement>('[aria-label="Goal workspace"]')
        ?.focus();
    });
    expect(container.querySelector('[data-testid="note-toolbar"]')).toBeTruthy();

    await act(async () => {
      (
        noteTextareaProps.at(-1)?.onValueChange as
          | ((value: string) => void)
          | undefined
      )?.("Updated workspace note");
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(workspaceStorageMocks.saveGoalWorkspace).toHaveBeenLastCalledWith({
      goalId: "goal-1",
      content: "Updated workspace note",
      noteTodos: [
        expect.objectContaining({
          id: "todo-1",
          priority: "HIGH",
          skillId: "skill-1",
          title: "Promoted todo",
        }),
      ],
    });
  });
});
