// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "../../src/lib/todos/todosStorage";

const todoStorageMocks = vi.hoisted(() => ({
  createTodo: vi.fn(),
  loadTodos: vi.fn(),
  softDeleteTodo: vi.fn(),
  updateTodo: vi.fn(),
}));

vi.mock("@/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("../../src/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("@/lib/my-list/myListItemsStorage", () => ({
  MY_LIST_MANUAL_ITEM_CONSUMED_EVENT:
    "creator:my-list:manual-item-consumed",
  MY_LIST_MANUAL_ITEM_CREATED_EVENT: "creator:my-list:manual-item-created",
}));

vi.mock("@/lib/todos/todosStorage", () => ({
  createTodo: todoStorageMocks.createTodo,
  loadTodos: todoStorageMocks.loadTodos,
  softDeleteTodo: todoStorageMocks.softDeleteTodo,
  updateTodo: todoStorageMocks.updateTodo,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

const manualTodo = (
  id: string,
  title: string,
  overrides: Partial<Todo> = {},
): Todo => ({
  id,
  userId: "user-1",
  ownerType: "MY_LIST",
  ownerId: null,
  noteId: null,
  listId: null,
  title,
  completed: false,
  completedAt: null,
  priorityId: "MEDIUM",
  dayBucketId: null,
  skillId: null,
  energyId: "MEDIUM",
  sortOrder: 0,
  insertAfterRowKey: null,
  deletedAt: null,
  metadata: {},
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  ...overrides,
});

async function renderSheet(userId = "user-1") {
  const { MyListSheet } = await import(
    "../../src/components/my-list/MyListSheet"
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MyListSheet, {
        open: true,
        onOpenChange: vi.fn(),
        userId,
        tasks: [],
        pinnedSourceRows: [],
        pinnedGoalRows: [],
        monuments: [],
        goalMonumentIdsById: {},
        projectGoalIdsById: {},
        skills: [],
        skillCategories: [],
        pendingTaskIds: new Set<string>(),
        useFullExpandedHeight: false,
        onTogglePinnedSourceCompletion: vi.fn(),
        onToggleTask: vi.fn(),
        onTaskSkillSelect: vi.fn(),
      })
    );
  });
  await flushEffects();

  return { container, root };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getTodoRowByTitle(container: HTMLElement, value: string) {
  const titleElement = Array.from(
    container.querySelectorAll("span, input")
  ).find(
    (element) =>
      element.textContent === value ||
      (element instanceof HTMLInputElement && element.value === value)
  );
  const row = titleElement?.closest('[data-creator-xp-source="my-list-todo"]');
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

function getDeleteButton(row: HTMLElement, label: string) {
  const button = row.querySelector(`button[aria-label="${label}"]`);
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function clickDeleteButton(row: HTMLElement, label = "Remove to-do") {
  await act(async () => {
    getDeleteButton(row, label).click();
  });
  await flushEffects();
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

beforeEach(() => {
  todoStorageMocks.createTodo.mockReset();
  todoStorageMocks.loadTodos.mockReset();
  todoStorageMocks.softDeleteTodo.mockReset();
  todoStorageMocks.updateTodo.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MyListSheet manual todo delete confirmation", () => {
  it("persists X to checkmark deletion for the exact manual row and does not hydrate it back", async () => {
    const deletedId = "manual-local-1";
    const remainingId = "manual-local-2";
    let persistedRows = [
      manualTodo(deletedId, "Duplicate title"),
      manualTodo(remainingId, "Duplicate title"),
    ];
    todoStorageMocks.loadTodos.mockImplementation(async () => [
      ...persistedRows,
    ]);
    todoStorageMocks.softDeleteTodo.mockImplementation(
      async ({ id }: { id: string }) => {
        persistedRows = persistedRows.filter((row) => row.id !== id);
        return null;
      }
    );

    const firstRender = await renderSheet();
    const duplicateRows = Array.from(
      firstRender.container.querySelectorAll(
        '[data-creator-xp-source="my-list-todo"]'
      )
    ).filter((row) =>
      Array.from(row.querySelectorAll("span, input")).some(
        (element) =>
          element.textContent === "Duplicate title" ||
          (element instanceof HTMLInputElement &&
            element.value === "Duplicate title")
      )
    );
    expect(duplicateRows).toHaveLength(2);

    await clickDeleteButton(duplicateRows[0] as HTMLElement);
    await clickDeleteButton(duplicateRows[0] as HTMLElement, "Confirm remove to-do");

    expect(todoStorageMocks.softDeleteTodo).toHaveBeenCalledTimes(1);
    expect(todoStorageMocks.softDeleteTodo).toHaveBeenCalledWith({
      userId: "user-1",
      id: deletedId,
    });
    expect(
      firstRender.container.querySelectorAll(
        '[data-creator-xp-source="my-list-todo"]'
      )
    ).toHaveLength(2);
    expect(getTodoRowByTitle(firstRender.container, "Duplicate title"))
      .toBeTruthy();
    expect(
      JSON.parse(
        window.localStorage.getItem("creator:my-list:manual-rows") ?? "[]"
      )
    ).toEqual([expect.objectContaining({ id: remainingId })]);

    await unmount(firstRender.root);
    const secondRender = await renderSheet();

    expect(
      secondRender.container.querySelectorAll(
        '[data-creator-xp-source="my-list-todo"]'
      )
    ).toHaveLength(2);
    expect(getTodoRowByTitle(secondRender.container, "Duplicate title"))
      .toBeTruthy();
    expect(todoStorageMocks.loadTodos).toHaveBeenCalledTimes(2);
    expect(todoStorageMocks.loadTodos).toHaveBeenLastCalledWith({
      userId: "user-1",
      ownerType: "MY_LIST",
    });

    await unmount(secondRender.root);
  });

  it("keeps the row when persisted manual deletion fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    todoStorageMocks.loadTodos.mockResolvedValue([
      manualTodo("manual-local-1", "Do not remove"),
    ]);
    todoStorageMocks.softDeleteTodo.mockRejectedValue(
      new Error("delete failed")
    );

    const { container, root } = await renderSheet();
    const row = getTodoRowByTitle(container, "Do not remove");

    await clickDeleteButton(row);
    await clickDeleteButton(row, "Confirm remove to-do");

    expect(todoStorageMocks.softDeleteTodo).toHaveBeenCalledTimes(1);
    expect(getTodoRowByTitle(container, "Do not remove")).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to delete My List manual todo",
      expect.any(Error)
    );

    await unmount(root);
  });

  it("does not run duplicate manual deletions while confirmation is already persisting", async () => {
    let resolveDelete: (() => void) | null = null;
    todoStorageMocks.loadTodos.mockResolvedValue([
      manualTodo("manual-local-1", "Delete once"),
    ]);
    todoStorageMocks.softDeleteTodo.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );

    const { container, root } = await renderSheet();
    const row = getTodoRowByTitle(container, "Delete once");

    await clickDeleteButton(row);
    await act(async () => {
      getDeleteButton(row, "Confirm remove to-do").click();
    });
    await flushEffects();
    expect(todoStorageMocks.softDeleteTodo).toHaveBeenCalledTimes(1);
    expect(getDeleteButton(row, "Confirm remove to-do").disabled).toBe(true);

    await act(async () => {
      getDeleteButton(row, "Confirm remove to-do").click();
    });
    expect(todoStorageMocks.softDeleteTodo).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
    });
    await flushEffects();

    expect(
      Array.from(container.querySelectorAll("span, input")).some(
        (element) =>
          element.textContent === "Delete once" ||
          (element instanceof HTMLInputElement &&
            element.value === "Delete once")
      )
    ).toBe(false);

    await unmount(root);
  });
});
