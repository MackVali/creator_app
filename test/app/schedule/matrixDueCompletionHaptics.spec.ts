import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const countOccurrences = (content: string, needle: string) =>
  content.split(needle).length - 1;

const callbackBlock = (name: string) => {
  const start = matrixContent.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n  const ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

const functionBlock = (name: string) => {
  const start = matrixContent.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\nfunction ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

describe("Matrix Due panel completion haptics", () => {
  it("successful Due habit completion triggers one shared completion haptic after finalization", () => {
    const block = callbackBlock("handleCompleteDueHabit");
    const haptic = block.indexOf("void hapticComplete();");
    const responseFailure = block.indexOf("if (!response.ok)");
    const xpRollbackCheck = block.indexOf("const shouldRollbackCompletion");
    const localFinalization = block.lastIndexOf("setState((current) => {");
    const hapticGate = block.lastIndexOf("if (!completedToday)", haptic);

    expect(countOccurrences(block, "void hapticComplete();")).toBe(1);
    expect(haptic).toBeGreaterThan(responseFailure);
    expect(haptic).toBeGreaterThan(xpRollbackCheck);
    expect(haptic).toBeGreaterThan(localFinalization);
    expect(hapticGate).toBeGreaterThan(localFinalization);
  });

  it("failed Due habit completion paths do not trigger completion haptics", () => {
    const block = callbackBlock("handleCompleteDueHabit");
    const haptic = block.indexOf("void hapticComplete();");
    const catchBlock = block.slice(
      block.indexOf("catch (error)"),
      block.indexOf("finally")
    );
    const rollbackBranch = block.slice(
      block.indexOf("if (shouldRollbackCompletion)"),
      block.indexOf("} else {", block.indexOf("if (shouldRollbackCompletion)"))
    );
    const responseFailure = block.slice(
      block.indexOf("if (!response.ok)"),
      block.indexOf("if (!completedToday) {", block.indexOf("if (!response.ok)") + 1)
    );

    expect(catchBlock).not.toContain("hapticComplete");
    expect(rollbackBranch).not.toContain("hapticComplete");
    expect(responseFailure).not.toContain("hapticComplete");
    expect(haptic).toBeGreaterThan(block.indexOf("setState((current) => {"));
  });

  it("touch and click Due-card entry points converge before the haptic call", () => {
    const block = callbackBlock("handleCompleteDueHabit");
    const dueHabitCard = functionBlock("DueHabitCard");
    const routineCard = functionBlock("MatrixRoutineCard");
    const todoRow = functionBlock("MatrixTodoRow");

    expect(block.indexOf("if (completingDueHabitIdsRef.current.has(habitId)) return;"))
      .toBeLessThan(block.indexOf("completingDueHabitIdsRef.current.add(habitId);"));
    expect(block.indexOf("completingDueHabitIdsRef.current.add(habitId);"))
      .toBeLessThan(block.indexOf("const response = await fetch("));
    expect(dueHabitCard).toContain("const completeHabit = useCallback");
    expect(dueHabitCard).toContain("onComplete(habit.id, isCompletedToday, source)");
    expect(dueHabitCard).not.toContain("hapticComplete");
    expect(routineCard).not.toContain("hapticComplete");
    expect(todoRow).not.toContain("hapticComplete");
  });

  it("card interactions and form-open paths do not trigger completion haptics", () => {
    const block = callbackBlock("handleCompleteDueHabit");
    const dueHabitCard = functionBlock("DueHabitCard");
    const memoOpenBranch = block.slice(
      block.indexOf("!bypassMemoCaptureRef.current"),
      block.indexOf("if (completingDueHabitIdsRef.current.has(habitId))")
    );

    expect(memoOpenBranch).toContain("setMemoCompletionState({");
    expect(memoOpenBranch).not.toContain("hapticComplete");
    expect(dueHabitCard).toContain("fabCreation.requestEntityEdit({");
    expect(dueHabitCard).not.toContain("hapticComplete");
  });

  it("existing scheduled Matrix completion haptic behavior remains unchanged", () => {
    const scheduledBlock = callbackBlock("commitScheduledEventCompletion");
    const scheduledCard = functionBlock("ScheduledEventCard");

    expect(countOccurrences(scheduledBlock, "void hapticComplete();")).toBe(1);
    expect(scheduledBlock).toContain('persistedStatus === "completed"');
    expect(scheduledBlock).toContain("options?.hapticOnComplete !== false");
    expect(scheduledBlock.indexOf("void hapticComplete();")).toBeGreaterThan(
      scheduledBlock.indexOf("setState((current) => ({")
    );
    expect(scheduledCard).toContain(
      "const targetHabit = event.routine.habits.find("
    );
    expect(scheduledCard).toContain("hapticOnComplete: true");
    expect(scheduledCard).not.toContain("shouldFireCompletionHaptic");
  });
});
