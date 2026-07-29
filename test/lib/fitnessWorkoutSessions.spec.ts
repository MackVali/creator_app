import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildFitnessWorkoutFocusSessionFromEntry,
  mergeFitnessWorkoutLogSetResults,
  upsertFitnessWorkoutDatabaseEntry,
  type FitnessWorkoutDatabaseEntry,
  type FitnessWorkoutLogMetadata,
} from "../../src/lib/focus/fitnessWorkoutFocusSession";
import { extractFitnessLoggedSetPerformances } from "../../src/lib/fitness/progressiveOverload";

function entry(
  id: string,
  log: FitnessWorkoutLogMetadata,
): FitnessWorkoutDatabaseEntry {
  return {
    id,
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    values: {
      metadata: {
        fitnessWorkoutLog: log,
      },
    },
  };
}

function log(
  status?: FitnessWorkoutLogMetadata["status"],
): FitnessWorkoutLogMetadata {
  return {
    version: 1,
    sessionId: "session-1",
    status,
    workoutName: "Push",
    startedAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    loggedAt: "2026-07-24T11:00:00.000Z",
    exercises: [
      {
        exerciseId: "bench",
        name: "Bench Press",
        sets: [
          {
            exerciseId: "bench",
            exerciseName: "Bench Press",
            setNumber: 1,
            totalSets: 2,
            plannedReps: 5,
            completedReps: 5,
            weight: 135,
            unit: "lb",
            status: status === "in_progress" ? "pending" : "completed",
            completionStatus: status === "in_progress" ? "pending" : "completed",
            isWarmup: false,
          },
          {
            exerciseId: "bench",
            exerciseName: "Bench Press",
            setNumber: 2,
            totalSets: 2,
            plannedReps: 5,
            completedReps: status === "in_progress" ? null : 4,
            weight: 135,
            unit: "lb",
            status: status === "in_progress" ? "pending" : "completed",
            completionStatus: status === "in_progress" ? "pending" : "completed",
            isWarmup: false,
          },
        ],
      },
    ],
  };
}

describe("Fitness workout structured session helpers", () => {
  it("upserts repeated writes for one session without duplicate entries", () => {
    const databaseId = "fitness";
    const first = entry("entry-1", log("in_progress"));
    const second = entry("entry-2", { ...log("in_progress"), sessionId: "session-1" });

    const once = upsertFitnessWorkoutDatabaseEntry({}, databaseId, first);
    const twice = upsertFitnessWorkoutDatabaseEntry(once, databaseId, second);

    expect(twice[databaseId]).toHaveLength(1);
    expect(twice[databaseId][0].id).toBe("entry-2");
  });

  it("updates only the matching set when a set result is checkpointed", () => {
    const merged = mergeFitnessWorkoutLogSetResults(log("in_progress"), [
      {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        setNumber: 2,
        totalSets: 2,
        plannedReps: "5",
        completedReps: 3,
        weight: "140",
        weightUnit: "lb",
        status: "completed",
        completedAt: "2026-07-24T10:20:00.000Z",
      },
    ]);

    expect(merged.exercises?.[0].sets?.[0].status).toBe("pending");
    expect(merged.exercises?.[0].sets?.[1]).toMatchObject({
      completedReps: 3,
      weight: 140,
      status: "completed",
      completedAt: "2026-07-24T10:20:00.000Z",
    });
  });

  it("final Review & Log can complete the same entry", () => {
    const completed = mergeFitnessWorkoutLogSetResults(log("in_progress"), [], {
      status: "completed",
      completedAt: "2026-07-24T11:00:00.000Z",
    });
    const first = entry("entry-1", log("in_progress"));
    const final = entry("entry-1", completed);

    const databaseEntries = upsertFitnessWorkoutDatabaseEntry(
      upsertFitnessWorkoutDatabaseEntry({}, "fitness", first),
      "fitness",
      final,
    );

    expect(databaseEntries.fitness).toHaveLength(1);
    const metadata = databaseEntries.fitness[0].values.metadata as {
      fitnessWorkoutLog: { status?: string };
    };

    expect(metadata.fitnessWorkoutLog.status).toBe("completed");
  });

  it("resume excludes resolved sets and preserves pending set details", () => {
    const resumeLog = log("in_progress");
    resumeLog.exercises?.[0].sets?.splice(0, 1, {
      ...resumeLog.exercises[0].sets[0],
      status: "completed",
      completionStatus: "completed",
      completedAt: "2026-07-24T10:10:00.000Z",
    });
    const result = buildFitnessWorkoutFocusSessionFromEntry({
      entry: entry("entry-1", resumeLog),
      databaseId: "fitness",
      noteId: "note-1",
    });

    expect(result.resolvedSetCount).toBe(1);
    expect(result.totalSetCount).toBe(2);
    expect(result.payload?.sets).toHaveLength(1);
    expect(result.payload?.sets?.[0]).toMatchObject({
      exerciseId: "bench",
      setNumber: 2,
      totalSets: 2,
      plannedReps: 5,
      weight: "135",
      weightUnit: "lb",
    });
  });
});

describe("Fitness progression history extraction", () => {
  it("counts legacy version-1 logs without status as completed", () => {
    const performances = extractFitnessLoggedSetPerformances([entry("entry-1", log())]);

    expect(performances).toHaveLength(2);
  });

  it("ignores in-progress and abandoned logs", () => {
    const performances = extractFitnessLoggedSetPerformances([
      entry("entry-1", log("in_progress")),
      entry("entry-2", log("abandoned")),
      entry("entry-3", { ...log("completed"), sessionId: "session-3" }),
    ]);

    expect(performances).toHaveLength(2);
    expect(performances.every((performance) => performance.workoutName === "Push")).toBe(true);
  });
});

describe("Fitness ME header", () => {
  it("renders My Fitness without the old Manual / Untracked mode", () => {
    const source = readFileSync(
      "src/components/notes/NoteSlashTextarea.tsx",
      "utf8",
    );
    const meContent = source.slice(
      source.indexOf("function renderFitnessMeContent"),
      source.indexOf("function renderFitnessTabContent"),
    );

    expect(meContent).toContain("renderFitnessMyHeader()");
    expect(source).toContain("My Fitness");
    expect(meContent).not.toContain("Manual / Untracked");
    expect(meContent).not.toContain("Weekly");
  });
});
