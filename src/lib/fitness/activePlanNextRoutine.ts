import type { FitnessActivePlan } from "@/lib/fitness/activePlan";
import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineAtIndex,
  type FitnessPlanTemplate,
} from "@/lib/fitness/planTemplates";
import {
  FITNESS_ROUTINE_TEMPLATES,
  type FitnessRoutineTemplate,
} from "@/lib/fitness/routineTemplates";

export type FitnessActivePlanNextRoutine = {
  routine: FitnessRoutineTemplate;
  routineIndex: number;
};

export function getFitnessActivePlanNextRoutine({
  activePlan,
  planTemplates = FITNESS_PLAN_TEMPLATES,
  routineTemplates = FITNESS_ROUTINE_TEMPLATES,
}: {
  activePlan: FitnessActivePlan;
  planTemplates?: readonly FitnessPlanTemplate[];
  routineTemplates?: readonly FitnessRoutineTemplate[];
}): FitnessActivePlanNextRoutine | null {
  const planTemplate =
    planTemplates.find((plan) => plan.id === activePlan.planTemplateId) ?? null;
  const snapshot = activePlan.routineSequenceSnapshot ?? [];

  if (activePlan.source === "custom" && snapshot.length > 0) {
    const routineIndex = activePlan.currentRoutineIndex % snapshot.length;
    const snapshotEntry = snapshot[routineIndex] ?? snapshot[0];
    if (!snapshotEntry) return null;

    const routine =
      routineTemplates.find(
        (template) => template.id === snapshotEntry.fitnessRoutineTemplateId,
      ) ??
      ({
        id: snapshotEntry.fitnessRoutineTemplateId,
        group: "custom",
        title: snapshotEntry.fitnessRoutineTitle,
        goal: "Foundation",
        level: "Beginner",
        equipment: "Custom",
        durationMinutes: activePlan.sessionDurationMinutes,
        exercises: [],
      } satisfies FitnessRoutineTemplate);

    return { routine, routineIndex };
  }

  if (!planTemplate) return null;

  const routine = (() => {
    try {
      return resolveFitnessPlanRoutineAtIndex(
        planTemplate,
        activePlan.currentRoutineIndex,
        routineTemplates,
      );
    } catch {
      return null;
    }
  })();
  if (!routine) return null;

  return {
    routine,
    routineIndex:
      planTemplate.routineSequence.length > 0
        ? activePlan.currentRoutineIndex % planTemplate.routineSequence.length
        : 0,
  };
}
