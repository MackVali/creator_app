export type FitnessResistanceUnit = "lb" | "kg" | "bodyweight" | "assisted" | "machine";

export type FitnessResistanceExerciseMetadata = {
  id?: string | null;
  exerciseId?: string | null;
  name?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  movementType?: string | null;
  primaryArea?: string | null;
  category?: string | null;
  tags?: readonly string[] | string | null;
};

export type FitnessResistanceKind = "bodyweight" | "external" | "assisted" | "machine";

const BODYWEIGHT_EXERCISE_NAMES = new Set([
  "arm circles",
  "bird dog",
  "bodyweight squat",
  "broad jump",
  "burpee",
  "chin up",
  "child s pose",
  "close grip push up",
  "couch stretch",
  "crunch",
  "dead bug",
  "dead hang",
  "decline push up",
  "dip",
  "forward lunge",
  "hanging knee raise",
  "high knees",
  "hip hinge",
  "hip opener",
  "incline push up",
  "inverted row",
  "jumping jack",
  "leg raise",
  "lunge",
  "mountain climber",
  "nordic curl",
  "pike push up",
  "plank",
  "pull up",
  "push up",
  "reverse lunge",
  "russian twist",
  "side plank",
  "sit up",
  "skater jump",
  "split squat",
  "thoracic rotation",
  "walking lunge",
  "world s greatest stretch",
]);

function normalizeFitnessResistanceText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTags(metadata: FitnessResistanceExerciseMetadata) {
  if (Array.isArray(metadata.tags)) return metadata.tags;
  if (typeof metadata.tags === "string") return [metadata.tags];
  return [];
}

export function isFitnessBodyweightExercise(
  metadata: FitnessResistanceExerciseMetadata,
) {
  const equipment = metadata.equipment ?? "";
  const normalizedEquipment = normalizeFitnessResistanceText(equipment);
  if (normalizedEquipment === "bodyweight") return true;

  if (
    getTags(metadata).some((tag) => normalizeFitnessResistanceText(tag) === "bodyweight")
  ) {
    return true;
  }

  const normalizedNames = [
    metadata.exerciseId,
    metadata.id,
    metadata.exerciseName,
    metadata.name,
  ]
    .map(normalizeFitnessResistanceText)
    .filter(Boolean);

  return normalizedNames.some((name) => BODYWEIGHT_EXERCISE_NAMES.has(name));
}

export function getFitnessExerciseResistanceKind(
  metadata: FitnessResistanceExerciseMetadata,
  unit?: string | null,
): FitnessResistanceKind {
  if (unit === "assisted") return "assisted";
  if (unit === "machine") return "machine";
  if (unit === "bodyweight") return "bodyweight";
  return isFitnessBodyweightExercise(metadata) ? "bodyweight" : "external";
}

export function sanitizeFitnessResistanceValue(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return "";
  const clamped = Math.max(0, parsed);
  return Number(clamped.toFixed(2)).toString();
}

export function getFitnessResistanceStep(unit: FitnessResistanceUnit | string | null | undefined) {
  return unit === "kg" ? 2.5 : 5;
}

export function getDefaultAddedFitnessLoad(unit: "lb" | "kg") {
  return unit === "kg" ? "2.5" : "5";
}

export function isExternalFitnessLoadUnit(unit: string | null | undefined): unit is "lb" | "kg" {
  return unit === "lb" || unit === "kg";
}

export function formatFitnessResistanceLabel(options: {
  weight?: string | number | null;
  unit?: string | null;
  exercise?: FitnessResistanceExerciseMetadata | null;
  emptyNumericLabel?: string;
}) {
  const unit = options.unit;
  if (unit === "bodyweight") return "Bodyweight";

  const rawWeight =
    typeof options.weight === "number"
      ? String(options.weight)
      : typeof options.weight === "string"
        ? options.weight.trim()
        : "";
  const sanitized = rawWeight ? sanitizeFitnessResistanceValue(rawWeight) : "";
  const displayWeight = sanitized || options.emptyNumericLabel || "";
  if (!displayWeight) return null;

  if (unit === "assisted") return `${displayWeight} lb assistance`;
  if (unit === "machine") return `${displayWeight} machine`;
  if (unit === "lb" || unit === "kg") {
    const prefix = options.exercise && isFitnessBodyweightExercise(options.exercise) ? "+" : "";
    return `${prefix}${displayWeight} ${unit}`;
  }

  return displayWeight;
}
