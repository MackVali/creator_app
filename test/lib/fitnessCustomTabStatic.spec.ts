import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");

function sourceSlice(start: string, end: string) {
  return sliceWithin(source, start, end);
}

function sliceWithin(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = haystack.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);

  return haystack.slice(startIndex, endIndex);
}

describe("Fitness Custom tab", () => {
  const customIntro = sourceSlice(
    "function renderFitnessCustomIntro",
    "function renderFitnessRoutineBrowser",
  );
  const customHub = sliceWithin(
    customIntro,
    '<div className="grid gap-2">',
    '{fitnessCustomFlow === "exercise"',
  );
  const databaseVisibility = sourceSlice(
    "const shouldShowFitnessEntryFields",
    "const isNutritionSearchMode",
  );

  it("shows exactly the three custom creation actions", () => {
    const hubTitles = [...customHub.matchAll(/title: "([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(hubTitles).toEqual([
      "Create Exercise",
      "Create Routine",
      "Create Plan",
    ]);
  });

  it("does not expose the old manual Fitness database fallback from Custom", () => {
    expect(customIntro).not.toContain("Manual Entry");
    expect(customIntro).not.toContain("Manual fitness log");
    expect(customIntro).not.toContain("raw Fitness database fallback");
    expect(customIntro).not.toContain("original Fitness database entry fields");
    expect(customIntro).not.toContain('flow: "manual"');
    expect(customIntro).not.toContain('fitnessCustomFlow === "manual"');
    expect(source).not.toContain('"manual";');
  });

  it("keeps default Fitness database fields closed from the Custom tab", () => {
    expect(databaseVisibility).toContain(
      "const shouldShowFitnessEntryFields = !isDefaultFitnessDatabase;",
    );
    expect(databaseVisibility).toContain(
      "!isDefaultFitnessDatabase && !isNutritionRecipesEditorOpen",
    );
    expect(databaseVisibility).not.toContain("selectedFitnessAction");
    expect(databaseVisibility).not.toContain("fitnessCustomFlow");
  });
});
