import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowser } from "@/lib/supabase";
import {
  fetchFocusPomoQueue,
  sortFocusPomoQueue,
  type FocusPomoQueueItem,
} from "../../src/lib/focus/focusPomoQueue";
import {
  buildFocusPomoExecutionQueue,
  buildFocusPomoQueueHierarchy,
  flattenFocusPomoQueueHierarchy,
  getFocusPomoProjectChecklistItems,
  getVisibleFocusPomoHierarchyItemKeys,
} from "../../src/lib/focus/focusPomoQueueHierarchy";

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

type QueryFilter = {
  method: "eq" | "is" | "in" | "lt" | "gt";
  column: string;
  value: unknown;
};

type QueryCall = {
  table: string;
  columns?: string;
  filters?: QueryFilter[];
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, value: unknown[]) => QueryBuilder;
  lt: (column: string, value: unknown) => QueryBuilder;
  gt: (column: string, value: unknown) => QueryBuilder;
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
        lt: () => builder,
        gt: () => builder,
        maybeSingle: () => Promise.resolve(resolve(call)),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
      };

      return builder;
    }),
  };

  return { calls, client };
}

function createAreaFocusPomoQueueClient(options: {
  goals?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  habits?: Array<Record<string, unknown>>;
  areaSkills?: Array<Record<string, unknown>>;
  projectSkills?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  goalWorkspaces?: Array<Record<string, unknown>>;
  monuments?: Array<Record<string, unknown>>;
} = {}) {
  const calls: QueryCall[] = [];
  const goals = options.goals ?? [
    {
      id: "goal-body",
      name: "Body goal",
      emoji: "B",
      area_id: "body",
      monument_id: null,
      circle_id: null,
      roadmap_id: null,
      priority_rank: 1,
      global_rank: 1,
      due_date: null,
      created_at: "2026-06-20T15:00:00.000Z",
      updated_at: "2026-06-20T16:00:00.000Z",
    },
  ];
  const projects = options.projects ?? [
    {
      id: "project-body",
      name: "Body project",
      duration_min: 25,
      energy: "MEDIUM",
      priority: "HIGH",
      goal_id: "goal-body",
      campaign_id: null,
      completed_at: null,
      due_date: null,
      global_rank: 1,
      created_at: "2026-06-21T15:00:00.000Z",
      updated_at: "2026-06-21T16:00:00.000Z",
    },
  ];
  const habits = options.habits ?? [];
  const areaSkills = options.areaSkills ?? [];
  const projectSkills = options.projectSkills ?? [];

  const filterValue = (call: QueryCall, method: QueryFilter["method"], column: string) =>
    call.filters?.find((filter) => filter.method === method && filter.column === column)
      ?.value;

  const resolve = (call: QueryCall): QueryResult => {
    calls.push({ ...call, filters: [...(call.filters ?? [])] });

    if (call.table === "goals" && call.columns === "id") {
      const areaId = filterValue(call, "eq", "area_id");
      const monumentIds = filterValue(call, "in", "monument_id");
      if (Array.isArray(monumentIds)) {
        return {
          data: goals
            .filter((goal) => monumentIds.includes(goal.monument_id))
            .map((goal) => ({ id: goal.id })),
          error: null,
        };
      }
      return {
        data: goals
          .filter((goal) => goal.area_id === areaId)
          .map((goal) => ({ id: goal.id })),
        error: null,
      };
    }

    if (call.table === "goals") {
      const ids = filterValue(call, "in", "id");
      return {
        data: Array.isArray(ids)
          ? goals.filter((goal) => ids.includes(goal.id))
          : goals,
        error: null,
      };
    }

    if (call.table === "projects") {
      const goalIds = filterValue(call, "in", "goal_id");
      if (call.columns === "id") {
        return {
          data: Array.isArray(goalIds)
            ? projects
                .filter((project) => goalIds.includes(project.goal_id))
                .map((project) => ({ id: project.id }))
            : projects.map((project) => ({ id: project.id })),
          error: null,
        };
      }
      const projectIds = filterValue(call, "in", "id");
      if (Array.isArray(projectIds)) {
        return {
          data: projects.filter((project) => projectIds.includes(project.id)),
          error: null,
        };
      }
      return {
        data: Array.isArray(goalIds)
          ? projects.filter((project) => goalIds.includes(project.goal_id))
          : projects,
        error: null,
      };
    }

    if (call.table === "tasks") {
      return { data: options.tasks ?? [], error: null };
    }

    if (call.table === "goal_workspaces") {
      const goalIds = filterValue(call, "in", "goal_id");
      const rows = options.goalWorkspaces ?? [];
      return {
        data: Array.isArray(goalIds)
          ? rows.filter((row) => goalIds.includes(row.goal_id))
          : rows,
        error: null,
      };
    }

    if (call.table === "monuments") {
      const areaId = filterValue(call, "eq", "area_id");
      const rows = options.monuments ?? [];
      return {
        data: rows.filter((row) => row.area_id === areaId),
        error: null,
      };
    }

    if (call.table === "habits") {
      const skillIds = filterValue(call, "in", "skill_id");
      return {
        data: Array.isArray(skillIds)
          ? habits.filter((habit) => skillIds.includes(habit.skill_id))
          : habits,
        error: null,
      };
    }

    if (call.table === "area_skills") {
      if (call.columns === "skill_id") {
        const areaId = filterValue(call, "eq", "area_id");
        return {
          data: areaSkills
            .filter((row) => row.area_id === areaId)
            .map((row) => ({ skill_id: row.skill_id })),
          error: null,
        };
      }

      const skillIds = filterValue(call, "in", "skill_id");
      return {
        data: Array.isArray(skillIds)
          ? areaSkills.filter((row) => skillIds.includes(row.skill_id))
          : areaSkills,
        error: null,
      };
    }

    if (call.table === "skills") {
      const ids = filterValue(call, "in", "id");
      const skillIds = Array.isArray(ids)
        ? ids
        : areaSkills.map((row) => row.skill_id);
      return {
        data: skillIds.map((id) => ({
          id,
          name: `${id}`,
          icon: null,
          monument_id: null,
        })),
        error: null,
      };
    }

    if (call.table === "project_skills") {
      return { data: projectSkills, error: null };
    }

    if (call.table === "profiles") {
      return { data: { timezone: "UTC" }, error: null };
    }

    if (
      call.table === "habit_completion_days" ||
      call.table === "schedule_instances" ||
      call.table === "campaigns" ||
      call.table === "campaign_goals" ||
      call.table === "habit_routines"
    ) {
      return { data: [], error: null };
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
      const call: QueryCall = { table, filters: [] };
      const builder: QueryBuilder = {
        select: (columns) => {
          call.columns = columns;
          return builder;
        },
        eq: (column, value) => {
          call.filters?.push({ method: "eq", column, value });
          return builder;
        },
        is: (column, value) => {
          call.filters?.push({ method: "is", column, value });
          return builder;
        },
        in: (column, value) => {
          call.filters?.push({ method: "in", column, value });
          return builder;
        },
        lt: (column, value) => {
          call.filters?.push({ method: "lt", column, value });
          return builder;
        },
        gt: (column, value) => {
          call.filters?.push({ method: "gt", column, value });
          return builder;
        },
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

describe("buildFocusPomoQueueHierarchy", () => {
  it("keeps same-Goal children grouped in Goal ordering after obligations", () => {
    const chore = dueHabit("chore", "chore");
    const goalBTask = queueItem({
      id: "goal-b-task",
      title: "Goal B task",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal-b",
      goalTitle: "Goal B",
      goalPriorityRank: 2,
    });
    const goalATodo = queueItem({
      id: "goal-a-todo",
      title: "Goal A todo",
      kind: "task",
      sourceType: "NOTE_TODO",
      goalId: "goal-a",
      goalTitle: "Goal A",
      goalIcon: "A",
      goalPriorityRank: 1,
      taskOrder: 1,
    });
    const goalATask = queueItem({
      id: "goal-a-task",
      title: "Goal A task",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal-a",
      goalTitle: "Goal A",
      goalPriorityRank: 1,
      taskOrder: 2,
    });
    const sorted = sortFocusPomoQueue([goalBTask, goalATask, chore, goalATodo], {
      now,
    });

    const hierarchy = buildFocusPomoQueueHierarchy(sorted);

    expect(hierarchy.map((entry) => entry.type)).toEqual([
      "item",
      "goal",
      "goal",
    ]);
    expect(hierarchy[0]).toMatchObject({ type: "item", item: chore });
    expect(hierarchy[1]).toMatchObject({
      type: "goal",
      goalId: "goal-a",
      title: "Goal A",
      icon: "A",
    });
    expect(hierarchy[2]).toMatchObject({
      type: "goal",
      goalId: "goal-b",
      title: "Goal B",
    });

    const goalA = hierarchy[1];
    expect(goalA.type).toBe("goal");
    if (goalA.type !== "goal") throw new Error("Goal A group missing.");
    expect(goalA.items.map((item) => item.id)).toEqual([
      "goal-a-todo",
      "goal-a-task",
    ]);
    expect(goalA.children).toEqual([
      { type: "item", item: goalATodo },
      { type: "item", item: goalATask },
    ]);
  });

  it("nests project Tasks under their Project while keeping leaf Projects executable", () => {
    const projectWithTasks = queueItem({
      id: "project-with-tasks",
      title: "Project with Tasks",
      kind: "project",
      sourceType: "PROJECT",
      goalId: "goal-a",
      goalTitle: "Goal A",
      projectId: "project-with-tasks",
      projectGlobalRank: 1,
      projectOrder: 1,
    });
    const childTask = queueItem({
      id: "child-task",
      title: "Child Task",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal-a",
      goalTitle: "Goal A",
      projectId: "project-with-tasks",
      projectName: "Project with Tasks",
      taskOrder: 1,
    });
    const leafProject = queueItem({
      id: "leaf-project",
      title: "Leaf Project",
      kind: "project",
      sourceType: "PROJECT",
      goalId: "goal-a",
      goalTitle: "Goal A",
      projectId: "leaf-project",
      projectGlobalRank: 2,
      projectOrder: 2,
    });

    const hierarchy = buildFocusPomoQueueHierarchy([
      projectWithTasks,
      childTask,
      leafProject,
    ]);
    const goal = hierarchy[0];

    expect(goal.type).toBe("goal");
    if (goal.type !== "goal") throw new Error("Goal group missing.");
    expect(goal.children[0]).toMatchObject({
      type: "project",
      projectId: "project-with-tasks",
      title: "Project with Tasks",
      item: projectWithTasks,
      items: [childTask],
    });
    expect(goal.children[1]).toEqual({ type: "item", item: leafProject });
  });

  it("does not turn Goal groups into executable queue items or lose non-Goal items", () => {
    const habit = dueHabit("habit", "habit");
    const task = queueItem({
      id: "task",
      title: "Task",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal",
      goalTitle: "Goal",
    });

    const hierarchy = buildFocusPomoQueueHierarchy([habit, task]);

    expect(hierarchy).toHaveLength(2);
    expect(hierarchy[0]).toEqual({ type: "item", item: habit });
    expect(flattenFocusPomoQueueHierarchy(hierarchy)).toEqual([habit, task]);
  });
});

describe("buildFocusPomoExecutionQueue", () => {
  it("uses Projects as execution units instead of their child Tasks", () => {
    const projectA = project("project-a", 1);
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });
    const taskA2 = queueItem({
      id: "task-a-2",
      title: "Task A2",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });
    const projectB = project("project-b", 2);

    expect(
      buildFocusPomoExecutionQueue([projectA, taskA1, taskA2, projectB]).map(
        (item) => item.id
      )
    ).toEqual(["project-a", "project-b"]);
  });

  it("retains a Project child Task when its Project is absent", () => {
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });

    expect(buildFocusPomoExecutionQueue([taskA1])).toEqual([taskA1]);
  });

  it("keeps Habits and Chores executable", () => {
    const habit = dueHabit("habit", "habit");
    const chore = dueHabit("chore", "chore");
    const projectA = project("project-a", 1);
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });

    expect(
      buildFocusPomoExecutionQueue([habit, chore, projectA, taskA1]).map(
        (item) => item.id
      )
    ).toEqual(["habit", "chore", "project-a"]);
  });

  it("advances from a completed Project to the next execution Project", () => {
    const projectA = project("project-a", 1);
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });
    const projectB = project("project-b", 2);
    const executionQueue = buildFocusPomoExecutionQueue([
      projectA,
      taskA1,
      projectB,
    ]);
    const dismissedKey = `${projectA.sourceType}:${projectA.id}`;
    const next = executionQueue.find(
      (item) => `${item.sourceType}:${item.id}` !== dismissedKey
    );

    expect(next).toBe(projectB);
  });
});

describe("getFocusPomoProjectChecklistItems", () => {
  it("returns Tasks for the current Project checklist", () => {
    const projectA = project("project-a", 1);
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });
    const todoA1 = queueItem({
      id: "todo-a-1",
      title: "Todo A1",
      kind: "task",
      sourceType: "NOTE_TODO",
      projectId: "project-a",
    });

    expect(
      getFocusPomoProjectChecklistItems([projectA, taskA1, todoA1], projectA)
    ).toEqual([taskA1, todoA1]);
  });

  it("excludes Tasks from another Project", () => {
    const projectA = project("project-a", 1);
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-a",
    });
    const taskB1 = queueItem({
      id: "task-b-1",
      title: "Task B1",
      kind: "task",
      sourceType: "TASK",
      projectId: "project-b",
    });

    expect(
      getFocusPomoProjectChecklistItems([projectA, taskA1, taskB1], projectA)
    ).toEqual([taskA1]);
  });
});

describe("getVisibleFocusPomoHierarchyItemKeys", () => {
  it("uses a Project group item as the visible selectable key", () => {
    const projectA = project("project-a", 1, {
      goalId: "goal-a",
      goalTitle: "Goal A",
    });
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal-a",
      goalTitle: "Goal A",
      projectId: "project-a",
    });
    const [goal] = buildFocusPomoQueueHierarchy([projectA, taskA1]);

    expect(goal?.type).toBe("goal");
    if (!goal || goal.type !== "goal") throw new Error("Goal group missing.");

    expect(
      getVisibleFocusPomoHierarchyItemKeys(
        goal,
        new Set(),
        (item) => `${item.sourceType}:${item.id}`
      )
    ).toEqual(["PROJECT:project-a"]);
  });

  it("falls back to child keys when a Project group has no Project item", () => {
    const taskA1 = queueItem({
      id: "task-a-1",
      title: "Task A1",
      kind: "task",
      sourceType: "TASK",
      goalId: "goal-a",
      goalTitle: "Goal A",
      projectId: "project-a",
    });
    const [goal] = buildFocusPomoQueueHierarchy([taskA1]);

    expect(goal?.type).toBe("goal");
    if (!goal || goal.type !== "goal") throw new Error("Goal group missing.");

    expect(
      getVisibleFocusPomoHierarchyItemKeys(
        goal,
        new Set(),
        (item) => `${item.sourceType}:${item.id}`
      )
    ).toEqual(["TASK:task-a-1"]);
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

  it("loads area-scoped projects through goals.area_id and preserves goal area metadata", async () => {
    const { calls, client } = createAreaFocusPomoQueueClient();
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });
    const areaGoalCall = calls.find(
      (call) => call.table === "goals" && call.columns === "id"
    );
    const projectCall = calls.find((call) => call.table === "projects");

    expect(areaGoalCall?.filters).toContainEqual({
      method: "eq",
      column: "area_id",
      value: "body",
    });
    expect(projectCall?.filters).toContainEqual({
      method: "in",
      column: "goal_id",
      value: ["goal-body"],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "project-body",
      goalId: "goal-body",
      areaId: "body",
      area_id: "body",
      goalAreaId: "body",
      goal_area_id: "body",
    });
  });

  it("loads area-scoped habits through area_skills even when the Area has no Goals", async () => {
    const { calls, client } = createAreaFocusPomoQueueClient({
      goals: [],
      projects: [],
      areaSkills: [{ area_id: "body", skill_id: "fitness" }],
      habits: [
        {
          id: "habit-fitness",
          name: "Fitness habit",
          habit_type: "HABIT",
          recurrence: "daily",
          recurrence_days: null,
          recurrence_mode: null,
          anchor_type: null,
          anchor_value: null,
          anchor_start_date: null,
          last_completed_at: null,
          next_due_override: null,
          window_id: null,
          window: null,
          created_at: "2026-06-21T15:00:00.000Z",
          updated_at: "2026-06-21T16:00:00.000Z",
          duration_minutes: 15,
          energy: "MEDIUM",
          skill_id: "fitness",
          goal_id: null,
          campaign_id: null,
          routine_id: null,
          icon: null,
          emoji: null,
          global_order: 1,
        },
      ],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    expect(
      calls.find(
        (call) => call.table === "area_skills" && call.columns === "skill_id"
      )?.filters
    ).toContainEqual({ method: "eq", column: "area_id", value: "body" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "habit-fitness",
      kind: "habit",
      skillId: "fitness",
      areaId: "body",
      area_id: "body",
      goalAreaId: null,
      goal_area_id: null,
    });
  });

  it("uses Habit Skill Area instead of conflicting legacy Goal Area", async () => {
    const goals = [
      {
        id: "goal-money",
        name: "Money goal",
        area_id: "money",
        monument_id: null,
        circle_id: null,
        roadmap_id: null,
      },
    ];
    const habits = [
      {
        id: "habit-body-skill-money-goal",
        name: "Body skill money goal",
        habit_type: "HABIT",
        recurrence: "daily",
        recurrence_days: null,
        recurrence_mode: null,
        anchor_type: null,
        anchor_value: null,
        anchor_start_date: null,
        last_completed_at: null,
        next_due_override: null,
        window_id: null,
        window: null,
        created_at: "2026-06-21T15:00:00.000Z",
        updated_at: "2026-06-21T16:00:00.000Z",
        duration_minutes: 15,
        energy: "MEDIUM",
        skill_id: "fitness",
        goal_id: "goal-money",
        campaign_id: null,
        routine_id: null,
        icon: null,
        emoji: null,
        global_order: 1,
      },
    ];

    const bodyClient = createAreaFocusPomoQueueClient({
      goals,
      projects: [],
      areaSkills: [{ area_id: "body", skill_id: "fitness" }],
      habits,
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(bodyClient.client as never);
    const bodyItems = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    const moneyClient = createAreaFocusPomoQueueClient({
      goals,
      projects: [],
      areaSkills: [{ area_id: "body", skill_id: "fitness" }],
      habits,
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(moneyClient.client as never);
    const moneyItems = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "money",
    });

    expect(bodyItems.map((item) => item.id)).toEqual([
      "habit-body-skill-money-goal",
    ]);
    expect(bodyItems[0]).toMatchObject({
      areaId: "body",
      area_id: "body",
      goalAreaId: "money",
      goal_area_id: "money",
    });
    expect(moneyItems).toEqual([]);
  });

  it("keeps Project Area derived from Goal Area instead of Project Skills", async () => {
    const { client } = createAreaFocusPomoQueueClient({
      areaSkills: [{ area_id: "creation", skill_id: "writing" }],
      projectSkills: [{ project_id: "project-body", skill_id: "writing" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const creationItems = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "creation",
    });

    expect(creationItems).toEqual([]);
  });

  it("returns both Goal-owned Projects and Skill-owned Habits for mixed Area queues", async () => {
    const { client } = createAreaFocusPomoQueueClient({
      areaSkills: [{ area_id: "body", skill_id: "fitness" }],
      habits: [
        {
          id: "habit-fitness",
          name: "Fitness habit",
          habit_type: "HABIT",
          recurrence: "daily",
          recurrence_days: null,
          recurrence_mode: null,
          anchor_type: null,
          anchor_value: null,
          anchor_start_date: null,
          last_completed_at: null,
          next_due_override: null,
          window_id: null,
          window: null,
          created_at: "2026-06-21T15:00:00.000Z",
          updated_at: "2026-06-21T16:00:00.000Z",
          duration_minutes: 15,
          energy: "MEDIUM",
          skill_id: "fitness",
          goal_id: null,
          campaign_id: null,
          routine_id: null,
          icon: null,
          emoji: null,
          global_order: 1,
        },
      ],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    expect(new Set(items.map((item) => item.id))).toEqual(
      new Set(["habit-fitness", "project-body"])
    );
  });

  it("loads Area projects through Goals owned by Monuments in that Area", async () => {
    const { calls, client } = createAreaFocusPomoQueueClient({
      goals: [
        {
          id: "goal-monument-body",
          name: "Monument body goal",
          area_id: null,
          monument_id: "monument-body",
          circle_id: null,
          roadmap_id: null,
          priority_rank: 1,
          global_rank: 1,
          due_date: null,
          created_at: "2026-06-20T15:00:00.000Z",
          updated_at: "2026-06-20T16:00:00.000Z",
        },
      ],
      projects: [
        {
          id: "project-monument-body",
          name: "Monument body project",
          duration_min: 25,
          energy: "MEDIUM",
          priority: "HIGH",
          goal_id: "goal-monument-body",
          campaign_id: null,
          completed_at: null,
          due_date: null,
          global_rank: 1,
          created_at: "2026-06-21T15:00:00.000Z",
          updated_at: "2026-06-21T16:00:00.000Z",
        },
      ],
      monuments: [{ id: "monument-body", area_id: "body" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    expect(
      calls.find((call) => call.table === "monuments")?.filters
    ).toContainEqual({ method: "eq", column: "area_id", value: "body" });
    expect(items.map((item) => item.id)).toEqual(["project-monument-body"]);
    expect(items[0]).toMatchObject({
      goalId: "goal-monument-body",
      goalMonumentId: "monument-body",
    });
  });

  it("loads incomplete database Tasks as task execution items", async () => {
    const { client } = createAreaFocusPomoQueueClient({
      tasks: [
        {
          id: "task-body",
          name: "Body task",
          duration_min: 10,
          energy: "MEDIUM",
          priority: "HIGH",
          goal_id: "goal-body",
          project_id: "project-body",
          skill_id: "fitness",
          stage: "TODO",
          completed_at: null,
          created_at: "2026-06-21T15:00:00.000Z",
          updated_at: "2026-06-21T16:00:00.000Z",
        },
      ],
      projectSkills: [{ project_id: "project-body", skill_id: "fitness" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    expect(items.find((item) => item.id === "task-body")).toMatchObject({
      kind: "task",
      sourceType: "TASK",
      taskId: "task-body",
      goalId: "goal-body",
      projectId: "project-body",
      skillId: "fitness",
    });
  });

  it("loads incomplete Goal note todos without representing them as database Tasks", async () => {
    const { client } = createAreaFocusPomoQueueClient({
      goalWorkspaces: [
        {
          goal_id: "goal-body",
          updated_at: "2026-06-22T16:00:00.000Z",
          metadata: {
            noteTodos: [
              {
                id: "todo-1",
                title: "Draft goal note task",
                completed: false,
                priority: "HIGH",
                skillId: "fitness",
              },
              {
                id: "todo-done",
                title: "Already done",
                completed: true,
                priority: "HIGH",
                skillId: "fitness",
              },
            ],
          },
        },
      ],
      areaSkills: [{ area_id: "body", skill_id: "fitness" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    const items = await fetchFocusPomoQueue({
      sourceType: "area",
      sourceId: "body",
    });

    expect(items.find((item) => item.noteTodoId === "todo-1")).toMatchObject({
      kind: "task",
      sourceType: "NOTE_TODO",
      id: "goal-note-todo:goal-body:todo-1",
      goalId: "goal-body",
      noteTodoGoalId: "goal-body",
      taskId: "goal-note-todo:goal-body:todo-1",
      skillId: "fitness",
      priority: "HIGH",
    });
    expect(items.some((item) => item.noteTodoId === "todo-done")).toBe(false);
  });
});
