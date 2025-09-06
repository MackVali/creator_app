import { describe, it, expect } from "vitest";
import { placeByEnergyWeight, type WindowLite } from "../../../src/lib/scheduler/placer";

describe("placeByEnergyWeight", () => {
  it("falls back to lower-energy tasks when no equal energy task exists", () => {
    const date = new Date("2024-01-01T00:00:00");
    const windows: WindowLite[] = [
      { id: "w1", label: "High", energy: "HIGH", start_local: "09:00", end_local: "10:00" },
      { id: "w2", label: "Low", energy: "LOW", start_local: "10:00", end_local: "11:00" },
    ];
    const tasks = [
      { id: "t1", name: "M", priority: "LOW", stage: "Prepare", duration_min: 60, energy: "MEDIUM", weight: 1 },
      { id: "t2", name: "L", priority: "LOW", stage: "Prepare", duration_min: 60, energy: "LOW", weight: 1 },
    ];
    const result = placeByEnergyWeight(tasks, windows, date);
    expect(result.placements).toHaveLength(2);
    const map = Object.fromEntries(result.placements.map(p => [p.taskId, p.windowId]));
    expect(map["t1"]).toBe("w1");
    expect(map["t2"]).toBe("w2");
  });

  it("does not place higher-energy tasks into lower-energy windows", () => {
    const date = new Date("2024-01-01T00:00:00");
    const windows: WindowLite[] = [
      { id: "w1", label: "Low", energy: "LOW", start_local: "09:00", end_local: "10:00" },
    ];
    const tasks = [
      { id: "t1", name: "H", priority: "LOW", stage: "Prepare", duration_min: 60, energy: "HIGH", weight: 1 },
    ];
    const result = placeByEnergyWeight(tasks, windows, date);
    expect(result.placements).toHaveLength(0);
    expect(result.unplaced).toEqual([{ taskId: "t1", reason: "no-window" }]);
  });
});

