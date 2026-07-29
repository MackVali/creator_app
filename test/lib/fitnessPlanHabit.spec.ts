import { describe, expect, it } from "vitest";

import {
  buildFitnessPlanHabitMemoCaptureConfig,
  buildFitnessPlanScheduleInstanceMetadata,
  chooseFitnessPlanHabitRowForUpdate,
  isFitnessPlanManagedHabit,
  isFitnessPlanScheduleMetadata,
  readFitnessPlanHabitMetadata,
} from "../../src/lib/fitness/planHabit";
import type { FitnessActivePlan } from "../../src/lib/fitness/activePlan";

const activePlan: FitnessActivePlan = {
  version: 1,
  planTemplateId: "push-pull-legs",
  planTitle: "Push / Pull / Legs",
  source: "creator",
  status: "active",
  targetDaysPerWeek: 3,
  weekdays: ["Mon", "Wed", "Fri"],
  sessionDurationMinutes: 60,
  equipmentProfile: "Full gym",
  linkedFitnessHabitId: "habit-fitness-plan",
  startedAt: "2026-07-28T12:00:00.000Z",
  currentRoutineIndex: 0,
  completedWorkoutCount: 0,
  checkInAfterCompletedWorkouts: 12,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

describe("fitness plan managed habit metadata", () => {
  it("stores the plan marker without removing existing memo config", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: { mode: "existing" },
      activePlan,
      now: activePlan.updatedAt,
    });

    expect((memoConfig as Record<string, unknown>).mode).toBe("existing");
    expect(isFitnessPlanManagedHabit({ memo_capture_config: memoConfig })).toBe(true);
    expect(readFitnessPlanHabitMetadata(memoConfig)).toMatchObject({
      managedBy: "fitnessActivePlan",
      planTemplateId: "push-pull-legs",
      planTitle: "Push / Pull / Legs",
      weekdays: ["Mon", "Wed", "Fri"],
      sessionDurationMinutes: 60,
      skillType: "fitness",
    });
  });

  it("builds authoritative schedule instance metadata for rendering", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const metadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      skillId: "skill-fitness",
      memoCaptureConfig: memoConfig,
    });

    expect(metadata).toMatchObject({
      presentationKind: "fitness-plan",
      source: "fitness-active-plan",
      skillType: "fitness",
      skillId: "skill-fitness",
      fitnessActivePlan: {
        managedBy: "fitnessActivePlan",
        planTemplateId: "push-pull-legs",
        linkedFitnessHabitId: "habit-fitness-plan",
      },
    });
    expect(isFitnessPlanScheduleMetadata(metadata)).toBe(true);
    expect(isFitnessPlanScheduleMetadata({ title: "Fitness" })).toBe(false);
  });

  it("keeps linked Habit schedule aligned to chosen weekdays and duration", () => {
    const configuredPlan: FitnessActivePlan = {
      ...activePlan,
      targetDaysPerWeek: 5,
      weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
      sessionDurationMinutes: 45,
    };
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan: configuredPlan,
      now: configuredPlan.updatedAt,
    });
    const metadata = readFitnessPlanHabitMetadata(memoConfig);
    const scheduleMetadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      skillId: "skill-fitness",
      memoCaptureConfig: memoConfig,
    });

    expect(metadata).toMatchObject({
      weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
      sessionDurationMinutes: 45,
    });
    expect(scheduleMetadata).toMatchObject({
      fitnessActivePlan: {
        weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
        sessionDurationMinutes: 45,
      },
    });
  });

  it("reuses the linked Fitness Habit on activation retries", () => {
    const row = {
      id: "habit-fitness-plan",
      name: "Fitness - Push / Pull / Legs",
      memo_capture_config: buildFitnessPlanHabitMemoCaptureConfig({
        current: null,
        activePlan,
        now: activePlan.updatedAt,
      }),
      duration_minutes: 60,
      recurrence: "daily",
      recurrence_days: [1, 3, 5],
      skill_id: "skill-fitness",
    };

    expect(chooseFitnessPlanHabitRowForUpdate([row], activePlan)).toBe(row);
  });
});
