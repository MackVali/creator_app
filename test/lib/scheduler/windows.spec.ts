import { describe, it, expect } from "vitest";
import { genSlots, type WindowRow } from "../../../src/lib/scheduler/windows";

describe("genSlots", () => {
  it("splits windows into expected slots", () => {
    const date = new Date("2023-01-01T00:00:00");
    const windows: WindowRow[] = [
      {
        id: "w1",
        created_at: "",
        user_id: "u1",
        label: "Morning",
        days_of_week: [0],
        start_local: "06:00",
        end_local: "07:00",
        energy_cap: null,
      },
    ];
    const slots = genSlots(date, windows);
    expect(slots).toHaveLength(12);
    expect(slots[0].start.getHours()).toBe(6);
    expect(slots[0].start.getMinutes()).toBe(0);
    expect(slots[11].end.getHours()).toBe(7);
    expect(slots[11].end.getMinutes()).toBe(0);
    expect(slots.map((s) => s.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => i)
    );
  });
});

