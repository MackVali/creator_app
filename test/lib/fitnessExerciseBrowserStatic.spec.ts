import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");

function sourceSlice(start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Fitness Exercises browser UI", () => {
  const exerciseBrowser = sourceSlice(
    "function renderFitnessExerciseBrowser",
    "function renderFitnessFavoritesBrowser",
  );

  it("renders the local exercise search", () => {
    expect(exerciseBrowser).toContain("Search exercises...");
  });

  it("keeps existing favorite, workout toggle, detail, and custom actions wired", () => {
    expect(exerciseBrowser).toContain("toggleFavoriteFitnessExercise");
    expect(exerciseBrowser).toContain("exercise.name");
    expect(exerciseBrowser).toContain("toggleFitnessWorkoutExercise");
    expect(exerciseBrowser).toContain("openFitnessExerciseDetail");
    expect(exerciseBrowser).toContain("renderBrowserStepper");
    expect(exerciseBrowser).toContain("bumpFitnessWorkoutExerciseDetail");
    expect(exerciseBrowser).toMatch(/editCustomFitnessExercise\(\s*customExercise,\s*\)/);
    expect(exerciseBrowser).toMatch(/duplicateCustomFitnessExercise\(\s*customExercise,\s*\)/);
    expect(exerciseBrowser).toMatch(/removeCustomFitnessExercise\(\s*customExercise,\s*\)/);
  });

  it("filters the existing movement hierarchy without replacing accordion state", () => {
    expect(exerciseBrowser).toContain("visibleFitnessMovementGroups");
    expect(exerciseBrowser).toContain("allFitnessMovementGroups.flatMap");
    expect(exerciseBrowser).toContain("movementGroup.subcategories.flatMap");
    expect(exerciseBrowser).toContain(".filter(matchesSearch)");
    expect(exerciseBrowser).toContain("expandedFitnessMovementGroups.has(movementGroup.label)");
    expect(exerciseBrowser).toContain("expandedFitnessSubcategories.has(subcategoryKey)");
  });

  it("does not render the redundant workout preview or exercise filter chips", () => {
    expect(exerciseBrowser).not.toContain("View workout");
    expect(exerciseBrowser).not.toContain("getCurrentFitnessWorkoutName()");
    expect(exerciseBrowser).not.toContain("exercises selected");
    expect(exerciseBrowser).not.toContain('selectFitnessAction("start")');
    expect(exerciseBrowser).not.toContain("selectedExerciseCount");
    expect(exerciseBrowser).not.toContain("filterChips");
    expect(exerciseBrowser).not.toContain("setFitnessExerciseBrowserFilter");
    expect(exerciseBrowser).not.toContain("fitnessExerciseBrowserFilter");
    expect(exerciseBrowser).not.toContain('"Upper Body"');
    expect(exerciseBrowser).not.toContain('"Lower Body"');
  });
});
