import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getMatrixRoutineProgress,
  isMatrixScheduledRoutineHabitCompleted,
} from "@/lib/schedule/matrixRoutineProgress";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const relatedRoutineCard = readFileSync(
  "src/components/habits/RelatedRoutineCard.tsx",
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

describe("Matrix Routine completion progress", () => {
  it("treats one completed child as partial progress, not Routine completion", () => {
    const progress = getMatrixRoutineProgress([
      { completed: true },
      { completed: false },
      { completed: false },
    ]);

    expect(progress).toEqual({
      completed: 1,
      total: 3,
      percent: 33,
      isComplete: false,
    });
  });

  it("advances progress and completes the Routine only after the final child", () => {
    expect(
      getMatrixRoutineProgress([
        { completed: true },
        { completed: true },
        { completed: false },
      ])
    ).toMatchObject({ completed: 2, total: 3, percent: 67, isComplete: false });

    expect(
      getMatrixRoutineProgress([
        { completed: true },
        { completed: true },
        { completed: true },
      ])
    ).toMatchObject({ completed: 3, total: 3, percent: 100, isComplete: true });
  });

  it("does not auto-complete empty Routines", () => {
    expect(getMatrixRoutineProgress([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
      isComplete: false,
    });
  });

  it("derives scheduled child completion from that child's schedule instance", () => {
    expect(
      isMatrixScheduledRoutineHabitCompleted({
        sourceInstance: { status: "completed" },
      })
    ).toBe(true);
    expect(
      isMatrixScheduledRoutineHabitCompleted({
        sourceInstance: { status: "scheduled" },
      })
    ).toBe(false);
  });

  it("keeps expanded scheduled Routine child completion scoped to one instance", () => {
    const scheduledCard = functionBlock(matrixContent, "ScheduledEventCard");
    const scheduledCompletion = callbackBlock("commitScheduledEventCompletion");

    expect(scheduledCard).toContain(
      "const routineHabit = event.routine?.habits.find("
    );
    expect(scheduledCard).toContain(
      "return onComplete(instanceId, completed ? \"scheduled\" : \"completed\""
    );
    expect(scheduledCompletion).toContain(
      "if (habit.sourceInstance?.id !== instanceId) return habit;"
    );
    expect(scheduledCompletion).toContain(
      "completed: isMatrixScheduledRoutineHabitCompleted({"
    );
    expect(scheduledCompletion).toContain(
      "completed: isMatrixScheduledRoutineCompleted(nextHabits)"
    );
  });

  it("keeps expanded due Routine child completion scoped to one Habit", () => {
    const dueCompletion = callbackBlock("handleCompleteDueHabit");

    expect(dueCompletion).toContain("body: JSON.stringify({");
    expect(dueCompletion).toContain("habitId,");
    expect(dueCompletion).toContain("if (habit.id !== habitId) return habit;");
    expect(dueCompletion).toContain("completed:");
    expect(dueCompletion).toContain(
      "getMatrixRoutineProgress(updatedRoutineHabits)"
    );
  });

  it("renders incomplete Routine progress and rolls back failed child persistence", () => {
    const routineCard = functionBlock(matrixContent, "MatrixRoutineCard");

    expect(routineCard).toContain("MatrixRoutineProgressBar");
    expect(routineCard).toContain("!completed && routineProgress.total > 0");
    expect(relatedRoutineCard).toContain("rollbackLocalCompletion");
    expect(relatedRoutineCard).toContain("if (result === false)");
    expect(relatedRoutineCard).toContain("catch((error) =>");
  });

  it("does not award XP or haptics for Routine siblings from the card drawer", () => {
    const routineCard = functionBlock(matrixContent, "MatrixRoutineCard");
    const dueCompletion = callbackBlock("handleCompleteDueHabit");
    const scheduledCompletion = callbackBlock("commitScheduledEventCompletion");

    expect(routineCard).toContain(
      "const targetHabit = routine.habits.find((habit) => !habit.completed)"
    );
    expect(routineCard).not.toContain("for (const habit of routine.habits)");
    expect(routineCard).not.toContain("hapticComplete");
    expect(routineCard).not.toContain("dispatchMatrixDueHabitXpReward");
    expect(dueCompletion).toContain("dispatchMatrixDueHabitXpReward(");
    expect(scheduledCompletion).toContain("dispatchMatrixScheduledXpReward(");
  });
});
