import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scheduler/repo", () => ({
  buildWindowsForDateFromDayTypeBlocks: vi.fn(),
  windowsForDateFromSnapshot: vi.fn(),
}));

import {
  buildOverviewDailySeries,
  type NormalizedCompletionEventRow,
  type OverviewUsableScheduleSource,
  type RawXpEventRow,
} from "../../../../src/app/api/analytics/route";

const emptyUsableScheduleSource = (): OverviewUsableScheduleSource => ({
  generalWindows: [],
  breakWindowIds: new Set<string>(),
  breakDayTypeTimeBlockIds: new Set<string>(),
  dayTypeAssignmentsByDateKey: new Map<string, string>(),
  dayTypesById: new Map(),
  defaultDayTypes: [],
  dayTypeWindowsByDayTypeId: new Map(),
});

describe("buildOverviewDailySeries XP buckets", () => {
  it("keeps cumulative Total XP separate from per-day XP gained", async () => {
    const originalWarn = console.warn;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      if (args[0] !== "[analytics:overview-efficiency] debug") {
        originalWarn(...args);
      }
    });
    const completionEvents: NormalizedCompletionEventRow[] = [
      {
        id: "completion-1",
        sourceType: "task",
        sourceId: "task-1",
        completedAt: "2026-07-27T15:00:00.000Z",
        scheduleInstanceId: null,
        wasScheduled: false,
        durationMinutes: null,
        productivityDayKey: "2026-07-27",
      },
    ];
    const completionXpEvents: RawXpEventRow[] = [
      {
        id: "xp-1",
        created_at: "2026-07-27T15:00:00.000Z",
        amount: 50,
        kind: "task",
        skill_id: "skill-1",
        completion_event_id: "completion-1",
      },
    ];
    const directXpEvents: RawXpEventRow[] = [
      {
        id: "xp-2",
        created_at: "2026-07-28T16:00:00.000Z",
        amount: 20,
        kind: "task",
        skill_id: "skill-1",
        completion_event_id: null,
      },
    ];

    const result = await (async () => {
      try {
        return await buildOverviewDailySeries({
          xpEvents: directXpEvents,
          completionEvents,
          completionXpEvents,
          totalXpEvents: [...completionXpEvents, ...directXpEvents],
          observedInstances: [],
          scheduleInstances: [],
          usableScheduleSource: emptyUsableScheduleSource(),
          start: new Date("2026-07-27T09:00:00.000Z"),
          end: new Date("2026-07-29T09:00:00.000Z"),
          now: new Date("2026-07-29T18:00:00.000Z"),
          range: "7d",
          timeZone: "America/Chicago",
          currentTotalXp: 100,
        });
      } finally {
        warnSpy.mockRestore();
      }
    })();

    expect(result.overviewDaily.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
    expect(result.overviewDaily.map((point) => point.xpGained)).toEqual([
      50,
      20,
      0,
    ]);
    expect(result.overviewDaily.map((point) => point.totalXp)).toEqual([
      80,
      100,
      100,
    ]);
  });
});
