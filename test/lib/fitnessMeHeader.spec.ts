import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");

function sourceSlice(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("Fitness ME My Fitness header", () => {
  const meContent = sourceSlice(
    "function renderFitnessMeContent",
    "function renderFitnessTabContent",
  );
  const headerContent = sourceSlice(
    "function renderFitnessMyHeader",
    "function renderFitnessMeContent",
  );

  it("renders the no-profile actions without Manual / Untracked", () => {
    expect(headerContent).toContain("My Fitness");
    expect(headerContent).toContain("Not set up");
    expect(headerContent).toContain("Set up profile");
    expect(headerContent).toContain("Choose a plan");
    expect(meContent).not.toContain("Manual / Untracked");
  });

  it("renders saved profile summary and edit action", () => {
    expect(headerContent).toContain("activeFitnessProfile.primaryGoal");
    expect(headerContent).toContain("activeFitnessProfile.experienceLevel");
    expect(headerContent).toContain("activeFitnessProfile.equipment");
    expect(headerContent).toContain("Edit profile");
  });

  it("restores saved profile values when editing", () => {
    const editHandler = sourceSlice(
      "function openFitnessProfileSheet",
      "function updateFitnessProfileDraft",
    );

    expect(editHandler).toContain(
      "setFitnessProfileDraft(getFitnessProfileDraftFromProfile(activeFitnessProfile))",
    );
  });

  it("switches Choose a plan and Change plan to Plans", () => {
    expect(headerContent).toContain("label: \"Choose a plan\"");
    expect(headerContent).toContain("label: \"Change plan\"");
    expect(headerContent).toContain("selectFitnessAction(\"plans\")");
  });

  it("keeps the active workout Resume card beneath the header", () => {
    expect(meContent.indexOf("renderFitnessMyHeader()")).toBeGreaterThanOrEqual(0);
    expect(meContent.indexOf("Workout in progress")).toBeGreaterThan(
      meContent.indexOf("renderFitnessMyHeader()"),
    );
    expect(meContent).toContain("Resume workout");
  });

  it("keeps loading a routine from activating a plan", () => {
    const loadFirstWorkout = sourceSlice(
      "function loadFirstFitnessPlanWorkout",
      "function loadNextFitnessActivePlanWorkout",
    );

    expect(loadFirstWorkout).toContain("loadFitnessRoutineTemplate");
    expect(loadFirstWorkout).not.toContain("buildFitnessActivePlan");
    expect(loadFirstWorkout).not.toContain("fitnessActivePlan");
  });
});
