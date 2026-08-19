import { normalizeFitnessExerciseName } from "@/lib/fitness/progressiveOverload";
import type { FitnessMuscleGroupId } from "@/lib/fitness/muscleStats";

export type FitnessExerciseMuscleRole = "primary" | "secondary";

export type FitnessExerciseMuscleActivation = {
  muscleGroupId: Exclude<FitnessMuscleGroupId, "other">;
  role: FitnessExerciseMuscleRole;
};

type SupportedMuscle = Exclude<FitnessMuscleGroupId, "other">;

function primary(muscleGroupId: SupportedMuscle): FitnessExerciseMuscleActivation {
  return { muscleGroupId, role: "primary" };
}

function secondary(muscleGroupId: SupportedMuscle): FitnessExerciseMuscleActivation {
  return { muscleGroupId, role: "secondary" };
}

const EXERCISE_MUSCLES = new Map<string, readonly FitnessExerciseMuscleActivation[]>(
  Object.entries({
    "push up": [primary("chest"), secondary("triceps"), secondary("shoulders")],
    "incline push up": [primary("chest"), secondary("triceps"), secondary("shoulders")],
    "decline push up": [primary("chest"), secondary("triceps"), secondary("shoulders")],
    "close grip push up": [primary("triceps"), secondary("chest"), secondary("shoulders")],

    "bench press": [primary("chest"), secondary("triceps"), secondary("shoulders")],
    "incline bench press": [primary("chest"), secondary("shoulders"), secondary("triceps")],
    "dumbbell press": [primary("chest"), secondary("triceps"), secondary("shoulders")],
    "chest fly": [primary("chest")],
    dip: [primary("chest"), secondary("triceps"), secondary("shoulders")],

    "shoulder press": [primary("shoulders"), secondary("triceps")],
    "arnold press": [primary("shoulders"), secondary("triceps")],
    "lateral raise": [primary("shoulders")],
    "front raise": [primary("shoulders")],
    "face pull": [primary("shoulders"), secondary("back")],
    "reverse fly": [primary("shoulders"), secondary("back")],
    "push press": [primary("shoulders"), secondary("triceps"), secondary("quads")],

    "triceps extension": [primary("triceps")],
    "skull crusher": [primary("triceps")],

    "pull up": [primary("back"), secondary("biceps"), secondary("forearms-grip")],
    "chin up": [primary("back"), secondary("biceps"), secondary("forearms-grip")],
    "inverted row": [primary("back"), secondary("biceps")],
    "bent over row": [primary("back"), secondary("biceps"), secondary("forearms-grip")],
    "dumbbell row": [primary("back"), secondary("biceps"), secondary("forearms-grip")],
    "lat pulldown": [primary("back"), secondary("biceps")],
    "seated cable row": [primary("back"), secondary("biceps")],
    row: [primary("back"), secondary("biceps")],

    curl: [primary("biceps"), secondary("forearms-grip")],
    "hammer curl": [primary("biceps"), secondary("forearms-grip")],
    "preacher curl": [primary("biceps")],

    "bodyweight squat": [primary("quads"), secondary("glutes"), secondary("core")],
    "goblet squat": [primary("quads"), secondary("glutes"), secondary("core")],
    "back squat": [primary("quads"), secondary("glutes"), secondary("hamstrings"), secondary("core")],
    "front squat": [primary("quads"), secondary("glutes"), secondary("core")],
    "split squat": [primary("quads"), secondary("glutes"), secondary("hamstrings")],
    "forward lunge": [primary("quads"), secondary("glutes"), secondary("hamstrings")],
    "reverse lunge": [primary("quads"), secondary("glutes"), secondary("hamstrings")],
    "walking lunge": [primary("quads"), secondary("glutes"), secondary("hamstrings")],
    lunge: [primary("quads"), secondary("glutes"), secondary("hamstrings")],

    deadlift: [
      primary("hamstrings"),
      secondary("glutes"),
      secondary("back"),
      secondary("forearms-grip"),
    ],
    "romanian deadlift": [
      primary("hamstrings"),
      secondary("glutes"),
      secondary("back"),
    ],
    "good morning": [primary("hamstrings"), secondary("glutes"), secondary("back")],
    "hip hinge": [primary("hamstrings"), secondary("glutes")],
    "leg curl": [primary("hamstrings")],
    "nordic curl": [primary("hamstrings")],

    "hip thrust": [primary("glutes"), secondary("hamstrings")],
    "kettlebell swing": [primary("glutes"), secondary("hamstrings"), secondary("back")],
    "skater jump": [primary("glutes"), secondary("quads")],

    "calf raise": [primary("calves")],
    "seated calf raise": [primary("calves")],
    "jump rope": [primary("calves")],

    plank: [primary("core")],
    "side plank": [primary("core"), secondary("shoulders")],
    "dead bug": [primary("core")],
    "bird dog": [primary("core"), secondary("back")],
    crunch: [primary("core")],
    "sit up": [primary("core")],
    "leg raise": [primary("core")],
    "hanging knee raise": [primary("core"), secondary("forearms-grip")],
    "russian twist": [primary("core")],
    "pallof press": [primary("core")],
    "wood chop": [primary("core")],
    "mountain climber": [primary("core"), secondary("quads")],
    "suitcase carry": [primary("core"), secondary("forearms-grip")],

    "farmer s carry": [primary("forearms-grip"), secondary("core")],
    "dead hang": [primary("forearms-grip"), secondary("back")],
    "plate pinch": [primary("forearms-grip")],
    "overhead carry": [primary("shoulders"), secondary("core"), secondary("forearms-grip")],

    "box jump": [primary("quads"), secondary("glutes")],
    "broad jump": [primary("quads"), secondary("glutes")],
    sprint: [primary("quads"), secondary("hamstrings"), secondary("glutes")],
    "high knees": [primary("quads"), secondary("core")],
    "power clean": [primary("quads"), secondary("glutes"), secondary("back")],
    "hang clean": [primary("quads"), secondary("glutes"), secondary("back")],
  }),
);

export function resolveFitnessExerciseMuscleActivations(
  exerciseId: string,
  exerciseName: string,
): readonly FitnessExerciseMuscleActivation[] {
  const normalizedId = normalizeFitnessExerciseName(exerciseId);
  const normalizedName = normalizeFitnessExerciseName(exerciseName);

  return EXERCISE_MUSCLES.get(normalizedId) ?? EXERCISE_MUSCLES.get(normalizedName) ?? [];
}
