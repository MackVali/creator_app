import type { CustomFitnessExercise } from "@/lib/fitness/customLibrary";

export type FitnessCustomExerciseCatalogItem = {
  name: string;
  movementType: string;
  primaryArea: string;
  equipment: string;
  guidance: string;
  notes: string;
  source: "custom";
  customExerciseId: string;
  secondaryMuscleGroup?: string;
  trackingType?: "reps" | "timed";
  resistanceType?: "bodyweight" | "weighted" | "assisted" | "machine" | "none";
  defaultSets?: number;
  defaultReps?: number;
  defaultDurationSeconds?: number;
  tags?: string[];
};

export function customFitnessExerciseToCatalogItem(
  exercise: CustomFitnessExercise,
): FitnessCustomExerciseCatalogItem {
  return {
    name: exercise.name,
    movementType: exercise.movementType,
    primaryArea: exercise.primaryMuscleGroup ?? exercise.primaryArea,
    equipment: exercise.equipment,
    guidance: exercise.guidance,
    notes: exercise.notes,
    source: "custom",
    customExerciseId: exercise.id,
    secondaryMuscleGroup: exercise.secondaryMuscleGroup,
    trackingType: exercise.trackingType,
    resistanceType: exercise.resistanceType,
    defaultSets: exercise.defaultSets,
    defaultReps: exercise.defaultReps,
    defaultDurationSeconds: exercise.defaultDurationSeconds,
    tags: exercise.resistanceType === "bodyweight" ? ["bodyweight"] : [],
  };
}
