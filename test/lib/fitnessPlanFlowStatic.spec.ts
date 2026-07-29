import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");
const planTemplateSource = readFileSync("src/lib/fitness/planTemplates.ts", "utf8");

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
  const setFrequency = sourceSlice(
    "function setFitnessPlanFrequency",
    "function getFitnessPlanResolvedRoutines",
  );
  const editActivePlan = sourceSlice(
    "function editFitnessActivePlanSchedule",
    "function toggleFitnessPlanWeekday",
  );
  const startActivation = sourceSlice(
    "function startFitnessPlanActivation",
    "function editFitnessActivePlanSchedule",
  );
  const toggleWeekday = sourceSlice(
    "function toggleFitnessPlanWeekday",
    "function loadFirstFitnessPlanWorkout",
  );
  const planSelectRow = sourceSlice(
    "function renderFitnessPlanSelectRow",
    "function renderFitnessPlanWeekdayRow",
  );
  const weekdayRow = sourceSlice(
    "function renderFitnessPlanWeekdayRow",
    "function renderFitnessPlanSettings",
  );
  const planSettings = sourceSlice(
    "function renderFitnessPlanSettings",
    "    return (\n      <div\n        className=\"fixed inset-0 z-[90]",
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
    expect(planBrowser).toContain("Template identity");
    expect(planBrowser).toContain("Training trajectory");
    expect(planBrowser).toContain("Rotation:");
    expect(planBrowser).toContain("Week {week.week}");
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

  it("renders compact plan settings dropdown rows for the live configuration", () => {
    expect(planBrowser).toContain("renderFitnessPlanSettings");
    expect(planSettings).toContain("Plan settings");
    expect(planSettings).toContain('label: "Days per week"');
    expect(planSettings).toContain('label: "Duration"');
    expect(planSettings).toContain('label: "Equipment"');
    expect(weekdayRow).toContain("Training days");
    expect(planSelectRow).toContain("<select");
    expect(planSettings).toContain("previewPlan.allowedDaysPerWeek.map");
    expect(planSettings).toContain("FITNESS_ACTIVE_PLAN_SESSION_DURATION_OPTIONS.map");
    expect(planSettings).toContain("FITNESS_EQUIPMENT_PROFILE_OPTIONS.map");
    expect(planBrowser).toContain("Use my profile");
    expect(planBrowser).toContain("Profile ·");
    expect(source).not.toContain("FitnessPlanPreviewEditor");
    expect(source).not.toContain("fitnessPlanPreviewEditor");
    expect(planBrowser).not.toContain("renderFitnessPlanMetricCell");
    expect(planBrowser).not.toContain("renderFitnessPlanPreviewEditor");
    expect(planBrowser).not.toContain("Recommended:");
  });

  it("keeps template identity fields passive", () => {
    expect(planBrowser).toContain("Primary goal");
    expect(planBrowser).toContain("Level");
    expect(planBrowser).toContain("Routine sequence");
    expect(planBrowser).toContain("Plan type");
    expect(planBrowser).toContain("Progression");
    expect(planBrowser).toContain("Review cadence");
    expect(planBrowser).not.toContain('id: "goal"');
    expect(planBrowser).not.toContain('id: "level"');
    expect(planBrowser).not.toContain('id: "routineSequence"');
  });

  it("starts from the current preview configuration without the old wizard", () => {
    expect(planBrowser).toContain("Save plan changes");
    expect(planBrowser).toContain("Replace current plan");
    expect(source).not.toContain('setFitnessPlanSheetStep("schedule")');
    expect(source).not.toContain('setFitnessPlanSheetStep("confirm")');
    expect(source).not.toContain("confirmFitnessPlanSchedule");
    expect(planBrowser).not.toContain("Workout duration");
    expect(planBrowser).not.toContain("Use my Fitness profile");
    expect(planBrowser).not.toContain("Continue");
    expect(planBrowser).not.toContain("Activate plan");
  });

  it("updates replacements, validation, and persistence from preview state", () => {
    expect(planBrowser).toContain("setFitnessPlanEquipmentSelection");
    expect(source).toContain("filterFitnessExerciseOverridesForEquipment");
    expect(planBrowser).toContain("replacementLabel");
    expect(planBrowser).toContain("Review replacements");
    expect(planBrowser).toContain("visibleFitnessPlanValidationMessage");
    expect(planBrowser).toContain(
      "Select ${targetDaysPerWeek - fitnessPlanWeekdays.length} more training",
    );
    expect(planBrowser).toContain(
      "Remove ${fitnessPlanWeekdays.length - targetDaysPerWeek} training",
    );
    expect(planBrowser).toContain("hasWeekdayError || isFitnessActivePlanSaving");
    expect(planBrowser).not.toContain("Flexible rotation");
    expect(planBrowser).not.toContain("Weekly schedule");
    expect(source).not.toContain("fitnessPlanScheduleMode");
    expect(setFrequency).not.toContain("setFitnessPlanWeekdays");
    expect(activatePlan).toContain("weekdays: fitnessPlanWeekdays");
    expect(activatePlan).toContain("sessionDurationMinutes: fitnessPlanSessionDurationMinutes");
    expect(activatePlan).toContain("equipmentProfile: fitnessPlanEquipmentProfile");
    expect(activatePlan).toContain("exerciseOverrides");
    expect(activatePlan).toContain("ensureFitnessActivePlanHabit");
  });

  it("uses red blocking validation treatment with reserved space", () => {
    expect(weekdayRow).toContain("border-red-300/[0.16]");
    expect(weekdayRow).toContain("bg-red-500/[0.08]");
    expect(planBrowser).toContain("h-[50px] border-t border-white/[0.045] px-4 py-2");
    expect(planBrowser).toContain("border-red-300/15 bg-red-500/10");
    expect(planBrowser).not.toContain("amber");
    expect(planBrowser).not.toContain("yellow");
    expect(planBrowser).not.toContain("orange");
  });

  it("keeps initial preview validation quiet until interaction or invalid activation", () => {
    expect(planBrowser).toContain("showWeekdayValidationError");
    expect(planBrowser).toContain("hasWeekdayError && fitnessPlanWeekdayValidationTouched");
    expect(source).toContain("setFitnessPlanWeekdayValidationTouched(false)");
    expect(startActivation).toContain("setFitnessPlanWeekdayValidationTouched(true)");
    expect(startActivation).toContain("setSubmitError(null)");
  });

  it("marks Training days invalid after frequency or weekday interaction", () => {
    expect(setFrequency).toContain("setFitnessPlanWeekdayValidationTouched(true)");
    expect(toggleWeekday).toContain("setFitnessPlanWeekdayValidationTouched(true)");
    expect(weekdayRow).toContain("showWeekdayValidationError");
    expect(weekdayRow).toContain("showWeekdayValidationError ? \"text-red-100/82\"");
  });

  it("renders trajectory from preview weekdays and active currentRoutineIndex", () => {
    expect(planBrowser).toContain("resolveFitnessPlanTrainingTrajectory");
    expect(planBrowser).toContain("weekdays: fitnessPlanWeekdays");
    expect(planBrowser).toContain("startRoutineIndex: trajectoryStartRoutineIndex");
    expect(planBrowser).toContain("activeFitnessPlan?.currentRoutineIndex ?? 0");
    expect(planBrowser).toContain("trainingTrajectory.map");
    expect(planBrowser).toContain("entry.routine.title");
  });

  it("no longer uses the numbered structure list as the main preview visualization", () => {
    expect(planBrowser).not.toContain("Plan structure");
    expect(planBrowser).not.toContain("Repeat continuously");
    expect(planBrowser).not.toContain("String(routineIndex + 1).padStart");
  });

  it("renders active plan surfaces and replacement confirmation", () => {
    expect(planBrowser).toContain("Active Plan");
    expect(planBrowser).toContain("Other Plans");
    expect(planBrowser).toContain("Load next workout");
    expect(planBrowser).toContain("Edit schedule");
    expect(planBrowser).toContain("Manage plan");
    expect(planBrowser).toContain("editFitnessActivePlanSchedule(activeFitnessPlan)");
    expect(planBrowser).toContain("Replace current plan");
    expect(source).toContain("label: \"Load next workout\"");
    expect(source).toContain("label: \"Edit schedule\"");
    expect(source).toContain("label: \"Change plan\"");
  });

  it("restores active plan values when editing the active plan", () => {
    expect(editActivePlan).toContain('setFitnessPlanSheetStep("preview")');
    expect(editActivePlan).toContain(
      "setFitnessPlanTargetDaysPerWeek(activePlan.targetDaysPerWeek)",
    );
    expect(editActivePlan).toContain("setFitnessPlanWeekdays");
    expect(editActivePlan).toContain(
      "setFitnessPlanSessionDurationMinutes(activePlan.sessionDurationMinutes)",
    );
    expect(editActivePlan).toContain(
      "setFitnessPlanEquipmentProfile(activePlan.equipmentProfile)",
    );
    expect(editActivePlan).toContain(
      "setFitnessPlanExerciseOverrides(activePlan.exerciseOverrides ?? [])",
    );
  });

  it("loads currentRoutineIndex without advancing it", () => {
    expect(activeNextRoutine).toContain("resolveFitnessPlanRoutineAtIndex");
    expect(planTemplateSource).toContain("currentRoutineIndex % routines.length");
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
