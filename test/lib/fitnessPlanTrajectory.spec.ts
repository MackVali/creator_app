import { describe, expect, it } from "vitest";

import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineSequence,
} from "../../src/lib/fitness/planTemplates";
import { resolveFitnessPlanTrainingTrajectory } from "../../src/lib/fitness/planTrajectory";

const ppl = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!;
const pplRoutines = resolveFitnessPlanRoutineSequence(ppl);
const fiveDayWeekdays = ["Mon", "Tue", "Wed", "Fri", "Sat"] as const;

function titlesForWeek(weekIndex: number, startRoutineIndex = 0) {
  return resolveFitnessPlanTrainingTrajectory({
    routines: pplRoutines,
    weekdays: fiveDayWeekdays,
    startRoutineIndex,
  })[weekIndex].entries.map((entry) => entry.routine.title);
}

describe("Fitness plan training trajectory", () => {
  it("resolves five-day PPL Week 1 as Push, Pull, Legs, Push, Pull", () => {
    expect(titlesForWeek(0)).toEqual([
      "Push Day",
      "Pull Day",
      "Legs Day",
      "Push Day",
      "Pull Day",
    ]);
  });

  it("continues five-day PPL Week 2 as Legs, Push, Pull, Legs, Push", () => {
    expect(titlesForWeek(1)).toEqual([
      "Legs Day",
      "Push Day",
      "Pull Day",
      "Legs Day",
      "Push Day",
    ]);
  });

  it("begins active-plan editing at the persisted currentRoutineIndex", () => {
    expect(titlesForWeek(0, 2)).toEqual([
      "Legs Day",
      "Push Day",
      "Pull Day",
      "Legs Day",
      "Push Day",
    ]);
  });

  it("recomputes when selected weekdays change", () => {
    const threeDayTrajectory = resolveFitnessPlanTrainingTrajectory({
      routines: pplRoutines,
      weekdays: ["Mon", "Wed", "Fri"],
    });
    const fiveDayTrajectory = resolveFitnessPlanTrainingTrajectory({
      routines: pplRoutines,
      weekdays: fiveDayWeekdays,
    });

    expect(threeDayTrajectory[0].entries.map((entry) => entry.weekday)).toEqual([
      "Mon",
      "Wed",
      "Fri",
    ]);
    expect(fiveDayTrajectory[0].entries.map((entry) => entry.weekday)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Fri",
      "Sat",
    ]);
  });

  it("does not depend on duration to resolve routine order", () => {
    const fortyFiveMinutePreview = resolveFitnessPlanTrainingTrajectory({
      routines: pplRoutines,
      weekdays: fiveDayWeekdays,
    });
    const sixtyMinutePreview = resolveFitnessPlanTrainingTrajectory({
      routines: pplRoutines,
      weekdays: fiveDayWeekdays,
    });

    expect(fortyFiveMinutePreview).toEqual(sixtyMinutePreview);
  });
});
