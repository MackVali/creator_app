// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskLite } from "../../src/lib/scheduler/weight";
import type {
  MyListPinnedGoalRow,
  MyListPinnedSourceRow,
} from "../../src/components/my-list/MyListSheet";
import { MY_LIST_MANUAL_ITEM_CONSUMED_EVENT } from "../../src/lib/my-list/myListItemsStorage";

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
  enableScheduleTimelineDrag?: boolean;
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

  type MyListSheetProps = React.ComponentProps<typeof MyListSheet>;
  const onToggleTaskMock = options?.onToggleTask ?? vi.fn();
  const onTogglePinnedSourceCompletionMock =
    options?.onTogglePinnedSourceCompletion ?? vi.fn();
  const onToggleTask =
    onToggleTaskMock as MyListSheetProps["onToggleTask"];
  const onTogglePinnedSourceCompletion =
    onTogglePinnedSourceCompletionMock as MyListSheetProps["onTogglePinnedSourceCompletion"];

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
        enableScheduleTimelineDrag: options?.enableScheduleTimelineDrag === true,
        onTogglePinnedSourceCompletion,
        onToggleTask,
        onTaskSkillSelect: vi.fn(),
      })
    );
  });

  return {
    container,
    onTogglePinnedSourceCompletion: onTogglePinnedSourceCompletionMock,
    onToggleTask: onToggleTaskMock,
    root,
  };
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
  vi.useRealTimers();
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
        (call) => (call[0] as MyListPinnedSourceRow).sourceType
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

  it("includes the manual row id in the long-press upgrade payload", async () => {
    vi.useFakeTimers();
    const manualRowId = "11111111-1111-4111-8111-111111111111";
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: manualRowId,
          done: false,
          completedAt: null,
          skillId: "skill-1",
          skillName: "Writing",
          skillIcon: "W",
          priorityId: "HIGH",
          dayBucketId: null,
          text: "Upgrade Me",
          insertAfterRowKey: null,
        },
      ])
    );
    const quickCreateEvents: CustomEvent[] = [];
    const handleQuickCreate = (event: Event) => {
      quickCreateEvents.push(event as CustomEvent);
    };
    window.addEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    const { container, root } = await renderSheet({
      userId: null,
      enableScheduleTimelineDrag: true,
    });

    await act(async () => {
      pointerDown(getTodoRowByText(container, "Upgrade Me"));
      vi.advanceTimersByTime(500);
    });

    expect(quickCreateEvents).toHaveLength(1);
    expect(quickCreateEvents[0]?.detail).toMatchObject({
      title: "Upgrade Me",
      skillId: "skill-1",
      priority: "HIGH",
      origin: "my-list-upgrade",
      sourceManualMyListItemId: manualRowId,
    });

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("removes a manual row locally after a successful upgrade consumption event", async () => {
    const consumedRowId = "11111111-1111-4111-8111-111111111111";
    const remainingRowId = "22222222-2222-4222-8222-222222222222";
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: consumedRowId,
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Consumed Todo",
          insertAfterRowKey: null,
        },
        {
          id: remainingRowId,
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Remaining Todo",
          insertAfterRowKey: null,
        },
      ])
    );
    const { container, root } = await renderSheet({ userId: null });

    expect(getTodoRowByText(container, "Consumed Todo")).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(MY_LIST_MANUAL_ITEM_CONSUMED_EVENT, {
          detail: {
            origin: "manual-my-list-upgrade",
            userId: "user-1",
            itemId: consumedRowId,
            createdEntityType: "TASK",
            createdEntityId: "task-1",
          },
        })
      );
    });

    expect(
      Array.from(container.querySelectorAll("input")).some(
        (input) => input instanceof HTMLInputElement && input.value === "Consumed Todo"
      )
    ).toBe(false);
    expect(getTodoRowByText(container, "Remaining Todo")).toBeTruthy();
    expect(
      JSON.parse(
        window.localStorage.getItem("creator:my-list:manual-rows") ?? "[]"
      )
    ).toEqual([
      expect.objectContaining({
        id: remainingRowId,
        text: "Remaining Todo",
      }),
    ]);

    await act(async () => {
      root.unmount();
    });
  });
});
