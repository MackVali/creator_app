import { describe, expect, it } from "vitest";

import { FITNESS_PLAN_TEMPLATES } from "../../src/lib/fitness/planTemplates";
import {
  buildFitnessActivePlan,
  readFitnessActivePlanFromMetadata,
} from "../../src/lib/fitness/activePlan";

const now = "2026-07-29T12:00:00.000Z";
const ppl = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!;

describe("Fitness plan frequency templates", () => {
  it("allows two through six PPL days without duplicating the routine sequence", () => {
    expect(ppl.allowedDaysPerWeek).toEqual([2, 3, 4, 5, 6]);
    expect(ppl.routineSequence).toEqual(["push-day", "pull-day", "legs-day"]);
  });

  it("recommends three or six PPL days without requiring either", () => {
    expect(ppl.recommendedDaysPerWeek).toEqual([3, 6]);
    expect(ppl.allowedDaysPerWeek).toContain(5);
  });

  it("validates weekday count against the selected target frequency", () => {
    const validFiveDayPlan = buildFitnessActivePlan({
      plan: ppl,
      targetDaysPerWeek: 5,
      weekdays: ["Mon", "Tue", "Wed", "Fri", "Sat"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });
    const invalidFiveDayPlan = buildFitnessActivePlan({
      plan: ppl,
      targetDaysPerWeek: 5,
      weekdays: ["Mon", "Wed", "Fri"],
      sessionDurationMinutes: 60,
      equipmentProfile: "Full gym",
      now,
    });

    expect(readFitnessActivePlanFromMetadata({ fitnessActivePlan: validFiveDayPlan })).toEqual(
      validFiveDayPlan,
    );
    expect(
      readFitnessActivePlanFromMetadata({ fitnessActivePlan: invalidFiveDayPlan }),
    ).toBeNull();
  });
});
