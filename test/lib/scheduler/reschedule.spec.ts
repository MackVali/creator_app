import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scheduleBacklog } from "../../../src/lib/scheduler/reschedule";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import * as repo from "../../../src/lib/scheduler/repo";
import * as placement from "../../../src/lib/scheduler/placement";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";

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

  let instances: ScheduleInstance[];
  let fetchInstancesForRangeSpy: ReturnType<typeof vi.spyOn>;
  let attemptedProjectIds: string[];

  const createSupabaseMock = (timezone: string | null = null) => {
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
    const maybeSingle = vi.fn(async () => ({
      data: { timezone },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));
    const profileEq = vi.fn(() => ({ maybeSingle }));
    const profileSelect = vi.fn(() => ({ eq: profileEq }));
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: profileSelect };
      }
      return { update };
    });
    const client = { from } as unknown as ScheduleBacklogClient;
    return { client, update, maybeSingle };
  };

  beforeEach(() => {
    instances = [
      {
        id: "inst-existing",
        user_id: userId,
        source_id: "proj-1",
        source_type: "PROJECT",
        status: "scheduled",
        start_utc: "2024-01-02T15:00:00Z",
        end_utc: "2024-01-02T16:00:00Z",
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
      } as unknown as ScheduleInstance,
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
        energy: "NO",
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

  it("skips already scheduled projects when falling back to enqueue all", async () => {
    const { client: mockClient } = createSupabaseMock();
    await scheduleBacklog(userId, baseDate, mockClient);

    expect(fetchInstancesForRangeSpy).toHaveBeenCalledTimes(2);

    const scheduledInstances = instances.filter((inst) => inst.status === "scheduled");
    expect(scheduledInstances).toHaveLength(1);
    expect(scheduledInstances[0].source_id).toBe("proj-1");

    const scheduledProjectIds = new Set(attemptedProjectIds);
    expect(scheduledProjectIds.has("proj-1")).toBe(false);
    expect(scheduledProjectIds.has("proj-2")).toBe(true);
  });

  it("fetches windows using the user's timezone", async () => {
    const tz = "America/New_York";
    const { client: supabase } = createSupabaseMock(tz);

    await scheduleBacklog(userId, baseDate, supabase);

    const fetchCalls = (repo.fetchWindowsForDate as unknown as vi.Mock).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const hasTimezone = fetchCalls.some(([, , options]) => options?.timeZone === tz);
    expect(hasTimezone).toBe(true);
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

    let fetchCall = 0;
    fetchInstancesForRangeSpy.mockImplementation(async () => {
      fetchCall += 1;
      if (fetchCall === 1) {
        return {
          data: [],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        } satisfies InstancesResponse;
      }
      return {
        data: [existing],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } satisfies InstancesResponse;
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
    expect(fetchCall).toBeGreaterThanOrEqual(2);
    expect(updateMock.mock.calls.some((call) => call?.[0]?.status === "canceled")).toBe(
      false,
    );
  });
});
