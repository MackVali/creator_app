import { describe, expect, it } from "vitest";
import {
  resolveLocalizedRescheduleCleanup,
  type LocalRescheduleCleanupInstance,
  type LocalRescheduleCleanupWindow,
} from "@/lib/scheduler/localRescheduleCleanup";
import { formatDateKeyInTimeZone } from "@/lib/scheduler/timezone";

const timeZone = "UTC";

const makeInstance = (
  overrides: Partial<LocalRescheduleCleanupInstance>
): LocalRescheduleCleanupInstance =>
  ({
    id: overrides.id ?? "instance-id",
    source_type: overrides.source_type ?? "PROJECT",
    start_utc: overrides.start_utc ?? "2024-01-01T10:00:00.000Z",
    end_utc: overrides.end_utc ?? "2024-01-01T11:00:00.000Z",
    locked: overrides.locked ?? true,
    weight_snapshot: overrides.weight_snapshot ?? 0,
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
    window_id: overrides.window_id ?? null,
    day_type_time_block_id: overrides.day_type_time_block_id ?? null,
    time_block_id: overrides.time_block_id ?? null,
  }) as LocalRescheduleCleanupInstance;

const makeWindow = (
  overrides: Partial<LocalRescheduleCleanupWindow>
): LocalRescheduleCleanupWindow =>
  ({
    id: overrides.id ?? "window-id",
    start_local: overrides.start_local ?? "09:00",
    end_local: overrides.end_local ?? "12:00",
    window_kind: overrides.window_kind ?? "DEFAULT",
    dayTypeTimeBlockId: overrides.dayTypeTimeBlockId ?? null,
    dayTypeStartUtcMs: overrides.dayTypeStartUtcMs ?? null,
    dayTypeEndUtcMs: overrides.dayTypeEndUtcMs ?? null,
  }) as LocalRescheduleCleanupWindow;

describe("resolveLocalizedRescheduleCleanup", () => {
  it("drops instances whose stored window no longer matches the local day slot", () => {
    const dayKey = formatDateKeyInTimeZone(
      new Date("2024-01-01T00:00:00.000Z"),
      timeZone
    );
    const windowsByDayKey = new Map<string, LocalRescheduleCleanupWindow[]>([
      [
        dayKey,
        [makeWindow({ id: "win-valid", start_local: "09:00", end_local: "11:00" })],
      ],
    ]);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        makeInstance({
          id: "pivot",
          start_utc: "2024-01-01T09:00:00.000Z",
          end_utc: "2024-01-01T10:00:00.000Z",
        }),
        makeInstance({
          id: "stale",
          start_utc: "2024-01-01T09:30:00.000Z",
          end_utc: "2024-01-01T10:30:00.000Z",
          window_id: "win-missing",
        }),
      ],
      windowsByDayKey,
      timeZone,
      protectedInstanceId: "pivot",
    });

    expect(result.loserIds).toContain("stale");
    expect(result.loserIds).not.toContain("pivot");
  });

  it("keeps the higher-weight local placement when two scheduled projects overlap", () => {
    const dayKey = formatDateKeyInTimeZone(
      new Date("2024-01-01T00:00:00.000Z"),
      timeZone
    );
    const windowsByDayKey = new Map<string, LocalRescheduleCleanupWindow[]>([
      [
        dayKey,
        [makeWindow({ id: "win-valid", start_local: "09:00", end_local: "12:00" })],
      ],
    ]);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        makeInstance({
          id: "low-weight",
          start_utc: "2024-01-01T10:00:00.000Z",
          end_utc: "2024-01-01T11:00:00.000Z",
          weight_snapshot: 1,
        }),
        makeInstance({
          id: "high-weight",
          start_utc: "2024-01-01T10:30:00.000Z",
          end_utc: "2024-01-01T11:30:00.000Z",
          weight_snapshot: 7,
        }),
      ],
      windowsByDayKey,
      timeZone,
    });

    expect(result.loserIds).toContain("low-weight");
    expect(result.loserIds).not.toContain("high-weight");
  });
});
