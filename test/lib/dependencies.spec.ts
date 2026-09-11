import { describe, expect, it } from "vitest";
import {
  evaluateDependencies,
  wouldCreateItemDependencyCycle,
  type DependencyRecord,
} from "@/lib/dependencies";

const dependency = (
  overrides: Partial<DependencyRecord>
): DependencyRecord => ({
  id: overrides.id ?? crypto.randomUUID(),
  user_id: "user-1",
  source_type: overrides.source_type ?? "PROJECT",
  source_id: overrides.source_id ?? "source-1",
  dependency_type: overrides.dependency_type ?? "ITEM",
  depends_on_id: overrides.depends_on_id ?? "source-2",
  not_before_date: overrides.not_before_date ?? null,
  weekdays: overrides.weekdays ?? null,
  created_at: "2026-09-11T00:00:00.000Z",
});

describe("dependency evaluation", () => {
  it("blocks before a Date dependency", () => {
    const result = evaluateDependencies({
      dependencies: [
        dependency({
          dependency_type: "DATE",
          depends_on_id: null,
          not_before_date: "2026-09-20",
        }),
      ],
      targetDate: new Date("2026-09-19T12:00:00Z"),
      timeZone: "UTC",
      isItemDependencySatisfied: () => true,
    });

    expect(result.eligible).toBe(false);
    expect(result.failures[0]).toMatchObject({
      type: "DATE",
      availableDate: "2026-09-20",
    });
  });

  it("allows on and after a Date dependency", () => {
    const dateDependency = dependency({
      dependency_type: "DATE",
      depends_on_id: null,
      not_before_date: "2026-09-20",
    });

    expect(
      evaluateDependencies({
        dependencies: [dateDependency],
        targetDate: new Date("2026-09-20T04:00:00Z"),
        timeZone: "UTC",
        isItemDependencySatisfied: () => true,
      }).eligible
    ).toBe(true);
    expect(
      evaluateDependencies({
        dependencies: [dateDependency],
        targetDate: new Date("2026-09-21T04:00:00Z"),
        timeZone: "UTC",
        isItemDependencySatisfied: () => true,
      }).eligible
    ).toBe(true);
  });

  it("blocks wrong weekdays and allows selected weekdays", () => {
    const weekdayDependency = dependency({
      dependency_type: "WEEKDAY",
      depends_on_id: null,
      weekdays: [0, 6],
    });

    expect(
      evaluateDependencies({
        dependencies: [weekdayDependency],
        targetDate: new Date("2026-09-14T12:00:00Z"),
        timeZone: "UTC",
        isItemDependencySatisfied: () => true,
      }).eligible
    ).toBe(false);
    expect(
      evaluateDependencies({
        dependencies: [weekdayDependency],
        targetDate: new Date("2026-09-13T12:00:00Z"),
        timeZone: "UTC",
        isItemDependencySatisfied: () => true,
      }).eligible
    ).toBe(true);
  });

  it("uses the supplied Creator timezone instead of machine local time", () => {
    const fridayOnly = dependency({
      dependency_type: "WEEKDAY",
      depends_on_id: null,
      weekdays: [5],
    });

    const result = evaluateDependencies({
      dependencies: [fridayOnly],
      targetDate: new Date("2026-09-12T06:00:00Z"),
      timeZone: "America/Los_Angeles",
      isItemDependencySatisfied: () => true,
    });

    expect(result.eligible).toBe(true);
  });

  it("requires every dependency to pass", () => {
    const result = evaluateDependencies({
      dependencies: [
        dependency({
          dependency_type: "ITEM",
          depends_on_id: "project-a",
        }),
        dependency({
          dependency_type: "WEEKDAY",
          depends_on_id: null,
          weekdays: [1],
        }),
      ],
      targetDate: new Date("2026-09-14T12:00:00Z"),
      timeZone: "UTC",
      isItemDependencySatisfied: () => false,
    });

    expect(result.eligible).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      type: "ITEM",
      waitingForId: "project-a",
    });
  });
});

describe("dependency cycle detection", () => {
  it("rejects self dependencies", () => {
    expect(
      wouldCreateItemDependencyCycle([], {
        sourceId: "a",
        dependsOnId: "a",
      })
    ).toBe(true);
  });

  it("rejects direct cycles", () => {
    expect(
      wouldCreateItemDependencyCycle(
        [{ sourceId: "a", dependsOnId: "b" }],
        { sourceId: "b", dependsOnId: "a" }
      )
    ).toBe(true);
  });

  it("rejects multi-hop cycles", () => {
    expect(
      wouldCreateItemDependencyCycle(
        [
          { sourceId: "a", dependsOnId: "b" },
          { sourceId: "b", dependsOnId: "c" },
        ],
        { sourceId: "c", dependsOnId: "a" }
      )
    ).toBe(true);
  });

  it("allows multiple non-cyclic Item dependencies", () => {
    expect(
      wouldCreateItemDependencyCycle(
        [
          { sourceId: "x", dependsOnId: "a" },
          { sourceId: "x", dependsOnId: "b" },
        ],
        { sourceId: "x", dependsOnId: "c" }
      )
    ).toBe(false);
  });
});
