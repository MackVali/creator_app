import { describe, it, expect } from "vitest";
import {
  computeSyncHabitDuration,
  computeTimelineLayoutForSyncHabits,
} from "@/lib/scheduler/syncLayout";

describe("computeSyncHabitDuration", () => {
  const minDurationMs = 30 * 60 * 1000; // 30 minutes

  it("returns null when no contiguous coverage reaches minDuration", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T12:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T10:15:00Z"),
        id: "1",
      },
      {
        start: new Date("2025-01-01T11:00:00Z"),
        end: new Date("2025-01-01T11:15:00Z"),
        id: "2",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toBeNull();
    expect(result.finalEnd).toBeNull();
    expect(result.pairedInstances).toEqual([]);
  });

  it("returns overlap segment when first candidate alone exceeds minDuration", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T12:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T10:45:00Z"),
        id: "1",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toEqual(new Date("2025-01-01T10:00:00Z"));
    expect(result.finalEnd).toEqual(new Date("2025-01-01T10:45:00Z"));
    expect(result.pairedInstances).toEqual(["1"]);
  });

  it("accumulates contiguous segments until minDuration is met", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T12:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T10:15:00Z"),
        id: "1",
      },
      {
        start: new Date("2025-01-01T10:15:00Z"), // Touching edge
        end: new Date("2025-01-01T10:30:00Z"),
        id: "2",
      },
      {
        start: new Date("2025-01-01T10:30:00Z"),
        end: new Date("2025-01-01T10:45:00Z"),
        id: "3",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toEqual(new Date("2025-01-01T10:00:00Z"));
    expect(result.finalEnd).toEqual(new Date("2025-01-01T10:30:00Z"));
    expect(result.pairedInstances).toEqual(["1", "2"]);
  });

  it("resets accumulation on gaps and finds new contiguous span", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T12:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T10:10:00Z"),
        id: "1",
      },
      // Gap here
      {
        start: new Date("2025-01-01T10:30:00Z"),
        end: new Date("2025-01-01T10:45:00Z"),
        id: "2",
      },
      {
        start: new Date("2025-01-01T10:45:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        id: "3",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toEqual(new Date("2025-01-01T10:30:00Z"));
    expect(result.finalEnd).toEqual(new Date("2025-01-01T11:00:00Z"));
    expect(result.pairedInstances).toEqual(["2", "3"]);
  });

  it("handles equality at boundaries (touching edges) as contiguous", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T12:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T10:15:00Z"),
        id: "1",
      },
      {
        start: new Date("2025-01-01T10:15:00Z"), // Exactly touching
        end: new Date("2025-01-01T10:45:00Z"),
        id: "2",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toEqual(new Date("2025-01-01T10:00:00Z"));
    expect(result.finalEnd).toEqual(new Date("2025-01-01T10:45:00Z"));
    expect(result.pairedInstances).toEqual(["1", "2"]);
  });

  it("ignores candidates with no overlap", () => {
    const syncWindow = {
      start: new Date("2025-01-01T10:00:00Z"),
      end: new Date("2025-01-01T11:00:00Z"),
    };
    const candidates = [
      {
        start: new Date("2025-01-01T09:00:00Z"),
        end: new Date("2025-01-01T09:30:00Z"),
        id: "1",
      },
      {
        start: new Date("2025-01-01T11:00:00Z"),
        end: new Date("2025-01-01T11:30:00Z"),
        id: "2",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toBeNull();
    expect(result.finalEnd).toBeNull();
    expect(result.pairedInstances).toEqual([]);
  });

  it("handles invalid sync window", () => {
    const syncWindow = {
      start: new Date("2025-01-01T12:00:00Z"),
      end: new Date("2025-01-01T10:00:00Z"), // end before start
    };
    const candidates = [
      {
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        id: "1",
      },
    ];

    const result = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates,
    });

    expect(result.finalStart).toBeNull();
    expect(result.finalEnd).toBeNull();
    expect(result.pairedInstances).toEqual([]);
  });
});

describe("computeTimelineLayoutForSyncHabits", () => {
  it("splits normal Events by SYNC overlap range and keeps touching edges full width", () => {
    const result = computeTimelineLayoutForSyncHabits({
      habitPlacements: [
        {
          habitType: "CHORE",
          instanceId: "wash-dishes",
          start: new Date("2026-05-07T20:00:00Z"),
          end: new Date("2026-05-07T20:20:00Z"),
        },
        {
          habitType: "CHORE",
          instanceId: "wash-bedsheets",
          start: new Date("2026-05-07T22:25:00Z"),
          end: new Date("2026-05-07T22:40:00Z"),
        },
        {
          habitType: "SYNC",
          instanceId: "nma",
          start: new Date("2026-05-07T20:00:00Z"),
          end: new Date("2026-05-07T22:25:00Z"),
        },
        {
          habitType: "SYNC",
          instanceId: "podcast",
          start: new Date("2026-05-07T21:00:00Z"),
          end: new Date("2026-05-07T22:25:00Z"),
        },
      ],
      projectInstances: [],
    });

    expect(result.habitLayouts).toEqual([
      "paired-left",
      "full",
      "paired-right",
      "paired-right",
    ]);
    expect(result.syncHabitLaneLayouts.get(2)).toEqual({
      lane: 0,
      laneCount: 2,
    });
    expect(result.syncHabitLaneLayouts.get(3)).toEqual({
      lane: 1,
      laneCount: 2,
    });
  });
});
