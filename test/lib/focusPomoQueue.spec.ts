import { describe, expect, it } from "vitest";

import {
  sortFocusPomoQueue,
  type FocusPomoQueueItem,
} from "../../src/lib/focus/focusPomoQueue";

const now = new Date("2026-06-22T15:00:00.000Z");

function queueItem(
  overrides: Partial<FocusPomoQueueItem> & Pick<FocusPomoQueueItem, "id" | "title">
): FocusPomoQueueItem {
  return {
    kind: "project",
    sourceType: "PROJECT",
    subtitle: "",
    durationMinutes: null,
    durationLabel: "",
    energyLabel: null,
    statusLabel: "",
    ...overrides,
  };
}

function project(
  id: string,
  globalRank: number | null,
  overrides: Partial<FocusPomoQueueItem> = {}
): FocusPomoQueueItem {
  return queueItem({
    id,
    title: id,
    kind: "project",
    sourceType: "PROJECT",
    projectId: id,
    projectGlobalRank: globalRank,
    ...overrides,
  });
}

function dueHabit(
  id: string,
  kind: "chore" | "habit",
  overrides: Partial<FocusPomoQueueItem> = {}
): FocusPomoQueueItem {
  return queueItem({
    id,
    title: id,
    kind,
    sourceType: "HABIT",
    habitType: kind === "chore" ? "CHORE" : "HABIT",
    recurrence: "daily",
    lastCompletedAt: "2026-06-20T15:00:00.000Z",
    ...overrides,
  });
}

function sortedIds(items: FocusPomoQueueItem[]): string[] {
  return sortFocusPomoQueue(items, { now }).map((item) => item.id);
}

describe("sortFocusPomoQueue", () => {
  it("orders due Chore Habits before ranked Projects", () => {
    expect(
      sortedIds([project("project-rank-1", 1), dueHabit("chore", "chore")])
    ).toEqual(["chore", "project-rank-1"]);
  });

  it("orders due non-Chore Habits before ranked Projects", () => {
    expect(
      sortedIds([project("project-rank-1", 1), dueHabit("habit", "habit")])
    ).toEqual(["habit", "project-rank-1"]);
  });

  it("orders ranked Projects by ascending global rank", () => {
    expect(
      sortedIds([project("project-rank-2", 2), project("project-rank-1", 1)])
    ).toEqual(["project-rank-1", "project-rank-2"]);
  });

  it("orders unranked Projects after ranked Projects", () => {
    expect(
      sortedIds([project("project-unranked", null), project("project-rank-2", 2)])
    ).toEqual(["project-rank-2", "project-unranked"]);
  });

  it("preserves input order when sort keys are equal", () => {
    const first = project("project-same", null, { title: "Same title" });
    const second = project("project-same", null, { title: "Same title" });

    expect(sortFocusPomoQueue([first, second], { now })).toEqual([first, second]);
  });
});
