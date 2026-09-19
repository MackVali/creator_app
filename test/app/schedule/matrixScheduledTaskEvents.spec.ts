import { describe, expect, it } from "vitest";

import {
  buildMatrixEvents,
  buildMatrixScheduledEvents,
  collectMatrixScheduledProjectIds,
  collectMatrixScheduledTaskIds,
  MATRIX_SCHEDULED_SOURCE_TYPES,
  type GoalRow,
  type HabitRow,
  type ProjectRow,
  type RoutineRow,
  type ScheduleInstance,
  type TaskRow,
} from "@/lib/matrix/scheduledEvents";

const baseInstance = (
  overrides: Partial<ScheduleInstance>,
): ScheduleInstance =>
  ({
    id: "instance",
    user_id: "user-1",
    source_id: "source",
    source_type: "TASK",
    start_utc: "2024-01-08T15:00:00.000Z",
    end_utc: "2024-01-08T15:30:00.000Z",
    duration_min: 30,
    status: "scheduled",
    completed_at: null,
    weight_snapshot: 0,
    event_name: null,
    project_name: null,
    time_block_id: null,
    day_type_time_block_id: null,
    window_id: null,
    energy_resolved: "NO",
    metadata: null,
    ...overrides,
  }) as ScheduleInstance;

const task = (overrides: Partial<TaskRow>): TaskRow =>
  ({
    id: "task-1",
    project_id: "project-1",
    name: "Task 1",
    stage: "BUILD",
    skill_id: "skill-1",
    priority: "HIGH",
    completed_at: null,
    ...overrides,
  }) as TaskRow;

const project = (tasks: ProjectRow["tasks"]): ProjectRow =>
  ({
    id: "project-1",
    name: "Launch Project",
    goal_id: "goal-1",
    stage: "BUILD",
    completed_at: null,
    duration_min: 60,
    created_at: "2024-01-01T00:00:00.000Z",
    due_date: null,
    priority: "HIGH",
    energy: "MEDIUM",
    tasks,
    project_skills: [{ skill_id: "skill-1" }],
  }) as ProjectRow;

const build = ({
  instances,
  tasks,
  projects,
  habits = new Map<string, HabitRow>(),
  routines = new Map<string, RoutineRow>(),
}: {
  instances: ScheduleInstance[];
  tasks: TaskRow[];
  projects: ProjectRow[];
  habits?: Map<string, HabitRow>;
  routines?: Map<string, RoutineRow>;
}) => {
  const goals = new Map<string, GoalRow>([
    ["goal-1", { id: "goal-1", name: "Goal", monument_id: "monument-1" }],
  ]);
  const skillIdToIcon = new Map([["skill-1", "S"]]);
  const rawEvents = buildMatrixEvents({
    instances,
    projects: new Map(projects.map((item) => [item.id, item])),
    tasks: new Map(tasks.map((item) => [item.id, item])),
    habits,
    goals,
    skillIdToMonumentId: new Map([["skill-1", "monument-1"]]),
    skillIdToIcon,
    monumentIdToEmoji: new Map([["monument-1", "M"]]),
    mealWindows: [],
    dateKey: "2024-01-08",
    date: new Date("2024-01-08T12:00:00.000Z"),
    timeZone: "UTC",
    completedHabitIds: new Set(),
  });

  return buildMatrixScheduledEvents({
    events: rawEvents,
    routines,
    projects: new Map(projects.map((item) => [item.id, item])),
    goals,
    tasks: new Map(tasks.map((item) => [item.id, item])),
    skillIdToIcon,
    monumentIdToEmoji: new Map([["monument-1", "M"]]),
  });
};

describe("Matrix scheduled TASK events", () => {
  it("includes TASK in the shared scheduled source allowlist", () => {
    expect(MATRIX_SCHEDULED_SOURCE_TYPES).toEqual([
      "PROJECT",
      "TASK",
      "HABIT",
      "EVENT",
    ]);
  });

  it("collects TASK ids and parent project ids from scheduled task rows", () => {
    const instances = [
      baseInstance({ id: "task-instance", source_id: "task-1" }),
      baseInstance({
        id: "project-instance",
        source_type: "PROJECT",
        source_id: "project-2",
      }),
    ];

    expect(collectMatrixScheduledTaskIds(instances)).toEqual(["task-1"]);
    expect(
      collectMatrixScheduledProjectIds({
        instances,
        tasks: [task({ id: "task-1", project_id: "project-1" })],
      }),
    ).toEqual(["project-2", "project-1"]);
  });

  it("renders one scheduled TASK from Project A as one Project A card with Project task children", () => {
    const taskOne = task({ id: "task-1", name: "Write" });
    const taskTwo = task({ id: "task-2", name: "Ship" });
    const events = build({
      instances: [
        baseInstance({ id: "task-instance-1", source_id: "task-1" }),
      ],
      tasks: [taskOne],
      projects: [project([taskOne, taskTwo])],
    });

    expect(events).toHaveLength(1);
    expect(events[0].instance.source_type).toBe("PROJECT");
    expect(events[0].goal?.id).toBe("project-1");
    expect(events[0].title).toBe("Launch Project");
    expect(events[0].projectTasks).toHaveLength(2);
    expect(events[0].projectTasks[0]).toMatchObject({
      id: "task-1",
      name: "Write",
    });
    expect(events[0].projectTasks[0].sourceInstance.id).toBe("task-instance-1");
    expect(events[0].projectTasks[1]).toMatchObject({
      id: "task-2",
      name: "Ship",
    });
    expect(events[0].projectTasks[1].sourceInstance.source_type).toBe("PROJECT");
    expect(
      events.filter((event) => event.instance.source_type === "TASK"),
    ).toHaveLength(0);
  });

  it("renders a real PROJECT instance with Project entity task children", () => {
    const taskOne = task({ id: "task-1", name: "Write" });
    const taskTwo = task({ id: "task-2", name: "Ship" });
    const events = build({
      instances: [
        baseInstance({
          id: "project-instance",
          source_type: "PROJECT",
          source_id: "project-1",
        }),
      ],
      tasks: [],
      projects: [project([taskOne, taskTwo])],
    });

    expect(events).toHaveLength(1);
    expect(events[0].instance.id).toBe("project-instance");
    expect(events[0].instance.source_type).toBe("PROJECT");
    expect(events[0].projectTasks.map((item) => item.name)).toEqual([
      "Write",
      "Ship",
    ]);
    expect(
      events[0].projectTasks.map((item) => item.sourceInstance.id),
    ).toEqual(["project-instance", "project-instance"]);
  });

  it("groups multiple qualifying TASK instances from one project into one Project presentation", () => {
    const taskOne = task({ id: "task-1", name: "Write" });
    const taskTwo = task({ id: "task-2", name: "Ship" });
    const events = build({
      instances: [
        baseInstance({
          id: "task-instance-1",
          source_id: "task-1",
          start_utc: "2024-01-08T15:00:00.000Z",
          end_utc: "2024-01-08T15:30:00.000Z",
        }),
        baseInstance({
          id: "task-instance-2",
          source_id: "task-2",
          start_utc: "2024-01-08T15:30:00.000Z",
          end_utc: "2024-01-08T16:00:00.000Z",
        }),
      ],
      tasks: [taskOne, taskTwo],
      projects: [project([taskOne, taskTwo])],
    });

    expect(events).toHaveLength(1);
    expect(events[0].instance.source_type).toBe("PROJECT");
    expect(events[0].goal?.id).toBe("project-1");
    expect(
      events.filter((event) => event.instance.source_type === "TASK"),
    ).toHaveLength(0);
    expect(events[0].projectTasks.map((item) => item.sourceInstance.id)).toEqual([
      "task-instance-1",
      "task-instance-2",
    ]);
  });

  it("combines a real PROJECT instance with child TASK instances without duplicates", () => {
    const taskOne = task({ id: "task-1", name: "Write" });
    const events = build({
      instances: [
        baseInstance({
          id: "project-instance",
          source_type: "PROJECT",
          source_id: "project-1",
        }),
        baseInstance({ id: "task-instance-1", source_id: "task-1" }),
      ],
      tasks: [taskOne],
      projects: [project([taskOne])],
    });

    expect(events).toHaveLength(1);
    expect(events[0].instance.id).toBe("project-instance");
    expect(events[0].instance.source_type).toBe("PROJECT");
    expect(
      events.filter((event) => event.instance.source_type === "TASK"),
    ).toHaveLength(0);
    expect(events[0].projectTasks[0].sourceInstance.id).toBe(
      "task-instance-1",
    );
  });

  it("keeps child completion scoped to the real TASK schedule instance id", () => {
    const taskOne = task({ id: "task-1", name: "Write" });
    const events = build({
      instances: [
        baseInstance({ id: "task-instance-1", source_id: "task-1" }),
      ],
      tasks: [taskOne],
      projects: [project([taskOne])],
    });

    expect(events).toHaveLength(1);
    expect(events[0].projectTasks).toHaveLength(1);
    expect(events[0].projectTasks[0].sourceTask.id).toBe("task-1");
    expect(events[0].projectTasks[0].sourceInstance.id).toBe("task-instance-1");
    expect(events[0].projectTasks[0].sourceInstance.source_type).toBe("TASK");
  });

  it("does not produce a standalone TASK presentation for malformed or orphan TASK instances", () => {
    const orphanTask = task({
      id: "task-orphan",
      name: "Orphan",
      project_id: null as unknown as string,
    });
    const events = build({
      instances: [
        baseInstance({ id: "task-orphan-instance", source_id: "task-orphan" }),
        baseInstance({ id: "missing-task-instance", source_id: "missing-task" }),
      ],
      tasks: [orphanTask],
      projects: [],
    });

    expect(events).toHaveLength(0);
    expect(
      events.filter((event) => event.instance.source_type === "TASK"),
    ).toHaveLength(0);
  });

  it("preserves routine grouping and PROJECT/HABIT/EVENT scheduled behavior", () => {
    const habit = {
      id: "habit-1",
      name: "Practice",
      routine_id: "routine-1",
      routine_position: 1,
      skill_id: "skill-1",
      goal_id: null,
      habit_type: "HABIT",
      duration_minutes: 10,
      energy: "LOW",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      last_completed_at: null,
      current_streak_days: 0,
      longest_streak_days: 0,
      recurrence: "daily",
      recurrence_days: null,
      recurrence_mode: null,
      anchor_type: null,
      anchor_value: null,
      anchor_start_date: null,
      completion_target: null,
      location_context_id: null,
      daylight_preference: null,
      window_edge_preference: null,
      next_due_override: null,
      memo_capture_config: null,
    } as unknown as HabitRow;
    const taskOne = task({ id: "task-1" });
    const events = build({
      instances: [
        baseInstance({
          id: "project-instance",
          source_type: "PROJECT",
          source_id: "project-1",
        }),
        baseInstance({
          id: "habit-instance",
          source_type: "HABIT",
          source_id: "habit-1",
        }),
        baseInstance({
          id: "event-instance",
          source_type: "EVENT",
          source_id: "event-1",
          event_name: "Calendar event",
        }),
      ],
      tasks: [taskOne],
      projects: [project([taskOne])],
      habits: new Map([["habit-1", habit]]),
      routines: new Map([
        ["routine-1", { id: "routine-1", name: "Morning", description: null, icon: "R" }],
      ]),
    });

    expect(events.some((event) => event.instance.id === "project-instance")).toBe(true);
    expect(events.some((event) => event.instance.id === "event-instance")).toBe(true);
    const routineEvent = events.find((event) => event.routine);
    expect(routineEvent?.routine?.habits[0].sourceInstance?.id).toBe("habit-instance");
  });
});
