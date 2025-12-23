import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildScheduleEventDataset } from "../../../src/lib/scheduler/dataset";
import * as repo from "../../../src/lib/scheduler/repo";
import * as habits from "../../../src/lib/scheduler/habits";
import * as instanceRepo from "../../../src/lib/scheduler/instanceRepo";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";

type Client = SupabaseClient<Database>;

const createSupabaseMock = () => {
  const mockGoals: Array<{ id: string; weight?: number | null }> = [];
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
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as Client;
};

describe("buildScheduleEventDataset", () => {
  const userId = "user-1";
  const baseDate = new Date("2024-01-04T12:00:00Z");
  let client: Client;

  beforeEach(() => {
    client = createSupabaseMock();
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue([]);
    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(habits, "fetchHabitsForSchedule").mockResolvedValue([]);
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
});
