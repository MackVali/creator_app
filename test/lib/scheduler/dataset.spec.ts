import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildScheduleEventDataset } from "../../../src/lib/scheduler/dataset";
import * as repo from "../../../src/lib/scheduler/repo";
import * as habits from "../../../src/lib/scheduler/habits";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";

type Client = SupabaseClient<Database>;

const createSupabaseMock = (options?: {
  syncPairings?: Array<{
    sync_instance_id?: string | null;
    partner_instance_ids?: string[] | null;
  }>;
}) => {
  const mockGoals: Array<{ id: string; weight?: number | null }> = [];
  const syncPairings = options?.syncPairings ?? [];
  const skillsResponse = Promise.resolve({
    data: [],
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  });
  const monumentsResponse = Promise.resolve({
    data: [],
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  });

  const withOrder = (response: Promise<unknown>) => ({
    order: () => response,
  });

  return {
    from(table: string) {
      if (table === "skills") {
        return {
          select: () => ({
            eq: () => withOrder(skillsResponse),
          }),
        };
      }
      if (table === "monuments") {
        return {
          select: () => ({
            eq: () => withOrder(monumentsResponse),
          }),
        };
      }
      if (table === "goals") {
        return {
          select: () => ({
            eq: () => ({
              data: mockGoals,
              error: null,
            }),
          }),
        };
      }
      if (table === "priority") {
        return {
          select: () => ({
            data: [],
            error: null,
          }),
        };
      }
      if (table === "energy") {
        return {
          select: () => ({
            data: [],
            error: null,
          }),
        };
      }
      if (table === "schedule_sync_pairings") {
        return {
          select: () => ({
            eq: () => ({
              in: (_field: string, ids: string[]) => ({
                data: syncPairings.filter((row) =>
                  ids?.includes(row.sync_instance_id ?? "")
                ),
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as Client;
};

const buildInstance = (
  overrides: Partial<ScheduleInstance>
): ScheduleInstance => ({
  id: "inst-base",
  user_id: "user-1",
  source_id: "proj-1",
  source_type: "PROJECT",
  status: "scheduled",
  start_utc: "2024-01-04T09:00:00Z",
  end_utc: "2024-01-04T10:00:00Z",
  duration_min: 60,
  window_id: null,
  weight_snapshot: null,
  energy_resolved: "LOW",
  created_at: "",
  updated_at: "",
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
});

describe("buildScheduleEventDataset", () => {
  const userId = "user-1";
  const baseDate = new Date("2024-01-04T12:00:00Z");
  let client: Client;
  let habitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = createSupabaseMock();
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([]);
    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    habitSpy = vi.spyOn(habits, "fetchHabitsForSchedule").mockResolvedValue(
      []
    );
    vi.spyOn(repo, "fetchWindowsForDate").mockResolvedValue([]);
    vi.spyOn(instanceRepo, "fetchScheduledProjectIds").mockResolvedValue([]);
  });

  it("retains only the last three days of completed instances and drops future completions", async () => {
    const completedYesterday: ScheduleInstance = {
      id: "inst-yesterday",
      user_id: userId,
      source_id: "proj-1",
      source_type: "PROJECT",
      status: "completed",
      start_utc: "2024-01-03T09:00:00Z",
      end_utc: "2024-01-03T10:00:00Z",
      duration_min: 60,
      window_id: "win-1",
      weight_snapshot: null,
      energy_resolved: "LOW",
      created_at: "",
      updated_at: "",
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
      completed_at: "2024-01-03T10:00:00Z",
      created_by: null,
      updated_by: null,
      source_duration_min: null,
      energy_snapshot: null,
      energy_resolved_snapshot: null,
      metadata: null,
    };

    const completedOld = {
      ...completedYesterday,
      id: "inst-old",
      start_utc: "2023-12-25T09:00:00Z",
      end_utc: "2023-12-25T10:00:00Z",
      completed_at: "2023-12-25T10:00:00Z",
    };

    const completedFuture = {
      ...completedYesterday,
      id: "inst-future",
      start_utc: "2024-01-06T09:00:00Z",
      end_utc: "2024-01-06T10:00:00Z",
      completed_at: "2024-01-04T08:00:00Z",
    };

    const scheduledFuture = {
      ...completedYesterday,
      id: "inst-scheduled",
      status: "scheduled",
      start_utc: "2024-01-05T11:00:00Z",
      end_utc: "2024-01-05T12:00:00Z",
    };
    const scheduledToday = {
      ...completedYesterday,
      id: "inst-today",
      status: "scheduled",
      start_utc: "2024-01-04T09:00:00Z",
      end_utc: "2024-01-04T10:00:00Z",
    };

    vi.spyOn(instanceRepo, "fetchInstancesForRange").mockResolvedValue({
      data: [
        completedYesterday,
        completedOld,
        completedFuture,
        scheduledFuture,
        scheduledToday,
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });

    const dataset = await buildScheduleEventDataset({
      userId,
      client,
      baseDate,
      timeZone: "UTC",
      lookaheadDays: 7,
    });

    expect(dataset.instances.map(inst => inst.id)).toEqual([
      "inst-yesterday",
      "inst-future",
      "inst-scheduled",
      "inst-today",
    ]);
    expect(dataset.rangeStartUTC).toBe("2024-01-01T04:00:00.000Z");
    expect(dataset.rangeEndUTC).toBe("2024-01-11T04:00:00.000Z");
  });

  it("keeps past completed HABIT instances even without end/duration and with sync pairings", async () => {
    client = createSupabaseMock({
      syncPairings: [
        {
          sync_instance_id: "habit-sync",
          partner_instance_ids: ["partner-1"],
        },
      ],
    });

    const habitYesterday = buildInstance({
      id: "habit-yesterday",
      source_type: "HABIT",
      source_id: "habit-1",
      status: "completed",
      start_utc: "2024-01-03T07:00:00Z",
      end_utc: "2024-01-03T07:15:00Z",
      duration_min: 15,
      completed_at: "2024-01-03T07:10:00Z",
    });
    const habitNoEnd = buildInstance({
      id: "habit-no-end",
      source_type: "HABIT",
      source_id: "habit-2",
      status: "completed",
      start_utc: "2024-01-03T10:00:00Z",
      end_utc: null,
      duration_min: null,
      completed_at: "2024-01-03T10:05:00Z",
    });
    const habitSyncCompleted = buildInstance({
      id: "habit-sync",
      source_type: "HABIT",
      source_id: "habit-sync",
      status: "completed",
      start_utc: "2024-01-03T12:00:00Z",
      end_utc: null,
      duration_min: null,
      completed_at: "2024-01-03T12:10:00Z",
    });
    const scheduledToday = buildInstance({
      id: "inst-today",
      status: "scheduled",
      start_utc: "2024-01-04T09:00:00Z",
      end_utc: "2024-01-04T10:00:00Z",
    });

    habitSpy.mockResolvedValueOnce([
      {
        id: "habit-1",
        name: "Habit 1",
        durationMinutes: 15,
        createdAt: null,
        updatedAt: null,
        lastCompletedAt: null,
        currentStreakDays: 0,
        longestStreakDays: 0,
        habitType: "HABIT",
        windowId: null,
        energy: null,
        recurrence: "daily",
        recurrenceDays: null,
        skillId: null,
        skillMonumentId: null,
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
      {
        id: "habit-2",
        name: "Habit 2",
        durationMinutes: null,
        createdAt: null,
        updatedAt: null,
        lastCompletedAt: null,
        currentStreakDays: 0,
        longestStreakDays: 0,
        habitType: "HABIT",
        windowId: null,
        energy: null,
        recurrence: "daily",
        recurrenceDays: null,
        skillId: null,
        skillMonumentId: null,
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
      {
        id: "habit-sync",
        name: "Habit Sync",
        durationMinutes: null,
        createdAt: null,
        updatedAt: null,
        lastCompletedAt: null,
        currentStreakDays: 0,
        longestStreakDays: 0,
        habitType: "SYNC",
        windowId: null,
        energy: null,
        recurrence: "daily",
        recurrenceDays: null,
        skillId: null,
        skillMonumentId: null,
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
    ]);

    vi.spyOn(instanceRepo, "fetchInstancesForRange").mockResolvedValue({
      data: [
        habitYesterday,
        habitNoEnd,
        habitSyncCompleted,
        scheduledToday,
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });

    const dataset = await buildScheduleEventDataset({
      userId,
      client,
      baseDate,
      timeZone: "UTC",
      lookaheadDays: 7,
    });

    const ids = dataset.instances.map((inst) => inst.id);
    expect(ids).toContain("habit-yesterday");
    expect(ids).toContain("habit-no-end");
    expect(ids).toContain("habit-sync");
    expect(dataset.syncPairings["habit-sync"]).toEqual(["partner-1"]);
  });
});
