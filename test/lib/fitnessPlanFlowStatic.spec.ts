import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");

function sourceSlice(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("Fitness plan browser flow", () => {
  const planBrowser = sourceSlice(
    "function renderFitnessPlanBrowser",
    "function renderFitnessWorkoutDetailControls",
  );
  const loadFirstWorkout = sourceSlice(
    "function loadFirstFitnessPlanWorkout",
    "function loadNextFitnessActivePlanWorkout",
  );
  const activeNextRoutine = sourceSlice(
    "function getFitnessActivePlanNextRoutine",
    "function openFitnessPlanPreview",
  );
  const ordinaryRoutine = sourceSlice(
    "function selectFitnessRoutine",
    "function getFitnessPlanById",
  );
  const activatePlan = sourceSlice(
    "async function activateFitnessPlan",
    "function updateFitnessWorkoutExerciseDetail",
  );

  it("keeps plan cards compact and removes legacy setup pills", () => {
    expect(planBrowser).toContain("View plan");
    expect(planBrowser).toContain("openFitnessPlanPreview(plan)");
    expect(planBrowser).not.toContain("Plan setup");
    expect(planBrowser).not.toContain("Start Plan");
    expect(source).not.toContain("selectedFitnessPlanSetup");
    expect(source).not.toContain("updateSelectedFitnessPlanSetup");
  });

  it("opens a dedicated preview with first-workout preview and activation", () => {
    expect(planBrowser).toContain("Plan Preview");
    expect(planBrowser).toContain("Plan structure");
    expect(planBrowser).toContain("Progression");
    expect(planBrowser).toContain("Plan review after");
    expect(planBrowser).toContain("Preview first workout");
    expect(planBrowser).toContain("Start this plan");
  });

  it("does not activate a plan when previewing the first workout or using a routine", () => {
    expect(loadFirstWorkout).toContain("loadFitnessRoutineTemplate");
    expect(loadFirstWorkout).not.toContain("buildFitnessActivePlan");
    expect(loadFirstWorkout).not.toContain("setFitnessActivePlanOverride");
    expect(ordinaryRoutine).toContain("setSelectedFitnessPlanName(null)");
    expect(ordinaryRoutine).not.toContain("buildFitnessActivePlan");
  });

  it("supports flexible and weekly activation validation", () => {
    expect(planBrowser).toContain("Flexible rotation");
    expect(planBrowser).toContain("Weekly schedule");
    expect(planBrowser).toContain("Select exactly");
    expect(planBrowser).toContain("fitnessPlanScheduleMode === \"weekly\"");
    expect(activatePlan).toContain("weekdays: fitnessPlanWeekdays");
  });

  it("renders active plan surfaces and replacement confirmation", () => {
    expect(planBrowser).toContain("Active Plan");
    expect(planBrowser).toContain("Other Plans");
    expect(planBrowser).toContain("Load next workout");
    expect(planBrowser).toContain("Manage plan");
    expect(planBrowser).toContain("Replace current plan");
    expect(source).toContain("label: \"Load next workout\"");
    expect(source).toContain("label: \"Change plan\"");
  });

  it("loads currentRoutineIndex without advancing it", () => {
    expect(activeNextRoutine).toContain("plan.currentRoutineIndex % routines.length");
    expect(activeNextRoutine).not.toContain("currentRoutineIndex +=");
    expect(activeNextRoutine).not.toContain("completedWorkoutCount +=");
  });

  it("keeps no-profile plan browsing available", () => {
    expect(planBrowser).toContain("getFitnessPlanMatchLabel(plan, activeFitnessProfile)");
    expect(planBrowser).toContain(
      "Set up your Fitness profile for personalized matching",
    );
  });
});
