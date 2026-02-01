import { describe, expect, it } from "vitest";
import { passesTimeBlockConstraints } from "../constraints";
import { fetchCompatibleWindowsForItem } from "../reschedule";
import type { WindowLite } from "../repo";

describe("passesTimeBlockConstraints", () => {
  it("allows when allow_all flags are true", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT", skillId: "skill-1", monumentId: "mon-1" },
      {
        allowAllHabitTypes: true,
        allowAllSkills: true,
        allowAllMonuments: true,
      }
    );
    expect(result).toBe(true);
  });

  it("fails when habit whitelist empty and allow_all_habit_types is false", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT" },
      { allowAllHabitTypes: false, allowedHabitTypes: [] }
    );
    expect(result).toBe(false);
  });

  it("fails when habit type is not allowed", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "RELAXER" },
      {
        allowAllHabitTypes: false,
        allowedHabitTypes: ["HABIT"],
      }
    );
    expect(result).toBe(false);
  });

  it("allows non-habit items when habit whitelist exists", () => {
    const result = passesTimeBlockConstraints(
      {},
      {
        allowAllHabitTypes: false,
        allowedHabitTypes: ["HABIT"],
      }
    );
    expect(result).toBe(true);
  });

  it("passes when skill whitelist contains the item skill", () => {
    const result = passesTimeBlockConstraints(
      { skillId: "abc" },
      { allowAllSkills: false, allowedSkillIds: ["abc"] }
    );
    expect(result).toBe(true);
  });

  it("passes when monument resolved from skillMonumentId", () => {
    const result = passesTimeBlockConstraints(
      { skillMonumentId: "mon-1" },
      { allowAllMonuments: false, allowedMonumentIds: ["mon-1"] }
    );
    expect(result).toBe(true);
  });

  it("uses cached sets when provided instead of arrays", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT", skillId: "skill-a", monumentId: "mon-1" },
      {
        allowAllHabitTypes: false,
        allowAllSkills: false,
        allowAllMonuments: false,
        allowedHabitTypesSet: new Set(["HABIT"]),
        allowedSkillIdsSet: new Set(["skill-a"]),
        allowedMonumentIdsSet: new Set(["mon-1"]),
      }
    );
    expect(result).toBe(true);
  });
});

describe("fetchCompatibleWindowsForItem with constraints", () => {
  const baseWindow = (): Omit<WindowLite, "id"> => ({
    label: "w",
    energy: "NO",
    start_local: "09:00",
    end_local: "10:00",
    days: null,
    location_context_id: null,
    location_context_value: null,
    location_context_name: null,
    window_kind: "DEFAULT",
  });

  it("filters windows by allowed skills", async () => {
    const windows: WindowLite[] = [
      {
        id: "win-allow",
        ...baseWindow(),
        allowAllSkills: false,
        allowedSkillIds: ["skill-a"],
        allowAllHabitTypes: true,
        allowAllMonuments: true,
      },
      {
        id: "win-block",
        ...baseWindow(),
        allowAllSkills: false,
        allowedSkillIds: ["skill-b"],
        allowAllHabitTypes: true,
        allowAllMonuments: true,
      },
    ];

    const result = await fetchCompatibleWindowsForItem(
      {} as any,
      new Date("2024-01-01T00:00:00Z"),
      { energy: "NO", duration_min: 30, skillId: "skill-a" },
      "UTC",
      { preloadedWindows: windows }
    );

    expect(result.windows.map((w) => w.id)).toEqual(["win-allow"]);
  });
});
