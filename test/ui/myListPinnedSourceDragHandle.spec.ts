// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("../../src/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import type {
  MyListPinnedGoalRow,
  MyListPinnedSourceRow,
} from "../../src/components/my-list/MyListSheet";

const standalonePinnedRow = (
  id: string,
  sourceType: "PROJECT" | "TASK" | "HABIT",
  title: string
): MyListPinnedSourceRow => ({
  id,
  sourceType,
  rowKind: "PINNED_SOURCE",
  title,
  isPinned: true,
  completedAt: null,
});

const renderSheet = async () => {
  const { MyListSheet } = await import(
    "../../src/components/my-list/MyListSheet"
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const pinnedSourceRows: MyListPinnedSourceRow[] = [
    standalonePinnedRow("project-1", "PROJECT", "Standalone Project"),
    standalonePinnedRow("task-1", "TASK", "Standalone Task"),
    standalonePinnedRow("habit-1", "HABIT", "Standalone Habit"),
  ];
  const pinnedGoalRows: MyListPinnedGoalRow[] = [
    {
      id: "goal-1",
      sourceType: "GOAL",
      title: "Pinned Goal",
      icon: "G",
      projects: [
        {
          id: "project-descendant-1",
          sourceType: "PROJECT",
          title: "Goal Descendant Project",
          goalId: "goal-1",
          isPinned: false,
          completedAt: null,
        },
      ],
    },
  ];

  await act(async () => {
    root.render(
      React.createElement(MyListSheet, {
        open: true,
        onOpenChange: vi.fn(),
        userId: "user-1",
        tasks: [],
        pinnedSourceRows,
        pinnedGoalRows,
        monuments: [],
        goalMonumentIdsById: {},
        projectGoalIdsById: {},
        skills: [],
        skillCategories: [],
        pendingTaskIds: new Set<string>(),
        useFullExpandedHeight: false,
        onToggleTask: vi.fn(),
        onTaskSkillSelect: vi.fn(),
      })
    );
  });

  return { container, root };
};

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("MyListSheet standalone pinned source drag handles", () => {
  it("renders handles only for standalone pinned Project, Task, and Habit rows", async () => {
    const { container, root } = await renderSheet();

    const standaloneHandles = () =>
      container.querySelectorAll(
        '[data-testid="my-list-pinned-source-drag-handle"]'
      );

    expect(standaloneHandles()).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-my-list-row-kind="PINNED_SOURCE"][data-my-list-source-type="PROJECT"]'
      )?.textContent
    ).toContain("Standalone Project");
    expect(container.textContent).toContain("Standalone Project");
    expect(container.textContent).toContain("Standalone Task");
    expect(container.textContent).toContain("Standalone Habit");
    expect(container.textContent).toContain("Pinned Goal");

    const goalButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Pinned Goal")
    );
    expect(goalButton).toBeTruthy();

    await act(async () => {
      goalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Goal Descendant Project");
    expect(standaloneHandles()).toHaveLength(3);

    await act(async () => {
      root.unmount();
    });
  });
});
