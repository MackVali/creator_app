import {
  getFitnessRoutineTemplateById,
  type FitnessRoutineTemplate,
} from "@/lib/fitness/routineTemplates";

export type FitnessPlanTemplate = {
  id: string;
  title: string;
  description?: string;
  goal: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  equipment: string;
  daysPerWeekOptions: readonly number[];
  sessionLengthOptions: readonly number[];
  routineSequence: readonly string[];
};

export const FITNESS_PLAN_TEMPLATES: readonly FitnessPlanTemplate[] = [
  {
    id: "push-pull-legs",
    title: "Push / Pull / Legs",
    description: "Build muscle through a repeating push, pull, legs split.",
    goal: "Build muscle",
    level: "Intermediate",
    equipment: "Full Gym",
    daysPerWeekOptions: [3, 4, 5, 6],
    sessionLengthOptions: [45, 60],
    routineSequence: ["push-day", "pull-day", "legs-day"],
  },
  {
    id: "upper-lower",
    title: "Upper / Lower",
    description: "Balanced strength and muscle split across upper and lower sessions.",
    goal: "Build muscle",
    level: "Intermediate",
    equipment: "Full Gym",
    daysPerWeekOptions: [2, 4],
    sessionLengthOptions: [45, 60],
    routineSequence: ["upper-body", "lower-body"],
  },
  {
    id: "full-body-foundation",
    title: "Full Body Foundation",
    description: "Simple total-body training for consistency, strength, and base fitness.",
    goal: "General fitness",
    level: "Beginner",
    equipment: "Mixed",
    daysPerWeekOptions: [2, 3, 4],
    sessionLengthOptions: [30, 45, 60],
    routineSequence: [
      "full-body-foundation",
      "dumbbell-full-body",
      "bodyweight-foundation",
      "full-gym-foundation",
    ],
  },
  {
    id: "calisthenics",
    title: "Calisthenics",
    description: "Build control, strength, and muscle using bodyweight progressions.",
    goal: "Strength",
    level: "Intermediate",
    equipment: "Bodyweight",
    daysPerWeekOptions: [2, 3, 4, 5],
    sessionLengthOptions: [30, 45],
    routineSequence: [
      "bodyweight-push",
      "bodyweight-pull",
      "bodyweight-legs",
      "calisthenics-full-body",
      "core-control",
    ],
  },
  {
    id: "athletic-conditioning",
    title: "Athletic Conditioning",
    description: "Improve power, work capacity, conditioning, and core strength.",
    goal: "Athleticism",
    level: "Intermediate",
    equipment: "Full Gym",
    daysPerWeekOptions: [2, 3, 4],
    sessionLengthOptions: [30, 45],
    routineSequence: [
      "lower-body-power",
      "total-body-power",
      "athletic-conditioning",
      "carries-core",
    ],
  },
  {
    id: "mobility-recovery",
    title: "Mobility / Recovery",
    description: "Maintain joints, range, control, and recovery between harder sessions.",
    goal: "Mobility",
    level: "Beginner",
    equipment: "Bodyweight",
    daysPerWeekOptions: [2, 3, 4, 5],
    sessionLengthOptions: [15, 20, 30],
    routineSequence: [
      "full-body-mobility",
      "hips-hamstrings",
      "shoulders-t-spine",
      "recovery-reset",
    ],
  },
];

export function resolveFitnessPlanRoutineSequence(
  plan: FitnessPlanTemplate,
): FitnessRoutineTemplate[] {
  return plan.routineSequence.map((routineId) => {
    const routine = getFitnessRoutineTemplateById(routineId);

    if (!routine) {
      throw new Error(
        `Fitness plan ${plan.id} references missing routine template: ${routineId}`,
      );
    }

    return routine;
  });
}

FITNESS_PLAN_TEMPLATES.forEach(resolveFitnessPlanRoutineSequence);
