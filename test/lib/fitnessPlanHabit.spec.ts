import { describe, expect, it } from "vitest";

import {
  buildFitnessPlanHabitTitle,
  buildFitnessPlanHabitMemoCaptureConfig,
  buildFitnessPlanScheduleInstanceMetadata,
  chooseFitnessPlanHabitRowForUpdate,
  ensureFitnessActivePlanHabit,
  FITNESS_PLAN_HABIT_TITLE,
  isFitnessPlanManagedHabit,
  isFitnessPlanScheduleMetadata,
  readFitnessPlanSchedulePlanSnapshot,
  readFitnessPlanHabitMetadata,
  readFitnessPlanScheduleRoutineAssignment,
  resolveAuthoritativeFitnessSkillId,
  resolveFitnessPlanDueRoutineAssignment,
  resolveFitnessPlanRoutineAssignmentForDate,
  resolveFitnessPlanScheduleCardPresentation,
  resolveFitnessPlanScheduleDisplayText,
} from "../../src/lib/fitness/planHabit";
import type { FitnessActivePlan } from "../../src/lib/fitness/activePlan";
import { FITNESS_PLAN_TEMPLATES } from "../../src/lib/fitness/planTemplates";

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

function createPlanHabitClient({
  skills = [],
  habits = [],
}: {
  skills?: unknown[];
  habits?: unknown[];
}) {
  const calls: Array<{ table: string; operation: string; payload?: unknown }> = [];

  function result(data: unknown, error: unknown = null) {
    return {
      data,
      error,
      then(onFulfilled: (value: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(onFulfilled({ data, error }));
      },
    };
  }

  function chain(table: string, operation: string, payload?: unknown) {
    calls.push({ table, operation, payload });
    const data =
      table === "skills"
        ? skills
        : table === "habits" && operation === "select"
          ? habits
          : table === "habits" && operation === "insert"
            ? [{ id: "inserted-fitness-habit" }]
            : [];
    const query = {
      eq: () => query,
      is: () => query,
      in: () => query,
      gte: () => query,
      select: () => query,
      single: () => result(Array.isArray(data) ? data[0] : data),
      then(onFulfilled: (value: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(onFulfilled({ data, error: null }));
      },
    };
    return query;
  }

  return {
    calls,
    client: {
      from(table: string) {
        return {
          select: () => chain(table, "select"),
          update: (payload: unknown) => chain(table, "update", payload),
          insert: (payload: unknown) => chain(table, "insert", payload),
        };
      },
    },
  };
}

describe("fitness plan managed habit metadata", () => {
  it("uses the exact managed Habit title", () => {
    const ppl = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!;

    expect(buildFitnessPlanHabitTitle(ppl)).toBe("FITNESS");
    expect(FITNESS_PLAN_HABIT_TITLE).toBe("FITNESS");
  });

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
      currentRoutineIndex: 0,
      skillType: "fitness",
    });
  });

  it("uses active plan routine snapshots for custom plan schedule metadata", () => {
    const customPlan: FitnessActivePlan = {
      ...activePlan,
      planTemplateId: "custom-plan-three-day",
      planTitle: "Three Day Custom",
      routineSequenceSnapshot: [
        {
          fitnessRoutineTemplateId: "custom-routine-upper",
          fitnessRoutineTitle: "Custom Upper",
        },
        {
          fitnessRoutineTemplateId: "custom-routine-lower",
          fitnessRoutineTitle: "Custom Lower",
        },
      ],
    };
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan: customPlan,
      now: customPlan.updatedAt,
    });
    const metadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      memoCaptureConfig: memoConfig,
      occurrenceOffset: 1,
    });

    expect(readFitnessPlanHabitMetadata(memoConfig)?.routineSequenceSnapshot).toEqual(
      customPlan.routineSequenceSnapshot,
    );
    expect(metadata).toMatchObject({
      fitnessPlanTemplateId: "custom-plan-three-day",
      fitnessRoutineTemplateId: "custom-routine-lower",
      fitnessRoutineTitle: "Custom Lower",
    });
    expect(
      resolveFitnessPlanScheduleDisplayText({
        memoCaptureConfig: memoConfig,
        fallbackOccurrenceOffset: 0,
      }).routineTitle,
    ).toBe("Custom Upper");
  });

  it("builds authoritative schedule instance metadata for rendering and routine loading", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const metadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      skillId: "skill-fitness",
      memoCaptureConfig: memoConfig,
      occurrenceOffset: 1,
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
        currentRoutineIndex: 0,
        fitnessPlanTemplateId: "push-pull-legs",
        fitnessRoutineTemplateId: "pull-day",
        fitnessRoutineTitle: "Pull Day",
        fitnessRoutineIndex: 1,
        fitnessRoutineOccurrenceOffset: 1,
      },
    });
    expect(isFitnessPlanScheduleMetadata(metadata)).toBe(true);
    expect(isFitnessPlanScheduleMetadata({ title: "Fitness" })).toBe(false);
    expect(readFitnessPlanScheduleRoutineAssignment(metadata)).toMatchObject({
      fitnessRoutineTemplateId: "pull-day",
      fitnessRoutineTitle: "Pull Day",
      fitnessRoutineIndex: 1,
    });
  });

  it("resolves PPL occurrences in chronological order", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const titles = [0, 1, 2, 3].map((occurrenceOffset) => {
      const metadata = buildFitnessPlanScheduleInstanceMetadata({
        habitId: "habit-fitness-plan",
        skillId: "skill-fitness",
        memoCaptureConfig: memoConfig,
        occurrenceOffset,
      });

      return readFitnessPlanScheduleRoutineAssignment(metadata)?.fitnessRoutineTitle;
    });

    expect(titles).toEqual(["Push Day", "Pull Day", "Legs Day", "Push Day"]);
  });

  it("begins occurrence rotation at currentRoutineIndex", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan: { ...activePlan, currentRoutineIndex: 2 },
      now: activePlan.updatedAt,
    });
    const titles = [0, 1, 2].map((occurrenceOffset) =>
      readFitnessPlanScheduleRoutineAssignment(
        buildFitnessPlanScheduleInstanceMetadata({
          habitId: "habit-fitness-plan",
          skillId: "skill-fitness",
          memoCaptureConfig: memoConfig,
          occurrenceOffset,
        }),
      )?.fitnessRoutineTitle,
    );

    expect(titles).toEqual(["Legs Day", "Push Day", "Pull Day"]);
  });

  it("continues occurrence rotation across calendar-week boundaries", () => {
    const fiveDayActivePlan: FitnessActivePlan = {
      ...activePlan,
      weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
    };
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan: fiveDayActivePlan,
      now: activePlan.updatedAt,
    });
    const titles = [0, 1, 2, 3, 4, 5].map((occurrenceOffset) =>
      readFitnessPlanScheduleRoutineAssignment(
        buildFitnessPlanScheduleInstanceMetadata({
          habitId: "habit-fitness-plan",
          skillId: "skill-fitness",
          memoCaptureConfig: memoConfig,
          occurrenceOffset,
        }),
      )?.fitnessRoutineTitle,
    );

    expect(titles).toEqual([
      "Push Day",
      "Pull Day",
      "Legs Day",
      "Push Day",
      "Pull Day",
      "Legs Day",
    ]);
  });

  it("derives Due PPL routines continuously from selected weekdays without Monday reset", () => {
    const titles = [
      "2026-07-31T12:00:00.000Z",
      "2026-08-01T12:00:00.000Z",
      "2026-08-03T12:00:00.000Z",
      "2026-08-04T12:00:00.000Z",
    ].map((isoDate) =>
      resolveFitnessPlanRoutineAssignmentForDate({
        planTemplateId: "push-pull-legs",
        currentRoutineIndex: 0,
        weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
        horizonStart: new Date("2026-07-31T09:00:00.000Z"),
        occurrenceDate: new Date(isoDate),
        timeZone: "UTC",
      })?.fitnessRoutineTitle,
    );

    expect(titles).toEqual(["Push Day", "Pull Day", "Legs Day", "Push Day"]);
  });

  it("derives a Due routine from the parent Habit active-plan metadata", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });

    expect(
      resolveFitnessPlanDueRoutineAssignment({
        memoCaptureConfig: memoConfig,
        horizonStart: new Date("2026-08-03T09:00:00.000Z"),
        occurrenceDate: new Date("2026-08-07T09:00:00.000Z"),
        timeZone: "UTC",
      }),
    ).toMatchObject({
      fitnessRoutineTemplateId: "legs-day",
      fitnessRoutineTitle: "Legs Day",
      fitnessRoutineIndex: 2,
    });
  });

  it("exposes Schedule and Matrix card display text without the full Plan title", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const metadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      skillId: "skill-fitness",
      memoCaptureConfig: memoConfig,
      occurrenceOffset: 2,
    });
    const display = resolveFitnessPlanScheduleDisplayText({
      metadata,
      memoCaptureConfig: memoConfig,
    });

    expect(display.title).toBe("FITNESS");
    expect(display.routineTitle).toBe("Legs Day");
    expect(display.title).not.toContain("Push / Pull / Legs");
    expect(display.routineTitle).not.toBe("Push / Pull / Legs");
  });

  it("keeps a snapshotted routine when the active plan later changes", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const metadata = buildFitnessPlanScheduleInstanceMetadata({
      habitId: "habit-fitness-plan",
      skillId: "skill-fitness",
      memoCaptureConfig: memoConfig,
      occurrenceOffset: 1,
    });
    const changedMemoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan: { ...activePlan, currentRoutineIndex: 2 },
      now: activePlan.updatedAt,
    });

    expect(
      resolveFitnessPlanScheduleDisplayText({
        metadata,
        memoCaptureConfig: changedMemoConfig,
        fallbackOccurrenceOffset: 0,
      }).routineAssignment,
    ).toMatchObject({
      fitnessRoutineTemplateId: "pull-day",
      fitnessRoutineTitle: "Pull Day",
    });
  });

  it("derives legacy instance display from chronological fallback when possible", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });

    expect(
      resolveFitnessPlanScheduleDisplayText({
        metadata: {
          presentationKind: "fitness-plan",
          fitnessActivePlan: {
            managedBy: "fitnessActivePlan",
            planTemplateId: "push-pull-legs",
            planTitle: "Push / Pull / Legs",
            linkedFitnessHabitId: "habit-fitness-plan",
          },
        },
        memoCaptureConfig: memoConfig,
        fallbackOccurrenceOffset: 2,
      }),
    ).toMatchObject({
      title: "FITNESS",
      routineTitle: "Legs Day",
    });
  });

  it("falls back to FITNESS without the Plan title when legacy routine derivation is unavailable", () => {
    expect(
      resolveFitnessPlanScheduleDisplayText({
        metadata: {
          presentationKind: "fitness-plan",
          fitnessActivePlan: {
            managedBy: "fitnessActivePlan",
            planTemplateId: "push-pull-legs",
            planTitle: "Push / Pull / Legs",
          },
        },
        memoCaptureConfig: null,
        fallbackOccurrenceOffset: null,
      }),
    ).toMatchObject({
      title: "FITNESS",
      routineTitle: null,
    });
  });

  it("marks the real card predicate true from a serialized schedule instance and Habit memo config", () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const serializedInstance = {
      id: "instance-1",
      source_type: "HABIT",
      source_id: "habit-fitness-plan",
      metadata: buildFitnessPlanScheduleInstanceMetadata({
        habitId: "habit-fitness-plan",
        skillId: "skill-fitness",
        memoCaptureConfig: memoConfig,
        occurrenceOffset: 0,
      }),
    };
    const serializedHabit = {
      id: "habit-fitness-plan",
      name: "FITNESS",
      memoCaptureConfig: memoConfig,
    };

    const card = resolveFitnessPlanScheduleCardPresentation({
      metadata: serializedInstance.metadata,
      memoCaptureConfig: serializedHabit.memoCaptureConfig,
    });

    expect(card).toMatchObject({
      isFitnessPlanManaged: true,
      title: "FITNESS",
      routineTitle: "Push Day",
      fitnessPlanTemplateId: "push-pull-legs",
      linkedFitnessHabitId: "habit-fitness-plan",
    });
    expect(card?.title).not.toBe("Push / Pull / Legs");
    expect(card?.routineTitle).not.toBe("Push / Pull / Legs");
  });

  it("keeps the Fitness card predicate true and action-visible state when routine metadata is missing", () => {
    const metadata = {
      presentationKind: "fitness-plan",
      source: "fitness-active-plan",
      fitnessPlanTemplateId: "push-pull-legs",
      linkedFitnessHabitId: "habit-fitness-plan",
      fitnessActivePlan: {
        managedBy: "fitnessActivePlan",
        planTemplateId: "push-pull-legs",
        linkedFitnessHabitId: "habit-fitness-plan",
      },
    };

    expect(isFitnessPlanScheduleMetadata(metadata)).toBe(true);
    expect(readFitnessPlanScheduleRoutineAssignment(metadata)).toBeNull();
    expect(readFitnessPlanSchedulePlanSnapshot(metadata)).toMatchObject({
      fitnessPlanTemplateId: "push-pull-legs",
      linkedFitnessHabitId: "habit-fitness-plan",
    });
    expect(
      resolveFitnessPlanScheduleCardPresentation({
        metadata,
        memoCaptureConfig: null,
      }),
    ).toMatchObject({
      isFitnessPlanManaged: true,
      title: "FITNESS",
      routineTitle: null,
      routineAssignment: null,
      fitnessPlanTemplateId: "push-pull-legs",
    });
  });

  it("detects flattened API/client-normalized Fitness schedule metadata", () => {
    const flattened = {
      presentationKind: "fitness-plan",
      source: "fitness-active-plan",
      fitnessPlanTemplateId: "push-pull-legs",
      fitnessRoutineTemplateId: "legs-day",
      fitnessRoutineTitle: "Legs Day",
      fitnessRoutineIndex: 2,
      fitnessRoutineOccurrenceOffset: 2,
    };

    expect(readFitnessPlanScheduleRoutineAssignment(flattened)).toMatchObject({
      fitnessPlanTemplateId: "push-pull-legs",
      fitnessRoutineTemplateId: "legs-day",
      fitnessRoutineTitle: "Legs Day",
      fitnessRoutineIndex: 2,
    });
    expect(
      resolveFitnessPlanScheduleCardPresentation({
        metadata: flattened,
        memoCaptureConfig: null,
      }),
    ).toMatchObject({
      isFitnessPlanManaged: true,
      title: "FITNESS",
      routineTitle: "Legs Day",
    });
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

  it("resolves the existing EXERCISE Skill as the authoritative Fitness domain", async () => {
    const { client } = createPlanHabitClient({
      skills: [
        { id: "skill-cooking", name: "COOKING", global_skill: null },
        { id: "skill-exercise", name: "EXERCISE", global_skill: null },
      ],
    });

    await expect(
      resolveAuthoritativeFitnessSkillId({
        userId: "user-1",
        client,
      }),
    ).resolves.toBe("skill-exercise");
  });

  it("updates an existing linked null-skill Fitness Habit in place without creating a Skill or duplicate Habit", async () => {
    const memoConfig = buildFitnessPlanHabitMemoCaptureConfig({
      current: null,
      activePlan,
      now: activePlan.updatedAt,
    });
    const { client, calls } = createPlanHabitClient({
      skills: [{ id: "skill-exercise", name: "EXERCISE", global_skill: null }],
      habits: [
        {
          id: "habit-fitness-plan",
          name: "FITNESS",
          memo_capture_config: memoConfig,
          duration_minutes: 60,
          recurrence: "daily",
          recurrence_days: [1, 3, 5],
          skill_id: null,
        },
      ],
    });

    await expect(
      ensureFitnessActivePlanHabit({
        userId: "user-1",
        plan: FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!,
        activePlan,
        client,
      }),
    ).resolves.toBe("habit-fitness-plan");

    const habitUpdates = calls.filter(
      (call) => call.table === "habits" && call.operation === "update",
    );
    expect(habitUpdates).toHaveLength(1);
    expect(habitUpdates[0]?.payload).toMatchObject({
      skill_id: "skill-exercise",
      duration_minutes: 60,
      recurrence_days: [1, 3, 5],
    });
    expect(calls.some((call) => call.table === "habits" && call.operation === "insert")).toBe(false);
    expect(calls.some((call) => call.table === "skills" && call.operation === "insert")).toBe(false);
  });

  it("does not treat unrelated Habit titles as managed Fitness Habits", () => {
    expect(
      isFitnessPlanManagedHabit({
        memo_capture_config: { title: "Fitness - Push / Pull / Legs" },
      }),
    ).toBe(false);
    expect(chooseFitnessPlanHabitRowForUpdate([], activePlan)).toBeNull();
  });
});
