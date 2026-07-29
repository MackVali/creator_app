// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskLite } from "../../src/lib/scheduler/weight";
import type {
  MyListPinnedGoalRow,
  MyListPinnedSourceRow,
} from "../../src/components/my-list/MyListSheet";

vi.mock("@/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("../../src/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

if (!globalThis.PointerEvent) {
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
}

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

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

const taskRow = (id: string, name: string): TaskLite => ({
  id,
  name,
  priority: "MEDIUM",
  stage: "TODO",
  duration_min: 30,
  energy: "MEDIUM",
});

const renderSheet = async (options?: {
  tasks?: TaskLite[];
  onTogglePinnedSourceCompletion?: ReturnType<typeof vi.fn>;
  onToggleTask?: ReturnType<typeof vi.fn>;
  userId?: string | null;
}) => {
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
      projects: [],
    },
  ];

  const onToggleTask = options?.onToggleTask ?? vi.fn();
  const onTogglePinnedSourceCompletion =
    options?.onTogglePinnedSourceCompletion ?? vi.fn();

  await act(async () => {
    root.render(
      React.createElement(MyListSheet, {
        open: true,
        onOpenChange: vi.fn(),
        userId: options && "userId" in options ? options.userId : "user-1",
        tasks: options?.tasks ?? [],
        pinnedSourceRows,
        pinnedGoalRows,
        monuments: [],
        goalMonumentIdsById: {},
        projectGoalIdsById: {},
        skills: [],
        skillCategories: [],
        pendingTaskIds: new Set<string>(),
        useFullExpandedHeight: false,
        onTogglePinnedSourceCompletion,
        onToggleTask,
        onTaskSkillSelect: vi.fn(),
      })
    );
  });

  return { container, onTogglePinnedSourceCompletion, onToggleTask, root };
};

const getTodoRowByText = (container: HTMLElement, text: string) => {
  const textNode = Array.from(container.querySelectorAll("span, input")).find(
    (element) =>
      element.textContent === text ||
      (element instanceof HTMLInputElement && element.value === text)
  );
  const row = textNode?.closest('[data-creator-xp-source="my-list-todo"]');
  expect(row).toBeTruthy();
  return row as HTMLElement;
};

const getCheckboxParts = (row: HTMLElement) => {
  const target = row.querySelector("[data-my-list-checkbox]");
  const input = target?.querySelector('input[type="checkbox"]');
  const label = target?.querySelector("label");
  expect(target).toBeTruthy();
  expect(input).toBeTruthy();
  expect(label).toBeTruthy();
  return {
    input: input as HTMLInputElement,
    label: label as HTMLLabelElement,
    target: target as HTMLElement,
  };
};

const getRowControls = (row: HTMLElement) => {
  const controls = Array.from(row.querySelectorAll("div")).find(
    (element) =>
      typeof element.className === "string" &&
      element.className.includes("ml-auto") &&
      element.className.includes("transition-opacity")
  );
  expect(controls).toBeTruthy();
  return controls as HTMLDivElement;
};

const pointerDown = (target: HTMLElement) => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "touch",
    })
  );
};

const clickCheckbox = async (row: HTMLElement) => {
  const { label, target } = getCheckboxParts(row);

  await act(async () => {
    pointerDown(target);
  });

  expect(getRowControls(row).className).toContain("w-0");

  await act(async () => {
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        pointerType: "touch",
      })
    );
    label.click();
  });
};

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("MyListSheet checkbox interactions", () => {
  it("toggles a manual todo checkbox without activating row controls first", async () => {
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-1",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Manual Todo",
          insertAfterRowKey: null,
        },
      ])
    );
    const { container, root } = await renderSheet({ userId: null });

    await clickCheckbox(getTodoRowByText(container, "Manual Todo"));

    expect(
      JSON.parse(
        window.localStorage.getItem("creator:my-list:manual-rows") ?? "[]"
      )[0]
    ).toMatchObject({ done: true, text: "Manual Todo" });

    await act(async () => {
      root.unmount();
    });
  });

  it("toggles task and pinned source checkboxes without activating row controls first", async () => {
    const { container, onTogglePinnedSourceCompletion, onToggleTask, root } =
      await renderSheet({
        tasks: [taskRow("task-todo-1", "Task Todo")],
      });

    await clickCheckbox(getTodoRowByText(container, "Task Todo"));
    expect(onToggleTask).toHaveBeenCalledTimes(1);
    expect(onToggleTask).toHaveBeenCalledWith(
      "task-todo-1",
      expect.any(Object),
      expect.any(Object)
    );

    for (const title of [
      "Standalone Project",
      "Standalone Task",
      "Standalone Habit",
    ]) {
      await clickCheckbox(getTodoRowByText(container, title));
    }

    expect(onTogglePinnedSourceCompletion).toHaveBeenCalledTimes(3);
    expect(
      onTogglePinnedSourceCompletion.mock.calls.map(
        ([row]: [MyListPinnedSourceRow]) => row.sourceType
      )
    ).toEqual(["PROJECT", "TASK", "HABIT"]);

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps non-checkbox row pointer behavior intact", async () => {
    const { container, root } = await renderSheet();
    const row = getTodoRowByText(container, "Standalone Project");
    const title = Array.from(row.querySelectorAll("span")).find(
      (element) => element.textContent === "Standalone Project"
    );
    expect(title).toBeTruthy();

    await act(async () => {
      pointerDown(title as HTMLElement);
    });

    expect(getRowControls(row).className).toContain("w-auto");

    await act(async () => {
      root.unmount();
    });
  });
});
