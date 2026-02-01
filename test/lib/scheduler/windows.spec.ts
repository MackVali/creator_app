import { describe, it, expect } from "vitest";
import { genSlots, type WindowRow } from "../../../src/lib/scheduler/windows";

describe("genSlots", () => {
  it("splits windows into expected slots", () => {
    const date = new Date("2023-01-01T12:00:00Z");
    const windows: WindowRow[] = [
      {
        id: "w1",
        created_at: "",
        user_id: "u1",
        label: "Morning",
        days: [0],
        start_local: "06:00",
        end_local: "07:00",
        energy: "NO",
      },
    ];
    const slots = genSlots(date, windows, "UTC");
    expect(slots).toHaveLength(12);
    expect(slots[0].start.getUTCHours()).toBe(6);
    expect(slots[0].start.getUTCMinutes()).toBe(0);
    expect(slots[11].end.getUTCHours()).toBe(7);
    expect(slots[11].end.getUTCMinutes()).toBe(0);
    expect(slots.map((s) => s.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => i)
    );
  });

  it("handles windows crossing midnight from previous day", () => {
    const date = new Date("2023-01-02T12:00:00Z");
    const windows: (WindowRow & { fromPrevDay?: boolean })[] = [
      {
        id: "w1",
        created_at: "",
        user_id: "u1",
        label: "Night",
        days: [1],
        start_local: "22:00",
        end_local: "10:00",
        energy: "NO",
        fromPrevDay: true,
      },
    ];
    const slots = genSlots(date, windows, "UTC");
    expect(slots).toHaveLength(72);
    expect(slots[0].start.getUTCHours()).toBe(4);
    expect(slots[slots.length - 1].end.getUTCHours()).toBe(10);
  });
});
