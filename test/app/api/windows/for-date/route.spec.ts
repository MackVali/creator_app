import { describe, expect, it } from "vitest";

import { visibleCalendarWindowsForDay } from "@/app/api/windows/for-date/visibleCalendarDay";
import type { WindowLite } from "@/lib/scheduler/repo";

function windowLite(overrides: Partial<WindowLite>): WindowLite {
  return {
    id: "window-1",
    label: "Time Block",
    energy: "NO",
    start_local: "00:00",
    end_local: "01:00",
    days: null,
    location_context_id: null,
    location_context_value: null,
    location_context_name: null,
    window_kind: "DEFAULT",
    dayTypeTimeBlockId: "dttb-1",
    dayTypeStartUtcMs: Date.parse("2024-01-08T00:00:00Z"),
    dayTypeEndUtcMs: Date.parse("2024-01-08T01:00:00Z"),
    ...overrides,
  };
}

function visibleWindowsForUtcDay({
  dayKey,
  previousSchedulerWindows = [],
  currentSchedulerWindows = [],
}: {
  dayKey: string;
  previousSchedulerWindows?: WindowLite[];
  currentSchedulerWindows?: WindowLite[];
}) {
  const visibleStart = new Date(`${dayKey}T00:00:00Z`);
  return visibleCalendarWindowsForDay({
    dayKey,
    timeZone: "UTC",
    visibleStart,
    visibleEnd: new Date(visibleStart.getTime() + 24 * 60 * 60 * 1000),
    previousSchedulerWindows,
    currentSchedulerWindows,
  });
}

describe("visibleCalendarWindowsForDay", () => {
  it("includes Sunday-owned early-morning windows on the visible Monday calendar day", () => {
    const windows = visibleWindowsForUtcDay({
      dayKey: "2024-01-08",
      previousSchedulerWindows: [
        windowLite({
          id: "sunday-early",
          dayTypeTimeBlockId: "dttb-sunday-early",
          dayTypeStartUtcMs: Date.parse("2024-01-08T00:00:00Z"),
          dayTypeEndUtcMs: Date.parse("2024-01-08T03:59:00Z"),
        }),
      ],
    });

    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual(
      expect.objectContaining({
        id: "sunday-early",
        dayTypeTimeBlockId: "dttb-sunday-early",
        start_local: "00:00",
        end_local: "03:59",
        dayTypeStartUtcMs: Date.parse("2024-01-08T00:00:00Z"),
        dayTypeEndUtcMs: Date.parse("2024-01-08T03:59:00Z"),
        fromPrevDay: false,
        fromPrevSchedulerDay: true,
      })
    );
  });

  it("excludes Monday scheduler-day windows that occur on Tuesday early morning", () => {
    const windows = visibleWindowsForUtcDay({
      dayKey: "2024-01-08",
      currentSchedulerWindows: [
        windowLite({
          id: "monday-daytime",
          dayTypeStartUtcMs: Date.parse("2024-01-08T10:00:00Z"),
          dayTypeEndUtcMs: Date.parse("2024-01-08T11:00:00Z"),
        }),
        windowLite({
          id: "monday-owned-tuesday-early",
          dayTypeStartUtcMs: Date.parse("2024-01-09T00:30:00Z"),
          dayTypeEndUtcMs: Date.parse("2024-01-09T03:30:00Z"),
        }),
      ],
    });

    expect(windows.map((window) => window.id)).toEqual(["monday-daytime"]);
  });

  it("clips a 10 PM to 12:30 AM block across Monday and Tuesday visible days", () => {
    const overnight = windowLite({
      id: "monday-overnight",
      dayTypeTimeBlockId: "dttb-overnight",
      start_local: "22:00",
      end_local: "00:30",
      dayTypeStartUtcMs: Date.parse("2024-01-08T22:00:00Z"),
      dayTypeEndUtcMs: Date.parse("2024-01-09T00:30:00Z"),
    });

    const monday = visibleWindowsForUtcDay({
      dayKey: "2024-01-08",
      currentSchedulerWindows: [overnight],
    });
    const tuesday = visibleWindowsForUtcDay({
      dayKey: "2024-01-09",
      previousSchedulerWindows: [overnight],
    });

    expect(monday).toHaveLength(1);
    expect(monday[0]).toEqual(
      expect.objectContaining({
        id: expect.stringContaining("monday-overnight::visible-2024-01-08"),
        sourceWindowId: "monday-overnight",
        dayTypeTimeBlockId: "dttb-overnight",
        start_local: "22:00",
        end_local: "00:00",
        dayTypeStartUtcMs: Date.parse("2024-01-08T22:00:00Z"),
        dayTypeEndUtcMs: Date.parse("2024-01-09T00:00:00Z"),
        fromPrevDay: false,
        fromPrevSchedulerDay: false,
      })
    );

    expect(tuesday).toHaveLength(1);
    expect(tuesday[0]).toEqual(
      expect.objectContaining({
        id: expect.stringContaining("monday-overnight::visible-2024-01-09"),
        sourceWindowId: "monday-overnight",
        dayTypeTimeBlockId: "dttb-overnight",
        start_local: "00:00",
        end_local: "00:30",
        dayTypeStartUtcMs: Date.parse("2024-01-09T00:00:00Z"),
        dayTypeEndUtcMs: Date.parse("2024-01-09T00:30:00Z"),
        fromPrevDay: false,
        fromPrevSchedulerDay: true,
      })
    );
  });
});
