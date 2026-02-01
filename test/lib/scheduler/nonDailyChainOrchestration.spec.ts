import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import * as reschedule from "@/lib/scheduler/reschedule";
import * as placement from "@/lib/scheduler/placement";
import * as repo from "@/lib/scheduler/repo";
import * as habits from "@/lib/scheduler/habits";
import * as instanceRepo from "@/lib/scheduler/instanceRepo";
import { setTimeInTimeZone, startOfDayInTimeZone } from "@/lib/scheduler/timezone";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { createSupabaseMock } from "../../utils/supabaseMock";

const tz = "America/Chicago";
const userId = "user-non-daily";

const toISODate = (date: Date) =>
  startOfDayInTimeZone(date, tz).toISOString().slice(0, 10);

const buildHabit = (overrides: Partial<HabitScheduleItem> = {}) =>
  ({
    id: "habit-weekly",
    name: "Weekly habit",
    durationMinutes: 60,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    lastCompletedAt: "2024-02-20T15:00:00Z",
    currentStreakDays: 0,
    longestStreakDays: 0,
    habitType: "HABIT",
    windowId: null,
    energy: "LOW",
    recurrence: "weekly",
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
    ...overrides,
  }) satisfies HabitScheduleItem;

const buildInstance = (
  overrides: Partial<ScheduleInstance> = {}
): ScheduleInstance =>
  ({
    id: overrides.id ?? `inst-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    source_id: overrides.source_id ?? "habit-weekly",
    source_type: overrides.source_type ?? "HABIT",
    status: overrides.status ?? "scheduled",
    start_utc: overrides.start_utc ?? new Date().toISOString(),
    end_utc:
      overrides.end_utc ??
      new Date(Date.now() + 60 * 60000).toISOString(),
    duration_min: overrides.duration_min ?? 60,
    window_id: overrides.window_id ?? "win-morning",
    weight_snapshot: overrides.weight_snapshot ?? 0,
    energy_resolved: overrides.energy_resolved ?? "LOW",
    created_at: overrides.created_at ?? "2024-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00Z",
    metadata: overrides.metadata ?? null,
    note: overrides.note ?? null,
    label: overrides.label ?? null,
    project_instance_id: overrides.project_instance_id ?? null,
    user_timezone: overrides.user_timezone ?? null,
    planned_start_utc: overrides.planned_start_utc ?? null,
    planned_end_utc: overrides.planned_end_utc ?? null,
    backlog_item_id: overrides.backlog_item_id ?? null,
    backlog_item_type: overrides.backlog_item_type ?? null,
    backlog_item_status: overrides.backlog_item_status ?? null,
    backlog_item_name: overrides.backlog_item_name ?? null,
    backlog_item_priority: overrides.backlog_item_priority ?? null,
    backlog_item_stage: overrides.backlog_item_stage ?? null,
    backlog_item_duration_min: overrides.backlog_item_duration_min ?? null,
    backlog_item_energy: overrides.backlog_item_energy ?? null,
    backlog_item_skill_id: overrides.backlog_item_skill_id ?? null,
    backlog_item_skill_icon: overrides.backlog_item_skill_icon ?? null,
    backlog_item_project_id: overrides.backlog_item_project_id ?? null,
    backlog_item_project_stage: overrides.backlog_item_project_stage ?? null,
    completed_at: overrides.completed_at ?? null,
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    source_duration_min: overrides.source_duration_min ?? null,
    energy_snapshot: overrides.energy_snapshot ?? null,
    energy_resolved_snapshot: overrides.energy_resolved_snapshot ?? null,
    locked: overrides.locked ?? false,
    practice_context_monument_id:
      overrides.practice_context_monument_id ?? null,
  }) as ScheduleInstance;

describe("non-daily chain orchestration", () => {
  let supabase: ReturnType<typeof createSupabaseMock>["client"];
  let canceledIds: string[];
  let instances: ScheduleInstance[];
  let habit: HabitScheduleItem;

  const windowRecord = {
    id: "win-morning",
    label: "Morning",
    energy: "LOW",
    start_local: "09:00",
    end_local: "10:00",
    days: null as number[] | null,
    location_context_id: null,
    location_context_value: null,
    location_context_name: null,
    window_kind: "DEFAULT" as const,
  };

  const windowForDay = (day: Date) => {
    const startLocal = setTimeInTimeZone(day, tz, 9, 0);
    const endLocal = new Date(startLocal.getTime() + 60 * 60000);
    return {
      id: windowRecord.id,
      startLocal,
      endLocal,
      availableStartLocal: startLocal,
      key: `${windowRecord.id}:${startLocal.toISOString()}`,
    };
  };

  const debugSchedule = (label: string) => {
    const scheduled = instances
      .filter((inst) => inst.source_id === habit.id && inst.status === "scheduled")
      .sort(
        (a, b) =>
          new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
      );
    const payload = scheduled.map((inst) => ({
      id: inst.id,
      role: (inst.metadata as any)?.nonDaily?.role ?? null,
      start_utc: inst.start_utc,
      local_day: toISODate(new Date(inst.start_utc)),
      dueAtUtc: (inst.metadata as any)?.nonDaily?.dueAtUtc ?? null,
      anchorCompletedAtUtc:
        (inst.metadata as any)?.nonDaily?.anchorCompletedAtUtc ?? null,
      status: inst.status,
    }));
    // eslint-disable-next-line no-console
    console.log(`[${label}] non-daily chain`, payload);
  };

  const expectWithDebug = (fn: () => void, label: string) => {
    try {
      fn();
    } catch (error) {
      debugSchedule(label);
      throw error;
    }
  };

  const runScheduler = async (now: Date) => {
    vi.setSystemTime(now);
    return reschedule.scheduleBacklog(userId, now, supabase, {
      timeZone: tz,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.TZ = tz;
    instances = [];
    habit = buildHabit();
    const mock = createSupabaseMock();
    supabase = mock.client;
    canceledIds = mock.canceledIds;

    vi.spyOn(instanceRepo, "fetchBacklogNeedingSchedule").mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });
    vi.spyOn(instanceRepo, "fetchInstancesForRange").mockImplementation(
      async (_userId, startUtc, endUtc) => {
        const startMs = Date.parse(startUtc);
        const endMs = Date.parse(endUtc);
        const data = instances.filter((inst) => {
          if (inst.id && canceledIds.includes(inst.id)) return false;
          const s = Date.parse(inst.start_utc ?? "");
          const e = Date.parse(inst.end_utc ?? inst.start_utc ?? "");
          if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
          return (s >= startMs && s < endMs) || (s < startMs && e > startMs);
        });
        return {
          data,
          error: null,
          count: data.length,
          status: 200,
          statusText: "OK",
        };
      }
    );

    vi.spyOn(repo, "fetchReadyTasks").mockResolvedValue([]);
    vi.spyOn(repo, "fetchProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchAllProjectsMap").mockResolvedValue({});
    vi.spyOn(repo, "fetchProjectSkillsForProjects").mockResolvedValue({});
    vi.spyOn(repo, "fetchGoalsForUser").mockResolvedValue([]);
    vi.spyOn(repo, "fetchWindowsSnapshot").mockResolvedValue(null);
    vi.spyOn(repo, "fetchWindowsForDate").mockImplementation(async () => [
      windowRecord,
    ]);
    vi.spyOn(habits, "fetchHabitsForSchedule").mockResolvedValue([habit]);

    vi.spyOn(reschedule, "fetchCompatibleWindowsForItem").mockImplementation(
      async (_supabase, day) => [windowForDay(day)]
    );

    vi.spyOn(placement, "placeItemInWindows").mockImplementation(
      async (params) => {
        const target = params.windows[0] ?? windowForDay(params.date);
        const windowStart =
          target.availableStartLocal ?? target.startLocal ?? params.date;
        const windowEnd = target.endLocal ?? new Date(windowStart.getTime());
        const notBefore = params.notBefore
          ? new Date(params.notBefore)
          : windowStart;
        if (notBefore.getTime() >= windowEnd.getTime()) {
          return { error: "NO_FIT" as const };
        }
        const startLocal = new Date(
          Math.max(windowStart.getTime(), notBefore.getTime())
        );
        const endLocal = new Date(
          startLocal.getTime() + params.item.duration_min * 60000
        );
        let instance: ScheduleInstance | null = null;
        if (params.reuseInstanceId) {
          instance =
            instances.find((inst) => inst.id === params.reuseInstanceId) ??
            null;
          if (instance) {
            instance.start_utc = startLocal.toISOString();
            instance.end_utc = endLocal.toISOString();
            instance.duration_min = params.item.duration_min;
            instance.metadata = params.metadata ?? instance.metadata ?? null;
          }
        }
        if (!instance) {
          instance = buildInstance({
            id:
              params.reuseInstanceId ??
              `${params.item.id}-${startLocal.toISOString()}`,
            source_id: params.item.id,
            source_type: params.item.sourceType,
            start_utc: startLocal.toISOString(),
            end_utc: endLocal.toISOString(),
            duration_min: params.item.duration_min,
            window_id: target.id,
            energy_resolved: params.item.energy,
            event_name: params.item.eventName,
            metadata: params.metadata ?? null,
          });
          instances.push(instance);
        }
        return {
          data: instance,
          error: null,
          count: 1,
          status: 201,
          statusText: "Created",
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a primary + forecast chain for an on-track weekly habit", async () => {
    const baseDate = new Date("2024-03-01T18:00:00Z"); // 12:00 local
    const expectedPrimaryDue = new Date("2024-03-06T15:00:00Z"); // anchor + 7d
    habit = buildHabit({
      lastCompletedAt: "2024-02-28T15:00:00Z",
    });
    (habits.fetchHabitsForSchedule as unknown as vi.Mock).mockResolvedValue([
      habit,
    ]);
    const result = await runScheduler(baseDate);
    expect(result.error).toBeUndefined();

    const scheduled = instances
      .filter((inst) => inst.source_id === habit.id && inst.status === "scheduled")
      .sort(
        (a, b) =>
          new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
      );
    const roles = scheduled.map(
      (inst) => (inst.metadata as any)?.nonDaily?.role ?? null
    );

    expectWithDebug(() => expect(scheduled).toHaveLength(2), "on-track");
    expectWithDebug(
      () => expect(new Set(roles)).toEqual(new Set(["PRIMARY", "FORECAST"])),
      "on-track"
    );

    const primary = scheduled.find(
      (inst) => (inst.metadata as any)?.nonDaily?.role === "PRIMARY"
    )!;
    const forecast = scheduled.find(
      (inst) => (inst.metadata as any)?.nonDaily?.role === "FORECAST"
    )!;
    const primaryStart = new Date(primary.start_utc);
    const forecastStart = new Date(forecast.start_utc);
    const forecastDue = new Date(
      (forecast.metadata as any)?.nonDaily?.dueAtUtc ?? ""
    );
    const expectedForecastDue = new Date(primaryStart);
    expectedForecastDue.setUTCDate(expectedForecastDue.getUTCDate() + 7);

    expectWithDebug(
      () => expect(primaryStart.getTime()).toBeGreaterThanOrEqual(baseDate.getTime()),
      "on-track"
    );
    expectWithDebug(
      () =>
        expect(primaryStart.getTime()).toBeGreaterThanOrEqual(
          expectedPrimaryDue.getTime()
        ),
      "on-track"
    );
    expectWithDebug(
      () =>
        expect((primary.metadata as any)?.nonDaily?.dueAtUtc).toBe(
          expectedPrimaryDue.toISOString()
        ),
      "on-track"
    );
    expectWithDebug(
      () =>
        expect((primary.metadata as any)?.nonDaily?.anchorCompletedAtUtc).toBe(
          new Date(habit.lastCompletedAt ?? "").toISOString()
        ),
      "on-track"
    );
    expectWithDebug(
      () =>
        expect(forecastDue.toISOString()).toBe(
          expectedForecastDue.toISOString()
        ),
      "on-track"
    );
    expectWithDebug(
      () =>
        expect(toISODate(primaryStart)).not.toBe(toISODate(forecastStart)),
      "on-track"
    );
  });

  it("repairs stale primary and recomputes forecast for overdue habits", async () => {
    const baseDate = new Date("2024-03-10T18:00:00Z"); // 12:00 local
    habit = buildHabit({
      lastCompletedAt: "2024-02-01T15:00:00Z",
    });
    (habits.fetchHabitsForSchedule as unknown as vi.Mock).mockResolvedValue([
      habit,
    ]);
    instances.push(
      buildInstance({
        id: "inst-stale",
        start_utc: "2024-03-10T14:00:00Z",
        end_utc: "2024-03-10T15:00:00Z",
      }),
      buildInstance({
        id: "inst-future",
        start_utc: "2024-03-15T15:00:00Z",
        end_utc: "2024-03-15T16:00:00Z",
      })
    );

    const result = await runScheduler(baseDate);
    expect(result.error).toBeUndefined();

    const scheduled = instances
      .filter((inst) => inst.source_id === habit.id && inst.status === "scheduled")
      .sort(
        (a, b) =>
          new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
      );

    expectWithDebug(() => expect(scheduled).toHaveLength(2), "overdue");
    const primary = scheduled.find(
      (inst) => (inst.metadata as any)?.nonDaily?.role === "PRIMARY"
    )!;
    const forecast = scheduled.find(
      (inst) => (inst.metadata as any)?.nonDaily?.role === "FORECAST"
    )!;

    const primaryStart = new Date(primary.start_utc);
    const forecastStart = new Date(forecast.start_utc);
    const primaryDue = new Date((primary.metadata as any)?.nonDaily?.dueAtUtc ?? "");
    const forecastDue = new Date((forecast.metadata as any)?.nonDaily?.dueAtUtc ?? "");
    const expectedForecastDue = new Date(primaryStart);
    expectedForecastDue.setUTCDate(expectedForecastDue.getUTCDate() + 7);
    const expectedPrimaryDue = new Date("2024-02-01T15:00:00Z");
    expectedPrimaryDue.setUTCDate(expectedPrimaryDue.getUTCDate() + 7);

    expectWithDebug(
      () => expect(primaryStart.getTime()).toBeGreaterThan(baseDate.getTime()),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect(primaryStart.toISOString()).toContain("2024-03-11"),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect(forecastStart.getTime()).toBeGreaterThan(primaryStart.getTime()),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect(primaryDue.toISOString()).toBe(
          expectedPrimaryDue.toISOString()
        ),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect((primary.metadata as any)?.nonDaily?.anchorCompletedAtUtc).toBe(
          new Date(habit.lastCompletedAt ?? "").toISOString()
        ),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect(forecastDue.toISOString()).toBe(
          expectedForecastDue.toISOString()
        ),
      "overdue"
    );
    expectWithDebug(
      () =>
        expect(toISODate(primaryStart)).not.toBe(toISODate(forecastStart)),
      "overdue"
    );
  });
});
