import { describe, expect, it, vi } from "vitest";
import { resolveCreatorDay, resolveCreatorDayForDate } from "@/lib/creatorDay";
import {
  buildIlavCheckInPayload,
  type BuildIlavCheckInPayloadArgs,
} from "@/lib/ai/ilavCheckIn";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";

vi.mock("openai", () => {
  throw new Error("OpenAI must not be imported for ILAV check-in generation.");
});

function instance(
  id: string,
  start: string,
  end: string,
  overrides: Partial<ScheduleInstance> = {}
): ScheduleInstance {
  return {
    id,
    user_id: "user-1",
    source_type: "PROJECT",
    source_id: id,
    event_name: id,
    project_name: null,
    start_utc: start,
    end_utc: end,
    status: "scheduled",
    completed_at: null,
    canceled_reason: null,
    day_type_time_block_id: null,
    duration_min: 60,
    energy_resolved: "MEDIUM",
    locked: false,
    metadata: null,
    missed_reason: null,
    notes: null,
    overlay_window_id: null,
    placement_source: "scheduler",
    practice_context_monument_id: null,
    scheduled_at: start,
    time_block_id: null,
    updated_at: start,
    weight_snapshot: 0,
    window_id: null,
    ...overrides,
  } as ScheduleInstance;
}

function habit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: "habit-1",
    name: "Vitamins",
    memoCaptureConfig: null,
    durationMinutes: 5,
    createdAt: "2026-09-17T12:00:00Z",
    updatedAt: "2026-09-17T12:00:00Z",
    lastCompletedAt: null,
    currentStreakDays: 0,
    longestStreakDays: 0,
    habitType: "HABIT",
    windowId: null,
    energy: "LOW",
    recurrence: "daily",
    recurrenceDays: null,
    recurrenceMode: "INTERVAL",
    anchorType: null,
    anchorValue: null,
    anchorStartDate: null,
    skillId: null,
    goalId: null,
    completionTarget: null,
    finishedAt: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    nextDueOverride: null,
    fixedStartLocal: null,
    fixedEndLocal: null,
    fixedTimezone: null,
    window: null,
    ...overrides,
  };
}

function build(overrides: Partial<BuildIlavCheckInPayloadArgs> = {}) {
  const creatorDay =
    overrides.creatorDay ??
    resolveCreatorDayForDate("2026-09-18", "America/Chicago", "profile");
  return buildIlavCheckInPayload({
    type: "midday",
    creatorDay,
    timeZone: "America/Chicago",
    generatedAt: new Date("2026-09-18T18:00:00Z"),
    instances: [],
    habits: [],
    completedHabitIds: new Set(),
    ...overrides,
  });
}

describe("buildIlavCheckInPayload", () => {
  it("respects the 4 AM Creator-day boundary", () => {
    const day = resolveCreatorDay({
      instant: new Date("2026-09-18T03:59:00-05:00"),
      profileTimezone: "America/Chicago",
    });
    expect(day.creatorDayDate).toBe("2026-09-17");
  });

  it("includes today's scheduled items in the morning payload", () => {
    const payload = build({
      type: "morning",
      instances: [
        instance("Breakfast", "2026-09-18T13:00:00Z", "2026-09-18T13:30:00Z"),
      ],
    });

    expect(payload.scheduled.map((item) => item.title)).toEqual(["Breakfast"]);
    expect(payload.counts.scheduled).toBe(1);
    expect(payload.scheduled[0]).toMatchObject({
      scheduleInstanceId: "Breakfast",
      itemType: "scheduled_instance",
      representsDueHabit: false,
      canComplete: true,
      isCompleted: false,
    });
  });

  it("separates completed, missed-or-elapsed, and upcoming for midday", () => {
    const payload = build({
      type: "midday",
      generatedAt: new Date("2026-09-18T18:00:00Z"),
      instances: [
        instance("Breakfast", "2026-09-18T13:00:00Z", "2026-09-18T13:30:00Z", {
          status: "completed",
          completed_at: "2026-09-18T13:20:00Z",
        }),
        instance("FAFSA", "2026-09-18T15:00:00Z", "2026-09-18T16:00:00Z"),
        instance("Workout", "2026-09-18T21:30:00Z", "2026-09-18T22:30:00Z"),
      ],
    });

    expect(payload.completed.map((item) => item.title)).toEqual(["Breakfast"]);
    expect(payload.missed.map((item) => item.title)).toEqual(["FAFSA"]);
    expect(payload.upcoming.map((item) => item.title)).toEqual(["Workout"]);
  });

  it("summarizes completed vs not-completed for night", () => {
    const payload = build({
      type: "night",
      generatedAt: new Date("2026-09-19T03:00:00Z"),
      instances: [
        instance("Court", "2026-09-18T14:00:00Z", "2026-09-18T16:00:00Z", {
          completed_at: "2026-09-18T16:05:00Z",
        }),
        instance("Portfolio", "2026-09-19T01:00:00Z", "2026-09-19T02:00:00Z"),
      ],
    });

    expect(payload.completed.map((item) => item.title)).toEqual(["Court"]);
    expect(payload.missed.map((item) => item.title)).toEqual(["Portfolio"]);
  });

  it("does not repeat scheduled habits under due unscheduled habits", () => {
    const payload = build({
      habits: [habit({ id: "habit-1", name: "Vitamins" })],
      instances: [
        instance("Vitamins", "2026-09-18T14:00:00Z", "2026-09-18T14:05:00Z", {
          source_type: "HABIT",
          source_id: "habit-1",
        }),
      ],
    });

    expect(payload.dueUnscheduledHabits).toEqual([]);
  });

  it("surfaces due unscheduled habits", () => {
    const payload = build({
      habits: [habit({ id: "habit-1", name: "Vitamins" })],
    });

    expect(payload.dueUnscheduledHabits.map((item) => item.title)).toEqual([
      "Vitamins",
    ]);
    expect(payload.dueUnscheduledHabits[0]).toMatchObject({
      sourceType: "HABIT",
      sourceId: "habit-1",
      scheduleInstanceId: null,
      itemType: "due_habit",
      representsDueHabit: true,
      canComplete: true,
      isCompleted: false,
    });
  });

  it("reclassifies a successfully completed scheduled item from missed to done", () => {
    const before = build({
      type: "midday",
      generatedAt: new Date("2026-09-18T18:00:00Z"),
      instances: [
        instance("Clean", "2026-09-18T13:30:00Z", "2026-09-18T13:45:00Z", {
          source_type: "HABIT",
          source_id: "habit-1",
          status: "missed",
        }),
      ],
    });
    const after = build({
      type: "midday",
      generatedAt: new Date("2026-09-18T18:00:00Z"),
      instances: [
        instance("Clean", "2026-09-18T13:30:00Z", "2026-09-18T13:45:00Z", {
          source_type: "HABIT",
          source_id: "habit-1",
          status: "completed",
          completed_at: "2026-09-18T15:00:00Z",
        }),
      ],
    });

    expect(before.missed.map((item) => item.title)).toEqual(["Clean"]);
    expect(before.completed).toEqual([]);
    expect(after.missed).toEqual([]);
    expect(after.completed.map((item) => item.title)).toEqual(["Clean"]);
  });

  it("classifies day-span HABIT instances as due instead of timed", () => {
    const creatorDay = resolveCreatorDayForDate(
      "2026-09-18",
      "America/Chicago",
      "profile"
    );
    const payload = build({
      creatorDay,
      habits: [
        habit({ id: "habit-1", name: "Meal Prep", habitType: "CHORE" }),
      ],
      instances: [
        instance("Meal Prep", creatorDay.startsAt, creatorDay.endsAt, {
          source_type: "HABIT",
          source_id: "habit-1",
          duration_min: 60,
        }),
      ],
    });

    expect(payload.scheduled).toEqual([]);
    expect(payload.missed).toEqual([]);
    expect(payload.upcoming).toEqual([]);
    expect(payload.dueUnscheduledHabits.map((item) => item.title)).toEqual([
      "Meal Prep",
    ]);
  });

  it("does not allow day-span HABIT instances to appear in both missed and upcoming", () => {
    const creatorDay = resolveCreatorDayForDate(
      "2026-09-18",
      "America/Chicago",
      "profile"
    );
    const payload = build({
      creatorDay,
      generatedAt: new Date("2026-09-18T18:00:00Z"),
      habits: [habit({ id: "habit-1", name: "Meal Prep" })],
      instances: [
        instance("Meal Prep", creatorDay.startsAt, creatorDay.endsAt, {
          source_type: "HABIT",
          source_id: "habit-1",
          duration_min: 60,
        }),
      ],
    });

    const missedIds = new Set(payload.missed.map((item) => item.sourceId));
    const upcomingIds = new Set(payload.upcoming.map((item) => item.sourceId));
    expect(missedIds.has("habit-1")).toBe(false);
    expect(upcomingIds.has("habit-1")).toBe(false);
    expect(payload.missed).toEqual([]);
    expect(payload.upcoming).toEqual([]);
  });

  it("dedupes day-span HABIT instances against recurrence-derived due habits", () => {
    const creatorDay = resolveCreatorDayForDate(
      "2026-09-18",
      "America/Chicago",
      "profile"
    );
    const payload = build({
      creatorDay,
      habits: [habit({ id: "habit-1", name: "Meal Prep" })],
      instances: [
        instance("Meal Prep Placeholder", creatorDay.startsAt, creatorDay.endsAt, {
          source_type: "HABIT",
          source_id: "habit-1",
        }),
      ],
    });

    expect(payload.dueUnscheduledHabits).toHaveLength(1);
    expect(payload.dueUnscheduledHabits[0]).toMatchObject({
      id: "habit-1",
      title: "Meal Prep",
    });
  });

  it("excludes PRACTICE habits from due today", () => {
    const creatorDay = resolveCreatorDayForDate(
      "2026-09-18",
      "America/Chicago",
      "profile"
    );
    const payload = build({
      creatorDay,
      habits: [habit({ id: "practice-1", name: "SKAT", habitType: "PRACTICE" })],
      instances: [
        instance("SKAT", creatorDay.startsAt, creatorDay.endsAt, {
          source_type: "HABIT",
          source_id: "practice-1",
        }),
      ],
    });

    expect(payload.dueUnscheduledHabits).toEqual([]);
  });

  it("keeps CHORE, HABIT, and SYNC habits eligible for due today", () => {
    const payload = build({
      habits: [
        habit({ id: "chore-1", name: "Meal Prep", habitType: "CHORE" }),
        habit({ id: "habit-1", name: "Vitamins", habitType: "HABIT" }),
        habit({ id: "sync-1", name: "Review calendar", habitType: "SYNC" }),
      ],
    });

    expect(payload.dueUnscheduledHabits.map((item) => item.id)).toEqual([
      "chore-1",
      "habit-1",
      "sync-1",
    ]);
  });

  it("excludes canceled and cancelled schedule instances", () => {
    const payload = build({
      instances: [
        instance("Canceled", "2026-09-18T13:00:00Z", "2026-09-18T14:00:00Z", {
          status: "canceled",
        }),
        instance("Cancelled", "2026-09-18T15:00:00Z", "2026-09-18T16:00:00Z", {
          status: "cancelled" as ScheduleInstance["status"],
        }),
      ],
    });

    expect(payload.scheduled).toEqual([]);
    expect(payload.counts.scheduled).toBe(0);
  });

  it("does not invoke OpenAI during generation", () => {
    const payload = build({
      instances: [
        instance("Creator", "2026-09-18T20:00:00Z", "2026-09-18T21:00:00Z"),
      ],
    });

    expect(payload.counts.scheduled).toBe(1);
  });
});
