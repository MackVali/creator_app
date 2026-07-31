import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "@/lib/supabase";
import {
  fetchFocusPomoQueue,
  sortFocusPomoQueue,
  type FocusPomoQueueItem,
} from "../../src/lib/focus/focusPomoQueue";

vi.mock("@/lib/scheduler/habitRecurrence", () => ({
  evaluateHabitDueOnDate: () => ({ isDue: true, dueStart: null }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: vi.fn(),
}));

const now = new Date("2026-06-22T15:00:00.000Z");

type QueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type QueryCall = {
  table: string;
  columns?: string;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, value: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
};

function createFocusPomoQueueClient() {
  const calls: QueryCall[] = [];
  const projects = [
    {
      id: "rank-60-ultra",
      name: "A ultra critical fallback winner",
      duration_min: 25,
      energy: "MEDIUM",
      priority: "ULTRA-CRITICAL",
      goal_id: null,
      completed_at: null,
      due_date: null,
      global_rank: 60,
      created_at: "2026-06-20T15:00:00.000Z",
      updated_at: "2026-06-20T16:00:00.000Z",
    },
    {
      id: "rank-1-low",
      name: "Z rank one canonical winner",
      duration_min: 25,
      energy: "MEDIUM",
      priority: "LOW",
      goal_id: null,
      completed_at: null,
      due_date: null,
      global_rank: 1,
      created_at: "2026-06-21T15:00:00.000Z",
      updated_at: "2026-06-21T16:00:00.000Z",
    },
  ];
  const selectProjectColumns = (columns: string | undefined) => {
    const selected = new Set(
      (columns ?? "")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean)
    );

    return projects.map((project) =>
      Object.fromEntries(
        Object.entries(project).filter(([key]) => selected.has(key))
      )
    );
  };

  const resolve = (call: QueryCall): QueryResult => {
    calls.push({ ...call });

    if (call.table === "habits") {
      return { data: [], error: null };
    }

    if (call.table === "projects") {
      if (call.columns?.includes("title")) {
        return {
          data: null,
          error: { message: "42703: column projects.title does not exist" },
        };
      }

      return { data: selectProjectColumns(call.columns), error: null };
    }

    if (call.table === "project_skills") {
      return { data: [], error: null };
    }

    if (call.table === "profiles") {
      return { data: { timezone: "UTC" }, error: null };
    }

    return { data: [], error: null };
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string): QueryBuilder => {
      const call: QueryCall = { table };
      const builder: QueryBuilder = {
        select: (columns) => {
          call.columns = columns;
          return builder;
        },
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        maybeSingle: () => Promise.resolve(resolve(call)),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
      };

      return builder;
    }),
  };

  return { calls, client };
}

beforeEach(() => {
  vi.mocked(getSupabaseBrowser).mockReset();
});

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

describe("fetchFocusPomoQueue", () => {
  it("falls back from legacy title select to current project schema while preserving global rank", async () => {
    const { calls, client } = createFocusPomoQueueClient();
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({});
    const projectSelects = calls
      .filter((call) => call.table === "projects")
      .map((call) => call.columns);

    expect(projectSelects).toHaveLength(2);
    expect(projectSelects[0]).toContain("title");
    expect(projectSelects[0]).toContain("global_rank");
    expect(projectSelects[1]).toBe(
      "id, name, duration_min, energy, priority, goal_id, completed_at, due_date, global_rank, created_at, updated_at"
    );

    expect(
      items.map((item) => ({
        id: item.id,
        projectGlobalRank: item.projectGlobalRank,
        priority: item.priority,
      }))
    ).toEqual([
      {
        id: "rank-1-low",
        projectGlobalRank: 1,
        priority: "LOW",
      },
      {
        id: "rank-60-ultra",
        projectGlobalRank: 60,
        priority: "ULTRA-CRITICAL",
      },
    ]);
  });
});
