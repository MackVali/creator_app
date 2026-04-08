import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";

let persistManualPlacementCascade: typeof import("../../../src/lib/scheduler/manualPlacementCascade")["persistManualPlacementCascade"];
let instanceRepo: typeof import("../../../src/lib/scheduler/instanceRepo");
let repo: typeof import("../../../src/lib/scheduler/repo");
let reschedule: typeof import("../../../src/lib/scheduler/reschedule");
let placement: typeof import("../../../src/lib/scheduler/placement");

vi.mock("../../../src/lib/scheduler/instanceRepo", () => ({
  fetchInstancesForRange: vi.fn(),
}));

vi.mock("../../../src/lib/scheduler/repo", () => ({
  fetchAllProjectsMap: vi.fn(),
  fetchGoalsForUser: vi.fn(),
  fetchProjectSkillsForProjects: vi.fn(),
  fetchReadyTasks: vi.fn(),
}));

vi.mock("../../../src/lib/scheduler/reschedule", () => ({
  fetchCompatibleWindowsForItem: vi.fn(),
}));

vi.mock("../../../src/lib/scheduler/placement", () => ({
  placeItemInWindows: vi.fn(),
}));

const tz = "UTC";
const userId = "user-1";

function makeInstance(overrides: Partial<ScheduleInstance>): ScheduleInstance {
  return {
    id: overrides.id ?? "inst-default",
    user_id: userId,
    source_id: overrides.source_id ?? "project-default",
    source_type: overrides.source_type ?? "PROJECT",
    status: overrides.status ?? "scheduled",
    start_utc: overrides.start_utc ?? "2024-01-02T00:00:00.000Z",
    end_utc: overrides.end_utc ?? "2024-01-02T01:00:00.000Z",
    duration_min: overrides.duration_min ?? 60,
    window_id: overrides.window_id ?? "window-default",
    weight_snapshot: overrides.weight_snapshot ?? 0,
    energy_resolved: overrides.energy_resolved ?? "NO",
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
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
    completed_at: null,
    created_by: null,
    updated_by: null,
    source_duration_min: null,
    energy_snapshot: null,
    energy_resolved_snapshot: null,
    locked: false,
    practice_context_monument_id: null,
    metadata: null,
    canceled_reason: null,
    missed_reason: null,
    locked_reason: null,
    event_name: null,
    source_created_at: null,
    source_updated_at: null,
    recurrence_rule: null,
    recurrence_end_utc: null,
    recurrence_tz: null,
    source_kind: null,
    calendar_event_id: null,
    calendar_event_id_external: null,
    overlay_window_id: null,
  } as ScheduleInstance;
}

function makeCompatibleWindow(
  id: string,
  startIso: string,
  endIso: string
) {
  const startLocal = new Date(startIso);
  const endLocal = new Date(endIso);
  return {
    id,
    key: id,
    startLocal,
    endLocal,
    availableStartLocal: startLocal,
    dayTypeTimeBlockId: null,
    timeBlockId: null,
    energy: "LOW",
    gateTrace: {
      allowedWindowKinds: true,
      energy: true,
      location: true,
      nowConstraint: true,
      daylightNight: true,
      availabilityBounds: true,
      durationFit: true,
    } as unknown as never,
  };
}

describe("persistManualPlacementCascade", () => {
  let instances: ScheduleInstance[];
  let client: {
    from: ReturnType<typeof vi.fn>;
  };
  let updateMock: ReturnType<typeof vi.fn>;
  const placementCalls: Array<{
    itemId: string;
    day: string;
    notBefore: string | null;
  }> = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    placementCalls.length = 0;
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
    };
    updateMock = vi.fn().mockReturnValue(updateChain);
    client = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    };
    instances = [
      makeInstance({
        id: "pivot",
        source_id: "project-pivot",
        start_utc: "2024-01-02T14:00:00.000Z",
        end_utc: "2024-01-02T15:00:00.000Z",
      }),
      makeInstance({
        id: "project-a-inst",
        source_id: "project-a",
        start_utc: "2024-01-02T14:30:00.000Z",
        end_utc: "2024-01-02T15:30:00.000Z",
      }),
      makeInstance({
        id: "project-b-inst",
        source_id: "project-b",
        start_utc: "2024-01-02T15:30:00.000Z",
        end_utc: "2024-01-02T16:30:00.000Z",
      }),
    ];

    ({ persistManualPlacementCascade } = await import(
      "../../../src/lib/scheduler/manualPlacementCascade"
    ));
    instanceRepo = await import("../../../src/lib/scheduler/instanceRepo");
    repo = await import("../../../src/lib/scheduler/repo");
    reschedule = await import("../../../src/lib/scheduler/reschedule");
    placement = await import("../../../src/lib/scheduler/placement");

    vi.mocked(instanceRepo.fetchInstancesForRange).mockImplementation(
      async (_userId, _startUtc, _endUtc) => ({
        data: instances,
        error: null,
        count: instances.length,
        status: 200,
        statusText: "OK",
      })
    );

    vi.mocked(repo.fetchAllProjectsMap).mockResolvedValue({
      "project-pivot": {
        id: "project-pivot",
        name: "Pivot",
        priority: "NO",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        effective_duration_min: null,
        goal_id: null,
        due_date: null,
        globalRank: 1,
      },
      "project-a": {
        id: "project-a",
        name: "Project A",
        priority: "NO",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        effective_duration_min: null,
        goal_id: null,
        due_date: null,
        globalRank: 2,
      },
      "project-b": {
        id: "project-b",
        name: "Project B",
        priority: "NO",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        effective_duration_min: null,
        goal_id: null,
        due_date: null,
        globalRank: 3,
      },
    });
    vi.mocked(repo.fetchReadyTasks).mockResolvedValue([]);
    vi.mocked(repo.fetchGoalsForUser).mockResolvedValue([]);
    vi.mocked(repo.fetchProjectSkillsForProjects).mockResolvedValue({});

    vi.mocked(reschedule.fetchCompatibleWindowsForItem).mockImplementation(
      async (_client, date) => {
        const day = date.toISOString().slice(0, 10);
        if (day === "2024-01-02") {
          return {
            windows: [
              {
                id: "win-day0",
                key: "win-day0",
                startLocal: new Date("2024-01-02T15:00:00.000Z"),
                endLocal: new Date("2024-01-02T16:00:00.000Z"),
                availableStartLocal: new Date("2024-01-02T15:00:00.000Z"),
                dayTypeTimeBlockId: null,
                timeBlockId: null,
                energy: "LOW",
                gateTrace: {
                  allowedWindowKinds: true,
                  energy: true,
                  location: true,
                  nowConstraint: true,
                  daylightNight: true,
                  availabilityBounds: true,
                  durationFit: true,
                } as unknown as never,
              },
            ],
          };
        }
        if (day === "2024-01-03") {
          return {
            windows: [
              {
                id: "win-day1",
                key: "win-day1",
                startLocal: new Date("2024-01-03T09:00:00.000Z"),
                endLocal: new Date("2024-01-03T10:00:00.000Z"),
                availableStartLocal: new Date("2024-01-03T09:00:00.000Z"),
                dayTypeTimeBlockId: null,
                timeBlockId: null,
                energy: "LOW",
                gateTrace: {
                  allowedWindowKinds: true,
                  energy: true,
                  location: true,
                  nowConstraint: true,
                  daylightNight: true,
                  availabilityBounds: true,
                  durationFit: true,
                } as unknown as never,
              },
            ],
          };
        }
        if (day === "2024-01-04") {
          return {
            windows: [
              {
                id: "win-day2",
                key: "win-day2",
                startLocal: new Date("2024-01-04T09:00:00.000Z"),
                endLocal: new Date("2024-01-04T10:00:00.000Z"),
                availableStartLocal: new Date("2024-01-04T09:00:00.000Z"),
                dayTypeTimeBlockId: null,
                timeBlockId: null,
                energy: "LOW",
                gateTrace: {
                  allowedWindowKinds: true,
                  energy: true,
                  location: true,
                  nowConstraint: true,
                  daylightNight: true,
                  availabilityBounds: true,
                  durationFit: true,
                } as unknown as never,
              },
            ],
          };
        }
        return { windows: [] };
      }
    );

    vi.mocked(placement.placeItemInWindows).mockImplementation(async (params) => {
      const day = params.date.toISOString().slice(0, 10);
      placementCalls.push({
        itemId: params.item.id,
        day,
        notBefore: params.notBefore?.toISOString() ?? null,
      });

      if (params.item.id === "project-a" && day === "2024-01-02") {
        const nextStart = new Date("2024-01-02T15:00:00.000Z");
        const nextEnd = new Date("2024-01-02T16:00:00.000Z");
        const target = instances.find((entry) => entry.id === "project-a-inst");
        if (target) {
          target.start_utc = nextStart.toISOString();
          target.end_utc = nextEnd.toISOString();
        }
        return {
          data: target ?? null,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }

      if (params.item.id === "project-b" && day === "2024-01-02") {
        return {
          error: "NO_FIT",
          maxGapMs: null,
        };
      }

      if (params.item.id === "project-b" && day === "2024-01-03") {
        return {
          error: "NO_FIT",
          maxGapMs: null,
        };
      }

      if (params.item.id === "project-b" && day === "2024-01-04") {
        const nextStart = new Date("2024-01-04T09:00:00.000Z");
        const nextEnd = new Date("2024-01-04T10:00:00.000Z");
        const target = instances.find((entry) => entry.id === "project-b-inst");
        if (target) {
          target.start_utc = nextStart.toISOString();
          target.end_utc = nextEnd.toISOString();
        }
        return {
          data: target ?? null,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        };
      }

      return {
        error: "NO_FIT",
        maxGapMs: null,
      };
    });
  });

  it("keeps manual placement cascade bounded to the same day and next day", async () => {
    const result = await persistManualPlacementCascade({
      userId,
      pivotId: "pivot",
      pivotStart: "2024-01-02T14:00:00.000Z",
      pivotEnd: "2024-01-02T15:00:00.000Z",
      timeZone: tz,
      client: client as never,
    });

    expect(result.warnings).toEqual([
      {
        instanceId: "project-b-inst",
        projectId: "project-b",
        error: "NO_FIT",
      },
    ]);
    expect(placementCalls).toEqual([
      {
        itemId: "project-a",
        day: "2024-01-02",
        notBefore: "2024-01-02T15:00:00.000Z",
      },
      {
        itemId: "project-b",
        day: "2024-01-02",
        notBefore: "2024-01-02T16:00:00.000Z",
      },
      {
        itemId: "project-b",
        day: "2024-01-03",
        notBefore: "2024-01-02T16:00:00.000Z",
      },
    ]);

    expect(reschedule.fetchCompatibleWindowsForItem).toHaveBeenCalledTimes(5);
    expect(
      vi.mocked(reschedule.fetchCompatibleWindowsForItem).mock.calls.map(
        ([, date]) => date.toISOString().slice(0, 10)
      )
    ).toEqual([
      "2024-01-02",
      "2024-01-03",
      "2024-01-02",
      "2024-01-02",
      "2024-01-03",
    ]);

    expect(placementCalls.some((call) => call.day >= "2024-01-04")).toBe(
      false
    );
    expect(client.from).toHaveBeenCalledWith("schedule_instances");
  });

  it("persists a displaced project immediately after a successful cascade placement", async () => {
    const result = await persistManualPlacementCascade({
      userId,
      pivotId: "pivot",
      pivotStart: "2024-01-02T14:00:00.000Z",
      pivotEnd: "2024-01-02T15:00:00.000Z",
      timeZone: tz,
      client: client as never,
    });

    expect(result.warnings).toEqual([
      {
        instanceId: "project-b-inst",
        projectId: "project-b",
        error: "NO_FIT",
      },
    ]);
    expect(client.from).toHaveBeenCalledWith("schedule_instances");
    expect(updateMock).toHaveBeenCalledWith({
      start_utc: "2024-01-02T15:00:00.000Z",
      end_utc: "2024-01-02T16:00:00.000Z",
      locked: true,
    });
  });

  it("does not pull downstream instances that miss the pivot legal region", async () => {
    instances = [
      makeInstance({
        id: "pivot",
        source_id: "project-pivot",
        start_utc: "2024-01-02T14:00:00.000Z",
        end_utc: "2024-01-02T15:00:00.000Z",
      }),
      makeInstance({
        id: "project-a-inst",
        source_id: "project-a",
        start_utc: "2024-01-02T14:30:00.000Z",
        end_utc: "2024-01-02T15:30:00.000Z",
      }),
      makeInstance({
        id: "project-b-inst",
        source_id: "project-b",
        start_utc: "2024-01-03T09:00:00.000Z",
        end_utc: "2024-01-03T10:00:00.000Z",
      }),
    ];

    let callIndex = 0;
    vi.mocked(reschedule.fetchCompatibleWindowsForItem).mockImplementation(
      async (_client, date) => {
        const day = date.toISOString().slice(0, 10);
        callIndex += 1;

        if (callIndex === 1 && day === "2024-01-02") {
          return {
            windows: [makeCompatibleWindow("win-pivot", "2024-01-02T15:00:00.000Z", "2024-01-02T16:00:00.000Z")],
          };
        }
        if (callIndex === 2 && day === "2024-01-03") {
          return { windows: [] };
        }
        if (callIndex === 3 && day === "2024-01-02") {
          return { windows: [] };
        }
        if (callIndex === 4 && day === "2024-01-03") {
          return { windows: [] };
        }

        return {
          windows: [makeCompatibleWindow("win-a", "2024-01-02T15:00:00.000Z", "2024-01-02T16:00:00.000Z")],
        };
      }
    );

    const result = await persistManualPlacementCascade({
      userId,
      pivotId: "pivot",
      pivotStart: "2024-01-02T14:00:00.000Z",
      pivotEnd: "2024-01-02T15:00:00.000Z",
      timeZone: tz,
      client: client as never,
    });

    expect(result.warnings).toEqual([]);
    expect(placementCalls).toEqual([
      {
        itemId: "project-a",
        day: "2024-01-02",
        notBefore: "2024-01-02T15:00:00.000Z",
      },
    ]);
    expect(
      placementCalls.some((call) => call.itemId === "project-b")
    ).toBe(false);
  });

  it("only keeps directly overlapping instances when the pivot project context is missing", async () => {
    vi.mocked(repo.fetchAllProjectsMap).mockResolvedValue({
      "project-a": {
        id: "project-a",
        name: "Project A",
        priority: "NO",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        effective_duration_min: null,
        goal_id: null,
        due_date: null,
        globalRank: 2,
      },
      "project-b": {
        id: "project-b",
        name: "Project B",
        priority: "NO",
        stage: "BUILD",
        energy: "LOW",
        duration_min: 60,
        effective_duration_min: null,
        goal_id: null,
        due_date: null,
        globalRank: 3,
      },
    });

    const result = await persistManualPlacementCascade({
      userId,
      pivotId: "pivot",
      pivotStart: "2024-01-02T14:00:00.000Z",
      pivotEnd: "2024-01-02T15:00:00.000Z",
      timeZone: tz,
      client: client as never,
    });

    expect(result.warnings).toEqual([]);
    expect(placementCalls).toEqual([
      {
        itemId: "project-a",
        day: "2024-01-02",
        notBefore: "2024-01-02T15:00:00.000Z",
      },
    ]);
    expect(
      placementCalls.some((call) => call.itemId === "project-b")
    ).toBe(false);
  });
});
