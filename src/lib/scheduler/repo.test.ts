import { describe, expect, it } from "vitest";

import {
  fetchWindowsSnapshot,
  getWindowsForDate_v2,
  windowsForDateFromSnapshot,
} from "./repo";
import { normalizeBlockType } from "./repo";
import type { WindowLite } from "./repo";
import { addDaysInTimeZone, startOfDayInTimeZone } from "./timezone";

function createMockSupabase(
  tables: Record<string, { data: unknown; error?: unknown }>
) {
  return {
    from(table: string) {
      const payload = tables[table] ?? { data: null, error: null };
      const result = {
        data: payload.data ?? null,
        error: payload.error ?? null,
      };
      const builder: any = {
        select: () => builder,
        contains: () => builder,
        is: () => builder,
        eq: () => builder,
        maybeSingle: async () => result,
        single: async () => result,
        then: (onFulfilled: any, onRejected: any) =>
          Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

describe("getWindowsForDate_v2", () => {
  it("uses per-date day type assignment overrides for energy and block type", async () => {
    const userId = "user-1";
    const date = new Date("2024-06-10T00:00:00Z");
    const mockSupabase = createMockSupabase({
      day_type_assignments: { data: { day_type_id: "dt-assigned" } },
      day_type_time_blocks: {
        data: [
          {
            day_type_id: "dt-assigned",
            time_block_id: "block-1",
            energy: "HIGH",
            block_type: "PRACTICE",
            location_context_id: null,
            time_blocks: {
              id: "block-1",
              label: "Deep Work",
              start_local: "09:00",
              end_local: "10:00",
              days: null,
            },
            location_context: null,
          },
        ],
      },
    });

    const windows = await getWindowsForDate_v2(
      date,
      mockSupabase as any,
      "UTC",
      { userId }
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]?.energy).toBe("HIGH");
    expect(windows[0]?.window_kind).toBe("PRACTICE");
    expect(windows[0]?.start_local).toBe("09:00");
    expect(windows[0]?.end_local).toBe("10:00");
  });

  it("maps FOCUS block_type to DEFAULT windowKind in full integration", async () => {
    const userId = "user-1";
    const date = new Date("2024-06-10T00:00:00Z");
    const mockSupabase = createMockSupabase({
      day_type_assignments: { data: { day_type_id: "dt-focus" } },
      day_type_time_blocks: {
        data: [
          {
            day_type_id: "dt-focus",
            time_block_id: "block-focus",
            energy: "MEDIUM",
            block_type: "FOCUS",
            location_context_id: null,
            time_blocks: {
              id: "block-focus",
              label: "Focus Block",
              start_local: "10:00",
              end_local: "11:00",
              days: null,
            },
            location_context: null,
          },
        ],
      },
    });

    const windows = await getWindowsForDate_v2(
      date,
      mockSupabase as any,
      "UTC",
      { userId }
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]?.window_kind).toBe("DEFAULT");
    expect(windows[0]?.energy).toBe("MEDIUM");
    expect(windows[0]?.label).toBe("Focus Block");
  });
});

describe("fetchWindowsSnapshot", () => {
  it("preserves constraint fields in snapshot mapping", async () => {
    const mockSupabase = createMockSupabase({
      windows: {
        data: [
          {
            id: "win-1",
            label: "Snapshot Block",
            energy: "HIGH",
            start_local: "08:00",
            end_local: "09:00",
            days: [1, 2, 3],
            location_context_id: "loc-1",
            window_kind: "PRACTICE",
            day_type_time_block_id: "dttb-1",
            allow_all_habit_types: false,
            allow_all_skills: false,
            allow_all_monuments: false,
            allowed_habit_types: ["HABIT", "PRACTICE"],
            allowed_skill_ids: ["skill-1"],
            allowed_monument_ids: ["mon-1"],
            location_context: { value: "GYM", label: "Gym" },
          },
        ],
      },
    });

    const snapshot = await fetchWindowsSnapshot("user-1", mockSupabase as any);
    expect(snapshot).toHaveLength(1);
    const win = snapshot[0];
    expect(win.dayTypeTimeBlockId).toBe("dttb-1");
    expect(win.allowAllHabitTypes).toBe(false);
    expect(win.allowAllSkills).toBe(false);
    expect(win.allowAllMonuments).toBe(false);
    expect(win.allowedHabitTypes).toEqual(["HABIT", "PRACTICE"]);
    expect(win.allowedSkillIds).toEqual(["skill-1"]);
    expect(win.allowedMonumentIds).toEqual(["mon-1"]);
  });
});

describe("normalizeBlockType", () => {
  it("maps FOCUS block_type to DEFAULT windowKind", () => {
    expect(normalizeBlockType("FOCUS")).toBe("DEFAULT");
  });

  it("maps PRACTICE block_type to PRACTICE windowKind", () => {
    expect(normalizeBlockType("PRACTICE")).toBe("PRACTICE");
  });

  it("maps BREAK block_type to BREAK windowKind", () => {
    expect(normalizeBlockType("BREAK")).toBe("BREAK");
  });

  it("defaults null/undefined block_type to FOCUS -> DEFAULT windowKind", () => {
    expect(normalizeBlockType(null)).toBe("DEFAULT");
    expect(normalizeBlockType(undefined)).toBe("DEFAULT");
    expect(normalizeBlockType("")).toBe("DEFAULT");
  });

  it("is case-insensitive for block_type values", () => {
    expect(normalizeBlockType("focus")).toBe("DEFAULT");
    expect(normalizeBlockType("Focus")).toBe("DEFAULT");
    expect(normalizeBlockType("PRACTICE")).toBe("PRACTICE");
    expect(normalizeBlockType("practice")).toBe("PRACTICE");
    expect(normalizeBlockType("BREAK")).toBe("BREAK");
    expect(normalizeBlockType("break")).toBe("BREAK");
  });
});

describe("buildWindowsForDateFromSnapshot - schedule day anchoring", () => {
  it("keeps after-midnight slots inside the schedule day and spans midnight windows", () => {
    const dateKey = new Date("2026-01-26T05:00:00Z");
    const dayStart = startOfDayInTimeZone(dateKey, "UTC");
    const dayEnd = addDaysInTimeZone(dayStart, 1, "UTC");

    const snapshot: WindowLite[] = [
      {
        id: "early-slot",
        label: "After-midnight block",
        energy: "LOW",
        start_local: "00:30",
        end_local: "01:00",
        days: [1], // Monday
        location_context_id: null,
        location_context_value: null,
        location_context_name: null,
        window_kind: "DEFAULT" as const,
        dayTypeTimeBlockId: null,
        allowAllHabitTypes: true,
        allowAllSkills: true,
        allowAllMonuments: true,
        allowedHabitTypes: null,
        allowedSkillIds: null,
        allowedMonumentIds: null,
      },
      {
        id: "night-shift",
        label: "Night block",
        energy: "MEDIUM",
        start_local: "22:30",
        end_local: "00:30",
        days: [1], // Monday
        location_context_id: null,
        location_context_value: null,
        location_context_name: null,
        window_kind: "DEFAULT" as const,
        dayTypeTimeBlockId: null,
        allowAllHabitTypes: true,
        allowAllSkills: true,
        allowAllMonuments: true,
        allowedHabitTypes: null,
        allowedSkillIds: null,
        allowedMonumentIds: null,
      },
    ];

    const windows = windowsForDateFromSnapshot(snapshot, dateKey, "UTC");
    expect(windows).toHaveLength(2);

    const early = windows.find((w) => w.id === "early-slot");
    expect(early).toBeDefined();
    expect(early?.dayTypeStartUtcMs).toBe(Date.parse("2026-01-27T00:30:00Z"));
    expect(early?.dayTypeEndUtcMs).toBe(Date.parse("2026-01-27T01:00:00Z"));
    expect(early?.dayTypeStartUtcMs).toBeGreaterThanOrEqual(dayStart.getTime());
    expect(early?.dayTypeStartUtcMs).toBeLessThan(dayEnd.getTime());

    const night = windows.find((w) => w.id === "night-shift");
    expect(night).toBeDefined();
    expect(night?.dayTypeStartUtcMs).toBe(Date.parse("2026-01-26T22:30:00Z"));
    expect(night?.dayTypeEndUtcMs).toBe(Date.parse("2026-01-27T00:30:00Z"));
  });
});
