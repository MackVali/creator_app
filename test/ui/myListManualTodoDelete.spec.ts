// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MyListManualStorageItem,
  MyListStorageDayBucketId,
} from "../../src/lib/my-list/myListItemsStorage";

const storageMocks = vi.hoisted(() => ({
  deleteManualMyListItem: vi.fn(),
  loadManualMyListItems: vi.fn(),
  replaceManualMyListItems: vi.fn(),
}));

vi.mock("@/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("../../src/app/(app)/schedule/matrix/MatrixContent", () => ({
  MatrixContent: () => React.createElement("div", null),
}));
vi.mock("@/lib/my-list/myListItemsStorage", () => ({
  deleteManualMyListItem: storageMocks.deleteManualMyListItem,
  loadManualMyListItems: storageMocks.loadManualMyListItems,
  MY_LIST_MANUAL_ITEM_CONSUMED_EVENT:
    "creator:my-list:manual-item-consumed",
  MY_LIST_MANUAL_ITEM_CREATED_EVENT: "creator:my-list:manual-item-created",
  replaceManualMyListItems: storageMocks.replaceManualMyListItems,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

const manualRow = (
  id: string,
  text: string,
  overrides: Partial<MyListManualStorageItem> = {}
): MyListManualStorageItem => ({
  id,
  done: false,
  completedAt: null,
  skillId: null,
  skillName: null,
  skillIcon: "",
  priorityId: "MEDIUM",
  dayBucketId: null as MyListStorageDayBucketId | null,
  text,
  insertAfterRowKey: null,
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

function getTodoRowByInputValue(container: HTMLElement, value: string) {
  const input = Array.from(container.querySelectorAll("input")).find(
    (element) => element.value === value
  );
  const row = input?.closest('[data-creator-xp-source="my-list-todo"]');
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
  storageMocks.deleteManualMyListItem.mockReset();
  storageMocks.loadManualMyListItems.mockReset();
  storageMocks.replaceManualMyListItems.mockReset();
  storageMocks.replaceManualMyListItems.mockResolvedValue(undefined);
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
      manualRow(deletedId, "Duplicate title"),
      manualRow(remainingId, "Duplicate title"),
    ];
    storageMocks.loadManualMyListItems.mockImplementation(async () => [
      ...persistedRows,
    ]);
    storageMocks.deleteManualMyListItem.mockImplementation(
      async ({ itemId }: { itemId: string }) => {
        persistedRows = persistedRows.filter((row) => row.id !== itemId);
      }
    );

    const firstRender = await renderSheet();
    const duplicateRows = Array.from(
      firstRender.container.querySelectorAll(
        '[data-creator-xp-source="my-list-todo"]'
      )
    ).filter((row) =>
      Array.from(row.querySelectorAll("input")).some(
        (input) => input.value === "Duplicate title"
      )
    );
    expect(duplicateRows).toHaveLength(2);

    await clickDeleteButton(duplicateRows[0] as HTMLElement);
    await clickDeleteButton(duplicateRows[0] as HTMLElement, "Confirm remove to-do");

    expect(storageMocks.deleteManualMyListItem).toHaveBeenCalledTimes(1);
    expect(storageMocks.deleteManualMyListItem).toHaveBeenCalledWith({
      userId: "user-1",
      itemId: deletedId,
    });
    expect(
      firstRender.container.querySelectorAll(
        '[data-creator-xp-source="my-list-todo"]'
      )
    ).toHaveLength(2);
    expect(getTodoRowByInputValue(firstRender.container, "Duplicate title"))
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
    expect(getTodoRowByInputValue(secondRender.container, "Duplicate title"))
      .toBeTruthy();
    expect(storageMocks.loadManualMyListItems).toHaveBeenCalledTimes(2);

    await unmount(secondRender.root);
  });

  it("keeps the row when persisted manual deletion fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storageMocks.loadManualMyListItems.mockResolvedValue([
      manualRow("manual-local-1", "Do not remove"),
    ]);
    storageMocks.deleteManualMyListItem.mockRejectedValue(
      new Error("delete failed")
    );

    const { container, root } = await renderSheet();
    const row = getTodoRowByInputValue(container, "Do not remove");

    await clickDeleteButton(row);
    await clickDeleteButton(row, "Confirm remove to-do");

    expect(storageMocks.deleteManualMyListItem).toHaveBeenCalledTimes(1);
    expect(getTodoRowByInputValue(container, "Do not remove")).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to delete My List manual todo",
      expect.any(Error)
    );

    await unmount(root);
  });

  it("does not run duplicate manual deletions while confirmation is already persisting", async () => {
    let resolveDelete: (() => void) | null = null;
    storageMocks.loadManualMyListItems.mockResolvedValue([
      manualRow("manual-local-1", "Delete once"),
    ]);
    storageMocks.deleteManualMyListItem.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );

    const { container, root } = await renderSheet();
    const row = getTodoRowByInputValue(container, "Delete once");

    await clickDeleteButton(row);
    await act(async () => {
      getDeleteButton(row, "Confirm remove to-do").click();
    });
    await flushEffects();
    expect(storageMocks.deleteManualMyListItem).toHaveBeenCalledTimes(1);
    expect(getDeleteButton(row, "Confirm remove to-do").disabled).toBe(true);

    await act(async () => {
      getDeleteButton(row, "Confirm remove to-do").click();
    });
    expect(storageMocks.deleteManualMyListItem).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
    });
    await flushEffects();

    expect(
      Array.from(container.querySelectorAll("input")).some(
        (input) => input.value === "Delete once"
      )
    ).toBe(false);

    await unmount(root);
  });
});
