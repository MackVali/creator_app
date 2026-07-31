import type { CustomFitnessExercise } from "@/lib/fitness/customLibrary";

export type FitnessCustomExerciseCatalogItem = {
  name: string;
  movementType: string;
  primaryArea: string;
  equipment: string;
  guidance: string;
  notes: string;
};

export function customFitnessExerciseToCatalogItem(
  exercise: CustomFitnessExercise,
): FitnessCustomExerciseCatalogItem {
  return {
    name: exercise.name,
    movementType: exercise.movementType,
    primaryArea: exercise.primaryArea,
    equipment: exercise.equipment,
    guidance: exercise.guidance,
    notes: exercise.notes,
  };
}

