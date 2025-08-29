import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterAndSortGoals } from "../../src/components/dashboard/current-goals/utils";
import type { Goal } from "../../src/components/dashboard/current-goals/types";
import { CurrentGoals } from "../../src/components/dashboard/current-goals/CurrentGoals";

describe("filterAndSortGoals", () => {
  const now = Date.now();
  const goals: Goal[] = [
    {
      id: "1",
      title: "A",
      progressPct: 50,
      projectCount: 1,
      taskCount: 2,
      openTaskCount: 1,
      nextDueAt: new Date(now + 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 1000).toISOString(),
      priority: 1,
    },
    {
      id: "2",
      title: "B",
      progressPct: 80,
      projectCount: 1,
      taskCount: 5,
      openTaskCount: 0,
      nextDueAt: null,
      updatedAt: new Date(now).toISOString(),
      priority: 2,
    },
  ];

  it("filters active goals", () => {
    const res = filterAndSortGoals(goals, "active", "progress");
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("1");
  });

  it("filters due soon goals", () => {
    const res = filterAndSortGoals(goals, "due", "progress");
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("1");
  });

  it("sorts by progress", () => {
    const res = filterAndSortGoals(goals, "all", "progress");
    expect(res[0].id).toBe("2");
  });
});

describe("CurrentGoals component", () => {
  it("renders empty state", () => {
    const html = renderToStaticMarkup(
      <CurrentGoals initialGoals={[]} initialLoading={false} />
    );
    expect(html).toContain("No current goals");
  });

  it("shows skeleton while loading", () => {
    const html = renderToStaticMarkup(
      <CurrentGoals initialGoals={[]} initialLoading={true} />
    );
    expect(html).toContain("animate-pulse");
  });
});

