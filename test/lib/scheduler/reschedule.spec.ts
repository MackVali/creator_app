import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scheduleBacklog } from "../../../src/lib/scheduler/reschedule";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import * as repo from "../../../src/lib/scheduler/repo";
import * as placement from "../../../src/lib/scheduler/placement";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";
import type { ProjectLite } from "../../../src/lib/scheduler/weight";

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

  const createSupabaseMock = () => {
    let lastEqValue: string | null = null;
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
    const from = vi.fn(() => ({ update }));
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
    expect(ignoreSets.length).toBeGreaterThan(0);
    for (const ignoreSet of ignoreSets) {
      expect(ignoreSet).toBeDefined();
      expect(ignoreSet?.has("proj-alpha")).toBe(true);
      expect(ignoreSet?.has("proj-beta")).toBe(true);
    }
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
