import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduleSource = readFileSync(
  "src/app/(app)/schedule/ScheduleTabContent.tsx",
  "utf8",
);
const matrixSource = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8",
);
const noteSheetSource = readFileSync(
  "src/components/notes/NoteSlashTextarea.tsx",
  "utf8",
);
const topNavSource = readFileSync("components/TopNav.tsx", "utf8");

function functionBlock(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

function sourceSlice(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThanOrEqual(0);
  return source.slice(start, end);
}

function scheduledFitnessLoaderBlock() {
  return sourceSlice(
    noteSheetSource,
    "function loadScheduledFitnessPlanWorkout",
    "\n\n  useEffect(() => {",
  );
}

describe("Fitness schedule Workout action", () => {
  it("renders icon-only dumbbell actions only for plan-managed Fitness cards", () => {
    const scheduleFitnessRender = sourceSlice(
      scheduleSource,
      "{isFitnessPlanHabitCard ? (",
      "</motion.div>\n              );",
    );
    const matrixAction = functionBlock(matrixSource, "MatrixFitnessWorkoutActionButton");

    expect(scheduleFitnessRender).toContain(
      'data-schedule-fitness-workout-action="true"',
    );
    expect(scheduleFitnessRender).toContain('aria-label="Open workout"');
    expect(scheduleFitnessRender).toContain("<Dumbbell");
    expect(scheduleFitnessRender).not.toContain(">Workout<");

    expect(matrixSource).toContain("isMatrixFitnessPlanEvent(event)");
    expect(matrixAction).toContain('data-matrix-fitness-workout-action="true"');
    expect(matrixAction).toContain('aria-label="Open workout"');
    expect(matrixAction).toContain("<Dumbbell");
    expect(matrixAction).not.toContain(">Workout<");
  });

  it("keeps card gestures isolated from Fitness action taps", () => {
    const matrixAction = functionBlock(matrixSource, "MatrixFitnessWorkoutActionButton");
    const scheduleAction = sourceSlice(
      scheduleSource,
      "const stopFitnessWorkoutActionGesture =",
      "const habitLayoutId =",
    );

    expect(matrixSource).toContain("MATRIX_CARD_INTERACTIVE_ACTION_SELECTOR");
    expect(matrixSource).toContain("[data-matrix-fitness-workout-action]");
    expect(matrixAction).toContain("interactionEvent.stopPropagation()");
    expect(matrixAction).toContain("interactionEvent.preventDefault()");
    expect(matrixAction).toContain("onPointerDown={stopActionPropagation}");
    expect(matrixAction).toContain("onTouchStart={stopActionPropagation}");
    expect(matrixAction).toContain("onDoubleClick={stopActionActivation}");

    expect(scheduleAction).toContain("event.stopPropagation()");
    expect(scheduleAction).toContain("event.preventDefault()");
    expect(scheduleSource).toContain("onPointerDown={stopFitnessWorkoutActionGesture}");
    expect(scheduleSource).toContain("onTouchStart={stopFitnessWorkoutActionGesture}");
    expect(scheduleSource).toContain("onDoubleClick={stopFitnessWorkoutActionActivation}");
  });

  it("opens the existing Fitness quick-add form on the Workout tab", () => {
    const topNavOpen = sourceSlice(
      topNavSource,
      "const openPinnedFitnessWorkoutQuickAdd =",
      "useEffect(() => {\n    if (!pendingNutritionLogOpenRef.current)",
    );
    const sheetLoad = scheduledFitnessLoaderBlock();

    expect(topNavSource).toContain("CREATOR_OPEN_FITNESS_WORKOUT_EVENT");
    expect(topNavOpen).toContain('normalizeBodyDatabaseKey(database.systemDatabaseKey) === "fitness"');
    expect(topNavSource).toContain("<NoteDatabaseEntrySheet");
    expect(topNavSource).toContain("initialFitnessWorkoutOpenRequest");
    expect(sheetLoad).toContain('selectFitnessAction("start")');
    expect(sheetLoad).not.toContain('selectFitnessAction("plans")');
    expect(sheetLoad).not.toContain('selectFitnessAction("custom")');
    expect(sheetLoad).not.toContain('router.push("/focus-pomo")');
  });

  it("loads the snapshotted routine ID with active-plan equipment overrides", () => {
    const sheetLoad = scheduledFitnessLoaderBlock();

    expect(sheetLoad).toContain("request.fitnessRoutineTemplateId");
    expect(sheetLoad).toContain("request.fitnessPlanTemplateId");
    expect(sheetLoad).toContain("routine.id === routineTemplateId");
    expect(sheetLoad).toContain("resolveFitnessRoutineTemplateForEquipment");
    expect(sheetLoad).toContain("equipmentProfile: activeFitnessPlan.equipmentProfile");
    expect(sheetLoad).toContain("exerciseOverrides: activeFitnessPlan.exerciseOverrides");
    expect(sheetLoad).toContain("loadFitnessRoutineTemplate(");
    expect(sheetLoad).toContain("setSelectedFitnessPlanName(planTemplateId)");
    expect(sheetLoad).not.toContain("currentRoutineIndex");
  });

  it("renders Matrix Due Fitness cards from Habit metadata with derived routine action", () => {
    const dueCard = functionBlock(matrixSource, "DueHabitCard");
    const dueAction = functionBlock(matrixSource, "MatrixDueFitnessWorkoutActionButton");
    const dueDispatch = functionBlock(
      matrixSource,
      "dispatchOpenFitnessWorkoutForMatrixDueHabit",
    );

    expect(matrixSource).toContain("resolveFitnessPlanDueRoutineAssignment");
    expect(matrixSource).toContain("fitnessPlanRoutineAssignment");
    expect(matrixSource).toContain("isFitnessPlanManagedHabit(habit)");
    expect(dueCard).toContain("FITNESS_PLAN_HABIT_TITLE");
    expect(dueCard).toContain("habit.fitnessPlanRoutineAssignment?.fitnessRoutineTitle");
    expect(dueCard).toContain("<MatrixDueFitnessWorkoutActionButton");
    expect(dueCard).toContain("isFitnessPlanManaged && onOpenFitnessWorkout");
    expect(dueAction).toContain('data-matrix-due-fitness-workout-action="true"');
    expect(dueAction).toContain("interactionEvent.stopPropagation()");
    expect(dueAction).toContain("interactionEvent.preventDefault()");
    expect(dueDispatch).toContain("scheduleInstanceId: null");
    expect(dueDispatch).toContain("fitnessRoutineTemplateId");
    expect(dueDispatch).toContain("fitnessRoutineTitle");
    expect(dueDispatch).not.toContain("onComplete");
    expect(dueDispatch).not.toContain("router.push");
  });

  it("keeps Matrix scheduled Fitness cards on snapshotted routine metadata", () => {
    const scheduledDispatch = functionBlock(
      matrixSource,
      "dispatchOpenFitnessWorkoutForMatrixEvent",
    );

    expect(scheduledDispatch).toContain("readFitnessPlanScheduleRoutineAssignment");
    expect(scheduledDispatch).toContain("event.instance.metadata");
    expect(scheduledDispatch).toContain("scheduleInstanceId: event.instance.id");
    expect(scheduledDispatch).not.toContain("fitnessPlanRoutineAssignment");
  });

  it("keeps scheduler failure reasons observable through the safe run path", () => {
    const schedulerRoute = readFileSync("src/app/api/scheduler/run/route.ts", "utf8");
    const rescheduleSource = readFileSync("src/lib/scheduler/reschedule.ts", "utf8");

    expect(schedulerRoute).toContain("responsePayload.failures");
    expect(schedulerRoute).toContain("scheduleResult.failures");
    expect(rescheduleSource).toContain('reason: "NO_WINDOW"');
    expect(rescheduleSource).toContain('reason: "NO_FEASIBLE_SLOT_IN_HORIZON"');
    expect(rescheduleSource).toContain("placementTrace");
  });

  it("opens Workout safely when routine metadata is missing", () => {
    const sheetLoad = scheduledFitnessLoaderBlock();

    expect(sheetLoad.indexOf('selectFitnessAction("start")')).toBeLessThan(
      sheetLoad.indexOf("if (!routineTemplateId || !planTemplateId)"),
    );
    expect(sheetLoad).toContain("void hapticSoftTick()");
    expect(sheetLoad).not.toContain("throw new Error");
  });

  it("replaces rather than appends workouts and preserves Meal action behavior", () => {
    const loadRoutine = functionBlock(noteSheetSource, "loadFitnessRoutineTemplate");
    const matrixMealAction = functionBlock(matrixSource, "MatrixMealNutritionActionButton");

    expect(loadRoutine).toContain("setSelectedFitnessWorkoutExercises(routineExercises)");
    expect(loadRoutine).toContain("setFitnessWorkoutExerciseDetailsById(routineDetails)");
    expect(loadRoutine).toContain("setFitnessWorkoutFocusSessionResult(null)");
    expect(loadRoutine).toContain("setIsFitnessWorkoutReviewOpen(false)");
    expect(topNavSource).toContain("upsertFitnessWorkoutDatabaseEntry(");

    expect(matrixMealAction).toContain('icon="game-icons:stomach"');
    expect(matrixMealAction).toContain('data-matrix-meal-nutrition-action="true"');
    expect(matrixSource).toContain("[data-matrix-meal-nutrition-action]");
  });
});
