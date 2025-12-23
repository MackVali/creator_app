import { describe, expect, it } from "vitest";
import {
  buildTimelineInstancesForRange,
  detectIllegalOverlapsUTC,
  resolveOverlapChain,
} from "@/lib/scheduler/reschedule";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";

const baseStart = new Date("2024-01-01T00:00:00.000Z");
const rangeEnd = new Date("2024-01-02T00:00:00.000Z");

const makeInstance = (
  overrides: Partial<ScheduleInstance>
): ScheduleInstance => ({
  id: overrides.id ?? "instance-id",
  created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
  user_id: overrides.user_id ?? "user-id",
  source_type: overrides.source_type ?? "HABIT",
  source_id: overrides.source_id ?? "source-id",
  window_id: overrides.window_id ?? null,
  start_utc: overrides.start_utc ?? "2024-01-01T10:00:00.000Z",
  end_utc: overrides.end_utc ?? "2024-01-01T11:00:00.000Z",
  duration_min: overrides.duration_min ?? 60,
  status: overrides.status ?? "scheduled",
  weight_snapshot: overrides.weight_snapshot ?? 0,
  energy_resolved: overrides.energy_resolved ?? "NO",
  completed_at: overrides.completed_at ?? null,
  locked: overrides.locked ?? false,
  event_name: overrides.event_name ?? null,
  practice_context_monument_id: overrides.practice_context_monument_id ?? null,
});

describe("UTC overlap cleanup", () => {
  it("invalidates two of three overlapping hard blockers deterministically", () => {
    const habitTypeById = new Map<string, string>([
      ["habit-a", "HABIT"],
      ["habit-b", "HABIT"],
      ["habit-c", "HABIT"],
    ]);
    const instances: ScheduleInstance[] = [
      makeInstance({
        id: "a",
        source_id: "habit-a",
        start_utc: "2024-01-01T10:00:00.000Z",
        end_utc: "2024-01-01T13:00:00.000Z",
        updated_at: "2024-01-01T00:00:01.000Z",
      }),
      makeInstance({
        id: "b",
        source_id: "habit-b",
        start_utc: "2024-01-01T11:00:00.000Z",
        end_utc: "2024-01-01T14:00:00.000Z",
        updated_at: "2024-01-01T00:00:02.000Z",
      }),
      makeInstance({
        id: "c",
        source_id: "habit-c",
        start_utc: "2024-01-01T12:00:00.000Z",
        end_utc: "2024-01-01T15:00:00.000Z",
        updated_at: "2024-01-01T00:00:03.000Z",
      }),
    ];

    const timeline = buildTimelineInstancesForRange(
      instances,
      baseStart,
      rangeEnd,
      habitTypeById
    );
    const losers = resolveOverlapChain(timeline);
    expect(losers.size).toBe(2);
    expect(losers.has("b")).toBe(true);
    expect(losers.has("c")).toBe(true);

    const remaining = timeline.filter(
      (entry) => !losers.has(entry.instance.id)
    );
    expect(detectIllegalOverlapsUTC(remaining)).toHaveLength(0);
  });

  it("does not flag SYNC vs non-SYNC habit overlap", () => {
    const habitTypeById = new Map<string, string>([
      ["habit-sync", "SYNC"],
      ["habit-hard", "HABIT"],
    ]);
    const instances: ScheduleInstance[] = [
      makeInstance({
        id: "sync",
        source_id: "habit-sync",
        start_utc: "2024-01-01T10:00:00.000Z",
        end_utc: "2024-01-01T11:00:00.000Z",
      }),
      makeInstance({
        id: "hard",
        source_id: "habit-hard",
        start_utc: "2024-01-01T10:30:00.000Z",
        end_utc: "2024-01-01T11:30:00.000Z",
      }),
    ];

    const timeline = buildTimelineInstancesForRange(
      instances,
      baseStart,
      rangeEnd,
      habitTypeById
    );
    expect(detectIllegalOverlapsUTC(timeline)).toHaveLength(0);
    expect(resolveOverlapChain(timeline).size).toBe(0);
  });

  it("invalidates SYNC habit when overlapping a project", () => {
    const habitTypeById = new Map<string, string>([
      ["habit-sync", "SYNC"],
    ]);
    const instances: ScheduleInstance[] = [
      makeInstance({
        id: "sync",
        source_id: "habit-sync",
        source_type: "HABIT",
        start_utc: "2024-01-01T10:00:00.000Z",
        end_utc: "2024-01-01T11:00:00.000Z",
      }),
      makeInstance({
        id: "project",
        source_id: "project-1",
        source_type: "PROJECT",
        start_utc: "2024-01-01T10:30:00.000Z",
        end_utc: "2024-01-01T12:00:00.000Z",
      }),
    ];

    const timeline = buildTimelineInstancesForRange(
      instances,
      baseStart,
      rangeEnd,
      habitTypeById
    );
    const losers = resolveOverlapChain(timeline);
    expect(losers.size).toBe(1);
    expect(losers.has("sync")).toBe(true);
  });
});
