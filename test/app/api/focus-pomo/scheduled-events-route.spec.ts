import { describe, expect, it } from "vitest";

import { mapScheduleInstance } from "@/app/api/focus-pomo/scheduled-events/route";
import {
  buildFitnessPlanHabitMemoCaptureConfig,
  buildFitnessPlanScheduleInstanceMetadata,
} from "@/lib/fitness/planHabit";
import type { FitnessActivePlan } from "@/lib/fitness/activePlan";

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

function row(
  metadata: Parameters<typeof mapScheduleInstance>[0]["metadata"],
): Parameters<typeof mapScheduleInstance>[0] {
  return {
    id: "instance-1",
    source_type: "HABIT",
    source_id: "habit-fitness-plan",
    event_name: "FITNESS",
    project_name: null,
    duration_min: 60,
    energy_resolved: "MEDIUM",
    start_utc: "2026-07-29T14:00:00.000Z",
    end_utc: "2026-07-29T15:00:00.000Z",
    status: "scheduled",
    time_block_id: "block-1",
    day_type_time_block_id: null,
    window_id: "window-1",
    metadata,
  };
}

describe("Focus Pomo scheduled-events Fitness serialization", () => {
  it("returns a plan-managed marker and routine subtitle for snapshotted Fitness instances", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const item = mapScheduleInstance(
      row(
        buildFitnessPlanScheduleInstanceMetadata({
          habitId: "habit-fitness-plan",
          skillId: "skill-fitness",
          memoCaptureConfig: memoConfig,
          occurrenceOffset: 1,
        }),
      ),
    );

    expect(item).toMatchObject({
      id: "habit-fitness-plan",
      title: "FITNESS",
      subtitle: "Pull Day",
      isFitnessPlanManaged: true,
      is_fitness_plan_managed: true,
      fitnessPlanTemplateId: "push-pull-legs",
      fitnessRoutineTemplateId: "pull-day",
      fitnessRoutineTitle: "Pull Day",
      fitnessRoutineIndex: 1,
    });
    expect(item.title).not.toBe("Push / Pull / Legs");
  });

  it("keeps the plan-managed marker when routine metadata is absent", () => {
    const item = mapScheduleInstance(
      row({
        presentationKind: "fitness-plan",
        source: "fitness-active-plan",
        fitnessPlanTemplateId: "push-pull-legs",
        fitnessActivePlan: {
          managedBy: "fitnessActivePlan",
          planTemplateId: "push-pull-legs",
          linkedFitnessHabitId: "habit-fitness-plan",
        },
      }),
    );

    expect(item).toMatchObject({
      title: "FITNESS",
      subtitle: "Habit",
      isFitnessPlanManaged: true,
      fitnessPlanTemplateId: "push-pull-legs",
      fitnessRoutineTemplateId: null,
      fitnessRoutineTitle: null,
      fitnessRoutineIndex: null,
    });
  });

  it("leaves generic Habits unchanged", () => {
    const item = mapScheduleInstance(row(null));

    expect(item).toMatchObject({
      title: "FITNESS",
      subtitle: "Habit",
      isFitnessPlanManaged: false,
      fitnessPlanTemplateId: null,
      fitnessRoutineTemplateId: null,
      fitnessRoutineTitle: null,
    });
  });
});
