import { describe, it, expect } from "vitest";
import { placeByEnergyWeight, type WindowLite } from "../../../src/lib/scheduler/placer";

describe("placeByEnergyWeight", () => {
  it("only schedules tasks into windows with matching energy", () => {
    const date = new Date("2024-01-01T00:00:00");
    const windows: WindowLite[] = [
      { id: "w1", label: "Low", energy: "LOW", start_local: "09:00", end_local: "10:00" },
      { id: "w2", label: "High", energy: "HIGH", start_local: "10:00", end_local: "11:00" },
    ];
    const tasks = [
      { id: "t1", name: "L", priority: "LOW", stage: "Prepare", duration_min: 30, energy: "LOW", weight: 1 },
      { id: "t2", name: "H", priority: "LOW", stage: "Prepare", duration_min: 30, energy: "HIGH", weight: 1 },
      { id: "t3", name: "M", priority: "LOW", stage: "Prepare", duration_min: 30, energy: "MEDIUM", weight: 1 },
    ];
    const result = placeByEnergyWeight(tasks, windows, date);
    expect(result.placements).toHaveLength(2);
    const map = Object.fromEntries(result.placements.map(p => [p.taskId, p.windowId]));
    expect(map["t1"]).toBe("w1");
    expect(map["t2"]).toBe("w2");
    expect(result.unplaced).toEqual([{ taskId: "t3", reason: "no-window" }]);
  });
});
