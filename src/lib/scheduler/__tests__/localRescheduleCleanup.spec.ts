import { describe, expect, it } from "vitest";
import {
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
} from "../timezone";
import {
  resolveLocalizedRescheduleCleanup,
  resolveLocalizedRescheduleScope,
} from "../localRescheduleCleanup";

function buildWindow(dayTypeTimeBlockId: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides.id as string | undefined) ?? "window-1",
    start_local: "08:00",
    end_local: "10:00",
    window_kind: (overrides.window_kind as "BREAK" | "DEFAULT" | "PRACTICE" | "FOCUS" | undefined) ?? "BREAK",
    dayTypeTimeBlockId,
    dayTypeStartUtcMs: Date.parse("2024-01-02T08:00:00Z"),
    dayTypeEndUtcMs: Date.parse("2024-01-02T10:00:00Z"),
    ...overrides,
  };
}

function buildInstance(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "instance-1",
    source_type: "PROJECT" as const,
    start_utc: "2024-01-02T08:30:00Z",
    end_utc: "2024-01-02T09:00:00Z",
    locked: false,
    weight_snapshot: 1,
    updated_at: "2024-01-01T00:00:00Z",
    window_id: null,
    day_type_time_block_id: null,
    time_block_id: null,
    ...overrides,
  };
}

describe("resolveLocalizedRescheduleCleanup", () => {
  it("invalidates a scheduled instance that lands inside a BREAK window even without direct window refs", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [buildInstance()],
      windowsByDayKey: new Map([[dayKey, [buildWindow(null)]]]),
      timeZone,
    });

    expect(result.loserIds).toContain("instance-1");
  });

  it("invalidates a RELAXER habit inside a BREAK window during reschedule cleanup", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "relaxer-instance",
          source_type: "HABIT",
          source_id: "habit-relaxer",
        }),
      ],
      windowsByDayKey: new Map([
        [
          dayKey,
          [
            buildWindow(null, {
              window_kind: "BREAK",
              allowAllHabitTypes: false,
              allowedHabitTypes: ["RELAXER"],
            }),
          ],
        ],
      ]),
      timeZone,
      resolveSourceContext(instance) {
        if (instance.source_id === "habit-relaxer") {
          return {
            habitType: "RELAXER",
          };
        }
        return null;
      },
    });

    expect(result.loserIds).toContain("relaxer-instance");
  });

  it("invalidates a scheduled instance inside an overnight BREAK window from the prior day", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-03T02:30:00Z"),
      timeZone
    );
    const currentDayKey = formatDateKeyInTimeZone(localDay, timeZone);
    const prevDayKey = formatDateKeyInTimeZone(
      new Date("2024-01-02T00:00:00Z"),
      timeZone
    );

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "overnight-break-instance",
          start_utc: "2024-01-03T02:30:00Z",
          end_utc: "2024-01-03T03:00:00Z",
        }),
      ],
      windowsByDayKey: new Map([
        [
          prevDayKey,
          [
            buildWindow(null, {
              id: "overnight-break",
              start_local: "22:00",
              end_local: "06:00",
              window_kind: "BREAK",
              dayTypeStartUtcMs: null,
              dayTypeEndUtcMs: null,
            }),
          ],
        ],
        [currentDayKey, []],
      ]),
      timeZone,
    });

    expect(result.loserIds).toContain("overnight-break-instance");
  });

  it("invalidates a committed schedule instance that no longer satisfies window constraints", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "instance-constraint",
          source_type: "HABIT",
          source_id: "habit-1",
        }),
      ],
      windowsByDayKey: new Map([
        [
          dayKey,
          [
            buildWindow(null, {
              window_kind: "DEFAULT",
              allowAllSkills: false,
              allowedSkillIds: ["skill-allowed"],
            }),
          ],
        ],
      ]),
      timeZone,
      resolveSourceContext(instance) {
        if (instance.source_id === "habit-1") {
          return {
            habitType: "HABIT",
            skillId: "skill-denied",
            skillMonumentId: "monument-denied",
          };
        }
        return null;
      },
    });

    expect(result.loserIds).toContain("instance-constraint");
  });

  it("invalidates a scheduled instance that matches a BREAK day-type window by reference", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "instance-2",
          day_type_time_block_id: "day-type-break",
        }),
      ],
      windowsByDayKey: new Map([
        [dayKey, [buildWindow("day-type-break")]],
      ]),
      timeZone,
    });

    expect(result.loserIds).toContain("instance-2");
  });

  it("widens cleanup scope enough to include prior-night BREAK offenders after a morning reschedule", () => {
    const scope = resolveLocalizedRescheduleScope({
      pivotStart: "2026-04-08T07:19:00Z",
      pivotEnd: "2026-04-08T07:49:00Z",
      timeZone: "UTC",
    });

    expect(scope).not.toBeNull();
    expect(scope?.scopeStart.toISOString()).toBe("2026-04-06T04:00:00.000Z");
    expect(scope?.scopeEnd.toISOString()).toBe("2026-04-10T04:00:00.000Z");
    expect(new Date("2026-04-07T02:40:00Z").getTime()).toBeGreaterThanOrEqual(
      scope!.scopeStart.getTime()
    );
    expect(new Date("2026-04-07T04:20:00Z").getTime()).toBeGreaterThanOrEqual(
      scope!.scopeStart.getTime()
    );
  });

  it("cancels a BREAK-contained instance even when stale FOCUS refs still match a different window", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T02:40:00Z"),
      timeZone
    );
    const currentDayKey = formatDateKeyInTimeZone(localDay, timeZone);
    const nextDayKey = formatDateKeyInTimeZone(
      new Date("2024-01-03T00:00:00Z"),
      timeZone
    );

    const morningRoutineId = "24781425-24a5-45d1-8976-6a83297062ba";
    const sleepBreakId = "926a214c-0e0e-400d-bc03-db77014a7c62";

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "instance-break-contained",
          start_utc: "2024-01-02T02:40:00Z",
          end_utc: "2024-01-02T03:00:00Z",
          day_type_time_block_id: morningRoutineId,
          time_block_id: sleepBreakId,
        }),
      ],
      windowsByDayKey: new Map([
        [
          currentDayKey,
          [
            buildWindow(morningRoutineId, {
              id: morningRoutineId,
              window_kind: "FOCUS",
              start_local: "00:00",
              end_local: "06:00",
              dayTypeStartUtcMs: Date.parse("2024-01-02T00:00:00Z"),
              dayTypeEndUtcMs: Date.parse("2024-01-02T06:00:00Z"),
            }),
          ],
        ],
        [
          nextDayKey,
          [
            buildWindow(null, {
              id: sleepBreakId,
              window_kind: "BREAK",
              start_local: "02:00",
              end_local: "08:30",
              dayTypeStartUtcMs: Date.parse("2024-01-02T02:00:00Z"),
              dayTypeEndUtcMs: Date.parse("2024-01-02T08:30:00Z"),
            }),
          ],
        ],
      ]),
      timeZone,
    });

    expect(result.loserIds).toContain("instance-break-contained");
  });

  it("keeps the pivot protected from ordinary overlap loser selection", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T10:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "pivot",
          start_utc: "2024-01-02T08:30:00Z",
          end_utc: "2024-01-02T09:00:00Z",
          weight_snapshot: 10,
        }),
        buildInstance({
          id: "other",
          start_utc: "2024-01-02T08:00:00Z",
          end_utc: "2024-01-02T08:45:00Z",
          weight_snapshot: 10,
        }),
      ],
      windowsByDayKey: new Map([
        [dayKey, [buildWindow(null, { window_kind: "DEFAULT" })]],
      ]),
      timeZone,
      protectedInstanceId: "pivot",
    });

    expect(result.loserIds).toContain("other");
    expect(result.loserIds).not.toContain("pivot");
  });

  it("keeps locked manual placements out of overlap cleanup", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "zz-locked",
          source_type: "PROJECT",
          source_id: "project-1",
          start_utc: "2024-01-02T08:30:00Z",
          end_utc: "2024-01-02T09:00:00Z",
          locked: true,
          weight_snapshot: 1,
          updated_at: "2024-01-01T00:00:00Z",
        }),
        buildInstance({
          id: "aa-unlocked",
          source_type: "PROJECT",
          source_id: "project-2",
          start_utc: "2024-01-02T08:30:00Z",
          end_utc: "2024-01-02T09:00:00Z",
          locked: false,
          weight_snapshot: 1,
          updated_at: "2024-01-01T00:00:00Z",
        }),
      ],
      windowsByDayKey: new Map([
        [dayKey, [buildWindow(null, { window_kind: "DEFAULT" })]],
      ]),
      timeZone,
      resolveSourceContext(instance) {
        if (instance.source_type !== "PROJECT") return null;
        return {
          skillIds: [],
        };
      },
    });

    expect(result.loserIds).not.toContain("zz-locked");
    expect(result.loserIds).not.toContain("aa-unlocked");
  });

  it("keeps completed instances out of localized cleanup", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "completed-instance",
          status: "completed",
          locked: false,
          source_type: "PROJECT",
          source_id: "project-3",
          start_utc: "2024-01-02T08:30:00Z",
          end_utc: "2024-01-02T09:00:00Z",
        }),
      ],
      windowsByDayKey: new Map([
        [dayKey, [buildWindow(null, { window_kind: "BREAK" })]],
      ]),
      timeZone,
    });

    expect(result.loserIds).not.toContain("completed-instance");
  });

  it("still invalidates the pivot when it lands inside a BREAK window", () => {
    const timeZone = "UTC";
    const localDay = startOfDayInTimeZone(
      new Date("2024-01-02T08:30:00Z"),
      timeZone
    );
    const dayKey = formatDateKeyInTimeZone(localDay, timeZone);

    const result = resolveLocalizedRescheduleCleanup({
      instances: [
        buildInstance({
          id: "pivot-break",
          start_utc: "2024-01-02T08:30:00Z",
          end_utc: "2024-01-02T09:00:00Z",
          window_id: "window-break",
        }),
      ],
      windowsByDayKey: new Map([
        [
          dayKey,
          [
            buildWindow(null, {
              id: "window-break",
              window_kind: "BREAK",
            }),
          ],
        ],
      ]),
      timeZone,
      protectedInstanceId: "pivot-break",
    });

    expect(result.loserIds).toContain("pivot-break");
  });
});
