import { normalizeFitnessExerciseName } from "@/lib/fitness/progressiveOverload";

export type FitnessAnatomyMuscleId =
  | "abs"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "deltoids"
  | "forearm"
  | "gluteal"
  | "hamstring"
  | "lower-back"
  | "neck"
  | "obliques"
  | "quadriceps"
  | "tibialis"
  | "trapezius"
  | "triceps"
  | "upper-back";

export type FitnessAnatomyMuscleRole = "primary" | "secondary";

export type FitnessAnatomyMuscleActivation = {
  muscleId: FitnessAnatomyMuscleId;
  role: FitnessAnatomyMuscleRole;
};

export const FITNESS_ANATOMY_MUSCLES: readonly {
  id: FitnessAnatomyMuscleId;
  label: string;
}[] = [
  { id: "chest", label: "Chest" },
  { id: "deltoids", label: "Deltoids" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearm", label: "Forearms" },
  { id: "abs", label: "Abs" },
  { id: "obliques", label: "Obliques" },
  { id: "upper-back", label: "Upper Back" },
  { id: "trapezius", label: "Trapezius" },
  { id: "lower-back", label: "Lower Back" },
  { id: "gluteal", label: "Glutes" },
  { id: "quadriceps", label: "Quadriceps" },
  { id: "hamstring", label: "Hamstrings" },
  { id: "adductors", label: "Adductors" },
  { id: "calves", label: "Calves" },
  { id: "tibialis", label: "Tibialis" },
  { id: "neck", label: "Neck" },
];

function primary(muscleId: FitnessAnatomyMuscleId): FitnessAnatomyMuscleActivation {
  return { muscleId, role: "primary" };
}

function secondary(muscleId: FitnessAnatomyMuscleId): FitnessAnatomyMuscleActivation {
  return { muscleId, role: "secondary" };
}

const EXERCISE_ANATOMY = new Map<
  string,
  readonly FitnessAnatomyMuscleActivation[]
>(
  Object.entries({
    // CHEST
    "bench press": [
      primary("chest"),
      secondary("triceps"),
      secondary("deltoids"),
    ],
    "incline bench press": [
      primary("chest"),
      secondary("deltoids"),
      secondary("triceps"),
    ],
    "dumbbell press": [
      primary("chest"),
      secondary("triceps"),
      secondary("deltoids"),
    ],
    "chest fly": [primary("chest")],
    "cable fly": [primary("chest")],
    "push up": [
      primary("chest"),
      secondary("triceps"),
      secondary("deltoids"),
    ],
    "incline push up": [
      primary("chest"),
      secondary("triceps"),
      secondary("deltoids"),
    ],
    dip: [
      primary("chest"),
      secondary("triceps"),
      secondary("deltoids"),
    ],

    // SHOULDERS
    "shoulder press": [
      primary("deltoids"),
      secondary("triceps"),
    ],
    "arnold press": [
      primary("deltoids"),
      secondary("triceps"),
    ],
    "lateral raise": [primary("deltoids")],
    "front raise": [primary("deltoids")],
    "reverse fly": [
      primary("deltoids"),
      secondary("upper-back"),
    ],
    "face pull": [
      primary("deltoids"),
      secondary("upper-back"),
      secondary("trapezius"),
    ],

    // BICEPS / TRICEPS / FOREARMS
    curl: [
      primary("biceps"),
      secondary("forearm"),
    ],
    "biceps curl": [
      primary("biceps"),
      secondary("forearm"),
    ],
    "hammer curl": [
      primary("biceps"),
      secondary("forearm"),
    ],
    "preacher curl": [primary("biceps")],
    "triceps extension": [primary("triceps")],
    "skull crusher": [primary("triceps")],
    "close grip bench press": [
      primary("triceps"),
      secondary("chest"),
    ],
    "wrist curl": [primary("forearm")],
    "reverse wrist curl": [primary("forearm")],
    "reverse curl": [
      primary("forearm"),
      secondary("biceps"),
    ],
    "farmer s carry": [
      primary("forearm"),
      secondary("trapezius"),
      secondary("obliques"),
    ],
    "plate pinch": [primary("forearm")],
    "dead hang": [
      primary("forearm"),
      secondary("upper-back"),
    ],

    // UPPER BACK / TRAPS
    "pull up": [
      primary("upper-back"),
      secondary("biceps"),
      secondary("forearm"),
    ],
    "chin up": [
      primary("upper-back"),
      secondary("biceps"),
      secondary("forearm"),
    ],
    "lat pulldown": [
      primary("upper-back"),
      secondary("biceps"),
    ],
    "seated cable row": [
      primary("upper-back"),
      secondary("biceps"),
    ],
    "bent over row": [
      primary("upper-back"),
      secondary("biceps"),
      secondary("forearm"),
    ],
    "dumbbell row": [
      primary("upper-back"),
      secondary("biceps"),
      secondary("forearm"),
    ],
    "inverted row": [
      primary("upper-back"),
      secondary("biceps"),
    ],
    shrug: [primary("trapezius")],
    "barbell shrug": [primary("trapezius")],
    "dumbbell shrug": [primary("trapezius")],

    // LOWER BACK
    deadlift: [
      primary("hamstring"),
      secondary("gluteal"),
      secondary("lower-back"),
      secondary("trapezius"),
      secondary("forearm"),
    ],
    "romanian deadlift": [
      primary("hamstring"),
      secondary("gluteal"),
      secondary("lower-back"),
    ],
    "good morning": [
      primary("hamstring"),
      secondary("lower-back"),
      secondary("gluteal"),
    ],
    "back extension": [
      primary("lower-back"),
      secondary("gluteal"),
      secondary("hamstring"),
    ],
    hyperextension: [
      primary("lower-back"),
      secondary("gluteal"),
      secondary("hamstring"),
    ],

    // ABS / OBLIQUES
    crunch: [primary("abs")],
    "sit up": [primary("abs")],
    plank: [primary("abs")],
    "leg raise": [primary("abs")],
    "hanging knee raise": [
      primary("abs"),
      secondary("forearm"),
    ],
    "ab wheel": [primary("abs")],
    "cable crunch": [primary("abs")],
    "side plank": [
      primary("obliques"),
      secondary("deltoids"),
    ],
    "russian twist": [primary("obliques")],
    "wood chop": [primary("obliques")],
    "cable wood chop": [primary("obliques")],
    "pallof press": [primary("obliques")],
    "suitcase carry": [
      primary("obliques"),
      secondary("forearm"),
    ],

    // QUADS / GLUTES / HAMSTRINGS
    "back squat": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("hamstring"),
      secondary("abs"),
    ],
    "front squat": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("abs"),
    ],
    "goblet squat": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("abs"),
    ],
    "bodyweight squat": [
      primary("quadriceps"),
      secondary("gluteal"),
    ],
    "leg press": [
      primary("quadriceps"),
      secondary("gluteal"),
    ],
    "leg extension": [primary("quadriceps")],
    "split squat": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("adductors"),
    ],
    "bulgarian split squat": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("adductors"),
    ],
    "walking lunge": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("hamstring"),
      secondary("adductors"),
    ],
    "reverse lunge": [
      primary("quadriceps"),
      secondary("gluteal"),
      secondary("hamstring"),
    ],
    "hip thrust": [
      primary("gluteal"),
      secondary("hamstring"),
    ],
    "glute bridge": [
      primary("gluteal"),
      secondary("hamstring"),
    ],
    "leg curl": [primary("hamstring")],
    "seated leg curl": [primary("hamstring")],
    "lying leg curl": [primary("hamstring")],
    "nordic curl": [primary("hamstring")],

    // ADDUCTORS
    "adductor machine": [primary("adductors")],
    "hip adduction": [primary("adductors")],
    "copenhagen plank": [
      primary("adductors"),
      secondary("obliques"),
    ],
    "sumo squat": [
      primary("adductors"),
      secondary("quadriceps"),
      secondary("gluteal"),
    ],
    "sumo deadlift": [
      primary("adductors"),
      secondary("gluteal"),
      secondary("hamstring"),
      secondary("lower-back"),
    ],

    // CALVES / TIBIALIS
    "calf raise": [primary("calves")],
    "standing calf raise": [primary("calves")],
    "seated calf raise": [primary("calves")],
    "single leg calf raise": [primary("calves")],
    "tibialis raise": [primary("tibialis")],
    "toe raise": [primary("tibialis")],
    "heel walk": [primary("tibialis")],

    // NECK
    "neck flexion": [primary("neck")],
    "neck extension": [primary("neck")],
    "neck lateral flexion": [primary("neck")],
  }),
);

export function resolveFitnessAnatomyMuscleActivations(
  exerciseId: string,
  exerciseName: string,
): readonly FitnessAnatomyMuscleActivation[] {
  const normalizedId = normalizeFitnessExerciseName(exerciseId);
  const normalizedName = normalizeFitnessExerciseName(exerciseName);

  return (
    EXERCISE_ANATOMY.get(normalizedId) ??
    EXERCISE_ANATOMY.get(normalizedName) ??
    []
  );
}
