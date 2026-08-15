import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const myListSheet = readFileSync(
  "src/components/my-list/MyListSheet.tsx",
  "utf8"
);

const functionBlock = (content: string, name: string) => {
  const start = content.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = content.indexOf("\nfunction ", start + 1);
  return content.slice(start, next === -1 ? undefined : next);
};

const callbackBlock = (name: string) => {
  const start = matrixContent.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n  const ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

const countOccurrences = (content: string, needle: string) =>
  content.split(needle).length - 1;

describe("My List embedded Matrix checkbox presentation", () => {
  it("scopes checkbox-only Matrix presentation to My List", () => {
    expect(matrixContent).toContain(
      'type MatrixPresentationMode = "default" | "checkbox-only";'
    );
    expect(countOccurrences(myListSheet, 'presentationMode="checkbox-only"')).toBe(
      1
    );

    const myListMatrixInvocation = myListSheet.slice(
      myListSheet.indexOf("<MatrixContent"),
      myListSheet.indexOf("/>", myListSheet.indexOf("<MatrixContent")) + 2
    );
    expect(myListMatrixInvocation).toContain('variant="sheet"');
    expect(myListMatrixInvocation).toContain('todoRowDensity="compact"');
    expect(myListMatrixInvocation).toContain('presentationMode="checkbox-only"');
  });

  it("forces every embedded Matrix carousel branch through todo rows", () => {
    const carousel = functionBlock(matrixContent, "MatrixGridCarousel");

    expect(carousel).toContain(
      'presentationMode === "checkbox-only" ? "todo" : cardDensity'
    );
    expect(carousel).toContain(
      'const isCardDensityToggleEnabled = presentationMode !== "checkbox-only";'
    );
    expect(countOccurrences(carousel, "density={effectiveCardDensity}")).toBeGreaterThanOrEqual(3);
    expect(carousel).toContain("presentationMode={presentationMode}");
    expect(carousel).not.toContain("density={cardDensity}");
  });

  it("keeps Routine details compact in checkbox-only mode", () => {
    const routineCard = functionBlock(matrixContent, "MatrixRoutineCard");
    const compactDetailsStart = routineCard.indexOf("<AnimatePresence");
    expect(compactDetailsStart).toBeGreaterThanOrEqual(0);
    const compactDetailsEnd = routineCard.indexOf(
      ") : (",
      compactDetailsStart
    );
    expect(compactDetailsEnd).toBeGreaterThan(compactDetailsStart);
    const compactDetailsBranch = routineCard.slice(
      compactDetailsStart,
      compactDetailsEnd
    );

    expect(routineCard).toContain(
      'density === "todo" && presentationMode === "checkbox-only"'
    );
    expect(routineCard).toContain("data-matrix-routine-details-action");
    expect(compactDetailsBranch).toContain("<MatrixTodoRow");
    expect(compactDetailsBranch).toContain("onCompleteHabit(");
    expect(compactDetailsBranch).not.toContain("RelatedRoutineCard");
  });

  it("keeps checkbox-only taps on one authoritative completion path", () => {
    const todoRow = functionBlock(matrixContent, "MatrixTodoRow");
    const scheduledCard = functionBlock(matrixContent, "ScheduledEventCard");

    expect(todoRow).toContain('data-matrix-checkbox="true"');
    expect(todoRow).toContain("event.preventDefault();");
    expect(todoRow).toContain("event.stopPropagation();");
    expect(todoRow).toContain("onDoubleClick={(event) => event.stopPropagation()}");
    expect(todoRow).toContain("onTouchStart={(event) => event.stopPropagation()}");
    expect(todoRow).toContain("onTouchEnd={(event) => event.stopPropagation()}");
    expect(todoRow).toContain("onToggle({");

    expect(scheduledCard).toContain(
      "completingInstanceIds.has(event.instance.id)"
    );
    expect(scheduledCard).toContain(
      "completingInstanceIds.has(instanceId)"
    );
    expect(scheduledCard).toContain(
      "disabled={completingInstanceIds.has(event.instance.id)}"
    );
  });

  it("reserves a checkbox-only trailing action slot for Meal and Fitness rows", () => {
    const todoRow = functionBlock(matrixContent, "MatrixTodoRow");
    const scheduledCard = functionBlock(matrixContent, "ScheduledEventCard");
    const dueHabitCard = functionBlock(matrixContent, "DueHabitCard");

    expect(todoRow).toContain("trailingAction?: ReactNode");
    expect(todoRow).toContain('density === "compact" ? "w-8" : "w-9"');
    expect(scheduledCard).toContain(
      'density === "todo" && presentationMode === "checkbox-only"'
    );
    expect(scheduledCard).toContain("const todoTrailingAction =");
    expect(scheduledCard).toContain("<MatrixMealNutritionActionButton");
    expect(scheduledCard).toContain("<MatrixFitnessWorkoutActionButton");
    expect(scheduledCard).toContain("const shouldSuppressTodoMeta =");
    expect(scheduledCard).toContain("trailingAction={todoTrailingAction}");
    expect(dueHabitCard).toContain('placement="inline"');
    expect(dueHabitCard).toContain("trailingAction={todoTrailingAction}");
  });

  it("moves completed checkbox-only Matrix items into the My List disclosure", () => {
    const carousel = functionBlock(matrixContent, "MatrixGridCarousel");

    expect(carousel).toContain("completedScheduledItems");
    expect(carousel).toContain("completedDueItems");
    expect(carousel).toContain('presentationMode !== "checkbox-only"');
    expect(carousel).toContain("isMatrixEventCompleted(event)");
    expect(carousel).toContain("isMatrixDueItemCompleted(item)");
    expect(carousel).toContain("setAreCompletedTodosVisible(false)");
    expect(carousel).toContain(
      'areCompletedTodosVisible ? "Hide completed" : "Show completed"'
    );
    expect(carousel).toContain("completedTodoCount > 0");
    expect(carousel).toContain("key=\"matrix-completed-todos-rows\"");
  });

  it("prevents stale My List Matrix refreshes from rolling back completion", () => {
    const scheduledCompletion = callbackBlock("commitScheduledEventCompletion");
    const loadEffect = matrixContent.slice(
      matrixContent.indexOf("async function loadMatrix()"),
      matrixContent.indexOf("loadMatrix();")
    );

    expect(matrixContent).toContain("type MatrixScheduledCompletionOverride");
    expect(matrixContent).toContain("scheduledCompletionOverridesRef");
    expect(matrixContent).toContain("matrixLoadRequestIdRef");
    expect(matrixContent).toContain(
      "applyMatrixScheduledCompletionOverridesToEvents"
    );
    expect(matrixContent).toContain(
      "applyMatrixDueHabitCompletionOverridesToItems"
    );

    const overrideSet = scheduledCompletion.indexOf(
      "scheduledCompletionOverridesRef.current.set("
    );
    const statusPersistence = scheduledCompletion.indexOf(
      "const result = await updateInstanceStatus("
    );
    const xpAward = scheduledCompletion.indexOf(
      "const xpResult = await dispatchMatrixScheduledXpReward"
    );
    expect(overrideSet).toBeGreaterThanOrEqual(0);
    expect(statusPersistence).toBeGreaterThan(overrideSet);
    expect(xpAward).toBeGreaterThan(statusPersistence);

    expect(scheduledCompletion).toContain(
      "pendingScheduledCompletionIdsRef.current.has(instanceId)"
    );
    expect(scheduledCompletion).toContain("rollbackScheduledCompletionState");
    expect(scheduledCompletion).not.toContain("dispatchCreatorXpRewardVisual({");

    expect(loadEffect).toContain(
      "loadRequestId === matrixLoadRequestIdRef.current"
    );
    expect(loadEffect).toContain(
      "applyMatrixScheduledCompletionOverridesToEvents("
    );
    expect(loadEffect).toContain(
      "applyMatrixDueHabitCompletionOverridesToCompletedIds("
    );
    expect(loadEffect).toContain(
      "applyMatrixDueHabitCompletionOverridesToItems("
    );
  });
});
