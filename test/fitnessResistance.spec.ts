import { describe, expect, it } from "vitest";
import {
  formatFitnessResistanceLabel,
  isFitnessBodyweightExercise,
  sanitizeFitnessResistanceValue,
} from "@/lib/fitness/resistance";

describe("fitness resistance helpers", () => {
  it("classifies exact bodyweight equipment as bodyweight", () => {
    expect(
      isFitnessBodyweightExercise({
        exerciseName: "Bodyweight Squat",
        equipment: "Bodyweight",
      }),
    ).toBe(true);
  });

  it("uses exact name fallback for calisthenics with non-bodyweight equipment labels", () => {
    expect(
      isFitnessBodyweightExercise({
        exerciseName: "Pull-up",
        equipment: "Pull-up bar",
      }),
    ).toBe(true);
  });

  it("does not classify arbitrary mixed-equipment lifts as bodyweight", () => {
    expect(
      isFitnessBodyweightExercise({
        exerciseName: "Calf Raise",
        equipment: "Bodyweight, machine, or dumbbells",
      }),
    ).toBe(false);
  });

  it("formats pure, added, assisted, and machine resistance distinctly", () => {
    expect(formatFitnessResistanceLabel({ unit: "bodyweight" })).toBe("Bodyweight");
    expect(
      formatFitnessResistanceLabel({
        weight: "25",
        unit: "lb",
        exercise: { exerciseName: "Pull-up" },
      }),
    ).toBe("+25 lb");
    expect(formatFitnessResistanceLabel({ weight: "40", unit: "assisted" })).toBe(
      "40 lb assistance",
    );
    expect(formatFitnessResistanceLabel({ weight: "7", unit: "machine" })).toBe(
      "7 machine",
    );
  });

  it("sanitizes decimal numeric entry", () => {
    expect(sanitizeFitnessResistanceValue("22.50")).toBe("22.5");
    expect(sanitizeFitnessResistanceValue("-4")).toBe("0");
    expect(sanitizeFitnessResistanceValue("abc")).toBe("");
  });
});
