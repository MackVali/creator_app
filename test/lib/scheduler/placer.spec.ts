import { describe, it, expect } from "vitest";
import { placeByEnergyWeight, type WindowLite } from "../../../src/lib/scheduler/placer";
import { buildProjectItems } from "../../../src/lib/scheduler/projects";
import type { ProjectLite, TaskLite } from "../../../src/lib/scheduler/weight";

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

  it("places tasks into previous day's window slots after midnight", () => {
    const date = new Date("2024-01-02T12:00:00Z");
    const windows: WindowLite[] = [
      { id: "w1", label: "Night", energy: "LOW", start_local: "22:00", end_local: "06:00", fromPrevDay: true },
    ];
    const tasks = [
      { id: "t1", name: "T", priority: "LOW", stage: "Prepare", duration_min: 60, energy: "LOW", weight: 1 },
    ];
    const result = placeByEnergyWeight(tasks, windows, date);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].start.getUTCHours()).toBe(4);
    expect(result.placements[0].start.getUTCMinutes()).toBe(0);
  });

  it("places projects into matching-energy windows", () => {
    const date = new Date("2024-01-01T00:00:00");
    const windows: WindowLite[] = [
      { id: "wL", label: "Low", energy: "LOW", start_local: "09:00", end_local: "10:00" },
      { id: "wH", label: "High", energy: "HIGH", start_local: "10:00", end_local: "11:00" },
    ];
    const projects: ProjectLite[] = [
      { id: "p1", name: "Proj", priority: "LOW", stage: "RESEARCH", energy: null },
    ];
    const tasks: TaskLite[] = [
      { id: "t1", name: "T", priority: "LOW", stage: "Prepare", duration_min: 60, energy: "high", project_id: "p1" },
    ];
    const items = buildProjectItems(projects, tasks);
    const result = placeByEnergyWeight(items, windows, date);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({ taskId: "p1", windowId: "wH" });
  });

  it("places project by its own energy when it has no tasks", () => {
    const date = new Date("2024-01-01T00:00:00");
    const windows: WindowLite[] = [
      { id: "wN", label: "No", energy: "NO", start_local: "09:00", end_local: "10:00" },
      { id: "wU", label: "Ultra", energy: "ULTRA", start_local: "10:00", end_local: "11:00" },
    ];
    const projects: ProjectLite[] = [
      { id: "p1", name: "Proj", priority: "LOW", stage: "RESEARCH", energy: "ULTRA" },
    ];
    const items = buildProjectItems(projects, []);
    const result = placeByEnergyWeight(items, windows, date);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({ taskId: "p1", windowId: "wU" });
  });
});
