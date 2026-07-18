export type FitnessRoutineGroupId =
  | "starter-full-body"
  | "push-pull-legs"
  | "upper-lower"
  | "calisthenics"
  | "powerlifting"
  | "athletic"
  | "mobility-recovery";

export type FitnessExerciseRole =
  | "primary"
  | "secondary"
  | "accessory"
  | "core"
  | "conditioning"
  | "mobility"
  | "recovery";

export type FitnessRoutineGoal =
  | "Foundation"
  | "Hypertrophy"
  | "Strength"
  | "Power"
  | "Conditioning"
  | "Mobility"
  | "Recovery";

export type FitnessRoutineLevel = "Beginner" | "Intermediate" | "Advanced";

export type FitnessRoutineExercisePrescription = {
  name: string;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  repRange?: readonly [number, number];
  restSeconds?: number;
  role: FitnessExerciseRole;
};

export type FitnessRoutineTemplate = {
  id: string;
  group: FitnessRoutineGroupId;
  title: string;
  goal: FitnessRoutineGoal;
  level: FitnessRoutineLevel;
  equipment: string;
  durationMinutes: number;
  exercises: FitnessRoutineExercisePrescription[];
};

export type FitnessRoutineGroup = {
  id: FitnessRoutineGroupId;
  title: string;
  routines: FitnessRoutineTemplate[];
};

const reps = (
  name: string,
  sets: number,
  count: number,
  role: FitnessExerciseRole,
  restSeconds = 60,
  repRange?: readonly [number, number],
): FitnessRoutineExercisePrescription => ({
  name,
  sets,
  reps: count,
  role,
  restSeconds,
  ...(repRange ? { repRange } : {}),
});

const timed = (
  name: string,
  sets: number,
  durationSeconds: number,
  role: FitnessExerciseRole,
  restSeconds = 30,
): FitnessRoutineExercisePrescription => ({ name, sets, durationSeconds, role, restSeconds });

const routine = (
  group: FitnessRoutineGroupId,
  title: string,
  goal: FitnessRoutineGoal,
  level: FitnessRoutineLevel,
  equipment: string,
  durationMinutes: number,
  exercises: FitnessRoutineExercisePrescription[],
): FitnessRoutineTemplate => ({
  id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  group,
  title,
  goal,
  level,
  equipment,
  durationMinutes,
  exercises,
});

export const FITNESS_ROUTINE_GROUPS: FitnessRoutineGroup[] = [
  {
    id: "starter-full-body",
    title: "Starter / Full Body",
    routines: [
      routine("starter-full-body", "Full Body Foundation", "Foundation", "Beginner", "Full Gym", 45, [reps("Goblet Squat", 3, 10, "primary", 75, [8, 12]), reps("Push-up", 3, 10, "primary", 60, [8, 15]), reps("Seated Cable Row", 3, 10, "secondary", 60, [8, 12]), reps("Romanian Deadlift", 3, 10, "secondary", 75, [8, 12]), timed("Plank", 3, 30, "core")]),
      routine("starter-full-body", "Dumbbell Full Body", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Goblet Squat", 3, 12, "primary", 60, [10, 15]), reps("Dumbbell Press", 3, 10, "primary", 60, [8, 12]), reps("Dumbbell Row", 3, 10, "secondary", 60, [8, 12]), reps("Romanian Deadlift", 3, 10, "secondary", 60, [8, 12]), reps("Lunge", 2, 10, "accessory", 45, [8, 12])]),
      routine("starter-full-body", "Bodyweight Foundation", "Foundation", "Beginner", "Bodyweight", 30, [reps("Bodyweight Squat", 3, 12, "primary", 45, [10, 15]), reps("Incline Push-up", 3, 10, "primary", 45, [8, 15]), reps("Reverse Lunge", 3, 8, "secondary", 45, [8, 12]), reps("Bird Dog", 3, 8, "core", 30, [8, 12]), timed("Side Plank", 2, 25, "core")]),
      routine("starter-full-body", "Full Gym Foundation", "Foundation", "Beginner", "Full Gym", 50, [reps("Back Squat", 3, 8, "primary", 90, [6, 10]), reps("Bench Press", 3, 8, "primary", 90, [6, 10]), reps("Lat Pulldown", 3, 10, "secondary", 60, [8, 12]), reps("Hip Thrust", 3, 10, "secondary", 60, [8, 12]), reps("Face Pull", 2, 12, "accessory", 45, [12, 15])]),
    ],
  },
  {
    id: "push-pull-legs",
    title: "Push / Pull / Legs",
    routines: [
      routine("push-pull-legs", "Push Day", "Hypertrophy", "Intermediate", "Full Gym", 50, [reps("Bench Press", 4, 8, "primary", 90, [6, 10]), reps("Shoulder Press", 3, 10, "secondary", 75, [8, 12]), reps("Incline Bench Press", 3, 10, "secondary", 60, [8, 12]), reps("Lateral Raise", 3, 12, "accessory", 45, [12, 15]), reps("Triceps Extension", 3, 12, "accessory", 45, [10, 15])]),
      routine("push-pull-legs", "Pull Day", "Hypertrophy", "Intermediate", "Full Gym", 50, [reps("Pull-up", 4, 6, "primary", 90, [6, 10]), reps("Bent-Over Row", 4, 8, "primary", 90, [6, 10]), reps("Seated Cable Row", 3, 10, "secondary", 60, [8, 12]), reps("Face Pull", 3, 12, "accessory", 45, [12, 15]), reps("Curl", 3, 10, "accessory", 45, [8, 12])]),
      routine("push-pull-legs", "Legs Day", "Hypertrophy", "Intermediate", "Full Gym", 55, [reps("Back Squat", 4, 8, "primary", 90, [6, 10]), reps("Romanian Deadlift", 4, 8, "primary", 90, [6, 10]), reps("Walking Lunge", 3, 10, "secondary", 60, [8, 12]), reps("Leg Curl", 3, 12, "accessory", 45, [10, 15]), reps("Calf Raise", 3, 15, "accessory", 45, [12, 20])]),
      routine("push-pull-legs", "Push Strength", "Strength", "Intermediate", "Barbell", 60, [reps("Bench Press", 5, 5, "primary", 180, [3, 6]), reps("Shoulder Press", 4, 6, "primary", 120, [5, 8]), reps("Incline Bench Press", 3, 8, "secondary", 90, [6, 10]), reps("Dip", 3, 8, "accessory", 75, [6, 10])]),
      routine("push-pull-legs", "Pull Strength", "Strength", "Intermediate", "Barbell", 60, [reps("Deadlift", 5, 3, "primary", 180, [3, 5]), reps("Bent-Over Row", 4, 6, "primary", 120, [5, 8]), reps("Pull-up", 4, 6, "secondary", 90, [5, 8]), reps("Hammer Curl", 3, 8, "accessory", 60, [8, 10])]),
      routine("push-pull-legs", "Legs Strength", "Strength", "Intermediate", "Barbell", 60, [reps("Back Squat", 5, 5, "primary", 180, [3, 6]), reps("Front Squat", 3, 6, "secondary", 120, [5, 8]), reps("Romanian Deadlift", 3, 8, "secondary", 90, [6, 10]), reps("Calf Raise", 3, 12, "accessory", 45, [10, 15])]),
      routine("push-pull-legs", "Dumbbell Push", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Dumbbell Press", 4, 10, "primary", 75, [8, 12]), reps("Arnold Press", 3, 10, "secondary", 60, [8, 12]), reps("Lateral Raise", 3, 12, "accessory", 45, [12, 15]), reps("Triceps Extension", 3, 12, "accessory", 45, [10, 15])]),
      routine("push-pull-legs", "Dumbbell Pull", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Dumbbell Row", 4, 10, "primary", 75, [8, 12]), reps("Reverse Fly", 3, 12, "secondary", 45, [10, 15]), reps("Hammer Curl", 3, 10, "accessory", 45, [8, 12]), reps("Curl", 3, 10, "accessory", 45, [8, 12])]),
      routine("push-pull-legs", "Dumbbell Legs", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Goblet Squat", 4, 10, "primary", 75, [8, 12]), reps("Romanian Deadlift", 4, 10, "primary", 75, [8, 12]), reps("Walking Lunge", 3, 10, "secondary", 60, [8, 12]), reps("Calf Raise", 3, 15, "accessory", 45, [12, 20])]),
    ],
  },
  {
    id: "upper-lower",
    title: "Upper / Lower",
    routines: [
      routine("upper-lower", "Upper Body", "Hypertrophy", "Intermediate", "Full Gym", 50, [reps("Bench Press", 4, 8, "primary", 90, [6, 10]), reps("Seated Cable Row", 4, 10, "primary", 75, [8, 12]), reps("Shoulder Press", 3, 10, "secondary", 60, [8, 12]), reps("Lat Pulldown", 3, 10, "secondary", 60, [8, 12]), reps("Lateral Raise", 3, 12, "accessory", 45, [12, 15])]),
      routine("upper-lower", "Lower Body", "Hypertrophy", "Intermediate", "Full Gym", 50, [reps("Back Squat", 4, 8, "primary", 90, [6, 10]), reps("Romanian Deadlift", 4, 8, "primary", 90, [6, 10]), reps("Hip Thrust", 3, 10, "secondary", 75, [8, 12]), reps("Leg Curl", 3, 12, "accessory", 45, [10, 15]), reps("Calf Raise", 3, 15, "accessory", 45, [12, 20])]),
      routine("upper-lower", "Upper Strength", "Strength", "Intermediate", "Barbell", 60, [reps("Bench Press", 5, 5, "primary", 180, [3, 6]), reps("Bent-Over Row", 4, 6, "primary", 120, [5, 8]), reps("Shoulder Press", 4, 6, "secondary", 120, [5, 8]), reps("Pull-up", 3, 6, "secondary", 90, [5, 8])]),
      routine("upper-lower", "Lower Strength", "Strength", "Intermediate", "Barbell", 60, [reps("Back Squat", 5, 5, "primary", 180, [3, 6]), reps("Deadlift", 4, 4, "primary", 180, [3, 5]), reps("Front Squat", 3, 6, "secondary", 120, [5, 8]), reps("Good Morning", 3, 8, "accessory", 90, [6, 10])]),
      routine("upper-lower", "Dumbbell Upper", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Dumbbell Press", 4, 10, "primary", 60, [8, 12]), reps("Dumbbell Row", 4, 10, "primary", 60, [8, 12]), reps("Arnold Press", 3, 10, "secondary", 60, [8, 12]), reps("Reverse Fly", 3, 12, "accessory", 45, [10, 15])]),
      routine("upper-lower", "Dumbbell Lower", "Hypertrophy", "Beginner", "Dumbbells", 40, [reps("Goblet Squat", 4, 10, "primary", 60, [8, 12]), reps("Romanian Deadlift", 4, 10, "primary", 60, [8, 12]), reps("Split Squat", 3, 8, "secondary", 60, [8, 12]), reps("Calf Raise", 3, 15, "accessory", 45, [12, 20])]),
    ],
  },
  {
    id: "calisthenics",
    title: "Calisthenics",
    routines: [
      routine("calisthenics", "Bodyweight Push", "Hypertrophy", "Beginner", "Bodyweight", 35, [reps("Push-up", 4, 12, "primary", 60, [8, 20]), reps("Pike Push-up", 3, 8, "secondary", 60, [6, 12]), reps("Dip", 3, 8, "secondary", 60, [6, 12]), reps("Close-Grip Push-up", 3, 10, "accessory", 45, [8, 15])]),
      routine("calisthenics", "Bodyweight Pull", "Strength", "Intermediate", "Bodyweight", 35, [reps("Pull-up", 4, 6, "primary", 90, [5, 10]), reps("Chin-up", 3, 6, "secondary", 75, [5, 10]), reps("Inverted Row", 3, 10, "secondary", 60, [8, 15]), timed("Dead Hang", 3, 30, "accessory", 45)]),
      routine("calisthenics", "Bodyweight Legs", "Hypertrophy", "Beginner", "Bodyweight", 35, [reps("Bodyweight Squat", 4, 15, "primary", 45, [12, 20]), reps("Split Squat", 3, 10, "secondary", 60, [8, 15]), reps("Reverse Lunge", 3, 10, "secondary", 45, [8, 15]), reps("Nordic Curl", 3, 6, "accessory", 75, [4, 8])]),
      routine("calisthenics", "Calisthenics Full Body", "Foundation", "Intermediate", "Bodyweight", 45, [reps("Push-up", 4, 12, "primary", 60, [8, 20]), reps("Pull-up", 4, 6, "primary", 90, [5, 10]), reps("Bodyweight Squat", 4, 15, "primary", 45, [12, 20]), reps("Reverse Lunge", 3, 10, "secondary", 45, [8, 15]), timed("Plank", 3, 40, "core")]),
      routine("calisthenics", "Core Control", "Strength", "Beginner", "Bodyweight", 25, [timed("Plank", 3, 40, "core"), timed("Side Plank", 3, 30, "core"), reps("Dead Bug", 3, 10, "core", 30, [8, 12]), reps("Bird Dog", 3, 10, "core", 30, [8, 12]), reps("Hanging Knee Raise", 3, 8, "core", 45, [6, 12])]),
    ],
  },
  {
    id: "powerlifting",
    title: "Powerlifting",
    routines: [
      routine("powerlifting", "Squat Strength Session", "Strength", "Intermediate", "Barbell", 65, [reps("Back Squat", 5, 5, "primary", 180, [3, 6]), reps("Front Squat", 3, 6, "secondary", 120, [5, 8]), reps("Romanian Deadlift", 3, 8, "secondary", 90, [6, 10]), reps("Leg Curl", 3, 10, "accessory", 60, [8, 12])]),
      routine("powerlifting", "Bench Strength Session", "Strength", "Intermediate", "Barbell", 60, [reps("Bench Press", 5, 5, "primary", 180, [3, 6]), reps("Incline Bench Press", 3, 8, "secondary", 90, [6, 10]), reps("Bent-Over Row", 4, 8, "secondary", 90, [6, 10]), reps("Triceps Extension", 3, 10, "accessory", 60, [8, 12])]),
      routine("powerlifting", "Deadlift Strength Session", "Strength", "Intermediate", "Barbell", 65, [reps("Deadlift", 5, 3, "primary", 180, [3, 5]), reps("Romanian Deadlift", 3, 6, "secondary", 120, [5, 8]), reps("Bent-Over Row", 4, 8, "secondary", 90, [6, 10]), timed("Dead Hang", 3, 30, "accessory", 45)]),
      routine("powerlifting", "Powerlifting Upper Assistance", "Strength", "Intermediate", "Full Gym", 50, [reps("Shoulder Press", 4, 6, "primary", 120, [5, 8]), reps("Dumbbell Row", 4, 8, "secondary", 75, [8, 10]), reps("Close-Grip Push-up", 3, 10, "accessory", 60, [8, 15]), reps("Face Pull", 3, 15, "accessory", 45, [12, 20]), reps("Hammer Curl", 3, 10, "accessory", 45, [8, 12])]),
      routine("powerlifting", "Powerlifting Lower Assistance", "Strength", "Intermediate", "Full Gym", 50, [reps("Front Squat", 4, 6, "primary", 120, [5, 8]), reps("Hip Thrust", 4, 8, "secondary", 90, [6, 10]), reps("Walking Lunge", 3, 10, "accessory", 60, [8, 12]), reps("Leg Curl", 3, 10, "accessory", 60, [8, 12]), reps("Calf Raise", 3, 15, "accessory", 45, [12, 20])]),
    ],
  },
  {
    id: "athletic",
    title: "Athletic",
    routines: [
      routine("athletic", "Lower-Body Power", "Power", "Intermediate", "Full Gym", 40, [reps("Power Clean", 5, 3, "primary", 120, [2, 4]), reps("Box Jump", 4, 5, "primary", 90, [3, 6]), reps("Broad Jump", 4, 5, "secondary", 75, [3, 6]), reps("Skater Jump", 3, 8, "accessory", 45, [6, 10])]),
      routine("athletic", "Total-Body Power", "Power", "Intermediate", "Full Gym", 45, [reps("Hang Clean", 5, 3, "primary", 120, [2, 4]), reps("Push Press", 4, 5, "primary", 90, [3, 6]), reps("Medicine Ball Slam", 4, 8, "secondary", 60, [6, 10]), reps("Box Jump", 4, 5, "secondary", 75, [3, 6])]),
      routine("athletic", "Athletic Conditioning", "Conditioning", "Intermediate", "Mixed", 35, [timed("Jump Rope", 4, 60, "conditioning", 30), reps("Burpee", 4, 10, "conditioning", 45, [8, 12]), timed("Mountain Climber", 4, 30, "conditioning", 30), reps("Kettlebell Swing", 4, 15, "conditioning", 45, [12, 20]), timed("Sprint", 6, 20, "conditioning", 60)]),
      routine("athletic", "Carries & Core", "Strength", "Intermediate", "Full Gym", 35, [timed("Farmer's Carry", 4, 40, "primary", 60), timed("Suitcase Carry", 3, 30, "secondary", 45), timed("Overhead Carry", 3, 30, "secondary", 45), reps("Pallof Press", 3, 10, "core", 30, [8, 12]), timed("Side Plank", 3, 30, "core")]),
    ],
  },
  {
    id: "mobility-recovery",
    title: "Mobility / Recovery",
    routines: [
      routine("mobility-recovery", "Full Body Mobility", "Mobility", "Beginner", "Bodyweight", 20, [timed("World's Greatest Stretch", 2, 45, "mobility", 15), timed("Hip Opener", 2, 45, "mobility", 15), timed("Arm Circles", 2, 30, "mobility", 15), timed("Thoracic Rotation", 2, 45, "mobility", 15)]),
      routine("mobility-recovery", "Hips & Hamstrings", "Mobility", "Beginner", "Bodyweight", 20, [timed("Hip Opener", 2, 45, "mobility", 15), timed("Hamstring Stretch", 2, 45, "mobility", 15), timed("Couch Stretch", 2, 45, "mobility", 15), timed("Child's Pose", 2, 60, "recovery", 15)]),
      routine("mobility-recovery", "Shoulders & T-Spine", "Mobility", "Beginner", "Bodyweight", 15, [timed("Arm Circles", 2, 30, "mobility", 15), timed("Thoracic Rotation", 2, 45, "mobility", 15), timed("Dead Hang", 2, 30, "mobility", 30), timed("Child's Pose", 2, 60, "recovery", 15)]),
      routine("mobility-recovery", "Recovery Reset", "Recovery", "Beginner", "Bodyweight", 15, [timed("Child's Pose", 2, 60, "recovery", 15), timed("Hamstring Stretch", 2, 45, "recovery", 15), timed("Couch Stretch", 2, 45, "recovery", 15), timed("Thoracic Rotation", 2, 45, "recovery", 15)]),
    ],
  },
];

export const FITNESS_ROUTINE_TEMPLATES: FitnessRoutineTemplate[] =
  FITNESS_ROUTINE_GROUPS.flatMap((group) => group.routines);

const FITNESS_ROUTINE_TEMPLATE_BY_ID = new Map(
  FITNESS_ROUTINE_TEMPLATES.map((template) => [template.id, template]),
);

export function getFitnessRoutineTemplateById(
  id: string,
): FitnessRoutineTemplate | undefined {
  return FITNESS_ROUTINE_TEMPLATE_BY_ID.get(id);
}

export function routinePrescriptionToWorkoutDetail(
  prescription: FitnessRoutineExercisePrescription,
): { sets: string; reps: string; duration: string } {
  return {
    sets: String(prescription.sets),
    reps: prescription.reps === undefined ? "" : String(prescription.reps),
    duration:
      prescription.durationSeconds === undefined
        ? ""
        : `${prescription.durationSeconds} sec`,
  };
}
