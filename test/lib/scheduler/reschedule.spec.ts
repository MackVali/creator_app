import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchCompatibleWindowsForItem,
  scheduleBacklog,
} from "../../../src/lib/scheduler/reschedule";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import * as repo from "../../../src/lib/scheduler/repo";
import * as placement from "../../../src/lib/scheduler/placement";
import * as habitsRepo from "../../../src/lib/scheduler/habits";
import {
  addDaysInTimeZone,
  getDatePartsInTimeZone,
  getDateTimeParts,
  startOfDayInTimeZone,
} from "../../../src/lib/scheduler/timezone";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";
import type { ProjectLite } from "../../../src/lib/scheduler/weight";
import * as habits from "../../../src/lib/scheduler/habits";
import type { HabitScheduleItem } from "../../../src/lib/scheduler/habits";
import * as reschedule from "../../../src/lib/scheduler/reschedule";
import { createSupabaseMock } from "../../utils/supabaseMock";

const realPlaceItemInWindows = placement.placeItemInWindows;
const schedNow = (isoDate: string, timeZone = "UTC") =>
  startOfDayInTimeZone(new Date(isoDate), timeZone);

// Add:
const atSchedDayHour = (iso: string, tz: string, hour: number, minute = 0) => {
  const d = startOfDayInTimeZone(new Date(iso), tz); // 4am boundary day start
  // If you have setTimeInTimeZone in this file, use it instead.
  // Otherwise simplest: add milliseconds:
  return new Date(d.getTime() + (hour * 60 + minute) * 60_000);
};

// Convenience: "safe now" when tests previously used 00:00Z but wanted "some time today"
const schedNoon = (iso: string, tz: string) => atSchedDayHour(iso, tz, 8);
// 8 hours after scheduler-day start = noon-ish; adjust if you prefer
// Why: some tests actually care about "partially elapsed windows" — for those you want a non-midnight time but still on the same scheduler day.

describe("scheduleBacklog", () => {
  const failDiag = (label: string, payload: any) => {
    throw new Error(label + " " + JSON.stringify(payload));
  };

  // Test-only helpers for gate tracing
  const captureFirstCompatibleCall = () => {
    const spy = vi.spyOn(reschedule, "fetchCompatibleWindowsForItem");
    let firstArgs: any = null;
    spy.mockImplementation((...args: any[]) => {
      if (firstArgs === null) {
        firstArgs = args;
      }
      return spy.getMockImplementation()?.(...args) ?? [];
    });
    return {
      firstArgs: () => firstArgs,
      restore: () => {
        spy.mockRestore();
      },
    };
  };

  const replayGateTrace = (args: any, baseDate: Date) => {
    if (!args) return null;
    const [userId, date, item, tz, options] = args;
    const dayStart = startOfDayInTimeZone(date, tz);
    const dayParts = getDatePartsInTimeZone(dayStart, tz);
    const dayOfWeekInTz = dayParts.dayOfWeek;

    const windows = options.windows || [];
    const firstWindow = windows[0];
    if (!firstWindow) return { error: "no windows" };

    // Simplified replay of gates (based on observed behavior)
    const passedGates: string[] = [];
    let firstGateFailed = "";

    // allowedWindowKinds
    const allowedKinds = options.allowedWindowKinds || ["DEFAULT"];
    if (!allowedKinds.includes(firstWindow.window_kind)) {
      firstGateFailed = "allowedWindowKinds";
    } else {
      passedGates.push("allowedWindowKinds");

      // days
      if (!firstWindow.days.includes(dayOfWeekInTz)) {
        firstGateFailed = "days";
      } else {
        passedGates.push("days");

        // energy
        if (item.resolvedEnergy !== firstWindow.energy) {
          firstGateFailed = "energy";
        } else {
          passedGates.push("energy");

          // locationContextMatch (simplified)
          const itemHasLocation =
            item.locationContextId || item.locationContextValue;
          const windowHasLocation =
            firstWindow.location_context_id ||
            firstWindow.location_context_value;
          if (
            itemHasLocation &&
            windowHasLocation &&
            item.locationContextValue !== firstWindow.location_context_value
          ) {
            firstGateFailed = "locationContextMatch";
          } else {
            passedGates.push("locationContextMatch");

            // durationFit (simplified)
            const windowStartMs = new Date(firstWindow.start_local).getTime();
            const windowEndMs = new Date(firstWindow.end_local).getTime();
            const durationMs = item.duration_min * 60 * 1000;
            if (durationMs > windowEndMs - windowStartMs) {
              firstGateFailed = "durationFit";
            } else {
              passedGates.push("durationFit");

              // availabilityBounds (simplified)
              // Assume no bounds issue for now
              passedGates.push("availabilityBounds");
            }
          }
        }
      }
    }

    const compared: any = {};
    if (firstGateFailed === "days") {
      compared.windowDays = firstWindow.days;
      compared.dayOfWeek = dayOfWeekInTz;
    } else if (firstGateFailed === "energy") {
      compared.itemEnergy = item.resolvedEnergy;
      compared.windowEnergy = firstWindow.energy;
    } else if (firstGateFailed === "durationFit") {
      compared.itemDuration = item.duration_min;
      compared.windowDuration =
        (new Date(firstWindow.end_local).getTime() -
          new Date(firstWindow.start_local).getTime()) /
        (60 * 1000);
    }

    return {
      tz,
      baseDateIso: baseDate.toISOString(),
      dayStartIso: dayStart.toISOString(),
      dayOfWeekInTz,
      item: {
        id: item.id,
        sourceType: item.sourceType,
        duration_min: item.duration_min,
        resolvedEnergy: item.resolvedEnergy,
        itemIdx: item.itemIdx || 0,
      },
      options: {
        allowedWindowKinds: options.allowedWindowKinds || ["DEFAULT"],
        requireLocationContextMatch:
          options.requireLocationContextMatch || false,
        ignoreAvailability: options.ignoreAvailability || false,
        nowProvided: options.nowMs !== undefined,
      },
      window: {
        id: firstWindow.id,
        window_kind: firstWindow.window_kind,
        energy: firstWindow.energy,
        windowIdx: 0,
        days: firstWindow.days,
        start_local: firstWindow.start_local,
        end_local: firstWindow.end_local,
        location_context_id: firstWindow.location_context_id,
        location_context_value: firstWindow.location_context_value,
        location_context_name: firstWindow.location_context_name,
      },
      compatibleWindowsCount: firstGateFailed ? 0 : windows.length,
      firstGateFailed,
      compared,
      passedGates,
    };
  };

  const userId = "user-1";
  const baseDate = schedNow("2024-01-02T12:00:00Z");
  type BacklogResponse = Awaited<
    ReturnType<typeof instanceRepo.fetchBacklogNeedingSchedule>
  >;
  type InstancesResponse = Awaited<
    ReturnType<typeof instanceRepo.fetchInstancesForRange>
  >;
  type ScheduleBacklogClient = Parameters<typeof scheduleBacklog>[2];
  type ProjectPlacementCall = {
    id: string;
    reuseInstanceId: string | null;
    ignoreIds: string[];
  };

  const createInstanceRecord = (
    overrides: Partial<ScheduleInstance> = {}
  ): ScheduleInstance =>
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
    } as ScheduleInstance);

  const makeWindow = (
    overrides: Partial<repo.WindowLite>
  ): repo.WindowLite => ({
    id: "win-default",
    label: "Window",
    energy: "NO",
    start_local: "00:00",
    end_local: "00:00",
    days: null,
    window_kind: "DEFAULT",
    location_context_id: null,
    location_context_value: null,
    location_context_name: null,
    ...overrides,
  });

  const makeHabit = (
    overrides: Partial<HabitScheduleItem> = {}
  ): HabitScheduleItem => ({
    id: "habit-default",
    name: "Habit",
    durationMinutes: 60,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    lastCompletedAt: null,
    currentStreakDays: 0,
    longestStreakDays: 0,
    habitType: "HABIT",
    windowId: "win-default",
    energy: "LOW",
    recurrence: "daily",
    recurrenceDays: null,
    recurrenceMode: null,
    anchorType: null,
    anchorValue: null,
    anchorStartDate: null,
    skillId: null,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    window: {
      id: "win-default",
      label: "Window",
      energy: "LOW",
      startLocal: "00:00",
      endLocal: "00:00",
      days: null,
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
    },
    ...overrides,
  });

  let instances: ScheduleInstance[];
  let fetchInstancesForRangeSpy: ReturnType<typeof vi.spyOn>;
  let attemptedProjectIds: string[];
  let fetchHabitsForScheduleSpy: ReturnType<typeof vi.spyOn>;
  let fetchWindowsForDateSpy: ReturnType<typeof vi.spyOn>;

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
    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(
      backlogResponse
    );
    fetchInstancesForRangeSpy = vi
      .spyOn(instanceRepo, "fetchInstancesForRange")
      .mockImplementation(
        async () =>
          ({
            data: [...instances],
            error: null,
            count: null,
            status: 200,
            statusText: "OK",
          } satisfies InstancesResponse)
      );

    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
      "proj-2": {
        id: "proj-2",
        name: "New",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
    });
    vi.spyOn(repo, "fetchAllProjectsMap").mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
      "proj-2": {
        id: "proj-2",
        name: "New",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
      },
      "proj-non-locked": {
        id: "proj-non-locked",
        name: "Non Locked Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
      "proj-locked": {
        id: "proj-locked",
        name: "Locked Project",
        priority: "HIGH",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 1,
      },
    });
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(repo, "fetchGoalsForUser").mockResolvedValue([]);
    fetchWindowsForDateSpy = vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([
      makeWindow({
        id: "win-1",
        label: "Any",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      }),
    ]);

    attemptedProjectIds = [];
    vi.spyOn(placement, "placeItemInWindows").mockImplementation(
      async ({ item }) => {
        attemptedProjectIds.push(item.id);
        return { error: "NO_FIT" as const };
      }
    );

    fetchHabitsForScheduleSpy = vi
      .spyOn(habits, "fetchHabitsForSchedule")
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("runs without throwing when parity and debug flags are off", async () => {
    const { client } = createSupabaseMock();
    await expect(scheduleBacklog(userId, baseDate, client)).resolves.toBeDefined();
  });

  it("runs without throwing when parity flag is on", async () => {
    const { client } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, client, { parity: true });
    expect(result.paritySummary).not.toBeNull();
  });

  it("runs without throwing when debug flag is on", async () => {
    const { client } = createSupabaseMock();
    await expect(
      scheduleBacklog(userId, baseDate, client, { debug: true })
    ).resolves.toBeDefined();
  });


  it("schedules habits and survives blockerCache being optional in project helpers", async () => {
    const habitWindow: repo.WindowLite = {
      id: "win-habit",
      label: "Habit Window",
      energy: "LOW",
      start_local: "07:00",
      end_local: "08:00",
      days: null,
      window_kind: "DEFAULT",
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };

    fetchWindowsForDateSpy.mockResolvedValue([habitWindow]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([habitWindow]);
    instances = [];

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-optional-blocker",
      name: "Habit Blocker",
      durationMinutes: 15,
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      habitType: "HABIT",
      windowId: null,
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
      window: null,
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeSpy = vi
      .spyOn(placement, "placeItemInWindows")
      .mockResolvedValue({
        data: createInstanceRecord({
          id: `inst-${habit.id}`,
          source_id: habit.id,
          source_type: "HABIT",
          start_utc: baseDate.toISOString(),
          end_utc: new Date(baseDate.getTime() + 15 * 60 * 1000).toISOString(),
          window_id: habitWindow.id,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      });

    const { client } = createSupabaseMock();
    await expect(scheduleBacklog(userId, baseDate, client)).resolves.toBeDefined();
    expect(placeSpy).toHaveBeenCalled();
  });

  it("limits window preparation to the override horizon", async () => {
    const preparedDays = new Set<string>();
    fetchWindowsForDateSpy.mockImplementation(async (day: Date) => {
      preparedDays.add(day.toISOString().split("T")[0]);
      return [
        makeWindow({
          id: `win-override-${preparedDays.size}`,
        }),
      ];
    });
    const { client } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 7,
    });
    expect(preparedDays.size).toBe(7);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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
      makeWindow({
        id: "win-low",
        label: "Morning",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
      }),
    ]);

    const callOrder: string[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
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
      }
    );

    const { client: mockClient } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, mockClient);

    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder[0]).toBe("proj-high");
    expect(callOrder[1]).toBe("proj-low");
  });

  it("cancels the lower-priority project when overlaps are detected", async () => {
    const { client, canceledIds } = createSupabaseMock();

    const overlappingWindow = makeWindow({
      id: "win-overlap",
      label: "Morning",
      energy: "LOW",
      start_local: "09:00",
      end_local: "11:00",
      days: [2],
    });

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

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      overlappingWindow,
    ]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([
      overlappingWindow,
    ]);

    const morningBaseDate = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 3);
    await scheduleBacklog(userId, morningBaseDate, client, {
      writeThroughDays: 1,
      mode: { type: "SKILLED", skillIds: ["skill-x"] },
    });

    expect(attemptedProjectIds).toHaveLength(0);
    expect(canceledIds).toContain("inst-light");
  });

  it("rebuilds project ordering instead of preserving an older non-roadmap slot", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-non-roadmap",
        source_id: "proj-non-roadmap",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:00:00Z",
        window_id: "win-shared",
        weight_snapshot: 10,
      }),
      createInstanceRecord({
        id: "inst-roadmap",
        source_id: "proj-roadmap",
        start_utc: "2024-01-02T10:00:00Z",
        end_utc: "2024-01-02T11:00:00Z",
        window_id: "win-shared",
        weight_snapshot: 80,
      }),
    ];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-backlog-non-roadmap",
          source_id: "proj-non-roadmap",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-backlog-roadmap",
          source_id: "proj-roadmap",
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
      backlogResponse
    );

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-non-roadmap": {
        id: "proj-non-roadmap",
        name: "Non Roadmap Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
      "proj-roadmap": {
        id: "proj-roadmap",
        name: "Roadmap Project",
        priority: "HIGH",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 60,
        goal_id: "goal-roadmap",
      },
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-non-roadmap": {
        id: "proj-non-roadmap",
        name: "Non Roadmap Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
      "proj-roadmap": {
        id: "proj-roadmap",
        name: "Roadmap Project",
        priority: "HIGH",
        stage: "RESEARCH",
        energy: "LOW",
        duration_min: 60,
        goal_id: "goal-roadmap",
      },
    });
    (repo.fetchGoalsForUser as unknown as vi.Mock).mockResolvedValue([
      {
        id: "goal-roadmap",
        name: "Roadmap Goal",
        weight: 0,
        global_rank: 1,
      },
    ]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue(
      {}
    );
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-shared",
        label: "Shared Window",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      }),
    ]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([
      makeWindow({
        id: "win-shared",
        label: "Shared Window",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      }),
    ]);

    const placements: Array<{
      projectId: string;
      reuseInstanceId: string | null | undefined;
      startUTC: string;
    }> = [];
    let nextSequentialHour = 9;
    const historicalStartByReuseId = new Map<string, string>([
      ["inst-non-roadmap", "2024-01-02T09:00:00Z"],
      ["inst-roadmap", "2024-01-02T10:00:00Z"],
    ]);
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const reuseInstanceId = params.reuseInstanceId;
        const startUTC = reuseInstanceId
          ? historicalStartByReuseId.get(reuseInstanceId) ??
            `2024-01-02T${String(nextSequentialHour).padStart(2, "0")}:00:00Z`
          : `2024-01-02T${String(nextSequentialHour).padStart(2, "0")}:00:00Z`;
        if (!reuseInstanceId) {
          nextSequentialHour += 1;
        }
        const startIso = new Date(startUTC).toISOString();
        const start = new Date(startIso);
        const end = new Date(start.getTime() + params.item.duration_min * 60000);
        placements.push({
          projectId: params.item.id,
          reuseInstanceId,
          startUTC: startIso,
        });
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}-rebuild`,
            source_id: params.item.id,
            source_type: "PROJECT",
            status: "scheduled",
            start_utc: startIso,
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: "win-shared",
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const { client: supabase, canceledIds } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase, {
      writeThroughDays: 1,
    });

    expect(placements.map((entry) => entry.projectId)).toEqual([
      "proj-roadmap",
      "proj-non-roadmap",
    ]);
    expect(canceledIds).toContain("inst-non-roadmap");
    expect(placements.every((entry) => entry.reuseInstanceId == null)).toBe(
      true
    );
    expect(
      result.timeline
        .filter((entry) => entry.type === "PROJECT")
        .map((entry) => ({
          projectId: entry.projectId,
          startUtc: entry.instance.start_utc,
        }))
    ).toEqual([
      {
        projectId: "proj-roadmap",
        startUtc: "2024-01-02T09:00:00.000Z",
      },
      {
        projectId: "proj-non-roadmap",
        startUtc: "2024-01-02T10:00:00.000Z",
      },
    ]);
  });

  it("schedules skill-restricted day-type windows for unlabeled projects", async () => {
    const { client: supabase } = createSupabaseMock();
    const testBaseDate = schedNow("2024-01-02T12:00:00Z");
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-backlog-a",
          source_id: "proj-a",
          status: "missed",
          duration_min: 60,
          energy_resolved: "NO",
        }),
        createInstanceRecord({
          id: "inst-backlog-b",
          source_id: "proj-b",
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
    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

    const projects = {
      "proj-a": {
        id: "proj-a",
        name: "Project A",
        priority: "HIGH",
        stage: "BUILD",
        energy: "NO",
        duration_min: 60,
      },
      "proj-b": {
        id: "proj-b",
        name: "Project B",
        priority: "MEDIUM",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    };
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(projects);
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue(projects);

    (repo.fetchGoalsForUser as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const dayWindow = makeWindow({
      id: "win-daytype",
      label: "Day Type",
      energy: "LOW",
      start_local: "09:00",
      end_local: "10:00",
      days: null,
      window_kind: "DEFAULT",
      dayTypeTimeBlockId: "day-type-1",
      allowAllHabitTypes: true,
      allowAllSkills: false,
      allowAllMonuments: true,
      allowedSkillIds: ["skill-special"],
    });
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      dayWindow,
    ]);

    const habitPayload = [
      {
        id: "habit-1",
        name: "Daily Habit",
        durationMinutes: 15,
        createdAt: testBaseDate.toISOString(),
        updatedAt: testBaseDate.toISOString(),
        lastCompletedAt: null,
        currentStreakDays: 0,
        longestStreakDays: 0,
        habitType: "HABIT",
        windowId: null,
        energy: "NO",
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
        nextDueOverride: null,
        window: null,
      },
    ];
    vi.spyOn(habits, "fetchHabitsForSchedule").mockResolvedValue(habitPayload);

    let placementCallCount = 0;
    vi.spyOn(placement, "placeItemInWindows").mockImplementation(
      async ({ item }) => {
        const offsetHours = placementCallCount + 1;
        placementCallCount += 1;
        const start = new Date(
          testBaseDate.getTime() + offsetHours * 60 * 60 * 1000
        );
        const durationMin =
          typeof item.duration_min === "number" && Number.isFinite(item.duration_min)
            ? item.duration_min
            : 60;
        const durationMs = Math.max(1, durationMin) * 60000;
        const end = new Date(start.getTime() + durationMs);
        return {
          status: 200,
          statusText: "OK",
          count: null,
          data: createInstanceRecord({
            id: `inst-${item.id}`,
            source_id: item.id,
            source_type: item.sourceType,
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: durationMin,
            window_id: dayWindow.id,
            energy_resolved: item.energy,
          }),
          error: null,
        };
      }
    );

    const result = await scheduleBacklog(userId, testBaseDate, supabase, {
      debug: true,
    });
    const placedIds = result.placed.map((inst) => inst.source_id);
    expect(placedIds).toEqual(
      expect.arrayContaining(["proj-a", "proj-b"])
    );
    const projectPlacements = result.timeline.filter(
      (entry) => entry.type === "PROJECT"
    );
    expect(projectPlacements).toHaveLength(2);
    expect(result.projectDebugSummary?.skippedNoWindows).toBe(0);
    expect(result.projectDebugSummary?.exampleProjectId).toBeUndefined();
  });

  it("cancels lower-priority overlaps even across different windows", async () => {
    const { client, canceledIds } = createSupabaseMock();

    const windowLeft = makeWindow({
      id: "win-left",
      label: "Focus",
      energy: "LOW",
      start_local: "09:00",
      end_local: "11:00",
      days: [2],
    });

    const windowRight = makeWindow({
      id: "win-right",
      label: "Deep Work",
      energy: "LOW",
      start_local: "09:30",
      end_local: "11:30",
      days: [2],
    });

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

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLeft,
      windowRight,
    ]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([
      windowLeft,
      windowRight,
    ]);

    const base = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 3);
    await scheduleBacklog(userId, base, client, { writeThroughDays: 1 });

    expect(attemptedProjectIds).toHaveLength(0);
    expect(canceledIds).toContain("inst-beta");
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

    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(
      emptyBacklog
    );
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
    const habitWindow: repo.WindowLite = {
      id: "win-habit",
      label: "Morning",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: null,
      window_kind: "DEFAULT",
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    };
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([habitWindow]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([habitWindow]);

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-1",
      name: "Stretch",
      durationMinutes: 15,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      habitType: "HABIT",
      windowId: null,
      energy: "NO",
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
      })
    );
    expect(result.placed).toContainEqual(habitInstance);
    expect(
      result.timeline.some(
        (entry) =>
          entry.type === "HABIT" && entry.instanceId === habitInstance.id
      )
    ).toBe(true);
  });

  it("writes day-type fields instead of legacy window_ids when habits occupy day-type blocks", async () => {
    instances = [];
    fetchInstancesForRangeSpy.mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);

    const dayWindow = makeWindow({
      id: "time-block-day",
      label: "Day Focus",
      energy: "LOW",
      start_local: "08:00",
      end_local: "08:30",
      days: [2],
      window_kind: "DEFAULT",
      dayTypeTimeBlockId: "dttb-day",
    });
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([dayWindow]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([dayWindow]);
    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-daytype",
      name: "Day Type Habit",
      durationMinutes: 15,
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      habitType: "HABIT",
      windowId: null,
      window: null,
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
      nextDueOverride: null,
      practiceContextId: null,
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);
    const createdInstance = createInstanceRecord({
      id: "inst-daytype-habit",
      source_id: habit.id,
      source_type: "HABIT",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T08:15:00Z",
      duration_min: 15,
      energy_resolved: "LOW",
    });
    const createInstanceSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockResolvedValue(createdInstance);
    vi.spyOn(placement, "placeItemInWindows").mockImplementation(
      realPlaceItemInWindows
    );

    const { client } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, client);

    expect(createInstanceSpy).toHaveBeenCalled();
    const habitArgs = createInstanceSpy.mock.calls.find(
      (call) => call[0].sourceId === habit.id
    );
    expect(habitArgs).toBeDefined();
    const payload = habitArgs?.[0];
    expect(payload?.windowId).toBeNull();
    expect(payload?.dayTypeTimeBlockId).toBe(dayWindow.dayTypeTimeBlockId);
    expect(payload?.timeBlockId).toBe(dayWindow.id);
  });

  it("blocks non-sync habit overlaps while allowing sync overlays", async () => {
    instances = [];
    fetchInstancesForRangeSpy.mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);
    const placeSpy = vi.spyOn(placement, "placeItemInWindows");

    try {
      placeSpy.mockImplementation(async ({ item }) => {
        if (item.id === "proj-1") {
          return {
            data: createInstanceRecord({
              id: "inst-placed",

              source_id: "proj-1",

              status: "scheduled",

              start_utc: "2024-01-01T18:00:00Z",

              end_utc: "2024-01-01T19:00:00Z",

              window_id: "win-evening",
            }),

            error: null,

            count: null,

            status: 201,

            statusText: "Created",
          };
        }

        return { error: "NO_FIT" as const };
      });

      const base = schedNow("2024-01-01T12:00:00Z", "America/Los_Angeles");

      const { client: supabase } = createSupabaseMock();

      const result = await scheduleBacklog(userId, base, supabase, {
        timeZone: "America/Los_Angeles",

        baseDate: base,
      });

      expect(result.placed).toHaveLength(1);

      expect(result.failures).toHaveLength(0);

      expect(requestedDates).toHaveLength(1);

      expect(requestedDates[0]).toBe("2024-01-01T12:00:00.000Z");
    } finally {
      placeSpy.mockRestore();
    }

    const syncResult = await scheduleBacklog(userId, baseDate, supabase);
    const syncPlacements = syncResult.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    expect(syncPlacements).toHaveLength(54);
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

    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue(
      emptyBacklog
    );
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
      makeWindow({
        id: "win-night",
        label: "Late",
        energy: "NO",
        start_local: "22:00",
        end_local: "23:00",
        days: null,
        location_context_value: "OFFICE",
      }),
    ]);

    const habit: habitsRepo.HabitScheduleItem = {
      id: "habit-2",
      name: "Journal",
      durationMinutes: 30,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      energy: "NO",
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

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDays: 1,
    });

    expect(placeSpy).toHaveBeenCalled();
    expect(placeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        item: expect.objectContaining({
          id: habit.id,
          sourceType: "HABIT",
        }),
      })
    );
    expect(result.failures).toEqual([]);
    expect(
      result.timeline.some(
        (entry) =>
          entry.type === "HABIT" && entry.instanceId === habitInstance.id
      )
    ).toBe(true);
  });

  it("cancels duplicate habit instances on the same day", async () => {
    const { client, update } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-habit",
      label: "Morning",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([windowLite]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

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
      locked: true,
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
      const windowDef = params.windows[0];
      const startSource =
        windowDef?.availableStartLocal ?? windowDef?.startLocal ?? params.date;
      const start = new Date(startSource);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60000
      );
      const instanceId =
        params.reuseInstanceId ?? `${params.item.id}-${start.toISOString()}`;

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
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: habit.id }),
      })
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({ status: "canceled" });
    const eqMock = update.mock.results[0].value.eq as vi.Mock;
    expect(eqMock).toHaveBeenCalledWith("id", duplicate.id);

    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === habit.id
    );
    expect(
      habitEntries.some((entry) => entry.instanceId === duplicate.id)
    ).toBe(false);
    expect(
      result.failures.filter((failure) => failure.reason === "error")
    ).toEqual([]);
  });

  it("keeps a surviving daily habit row when duplicate cleanup cancels another row", async () => {
    const { client, canceledIds } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-record-content",
      label: "Creator",
      energy: "LOW",
      start_local: "08:00",
      end_local: "10:00",
      days: [2],
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

    const habit = makeHabit({
      id: "habit-record-content-survivor",
      name: "RECORD CONTENT",
      durationMinutes: 60,
      habitType: "HABIT",
      windowId: windowLite.id,
      energy: "LOW",
      window: {
        id: windowLite.id,
        label: "Creator",
        energy: "LOW",
        startLocal: "08:00",
        endLocal: "10:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const keeper = createInstanceRecord({
      id: "inst-record-content-keeper",
      source_id: habit.id,
      source_type: "HABIT",
      status: "scheduled",
      start_utc: "2024-01-02T08:00:00Z",
      end_utc: "2024-01-02T09:00:00Z",
      duration_min: 60,
      window_id: windowLite.id,
      energy_resolved: "LOW",
      locked: true,
    });
    const duplicate = createInstanceRecord({
      id: "inst-record-content-duplicate",
      source_id: habit.id,
      source_type: "HABIT",
      status: "scheduled",
      start_utc: "2024-01-02T09:00:00Z",
      end_utc: "2024-01-02T10:00:00Z",
      duration_min: 60,
      window_id: windowLite.id,
      energy_resolved: "LOW",
      locked: false,
    });
    instances = [keeper, duplicate];

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockReset();
    placeSpy.mockResolvedValue({ error: "NO_FIT" as const });

    await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(canceledIds).toContain(duplicate.id);
    expect(canceledIds).not.toContain(keeper.id);
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: habit.id }),
      })
    );
  });

  it("allows a daily habit to place again when duplicate cleanup canceled its only same-day row", async () => {
    instances = [];
    const { client, canceledIds } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-record-content-replace",
      label: "Creator",
      energy: "LOW",
      start_local: "08:00",
      end_local: "11:00",
      days: [2],
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

    const habit = makeHabit({
      id: "habit-record-content-replace",
      name: "RECORD CONTENT",
      durationMinutes: 60,
      habitType: "HABIT",
      windowId: windowLite.id,
      energy: "LOW",
      window: {
        id: windowLite.id,
        label: "Creator",
        energy: "LOW",
        startLocal: "08:00",
        endLocal: "11:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockReset();
    let placementCount = 0;
    placeSpy.mockImplementation(async (params) => {
      placementCount += 1;
      const start = new Date(
        placementCount === 1
          ? "2024-01-02T08:00:00.000Z"
          : "2024-01-02T09:00:00.000Z"
      );
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-record-content-${placementCount}`,
          source_id: params.item.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowLite.id,
          energy_resolved: params.item.energy,
          locked: false,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });

    const habitPlacementCalls = placeSpy.mock.calls.filter(
      ([params]) => params.item.id === habit.id
    );
    expect(habitPlacementCalls).toHaveLength(2);
    expect(canceledIds).toContain("inst-record-content-1");
    expect(canceledIds).not.toContain("inst-record-content-2");
    expect(
      result.placed.some((instance) => instance.id === "inst-record-content-2")
    ).toBe(true);
  });

  it("prevents sync habits from overlapping when scheduling multiple habits", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync",
      label: "Sync Window",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

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

    type PlacementCall = {
      allowHabitOverlap?: boolean;
      existing: Array<{ id: string; sourceType: string }>;
      itemId: string;
      sourceType: string;
      availableStartUTC: string;
    };
    const placementCalls: PlacementCall[] = [];

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const durationMs = Math.max(1, params.item.duration_min) * 60_000;
      const end = new Date(start.getTime() + durationMs);
      placementCalls.push({
        allowHabitOverlap: params.allowHabitOverlap,
        existing: (params.existingInstances ?? []).map((inst) => ({
          id: inst.id,
          sourceType: inst.source_type ?? "",
        })),
        itemId: params.item.id,
        sourceType: params.item.sourceType,
        availableStartUTC: start.toISOString(),
      });

      if (params.item.id === habitA.id || params.item.id === habitB.id) {
        return {
          data: createInstanceRecord({
            id:
              params.item.id === habitA.id
                ? "inst-sync-1"
                : "inst-sync-2",
            source_id: params.item.id,
            source_type: "HABIT",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
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
      (call) =>
        call.sourceType === "HABIT" &&
        (call.itemId === habitA.id || call.itemId === habitB.id)
    );
    expect(habitCalls.length).toBeGreaterThanOrEqual(2);

    const habitBCalls = habitCalls.filter((call) => call.itemId === habitB.id);
    expect(habitBCalls.length).toBeGreaterThan(0);
    const latestHabitBCall = habitBCalls[habitBCalls.length - 1];
    expect(
      latestHabitBCall.existing.some(
        (inst) => inst.id === "inst-sync-1" && inst.sourceType === "HABIT"
      )
    ).toBe(true);

    const habitEntriesById = new Map<
      string,
      Array<{ startUTC: string; endUTC: string }>
    >();
    for (const entry of result.timeline) {
      if (entry.type !== "HABIT") continue;
      if (entry.habit.id !== habitA.id && entry.habit.id !== habitB.id)
        continue;
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
      (a, b) => new Date(a.startUTC).getTime() - new Date(b.startUTC).getTime()
    )[0];
    const earliestHabitB = [...(habitEntriesById.get(habitB.id) ?? [])].sort(
      (a, b) => new Date(a.startUTC).getTime() - new Date(b.startUTC).getTime()
    )[0];

    const habitAStartMs = new Date(earliestHabitA.startUTC).getTime();
    const habitAEndMs = new Date(earliestHabitA.endUTC).getTime();
    const habitBStartMs = new Date(earliestHabitB.startUTC).getTime();
    const habitBEndMs = new Date(earliestHabitB.endUTC).getTime();
    expect(habitAEndMs > habitBStartMs && habitBEndMs > habitAStartMs).toBe(
      false
    );
    expect(habitBStartMs).toBeGreaterThanOrEqual(habitAEndMs);
    expect(habitBStartMs).toBe(habitAEndMs);

    const persistedByHabit = (result.placed ?? []).filter(
      (inst) => inst.source_id === habitA.id || inst.source_id === habitB.id
    );
    expect(
      persistedByHabit.filter((inst) => inst.source_id === habitA.id).length
    ).toBeGreaterThan(0);
    expect(
      persistedByHabit.filter((inst) => inst.source_id === habitB.id).length
    ).toBeGreaterThan(0);
  });

  it("advances a SYNC habit past an earlier SYNC placement in the same window", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-evening",
      label: "Evening Sync",
      energy: "LOW",
      start_local: "20:00",
      end_local: "23:50",
      days: [2],
    });

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    const habitA: HabitScheduleItem = {
      id: "habit-sync-long",
      name: "NMA Sync",
      durationMinutes: 145,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
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
        startLocal: windowLite.start_local ?? "20:00",
        endLocal: windowLite.end_local ?? "23:50",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    const habitB: HabitScheduleItem = {
      ...habitA,
      id: "habit-sync-audio",
      name: "Podcast/Audiobook Sync",
      durationMinutes: 85,
      createdAt: "2024-01-01T00:01:00Z",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habitA, habitB]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client);
    const longSync = result.placed.find(
      (inst) => inst.source_id === habitA.id
    );
    const audioSync = result.placed.find(
      (inst) => inst.source_id === habitB.id
    );

    expect(longSync?.start_utc).toBe("2024-01-02T20:00:00.000Z");
    expect(longSync?.end_utc).toBe("2024-01-02T22:25:00.000Z");
    expect(audioSync?.start_utc).toBe("2024-01-02T22:25:00.000Z");
    expect(new Date(audioSync?.start_utc ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(longSync?.end_utc ?? 0).getTime()
    );
  });

  it("does not move a SYNC habit into an empty tail gap after avoiding another SYNC", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-tail-gap",
      label: "Sync Tail Gap",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:50",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-anchor-event",
        source_id: "event-anchor",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
      createInstanceRecord({
        id: "inst-existing-sync",
        source_id: "habit-existing-sync",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    const existingSyncHabit: HabitScheduleItem = {
      id: "habit-existing-sync",
      name: "Existing Sync",
      durationMinutes: 100,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
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
        startLocal: windowLite.start_local ?? "21:00",
        endLocal: windowLite.end_local ?? "23:50",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    const podcastSyncHabit: HabitScheduleItem = {
      ...existingSyncHabit,
      id: "habit-podcast-sync",
      name: "Podcast Sync",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:01:00Z",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([
      existingSyncHabit,
      podcastSyncHabit,
    ]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(
      result.placed.some((inst) => inst.source_id === podcastSyncHabit.id)
    ).toBe(false);
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcastSyncHabit.id }),
      })
    );
  });

  it("allows a later SYNC placement after conflict avoidance when a later anchor overlaps it", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-later-anchor",
      label: "Sync Later Anchor",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:50",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-anchor-early",
        source_id: "event-anchor-early",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
      createInstanceRecord({
        id: "inst-anchor-late",
        source_id: "event-anchor-late",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T23:00:00.000Z",
        end_utc: "2024-01-02T23:50:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-existing-sync-later",
        source_id: "habit-existing-sync-later",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    const existingSyncHabit: HabitScheduleItem = {
      id: "habit-existing-sync-later",
      name: "Existing Sync",
      durationMinutes: 100,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
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
        startLocal: windowLite.start_local ?? "21:00",
        endLocal: windowLite.end_local ?? "23:50",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    const podcastSyncHabit: HabitScheduleItem = {
      ...existingSyncHabit,
      id: "habit-podcast-sync-later",
      name: "Podcast Sync",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:01:00Z",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([
      existingSyncHabit,
      podcastSyncHabit,
    ]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });
    const podcast = result.placed.find(
      (inst) => inst.source_id === podcastSyncHabit.id
    );

    expect(podcast?.start_utc).toBe("2024-01-02T22:40:00.000Z");
    expect(podcast?.end_utc).toBe("2024-01-02T23:40:00.000Z");
  });

  it("retries an unreserved SYNC habit after a later project anchor exists", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-project-anchor",
      label: "Creator Sync",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:45",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-normal-anchor-early",
        source_id: "event-anchor-early",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-nma-sync",
        source_id: "habit-nma-sync",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    const project = {
      id: "proj-refine-socials",
      name: "REFINE SOCIALS",
      priority: "HIGH",
      stage: "BUILD",
      energy: "LOW",
      duration_min: 60,
    };
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue({
      data: [
        createInstanceRecord({
          id: "inst-missed-project-anchor",
          source_id: project.id,
          source_type: "PROJECT",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies BacklogResponse);

    const nmaSync = makeHabit({
      id: "habit-nma-sync",
      name: "NMA SYNC",
      durationMinutes: 100,
      habitType: "SYNC",
      windowId: windowLite.id,
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "21:00",
        endLocal: "23:45",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    });
    const podcastSync = makeHabit({
      ...nmaSync,
      id: "habit-podcast-sync-retry",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:01:00Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([nmaSync, podcastSync]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start =
        params.item.sourceType === "PROJECT"
          ? new Date("2024-01-02T22:45:00.000Z")
          : new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: params.item.sourceType,
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });
    const podcast = result.placed.find(
      (inst) => inst.source_id === podcastSync.id
    );

    expect(podcast?.start_utc).toBe("2024-01-02T22:45:00.000Z");
    expect(podcast?.end_utc).toBe("2024-01-02T23:45:00.000Z");
    expect(
      result.timeline.some(
        (entry) => entry.type === "PROJECT" && entry.projectId === project.id
      )
    ).toBe(true);
  });

  it("runs the final SYNC retry after normal habit and project anchors are present", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-creator-final-sync",
      label: "Creator",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:45",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-nma-event-final-sync",
        source_id: "event-nma",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-nma-sync-final-sync",
        source_id: "habit-nma-sync-final",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);

    const project = {
      id: "proj-refine-socials-final-sync",
      name: "REFINE SOCIALS",
      priority: "HIGH",
      stage: "BUILD",
      energy: "LOW",
      duration_min: 45,
    };
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue({
      data: [
        createInstanceRecord({
          id: "inst-missed-refine-socials-final-sync",
          source_id: project.id,
          source_type: "PROJECT",
          status: "missed",
          duration_min: 45,
          energy_resolved: "LOW",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies BacklogResponse);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "21:00",
      endLocal: "23:45",
      days: [2],
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
    };
    const nmaSync = makeHabit({
      id: "habit-nma-sync-final",
      name: "NMA",
      durationMinutes: 100,
      habitType: "SYNC",
      windowId: windowLite.id,
      window: baseWindow,
    });
    const breakfast = makeHabit({
      id: "habit-eat-breakfast-final-sync",
      name: "EAT BREAKFAST",
      durationMinutes: 15,
      habitType: "HABIT",
      windowId: windowLite.id,
      window: baseWindow,
    });
    const podcast = makeHabit({
      id: "habit-podcast-final-sync",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      window: baseWindow,
      createdAt: "2024-01-01T00:02:00Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([nmaSync, breakfast, podcast]);

    const podcastPlacements: ScheduleInstance[] = [];
    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start =
        params.item.id === project.id
          ? new Date("2024-01-02T23:00:00.000Z")
          : params.item.id === breakfast.id
            ? new Date("2024-01-02T22:45:00.000Z")
            : new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      const data = createInstanceRecord({
        id: `inst-${params.item.id}`,
        source_id: params.item.id,
        source_type: params.item.sourceType,
        status: "scheduled",
        start_utc: start.toISOString(),
        end_utc: end.toISOString(),
        duration_min: params.item.duration_min,
        window_id: windowDef.id,
        energy_resolved: params.item.energy,
      });
      if (params.item.id === podcast.id) {
        podcastPlacements.push(data);
      }
      return {
        data,
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });
    const podcasts = result.placed.filter(
      (inst) => inst.source_id === podcast.id
    );

    expect(
      result.placed.some(
        (inst) =>
          inst.source_id === breakfast.id &&
          inst.start_utc === "2024-01-02T22:45:00.000Z" &&
          inst.end_utc === "2024-01-02T23:00:00.000Z"
      )
    ).toBe(true);
    expect(
      result.timeline.some(
        (entry) => entry.type === "PROJECT" && entry.projectId === project.id
      )
    ).toBe(true);
    expect(podcasts).toHaveLength(1);
    expect(podcastPlacements).toHaveLength(1);
    expect(podcasts[0]?.start_utc).toBe("2024-01-02T22:45:00.000Z");
    expect(podcasts[0]?.end_utc).toBe("2024-01-02T23:45:00.000Z");
  });

  it("places the 2026-05-07 CRAFT/MUSIC final SYNC retry day-locally in stable order", async () => {
    const { client } = createSupabaseMock();
    const craftMusicDate = new Date("2026-05-07T21:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-craft-music-final-sync",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "20:00",
      end_local: "23:45",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    const anchor = (
      id: string,
      name: string,
      start: string,
      end: string
    ) =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        label: name,
        start_utc: `2026-05-07T${start}:00.000Z`,
        end_utc: `2026-05-07T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    instances = [
      anchor("wash-dishes", "WASH DISHES", "20:00", "20:25"),
      anchor("pay-insurance", "PAY INSURANCE", "20:25", "20:30"),
      anchor("take-out-trash", "TAKE OUT TRASH", "20:30", "20:45"),
      anchor("vacuum", "VACUUM", "20:45", "21:00"),
      anchor("fold-laundry", "FOLD LAUNDRY", "21:00", "21:20"),
      anchor("clip-nails", "CLIP NAILS", "21:20", "21:25"),
      anchor("groceries", "$50 GROCERIES", "21:25", "22:25"),
      anchor("wash-bedsheets", "WASH BEDSHEETS", "22:25", "22:40"),
      anchor("eat-breakfast", "EAT BREAKFAST", "22:45", "23:00"),
      anchor("refine-socials", "REFINE SOCIALS", "23:00", "23:45"),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "20:00",
      endLocal: "23:45",
      days: [4],
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
    };
    const nma = makeHabit({
      id: "habit-nma-craft-music",
      name: "NMA",
      durationMinutes: 120,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: baseWindow,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const podcast = makeHabit({
      ...nma,
      id: "habit-podcast-craft-music",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2026-05-01T00:01:00.000Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast, nma]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}-${start.toISOString()}`,
          source_id: params.item.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, craftMusicDate, client, {
      writeThroughDaysOverride: 3,
    });

    const nmaPlacements = result.placed.filter(
      (inst) => inst.source_id === nma.id
    );
    const podcastPlacements = result.placed.filter(
      (inst) => inst.source_id === podcast.id
    );
    expect(nmaPlacements).toHaveLength(1);
    expect(podcastPlacements).toHaveLength(1);

    const nmaPlacement = nmaPlacements[0];
    const podcastPlacement = podcastPlacements[0];
    expect(nmaPlacement.start_utc).toBe("2026-05-07T21:00:00.000Z");
    expect(nmaPlacement.end_utc).toBe("2026-05-07T22:40:00.000Z");
    expect(podcastPlacement.start_utc).toBe("2026-05-07T22:45:00.000Z");
    expect(podcastPlacement.end_utc).toBe("2026-05-07T23:45:00.000Z");

    expect(nmaPlacement.start_utc?.startsWith("2026-05-07")).toBe(true);
    expect(podcastPlacement.start_utc?.startsWith("2026-05-07")).toBe(true);
    expect(
      new Date(nmaPlacement.start_utc ?? "").getTime() <
        new Date(podcastPlacement.start_utc ?? "").getTime()
    ).toBe(true);
    expect(
      result.placed.some(
        (inst) =>
          inst.source_id === nma.id &&
          (inst.start_utc?.startsWith("2026-05-08") ||
            inst.start_utc?.startsWith("2026-05-09"))
      )
    ).toBe(false);
  });

  it("keeps May 9 anchored SYNC ownership disjoint and fully covers selected anchors", async () => {
    const { client } = createSupabaseMock();
    const syncDate = new Date("2026-05-09T12:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-may-9-sync-ownership",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "15:00",
      end_local: "18:55",
      days: [6],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    });

    const anchor = (
      id: string,
      _name: string,
      start: string,
      end: string
    ) =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: `2026-05-09T${start}:00.000Z`,
        end_utc: `2026-05-09T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    const anchorA = anchor(
      "work-attention-habits",
      "WORK ATTENTION HABITS",
      "15:00",
      "16:00"
    );
    const anchorB = anchor(
      "redraft-depops",
      "REDRAFT DEPOPS",
      "16:00",
      "16:45"
    );
    const anchorC = anchor(
      "send-application",
      "SEND APPLICATION",
      "16:45",
      "17:45"
    );
    const anchorD = anchor(
      "make-vibey",
      "MAKE VIBEY",
      "17:45",
      "18:25"
    );
    const anchorE = anchor(
      "shirt-designs",
      "SHIRT DESIGNS",
      "18:25",
      "18:55"
    );
    instances = [anchorA, anchorB, anchorC, anchorD, anchorE];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "15:00",
      endLocal: "18:55",
      days: [6],
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
    };
    const podcast = makeHabit({
      id: "habit-podcast-may-9-sync",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      window: baseWindow,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const nma = makeHabit({
      ...podcast,
      id: "habit-nma-may-9-sync",
      name: "NMA SYNC",
      durationMinutes: 120,
      createdAt: "2026-05-01T00:01:00.000Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast, nma]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const windowDef = params.windows[0];
        const start = new Date(windowDef.availableStartLocal);
        const end = new Date(
          start.getTime() + Math.max(1, params.item.duration_min) * 60_000
        );
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}-${start.toISOString()}`,
            source_id: params.item.id,
            source_type: "HABIT",
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const result = await scheduleBacklog(userId, syncDate, client, {
      writeThroughDaysOverride: 1,
    });

    const podcastPlacement = result.placed.find(
      (inst) => inst.source_id === podcast.id
    );
    const nmaPlacement = result.placed.find((inst) => inst.source_id === nma.id);
    expect(nmaPlacement?.start_utc).toBe("2026-05-09T15:00:00.000Z");
    expect(nmaPlacement?.end_utc).toBe("2026-05-09T17:45:00.000Z");
    expect(podcastPlacement?.start_utc).toBe("2026-05-09T17:45:00.000Z");
    expect(podcastPlacement?.end_utc).toBe("2026-05-09T18:55:00.000Z");

    const nmaPlaceCall = (
      placement.placeItemInWindows as unknown as vi.Mock
    ).mock.calls.find(([params]) => params.item.id === nma.id)?.[0];
    const podcastPlaceCall = (
      placement.placeItemInWindows as unknown as vi.Mock
    ).mock.calls.find(([params]) => params.item.id === podcast.id)?.[0];
    expect(nmaPlaceCall?.windows[0].startLocal.toISOString()).toBe(
      "2026-05-09T15:00:00.000Z"
    );
    expect(nmaPlaceCall?.windows[0].endLocal.toISOString()).toBe(
      "2026-05-09T17:45:00.000Z"
    );
    expect(nmaPlaceCall?.windows[0].availableStartLocal.toISOString()).toBe(
      "2026-05-09T15:00:00.000Z"
    );
    expect(podcastPlaceCall?.windows[0].startLocal.toISOString()).toBe(
      "2026-05-09T17:45:00.000Z"
    );
    expect(podcastPlaceCall?.windows[0].endLocal.toISOString()).toBe(
      "2026-05-09T18:55:00.000Z"
    );
    expect(
      podcastPlaceCall?.windows[0].availableStartLocal.toISOString()
    ).toBe("2026-05-09T17:45:00.000Z");

    const syncPlacements = [podcastPlacement, nmaPlacement].filter(
      (inst): inst is ScheduleInstance => Boolean(inst)
    );
    for (let i = 0; i < syncPlacements.length; i += 1) {
      for (let j = i + 1; j < syncPlacements.length; j += 1) {
        const firstStart = new Date(syncPlacements[i].start_utc ?? "").getTime();
        const firstEnd = new Date(syncPlacements[i].end_utc ?? "").getTime();
        const secondStart = new Date(
          syncPlacements[j].start_utc ?? ""
        ).getTime();
        const secondEnd = new Date(syncPlacements[j].end_utc ?? "").getTime();
        expect(firstEnd <= secondStart || secondEnd <= firstStart).toBe(true);
      }
    }
    expect(nmaPlacement?.end_utc).toBe(podcastPlacement?.start_utc);

    for (const anchorInstance of [anchorA, anchorB, anchorC, anchorD, anchorE]) {
      const anchorStart = new Date(anchorInstance.start_utc ?? "").getTime();
      const anchorEnd = new Date(anchorInstance.end_utc ?? "").getTime();
      const overlappingSyncs = syncPlacements.filter((syncInstance) => {
        const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
        const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
        return syncStart < anchorEnd && syncEnd > anchorStart;
      });
      const owningSyncs = overlappingSyncs.filter((syncInstance) => {
        const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
        const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
        return syncStart <= anchorStart && syncEnd >= anchorEnd;
      });
      expect(overlappingSyncs).toHaveLength(owningSyncs.length);
      expect(owningSyncs.length).toBeLessThanOrEqual(1);
    }

    const anchorBOwners = syncPlacements.filter((syncInstance) => {
      const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
      const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
      return (
        syncStart <= new Date(anchorB.start_utc ?? "").getTime() &&
        syncEnd >= new Date(anchorB.end_utc ?? "").getTime()
      );
    });
    expect(anchorBOwners.map((inst) => inst.source_id)).toEqual([nma.id]);

    for (const syncInstance of syncPlacements) {
      const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
      const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
      const requiredMinutes = syncInstance.source_id === nma.id ? 120 : 60;
      expect(syncEnd - syncStart).toBeGreaterThanOrEqual(
        requiredMinutes * 60_000
      );
    }
  });

  it("cancels stale May 9 SYNC rows before the final retry returns persisted output", async () => {
    const { client, canceledIds } = createSupabaseMock();
    const syncDate = new Date("2026-05-09T12:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-may-9-stale-sync-ownership",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "20:00",
      end_local: "23:40",
      days: [6],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    });

    const anchor = (
      id: string,
      _name: string,
      start: string,
      end: string
    ) =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: `2026-05-09T${start}:00.000Z`,
        end_utc: `2026-05-09T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    const podcast = makeHabit({
      id: "habit-podcast-may-9-stale-sync",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "20:00",
        endLocal: "23:40",
        days: [6],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const nma = makeHabit({
      ...podcast,
      id: "habit-nma-may-9-stale-sync",
      name: "NMA",
      durationMinutes: 120,
      createdAt: "2026-05-01T00:01:00.000Z",
    });

    const anchorA = anchor("anchor-a-stale", "Anchor A", "20:00", "21:00");
    const anchorB = anchor("send-application-stale", "SEND APPLICATION", "21:00", "22:00");
    const anchorC = anchor("make-vibey-stale", "MAKE VIBEY", "22:00", "22:40");
    const anchorD = anchor("refine-resume-stale", "REFINE RESUME", "22:40", "23:40");
    instances = [
      anchorA,
      anchorB,
      anchorC,
      anchorD,
      createInstanceRecord({
        id: "inst-stale-podcast-may-9",
        source_id: podcast.id,
        source_type: "HABIT",
        status: "scheduled",
        start_utc: "2026-05-09T21:00:00.000Z",
        end_utc: "2026-05-09T22:00:00.000Z",
        duration_min: 60,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      }),
      createInstanceRecord({
        id: "inst-stale-nma-may-9",
        source_id: nma.id,
        source_type: "HABIT",
        status: "scheduled",
        start_utc: "2026-05-09T21:00:00.000Z",
        end_utc: "2026-05-09T23:00:00.000Z",
        duration_min: 120,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast, nma]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const windowDef = params.windows[0];
        const start = new Date(windowDef.availableStartLocal);
        const end = new Date(
          start.getTime() + Math.max(1, params.item.duration_min) * 60_000
        );
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}-${start.toISOString()}`,
            source_id: params.item.id,
            source_type: "HABIT",
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const result = await scheduleBacklog(userId, syncDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(canceledIds).toEqual(
      expect.arrayContaining([
        "inst-stale-podcast-may-9",
        "inst-stale-nma-may-9",
      ])
    );

    const syncPlacements = result.placed.filter(
      (inst) => inst.source_id === podcast.id || inst.source_id === nma.id
    );
    expect(syncPlacements).toHaveLength(2);
    expect(
      syncPlacements.some(
        (inst) =>
          inst.source_id === podcast.id &&
          inst.start_utc === "2026-05-09T21:00:00.000Z" &&
          inst.end_utc === "2026-05-09T22:00:00.000Z"
      )
    ).toBe(false);
    expect(
      syncPlacements.some(
        (inst) =>
          inst.source_id === nma.id &&
          inst.start_utc === "2026-05-09T21:00:00.000Z" &&
          inst.end_utc === "2026-05-09T23:00:00.000Z"
      )
    ).toBe(false);

    for (let i = 0; i < syncPlacements.length; i += 1) {
      for (let j = i + 1; j < syncPlacements.length; j += 1) {
        const firstStart = new Date(syncPlacements[i].start_utc ?? "").getTime();
        const firstEnd = new Date(syncPlacements[i].end_utc ?? "").getTime();
        const secondStart = new Date(syncPlacements[j].start_utc ?? "").getTime();
        const secondEnd = new Date(syncPlacements[j].end_utc ?? "").getTime();
        expect(firstEnd <= secondStart || secondEnd <= firstStart).toBe(true);
      }
    }

    for (const anchorInstance of [anchorA, anchorB, anchorC, anchorD]) {
      const anchorStart = new Date(anchorInstance.start_utc ?? "").getTime();
      const anchorEnd = new Date(anchorInstance.end_utc ?? "").getTime();
      const overlappingSyncs = syncPlacements.filter((syncInstance) => {
        const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
        const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
        return syncStart < anchorEnd && syncEnd > anchorStart;
      });
      const owningSyncs = overlappingSyncs.filter((syncInstance) => {
        const syncStart = new Date(syncInstance.start_utc ?? "").getTime();
        const syncEnd = new Date(syncInstance.end_utc ?? "").getTime();
        return syncStart <= anchorStart && syncEnd >= anchorEnd;
      });
      expect(overlappingSyncs).toHaveLength(owningSyncs.length);
      expect(owningSyncs.length).toBeLessThanOrEqual(1);
    }

    for (const sync of syncPlacements) {
      const startMs = new Date(sync.start_utc ?? "").getTime();
      const endMs = new Date(sync.end_utc ?? "").getTime();
      const requiredMinutes = sync.source_id === nma.id ? 120 : 60;
      expect(endMs - startMs).toBeGreaterThanOrEqual(requiredMinutes * 60_000);
    }
  });

  it("skips the final SYNC retry when the only remaining anchor span is shorter than the habit duration", async () => {
    const { client } = createSupabaseMock();
    const craftMusicDate = new Date("2026-05-07T19:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-craft-music-short-anchor",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "20:00",
      end_local: "23:45",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    const anchor = (
      id: string,
      name: string,
      start: string,
      end: string
    ) =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        label: name,
        start_utc: `2026-05-07T${start}:00.000Z`,
        end_utc: `2026-05-07T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    instances = [
      anchor("nma-anchor", "NMA", "20:00", "22:00"),
      anchor("refine-socials-short", "REFINE SOCIALS", "23:00", "23:45"),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "20:00",
      endLocal: "23:45",
      days: [4],
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
    };
    const nma = makeHabit({
      id: "habit-nma-short-anchor",
      name: "NMA",
      durationMinutes: 120,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: baseWindow,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const podcast = makeHabit({
      ...nma,
      id: "habit-podcast-short-anchor",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2026-05-01T00:01:00.000Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([nma, podcast]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}-${start.toISOString()}`,
          source_id: params.item.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, craftMusicDate, client, {
      writeThroughDaysOverride: 1,
    });

    const nmaPlacement = result.placed.find(
      (inst) => inst.source_id === nma.id
    );
    const podcastPlacements = result.placed.filter(
      (inst) => inst.source_id === podcast.id
    );

    expect(nmaPlacement?.start_utc).toBe("2026-05-07T20:00:00.000Z");
    expect(nmaPlacement?.end_utc).toBe("2026-05-07T22:00:00.000Z");
    expect(podcastPlacements).toHaveLength(0);
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcast.id }),
        windows: expect.arrayContaining([
          expect.objectContaining({
            availableStartLocal: new Date("2026-05-07T23:00:00.000Z"),
            endLocal: new Date("2026-05-07T23:45:00.000Z"),
          }),
        ]),
      })
    );
  });

  it("rejects a final SYNC retry candidate that extends beyond continuous anchor coverage", async () => {
    const { client } = createSupabaseMock();
    const craftMusicDate = new Date("2026-05-07T19:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-sync-anchor-tail-gap",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "23:00",
      end_local: "00:15",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    instances = [
      createInstanceRecord({
        id: "inst-refine-socials-tail-gap",
        source_id: "event-refine-socials-tail-gap",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        label: "REFINE SOCIALS",
        start_utc: "2026-05-07T23:00:00.000Z",
        end_utc: "2026-05-07T23:45:00.000Z",
        window_id: windowLite.id,
        energy_resolved: "LOW",
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const podcast = makeHabit({
      id: "habit-podcast-tail-gap",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "23:00",
        endLocal: "00:15",
        days: [4],
        locationContextId: "ctx-craft-music",
        locationContextValue: "CRAFT/MUSIC",
        locationContextName: "CRAFT/MUSIC",
      },
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, craftMusicDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(result.placed.some((inst) => inst.source_id === podcast.id)).toBe(
      false
    );
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcast.id }),
      })
    );
  });

  it("allows adjacent normal anchors to fully cover a final SYNC retry candidate", async () => {
    const { client } = createSupabaseMock();
    const craftMusicDate = new Date("2026-05-07T19:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-sync-adjacent-anchor-coverage",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "23:00",
      end_local: "00:15",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    const anchor = (id: string, start: string, end: string) =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        label: id === "refine-socials" ? "REFINE SOCIALS" : "Anchor",
        start_utc: `2026-05-07T${start}:00.000Z`,
        end_utc:
          end.startsWith("00") || end.startsWith("01")
            ? `2026-05-08T${end}:00.000Z`
            : `2026-05-07T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    instances = [
      anchor("refine-socials", "23:00", "23:45"),
      anchor("adjacent-normal", "23:45", "00:00"),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const podcast = makeHabit({
      id: "habit-podcast-adjacent-coverage",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "23:00",
        endLocal: "00:15",
        days: [4],
        locationContextId: "ctx-craft-music",
        locationContextValue: "CRAFT/MUSIC",
        locationContextName: "CRAFT/MUSIC",
      },
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const windowDef = params.windows[0];
        const start = new Date(windowDef.availableStartLocal);
        const end = new Date(
          start.getTime() + Math.max(1, params.item.duration_min) * 60_000
        );
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}`,
            source_id: params.item.id,
            source_type: "HABIT",
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const result = await scheduleBacklog(userId, craftMusicDate, client, {
      writeThroughDaysOverride: 1,
    });

    const podcastPlacement = result.placed.find(
      (inst) => inst.source_id === podcast.id
    );
    expect(podcastPlacement?.start_utc).toBe("2026-05-07T23:00:00.000Z");
    expect(podcastPlacement?.end_utc).toBe("2026-05-08T00:00:00.000Z");
  });

  it("treats claimed SYNC anchor coverage as source-owned at adjacent boundaries", () => {
    const {
      findAnchoredSyncCandidate,
      removeOwnedAnchorSegments,
      subtractScheduleSegments,
    } = reschedule.__schedulerAnchorCoverageForTest;
    const at = (time: string) =>
      new Date(`2026-05-07T${time}:00.000Z`).getTime();
    const durationMs = 60 * 60_000;

    const anchorA = {
      start: at("21:25"),
      end: at("22:25"),
      ownershipKey: "anchor-a",
    };
    const anchorB = {
      start: at("22:25"),
      end: at("23:25"),
      ownershipKey: "anchor-b",
    };
    const nmaClaimedSlices = [{ start: at("21:25"), end: at("22:00") }];

    const unclaimedAnchors = subtractScheduleSegments(
      removeOwnedAnchorSegments([anchorA, anchorB], new Set(["anchor-a"])),
      nmaClaimedSlices
    );

    expect(unclaimedAnchors).toEqual([
      { start: at("22:25"), end: at("23:25") },
    ]);
    expect(
      findAnchoredSyncCandidate(
        at("22:00"),
        durationMs,
        at("23:25"),
        [],
        unclaimedAnchors
      )
    ).toEqual({ start: at("22:25"), end: at("23:25") });

    const withoutAdditionalAnchors = subtractScheduleSegments(
      removeOwnedAnchorSegments([anchorA], new Set(["anchor-a"])),
      nmaClaimedSlices
    );
    expect(
      findAnchoredSyncCandidate(
        at("22:00"),
        durationMs,
        at("23:00"),
        [],
        withoutAdditionalAnchors
      )
    ).toBeNull();
  });

  it("stretches an anchored SYNC candidate to the end of the long anchor event that satisfies duration", () => {
    const { findAnchoredSyncCandidate, removeOwnedAnchorSegments } =
      reschedule.__schedulerAnchorCoverageForTest;
    const at = (time: string) =>
      new Date(`2026-05-07T${time}:00.000Z`).getTime();
    const durationMs = 60 * 60_000;
    const longAnchor = {
      start: at("20:30"),
      end: at("22:00"),
      ownershipKey: "long-anchor",
    };
    const laterAnchor = {
      start: at("22:00"),
      end: at("23:00"),
      ownershipKey: "later-anchor",
    };

    const firstCandidate = findAnchoredSyncCandidate(
      at("20:30"),
      durationMs,
      at("23:00"),
      [],
      [longAnchor, laterAnchor]
    );

    expect(firstCandidate).toEqual({
      start: at("20:30"),
      end: at("22:00"),
    });
    expect(longAnchor.start).toBeGreaterThanOrEqual(
      firstCandidate?.start ?? 0
    );
    expect(longAnchor.end).toBeLessThanOrEqual(firstCandidate?.end ?? 0);

    const remainingAnchors = removeOwnedAnchorSegments(
      [longAnchor, laterAnchor],
      new Set([longAnchor.ownershipKey])
    );
    expect(
      findAnchoredSyncCandidate(
        at("21:30"),
        durationMs,
        at("23:00"),
        [],
        remainingAnchors
      )
    ).toEqual({ start: at("22:00"), end: at("23:00") });
  });

  it("chooses the earliest unowned adjacent anchor group for the next anchored SYNC", async () => {
    const { client } = createSupabaseMock();
    const syncDate = new Date("2026-05-08T12:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-craft-music-earliest-sync",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "20:00",
      end_local: "00:00",
      days: [5],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
    });

    const instance = (
      id: string,
      sourceId: string,
      sourceType: ScheduleInstance["source_type"],
      startIso: string,
      endIso: string
    ) =>
      createInstanceRecord({
        id,
        source_id: sourceId,
        source_type: sourceType,
        status: "scheduled",
        start_utc: startIso,
        end_utc: endIso,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    instances = [
      instance(
        "inst-nma-anchor-earliest-sync",
        "event-nma-earliest-sync",
        "EVENT" as ScheduleInstance["source_type"],
        "2026-05-08T20:00:00.000Z",
        "2026-05-08T22:00:00.000Z"
      ),
      instance(
        "inst-nma-sync-earliest-sync",
        "habit-nma-earliest-sync",
        "HABIT",
        "2026-05-08T20:00:00.000Z",
        "2026-05-08T22:00:00.000Z"
      ),
      instance(
        "inst-work-attention-earliest-sync",
        "event-work-attention-earliest-sync",
        "EVENT" as ScheduleInstance["source_type"],
        "2026-05-08T22:00:00.000Z",
        "2026-05-08T23:00:00.000Z"
      ),
      instance(
        "inst-redraft-depops-earliest-sync",
        "event-redraft-depops-earliest-sync",
        "EVENT" as ScheduleInstance["source_type"],
        "2026-05-08T23:00:00.000Z",
        "2026-05-08T23:45:00.000Z"
      ),
      instance(
        "inst-later-fill-earliest-sync",
        "event-later-fill-earliest-sync",
        "EVENT" as ScheduleInstance["source_type"],
        "2026-05-08T23:45:00.000Z",
        "2026-05-09T00:00:00.000Z"
      ),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "20:00",
      endLocal: "00:00",
      days: [5],
      locationContextId: null,
      locationContextValue: null,
      locationContextName: null,
    };
    const nma = makeHabit({
      id: "habit-nma-earliest-sync",
      name: "NMA",
      durationMinutes: 120,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      window: baseWindow,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const podcast = makeHabit({
      ...nma,
      id: "habit-podcast-earliest-sync",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2026-05-01T00:01:00.000Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([nma, podcast]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const windowDef = params.windows[0];
        const start = new Date(windowDef.availableStartLocal);
        const end = new Date(
          start.getTime() + Math.max(1, params.item.duration_min) * 60_000
        );
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}-${start.toISOString()}`,
            source_id: params.item.id,
            source_type: "HABIT",
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const result = await scheduleBacklog(userId, syncDate, client, {
      writeThroughDaysOverride: 1,
    });

    const podcastPlacement = result.placed.find(
      (inst) => inst.source_id === podcast.id
    );
    expect(podcastPlacement?.start_utc).toBe("2026-05-08T22:00:00.000Z");
    expect(podcastPlacement?.end_utc).toBe("2026-05-08T23:00:00.000Z");

    const nmaEndMs = new Date("2026-05-08T22:00:00.000Z").getTime();
    expect(new Date(podcastPlacement?.start_utc ?? "").getTime()).toBe(
      nmaEndMs
    );

    for (const anchorInstance of instances.filter(
      (inst) => inst.id !== "inst-nma-sync-earliest-sync"
    )) {
      const anchorStartMs = new Date(anchorInstance.start_utc ?? "").getTime();
      const anchorEndMs = new Date(anchorInstance.end_utc ?? "").getTime();
      const ownedByPodcast =
        anchorStartMs >=
          new Date(podcastPlacement?.start_utc ?? "").getTime() &&
        anchorEndMs <= new Date(podcastPlacement?.end_utc ?? "").getTime();
      const partiallyCoveredByPodcast =
        anchorStartMs < new Date(podcastPlacement?.end_utc ?? "").getTime() &&
        anchorEndMs > new Date(podcastPlacement?.start_utc ?? "").getTime();
      expect(partiallyCoveredByPodcast).toBe(ownedByPodcast);
    }
  });

  it("does not let adjacent SYNC habits split ownership of one anchor source row", async () => {
    const { client } = createSupabaseMock();
    const syncDate = new Date("2026-05-07T19:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-sync-source-owned-anchor",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "20:30",
      end_local: "23:00",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    const anchor = (
      id: string,
      start: string,
      end: string
    ): ScheduleInstance =>
      createInstanceRecord({
        id,
        source_id: `event-${id}`,
        source_type: "EVENT" as ScheduleInstance["source_type"],
        label: id,
        start_utc: `2026-05-07T${start}:00.000Z`,
        end_utc: `2026-05-07T${end}:00.000Z`,
        window_id: windowLite.id,
        energy_resolved: "LOW",
      });

    const spanningAnchor = anchor(
      "anchor-a-spans-sync-boundary",
      "20:30",
      "22:00"
    );
    const laterAnchor = anchor("anchor-b-later-unowned", "22:00", "23:00");
    instances = [spanningAnchor, laterAnchor];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const baseWindow = {
      id: windowLite.id,
      label: windowLite.label ?? null,
      energy: "LOW",
      startLocal: "20:30",
      endLocal: "23:00",
      days: [4],
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
    };
    const syncOne = makeHabit({
      id: "habit-sync-one-source-owned",
      name: "NMA",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: baseWindow,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const syncTwo = makeHabit({
      ...syncOne,
      id: "habit-sync-two-source-owned",
      name: "PODCAST/AUDIOBOOK",
      createdAt: "2026-05-01T00:01:00.000Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([syncOne, syncTwo]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const windowDef = params.windows[0];
        const start = new Date(windowDef.availableStartLocal);
        const end = new Date(
          start.getTime() + Math.max(1, params.item.duration_min) * 60_000
        );
        return {
          data: createInstanceRecord({
            id: `inst-${params.item.id}-${start.toISOString()}`,
            source_id: params.item.id,
            source_type: "HABIT",
            status: "scheduled",
            start_utc: start.toISOString(),
            end_utc: end.toISOString(),
            duration_min: params.item.duration_min,
            window_id: windowDef.id,
            energy_resolved: params.item.energy,
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const result = await scheduleBacklog(userId, syncDate, client, {
      writeThroughDaysOverride: 1,
    });

    const syncOnePlacement = result.placed.find(
      (inst) => inst.source_id === syncOne.id
    );
    const syncTwoPlacement = result.placed.find(
      (inst) => inst.source_id === syncTwo.id
    );
    expect(syncOnePlacement?.start_utc).toBe("2026-05-07T20:30:00.000Z");
    expect(syncOnePlacement?.end_utc).toBe("2026-05-07T22:00:00.000Z");
    expect(syncTwoPlacement?.start_utc).toBe("2026-05-07T22:00:00.000Z");
    expect(syncTwoPlacement?.end_utc).toBe("2026-05-07T23:00:00.000Z");

    expect(
      new Date(syncOnePlacement?.start_utc ?? "").getTime()
    ).toBeLessThanOrEqual(new Date(spanningAnchor.start_utc ?? "").getTime());
    expect(
      new Date(syncOnePlacement?.end_utc ?? "").getTime()
    ).toBeGreaterThanOrEqual(new Date(spanningAnchor.end_utc ?? "").getTime());

    const syncPlacements = [syncOnePlacement, syncTwoPlacement].filter(
      (inst): inst is ScheduleInstance => Boolean(inst)
    );
    for (const anchorInstance of [spanningAnchor, laterAnchor]) {
      const ownerIds = syncPlacements
        .filter((syncInstance) =>
          new Date(syncInstance.start_utc ?? "").getTime() <
            new Date(anchorInstance.end_utc ?? "").getTime() &&
          new Date(syncInstance.end_utc ?? "").getTime() >
            new Date(anchorInstance.start_utc ?? "").getTime()
        )
        .map((syncInstance) => syncInstance.source_id);
      expect(new Set(ownerIds).size).toBe(ownerIds.length);
      expect(ownerIds.length).toBeLessThanOrEqual(1);
    }
    expect(
      new Date(syncTwoPlacement?.start_utc ?? "").getTime()
    ).toBeGreaterThanOrEqual(new Date(laterAnchor.start_utc ?? "").getTime());
  });

  it("does not bridge a gap between normal anchors for a final SYNC retry", async () => {
    const { client } = createSupabaseMock();
    const craftMusicDate = new Date("2026-05-07T19:00:00.000Z");

    const windowLite = makeWindow({
      id: "win-sync-anchor-mid-gap",
      label: "CRAFT/MUSIC",
      energy: "LOW",
      start_local: "23:00",
      end_local: "00:15",
      days: [4],
      location_context_id: "ctx-craft-music",
      location_context_value: "CRAFT/MUSIC",
      location_context_name: "CRAFT/MUSIC",
    });

    instances = [
      createInstanceRecord({
        id: "inst-anchor-before-gap",
        source_id: "event-anchor-before-gap",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2026-05-07T23:00:00.000Z",
        end_utc: "2026-05-07T23:30:00.000Z",
        window_id: windowLite.id,
        energy_resolved: "LOW",
      }),
      createInstanceRecord({
        id: "inst-anchor-after-gap",
        source_id: "event-anchor-after-gap",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2026-05-07T23:45:00.000Z",
        end_utc: "2026-05-08T00:15:00.000Z",
        window_id: windowLite.id,
        energy_resolved: "LOW",
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const podcast = makeHabit({
      id: "habit-podcast-mid-gap",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      habitType: "SYNC",
      windowId: windowLite.id,
      energy: "LOW",
      locationContextId: "ctx-craft-music",
      locationContextValue: "CRAFT/MUSIC",
      locationContextName: "CRAFT/MUSIC",
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "23:00",
        endLocal: "00:15",
        days: [4],
        locationContextId: "ctx-craft-music",
        locationContextValue: "CRAFT/MUSIC",
        locationContextName: "CRAFT/MUSIC",
      },
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([podcast]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, craftMusicDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(result.placed.some((inst) => inst.source_id === podcast.id)).toBe(
      false
    );
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcast.id }),
      })
    );
  });

  it("keeps a skipped SYNC unscheduled when the post-anchor retry only has empty space", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-empty-retry",
      label: "Creator Sync",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:45",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-normal-anchor-only-early",
        source_id: "event-anchor-early",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-nma-sync-empty-retry",
        source_id: "habit-nma-sync-empty-retry",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const nmaSync = makeHabit({
      id: "habit-nma-sync-empty-retry",
      name: "NMA SYNC",
      durationMinutes: 100,
      habitType: "SYNC",
      windowId: windowLite.id,
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "21:00",
        endLocal: "23:45",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    });
    const podcastSync = makeHabit({
      ...nmaSync,
      id: "habit-podcast-sync-empty-retry",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:01:00Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([nmaSync, podcastSync]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(
      result.placed.some((inst) => inst.source_id === podcastSync.id)
    ).toBe(false);
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcastSync.id }),
      })
    );
  });

  it("does not retry a SYNC habit into a later anchor when another SYNC still overlaps it", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-retry-conflict",
      label: "Creator Sync",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:45",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-normal-anchor-conflict",
        source_id: "event-anchor-early",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:40:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-long-sync-conflict",
        source_id: "habit-long-sync-conflict",
        source_type: "HABIT",
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T23:10:00.000Z",
        window_id: windowLite.id,
        locked: true,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    const project = {
      id: "proj-refine-socials-conflict",
      name: "REFINE SOCIALS",
      priority: "HIGH",
      stage: "BUILD",
      energy: "LOW",
      duration_min: 60,
    };
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      [project.id]: project,
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue({
      data: [
        createInstanceRecord({
          id: "inst-missed-project-conflict",
          source_id: project.id,
          source_type: "PROJECT",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies BacklogResponse);

    const longSync = makeHabit({
      id: "habit-long-sync-conflict",
      name: "NMA SYNC",
      durationMinutes: 130,
      habitType: "SYNC",
      windowId: windowLite.id,
      window: {
        id: windowLite.id,
        label: windowLite.label ?? null,
        energy: "LOW",
        startLocal: "21:00",
        endLocal: "23:45",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    });
    const podcastSync = makeHabit({
      ...longSync,
      id: "habit-podcast-sync-conflict",
      name: "PODCAST/AUDIOBOOK",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:01:00Z",
    });
    fetchHabitsForScheduleSpy.mockResolvedValue([longSync, podcastSync]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start =
        params.item.sourceType === "PROJECT"
          ? new Date("2024-01-02T22:45:00.000Z")
          : new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: params.item.sourceType,
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });

    expect(
      result.placed.some((inst) => inst.source_id === podcastSync.id)
    ).toBe(false);
    expect(placeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: podcastSync.id }),
      })
    );
  });

  it("allows SYNC boundary-touch while still requiring real anchor overlap", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-boundary",
      label: "Sync Boundary",
      energy: "LOW",
      start_local: "21:00",
      end_local: "23:00",
      days: [2],
    });

    instances = [
      createInstanceRecord({
        id: "inst-anchor-boundary",
        source_id: "event-anchor-boundary",
        source_type: "EVENT" as ScheduleInstance["source_type"],
        start_utc: "2024-01-02T21:00:00.000Z",
        end_utc: "2024-01-02T22:00:00.000Z",
        window_id: windowLite.id,
      }),
      createInstanceRecord({
        id: "inst-existing-sync-boundary",
        source_id: "habit-existing-sync-boundary",
        source_type: "HABIT",
        start_utc: "2024-01-02T22:00:00.000Z",
        end_utc: "2024-01-02T23:00:00.000Z",
        window_id: windowLite.id,
      }),
    ];

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    const existingSyncHabit: HabitScheduleItem = {
      id: "habit-existing-sync-boundary",
      name: "Existing Sync",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
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
        startLocal: windowLite.start_local ?? "21:00",
        endLocal: windowLite.end_local ?? "23:00",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    const boundarySyncHabit: HabitScheduleItem = {
      ...existingSyncHabit,
      id: "habit-boundary-sync",
      name: "Boundary Sync",
      createdAt: "2024-01-01T00:01:00Z",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([
      existingSyncHabit,
      boundarySyncHabit,
    ]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client, {
      writeThroughDaysOverride: 1,
    });
    const boundarySync = result.placed.find(
      (inst) => inst.source_id === boundarySyncHabit.id
    );

    expect(boundarySync?.start_utc).toBe("2024-01-02T21:00:00.000Z");
    expect(boundarySync?.end_utc).toBe("2024-01-02T22:00:00.000Z");
  });

  it("still allows SYNC habits to overlap normal habit events", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-overlay",
      label: "Overlay Window",
      energy: "LOW",
      start_local: "20:00",
      end_local: "23:00",
      days: [2],
    });

    fetchWindowsForDateSpy.mockResolvedValue([windowLite]);
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    const normalHabit: HabitScheduleItem = {
      id: "habit-normal",
      name: "Chore",
      durationMinutes: 145,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "CHORE",
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
        startLocal: windowLite.start_local ?? "20:00",
        endLocal: windowLite.end_local ?? "23:00",
        days: windowLite.days ?? null,
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };
    const syncHabit: HabitScheduleItem = {
      ...normalHabit,
      id: "habit-sync-overlay",
      name: "Sync Overlay",
      durationMinutes: 85,
      createdAt: "2024-01-01T00:01:00Z",
      habitType: "SYNC",
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([normalHabit, syncHabit]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const end = new Date(
        start.getTime() + Math.max(1, params.item.duration_min) * 60_000
      );
      return {
        data: createInstanceRecord({
          id: `inst-${params.item.id}`,
          source_id: params.item.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client);
    const normal = result.placed.find(
      (inst) => inst.source_id === normalHabit.id
    );
    const sync = result.placed.find((inst) => inst.source_id === syncHabit.id);

    expect(normal?.start_utc).toBe("2024-01-02T20:00:00.000Z");
    expect(normal?.end_utc).toBe("2024-01-02T22:25:00.000Z");
    expect(sync?.start_utc).toBe("2024-01-02T20:00:00.000Z");
    expect(
      new Date(normal?.end_utc ?? 0).getTime() >
        new Date(sync?.start_utc ?? 0).getTime() &&
        new Date(sync?.end_utc ?? 0).getTime() >
          new Date(normal?.start_utc ?? 0).getTime()
    ).toBe(true);
  });

  it("persists SYNC habits that were reserved before the live habit pass", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-sync-reserved",
      label: "Sync Reserved Window",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    });

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

    const syncHabit: HabitScheduleItem = {
      id: "habit-sync-reserved",
      name: "Reserved Sync Habit",
      durationMinutes: 20,
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

    fetchHabitsForScheduleSpy.mockResolvedValue([syncHabit]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      const windowDef = params.windows[0];
      const start = new Date(windowDef.availableStartLocal);
      const durationMs = Math.max(1, params.item.duration_min) * 60_000;
      const end = new Date(start.getTime() + durationMs);

      return {
        data: createInstanceRecord({
          id: "inst-sync-reserved",
          source_id: syncHabit.id,
          source_type: "HABIT",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min,
          window_id: windowDef.id,
          energy_resolved: params.item.energy,
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
    });

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          id: syncHabit.id,
          sourceType: "HABIT",
        }),
        allowHabitOverlap: true,
      })
    );
    expect(result.placed).toContainEqual(
      expect.objectContaining({
        id: "inst-sync-reserved",
        source_id: syncHabit.id,
        source_type: "HABIT",
        window_id: windowLite.id,
      })
    );
    expect(
      result.timeline.some(
        (entry) => entry.type === "HABIT" && entry.habit.id === syncHabit.id
      )
    ).toBe(true);
  });

  it("reschedules habits that conflict with scheduled projects", async () => {
    const { client } = createSupabaseMock();

    const windowLite = makeWindow({
      id: "win-mix",
      label: "Shared Window",
      energy: "LOW",
      start_local: "08:00",
      end_local: "09:00",
      days: [2],
    });

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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

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
      (entry) => entry.type === "HABIT" && entry.habit.id === habit.id
    );
    expect(habitTimeline).toBeDefined();
    expect(new Date(habitTimeline?.habit.startUTC ?? "").toISOString()).toBe(
      rescheduledHabitInstance.start_utc
    );
    expect(new Date(habitTimeline?.habit.endUTC ?? "").toISOString()).toBe(
      rescheduledHabitInstance.end_utc
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-1",
        label: "Morning",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [3],
      }),
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async () => ({
      error: "NO_FIT" as const,
    }));

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).not.toHaveBeenCalled();
    expect(
      result.placed.some((inst) => inst.source_id === "proj-complete")
    ).toBe(false);
    expect(
      result.timeline.some(
        (entry) =>
          entry.type === "PROJECT" && entry.projectId === "proj-complete"
      )
    ).toBe(false);
  });

  it("does not reschedule projects completed ahead of their scheduled start", async () => {
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
      makeWindow({
        id: "win-future",
        label: "Evening",
        energy: "LOW",
        start_local: "18:00",
        end_local: "19:00",
        days: [2],
      }),
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

    expect(placeSpy).not.toHaveBeenCalled();
    expect(
      result.timeline.some(
        (entry) => entry.type === "PROJECT" && entry.projectId === "proj-1"
      )
    ).toBe(false);
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
        (entry) => entry.type === "PROJECT" && entry.projectId === "proj-2"
      )
    ).toBe(true);
    expect(
      result.timeline.some(
        (entry) => entry.type === "PROJECT" && entry.projectId === "proj-1"
      )
    ).toBe(false);
  });

  it("allows projects to overlap with completed habits", async () => {
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-shared",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      }),
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(realPlaceItemInWindows);

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(placeSpy).toHaveBeenCalled();
    const projectPlacement = result.timeline.find(
      (entry) => entry.type === "PROJECT" && entry.projectId === "proj-new"
    ) as (typeof result.timeline)[number] | undefined;

    expect(projectPlacement).toBeDefined();
    // Completed instances no longer block, so project can be placed at the same time
    if (projectPlacement && projectPlacement.type === "PROJECT") {
      const placementStart = new Date(
        projectPlacement.instance.start_utc
      ).getTime();
      const completedStart = new Date(completedHabit.start_utc).getTime();
      // Project can start at the same time as completed habit
      expect(placementStart).toBe(completedStart);
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-shared",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      }),
    ]);

    fetchHabitsForScheduleSpy.mockResolvedValue([]);

    const result = await scheduleBacklog(userId, baseDate, client);

    const projectPlacement = result.timeline.find(
      (entry) => entry.type === "PROJECT" && entry.projectId === "proj-new"
    ) as (typeof result.timeline)[number] | undefined;

    expect(projectPlacement).toBeDefined();
    if (projectPlacement && projectPlacement.type === "PROJECT") {
      const placementStart = new Date(
        projectPlacement.instance.start_utc
      ).getTime();
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
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
      (entry) => entry.type === "HABIT" && entry.habit.id === "habit-overlap"
    );
    const projectPlacement = result.timeline.find(
      (entry) => entry.type === "PROJECT" && entry.projectId === "proj-overlap"
    );

    expect(habitPlacement).toBeDefined();
    expect(projectPlacement).toBeDefined();

    const habitStart =
      habitPlacement && habitPlacement.type === "HABIT"
        ? new Date(habitPlacement.habit.startUTC).getTime()
        : NaN;
    const habitEnd =
      habitPlacement && habitPlacement.type === "HABIT"
        ? new Date(habitPlacement.habit.endUTC).getTime()
        : NaN;
    const projectStart =
      projectPlacement && projectPlacement.type === "PROJECT"
        ? new Date(projectPlacement.instance.start_utc).getTime()
        : NaN;
    const projectEnd =
      projectPlacement && projectPlacement.type === "PROJECT"
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-habit",
        label: "Morning",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
      }),
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

    const baseDateLocal = schedNow("2024-01-02T12:00:00Z");
    const baseDayKey = baseDateLocal.toISOString().slice(0, 10);

    const result = await scheduleBacklog(userId, baseDateLocal, client);

    const habitCalls = (placeSpy.mock.calls ?? []).filter(
      (call) =>
        call?.[0]?.item?.sourceType === "HABIT" &&
        call?.[0]?.item?.id === habit.id
    );
    expect(
      habitCalls.some(
        (call) => call?.[0]?.date?.toISOString().slice(0, 10) === baseDayKey
      )
    ).toBe(false);

    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === habit.id
    );
    expect(
      habitEntries.some(
        (entry) =>
          new Date(entry.habit.startUTC).toISOString().slice(0, 10) ===
          baseDayKey
      )
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
      {
        id: "goal-focus",
        name: "Focus Goal",
        weight: 0,
        monumentId: "monument-keep",
      },
      {
        id: "goal-other",
        name: "Other Goal",
        weight: 0,
        monumentId: "monument-ignore",
      },
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

    expect(
      result.failures.find((failure) => failure.reason === "MODE_FILTERED")
    ).toBeUndefined();
    expect(attemptedProjectIds[0]).toBe("proj-focus");
    expect(new Set(attemptedProjectIds)).toEqual(
      new Set(["proj-focus", "proj-other"])
    );
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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

    const testBaseDate = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6, 30);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async () => [
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
      ]
    );

    let observedOrder: string[] | null = null;
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ windows }) => {
        if (!observedOrder) {
          observedOrder = windows.map((win) => win.id);
        }
        return { error: "NO_FIT" as const };
      }
    );

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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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

    const anchorDate = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6, 15);

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
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ windows }) => {
        if (!observedStart) {
          observedStart = windows[0]?.availableStartLocal ?? null;
        }
        return { error: "NO_FIT" as const };
      }
    );

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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

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
      ]
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async () =>
        ({
          data: [],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse)
    );

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
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6);
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(4);
    expect(result.timeline).toHaveLength(4);
    expect(new Set(result.timeline.map((entry) => entry.instance.id))).toEqual(
      new Set(result.placed.map((inst) => inst.id))
    );

    const sorted = [...result.placed].sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );
    if (process.env.DEBUG_OVERNIGHT === "true") {
      console.log(
        "overnight starts",
        sorted.map((inst) => inst.start_utc)
      );
    }

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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

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
        const start = (windows[0]?.availableStartLocal ??
          windows[0]?.startLocal)!;
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
      }
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

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
    expect(result.failures).toEqual([
      { itemId: "proj-low", reason: "NO_WINDOW" },
    ]);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 6 }).reduce<
      Record<string, ProjectLite>
    >((acc, _, index) => {
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
    }, {});

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(
      projectDefs
    );

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
      ]
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async (_userId, startUTC, endUTC) => {
        const startMs = new Date(startUTC).getTime();
        const endMs = new Date(endUTC).getTime();
        const data = instances.filter((inst) => {
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
      }
    );

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(
      async (input) => {
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
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6);
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(6);
    expect(result.timeline).toHaveLength(6);

    const sorted = [...result.placed].sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    const firstDay = sorted.slice(0, 4);
    const secondDay = sorted.slice(4);

    expect(firstDay.every((inst) => inst.window_id === "win-daily")).toBe(true);
    expect(secondDay.every((inst) => inst.window_id === "win-daily")).toBe(
      true
    );

    expect(
      firstDay.every((inst) =>
        new Date(inst.start_utc).toISOString().startsWith("2024-01-02")
      )
    ).toBe(true);

    expect(
      secondDay.every((inst) =>
        new Date(inst.start_utc).toISOString().startsWith("2024-01-03")
      )
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 4 }).reduce<
      Record<string, ProjectLite>
    >((acc, _, index) => {
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
    }, {});

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(
      projectDefs
    );

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
      ]
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async (_userId, startUTC, endUTC) => {
        const startMs = new Date(startUTC).getTime();
        const endMs = new Date(endUTC).getTime();
        const data = instances.filter((inst) => {
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
      }
    );

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(
      async (input) => {
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
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 14);
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(4);

    const sorted = [...result.placed].sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    expect(sorted.every((inst) => inst.window_id === "win-overnight")).toBe(
      true
    );

    const nightlyStarts = sorted
      .filter((inst) => inst.start_utc.endsWith("22:00:00.000Z"))
      .map((inst) => inst.start_utc);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(emptyBacklog);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const projectDefs = Array.from({ length: 30 }).reduce<
      Record<string, ProjectLite>
    >((acc, _, index) => {
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
    }, {});

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue(
      projectDefs
    );

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
      ]
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async (_userId, startUTC, endUTC) => {
        const startMs = new Date(startUTC).getTime();
        const endMs = new Date(endUTC).getTime();
        const data = instances.filter((inst) => {
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
      }
    );

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(
      async (input) => {
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
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 5);
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(30);

    const sorted = [...result.placed].sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    expect(sorted[0]?.start_utc.startsWith("2024-01-02T09:00:00.000Z")).toBe(
      true
    );
    expect(
      sorted.at(-1)?.start_utc.startsWith("2024-01-31T09:00:00.000Z")
    ).toBe(true);
  });

  it("fills remaining time today with later projects even if earlier ones spill into tomorrow", async () => {
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
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
      }
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async () =>
        ({
          data: [...instances],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse)
    );

    vi.spyOn(instanceRepo, "createInstance").mockImplementation(
      async (input) => {
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
      }
    );

    const projectByInstance = new Map([
      ["missed-long", "proj-long"],
      ["missed-short", "proj-short"],
    ]);

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async (id, input) => {
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
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 17);
    const mockClient = {} as ScheduleBacklogClient;
    const result = await scheduleBacklog(userId, anchor, mockClient);

    expect(result.error).toBeUndefined();
    expect(result.failures).toHaveLength(0);
    expect(result.placed).toHaveLength(2);
    expect(result.timeline).toHaveLength(2);
    expect(new Set(result.timeline.map((entry) => entry.instance.id))).toEqual(
      new Set(result.placed.map((inst) => inst.id))
    );

    const placementsByStart = [...result.placed].sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    const first = placementsByStart[0]!;
    const second = placementsByStart[1]!;

    expect(
      new Date(first.start_utc).toISOString().startsWith("2024-01-02")
    ).toBe(true);
    expect(
      new Date(second.start_utc).toISOString().startsWith("2024-01-03")
    ).toBe(true);
    expect(first.source_id).toBe("proj-short");
    expect(second.source_id).toBe("proj-long");
  });

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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
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
      }
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async () =>
        ({
          data: [],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse)
    );

    const placements: Array<{ windowId: string; startUTC: string }> = [];

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const window = params.windows[0];
        if (!window) {
          return { error: "NO_FIT" as const };
        }
        const start = new Date(window.availableStartLocal ?? window.startLocal);
        const end = new Date(
          start.getTime() + params.item.duration_min * 60000
        );
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
      }
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 8);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
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
      }
    );

    fetchInstancesForRangeSpy.mockImplementation(
      async () =>
        ({
          data: [],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse)
    );

    const placements: Array<{ windowId: string; startUTC: string }> = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const window = params.windows[0];
        if (!window) {
          return { error: "NO_FIT" as const };
        }
        const start = new Date(window.availableStartLocal ?? window.startLocal);
        const end = new Date(
          start.getTime() + params.item.duration_min * 60000
        );
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
      }
    );

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 9);
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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
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
      }
    );

    const placements: Array<{
      windowId: string;
      reuseInstanceId: string | null;
      startUTC: string;
      notBefore: Date | undefined;
    }> = [];

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const window = params.windows[0];
        if (!window) {
          return { error: "NO_FIT" as const };
        }
        const start = new Date(window.availableStartLocal ?? window.startLocal);
        const end = new Date(
          start.getTime() + params.item.duration_min * 60000
        );
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
      }
    );

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
    expect(placements[0]?.notBefore?.toISOString()).toBe(
      baseDate.toISOString()
    );
  });

  it("keeps new placements on the requested local day for positive UTC offsets", async () => {
    const tz = "Pacific/Auckland";
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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        const dayOfWeek = date.getUTCDay();
        return [
          {
            id: "win-morning",
            label: "Morning",
            energy: null,
            start_local: "06:00",
            end_local: "08:00",
            days: [dayOfWeek],
          },
        ];
      }
    );

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async (input) => {
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

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-27T00:00:00Z", tz, 1);
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: tz,
    });

    if (result.placed.length === 0) {
      console.log("tz:", tz);
      console.log("anchor ISO:", anchor.toISOString());
      console.log("result.failures:", result.failures);
    }

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(new Date(placed.start_utc), tz);
    expect(localParts).toEqual({ year: 2024, month: 1, day: 27 });
  });

  it("keeps new placements on the requested local day for negative UTC offsets", async () => {
    const tz = "America/Los_Angeles";
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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        const localParts = getDatePartsInTimeZone(date, tz);
        return [
          {
            id: "win-morning",
            label: "Morning",
            energy: "NO",
            start_local: "09:00",
            end_local: "11:00",
            days: [localParts.dayOfWeek],
          },
        ];
      }
    );

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async (input) => {
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

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-27T20:00:00Z", tz, 5);
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: tz,
    });

    if (result.placed.length === 0) {
      console.log("tz:", tz);
      console.log("anchor ISO:", anchor.toISOString());
      console.log("result.failures:", result.failures);
    }

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(new Date(placed.start_utc), tz);
    expect(localParts).toEqual({ year: 2024, month: 1, day: 27 });
  });

  it("prevents illegal NON-SYNC overlaps at write time", async () => {
    instances = [];
    const { client } = createSupabaseMock();

    const windowLite: repo.WindowLite = {
      id: "win-midnight",
      label: "Midnight Window",
      energy: "LOW",
      start_local: "23:00",
      end_local: "01:00",
      days: [2],
    };

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      windowLite,
    ]);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    fetchHabitsForScheduleSpy.mockResolvedValue([
      {
        id: "habit-non-sync-1",
        name: "Non Sync 1",
        durationMinutes: 30,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        lastCompletedAt: null,
        habitType: "HABIT",
        windowId: "win-midnight",
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
          id: "win-midnight",
          label: "Midnight Window",
          energy: "LOW",
          startLocal: "23:00",
          endLocal: "01:00",
          days: [2],
          locationContextId: null,
          locationContextValue: null,
          locationContextName: null,
        },
      },
      {
        id: "habit-non-sync-2",
        name: "Non Sync 2",
        durationMinutes: 30,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        lastCompletedAt: null,
        habitType: "HABIT",
        windowId: "win-midnight",
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
          id: "win-midnight",
          label: "Midnight Window",
          energy: "LOW",
          startLocal: "23:00",
          endLocal: "01:00",
          days: [2],
          locationContextId: null,
          locationContextValue: null,
          locationContextName: null,
        },
      },
    ]);

    const result = await scheduleBacklog(userId, baseDate, client);

    const habitInstances = result.placed.filter(
      (inst) => inst.source_type === "HABIT"
    );

    expect(habitInstances.length).toBe(1); // Only one placed, the second rejected

    expect(result.failures.length).toBe(1);

    expect(result.failures[0].itemId).toBe("habit-non-sync-2");

    expect(result.failures[0].reason).toBe("NO_WINDOW"); // Since rejected due to overlap
  });

  it("keeps scheduled day offsets aligned across DST transitions", async () => {
    const tz = "America/Los_Angeles";
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
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        const localParts = getDatePartsInTimeZone(date, tz);
        const dayKey = `${localParts.year}-${String(localParts.month).padStart(
          2,
          "0"
        )}-${String(localParts.day).padStart(2, "0")}`;
        requestedDates.push(dayKey);
        if (dayKey === "2024-03-10") {
          return [
            {
              id: "win-dst",
              label: "DST Morning",
              energy: "NO",
              start_local: "09:00",
              end_local: "11:00",
              days: [localParts.dayOfWeek],
            },
          ];
        }
        return [];
      }
    );

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async (input) => {
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

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-03-09T20:00:00Z", tz, 11);
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: tz,
    });

    if (result.placed.length === 0) {
      console.log("tz:", tz);
      console.log("anchor ISO:", anchor.toISOString());
      console.log("result.failures:", result.failures);
    }

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const timelineEntry = result.timeline[0];
    expect(timelineEntry?.scheduledDayOffset).toBe(1);

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(new Date(placed.start_utc), tz);
    expect(localParts).toEqual({ year: 2024, month: 3, day: 10 });
    expect(requestedDates).toContain("2024-03-10");
  });

  it("does not shift projects scheduled in late-night windows to the next day", async () => {
    const tz = "America/Los_Angeles";
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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        const localParts = getDatePartsInTimeZone(date, tz);
        if (
          localParts.day === 27 &&
          localParts.month === 1 &&
          localParts.year === 2024
        ) {
          return [
            {
              id: "win-late",
              label: "Late",
              energy: "NO",
              start_local: "23:00",
              end_local: "01:00",
              days: [date.getUTCDay()],
            },
          ];
        }
        return [];
      }
    );

    const createSpy = vi
      .spyOn(instanceRepo, "createInstance")
      .mockImplementation(async (input) => {
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

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async () => {
        throw new Error("rescheduleInstance should not be called");
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => await realPlaceItemInWindows(params)
    );

    const anchor = atSchedDayHour("2024-01-27T20:00:00Z", tz, 1);
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, anchor, supabase, {
      timeZone: tz,
    });

    if (result.placed.length === 0) {
      console.log("tz:", tz);
      console.log("anchor ISO:", anchor.toISOString());
      console.log("result.failures:", result.failures);
    }

    expect(result.error).toBeUndefined();
    expect(result.placed).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledOnce();

    const placed = result.placed[0];
    expect(placed).toBeDefined();
    if (!placed) throw new Error("expected placement");
    const localParts = getDatePartsInTimeZone(new Date(placed.start_utc), tz);
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

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
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        ignoreSets.push(
          params.ignoreProjectIds ? new Set(params.ignoreProjectIds) : undefined
        );
        const window = params.windows[0];
        if (!window) {
          return { error: "NO_FIT" as const };
        }
        const start = new Date(window.availableStartLocal ?? window.startLocal);
        const end = new Date(
          start.getTime() + params.item.duration_min * 60000
        );
        placementResults.push({
          windowId: window.id,
          projectId: params.item.id,
        });
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
      }
    );

    const result = await scheduleBacklog(
      userId,
      baseDate,
      {} as ScheduleBacklogClient
    );

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
    expect(new Set(placementResults.map((entry) => entry.projectId))).toEqual(
      new Set(["proj-alpha", "proj-beta"])
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

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
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
      }
    );

    const placements: Array<{ windowId: string; startUTC: string }> = [];

    placeSpy.mockImplementation(async (params) => {
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

    const anchor = atSchedDayHour("2024-01-02T12:00:00Z", "UTC", 6, 30);
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

  it("does not reuse a project instance that was canceled during the same full reschedule", async () => {
    const { client: supabase, canceledIds, updateCalls } =
      createSupabaseMock();
    const canceledProjectInstance = createInstanceRecord({
      id: "inst-canceled",
      source_id: "proj-1",
      status: "scheduled",
      start_utc: "2024-01-02T09:00:00Z",
      end_utc: "2024-01-02T10:00:00Z",
      window_id: "win-existing",
      weight_snapshot: 1,
    });

    fetchInstancesForRangeSpy.mockResolvedValue({
      data: [canceledProjectInstance],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies InstancesResponse);

    fetchWindowsForDateSpy.mockResolvedValue([
      makeWindow({
        id: "win-1",
        label: "Later window",
        energy: "LOW",
        start_local: "15:00",
        end_local: "16:00",
        days: [2],
      }),
    ]);

    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });

    const placements: Array<{
      projectId: string;
      reuseInstanceId: string | null | undefined;
    }> = [];
    const placeSpy = vi.spyOn(placement, "placeItemInWindows");
    placeSpy.mockImplementation(async (params) => {
      placements.push({
        projectId: params.item.id,
        reuseInstanceId: params.reuseInstanceId,
      });
      return await realPlaceItemInWindows(params);
    });

    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(result.failures).toHaveLength(0);
    expect(canceledIds).toContain("inst-canceled");
    expect(
      updateCalls.filter((call) => call.id === "inst-canceled")
    ).toHaveLength(1);
    const proj1Placement = placements.find((entry) => entry.projectId === "proj-1");
    expect(proj1Placement).toBeDefined();
    expect(proj1Placement?.reuseInstanceId).toBeUndefined();
    expect(result.timeline.find((entry) => entry.projectId === "proj-1")?.decision).toBe(
      "new"
    );
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

    fetchInstancesForRangeSpy.mockImplementation(
      async () =>
        ({
          data: [existing],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse)
    );

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
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        reuseId = params.reuseInstanceId ?? null;
        return {
          data: existing,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }
    );

    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(reuseId).toBe("inst-existing");
    expect(result.placed).toHaveLength(1);
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.instance.id).toBe(result.placed[0]?.id);
    expect(result.timeline[0]?.decision).toBe("rescheduled");
    expect(
      updateMock.mock.calls.some((call) => call?.[0]?.status === "canceled")
    ).toBe(false);
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
    const { firstArgs, restore } = captureFirstCompatibleCall();
    try {
      const result = await scheduleBacklog(userId, baseDate, supabase);

      expect(placeSpy).toHaveBeenCalledTimes(1);
      expect(result.placed).toHaveLength(1);
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0]?.instance.id).toBe("inst-existing");
      expect(result.timeline[0]?.decision).toBe("rescheduled");
    } finally {
      restore();
    }
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

    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    expect(habitEntries).toHaveLength(0);
  });

  it("requires exact SYNC habit location for location-specific time blocks", async () => {
    const { client } = createSupabaseMock();
    const day = new Date("2026-05-07T12:00:00.000Z");
    const syncHabitItem = {
      energy: "LOW",
      duration_min: 30,
      habitType: "SYNC",
    };
    const spiritualBlock = makeWindow({
      id: "tb-spiritual",
      label: "SPIRITUAL EVOLUTION",
      energy: "LOW",
      start_local: "20:00",
      end_local: "21:00",
      days: [4],
      location_context_id: "ctx-spiritual",
      location_context_value: "SPIRITUAL",
      location_context_name: "Spiritual",
      dayTypeTimeBlockId: "dttb-spiritual",
    });
    const openBlock = makeWindow({
      id: "tb-open",
      label: "OPEN",
      energy: "LOW",
      start_local: "21:00",
      end_local: "22:00",
      days: [4],
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
      dayTypeTimeBlockId: "dttb-open",
    });

    const nullLocationSpecificBlock = await fetchCompatibleWindowsForItem(
      client as any,
      day,
      syncHabitItem,
      "UTC",
      {
        preloadedWindows: [spiritualBlock],
        locationContextId: null,
        locationContextValue: null,
        hasExplicitLocationContext: false,
      }
    );
    expect(nullLocationSpecificBlock.windows).toHaveLength(0);

    const matchingLocationSpecificBlock = await fetchCompatibleWindowsForItem(
      client as any,
      day,
      syncHabitItem,
      "UTC",
      {
        preloadedWindows: [spiritualBlock],
        locationContextId: "ctx-spiritual",
        locationContextValue: null,
        hasExplicitLocationContext: true,
      }
    );
    expect(matchingLocationSpecificBlock.windows).toEqual([
      expect.objectContaining({
        id: "tb-spiritual",
        dayTypeTimeBlockId: "dttb-spiritual",
      }),
    ]);

    const nullLocationOpenBlock = await fetchCompatibleWindowsForItem(
      client as any,
      day,
      syncHabitItem,
      "UTC",
      {
        preloadedWindows: [openBlock],
        locationContextId: null,
        locationContextValue: null,
        hasExplicitLocationContext: false,
      }
    );
    expect(nullLocationOpenBlock.windows).toEqual([
      expect.objectContaining({
        id: "tb-open",
        dayTypeTimeBlockId: "dttb-open",
      }),
    ]);
  });

  it("skips work windows when the habit has no location context", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-work",
        label: "Focused Work",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [5],
        location_context_id: null,
        location_context_value: "WORK",
        location_context_name: "Work",
      }),
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
    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    expect(habitEntries).toHaveLength(0);
  });

  it("schedules habits into windows when location context matches", async () => {
    instances = [];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-office",
        label: "Office",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
        location_context_id: "ctx-office",
        location_context_value: "OFFICE",
        location_context_name: "Office",
      }),
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
    placeMock.mockImplementation(async () => ({ error: "NO_FIT" as const }));
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

    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    expect(habitEntries.length).toBeGreaterThan(0);
  });

  it("requeues location-mismatched habits instead of silently missing them", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-habit-location",
        source_id: "habit-location",
        source_type: "HABIT",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T09:30:00Z",
        window_id: "win-home",
        duration_min: 30,
      }),
    ];
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
      id: "habit-location",
      name: "Office habit",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      window: null,
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
    placeMock.mockResolvedValue({
      data: createInstanceRecord({
        id: "inst-habit-requeued",
        source_id: habit.id,
        source_type: "HABIT",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T09:30:00Z",
        window_id: "win-office",
        duration_min: 30,
        energy_resolved: "LOW",
      }),
      error: null,
      count: null,
      status: 201,
      statusText: "Created",
    });

    const { client: supabase, updateCalls } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    expect(
      updateCalls.some(
        (call) =>
          call.id === "inst-habit-location" &&
          call.payload?.status === "canceled"
      )
    ).toBe(true);
    expect(
      updateCalls.some(
        (call) =>
          call.id === "inst-habit-location" && call.payload?.status === "missed"
      )
    ).toBe(false);
    const habitEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === habit.id
    );
    expect(habitEntries.length).toBeGreaterThan(0);
  });

  it("marks location-mismatched requeues as missed with a reason when placement fails", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-habit-miss",
        source_id: "habit-miss",
        source_type: "HABIT",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T09:30:00Z",
        window_id: "win-home",
        duration_min: 30,
      }),
    ];
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
      id: "habit-miss",
      name: "Office habit",
      durationMinutes: 30,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      window: null,
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

    const { client: supabase, updateCalls } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, supabase);

    expect(
      updateCalls.some(
        (call) =>
          call.id === "inst-habit-miss" &&
          call.payload?.status === "missed" &&
          call.payload?.missed_reason === "LOCATION_MISMATCH_REVALIDATION"
      )
    ).toBe(true);
  });

  it("restores window availability after location-mismatch cancel so another habit can place", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-habit-a",
        source_id: "habit-a",
        source_type: "HABIT",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:00:00Z",
        window_id: "win-home",
        duration_min: 60,
      }),
    ];
    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({});
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-home",
        label: "Home",
        energy: "LOW",
        start_local: "08:00",
        end_local: "09:00",
        days: [2],
        location_context_id: "ctx-home",
        location_context_value: "HOME",
        location_context_name: "Home",
      },
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

    const habitA: HabitScheduleItem = {
      id: "habit-a",
      name: "Office habit A",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      habitType: "HABIT",
      windowId: null,
      window: null,
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
    const habitB: HabitScheduleItem = {
      ...habitA,
      id: "habit-b",
      name: "Office habit B",
      durationMinutes: 30,
      createdAt: "2024-01-01T01:00:00Z",
    };
    fetchHabitsForScheduleSpy.mockResolvedValue([habitA, habitB]);

    const placeMock = placement.placeItemInWindows as unknown as vi.Mock;
    placeMock.mockImplementation(async ({ item }) => {
      if (item.id === habitA.id) {
        return { error: "NO_FIT" as const };
      }
      return {
        data: createInstanceRecord({
          id: "inst-habit-b",
          source_id: habitB.id,
          source_type: "HABIT",
          start_utc: "2024-01-02T09:00:00Z",
          end_utc: "2024-01-02T09:30:00Z",
          window_id: "win-office",
          duration_min: 30,
          energy_resolved: "LOW",
        }),
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const { client: supabase } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, supabase);

    const habitBEntry = result.timeline.find(
      (entry) => entry.type === "HABIT" && entry.habit.id === habitB.id
    );
    expect(habitBEntry).toBeDefined();
    expect(habitBEntry?.habit.windowId).toBe("win-office");
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
      const startLocal =
        windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
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
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id
    );
    expect(practiceEntries).toHaveLength(2);
    const earliestOffset = Math.min(
      ...practiceEntries.map(
        (entry) => entry.scheduledDayOffset ?? Number.POSITIVE_INFINITY
      )
    );
    const sameDayEntries = practiceEntries.filter(
      (entry) => entry.scheduledDayOffset === earliestOffset
    );
    expect(sameDayEntries).toHaveLength(2);
    expect(
      practiceEntries.every(
        (entry) =>
          typeof entry.scheduledDayOffset === "number" &&
          entry.scheduledDayOffset < 7
      )
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
      const startLocal =
        windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
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
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id
    );
    expect(practiceEntries.length).toBeGreaterThan(0);
    expect(
      practiceEntries.every(
        (entry) => entry.habit.practiceContextId === "monument-skill"
      )
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
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});
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
        (entry) =>
          entry.type === "HABIT" && entry.instanceId === "inst-practice-future"
      )
    ).toBe(false);
    expect(update).toHaveBeenCalled();
    expect(
      update.mock.calls.some((call) => call?.[0]?.status === "canceled")
    ).toBe(true);
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
      const startLocal =
        windows?.[0]?.availableStartLocal ?? new Date("2024-01-02T09:00:00Z");
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
      (failure) =>
        failure.itemId === practiceHabit.id && failure.reason === "NO_WINDOW"
    );
    expect(failuresForHabit).toHaveLength(0);
    const practiceEntries = result.timeline.filter(
      (entry) => entry.type === "HABIT" && entry.habit.id === practiceHabit.id
    );
    expect(practiceEntries).toHaveLength(1);
    const earliestOffset = Math.min(
      ...practiceEntries.map(
        (entry) => entry.scheduledDayOffset ?? Number.POSITIVE_INFINITY
      )
    );
    const sameDayEntries = practiceEntries.filter(
      (entry) => entry.scheduledDayOffset === earliestOffset
    );
    expect(sameDayEntries).toHaveLength(1);
    expect(
      practiceEntries.every(
        (entry) =>
          typeof entry.scheduledDayOffset === "number" &&
          entry.scheduledDayOffset < 7
      )
    ).toBe(true);
  });

  it("anchors scheduling to the provided user timezone", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-missed",
          source_id: "proj-1",
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    const requestedDates: string[] = [];
    (repo.fetchWindowsForDate as unknown as vi.Mock).mockImplementation(
      async (date: Date) => {
        requestedDates.push(date.toISOString());
        return [
          makeWindow({
            id: "win-evening",
            label: "Evening",
            energy: "LOW",
            start_local: "18:00",
            end_local: "20:00",
            days: [1],
          }),
        ];
      }
    );

    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({
      "proj-1": {
        id: "proj-1",
        name: "Existing",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });

    vi.spyOn(instanceRepo, "rescheduleInstance").mockImplementation(
      async (id, input) => {
        const data = createInstanceRecord({
          id,
          source_id: "proj-1",
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          window_id: input.windowId,
          energy_resolved: input.energyResolved,
          status: "scheduled",
        });
        return {
          data,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }
    );

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        if (item.id === "proj-1") {
          return {
            data: createInstanceRecord({
              id: "inst-placed",
              source_id: "proj-1",
              status: "scheduled",
              start_utc: "2024-01-01T18:00:00Z",
              end_utc: "2024-01-01T19:00:00Z",
              window_id: "win-evening",
            }),
            error: null,
            count: null,
            status: 201,
            statusText: "Created",
          };
        }
        return { error: "NO_FIT" as const };
      }
    );

    const base = schedNow("2024-01-01T12:00:00Z", "America/Los_Angeles");
    const { client: supabase } = createSupabaseMock();

    const result = await scheduleBacklog(userId, base, supabase, {
      timeZone: "America/Los_Angeles",
      baseDate: base,
    });

    expect(result.placed).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(requestedDates).toHaveLength(1);
    expect(requestedDates[0]).toBe("2024-01-01T12:00:00.000Z");

    // Restore the mock to avoid leaking to other tests
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        attemptedProjectIds.push(item.id);
        return { error: "NO_FIT" as const };
      }
    );

    // Restore the mock to avoid leaking to other tests
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        attemptedProjectIds.push(item.id);
        return { error: "NO_FIT" as const };
      }
    );
  });

  it("enforces a final no-overlap invariant after a scheduler run", async () => {
    instances = [
      createInstanceRecord({
        id: "inst-high",
        source_id: "proj-1",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:30:00Z",
        weight_snapshot: 10,
      }),
      createInstanceRecord({
        id: "inst-low",
        source_id: "proj-2",
        start_utc: "2024-01-02T10:00:00Z",
        end_utc: "2024-01-02T11:00:00Z",
        weight_snapshot: 1,
      }),
    ];
    fetchInstancesForRangeSpy.mockImplementation(async () => ({
      data: [...instances],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));

    const { client: supabase, canceledIds } = createSupabaseMock();

    await scheduleBacklog(userId, baseDate, supabase);

    expect(canceledIds).toContain("inst-low");
  });

  it("sorts projects by global_rank, preferred, weight, id in base mode", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-low-rank",
          source_id: "proj-low-rank",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-high-rank",
          source_id: "proj-high-rank",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-null-rank",
          source_id: "proj-null-rank",
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-low-rank": {
        id: "proj-low-rank",
        name: "Low Rank",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 10,
      },
      "proj-high-rank": {
        id: "proj-high-rank",
        name: "High Rank",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 1,
      },
      "proj-null-rank": {
        id: "proj-null-rank",
        name: "Null Rank",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: null,
      },
    });

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

    const callOrder: string[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        callOrder.push(item.id);
        if (item.id === "proj-high-rank") {
          return {
            data: createInstanceRecord({
              id: "inst-high-rank",
              source_id: "proj-high-rank",
              status: "scheduled",
              energy_resolved: "LOW",
            }),
            error: null,
            count: null,
            status: 200,
            statusText: "OK",
          };
        }
        if (item.id === "proj-low-rank") {
          return {
            data: createInstanceRecord({
              id: "inst-low-rank",
              source_id: "proj-low-rank",
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
      }
    );

    const { client: mockClient } = createSupabaseMock();

    const { firstArgs, restore } = captureFirstCompatibleCall();
    try {
      await scheduleBacklog(userId, baseDate, mockClient);

      const trace = replayGateTrace(firstArgs(), baseDate);
      expect(trace.firstGateFailed).toBe("");
      expect(trace.compatibleWindowsCount).toBeGreaterThan(0);
    } finally {
      restore();
    }

    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder[0]).toBe("proj-high-rank"); // global_rank 1 first
    expect(callOrder[1]).toBe("proj-low-rank"); // global_rank 10 second
    // proj-null-rank should be last (null ranks go last)
  });

  it("keeps roadmap-backed critical projects ahead of equal non-roadmap critical projects when goal ranks are fetched canonically", async () => {
    instances = [];

    vi.mocked(repo.fetchGoalsForUser).mockRestore();

    const goalRows = [
      {
        id: "goal-roadmap",
        name: "Roadmap Goal",
        global_rank: 1,
        roadmap_id: "roadmap-1",
        priority_rank: 1,
        monument_id: null,
        emoji: null,
      },
    ];
    const goalsResult = {
      data: goalRows,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
    const goalsQuery = {
      eq: vi.fn(async () => goalsResult),
    };
    const goalsFrom = {
      select: vi.fn(() => goalsQuery),
    };

    const { client: mockClient } = createSupabaseMock();
    const baseFrom = mockClient.from;
    mockClient.from = ((table: string) => {
      if (table === "goals") {
        return goalsFrom;
      }
      return baseFrom(table);
    }) as typeof mockClient.from;

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-a-ad-hoc-critical": {
        id: "proj-a-ad-hoc-critical",
        name: "Ad Hoc Critical",
        priority: "CRITICAL",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        globalRank: null,
      },
      "proj-b-roadmap-critical": {
        id: "proj-b-roadmap-critical",
        name: "Roadmap Critical",
        priority: "CRITICAL",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        goal_id: "goal-roadmap",
        globalRank: null,
      },
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-a-ad-hoc-critical": {
        id: "proj-a-ad-hoc-critical",
        name: "Ad Hoc Critical",
        priority: "CRITICAL",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        globalRank: null,
      },
      "proj-b-roadmap-critical": {
        id: "proj-b-roadmap-critical",
        name: "Roadmap Critical",
        priority: "CRITICAL",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        goal_id: "goal-roadmap",
        globalRank: null,
      },
    });

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

    await scheduleBacklog(userId, baseDate, mockClient);

    expect(attemptedProjectIds[0]).toBe("proj-b-roadmap-critical");
    expect(attemptedProjectIds[1]).toBe("proj-a-ad-hoc-critical");
  });

  it("rejects higher-ranked projects when they conflict with existing projects", async () => {
    const { client } = createSupabaseMock();

    instances = [
      createInstanceRecord({
        id: "inst-low-rank",
        source_id: "proj-low-rank",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:00:00Z",
        window_id: "win-shared",
        weight_snapshot: 10,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-low-rank": {
        id: "proj-low-rank",
        name: "Low Rank Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
        globalRank: 10,
      },
      "proj-high-rank": {
        id: "proj-high-rank",
        name: "High Rank Project",
        priority: "LOW",
        stage: "PLAN",
        energy: "NO",
        duration_min: 60,
        globalRank: 1,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (
      repo.fetchProjectSkillsForProjects as unknown as vi.Mock
    ).mockResolvedValue({});

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Shared Window",
        energy: "NO",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      },
    ]);

    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        // Higher-ranked project should be rejected due to overlap
        return { error: "NO_FIT" as const };
      }
    );

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(result.placed).toHaveLength(0);
    expect(result.failures).toContainEqual({
      itemId: "proj-high-rank",
      reason: "NO_FEASIBLE_SLOT_IN_HORIZON",
    });
  });

  it("sorts projects by global_rank, preferred, weight, id in MONUMENTAL mode", async () => {
    instances = [];

    const backlogResponse: BacklogResponse = {
      data: [
        createInstanceRecord({
          id: "inst-preferred",
          source_id: "proj-preferred",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-not-preferred",
          source_id: "proj-not-preferred",
          status: "missed",
          duration_min: 60,
          energy_resolved: "LOW",
        }),
        createInstanceRecord({
          id: "inst-null-rank",
          source_id: "proj-null-rank",
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

    (
      instanceRepo.fetchBacklogNeedingSchedule as unknown as vi.Mock
    ).mockResolvedValue(backlogResponse);

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-preferred": {
        id: "proj-preferred",
        name: "Preferred",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 5,
      },
      "proj-not-preferred": {
        id: "proj-not-preferred",
        name: "Not Preferred",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 5,
      },
      "proj-null-rank": {
        id: "proj-null-rank",
        name: "Null Rank",
        priority: "LOW",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: null,
      },
    });

    (repo.fetchGoalsForUser as unknown as vi.Mock).mockResolvedValue([
      {
        id: "goal-preferred",
        name: "Preferred Goal",
        weight: 0,
        monumentId: "monument-keep",
      },
      {
        id: "goal-not-preferred",
        name: "Not Preferred Goal",
        weight: 0,
        monumentId: "monument-ignore",
      },
    ]);

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

    const callOrder: string[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async ({ item }) => {
        callOrder.push(item.id);
        if (item.id === "proj-preferred") {
          return {
            data: createInstanceRecord({
              id: "inst-preferred",
              source_id: "proj-preferred",
              status: "scheduled",
              energy_resolved: "LOW",
            }),
            error: null,
            count: null,
            status: 200,
            statusText: "OK",
          };
        }
        if (item.id === "proj-not-preferred") {
          return {
            data: createInstanceRecord({
              id: "inst-not-preferred",
              source_id: "proj-not-preferred",
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
      }
    );

    const { client: mockClient } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, mockClient, {
      mode: { type: "MONUMENTAL", monumentId: "monument-keep" },
    });

    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder[0]).toBe("proj-preferred"); // preferred first (same global_rank)
    expect(callOrder[1]).toBe("proj-not-preferred"); // not preferred second
    // proj-null-rank should be last (null ranks go last)
  });

  it("marks new projects with no compatible windows as missed", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-medium": {
        id: "proj-medium",
        name: "Medium Energy",
        priority: "LOW",
        stage: "PLAN",
        energy: "MEDIUM",
        duration_min: 90, // longer than window
        globalRank: 1,
      },
    });

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-small",
        label: "Small",
        energy: "MEDIUM",
        start_local: "09:00",
        end_local: "10:00", // 60 min
        days: [2],
      },
    ]);

    const { client } = createSupabaseMock();

    const result = await scheduleBacklog(userId, baseDate, client);

    expect(result.placed).toHaveLength(0);
    expect(result.failures).toContainEqual({
      itemId: "proj-medium",
      reason: "NO_FEASIBLE_SLOT_IN_HORIZON",
    });
  });

  it("enforces habit-first scheduling: habit occupies slot before project", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-compete": {
        id: "proj-compete",
        name: "Competing Project",
        priority: "HIGH",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 1,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Shared Window",
        energy: "LOW",
        start_local: "09:00",
        end_local: "11:00",
        days: [2],
      },
    ]);

    const habit: HabitScheduleItem = {
      id: "habit-compete",
      name: "Competing Habit",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
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
        label: "Shared Window",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "11:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const originalPlaceItemInWindows = placement.placeItemInWindows;
    const placeSpy = vi.spyOn(placement, "placeItemInWindows");

    try {
      placeSpy.mockImplementation(async (params) => {
        if (params.item.sourceType === "HABIT") {
          // Habit gets the slot first
          return {
            data: createInstanceRecord({
              id: "inst-habit",
              source_id: habit.id,
              source_type: "HABIT",
              status: "scheduled",
              start_utc: "2024-01-02T09:00:00Z",
              end_utc: "2024-01-02T10:00:00Z",
              duration_min: 60,
              window_id: "win-shared",
              energy_resolved: "LOW",
            }),
            error: null,
            count: null,
            status: 201,
            statusText: "Created",
          };
        } else if (params.item.sourceType === "PROJECT") {
          // Project should see habit as blocker and fail or get different slot
          // For test, let it fail
          return { error: "NO_FIT" as const };
        }
        return { error: "NO_FIT" as const };
      });

      const { client: supabase } = createSupabaseMock();
      const result = await scheduleBacklog(userId, baseDate, supabase);

      // Habit should be placed
      const habitInstances = result.placed.filter(
        (inst) => inst.source_type === "HABIT"
      );
      expect(habitInstances).toHaveLength(1);
      expect(habitInstances[0]?.start_utc).toBe("2024-01-02T09:00:00Z");

      // Project should fail or be placed elsewhere
      const projectInstances = result.placed.filter(
        (inst) => inst.source_type === "PROJECT"
      );
      // In this test, it fails
      expect(projectInstances).toHaveLength(0);
      expect(result.failures).toContainEqual({
        itemId: "proj-compete",
        reason: "NO_FEASIBLE_SLOT_IN_HORIZON",
      });
    } finally {
      placeSpy.mockRestore();
    }
  });

  it("cancels non-locked PROJECT instances at HABIT_PASS_START to enforce habit-first scheduling", async () => {
    const { client, update } = createSupabaseMock();

    // Seed a non-locked scheduled PROJECT instance occupying an early slot today
    instances = [
      createInstanceRecord({
        id: "inst-non-locked-proj",
        source_id: "proj-non-locked",
        source_type: "PROJECT",
        status: "scheduled",
        start_utc: "2024-01-02T09:00:00Z",
        end_utc: "2024-01-02T10:00:00Z",
        window_id: "win-shared",
        duration_min: 60,
        energy_resolved: "LOW",
        weight_snapshot: 10,
        locked: false,
      }),
      // Also seed a locked PROJECT instance that should remain
      createInstanceRecord({
        id: "inst-locked-proj",
        source_id: "proj-locked",
        source_type: "PROJECT",
        status: "scheduled",
        start_utc: "2024-01-02T10:00:00Z",
        end_utc: "2024-01-02T11:00:00Z",
        window_id: "win-shared",
        duration_min: 60,
        energy_resolved: "LOW",
        weight_snapshot: 10,
        locked: true,
      }),
    ];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-locked": {
        id: "proj-locked",
        name: "Locked Project",
        priority: "HIGH",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
        globalRank: 1,
      },
    });

    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      {
        id: "win-shared",
        label: "Shared Window",
        energy: "LOW",
        start_local: "09:00",
        end_local: "12:00",
        days: [2],
      },
    ]);

    // Seed a due HABIT that fits the same slot
    const habit: HabitScheduleItem = {
      id: "habit-compete",
      name: "Competing Habit",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      habitType: "HABIT",
      windowId: null,
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
      window: null,
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placeSpy = placement.placeItemInWindows as unknown as vi.Mock;
    placeSpy.mockImplementation(async (params) => {
      if (params.item.sourceType === "HABIT") {
        // Habit should take the slot that was occupied by the non-locked project
        return {
          data: createInstanceRecord({
            id: "inst-habit",
            source_id: habit.id,
            source_type: "HABIT",
            start_utc: "2024-01-02T09:00:00Z",
            end_utc: "2024-01-02T10:00:00Z",
            duration_min: 60,
            window_id: "win-shared",
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        };
      } else if (params.item.sourceType === "PROJECT") {
        // Project should be able to place in the later slot (after habit and locked project)
        return {
          data: createInstanceRecord({
            id: "inst-locked-proj-placed",
            source_id: params.item.id,
            source_type: "PROJECT",
            start_utc: "2024-01-02T11:00:00Z",
            end_utc: "2024-01-02T12:00:00Z",
            duration_min: 60,
            window_id: "win-shared",
            energy_resolved: "LOW",
          }),
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        };
      }
      return { error: "NO_FIT" as const };
    });

    const result = await scheduleBacklog(userId, baseDate, client);

    // Verify non-locked PROJECT instance was canceled
    expect(update).toHaveBeenCalled();
    expect(
      update.mock.calls.some((call) => call?.[0]?.status === "canceled")
    ).toBe(true);
    expect(
      update.mock.calls.find((call) => call?.[0]?.status === "canceled")?.[1]
        ?.eq?.mock.calls?.[0]?.[1]
    ).toBe("inst-non-locked-proj");

    // Verify HABIT took the slot
    const habitInstances = result.placed.filter(
      (inst) => inst.source_type === "HABIT"
    );
    expect(habitInstances).toHaveLength(1);
    expect(habitInstances[0]?.start_utc).toBe("2024-01-02T09:00:00Z");

    // Verify locked PROJECT was rescheduled (not canceled)
    const projectInstances = result.placed.filter(
      (inst) => inst.source_type === "PROJECT"
    );
    expect(projectInstances).toHaveLength(1);
    expect(projectInstances[0]?.source_id).toBe("proj-locked");
  });

  it("reschedules projects even when windows restrict habit types", async () => {
    instances = [];

    (repo.fetchProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-daytype": {
        id: "proj-daytype",
        name: "DayType Project",
        priority: "HIGH",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchAllProjectsMap as unknown as vi.Mock).mockResolvedValue({
      "proj-daytype": {
        id: "proj-daytype",
        name: "DayType Project",
        priority: "HIGH",
        stage: "PLAN",
        energy: "LOW",
        duration_min: 60,
      },
    });
    (repo.fetchReadyTasks as unknown as vi.Mock).mockResolvedValue([]);
    (repo.fetchProjectSkillsForProjects as unknown as vi.Mock).mockResolvedValue(
      {}
    );
    (repo.fetchGoalsForUser as unknown as vi.Mock).mockResolvedValue([]);

    (repo.fetchWindowsForDate as unknown as vi.Mock).mockResolvedValue([
      makeWindow({
        id: "win-habit-only",
        label: "Habit Only",
        energy: "LOW",
        start_local: "09:00",
        end_local: "10:00",
        days: [2],
        allowAllHabitTypes: false,
        allowedHabitTypes: ["HABIT"],
      }),
    ]);

    const habit: HabitScheduleItem = {
      id: "habit-daytype",
      name: "DayType Habit",
      durationMinutes: 60,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      lastCompletedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      habitType: "HABIT",
      windowId: "win-habit-only",
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
        id: "win-habit-only",
        label: "Habit Only",
        energy: "LOW",
        startLocal: "09:00",
        endLocal: "10:00",
        days: [2],
        locationContextId: null,
        locationContextValue: null,
        locationContextName: null,
      },
    };

    fetchHabitsForScheduleSpy.mockResolvedValue([habit]);

    const placementCalls: ScheduleInstance[] = [];
    (placement.placeItemInWindows as unknown as vi.Mock).mockImplementation(
      async (params) => {
        const isHabit = params.item.sourceType === "HABIT";
        const start = new Date(
          isHabit ? "2024-01-02T09:00:00Z" : "2024-01-02T10:00:00Z"
        );
        const end = new Date(
          start.getTime() + (params.item.duration_min ?? 0) * 60_000
        );
        const instance = createInstanceRecord({
          id: isHabit
            ? "inst-habit-daytype"
            : "inst-project-daytype",
          source_id: params.item.id,
          source_type: params.item.sourceType,
          status: "scheduled",
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          duration_min: params.item.duration_min ?? 60,
          window_id: "win-habit-only",
          energy_resolved:
            typeof params.item.energy === "string"
              ? params.item.energy
              : (params.item as any).resolvedEnergy ?? "LOW",
        });
        placementCalls.push(instance);
        return {
          data: instance,
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        } as Awaited<ReturnType<typeof placement.placeItemInWindows>>;
      }
    );

    const { client } = createSupabaseMock();
    const result = await scheduleBacklog(userId, baseDate, client);

    expect(result.failures).toHaveLength(0);
    expect(result.placed.some((inst) => inst.source_type === "PROJECT")).toBe(
      true
    );
    expect(result.placed.some((inst) => inst.source_type === "HABIT")).toBe(true);
    expect(placementCalls).toHaveLength(2);
  });
});

describe("fetchCompatibleWindowsForItem", () => {
  it("covers the after-midnight slice as part of the prior 4am day", async () => {
    const tz = "America/Chicago";
    const dayStart = startOfDayInTimeZone(
      new Date("2026-01-26T12:00:00Z"),
      tz
    );
    const testUserId = "user-midnight";
    const earlyWindow: repo.WindowLite = {
      id: "win-early",
      label: "After-Midnight",
      energy: "LOW",
      start_local: "01:00",
      end_local: "02:00",
      days: [1],
      window_kind: "DEFAULT",
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
      allowAllHabitTypes: true,
      allowAllSkills: true,
      allowAllMonuments: true,
    };
    const { client } = createSupabaseMock();
    const compatible = await fetchCompatibleWindowsForItem(
      client,
      dayStart,
      {
        energy: "LOW",
        duration_min: 30,
      },
      tz,
      {
        userId: testUserId,
        allowedWindowKinds: ["DEFAULT"],
        preloadedWindows: [earlyWindow],
      }
    );
    expect(compatible).toHaveLength(1);
    const candidate = compatible[0];
    const timeParts = getDateTimeParts(candidate.startLocal, tz);
    expect(timeParts.hour).toBe(1);
    const candidateDayStart = startOfDayInTimeZone(candidate.startLocal, tz);
    const expectedDayStart = addDaysInTimeZone(dayStart, -1, tz);
    expect(candidateDayStart.getTime()).toBe(expectedDayStart.getTime());
  });

  it("accepts day-type focus blocks when only DEFAULT windows are allowed", async () => {
    const dayStart = startOfDayInTimeZone(
      new Date("2026-01-30T00:00:00Z"),
      "UTC"
    );
    const chillWindow: repo.WindowLite = {
      id: "win-daytype-chill",
      label: "Chill",
      energy: "LOW",
      start_local: "01:00",
      end_local: "02:00",
      days: [4],
      window_kind: "FOCUS" as unknown as repo.WindowKind,
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
      allowAllHabitTypes: true,
      allowAllSkills: true,
      allowAllMonuments: true,
      dayTypeTimeBlockId: "dttb-chill",
    };
    (chillWindow as any).block_type = "FOCUS";

    expect(
      placement.getWindowsForDateFromAll([chillWindow], dayStart, "UTC")
    ).toHaveLength(1);

    const { client } = createSupabaseMock();
    const compatible = await fetchCompatibleWindowsForItem(
      client,
      dayStart,
      {
        energy: "LOW",
        duration_min: 30,
      },
      "UTC",
      {
        userId: "proj-daytype",
        allowedWindowKinds: ["DEFAULT"],
        preloadedWindows: [chillWindow],
      }
    );

    expect(compatible).toHaveLength(1);
    expect(compatible[0].dayTypeTimeBlockId).toBe("dttb-chill");
  });

  it("blocks projects without a location from location-locked windows and allows matching ones", async () => {
    const dayStart = startOfDayInTimeZone(
      new Date("2026-01-05T00:00:00Z"),
      "UTC"
    );
    const locationWindow: repo.WindowLite = {
      id: "win-location-work",
      label: "Work Block",
      energy: "LOW",
      start_local: "09:00",
      end_local: "10:00",
      days: [0, 1, 2, 3, 4, 5, 6],
      window_kind: "DEFAULT",
      location_context_id: "loc-work",
      location_context_value: "WORK",
      location_context_name: "Work",
      allowAllHabitTypes: true,
      allowAllSkills: true,
      allowAllMonuments: true,
    };
    const { client } = createSupabaseMock();

    const withoutLocation = await fetchCompatibleWindowsForItem(
      client,
      dayStart,
      {
        energy: "LOW",
        duration_min: 30,
      },
      "UTC",
      {
        userId: "proj-locationless",
        allowedWindowKinds: ["DEFAULT"],
        preloadedWindows: [locationWindow],
      }
    );
    expect(withoutLocation).toHaveLength(0);

    const withMatchingLocation = await fetchCompatibleWindowsForItem(
      client,
      dayStart,
      {
        energy: "LOW",
        duration_min: 30,
      },
      "UTC",
      {
        userId: "proj-location-match",
        allowedWindowKinds: ["DEFAULT"],
        preloadedWindows: [locationWindow],
        locationContextId: "loc-work",
        locationContextValue: "WORK",
        hasExplicitLocationContext: true,
      }
    );
    expect(withMatchingLocation).toHaveLength(1);
  });
});
