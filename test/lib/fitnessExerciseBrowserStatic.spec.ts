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

  it("renders the local search and workout context action", () => {
    expect(exerciseBrowser).toContain("Search exercises...");
    expect(exerciseBrowser).toContain("View workout");
    expect(exerciseBrowser).toContain('selectFitnessAction("start")');
    expect(exerciseBrowser).toContain("getCurrentFitnessWorkoutName()");
  });

  it("keeps existing favorite, workout toggle, detail, and custom actions wired", () => {
    expect(exerciseBrowser).toContain("toggleFavoriteFitnessExercise(exercise.name)");
    expect(exerciseBrowser).toContain("toggleFitnessWorkoutExercise(exercise)");
    expect(exerciseBrowser).toContain("openFitnessExerciseDetail");
    expect(exerciseBrowser).toContain("renderFitnessWorkoutDetailControls(exercise)");
    expect(exerciseBrowser).toContain("editCustomFitnessExercise(customExercise)");
    expect(exerciseBrowser).toContain("duplicateCustomFitnessExercise(customExercise)");
    expect(exerciseBrowser).toContain("removeCustomFitnessExercise(customExercise)");
  });

  it("filters the existing movement hierarchy without replacing accordion state", () => {
    expect(exerciseBrowser).toContain("visibleFitnessMovementGroups");
    expect(exerciseBrowser).toContain("allFitnessMovementGroups.flatMap");
    expect(exerciseBrowser).toContain("expandedFitnessMovementGroups.has(movementGroup.label)");
    expect(exerciseBrowser).toContain("expandedFitnessSubcategories.has(subcategoryKey)");
    expect(exerciseBrowser).toContain("movementGroup.subcategories.flatMap");
  });
});
