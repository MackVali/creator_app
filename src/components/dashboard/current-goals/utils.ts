import type { Goal, GoalFilter, GoalSort } from "./types";

const HOURS_72 = 72 * 60 * 60 * 1000;

export function filterAndSortGoals(
  goals: Goal[],
  filter: GoalFilter,
  sort: GoalSort
): Goal[] {
  const now = Date.now();

  let list = goals;

  if (filter === "active") {
    list = list.filter((g) => g.openTaskCount > 0);
  } else if (filter === "due") {
    list = list.filter(
      (g) =>
        g.nextDueAt !== null &&
        g.nextDueAt !== undefined &&
        new Date(g.nextDueAt).getTime() - now <= HOURS_72
    );
  }

  const sorted = [...list];
  switch (sort) {
    case "priority":
      sorted.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      break;
    case "progress":
      sorted.sort((a, b) => b.progressPct - a.progressPct);
      break;
    case "due":
      sorted.sort(
        (a, b) =>
          (new Date(a.nextDueAt || Infinity).getTime() || Infinity) -
          (new Date(b.nextDueAt || Infinity).getTime() || Infinity)
      );
      break;
    case "updated":
      sorted.sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
      );
      break;
  }

  return sorted;
}

