import { describe, expect, it } from "vitest";

import {
  buildFitnessActivePlan,
  buildFitnessActivePlanEntry,
  getFitnessActivePlanFromEntries,
  getFitnessPlanMatchLabel,
  readFitnessActivePlanFromMetadata,
} from "../../src/lib/fitness/activePlan";
import { FITNESS_PLAN_TEMPLATES } from "../../src/lib/fitness/planTemplates";
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
  it("stores flexible activation without weekdays", () => {
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      scheduleMode: "flexible",
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
      now,
    });

    expect(activePlan).toMatchObject({
      version: 1,
      planTemplateId: "upper-lower",
      planTitle: "Upper / Lower",
      source: "creator",
      status: "active",
      scheduleMode: "flexible",
      targetDaysPerWeek: 4,
      weekdays: [],
      currentRoutineIndex: 0,
      completedWorkoutCount: 0,
      checkInAfterCompletedWorkouts: 16,
    });
  });

  it("rejects weekly plans with the wrong weekday count", () => {
    const activePlan = buildFitnessActivePlan({
      plan: upperLower,
      scheduleMode: "weekly",
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue"],
      now,
    });

    expect(readFitnessActivePlanFromMetadata({ fitnessActivePlan: activePlan })).toBeNull();
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
      scheduleMode: "weekly",
      targetDaysPerWeek: 4,
      weekdays: ["Mon", "Tue", "Thu", "Fri"],
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

  it("returns restrained match labels from saved profile values", () => {
    expect(getFitnessPlanMatchLabel(upperLower, profile())).toBe("Best match");
    expect(
      getFitnessPlanMatchLabel(upperLower, profile({ trainingDaysPerWeek: 3 })),
    ).toBe("Schedule mismatch");
    expect(
      getFitnessPlanMatchLabel(upperLower, profile({ equipment: "Bodyweight" })),
    ).toBe("Equipment mismatch");
    expect(getFitnessPlanMatchLabel(upperLower, null)).toBeNull();
  });
});
