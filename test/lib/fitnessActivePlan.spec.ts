import { describe, expect, it } from "vitest";

import {
  buildFitnessActivePlan,
  buildFitnessActivePlanEntry,
  formatFitnessActivePlanSchedule,
  getFitnessActivePlanFromEntries,
  getFitnessPlanDefaultEquipmentProfile,
  getFitnessPlanMatchLabel,
  readFitnessActivePlanFromMetadata,
} from "../../src/lib/fitness/activePlan";
import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineAtIndex,
} from "../../src/lib/fitness/planTemplates";
import type { FitnessProfile } from "../../src/lib/fitness/profile";

const now = "2026-07-28T12:00:00.000Z";
const upperLower = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "upper-lower")!;

function profile(overrides: Partial<FitnessProfile> = {}): FitnessProfile {
  return {
    version: 1,
    primaryGoal: "Build muscle",
    experienceLevel: "Intermediate",
    equipment: "Full gym",
    trainingDaysPerWeek: 4,
    sessionDurationMinutes: 60,
    preferredWeightUnit: "lb",
    anatomyDisplay: "neutral",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Fitness active plan metadata", () => {
  it("stores selected weekdays and session duration", () => {
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });

    expect(activePlan).toMatchObject({
      version: 1,
      planTemplateId: "upper-lower",
      planTitle: "Upper / Lower",
      source: "creator",
      status: "active",
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      currentRoutineIndex: 0,
      completedWorkoutCount: 0,
      checkInAfterCompletedWorkouts: 16,
    });
    expect(formatFitnessActivePlanSchedule(activePlan)).toBe("Mon · Tue · Thu · Fri · 60 min");
  });

  it("rejects new plans with the wrong weekday count", () => {
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });

    expect(readFitnessActivePlanFromMetadata({ fitnessActivePlan: activePlan })).toBeNull();
  });

  it("preserves legacy flexible plans without weekdays", () => {
    expect(
      readFitnessActivePlanFromMetadata({
        fitnessActivePlan: {
          version: 1,
          planTemplateId: "upper-lower",
          planTitle: "Upper / Lower",
          source: "creator",
          status: "active",
          scheduleMode: "flexible",
          targetDaysPerWeek: 4,
          weekdays: [],
          equipmentProfile: "Dumbbells",
          startedAt: now,
          currentRoutineIndex: 2,
          completedWorkoutCount: 7,
          checkInAfterCompletedWorkouts: 16,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ).toMatchObject({
      planTemplateId: "upper-lower",
      weekdays: [],
      sessionDurationMinutes: 60,
      equipmentProfile: "Dumbbells",
      currentRoutineIndex: 2,
      completedWorkoutCount: 7,
    });
  });

  it("preserves Fitness Profile and unrelated metadata when persisting an active plan", () => {
    const existingEntry = {
      id: "creator-fitness-profile-fitness",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      values: {
        metadata: {
          unrelated: "keep-me",
          fitnessProfile: profile(),
        },
      },
    };
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });
    const entry = buildFitnessActivePlanEntry({
      databaseId: "fitness",
      existingEntry,
      activePlan,
      now,
    });

    expect(entry.values.metadata).toMatchObject({
      unrelated: "keep-me",
      fitnessProfile: profile(),
      fitnessActivePlan: activePlan,
    });
    expect(getFitnessActivePlanFromEntries([entry])).toEqual(activePlan);
  });

  it("stores user-selected exercise replacements by routine and exercise id", () => {
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Dumbbells",
      exerciseOverrides: [
        {
          routineTemplateId: "upper-body",
          originalExerciseId: "Bench Press",
          replacementExerciseId: "Dumbbell Press",
        },
      ],
      now,
    });

    expect(
      readFitnessActivePlanFromMetadata({ fitnessActivePlan: activePlan })?.exerciseOverrides,
    ).toEqual([
      {
        routineTemplateId: "upper-body",
        originalExerciseId: "Bench Press",
        replacementExerciseId: "Dumbbell Press",
      },
    ]);
  });

  it("defaults equipment from the Fitness Profile when available", () => {
    expect(
      getFitnessPlanDefaultEquipmentProfile(upperLower, profile({ equipment: "Home gym" })),
    ).toBe("Home gym");
    expect(getFitnessPlanDefaultEquipmentProfile(upperLower, null)).toBe("Full gym");
  });

  it("preserves currentRoutineIndex when editing frequency and weekdays", () => {
    const existingActivePlan = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });
    const edited = buildFitnessActivePlan({
      plan: upperLower,
      targetDaysPerWeek: 5,
      weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
      sessionDurationMinutes: 45,
      equipmentProfile: "Dumbbells",
      now: "2026-07-29T12:00:00.000Z",
      existingActivePlan: {
        ...existingActivePlan,
        currentRoutineIndex: 8,
        completedWorkoutCount: 8,
      },
    });

    expect(edited.currentRoutineIndex).toBe(8);
    expect(edited.completedWorkoutCount).toBe(8);
    expect(edited.targetDaysPerWeek).toBe(5);
    expect(edited.weekdays).toEqual(["Mon", "Tue", "Wed", "Fri", "Sat"]);
  });

  it("continues five-day PPL rotation across an arbitrary week boundary", () => {
    const ppl = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!;
    const completedAcrossWeekBoundary = [
      resolveFitnessPlanRoutineAtIndex(ppl, 0)?.title,
      resolveFitnessPlanRoutineAtIndex(ppl, 1)?.title,
      resolveFitnessPlanRoutineAtIndex(ppl, 2)?.title,
      resolveFitnessPlanRoutineAtIndex(ppl, 3)?.title,
      resolveFitnessPlanRoutineAtIndex(ppl, 4)?.title,
      resolveFitnessPlanRoutineAtIndex(ppl, 5)?.title,
    ];

    expect(completedAcrossWeekBoundary).toEqual([
      "Push Day",
      "Pull Day",
      "Legs Day",
      "Push Day",
      "Pull Day",
      "Legs Day",
    ]);
  });

  it("returns restrained match labels from saved profile values", () => {
    expect(getFitnessPlanMatchLabel(upperLower, profile())).toBe("Best match");
    expect(getFitnessPlanMatchLabel(upperLower, profile({ trainingDaysPerWeek: 3 }))).toBe(
      "Best match",
    );
    expect(
      getFitnessPlanMatchLabel(upperLower, profile({ equipment: "Bodyweight" })),
    ).toBe("Equipment mismatch");
    expect(getFitnessPlanMatchLabel(upperLower, null)).toBeNull();
  });
});
