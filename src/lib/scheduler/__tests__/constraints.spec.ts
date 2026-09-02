import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { passesTimeBlockConstraints } from "../constraints";
import { fetchCompatibleWindowsForItem } from "../reschedule";
import type { WindowLite } from "../repo";
import type { Database } from "../../../../types/supabase";

type SchedulerClient = SupabaseClient<Database>;

describe("passesTimeBlockConstraints", () => {
  it("allows when allow_all flags are true", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT", skillId: "skill-1", areaId: "money", monumentId: "mon-1" },
      {
        allowAllHabitTypes: true,
        allowAllSkills: true,
        allowAllAreas: true,
        allowAllMonuments: true,
      }
    );
    expect(result).toBe(true);
  });

  it("allows RELAXER habits in BREAK windows", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "RELAXER" },
      { window_kind: "BREAK" }
    );
    expect(result).toBe(true);
  });

  it("rejects non-RELAXER habits in BREAK windows", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT" },
      { window_kind: "BREAK" }
    );
    expect(result).toBe(false);
  });

  it("rejects projects from BREAK windows", () => {
    const result = passesTimeBlockConstraints(
      { isProject: true },
      { window_kind: "BREAK" }
    );
    expect(result).toBe(false);
  });

  it("treats MEAL windows like BREAK windows", () => {
    expect(
      passesTimeBlockConstraints({ habitType: "RELAXER" }, { window_kind: "MEAL" })
    ).toBe(true);
    expect(
      passesTimeBlockConstraints({ habitType: "HABIT" }, { window_kind: "MEAL" })
    ).toBe(false);
    expect(
      passesTimeBlockConstraints({ isProject: true }, { window_kind: "MEAL" })
    ).toBe(false);
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

  it("passes area-only scope constraints by candidate area", () => {
    expect(
      passesTimeBlockConstraints(
        { areaId: "money" },
        { allowAllAreas: false, allowedAreaIds: ["money"] }
      )
    ).toBe(true);
    expect(
      passesTimeBlockConstraints(
        { areaId: "body" },
        { allowAllAreas: false, allowedAreaIds: ["money"] }
      )
    ).toBe(false);
  });

  it("passes monument-only scope constraints by candidate monument", () => {
    expect(
      passesTimeBlockConstraints(
        { monumentId: "mon-1" },
        { allowAllMonuments: false, allowedMonumentIds: ["mon-1"] }
      )
    ).toBe(true);
    expect(
      passesTimeBlockConstraints(
        { monumentId: "mon-2" },
        { allowAllMonuments: false, allowedMonumentIds: ["mon-1"] }
      )
    ).toBe(false);
  });

  it("ORs area and monument selections inside shared scope", () => {
    const window = {
      allowAllAreas: false,
      allowAllMonuments: false,
      allowedAreaIds: ["money"],
      allowedMonumentIds: ["creator"],
    };
    expect(passesTimeBlockConstraints({ areaId: "money", monumentId: "other" }, window)).toBe(true);
    expect(passesTimeBlockConstraints({ areaId: "body", monumentId: "creator" }, window)).toBe(true);
    expect(passesTimeBlockConstraints({ areaId: "body", monumentId: "other" }, window)).toBe(false);
    expect(passesTimeBlockConstraints({ areaId: "money", monumentId: "creator" }, window)).toBe(true);
  });

  it("keeps skill constraints independent from scope constraints", () => {
    expect(
      passesTimeBlockConstraints(
        { skillId: "skill-1", areaId: "money" },
        {
          allowAllSkills: false,
          allowedSkillIds: ["skill-2"],
          allowAllAreas: false,
          allowedAreaIds: ["money"],
        }
      )
    ).toBe(false);
  });

  it("keeps habit constraints independent from scope constraints", () => {
    expect(
      passesTimeBlockConstraints(
        { habitType: "HABIT", areaId: "money" },
        {
          allowAllHabitTypes: false,
          allowedHabitTypes: ["PRACTICE"],
          allowAllAreas: false,
          allowedAreaIds: ["money"],
        }
      )
    ).toBe(false);
  });

  it("keeps legacy monument-only windows working", () => {
    expect(
      passesTimeBlockConstraints(
        { monumentId: "mon-1" },
        { allowAllMonuments: false, allowedMonumentIds: ["mon-1"] }
      )
    ).toBe(true);
  });

  it("does not derive areas from skills", () => {
    expect(
      passesTimeBlockConstraints(
        { skillId: "money-skill" },
        { allowAllAreas: false, allowedAreaIds: ["money"] }
      )
    ).toBe(false);
  });

  it("uses cached sets when provided instead of arrays", () => {
    const result = passesTimeBlockConstraints(
      { habitType: "HABIT", skillId: "skill-a", areaId: "money", monumentId: "mon-1" },
      {
        allowAllHabitTypes: false,
        allowAllSkills: false,
        allowAllAreas: false,
        allowAllMonuments: false,
        allowedHabitTypesSet: new Set(["HABIT"]),
        allowedSkillIdsSet: new Set(["skill-a"]),
        allowedAreaIdsSet: new Set(["money"]),
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
      {} as SchedulerClient,
      new Date("2024-01-01T00:00:00Z"),
      { energy: "NO", duration_min: 30, skillId: "skill-a" },
      "UTC",
      { preloadedWindows: windows }
    );

    expect(result.windows.map((w) => w.id)).toEqual(["win-allow"]);
  });

  it("matches windows when matching skills are provided via skillIds", async () => {
    const windows: WindowLite[] = [
      {
        id: "win-skill-ids",
        ...baseWindow(),
        allowAllSkills: false,
        allowedSkillIds: ["skill-x"],
        allowAllHabitTypes: true,
        allowAllMonuments: true,
      },
    ];

    const result = await fetchCompatibleWindowsForItem(
      {} as SchedulerClient,
      new Date("2024-01-01T00:00:00Z"),
      { energy: "NO", duration_min: 30, skillIds: ["skill-x"] },
      "UTC",
      { preloadedWindows: windows }
    );

    expect(result.windows.map((w) => w.id)).toEqual(["win-skill-ids"]);
  });
});
