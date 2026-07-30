import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const functionBlock = (name: string) => {
  const start = matrixContent.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\nfunction ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

const callbackBlock = (name: string) => {
  const start = matrixContent.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n  const ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

describe("Matrix Creator-day completion semantics", () => {
  it("derives one active Creator day from the canonical helper", () => {
    expect(matrixContent).toContain('from "@/lib/creatorDay"');
    expect(matrixContent).toContain("const activeCreatorDay = useMemo(");
    expect(matrixContent).toContain("resolveMatrixCreatorDay(timeZone");
    expect(matrixContent).toContain("activeCreatorDayRef");
  });

  it("loads habit completion styling from habit_completion_days for the active Creator day", () => {
    const displayStatusBlock = functionBlock("getMatrixHabitDisplayStatus");

    expect(matrixContent).toContain('.from("habit_completion_days")');
    expect(matrixContent).toContain('.eq("completion_day", creatorDay.creatorDayDate)');
    expect(matrixContent).toContain("completedHabitIdsForCreatorDay");
    expect(displayStatusBlock).toContain("completedHabitIds.has(habit.id)");
    expect(displayStatusBlock).not.toContain("last_completed_at");
  });

  it("keys due-habit optimistic and XP state by habit plus Creator day", () => {
    const dueCompletionBlock = callbackBlock("handleCompleteDueHabit");
    const dueXpBlock = callbackBlock("dispatchMatrixDueHabitXpReward");

    expect(dueCompletionBlock).toContain("buildMatrixHabitCompletionKey(habitId, dayKey)");
    expect(dueCompletionBlock).toContain("pendingDueHabitCompletionKeysRef");
    expect(dueCompletionBlock).toContain("activeCreatorDayRef.current.creatorDayDate");
    expect(dueXpBlock).toContain("activeCreatorDayRef.current.creatorDayDate");
    expect(dueXpBlock).toContain("productivityDayKey: dayKey");
  });

  it("refreshes Matrix only when resume or the rollover timer sees a Creator-day change", () => {
    const revalidateBlock = callbackBlock("revalidateMatrixCreatorDay");

    expect(matrixContent).toContain("activeCreatorDay.endsAt");
    expect(matrixContent).toContain('document.addEventListener("visibilitychange"');
    expect(matrixContent).toContain('window.addEventListener("focus"');
    expect(revalidateBlock).toContain("nextCreatorDay.creatorDayDate === currentCreatorDay.creatorDayDate");
    expect(revalidateBlock).toContain("return;");
    expect(revalidateBlock).toContain("setCreatorDayNow(new Date())");
  });

  it("loads Matrix meals and windows from the active Creator-day interval", () => {
    expect(matrixContent).toContain("const dayStart = new Date(creatorDay.startsAt)");
    expect(matrixContent).toContain("const dayEnd = new Date(creatorDay.endsAt)");
    expect(matrixContent).toContain('params.set("mode", "creator-day")');
    expect(matrixContent).toContain("dateKey: dayKey");
  });
});
