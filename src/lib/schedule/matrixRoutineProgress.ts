export type MatrixRoutineProgress = {
  completed: number;
  total: number;
  percent: number;
  isComplete: boolean;
};

export type MatrixRoutineCompletionStatus = {
  completed?: boolean | null;
};

export type MatrixRoutineScheduleStatus = {
  sourceInstance?: {
    status?: string | null;
  } | null;
};

export function isMatrixScheduledRoutineHabitCompleted(
  habit: MatrixRoutineScheduleStatus
): boolean {
  return (
    habit.sourceInstance?.status?.trim().toLowerCase() === "completed"
  );
}

export function getMatrixRoutineProgress<T extends MatrixRoutineCompletionStatus>(
  habits: readonly T[]
): MatrixRoutineProgress {
  const total = habits.length;
  const completed = habits.filter((habit) => habit.completed === true).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    completed,
    total,
    percent,
    isComplete: total > 0 && completed === total,
  };
}
