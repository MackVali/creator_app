import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scheduleBacklog } from "../../../src/lib/scheduler/reschedule";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import * as repo from "../../../src/lib/scheduler/repo";
import * as placement from "../../../src/lib/scheduler/placement";
import * as habitsRepo from "../../../src/lib/scheduler/habits";
import { getDatePartsInTimeZone } from "../../../src/lib/scheduler/timezone";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";
import type { ProjectLite } from "../../../src/lib/scheduler/weight";
import * as habits from "../../../src/lib/scheduler/habits";
import type { HabitScheduleItem } from "../../../src/lib/scheduler/habits";

const realPlaceItemInWindows = placement.placeItemInWindows;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: vi.fn(() => null),
}));

describe("scheduleBacklog", () => {
  const userId = "user-1";
  const baseDate = new Date("2024-01-02T12:00:00Z");
  type BacklogResponse = Awaited<ReturnType<typeof instanceRepo.fetchBacklogNeedingSchedule>>;
  type InstancesResponse = Awaited<ReturnType<typeof instanceRepo.fetchInstancesForRange>>;
  type ScheduleBacklogClient = Parameters<typeof scheduleBacklog>[2];
  type ProjectPlacementCall = {
    id: string;
    reuseInstanceId: string | null;
    ignoreIds: string[];
  };

  const createInstanceRecord = (overrides: Partial<ScheduleInstance> = {}): ScheduleInstance =>
    ({
      id: "inst-default",
      user_id: userId,
      source_id: "proj-default",
      source_type: "PROJECT",
      status: "scheduled",
      start_utc: "2024-01-02T09:00:00Z",
      end_utc: "2024-01-02T10:00:00Z",
      duration_min: 60,
      window_id: "win-default",
      weight_snapshot: null,
      energy_resolved: "NO",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      note: null,
      label: null,
      project_instance_id: null,
      user_timezone: null,
      planned_start_utc: null,
      planned_end_utc: null,
      backlog_item_id: null,
      backlog_item_type: null,
      backlog_item_status: null,
      backlog_item_name: null,
      backlog_item_priority: null,
      backlog_item_stage: null,
      backlog_item_duration_min: null,
      backlog_item_energy: null,
      backlog_item_skill_id: null,
      backlog_item_skill_icon: null,
      backlog_item_project_id: null,
      backlog_item_project_stage: null,
      backlog_item_project_energy: null,
      backlog_item_project_priority: null,
      completed_at: null,
      created_by: null,
      updated_by: null,
      source_duration_min: null,
      energy_snapshot: null,
      energy_resolved_snapshot: null,
      metadata: null,
      ...overrides,
    }) as ScheduleInstance;

  let instances: ScheduleInstance[];
  let fetchInstancesForRangeSpy: ReturnType<typeof vi.spyOn>;
  let attemptedProjectIds: string[];
  let fetchHabitsForScheduleSpy: ReturnType<typeof vi.spyOn>;

  const createSupabaseMock = (
    options?: { skills?: Array<{ id: string; monument_id: string | null }> }
  ) => {
    let lastEqValue: string | null = null;
    const skillsResponse = {
      data: options?.skills ?? [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
    const single = vi.fn(async () => ({
      data: { id: lastEqValue },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn((_: string, value: string) => {
      lastEqValue = value;
      return { select };
    });
    const update = vi.fn(() => ({ eq }));
    const buildQueryChain = () => {
      const chain = {
        eq: vi.fn(() => chain),
        not: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          data: [],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        })),
      };
      return chain;
    };
    const insert = vi.fn((input: unknown) => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: input ?? null,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        })),
      })),
    }));
    const from = vi.fn((table: string) => {
      if (table === "skills") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => skillsResponse),
          })),
        };
      }
      if (table === "schedule_instances") {
        return {
          update,
          insert,
          select: vi.fn(() => buildQueryChain()),
        };
      }
      return { update, insert };
    });
    const client = { from } as unknown as ScheduleBacklogClient;
    return { client, update };
  };

  beforeEach(() => {
    instances = [
      createInstanceRecord({
        id: "inst-existing",
        source_id: "proj-1",
        start_utc: "2024-01-02T15:00:00Z",
        end_utc: "2024-01-02T16:00:00Z",
        window_id: "win-existing",
        weight_snapshot: 1,
      }),
    ];

    const backlogResponse: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(backlogResponse);
    fetchInstancesForRangeSpy = vi
      .spyOn(instanceRepo, "fetchInstancesForRange")
      .mockImplementation(async () => ({
        data: [...instances],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      }) satisfies InstancesResponse);

    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
      "proj-2": {
        id: "proj-2",
        name: "New",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    });
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(repo, "fetchGoalsForUser").mockResolvedValue([]);
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([
      {
        id: "win-1",
        label: "Any",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      },
    ]);

    attemptedProjectIds = [];
    vi.spyOn(placement, "placeItemInWindows").mockImplementation(async ({ item }) => {
      attemptedProjectIds.push(item.id);
      return { error: "NO_FIT" as const };
    });

    fetchHabitsForScheduleSpy = vi
      .spyOn(habits, "fetchHabitsForSchedule")
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes projects in descending weight order", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-low",
          source_id: "proj-low",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-high",
          source_id: "proj-high",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-low": {
        id: "proj-low",
        name: "Lower priority",
        priority: "LOW",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 60,
      },
      "proj-high": {
        id: "proj-high",
        name: "Higher priority",
        priority: "HIGH",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 60,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-low",
        label: "Morning",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      },
    ]);

    const callOrder: string[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async ({ item }) => {
      callOrder.push(item.id);
      if (item.id === "proj-high") {
        return {
          data: createInstanceRecord({
            id: "inst-high",
            source_id: "proj-high",
            status: "scheduled",
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }
      return { error: "NO_FIT" as const };
    });

    const mockClient = {} as ScheduleBacklogClient;
    await scheduleBacklog(userId, baseDate, mockClient);

    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder[0]).toBe("proj-high");
    expect(callOrder[1]).toBe("proj-low");
  });

  it("repositions overlapping projects by rescheduling the lower weight instance first", async () => {
    const { client } = createSupabaseMock();

    const overlappingWindow: repo.WindowLite = {
      id: "win-overlap",
      label: "Morning",
      energy: "LOW",
      start_local: "09:00",
      end_local: "11:00",
      days: [2],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };

    instances = [
      createInstanceRecord({
        id: "inst-heavy",
        source_id: "proj-heavy",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:30:00Z",
        window_id: overlappingWindow.id,
        weight_snapshot: 80,
      }),
      createInstanceRecord({
        id: "inst-light",
        source_id: "proj-light",
        start_utc: "2024-01-02T09:30:00Z",
        end_utc: "2024-01-02T11:00:00Z",
        window_id: overlappingWindow.id,
        weight_snapshot: 10,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-heavy": {
        id: "proj-heavy",
        name: "Heavy",
        priority: "HIGH",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 90,
      },
      "proj-light": {
        id: "proj-light",
        name: "Light",
        priority: "LOW",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 90,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([overlappingWindow]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([overlappingWindow]);

    const placementCalls: ProjectPlacementCall[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item, reuseInstanceId, ignoreProjectIds }) => {
        placementCalls.push({
          id: item.id,
          reuseInstanceId: reuseInstanceId ?? null,
          ignoreIds: Array.from(ignoreProjectIds ?? []).sort(),
        });
        return {
          data: createInstanceRecord({
            id: `inst-${item.id}`,
            source_id: item.id,
            status: "scheduled",
            start_utc: "2024-01-02T11:30:00Z",
            end_utc: "2024-01-02T12:30:00Z",
            window_id: overlappingWindow.id,
            weight_snapshot: item.weight,
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      },
    );

    const morningBaseDate = new Date("2024-01-02T07:00:00Z");
    await scheduleBacklog(userId, morningBaseDate, client, {
      writeThroughDays: 1,
      mode: { type: "SKILLED", skillIds: ["skill-x"] },
    });

    expect(placementCalls.length).toBeGreaterThan(0);
    expect(placementCalls[0]).toEqual({
      id: "proj-light",
      reuseInstanceId: "inst-light",
      ignoreIds: ["proj-light"],
    });
  });

  it("repositions overlapping projects even when they belong to different windows", async () => {
    const { client } = createSupabaseMock();

    const windowLeft: repo.WindowLite = {
      id: "win-left",
      label: "Focus",
      energy: "LOW",
      start_local: "09:00",
      end_local: "11:00",
      days: [2],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };

    const windowRight: repo.WindowLite = {
      id: "win-right",
      label: "Deep Work",
      energy: "LOW",
      start_local: "09:30",
      end_local: "11:30",
      days: [2],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };

    instances = [
      createInstanceRecord({
        id: "inst-alpha",
        source_id: "proj-alpha",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:30:00Z",
        window_id: windowLeft.id,
        weight_snapshot: 70,
      }),
      createInstanceRecord({
        id: "inst-beta",
        source_id: "proj-beta",
        start_utc: "2024-01-02T09:30:00Z",
        end_utc: "2024-01-02T11:00:00Z",
        window_id: windowRight.id,
        weight_snapshot: 15,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-alpha": {
        id: "proj-alpha",
        name: "Alpha",
        priority: "HIGH",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 90,
      },
      "proj-beta": {
        id: "proj-beta",
        name: "Beta",
        priority: "LOW",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 90,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLeft,
      windowRight,
    ]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([windowLeft, windowRight]);

    const placementCalls: ProjectPlacementCall[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item, reuseInstanceId, ignoreProjectIds }) => {
        placementCalls.push({
          id: item.id,
          reuseInstanceId: reuseInstanceId ?? null,
          ignoreIds: Array.from(ignoreProjectIds ?? []).sort(),
        });
        return {
          data: createInstanceRecord({
            id: `inst-${item.id}`,
            source_id: item.id,
            status: "scheduled",
            start_utc: "2024-01-02T12:00:00Z",
            end_utc: "2024-01-02T13:00:00Z",
            window_id: windowRight.id,
            weight_snapshot: item.weight,
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      },
    );

    const base = new Date("2024-01-02T07:00:00Z");
    await scheduleBacklog(userId, base, client, { writeThroughDays: 1 });

    expect(placementCalls.length).toBeGreaterThan(0);
    expect(placementCalls[0]).toEqual({
      id: "proj-beta",
      reuseInstanceId: "inst-beta",
      ignoreIds: ["proj-beta"],
    });
  });

  it("creates schedule instances for due habits", async () => {
    const { client } = createSupabaseMock();

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(emptyBacklog);
    vi.spyOn(instanceRepo, "fetchInstancesForRange").mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);
    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([
      {
        id: "win-habit",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: null,
      },
    ] as unknown as repo.WindowLite[]);

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-1",
      name: "Stretch",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      energy: null,
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: null,
    };

    vi.spyOn(habitsRepo, "fetchHabitsForSchedule").mockResolvedValue([habit]);

    const habitInstance = createInstanceRecord({
      id: "inst-habit",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:15:00Z",
      duration_min: 15,
      window_id: "win-habit",
      energy_resolved: "LOW",
      weight_snapshot: 0,
    });

    const placeSpy = vi
      .spyOn(placement, "placeItemInWindows")
      .mockImplementation(async (params) => {
        expect(params.item.sourceType).toBe("HABIT");
        return {
          data: habitInstance,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      });

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        item: expect.objectContaining({
          id: habit.id,
          sourceType: "HABIT",
        }),
      }),
    );
    expect(result.placed).toContainEqual(habitInstance);
    expect(
      result.timeline.some(
        entry => entry.type === "HABIT" && entry.instanceId === habitInstance.id,
      ),
    ).toBe(true);
  });

  it("relaxes habit constraints when location and daylight would block placement", async () => {
    const { client } = createSupabaseMock();

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(emptyBacklog);
    vi.spyOn(instanceRepo, "fetchInstancesForRange").mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);
    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([
      {
        id: "win-night",
        label: "Late",
        energy: "NO",
        start_local: "22:00",
        end_local: "23:00",
        days: null,
        location_context_value: "OFFICE",
      },
    ] as unknown as repo.WindowLite[]);

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-2",
      name: "Journal",
      durationMinutes: 30,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      energy: null,
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: "ctx-home",
      locationContextValue: "HOME",
      locationContextName: "Home",
      daylightPreference: "DAY",
      windowEdgePreference: null,
      window: null,
    };

    vi.spyOn(habitsRepo, "fetchHabitsForSchedule").mockResolvedValue([habit]);

    const habitInstance = createInstanceRecord({
      id: "inst-habit-2",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T22:00:00Z",
      end_utc: "2024-01-02T22:30:00Z",
      duration_min: 30,
      window_id: "win-night",
      energy_resolved: "NO",
      weight_snapshot: 0,
    });

    const placeSpy = vi
      .spyOn(placement, "placeItemInWindows")
      .mockImplementation(async (params) => {
        expect(params.item.sourceType).toBe("HABIT");
        return {
          data: habitInstance,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      });

    const result = await scheduleBacklog(userId, baseDate, client, { writeThroughDays: 1 });

    expect(placeSpy).toHaveBeenCalled();
    expect(placeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        item: expect.objectContaining({
          id: habit.id,
          sourceType: "HABIT",
        }),
      }),
    );
    expect(result.failures).toEqual([]);
    expect(
      result.timeline.some(
        entry => entry.type === "HABIT" && entry.instanceId === habitInstance.id,
      ),
    ).toBe(true);
  });

  it("cancels duplicate habit instances on the same day", async () => {
    const { client, update } = createSupabaseMock();

    const windowLite: repo.WindowLite = {
      id: "win-habit",
      label: "Morning",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([windowLite]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([windowLite]);

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-duplicate",
      name: "Meditate",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: "win-habit",
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-habit",
        label: "Morning",
        energy: "LOW",
        startLocal: "08:00",
        endLocal: "09:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    vi.spyOn(habitsRepo, "fetchHabitsForSchedule").mockResolvedValue([habit]);

    const keeper = createInstanceRecord({
      id: "inst-habit-keep",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:15:00Z",
      duration_min: 15,
      window_id: "win-habit",
      energy_resolved: "LOW",
    });
    const duplicate = createInstanceRecord({
      id: "inst-habit-duplicate",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T10:00:00Z",
      end_utc: "2024-01-02T10:15:00Z",
      duration_min: 15,
      window_id: "win-habit",
      energy_resolved: "LOW",
    });

    instances = [keeper, duplicate];

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0]
      const startSource = windowDef?.availableStartLocal ?? windowDef?.startLocal ?? params.date
      const start = new Date(startSource)
      const end = new Date(start.getTime() + Math.max(1, params.item.duration_min) * 60000)
      const instanceId =
        params.reuseInstanceId ?? `${params.item.id}-${start.toISOString()}`

      return {
        data: {
          ...keeper,
          id: instanceId,
          source_id: params.item.id,
          source_type: params.item.sourceType,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef?.id ?? keeper.window_id,
          energy_resolved: params.item.energy,
        },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>
    })

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({ status: "canceled" });
    const eqMock = update.mock.results[0].value.eq as vi.Mock;
    expect(eqMock).toHaveBeenCalledWith("id", duplicate.id);

    const habitEntries = result.timeline.filter(
      entry => entry.type === "HABIT" && entry.habit.id === habit.id,
    );
    expect(
      habitEntries.some(entry => entry.instanceId === duplicate.id),
    ).toBe(false);
    expect(
      result.failures.filter(failure => failure.reason === "error"),
    ).toEqual([]);
  });

  it("prevents sync habits from overlapping when scheduling multiple habits", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite: repo.WindowLite = {
      id: "win-sync",
      label: "Sync Window",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    };

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([windowLite]);

    const habitA: HabitScheduleItem = {
      id: "habit-sync-1",
      name: "Sync Habit A",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: windowLite.energy ?? null,
        startLocal: windowLite.start_local ?? "08:00",
        endLocal: windowLite.end_local ?? "09:00",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    const habitB: HabitScheduleItem = {
      ...habitA,
      id: "habit-sync-2",
      name: "Sync Habit B",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habitA, habitB]);

    const firstInstance = createInstanceRecord({
      id: "inst-sync-1",
      source_id: habitA.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:15:00Z",
      duration_min: 15,
      window_id: windowLite.id,
      energy_resolved: "LOW",
    });

    const secondInstance = createInstanceRecord({
      id: "inst-sync-2",
      source_id: habitB.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:15:00Z",
      end_utc: "2024-01-02T08:30:00Z",
      duration_min: 15,
      window_id: windowLite.id,
      energy_resolved: "LOW",
    });

    type PlacementCall = {
      allowHabitOverlap?: boolean;
      existing: Array<{ id: string; sourceType: string }>;
      itemId: string;
      sourceType: string;
    };
    const placementCalls: PlacementCall[] = [];

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      placementCalls.push({
        allowHabitOverlap: params.allowHabitOverlap,
        existing: (params.existingInstances ?? []).map(inst => ({
          id: inst.id,
          sourceType: inst.source_type ?? "",
        })),
        itemId: params.item.id,
        sourceType: params.item.sourceType,
      });

      if (params.item.id === habitA.id) {
        return {
          data: firstInstance,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
      if (params.item.id === habitB.id) {
        return {
          data: secondInstance,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }

      return { error: "NO_FIT" as const };
    });

    const result = await scheduleBacklog(userId, baseDate, client);

    const habitCalls = placementCalls.filter(
      call =>
        call.sourceType === "HABIT" &&
        (call.itemId === habitA.id || call.itemId === habitB.id),
    );
    expect(habitCalls.length).toBeGreaterThanOrEqual(2);

    const habitBCalls = habitCalls.filter(call => call.itemId === habitB.id);
    expect(habitBCalls.length).toBeGreaterThan(0);
    const latestHabitBCall = habitBCalls[habitBCalls.length - 1];
    expect(
      latestHabitBCall.existing.some(
        inst => inst.id === firstInstance.id && inst.sourceType === "HABIT",
      ),
    ).toBe(true);

    const habitEntriesById = new Map<string, Array<{ startUTC: string; endUTC: string }>>();
    for (const entry of result.timeline) {
      if (entry.type !== "HABIT") continue;
      if (entry.habit.id !== habitA.id && entry.habit.id !== habitB.id) continue;
      const existing = habitEntriesById.get(entry.habit.id) ?? [];
      existing.push({
        startUTC: entry.habit.startUTC,
        endUTC: entry.habit.endUTC,
      });
      habitEntriesById.set(entry.habit.id, existing);
    }

    expect(habitEntriesById.get(habitA.id)?.length ?? 0).toBeGreaterThan(0);
    expect(habitEntriesById.get(habitB.id)?.length ?? 0).toBeGreaterThan(0);

    const earliestHabitA = [...(habitEntriesById.get(habitA.id) ?? [])].sort(
      (a, b) => new Date(a.startUTC).getTime() - new Date(b.startUTC).getTime(),
    )[0];
    const earliestHabitB = [...(habitEntriesById.get(habitB.id) ?? [])].sort(
      (a, b) => new Date(a.startUTC).getTime() - new Date(b.startUTC).getTime(),
    )[0];

    expect(earliestHabitA.endUTC).toBe(earliestHabitB.startUTC);

    const persistedByHabit = (result.placed ?? []).filter(
      inst => inst.source_id === habitA.id || inst.source_id === habitB.id,
    );
    expect(
      persistedByHabit.filter(inst => inst.source_id === habitA.id).length,
    ).toBeGreaterThan(0);
    expect(
      persistedByHabit.filter(inst => inst.source_id === habitB.id).length,
    ).toBeGreaterThan(0);
  });

  it("reschedules habits that conflict with scheduled projects", async () => {
    const { client } = createSupabaseMock();

    const windowLite: repo.WindowLite = {
      id: "win-mix",
      label: "Shared Window",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    };

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-keep": {
        id: "proj-keep",
        name: "Existing Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 30,
      },
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([windowLite]);

    const habit: HabitScheduleItem = {
      id: "habit-conflict",
      name: "Conflicting Habit",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: windowLite.id,
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: windowLite.energy ?? null,
        startLocal: windowLite.start_local ?? "08:00",
        endLocal: windowLite.end_local ?? "09:00",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const projectInstance = createInstanceRecord({
      id: "inst-project",
      source_id: "proj-keep",
      source_type: "PROJECT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:30:00Z",
      duration_min: 30,
      window_id: windowLite.id,
      energy_resolved: "LOW",
    });

    const habitInstance = createInstanceRecord({
      id: "inst-habit-conflict",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:15:00Z",
      duration_min: 15,
      window_id: windowLite.id,
      energy_resolved: "LOW",
    });

    instances = [projectInstance, habitInstance];

    const rescheduledHabitInstance = createInstanceRecord({
      id: habitInstance.id,
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:30:00.000Z",
      end_utc: "2024-01-02T08:45:00.000Z",
      duration_min: 15,
      window_id: windowLite.id,
      energy_resolved: "LOW",
    });

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      if (params.item.sourceType !== "HABIT") {
        return { error: "NO_FIT" as const };
      }
      return {
        data: {
          ...rescheduledHabitInstance,
          id: rescheduledHabitInstance.id,
        },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    const habitTimeline = result.timeline.find(
      entry => entry.type === "HABIT" && entry.habit.id === habit.id,
    );
    expect(habitTimeline).toBeDefined();
    expect(new Date(habitTimeline?.habit.startUTC ?? "").toISOString()).toBe(
      rescheduledHabitInstance.start_utc,
    );
    expect(new Date(habitTimeline?.habit.endUTC ?? "").toISOString()).toBe(
      rescheduledHabitInstance.end_utc,
    );
  });

  it("does not schedule projects that already have completed instances", async () => {
    const { client } = createSupabaseMock();

    const completedInstance = createInstanceRecord({
      id: "inst-completed",
      source_id: "proj-complete",
      source_type: "PROJECT",
      status: "completed",
      start_utc: "2024-01-02T09:00:00Z",
      end_utc: "2024-01-02T10:00:00Z",
      duration_min: 60,
      window_id: "win-1",
      completed_at: "2024-01-02T10:00:00Z",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [completedInstance],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-complete": {
        id: "proj-complete",
        name: "Completed Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-1",
        label: "Morning",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      },
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async () => ({
      error: "NO_FIT" as const,
    }));

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).not.toHaveBeenCalled();
    expect(result.placed.some(inst => inst.source_id === "proj-complete")).toBe(false);
    expect(
      result.timeline.some(
        entry => entry.type === "PROJECT" && entry.projectId === "proj-complete",
      ),
    ).toBe(false);
  });

  it("reschedules projects whose only completed instance starts after now", async () => {
    const { client } = createSupabaseMock();

    const futureCompletedInstance = createInstanceRecord({
      id: "inst-future-completed",
      source_id: "proj-1",
      source_type: "PROJECT",
      status: "completed",
      start_utc: "2024-01-03T18:00:00Z",
      end_utc: "2024-01-03T19:00:00Z",
      duration_min: 60,
      window_id: "win-future",
      completed_at: "2024-01-02T18:30:00Z",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [futureCompletedInstance],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-future",
        label: "Evening",
        energy: "LOW",
        start_local: "18:00",
        end_local: "19:00",
        days: [2],
      },
    ]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async ({ item }) => ({
      data: createInstanceRecord({
        id: `inst-new-${item.id}`,
        source_id: item.id,
        status: "scheduled",
        start_utc: "2024-01-02T18:00:00Z",
        end_utc: "2024-01-02T19:00:00Z",
        window_id: "win-future",
      }),
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    expect(
      result.timeline.some(
        entry => entry.type === "PROJECT" && entry.projectId === "proj-1",
      ),
    ).toBe(true);
  });

  it("only retains completed instances that fall within the three-day lookback window", async () => {
    const { client } = createSupabaseMock();

    const recentCompleted = createInstanceRecord({
      id: "inst-recent",
      source_id: "proj-1",
      status: "completed",
      start_utc: "2024-01-01T09:00:00Z",
      end_utc: "2024-01-01T10:00:00Z",
      duration_min: 60,
      window_id: "win-1",
      completed_at: "2024-01-01T10:00:00Z",
    });

    const olderCompleted = createInstanceRecord({
      id: "inst-old",
      source_id: "proj-2",
      status: "completed",
      start_utc: "2023-12-25T09:00:00Z",
      end_utc: "2023-12-25T10:00:00Z",
      duration_min: 60,
      window_id: "win-1",
      completed_at: "2023-12-25T10:00:00Z",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [recentCompleted, olderCompleted],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async ({ item }) => ({
      data: createInstanceRecord({
        id: `inst-new-${item.id}`,
        source_id: item.id,
        status: "scheduled",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:00:00Z",
        window_id: "win-1",
      }),
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    expect(
      result.timeline.some(
        entry => entry.type === "PROJECT" && entry.projectId === "proj-2",
      ),
    ).toBe(true);
    expect(
      result.timeline.some(
        entry => entry.type === "PROJECT" && entry.projectId === "proj-1",
      ),
    ).toBe(false);
  });

  it("prevents projects from overlapping completed habits", async () => {
    const { client } = createSupabaseMock();

    const completedHabit = createInstanceRecord({
      id: "inst-habit-completed",
      source_id: "habit-1",
      source_type: "HABIT",
      status: "completed",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:30:00Z",
      duration_min: 30,
      window_id: "win-shared",
      energy_resolved: "LOW",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [completedHabit],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-new": {
        id: "proj-new",
        name: "Overlap Test",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      },
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(realPlaceItemInWindows);

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    const projectPlacement = result.timeline.find(
      entry => entry.type === "PROJECT" && entry.projectId === "proj-new",
    ) as (typeof result.timeline)[number] | undefined;

    expect(projectPlacement).toBeDefined();
    if (projectPlacement && projectPlacement.type === "PROJECT") {
      const placementStart = new Date(projectPlacement.instance.start_utc).getTime();
      const completedEnd = new Date(completedHabit.end_utc).getTime();
      expect(placementStart).toBeGreaterThanOrEqual(completedEnd);
    }
  });

  it.skip("prevents projects from overlapping scheduled habits", async () => {
    const { client } = createSupabaseMock();

    const scheduledHabit = createInstanceRecord({
      id: "inst-habit-scheduled",
      source_id: "habit-1",
      source_type: "HABIT",
      status: "scheduled",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:30:00Z",
      duration_min: 30,
      window_id: "win-shared",
      energy_resolved: "LOW",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [scheduledHabit],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-new": {
        id: "proj-new",
        name: "Overlap Test",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      },
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const result = await scheduleBacklog(userId, baseDate, client);

    const projectPlacement = result.timeline.find(
      entry => entry.type === "PROJECT" && entry.projectId === "proj-new",
    ) as (typeof result.timeline)[number] | undefined;

    expect(projectPlacement).toBeDefined();
    if (projectPlacement && projectPlacement.type === "PROJECT") {
      const placementStart = new Date(projectPlacement.instance.start_utc).getTime();
      const habitEnd = new Date(scheduledHabit.end_utc).getTime();
      expect(placementStart).toBeGreaterThanOrEqual(habitEnd);
    }
  });

  it.skip("reports overlap when existing project and habit share a window with no slack", async () => {
    const { client } = createSupabaseMock();

    const overlappingHabit = createInstanceRecord({
      id: "inst-habit-overlap",
      source_id: "habit-overlap",
      source_type: "HABIT",
      status: "scheduled",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:30:00Z",
      duration_min: 30,
      window_id: "win-shared",
      energy_resolved: "LOW",
    });

    const overlappingProject = createInstanceRecord({
      id: "inst-project-overlap",
      source_id: "proj-overlap",
      source_type: "PROJECT",
      status: "scheduled",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T09:00:00Z",
      duration_min: 60,
      window_id: "win-shared",
      energy_resolved: "LOW",
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [overlappingHabit, overlappingProject],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    fetchHabitsForScheduleSpy.mockResolvedValue([
      {
        id: "habit-overlap",
        name: "Morning Habit",
        durationMinutes: 30,
        createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
        updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
        lastCompletedAt: null,
        habitType: "HABIT",
        windowId: "win-shared",
        energy: "LOW",
        recurrence: "daily",
        recurrenceDays: null,
        skillId: null,
        goalId: null,
        completionTarget: null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
        daylightPreference: null,
        windowEdgePreference: null,
        window: {
          id: "win-shared",
          label: "Morning",
          energy: "LOW",
          startLocal: "08:00",
          endLocal: "09:00",
          days: [2],
          locationContextId: null,
          locationContextValue: null,
          locationContextName: null,
        },
      } as HabitScheduleItem,
    ]);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-overlap": {
        id: "proj-overlap",
        name: "Conflicting Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      },
    ]);

    const result = await scheduleBacklog(userId, baseDate, client);

    const habitPlacement = result.timeline.find(
      entry => entry.type === "HABIT" && entry.habit.id === "habit-overlap",
    );
    const projectPlacement = result.timeline.find(
      entry => entry.type === "PROJECT" && entry.projectId === "proj-overlap",
    );

    expect(habitPlacement).toBeDefined();
    expect(projectPlacement).toBeDefined();

    const habitStart = habitPlacement && habitPlacement.type === "HABIT"
      ? new Date(habitPlacement.habit.startUTC).getTime()
      : NaN;
    const habitEnd = habitPlacement && habitPlacement.type === "HABIT"
      ? new Date(habitPlacement.habit.endUTC).getTime()
      : NaN;
    const projectStart = projectPlacement && projectPlacement.type === "PROJECT"
      ? new Date(projectPlacement.instance.start_utc).getTime()
      : NaN;
    const projectEnd = projectPlacement && projectPlacement.type === "PROJECT"
      ? new Date(projectPlacement.instance.end_utc).getTime()
      : NaN;

    const overlaps =
      Number.isFinite(habitStart) &&
      Number.isFinite(habitEnd) &&
      Number.isFinite(projectStart) &&
      Number.isFinite(projectEnd) &&
      habitEnd > projectStart &&
      habitStart < projectEnd;

    expect(overlaps).toBe(true);
  });

  it("skips habits completed earlier in the same day until the next recurrence", async () => {
    const { client } = createSupabaseMock();

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-habit",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      },
    ]);

    const completionTimestamp = new Date("2024-01-02T07:30:00Z").toISOString();
    const habit: HabitScheduleItem = {
      id: "habit-today",
      name: "Daily Practice",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: completionTimestamp,
      lastCompletedAt: completionTimestamp,
      habitType: "HABIT",
      windowId: "win-habit",
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-habit",
        label: "Morning",
        energy: "LOW",
        startLocal: "08:00",
        endLocal: "09:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async () => ({
      error: "NO_FIT" as const,
    }));

    const baseDateLocal = new Date("2024-01-02T12:00:00Z");
    const baseDayKey = baseDateLocal.toISOString().slice(0, 10);

    const result = await scheduleBacklog(userId, baseDateLocal, client);

    const habitCalls = (placeSpy.mock.calls ?? []).filter(
      call => call?.[0]?.item?.sourceType === "HABIT" && call?.[0]?.item?.id === habit.id,
    );
    expect(
      habitCalls.some(call => call?.[0]?.date?.toISOString().slice(0, 10) === baseDayKey),
    ).toBe(false);

    const habitEntries = result.timeline.filter(
      entry => entry.type === "HABIT" && entry.habit.id === habit.id,
    );
    expect(
      habitEntries.some(
        entry => new Date(entry.habit.startUTC).toISOString().slice(0, 10) === baseDayKey,
      ),
    ).toBe(false);
  });

  it("considers 'NO' energy windows for scheduling", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-no": {
        id: "proj-no",
        name: "No energy project",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 30,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-no",
        label: "Quiet time",
        energy: "NO",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      },
    ]);

    attemptedProjectIds = [];

    const mockClient = {} as ScheduleBacklogClient;
    await scheduleBacklog(userId, baseDate, mockClient);

    expect(attemptedProjectIds).toContain("proj-no");
  });

  it("reduces project durations when rush mode is enabled", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-rush": {
        id: "proj-rush",
        name: "Rush Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 50,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-rush",
        label: "Focus",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      },
    ]);

    const durations: number[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementationOnce(
      async ({ item }) => {
        durations.push(item.duration_min);
        const start = new Date("2024-01-02T09:00:00Z");
        const end = new Date(start.getTime() + item.duration_min * 60000);
        return {
          data: createInstanceRecord({
            id: "inst-rush",
            source_id: item.id,
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: item.duration_min,
            window_id: "win-rush",
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase, {
      mode: { type: "RUSH" },
    });

    expect(durations).toEqual([40]);
    expect(result.failures).toEqual([]);
  });

  it("prioritizes projects tied to the selected monument before others", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-focus": {
        id: "proj-focus",
        name: "Focus Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 45,
        goal_id: "goal-focus",
      },
      "proj-other": {
        id: "proj-other",
        name: "Other Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 45,
        goal_id: "goal-other",
      },
    });

    (repo.fetchGoalsForUser as unknown as vi.Mock).mockResolvedValue([
      { id: "goal-focus", name: "Focus Goal", weight: 0, monumentId: "monument-keep" },
      { id: "goal-other", name: "Other Goal", weight: 0, monumentId: "monument-ignore" },
    ]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-focus",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "13:00",
        days: [2],
      },
    ]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        attemptedProjectIds.push(item.id);
        if (item.id !== "proj-focus") {
          return { error: "NO_FIT" as const };
        }
        const start = new Date("2024-01-02T08:00:00Z");
        const end = new Date(start.getTime() + item.duration_min * 60000);
        return {
          data: createInstanceRecord({
            id: "inst-focus",
            source_id: item.id,
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: item.duration_min,
            window_id: "win-focus",
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, baseDate, supabase, {
      mode: { type: "MONUMENTAL", monumentId: "monument-keep" },
    });

    expect(result.failures.find(failure => failure.reason === "MODE_FILTERED")).toBeUndefined();
    expect(attemptedProjectIds[0]).toBe("proj-focus");
    expect(new Set(attemptedProjectIds)).toEqual(new Set(["proj-focus", "proj-other"]));
  });

  it("prioritizes upcoming windows closest to now before later options", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-medium",
          source_id: "proj-medium",
          status: "missed",
          duration_min: 60,
          energy_resolved: "MEDIUM",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-medium": {
        id: "proj-medium",
        name: "Medium Energy",
        priority: "LOW",
        stage: "RESEARCH",
        energy: "MEDIUM",
        duration_min: 60,
      },
    });

    const testBaseDate = new Date("2024-01-02T10:30:00Z");

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async () => [
      {
        id: "win-past",
        label: "Past",
        energy: "MEDIUM",
        start_local: "06:00",
        end_local: "07:00",
        days: [2],
      },
      {
        id: "win-current",
        label: "Current window",
        energy: "MEDIUM",
        start_local: "09:00",
        end_local: "13:00",
        days: [2],
      },
      {
        id: "win-high",
        label: "High later",
        energy: "HIGH",
        start_local: "13:00",
        end_local: "14:00",
        days: [2],
      },
      {
        id: "win-next",
        label: "Next",
        energy: "MEDIUM",
        start_local: "14:00",
        end_local: "16:00",
        days: [2],
      },
    ]);

    let observedOrder: string[] | null = null;
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async ({ windows }) => {
      if (!observedOrder) {
        observedOrder = windows.map((win) => win.id);
      }
      return { error: "NO_FIT" as const };
    });

    const mockClient = {} as ScheduleBacklogClient;
    await scheduleBacklog(userId, testBaseDate, mockClient);

    expect(observedOrder).toEqual(["win-current", "win-high", "win-next"]);
  });

  it("uses the current time as the anchor for partially elapsed windows", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-medium",
          source_id: "proj-medium",
          status: "missed",
          duration_min: 60,
          energy_resolved: "MEDIUM",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-medium": {
        id: "proj-medium",
        name: "Medium Energy",
        priority: "LOW",
        stage: "RESEARCH",
        energy: "MEDIUM",
        duration_min: 60,
      },
    });

    const anchorDate = new Date("2024-01-02T10:15:00Z");

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-current",
        label: "Current",
        energy: "MEDIUM",
        start_local: "09:00",
        end_local: "13:00",
        days: [2],
      },
    ]);

    let observedStart: Date | null = null;
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async ({ windows }) => {
      if (!observedStart) {
        observedStart = windows[0]?.availableStartLocal ?? null;
      }
      return { error: "NO_FIT" as const };
    });

    const mockClient = {} as ScheduleBacklogClient;
    await scheduleBacklog(userId, anchorDate, mockClient);

    expect(observedStart).not.toBeNull();
    expect(observedStart?.toISOString()).toBe(anchorDate.toISOString());
  });

  it("fills the nearest window sequentially even when new placements are not yet visible", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "One",
        priority: "HIGH",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
      "proj-2": {
        id: "proj-2",
        name: "Two",
        priority: "HIGH",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
      "proj-3": {
        id: "proj-3",
        name: "Three",
        priority: "HIGH",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
      "proj-4": {
        id: "proj-4",
        name: "Four",
        priority: "HIGH",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => [
        {
          id: "win-primary",
          label: "Primary",
          energy: "HIGH",
          start_local: "10:00",
          end_local: "14:00",
          days: [date.getDay()],
        },
      ],
    );

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse));

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async (input) => {
        const data = createInstanceRecord({
          id: `inst-${instances.length + 1}`,
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      },
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-02T10:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(4);
    expect(result.timeline).toHaveLength(4);
    expect(new Set(result.timeline.map(entry => entry.instance.id))).toEqual(
      new Set(result.placed.map(inst => inst.id)),
    );

    const sorted = [...result.placed].sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
    );

    const firstStart = new Date(sorted[0]!.start_utc).getTime();
    const dayAhead = anchor.getTime() + 24 * 60 * 60 * 1000;

    expect(firstStart).toBeGreaterThanOrEqual(anchor.getTime());

    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i]!;
      const startMs = new Date(current.start_utc).getTime();
      expect(startMs).toBeLessThan(dayAhead);
      if (i > 0) {
        const prevEnd = new Date(sorted[i - 1]!.end_utc).getTime();
        expect(startMs).toBe(prevEnd);
      }
      expect(current.window_id).toBe("win-primary");
    }

    expect(createSpy).toHaveBeenCalledTimes(4);
  });

  it("considers windows without an energy designation for all projects", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-any": {
        id: "proj-any",
        name: "Any energy",
        priority: "HIGH",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 60,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-any",
        label: "Any",
        energy: "",
        start_local: "09:00",
        end_local: "11:00",
        days: [baseDate.getDay()],
      },
    ]);

    let observedWindowIds: string[] | null = null;
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item, windows }) => {
        observedWindowIds = windows.map((win) => win.id);
        const start = (windows[0]?.availableStartLocal ?? windows[0]?.startLocal)!;
        const end = new Date(start.getTime() + item.duration_min * 60000);
        return {
          data: createInstanceRecord({
            id: "inst-any",
            source_id: item.id,
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: item.duration_min,
            window_id: windows[0]?.id ?? "win-any",
            weight_snapshot: item.weight,
            energy_resolved: item.energy,
            status: "scheduled",
          }),
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      },
    );

    const anchor = new Date("2024-01-02T10:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(observedWindowIds).toContain("win-any");
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(1);
    expect(result.placed[0]?.window_id).toBe("win-any");
  });

  it("skips 'NO' energy windows even when no other options exist", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-low": {
        id: "proj-low",
        name: "Low energy project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 30,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-no",
        label: "Neutral",
        energy: "NO",
        start_local: "10:00",
        end_local: "11:00",
        days: [baseDate.getDay()],
      },
    ]);

    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, baseDate, mockClient);

    expect(placement.placeItemInWindows).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.failures).toEqual([{ itemId: "proj-low", reason: "NO_WINDOW" }]);
    expect(result.placed).toHaveLength(0);
  });

  it("rolls overflow into future days when a single window recurs daily", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 6 }).reduce<Record<string, ProjectLite>>(
      (acc, _, index) => {
        const id = `proj-${index + 1}`;
        acc[id] = {
          id,
          name: `Project ${index + 1}`,
          priority: "HIGH",
          stage: "PLAN",
          energy: "NO",
          duration_min: 60,
        } as ProjectLite;
        return acc;
      },
      {},
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(projectDefs);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => [
        {
          id: "win-daily",
          label: "Daily focus",
          energy: "HIGH",
          start_local: "10:00",
          end_local: "14:00",
          days: [date.getDay()],
        },
      ],
    );

    fetchInstancesForRangeSpy.mockImplementation(async (_userId, startUTC, endUTC) => {
      const startMs = new Date(startUTC).getTime();
      const endMs = new Date(endUTC).getTime();
      const data = instances.filter(inst => {
        const instStart = new Date(inst.start_utc).getTime();
        const instEnd = new Date(inst.end_utc).getTime();
        return instStart < endMs && instEnd > startMs;
      });
      return {
        data,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies InstancesResponse;
    });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(async input => {
      const data = createInstanceRecord({
        id: `inst-${instances.length + 1}`,
        source_id: input.sourceId,
        start_utc: input.startUTC,
        end_utc: input.endUTC,
        duration_min: input.durationMin,
        window_id: input.windowId ?? null,
        weight_snapshot: input.weightSnapshot,
        energy_resolved: input.energyResolved,
        status: "scheduled",
      });
      instances.push(data);
      return {
        data,
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-02T10:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(6);
    expect(result.timeline).toHaveLength(6);

    const sorted = [...result.placed].sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
    );

    const firstDay = sorted.slice(0, 4);
    const secondDay = sorted.slice(4);

    expect(firstDay.every(inst => inst.window_id === "win-daily")).toBe(true);
    expect(secondDay.every(inst => inst.window_id === "win-daily")).toBe(true);

    expect(
      firstDay.every(inst =>
        new Date(inst.start_utc).toISOString().startsWith("2024-01-02"),
      ),
    ).toBe(true);

    expect(
      secondDay.every(inst =>
        new Date(inst.start_utc).toISOString().startsWith("2024-01-03"),
      ),
    ).toBe(true);
  });

  it("reuses a recurring overnight window on consecutive days", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 4 }).reduce<Record<string, ProjectLite>>(
      (acc, _, index) => {
        const id = `proj-overnight-${index + 1}`;
        acc[id] = {
          id,
          name: `Overnight ${index + 1}`,
          priority: "HIGH",
          stage: "PLAN",
          energy: "NO",
          duration_min: 120,
        } as ProjectLite;
        return acc;
      },
      {},
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(projectDefs);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => [
        {
          id: "win-overnight",
          label: "Overnight",
          energy: "HIGH",
          start_local: "22:00",
          end_local: "02:00",
          days: [date.getDay()],
        },
      ],
    );

    fetchInstancesForRangeSpy.mockImplementation(async (_userId, startUTC, endUTC) => {
      const startMs = new Date(startUTC).getTime();
      const endMs = new Date(endUTC).getTime();
      const data = instances.filter(inst => {
        const instStart = new Date(inst.start_utc).getTime();
        const instEnd = new Date(inst.end_utc).getTime();
        return instStart < endMs && instEnd > startMs;
      });
      return {
        data,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies InstancesResponse;
    });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(async input => {
      const data = createInstanceRecord({
        id: `inst-overnight-${instances.length + 1}`,
        source_id: input.sourceId,
        start_utc: input.startUTC,
        end_utc: input.endUTC,
        duration_min: input.durationMin,
        window_id: input.windowId ?? null,
        weight_snapshot: input.weightSnapshot,
        energy_resolved: input.energyResolved,
        status: "scheduled",
      });
      instances.push(data);
      return {
        data,
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-02T18:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(4);

    const sorted = [...result.placed].sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
    );

    expect(sorted.every(inst => inst.window_id === "win-overnight")).toBe(true);

    const nightlyStarts = sorted
      .filter(inst => inst.start_utc.endsWith("22:00:00.000Z"))
      .map(inst => inst.start_utc);
    expect(nightlyStarts).toHaveLength(2);
    expect(nightlyStarts[0]?.startsWith("2024-01-02T22:00:00.000Z")).toBe(true);
    expect(nightlyStarts[1]?.startsWith("2024-01-03T22:00:00.000Z")).toBe(true);

    const finalStart = sorted.at(-1)?.start_utc ?? "";
    expect(finalStart.startsWith("2024-01-04T00:00:00.000Z")).toBe(true);
  });

  it("extends the scheduling range when the backlog exceeds the default horizon", async () => {
    instances = [];

    const emptyBacklog: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      emptyBacklog,
    );

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 30 }).reduce<Record<string, ProjectLite>>(
      (acc, _, index) => {
        const id = `proj-range-${index + 1}`;
        acc[id] = {
          id,
          name: `Range ${index + 1}`,
          priority: "HIGH",
          stage: "PLAN",
          energy: "NO",
          duration_min: 60,
        } as ProjectLite;
        return acc;
      },
      {},
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(projectDefs);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => [
        {
          id: "win-range",
          label: "Daily slot",
          energy: "HIGH",
          start_local: "09:00",
          end_local: "10:00",
          days: [date.getDay()],
        },
      ],
    );

    fetchInstancesForRangeSpy.mockImplementation(async (_userId, startUTC, endUTC) => {
      const startMs = new Date(startUTC).getTime();
      const endMs = new Date(endUTC).getTime();
      const data = instances.filter(inst => {
        const instStart = new Date(inst.start_utc).getTime();
        const instEnd = new Date(inst.end_utc).getTime();
        return instStart < endMs && instEnd > startMs;
      });
      return {
        data,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies InstancesResponse;
    });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(async input => {
      const data = createInstanceRecord({
        id: `inst-range-${instances.length + 1}`,
        source_id: input.sourceId,
        start_utc: input.startUTC,
        end_utc: input.endUTC,
        duration_min: input.durationMin,
        window_id: input.windowId ?? null,
        weight_snapshot: input.weightSnapshot,
        energy_resolved: input.energyResolved,
        status: "scheduled",
      });
      instances.push(data);
      return {
        data,
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-02T09:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(30);

    const sorted = [...result.placed].sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
    );

    expect(sorted[0]?.start_utc.startsWith("2024-01-02T09:00:00.000Z")).toBe(true);
    expect(sorted.at(-1)?.start_utc.startsWith("2024-01-31T09:00:00.000Z")).toBe(true);
  });

  it(
    "fills remaining time today with later projects even if earlier ones spill into tomorrow",
    async () => {
      instances = [];

      const backlogResponse: BacklogResponse = {
        data: [
          createInstanceRecord({
            id: "missed-long",
            source_id: "proj-long",
            status: "missed",
            duration_min: 180,
            energy_resolved: "NO",
          }),
          createInstanceRecord({
            id: "missed-short",
            source_id: "proj-short",
            status: "missed",
            duration_min: 60,
            energy_resolved: "NO",
          }),
        ],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      };

      (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
        backlogResponse,
      );

      (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
        "proj-long": {
          id: "proj-long",
          name: "Long",
          priority: "HIGH",
          stage: "PLAN",
          energy: "NO",
          duration_min: 180,
        },
        "proj-short": {
          id: "proj-short",
          name: "Short",
          priority: "LOW",
          stage: "PLAN",
          energy: "NO",
          duration_min: 60,
        },
      });

      (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

      (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
        const isoDay = date.toISOString().slice(0, 10);
        if (isoDay === "2024-01-02") {
          return [
            {
              id: "win-today",
              label: "Tonight",
              energy: "HIGH",
              start_local: "21:00",
              end_local: "23:00",
              days: [date.getDay()],
            },
          ];
        }
        if (isoDay === "2024-01-03") {
          return [
            {
              id: "win-tomorrow",
              label: "Tomorrow",
              energy: "HIGH",
              start_local: "09:00",
              end_local: "15:00",
              days: [date.getDay()],
            },
          ];
        }
        return [];
      });

      fetchInstancesForRangeSpy.mockImplementation(async () => ({
        data: [...instances],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      }) satisfies InstancesResponse);

      vi.spyOn(instanceRepo, "createInstance").mockImplementation(async (input) => {
        const data = createInstanceRecord({
          id: `inst-${instances.length + 1}`,
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

      const projectByInstance = new Map([
        ["missed-long", "proj-long"],
        ["missed-short", "proj-short"],
      ]);

      vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async (id, input) => {
        const sourceId = projectByInstance.get(id) ?? "unknown";
        const data = createInstanceRecord({
          id,
          source_id: sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        const remaining = instances.filter((inst) => inst.id !== id);
        remaining.push(data);
        instances = remaining;
        return {
          data,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } as Awaited<ReturnType<typeof instanceRepo.rescheduleInstance>>;
      });

      (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
        async (params) => await realPlaceItemInWindows(params),
      );

      const anchor = new Date("2024-01-02T21:00:00Z");
      const mockClient = {} as ScheduleBacklogClient;
      const result = await scheduleBacklog(userId, anchor, mockClient);

      expect(result.error).toBeUndefined();
      expect(result.failures).toHaveLength(0);
      expect(result.placed).toHaveLength(2);
      expect(result.timeline).toHaveLength(2);
      expect(new Set(result.timeline.map(entry => entry.instance.id))).toEqual(
        new Set(result.placed.map(inst => inst.id)),
      );

      const placementsByStart = [...result.placed].sort(
        (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
      );

      const first = placementsByStart[0]!;
      const second = placementsByStart[1]!;

      expect(new Date(first.start_utc).toISOString().startsWith("2024-01-02")).toBe(true);
      expect(new Date(second.start_utc).toISOString().startsWith("2024-01-03")).toBe(true);
      expect(first.source_id).toBe("proj-short");
      expect(second.source_id).toBe("proj-long");
    },
  );

  it("prefers the earliest compatible window when 'NO' slots are present", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-low-energy",
          source_id: "proj-low-energy",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-low-energy": {
        id: "proj-low-energy",
        name: "Low energy project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      if (day === "2024-01-02") {
        return [
          {
            id: "win-today-no",
            label: "Today blocked",
            energy: "NO",
            start_local: "14:00",
            end_local: "15:00",
            days: [date.getDay()],
          },
          {
            id: "win-today-low",
            label: "Today low",
            energy: "LOW",
            start_local: "15:00",
            end_local: "17:00",
            days: [date.getDay()],
          },
        ];
      }
      if (day === "2024-01-03") {
        return [
          {
            id: "win-tomorrow-low",
            label: "Tomorrow low",
            energy: "LOW",
            start_local: "09:00",
            end_local: "11:00",
            days: [date.getDay()],
          },
        ];
      }
      return [];
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }) satisfies InstancesResponse);

    const placements: Array<{ windowId: string; startUTC: string }> = [];

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async params => {
      const window = params.windows[0];
      if (!window) {
        return { error: "NO_FIT" as const };
      }
      const start = new Date(window.availableStartLocal ?? window.startLocal);
      const end = new Date(start.getTime() + params.item.duration_min * 60000);
      placements.push({ windowId: window.id, startUTC: start.toISOString() });
      return {
        data: createInstanceRecord({
          id: "inst-low-placement",
          source_id: params.item.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: window.id,
          status: "scheduled",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const anchor = new Date("2024-01-02T12:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.failures).toHaveLength(0);
    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(placements).toHaveLength(1);
    expect(placements[0]?.windowId).toBe("win-today-low");
    expect(placements[0]?.startUTC.startsWith("2024-01-02")).toBe(true);
  });

  it("schedules high energy projects into today's earliest compatible window", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-high-energy",
          source_id: "proj-high-energy",
          status: "missed",
          duration_min: 90,
          energy_resolved: "HIGH",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-high-energy": {
        id: "proj-high-energy",
        name: "High focus",
        priority: "HIGH",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 90,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      if (day === "2024-01-02") {
        return [
          {
            id: "win-today-medium",
            label: "Midday medium",
            energy: "MEDIUM",
            start_local: "11:00",
            end_local: "12:00",
            days: [date.getDay()],
          },
          {
            id: "win-today-high",
            label: "Afternoon deep work",
            energy: "HIGH",
            start_local: "15:00",
            end_local: "17:00",
            days: [date.getDay()],
          },
        ];
      }
      if (day === "2024-01-03") {
        return [
          {
            id: "win-tomorrow-high",
            label: "Tomorrow high",
            energy: "HIGH",
            start_local: "09:00",
            end_local: "11:00",
            days: [date.getDay()],
          },
        ];
      }
      return [];
    });

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }) satisfies InstancesResponse);

    const placements: Array<{ windowId: string; startUTC: string }> = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async params => {
      const window = params.windows[0];
      if (!window) {
        return { error: "NO_FIT" as const };
      }
      const start = new Date(window.availableStartLocal ?? window.startLocal);
      const end = new Date(start.getTime() + params.item.duration_min * 60000);
      placements.push({ windowId: window.id, startUTC: start.toISOString() });
      return {
        data: createInstanceRecord({
          id: "inst-high-energy-placement",
          source_id: params.item.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: window.id,
          status: "scheduled",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const anchor = new Date("2024-01-02T13:00:00Z");
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.failures).toHaveLength(0);
    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(placements).toHaveLength(1);
    expect(placements[0]?.windowId).toBe("win-today-high");
    expect(placements[0]?.startUTC.startsWith("2024-01-02")).toBe(true);
  });

  it("moves future scheduled projects into the earliest window later today", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-future-high",
        source_id: "proj-high-energy",
        status: "scheduled",
        start_utc: "2024-01-03T15:00:00Z",
        end_utc: "2024-01-03T16:30:00Z",
        window_id: "win-tomorrow-high",
        duration_min: 90,
        energy_resolved: "HIGH",
        weight_snapshot: 80,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-high-energy": {
        id: "proj-high-energy",
        name: "High energy",
        priority: "HIGH",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 90,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      if (day === "2024-01-02") {
        return [
          {
            id: "win-today-early-high",
            label: "Afternoon deep focus",
            energy: "HIGH",
            start_local: "14:00",
            end_local: "16:00",
            days: [date.getDay()],
          },
          {
            id: "win-today-late-high",
            label: "Evening focus",
            energy: "HIGH",
            start_local: "18:00",
            end_local: "20:00",
            days: [date.getDay()],
          },
        ];
      }
      if (day === "2024-01-03") {
        return [
          {
            id: "win-tomorrow-high",
            label: "Tomorrow high energy",
            energy: "HIGH",
            start_local: "15:00",
            end_local: "17:00",
            days: [date.getDay()],
          },
        ];
      }
      return [];
    });

    const placements: Array<{
      windowId: string;
      reuseInstanceId: string | null;
      startUTC: string;
      notBefore: Date | undefined;
    }> = [];

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async params => {
      const window = params.windows[0];
      if (!window) {
        return { error: "NO_FIT" as const };
      }
      const start = new Date(window.availableStartLocal ?? window.startLocal);
      const end = new Date(start.getTime() + params.item.duration_min * 60000);
      placements.push({
        windowId: window.id,
        reuseInstanceId: params.reuseInstanceId ?? null,
        startUTC: start.toISOString(),
        notBefore: params.notBefore,
      });
      return {
        data: createInstanceRecord({
          id: "inst-future-high",
          source_id: params.item.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: window.id,
          status: "scheduled",
        }),
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, baseDate, mockClient);

    expect(result.failures).toHaveLength(0);
    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(placements).toHaveLength(1);
    expect(placements[0]?.windowId).toBe("win-today-early-high");
    expect(placements[0]?.reuseInstanceId).toBe("inst-future-high");
    expect(placements[0]?.startUTC.startsWith("2024-01-02")).toBe(true);
    const placedStart = new Date(placements[0]?.startUTC ?? 0).getTime();
    expect(placedStart).toBeGreaterThanOrEqual(baseDate.getTime());
    expect(placements[0]?.notBefore?.toISOString()).toBe(baseDate.toISOString());
  });

  it("keeps new placements on the requested local day for positive UTC offsets", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-local-day": {
        id: "proj-local-day",
        name: "Local Day",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-morning",
        label: "Morning",
        energy: "NO",
        start_local: "09:00",
        end_local: "11:00",
        days: [0],
      },
    ]);

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async input => {
        const data = createInstanceRecord({
          id: "inst-local-day",
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-27T09:00:00+13:00");
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: "Pacific/Auckland",
    });

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(
      new Date(placed.start_utc),
      "Pacific/Auckland",
    );
    expect(localParts).toEqual({ year: 2024, month: 1, day: 27 });
  });

  it("keeps new placements on the requested local day for negative UTC offsets", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-local-day": {
        id: "proj-local-day",
        name: "Local Day",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-morning",
        label: "Morning",
        energy: "NO",
        start_local: "09:00",
        end_local: "11:00",
        days: [0],
      },
    ]);

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async input => {
        const data = createInstanceRecord({
          id: "inst-local-day",
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-27T09:00:00-08:00");
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: "America/Los_Angeles",
    });

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(
      new Date(placed.start_utc),
      "America/Los_Angeles",
    );
    expect(localParts).toEqual({ year: 2024, month: 1, day: 27 });
  });

  it("keeps scheduled day offsets aligned across DST transitions", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-dst": {
        id: "proj-dst",
        name: "DST Boundary",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const requestedDates: string[] = [];
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      requestedDates.push(day);
      if (day === "2024-03-10") {
        return [
          {
            id: "win-dst",
            label: "DST Morning",
            energy: "NO",
            start_local: "09:00",
            end_local: "11:00",
            days: [0],
          },
        ];
      }
      return [];
    });

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async input => {
        const data = createInstanceRecord({
          id: "inst-dst",
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-03-09T15:00:00-08:00");
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: "America/Los_Angeles",
    });

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const timelineEntry = result.timeline[0];
    expect(timelineEntry?.scheduledDayOffset).toBe(1);

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(
      new Date(placed.start_utc),
      "America/Los_Angeles",
    );
    expect(localParts).toEqual({ year: 2024, month: 3, day: 10 });
    expect(requestedDates).toContain("2024-03-10");
  });

  it("does not shift projects scheduled in late-night windows to the next day", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-late-night": {
        id: "proj-late-night",
        name: "Late Night",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      if (day === "2024-01-27") {
        return [
          {
            id: "win-late", 
            label: "Late", 
            energy: "NO",
            start_local: "23:00",
            end_local: "01:00",
            days: [0],
          },
        ];
      }
      return [];
    });

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async input => {
        const data = createInstanceRecord({
          id: "inst-late-night",
          source_id: input.sourceId,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId ?? null,
          weight_snapshot: input.weightSnapshot,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        instances.push(data);
        return {
          data,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof instanceRepo.createInstance>>;
      });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(async () => {
      throw new Error("rescheduleInstance should not be called");
    });

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async params => await realPlaceItemInWindows(params),
    );

    const anchor = new Date("2024-01-27T05:00:00-08:00");
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: "America/Los_Angeles",
    });

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(
      new Date(placed.start_utc),
      "America/Los_Angeles",
    );
    expect(localParts).toEqual({ year: 2024, month: 1, day: 27 });
    const timelineEntry = result.timeline[0];
    expect(timelineEntry?.scheduledDayOffset).toBe(0);
  });

  it("treats queued projects as free when evaluating earlier windows", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };

    (instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock).mockResolvedValue(
      backlogResponse,
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-alpha": {
        id: "proj-alpha",
        name: "Alpha",
        priority: "HIGH",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 60,
      },
      "proj-beta": {
        id: "proj-beta",
        name: "Beta",
        priority: "MEDIUM",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 45,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-early",
        label: "High focus",
        energy: "HIGH",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      },
    ]);

    fetchInstancesForRangeSpy.mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);

    const ignoreSets: Array<Set<string> | undefined> = [];
    const placementResults: Array<{ windowId: string; projectId: string }> = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async params => {
      ignoreSets.push(params.ignoreProjectIds ? new Set(params.ignoreProjectIds) : undefined);
      const window = params.windows[0];
      if (!window) {
        return { error: "NO_FIT" as const };
      }
      const start = new Date(window.availableStartLocal ?? window.startLocal);
      const end = new Date(start.getTime() + params.item.duration_min * 60000);
      placementResults.push({ windowId: window.id, projectId: params.item.id });
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: window.id,
          status: "scheduled",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, {} as ScheduleBacklogClient);

    expect(result.failures).toHaveLength(0);
    expect(result.error).toBeUndefined();
    expect(ignoreSets.length).toBe(placementResults.length);
    ignoreSets.forEach((ignoreSet, index) => {
      expect(ignoreSet).toBeDefined();
      const projectId = placementResults[index]?.projectId;
      expect(projectId).toBeDefined();
      expect(ignoreSet?.size).toBe(1);
      expect(ignoreSet?.has(projectId)).toBe(true);
    });
    expect(new Set(placementResults.map(entry => entry.projectId))).toEqual(
      new Set(["proj-alpha", "proj-beta"]),
    );
  });

  it("reschedules projects that started earlier today so they begin at or after the current run time", async () => {
    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockReset();

    instances = [
      createInstanceRecord({
        id: "inst-early",
        source_id: "proj-1",
        start_utc: "2024-01-02T08:00:00Z",
        end_utc: "2024-01-02T09:00:00Z",
        window_id: "win-morning",
        weight_snapshot: 5,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Deep work",
        priority: "HIGH",
        stage: "PLAN",
        energy: "HIGH",
        duration_min: 90,
      },
    } satisfies Record<string, ProjectLite>);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(async (date: Date) => {
      const day = date.toISOString().slice(0, 10);
      if (day === "2024-01-02") {
        return [
          {
            id: "win-morning",
            label: "Morning focus",
            energy: "HIGH",
            start_local: "06:00",
            end_local: "12:00",
            days: [date.getDay()],
          },
        ];
      }
      return [];
    });

    const placements: Array<{ windowId: string; startUTC: string }> = [];

    placeSpy.mockImplementation(async params => {
      const window = params.windows[0];
      expect(window).toBeTruthy();
      expect(params.reuseInstanceId).toBe("inst-early");
      const start = new Date(window.availableStartLocal ?? window.startLocal);
      const end = new Date(start.getTime() + params.item.duration_min * 60000);
      placements.push({ windowId: window.id, startUTC: start.toISOString() });
      return {
        data: createInstanceRecord({
          id: "inst-early",
          source_id: params.item.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: window.id,
          status: "scheduled",
        }),
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const anchor = new Date("2024-01-02T10:30:00Z");
    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, anchor, supabase);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(result.failures).toHaveLength(0);
    expect(placements).toHaveLength(1);
    const scheduledStart = new Date(placements[0]?.startUTC ?? "");
    expect(scheduledStart.getTime()).toBeGreaterThanOrEqual(anchor.getTime());
    expect(result.placed[0]?.start_utc).toBe(placements[0]?.startUTC);
  });

  it("attempts to reschedule already scheduled projects when enqueuing all", async () => {
    const mockClient = {} as ScheduleBacklogClient;
    await scheduleBacklog(userId, baseDate, mockClient);

    expect(fetchInstancesForRangeSpy).toHaveBeenCalled();

    const scheduledProjectIds = new Set(attemptedProjectIds);
    expect(scheduledProjectIds.has("proj-1")).toBe(true);
    expect(scheduledProjectIds.has("proj-2")).toBe(true);
  });

  it("reuses existing instances when fallback enqueues a project", async () => {
    const { client: supabase, update: updateMock } = createSupabaseMock();
    const existing = {
      id: "inst-existing",
      user_id: userId,
      source_id: "proj-1",
      source_type: "PROJECT",
      status: "scheduled",
      start_utc: "2024-01-03T09:00:00Z",
      end_utc: "2024-01-03T10:00:00Z",
      duration_min: 60,
      window_id: "win-existing",
      weight_snapshot: 1,
      energy_resolved: "NO",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      note: null,
      label: null,
      project_instance_id: null,
      user_timezone: null,
      planned_start_utc: null,
      planned_end_utc: null,
      backlog_item_id: null,
      backlog_item_type: null,
      backlog_item_status: null,
      backlog_item_name: null,
      backlog_item_priority: null,
      backlog_item_stage: null,
      backlog_item_duration_min: null,
      backlog_item_energy: null,
      backlog_item_skill_id: null,
      backlog_item_skill_icon: null,
      backlog_item_project_id: null,
      backlog_item_project_stage: null,
      backlog_item_project_energy: null,
      backlog_item_project_priority: null,
      completed_at: null,
      created_by: null,
      updated_by: null,
      source_duration_min: null,
      energy_snapshot: null,
      energy_resolved_snapshot: null,
      metadata: null,
    } as unknown as ScheduleInstance;

    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [existing],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse));

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    });

    let reuseId: string | null = null;
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(async (params) => {
      reuseId = params.reuseInstanceId ?? null;
      return {
        data: existing,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      };
    });

    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(reuseId).toBe("inst-existing");
    expect(result.placed).toHaveLength(1);
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.instance.id).toBe(result.placed[0]?.id);
    expect(result.timeline[0]?.decision).toBe("rescheduled");
    expect(updateMock.mock.calls.some((call) => call?.[0]?.status === "canceled")).toBe(
      false,
    );
  });

  it("reschedules existing placements into the timeline when rerun", async () => {
    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockReset();
    const rescheduled = createInstanceRecord({
      id: "inst-existing",
      source_id: "proj-1",
      start_utc: "2024-01-02T17:00:00Z",
      end_utc: "2024-01-02T18:00:00Z",
      window_id: "win-updated",
    });
    placeSpy.mockImplementation(async ({ reuseInstanceId }) => {
      expect(reuseInstanceId).toBe("inst-existing");
      return {
        data: rescheduled,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      };
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(result.placed).toHaveLength(1);
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.instance.id).toBe("inst-existing");
    expect(result.timeline[0]?.decision).toBe("rescheduled");
  });

  it("does not schedule habits into windows with unmatched location context", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-home",
        label: "Home",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
        location_context_id: "ctx-home",
        location_context_value: "HOME",
        location_context_name: "Home",
      },
    ]);

    const habit: HabitScheduleItem = {
      id: "habit-1",
      name: "Morning reading",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: "win-home",
      window: {
        id: "win-home",
        label: "Home",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "10:00",
        days: [2],
        locationContextId: "ctx-home",
        locationContextValue: "HOME",
        locationContextName: "Home",
      },
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: "ctx-office",
      locationContextValue: "OFFICE",
      locationContextName: "Office",
      daylightPreference: null,
      windowEdgePreference: null,
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    expect(placeMock).not.toHaveBeenCalled();

    const habitEntries = result.timeline.filter((entry) => entry.type === "HABIT");
    expect(habitEntries).toHaveLength(0);
  });

  it("skips work windows when the habit has no location context", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-work",
        label: "Focused Work",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [5],
        location_context_id: null,
        location_context_value: "WORK",
        location_context_name: "Work",
      },
    ]);

    const habit: HabitScheduleItem = {
      id: "habit-locationless",
      name: "Focused practice",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: "win-work",
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-work",
        label: "Focused Work",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "11:00",
        days: [5],
        locationContextId: null,
        locationContextValue: "WORK",
        locationContextName: "Work",
      },
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockClear();

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(placeMock).not.toHaveBeenCalled();
    expect(result.failures).toContainEqual({
      itemId: habit.id,
      reason: "NO_WINDOW",
    });
    const habitEntries = result.timeline.filter(entry => entry.type === "HABIT");
    expect(habitEntries).toHaveLength(0);
  });

  it("schedules habits into windows when location context matches", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-office",
        label: "Office",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
        location_context_id: "ctx-office",
        location_context_value: "OFFICE",
        location_context_name: "Office",
      },
    ]);

    const habit: HabitScheduleItem = {
      id: "habit-2",
      name: "Daily standup",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: "win-office",
      window: {
        id: "win-office",
        label: "Office",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "10:00",
        days: [2],
        locationContextId: "ctx-office",
        locationContextValue: "OFFICE",
        locationContextName: "Office",
      },
      energy: "LOW",
      recurrence: "daily",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: "ctx-office",
      locationContextValue: "OFFICE",
      locationContextName: "Office",
      daylightPreference: null,
      windowEdgePreference: null,
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockReset();
    const placedInstance = createInstanceRecord({
      id: "inst-habit-2",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T09:00:00Z",
      end_utc: "2024-01-02T09:30:00Z",
      window_id: "win-office",
      duration_min: 30,
      energy_resolved: "LOW",
    });
    placeMock.mockResolvedValue({
      data: placedInstance,
      error: null,
      count: null,
      status: 201,
      statusText: "Created",
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(placeMock).toHaveBeenCalled();
    const firstCall = placeMock.mock.calls[0]?.[0];
    expect(firstCall?.windows?.[0]?.id).toBe("win-office");

    const habitEntries = result.timeline.filter((entry) => entry.type === "HABIT");
    expect(habitEntries.length).toBeGreaterThan(0);
  });

  it("schedules practice habits without a recurrence multiple times in practice windows", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        start_local: "15:00",
        end_local: "16:00",
        days: [2],
        window_kind: "PRACTICE",
      },
    ]);

    const practiceHabit: HabitScheduleItem = {
      id: "habit-practice",
      name: "Scale reps",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "PRACTICE",
      windowId: "win-practice",
      energy: "LOW",
      recurrence: null,
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        startLocal: "15:00",
        endLocal: "16:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([practiceHabit]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockReset();
    placeMock.mockImplementation(async ({ item, windows }) => {
      const startLocal = windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
      const duration = item.duration_min ?? 30;
      const startUtc = new Date(startLocal);
      const endUtc = new Date(startUtc.getTime() + duration * 60000);
      return {
        data: createInstanceRecord({
          id: `inst-${item.id}-${startUtc.getTime()}`,
          source_id: item.id,
          source_type: "HABIT",
          start_utc: startUtc.toISOString(),
          end_utc: endUtc.toISOString(),
          duration_min: duration,
          window_id: windows?.[0]?.id ?? "win-practice",
          energy_resolved: item.energy ?? "LOW",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    const practiceEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id,
    );
    expect(practiceEntries).toHaveLength(2);
    const earliestOffset = Math.min(
      ...practiceEntries.map((entry) => entry.scheduledDayOffset ?? Number.POSITIVE_INFINITY),
    );
    const sameDayEntries = practiceEntries.filter(
      (entry) => entry.scheduledDayOffset === earliestOffset,
    );
    expect(sameDayEntries).toHaveLength(2);
    expect(
      practiceEntries.every(
        (entry) =>
          typeof entry.scheduledDayOffset === "number" && entry.scheduledDayOffset < 7,
      ),
    ).toBe(true);
  });

  it("uses the habit skill monument as the practice context when scheduling", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        start_local: "15:00",
        end_local: "16:00",
        days: [2],
        window_kind: "PRACTICE",
      },
    ]);

    const practiceHabit: HabitScheduleItem = {
      id: "habit-practice-context",
      name: "Context reps",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "PRACTICE",
      windowId: "win-practice",
      energy: "LOW",
      recurrence: null,
      recurrenceDays: null,
      skillId: "skill-context",
      skillMonumentId: "monument-skill",
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        startLocal: "15:00",
        endLocal: "16:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([practiceHabit]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockReset();
    placeMock.mockImplementation(async ({ item, windows }) => {
      expect(item.practiceContextId).toBe("monument-skill");
      const startLocal = windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
      const duration = item.duration_min ?? 30;
      const startUtc = new Date(startLocal);
      const endUtc = new Date(startUtc.getTime() + duration * 60000);
      return {
        data: createInstanceRecord({
          id: `inst-${item.id}-${startUtc.getTime()}`,
          source_id: item.id,
          source_type: "HABIT",
          start_utc: startUtc.toISOString(),
          end_utc: endUtc.toISOString(),
          duration_min: duration,
          window_id: windows?.[0]?.id ?? "win-practice",
          energy_resolved: item.energy ?? "LOW",
          practice_context_monument_id: item.practiceContextId ?? null,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    const practiceEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id,
    );
    expect(practiceEntries.length).toBeGreaterThan(0);
    expect(
      practiceEntries.every((entry) => entry.habit.practiceContextId === "monument-skill"),
    ).toBe(true);
  });

  it("cancels practice habit instances beyond the 7-day lookahead", async () => {
    const { client, update } = createSupabaseMock();
    instances = [
      createInstanceRecord({
        id: "inst-practice-future",
        source_id: "habit-practice-future",
        source_type: "HABIT",
        start_utc: "2024-01-10T09:00:00Z",
        end_utc: "2024-01-10T09:30:00Z",
        duration_min: 30,
        window_id: "win-practice",
        energy_resolved: "LOW",
      }),
    ];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([
      {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        start_local: "09:00",
        end_local: "09:30",
        days: [2],
        window_kind: "PRACTICE",
      },
    ]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        start_local: "09:00",
        end_local: "09:30",
        days: [2],
        window_kind: "PRACTICE",
      },
    ]);

    const practiceHabit: HabitScheduleItem = {
      id: "habit-practice-future",
      name: "Scale drills",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "PRACTICE",
      windowId: "win-practice",
      energy: "LOW",
      recurrence: null,
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-practice",
        label: "Practice",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "09:30",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([practiceHabit]);

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(result.failures).toEqual([]);
    expect(
      result.timeline.some(
        (entry) => entry.type === "HABIT" && entry.instanceId === "inst-practice-future",
      ),
    ).toBe(false);
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls.some((call) => call?.[0]?.status === "canceled")).toBe(true);
  });

  it("does not register failures once all practice windows are filled", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-practice-single",
        label: "Practice",
        energy: "LOW",
        start_local: "15:00",
        end_local: "15:30",
        days: [2],
        window_kind: "PRACTICE",
      },
    ]);

    const practiceHabit: HabitScheduleItem = {
      id: "habit-practice-single",
      name: "Single block practice",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "PRACTICE",
      windowId: "win-practice-single",
      energy: "LOW",
      recurrence: "none",
      recurrenceDays: null,
      skillId: null,
      goalId: null,
      completionTarget: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
      daylightPreference: null,
      windowEdgePreference: null,
      window: {
        id: "win-practice-single",
        label: "Practice",
        energy: "LOW",
        startLocal: "15:00",
        endLocal: "15:30",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([practiceHabit]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockReset();
    placeMock.mockImplementation(async ({ item, windows }) => {
      const startLocal = windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
      const duration = item.duration_min ?? 30;
      const startUtc = new Date(startLocal);
      const endUtc = new Date(startUtc.getTime() + duration * 60000);
      return {
        data: createInstanceRecord({
          id: `inst-${item.id}-${startUtc.getTime()}`,
          source_id: item.id,
          source_type: "HABIT",
          start_utc: startUtc.toISOString(),
          end_utc: endUtc.toISOString(),
          duration_min: duration,
          window_id: windows?.[0]?.id ?? "win-practice-single",
          energy_resolved: item.energy ?? "LOW",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    const failuresForHabit = result.failures.filter(
      (failure) => failure.itemId === practiceHabit.id && failure.reason === "NO_WINDOW",
    );
    expect(failuresForHabit).toHaveLength(0);
    const practiceEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id,
    );
    expect(practiceEntries).toHaveLength(1);
    const earliestOffset = Math.min(
      ...practiceEntries.map((entry) => entry.scheduledDayOffset ?? Number.POSITIVE_INFINITY),
    );
    const sameDayEntries = practiceEntries.filter(
      (entry) => entry.scheduledDayOffset === earliestOffset,
    );
    expect(sameDayEntries).toHaveLength(1);
    expect(
      practiceEntries.every(
        (entry) =>
          typeof entry.scheduledDayOffset === "number" && entry.scheduledDayOffset < 7,
      ),
    ).toBe(true);
  });

  it("anchors scheduling to the provided user timezone", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Evening work",
        priority: "LOW",
        stage: "PLAN",
        energy: null,
        duration_min: 60,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const requestedDates: string[] = [];
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        requestedDates.push(date.toISOString());
        return [
          {
            id: "win-evening",
            label: "Evening",
            energy: "NO",
            start_local: "18:00",
            end_local: "20:00",
            days: [1],
          },
        ];
      },
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async () => ({ error: "NO_FIT" as const }),
    );

    const base = new Date("2024-01-02T01:00:00Z");
    const { client: supabase } = createSupabaseMock();

    await scheduleBacklog(userId, base, supabase, {
      timeZone: "America/Los_Angeles",
    });

    expect(requestedDates[0]).toBe("2024-01-01T08:00:00.000Z");
  });
});
