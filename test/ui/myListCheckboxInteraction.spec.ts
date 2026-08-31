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
  onOpenChange?: ReturnType<typeof vi.fn>;
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
        onOpenChange: options?.onOpenChange ?? vi.fn(),
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

const getManualTitleDisplay = (row: HTMLElement, text: string) => {
  const display = row.querySelector<HTMLElement>(
    '[data-my-list-manual-title-display="true"]'
  );
  expect(display).toBeTruthy();
  expect(display?.textContent).toBe(text);
  return display as HTMLElement;
};

const getManualTitleInput = (row: HTMLElement) =>
  row.querySelector<HTMLInputElement>(
    'input[data-my-list-manual-title-input="true"]'
  );

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
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    pointerType: "touch",
  });
  target.dispatchEvent(event);
  return event;
};

const pointerMove = (
  target: HTMLElement,
  init: Partial<PointerEventInit> = {}
) => {
  const event = new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: init.clientX ?? 10,
    clientY: init.clientY ?? 10,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? "touch",
  });
  target.dispatchEvent(event);
  return event;
};

const pointerUp = (
  target: HTMLElement,
  init: Partial<PointerEventInit> = {}
) => {
  const event = new PointerEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: init.clientX ?? 10,
    clientY: init.clientY ?? 10,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? "touch",
  });
  target.dispatchEvent(event);
  return event;
};

const pointerCancel = (
  target: HTMLElement,
  init: Partial<PointerEventInit> = {}
) => {
  const event = new PointerEvent("pointercancel", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: init.clientX ?? 10,
    clientY: init.clientY ?? 10,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? "touch",
  });
  target.dispatchEvent(event);
  return event;
};

const touchStart = (target: HTMLElement) => {
  const event = new Event("touchstart", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: [{ identifier: 1, clientX: 10, clientY: 10 }],
  });
  Object.defineProperty(event, "changedTouches", {
    configurable: true,
    value: [{ identifier: 1, clientX: 10, clientY: 10 }],
  });
  target.dispatchEvent(event);
  return event;
};

const touchEnd = (target: HTMLElement) => {
  const event = new Event("touchend", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "changedTouches", {
    configurable: true,
    value: [{ identifier: 1, clientX: 10, clientY: 10 }],
  });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: [],
  });
  target.dispatchEvent(event);
  return event;
};

const touchCancel = (target: HTMLElement) => {
  const event = new Event("touchcancel", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "changedTouches", {
    configurable: true,
    value: [{ identifier: 1, clientX: 10, clientY: 10 }],
  });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: [],
  });
  target.dispatchEvent(event);
  return event;
};

const clickCheckbox = async (row: HTMLElement) => {
  const { label, target } = getCheckboxParts(row);

  await act(async () => {
    pointerDown(target);
  });

  expect(getRowControls(row).className).toContain("w-0");

  await act(async () => {
    pointerUp(target);
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

  it("defers manual todo long-press upgrade dispatch until pointer release", async () => {
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
    const onOpenChange = vi.fn();
    const { container, root } = await renderSheet({
      userId: null,
      enableScheduleTimelineDrag: true,
      onOpenChange,
    });
    const row = getTodoRowByText(container, "Upgrade Me");

    await act(async () => {
      pointerDown(row);
      vi.advanceTimersByTime(500);
    });

    expect(quickCreateEvents).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      pointerUp(row);
    });

    expect(quickCreateEvents).toHaveLength(1);
    expect(quickCreateEvents[0]?.detail).toMatchObject({
      title: "Upgrade Me",
      skillId: "skill-1",
      priority: "HIGH",
      origin: "manual-my-list-upgrade",
      sourceManualMyListItemId: manualRowId,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("does not dispatch a manual todo upgrade when released before the long-press threshold", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-early-release",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Early Release",
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
    const row = getTodoRowByText(container, "Early Release");

    await act(async () => {
      pointerDown(row);
      vi.advanceTimersByTime(499);
      pointerUp(row);
      vi.advanceTimersByTime(1);
    });

    expect(quickCreateEvents).toHaveLength(0);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("does not dispatch a manual todo upgrade after movement cancellation", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-move-cancel",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Move Cancel",
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
    const row = getTodoRowByText(container, "Move Cancel");

    await act(async () => {
      pointerDown(row);
      pointerMove(row, { clientX: 40, clientY: 10 });
      vi.advanceTimersByTime(500);
      pointerUp(row, { clientX: 40, clientY: 10 });
    });

    expect(quickCreateEvents).toHaveLength(0);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("does not dispatch a recognized manual todo upgrade on pointer cancel", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-pointer-cancel",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Pointer Cancel",
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
    const row = getTodoRowByText(container, "Pointer Cancel");

    await act(async () => {
      pointerDown(row);
      vi.advanceTimersByTime(500);
      pointerCancel(row);
      pointerUp(row);
    });

    expect(quickCreateEvents).toHaveLength(0);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("defers fallback touch manual todo upgrades until touch release and cancels on touchcancel", async () => {
    vi.useFakeTimers();
    const originalPointerEvent = window.PointerEvent;
    const hadPointerEvent = Object.prototype.hasOwnProperty.call(
      window,
      "PointerEvent"
    );
    Reflect.deleteProperty(window, "PointerEvent");

    try {
      window.localStorage.setItem(
        "creator:my-list:manual-rows",
        JSON.stringify([
          {
            id: "manual-touch-release",
            done: false,
            completedAt: null,
            skillId: null,
            skillName: null,
            skillIcon: "",
            priorityId: "MEDIUM",
            dayBucketId: null,
            text: "Touch Release",
            insertAfterRowKey: null,
          },
          {
            id: "manual-touch-cancel",
            done: false,
            completedAt: null,
            skillId: null,
            skillName: null,
            skillIcon: "",
            priorityId: "MEDIUM",
            dayBucketId: null,
            text: "Touch Cancel",
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
      const releaseRow = getTodoRowByText(container, "Touch Release");
      const cancelRow = getTodoRowByText(container, "Touch Cancel");

      await act(async () => {
        touchStart(releaseRow);
        vi.advanceTimersByTime(500);
      });

      expect(quickCreateEvents).toHaveLength(0);

      await act(async () => {
        touchEnd(releaseRow);
      });

      expect(quickCreateEvents).toHaveLength(1);
      expect(quickCreateEvents[0]?.detail).toMatchObject({
        title: "Touch Release",
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: "manual-touch-release",
      });

      await act(async () => {
        touchStart(cancelRow);
        vi.advanceTimersByTime(500);
        touchCancel(cancelRow);
        touchEnd(cancelRow);
      });

      expect(quickCreateEvents).toHaveLength(1);

      window.removeEventListener(
        "schedule:open-quick-create-task-details",
        handleQuickCreate
      );
      await act(async () => {
        root.unmount();
      });
    } finally {
      if (hadPointerEvent) {
        Object.defineProperty(window, "PointerEvent", {
          configurable: true,
          value: originalPointerEvent,
        });
      }
    }
  });

  it("dispatches a recognized manual todo upgrade once for duplicate completion events", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-duplicate-complete",
          done: false,
          completedAt: null,
          skillId: "skill-1",
          skillName: "Writing",
          skillIcon: "W",
          priorityId: "HIGH",
          dayBucketId: null,
          text: "Complete Once",
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
    const row = getTodoRowByText(container, "Complete Once");

    await act(async () => {
      pointerDown(row);
      vi.advanceTimersByTime(500);
      pointerUp(row);
      touchEnd(row);
      pointerUp(row);
    });

    expect(quickCreateEvents).toHaveLength(1);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("renders manual todo titles as display text until explicit edit", async () => {
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "manual-explicit-edit",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Editable Title",
          insertAfterRowKey: null,
        },
      ])
    );

    const { container, root } = await renderSheet({
      userId: null,
      enableScheduleTimelineDrag: true,
    });
    const row = getTodoRowByText(container, "Editable Title");

    expect(getManualTitleInput(row)).toBeNull();
    const display = getManualTitleDisplay(row, "Editable Title");

    await act(async () => {
      display.click();
    });

    const input = getManualTitleInput(row);
    expect(input).toBeTruthy();
    expect(input?.value).toBe("Editable Title");
    expect(input?.dataset.myListNoUpgrade).toBe("true");

    await act(async () => {
      root.unmount();
    });
  });

  it("opens upgrade details from manual title display text without a focused title input", async () => {
    vi.useFakeTimers();
    const manualRowId = "11111111-1111-4111-8111-111111111111";
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: manualRowId,
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "Focused Upgrade",
          insertAfterRowKey: null,
        },
      ])
    );

    const originalWindowGetSelection = window.getSelection;
    const originalDocumentGetSelection = document.getSelection;
    const removeAllRanges = vi.fn();
    const selection = { removeAllRanges } as unknown as Selection;
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => selection,
    });
    Object.defineProperty(document, "getSelection", {
      configurable: true,
      value: () => selection,
    });

    const { container, root } = await renderSheet({
      userId: null,
      enableScheduleTimelineDrag: true,
    });
    const row = getTodoRowByText(container, "Focused Upgrade");
    const titleDisplay = getManualTitleDisplay(row, "Focused Upgrade");
    expect(getManualTitleInput(row)).toBeNull();

    const quickCreateStates: Array<{
      activeElement: Element | null;
      removeAllRangesCalls: number;
    }> = [];
    const handleQuickCreate = (event: Event) => {
      expect((event as CustomEvent).detail).toMatchObject({
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: manualRowId,
      });
      quickCreateStates.push({
        activeElement: document.activeElement,
        removeAllRangesCalls: removeAllRanges.mock.calls.length,
      });
    };
    window.addEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );

    await act(async () => {
      pointerDown(titleDisplay);
      vi.advanceTimersByTime(500);
    });

    expect(quickCreateStates).toEqual([]);

    await act(async () => {
      pointerUp(titleDisplay);
    });

    expect(quickCreateStates).toEqual([
      {
        activeElement: document.body,
        removeAllRangesCalls: expect.any(Number),
      },
    ]);
    expect(quickCreateStates[0]?.removeAllRangesCalls).toBeGreaterThan(0);

    window.removeEventListener(
      "schedule:open-quick-create-task-details",
      handleQuickCreate
    );
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalWindowGetSelection,
    });
    Object.defineProperty(document, "getSelection", {
      configurable: true,
      value: originalDocumentGetSelection,
    });
    await act(async () => {
      root.unmount();
    });
  });

  it("prevents native touch selection when a manual todo title starts an upgrade hold", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "creator:my-list:manual-rows",
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          done: false,
          completedAt: null,
          skillId: null,
          skillName: null,
          skillIcon: "",
          priorityId: "MEDIUM",
          dayBucketId: null,
          text: "No Select Hold",
          insertAfterRowKey: null,
        },
      ])
    );
    const { container, root } = await renderSheet({
      userId: null,
      enableScheduleTimelineDrag: true,
    });
    const row = getTodoRowByText(container, "No Select Hold");
    const titleDisplay = getManualTitleDisplay(row, "No Select Hold");
    expect(getManualTitleInput(row)).toBeNull();
    expect(row.dataset.myListManualUpgradeRow).toBe("true");
    expect(row.getAttribute("draggable")).toBe("false");
    expect(titleDisplay.getAttribute("draggable")).toBe("false");

    for (const element of [row, titleDisplay]) {
      expect(element.className).toContain("select-none");
      expect(element.className).toContain(
        "[-webkit-tap-highlight-color:transparent]"
      );
      expect(element.className).toContain("[-webkit-touch-callout:none]");
      expect(element.className).toContain("[-webkit-user-select:none]");
      expect(element.className).toContain("[touch-action:pan-y]");
      expect(element.className).toContain("[user-select:none]");
      expect(element.style.getPropertyValue("-webkit-tap-highlight-color")).toBe(
        "transparent"
      );
      expect(element.style.userSelect).toBe("none");
    }

    let pointerEvent: PointerEvent | undefined;
    await act(async () => {
      pointerEvent = pointerDown(titleDisplay);
    });

    expect(pointerEvent?.defaultPrevented).toBe(true);

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    titleDisplay.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    const dragStartEvent = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    titleDisplay.dispatchEvent(dragStartEvent);
    expect(dragStartEvent.defaultPrevented).toBe(true);

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
      Array.from(container.querySelectorAll("span, input")).some(
        (element) =>
          element.textContent === "Consumed Todo" ||
          (element instanceof HTMLInputElement &&
            element.value === "Consumed Todo")
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
