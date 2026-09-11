import type {
  AnalyticsHistoryDay,
  AnalyticsHistoryItem,
  AnalyticsHistorySourceType,
} from "@/types/analytics";
import {
  buildScheduleSummary,
  getEffectiveObservedSummaryStatus,
  type NormalizedObservedScheduleAnalyticsRow,
} from "./scheduleSummary";

export type HistoryCompletionRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  completed_at: string | null;
  schedule_instance_id: string | null;
  was_scheduled: boolean | null;
  duration_min: number | null;
  productivity_day_key: string | null;
  revoked_at: string | null;
  source_title?: string | null;
};

export type HistoryXpEventRow = {
  id: string;
  amount: number | null;
  kind: string | null;
  skill_id: string | null;
  monument_id?: string | null;
  area_id?: string | null;
  award_key?: string | null;
  completion_event_id: string | null;
};

export type HistoryAreaRow = {
  id: string;
  label: string;
};

export type HistorySkillRow = {
  id: string;
  name: string | null;
  monument_id: string | null;
};

export type HistoryAreaSkillRow = {
  area_id: string;
  skill_id: string;
};

export type HistoryMonumentRow = {
  id: string;
  title: string | null;
  area_id: string | null;
};

export type HistoryGoalRow = {
  id: string;
  name: string | null;
  area_id: string | null;
  monument_id: string | null;
};

export type HistoryProjectRow = {
  id: string;
  name: string | null;
  goal_id: string | null;
};

export type HistoryTaskRow = {
  id: string;
  name: string | null;
  project_id: string | null;
  goal_id: string | null;
  skill_id: string | null;
};

export type HistoryHabitRow = {
  id: string;
  name: string | null;
  goal_id: string | null;
  skill_id: string | null;
};

export type BuildAnalyticsHistoryDayInput = {
  dayKey: string;
  dayStartUtc: string;
  dayEndUtc: string;
  timezone: string;
  now: Date;
  completions: HistoryCompletionRow[];
  xpEvents: HistoryXpEventRow[];
  observedInstances: NormalizedObservedScheduleAnalyticsRow[];
  areas: HistoryAreaRow[];
  skills: HistorySkillRow[];
  areaSkills: HistoryAreaSkillRow[];
  monuments: HistoryMonumentRow[];
  goals: HistoryGoalRow[];
  projects: HistoryProjectRow[];
  tasks: HistoryTaskRow[];
  habits: HistoryHabitRow[];
};

type ResolvedHierarchy = {
  title: string;
  areaId: string | null;
  areaLabel: string | null;
  skillId: string | null;
  skillLabel: string | null;
  monumentId: string | null;
  monumentLabel: string | null;
  goalId: string | null;
  goalLabel: string | null;
  projectId: string | null;
  projectLabel: string | null;
};

const UNKNOWN_HIERARCHY: ResolvedHierarchy = {
  title: "Unknown item",
  areaId: null,
  areaLabel: null,
  skillId: null,
  skillLabel: null,
  monumentId: null,
  monumentLabel: null,
  goalId: null,
  goalLabel: null,
  projectId: null,
  projectLabel: null,
};

function normalizeSourceType(
  value: string | null | undefined
): AnalyticsHistorySourceType {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "goal" ||
    normalized === "project" ||
    normalized === "task" ||
    normalized === "habit" ||
    normalized === "todo"
  ) {
    return normalized;
  }
  return "unknown";
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function getCanonicalAwardKeyBase(awardKey: string) {
  return awardKey
    .trim()
    .replace(/^reverse:/, "")
    .replace(/:(?:skill|mon|area):[^:]+$/, "");
}

function getXpLogicalIdentity(event: HistoryXpEventRow) {
  const completionEventId = event.completion_event_id?.trim();
  if (completionEventId) return `completion:${completionEventId}`;

  const awardKey = event.award_key?.trim();
  if (awardKey) return `award:${getCanonicalAwardKeyBase(awardKey)}`;

  return `event:${event.id}`;
}

export function buildCompletionXpById(events: HistoryXpEventRow[]) {
  const reversedIdentities = new Set<string>();
  for (const event of events) {
    const awardKey = event.award_key?.trim();
    if (awardKey?.startsWith("reverse:")) {
      reversedIdentities.add(getXpLogicalIdentity(event));
    }
  }

  const positiveAmountsByIdentity = new Map<
    string,
    { completionId: string; amount: number }
  >();
  for (const event of events) {
    const completionId = event.completion_event_id?.trim();
    if (!completionId) continue;
    if (event.award_key?.trim().startsWith("reverse:")) continue;

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const identity = getXpLogicalIdentity(event);
    if (reversedIdentities.has(identity)) continue;

    const existing = positiveAmountsByIdentity.get(identity);
    if (!existing || amount > existing.amount) {
      positiveAmountsByIdentity.set(identity, { completionId, amount });
    }
  }

  const byCompletionId = new Map<string, number>();
  for (const { completionId, amount } of positiveAmountsByIdentity.values()) {
    byCompletionId.set(completionId, (byCompletionId.get(completionId) ?? 0) + amount);
  }
  return byCompletionId;
}

function createHierarchyResolver(input: BuildAnalyticsHistoryDayInput) {
  const areaById = new Map(input.areas.map((area) => [area.id, area]));
  const skillById = new Map(input.skills.map((skill) => [skill.id, skill]));
  const monumentById = new Map(
    input.monuments.map((monument) => [monument.id, monument])
  );
  const goalById = new Map(input.goals.map((goal) => [goal.id, goal]));
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const habitById = new Map(input.habits.map((habit) => [habit.id, habit]));
  const areaIdBySkillId = new Map(
    input.areaSkills.map((row) => [row.skill_id, row.area_id])
  );

  function labels({
    title,
    areaId,
    skillId,
    monumentId,
    goalId,
    projectId,
  }: {
    title: string;
    areaId: string | null;
    skillId: string | null;
    monumentId: string | null;
    goalId: string | null;
    projectId: string | null;
  }): ResolvedHierarchy {
    const skill = skillId ? skillById.get(skillId) ?? null : null;
    const monument = monumentId ? monumentById.get(monumentId) ?? null : null;
    const goal = goalId ? goalById.get(goalId) ?? null : null;
    const project = projectId ? projectById.get(projectId) ?? null : null;
    const area = areaId ? areaById.get(areaId) ?? null : null;

    return {
      title,
      areaId,
      areaLabel: area?.label ?? null,
      skillId,
      skillLabel: cleanText(skill?.name) ?? null,
      monumentId,
      monumentLabel: cleanText(monument?.title) ?? null,
      goalId,
      goalLabel: cleanText(goal?.name) ?? null,
      projectId,
      projectLabel: cleanText(project?.name) ?? null,
    };
  }

  function resolveAreaId({
    explicitAreaId,
    monumentId,
    skillId,
  }: {
    explicitAreaId?: string | null;
    monumentId?: string | null;
    skillId?: string | null;
  }) {
    if (explicitAreaId) return explicitAreaId;

    if (monumentId) {
      const monumentAreaId = monumentById.get(monumentId)?.area_id ?? null;
      if (monumentAreaId) return monumentAreaId;
    }

    if (skillId) {
      const skillAreaId = areaIdBySkillId.get(skillId);
      if (skillAreaId) return skillAreaId;
    }

    return null;
  }

  function fromGoal(goal: HistoryGoalRow, fallbackTitle?: string) {
    const monumentId = goal.monument_id;
    return labels({
      title: cleanText(fallbackTitle) ?? cleanText(goal.name) ?? "Untitled goal",
      areaId: resolveAreaId({
        explicitAreaId: goal.area_id,
        monumentId,
      }),
      skillId: null,
      monumentId,
      goalId: goal.id,
      projectId: null,
    });
  }

  function fromProject(project: HistoryProjectRow, fallbackTitle?: string) {
    const goal = project.goal_id ? goalById.get(project.goal_id) ?? null : null;
    const base = goal ? fromGoal(goal, cleanText(project.name) ?? fallbackTitle) : null;
    return labels({
      title:
        cleanText(fallbackTitle) ??
        cleanText(project.name) ??
        base?.title ??
        "Untitled project",
      areaId: base?.areaId ?? null,
      skillId: null,
      monumentId: base?.monumentId ?? null,
      goalId: goal?.id ?? null,
      projectId: project.id,
    });
  }

  function fromTask(task: HistoryTaskRow, fallbackTitle?: string) {
    const project = task.project_id ? projectById.get(task.project_id) ?? null : null;
    const goal =
      (task.goal_id ? goalById.get(task.goal_id) ?? null : null) ??
      (project?.goal_id ? goalById.get(project.goal_id) ?? null : null);
    const goalBase = goal ? fromGoal(goal) : null;
    return labels({
      title: cleanText(fallbackTitle) ?? cleanText(task.name) ?? "Untitled task",
      areaId: resolveAreaId({
        explicitAreaId: goalBase?.areaId,
        monumentId: goalBase?.monumentId,
        skillId: task.skill_id,
      }),
      skillId: task.skill_id,
      monumentId: goalBase?.monumentId ?? null,
      goalId: goal?.id ?? null,
      projectId: project?.id ?? null,
    });
  }

  function fromHabit(habit: HistoryHabitRow, fallbackTitle?: string) {
    const goal = habit.goal_id ? goalById.get(habit.goal_id) ?? null : null;
    const goalBase = goal ? fromGoal(goal) : null;
    return labels({
      title: cleanText(fallbackTitle) ?? cleanText(habit.name) ?? "Habit session",
      areaId: resolveAreaId({
        explicitAreaId: goalBase?.areaId,
        monumentId: goalBase?.monumentId,
        skillId: habit.skill_id,
      }),
      skillId: habit.skill_id,
      monumentId: goalBase?.monumentId ?? skillById.get(habit.skill_id ?? "")?.monument_id ?? null,
      goalId: goal?.id ?? null,
      projectId: null,
    });
  }

  function fromTodo(options: {
    fallbackTitle?: string | null;
    skillId?: string | null;
    areaId?: string | null;
    monumentId?: string | null;
  }) {
    const skill = options.skillId ? skillById.get(options.skillId) ?? null : null;
    const monumentId =
      options.monumentId ?? skill?.monument_id ?? null;
    return labels({
      title: cleanText(options.fallbackTitle) ?? "Todo",
      areaId: resolveAreaId({
        explicitAreaId: options.areaId,
        monumentId,
        skillId: options.skillId,
      }),
      skillId: options.skillId ?? null,
      monumentId,
      goalId: null,
      projectId: null,
    });
  }

  return (
    sourceType: AnalyticsHistorySourceType,
    sourceId: string,
    options?: {
      fallbackTitle?: string | null;
      skillId?: string | null;
      areaId?: string | null;
      monumentId?: string | null;
    }
  ) => {
    if (sourceType === "goal") {
      const goal = goalById.get(sourceId);
      return goal ? fromGoal(goal) : UNKNOWN_HIERARCHY;
    }
    if (sourceType === "project") {
      const project = projectById.get(sourceId);
      return project ? fromProject(project) : UNKNOWN_HIERARCHY;
    }
    if (sourceType === "task") {
      const task = taskById.get(sourceId);
      return task ? fromTask(task) : UNKNOWN_HIERARCHY;
    }
    if (sourceType === "habit") {
      const habit = habitById.get(sourceId);
      return habit ? fromHabit(habit) : UNKNOWN_HIERARCHY;
    }
    if (sourceType === "todo") {
      return fromTodo(options ?? {});
    }
    return UNKNOWN_HIERARCHY;
  };
}

export function buildAnalyticsHistoryDay(
  input: BuildAnalyticsHistoryDayInput
): AnalyticsHistoryDay {
  const resolveHierarchy = createHierarchyResolver(input);
  const xpByCompletionId = buildCompletionXpById(input.xpEvents);
  const attributionByCompletionId = new Map<
    string,
    { skillId: string | null; areaId: string | null; monumentId: string | null }
  >();
  for (const event of input.xpEvents) {
    const completionId = event.completion_event_id?.trim();
    if (!completionId || event.award_key?.trim().startsWith("reverse:")) continue;
    const current = attributionByCompletionId.get(completionId) ?? {
      skillId: null,
      areaId: null,
      monumentId: null,
    };
    attributionByCompletionId.set(completionId, {
      skillId: current.skillId ?? event.skill_id ?? null,
      areaId: current.areaId ?? event.area_id ?? null,
      monumentId: current.monumentId ?? event.monument_id ?? null,
    });
  }
  const activeCompletions = input.completions.filter(
    (completion) => completion.revoked_at === null
  );
  const observedByScheduleInstanceId = new Map(
    input.observedInstances.map((instance) => [instance.id, instance])
  );
  const scheduleSummary = buildScheduleSummary(input.observedInstances, input.now);

  const completed = activeCompletions
    .map((completion): AnalyticsHistoryItem => {
      const sourceType = normalizeSourceType(completion.source_type);
      const sourceId = completion.source_id ?? "";
      const attribution = attributionByCompletionId.get(completion.id);
      const hierarchy = resolveHierarchy(sourceType, sourceId, {
        fallbackTitle: completion.source_title ?? null,
        skillId: attribution?.skillId ?? null,
        areaId: attribution?.areaId ?? null,
        monumentId: attribution?.monumentId ?? null,
      });
      const observedSchedule = completion.schedule_instance_id
        ? observedByScheduleInstanceId.get(completion.schedule_instance_id) ?? null
        : null;
      return {
        id: completion.id,
        sourceId,
        sourceType,
        title: hierarchy.title,
        completedAt: completion.completed_at,
        scheduledStartUtc: observedSchedule?.startUtc ?? null,
        scheduledEndUtc: observedSchedule?.endUtc ?? null,
        durationMinutes: completion.duration_min,
        wasScheduled: completion.was_scheduled === true,
        xpEarned: xpByCompletionId.get(completion.id) ?? 0,
        areaId: hierarchy.areaId,
        areaLabel: hierarchy.areaLabel,
        skillId: hierarchy.skillId,
        skillLabel: hierarchy.skillLabel,
        monumentId: hierarchy.monumentId,
        monumentLabel: hierarchy.monumentLabel,
        goalId: hierarchy.goalId,
        goalLabel: hierarchy.goalLabel,
        projectId: hierarchy.projectId,
        projectLabel: hierarchy.projectLabel,
      };
    })
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const missed = input.observedInstances
    .filter(
      (instance) =>
        getEffectiveObservedSummaryStatus(instance, input.now) === "missed"
    )
    .map((instance): AnalyticsHistoryItem => {
      const sourceType = normalizeSourceType(instance.sourceType);
      const hierarchy = resolveHierarchy(sourceType, instance.sourceId);
      return {
        id: instance.id,
        sourceId: instance.sourceId,
        sourceType,
        title: hierarchy.title,
        completedAt: null,
        scheduledStartUtc: instance.startUtc,
        scheduledEndUtc: instance.endUtc,
        durationMinutes: instance.durationMinutes,
        wasScheduled: true,
        xpEarned: 0,
        areaId: hierarchy.areaId,
        areaLabel: hierarchy.areaLabel,
        skillId: hierarchy.skillId,
        skillLabel: hierarchy.skillLabel,
        monumentId: hierarchy.monumentId,
        monumentLabel: hierarchy.monumentLabel,
        goalId: hierarchy.goalId,
        goalLabel: hierarchy.goalLabel,
        projectId: hierarchy.projectId,
        projectLabel: hierarchy.projectLabel,
      };
    })
    .sort((a, b) =>
      (a.scheduledStartUtc ?? "").localeCompare(b.scheduledStartUtc ?? "")
    );

  const completedPlanned = activeCompletions.filter(
    (completion) => completion.was_scheduled === true
  ).length;
  const completedUnplanned = activeCompletions.filter(
    (completion) => completion.was_scheduled !== true
  ).length;
  const xpEarned = completed.reduce((sum, item) => sum + item.xpEarned, 0);
  const planned = scheduleSummary.plannedEvents;

  const areaBuckets = new Map<
    string,
    { areaId: string; label: string; completed: number; xpEarned: number }
  >();
  for (const item of completed) {
    if (!item.areaId || !item.areaLabel) continue;
    const bucket = areaBuckets.get(item.areaId) ?? {
      areaId: item.areaId,
      label: item.areaLabel,
      completed: 0,
      xpEarned: 0,
    };
    bucket.completed += 1;
    bucket.xpEarned += item.xpEarned;
    areaBuckets.set(item.areaId, bucket);
  }

  return {
    dayKey: input.dayKey,
    dayStartUtc: input.dayStartUtc,
    dayEndUtc: input.dayEndUtc,
    timezone: input.timezone,
    summary: {
      planned,
      completedPlanned,
      completedUnplanned,
      completedTotal: completedPlanned + completedUnplanned,
      missed: scheduleSummary.missedEvents,
      executionRate:
        planned > 0 ? Math.round((completedPlanned / planned) * 100) : 0,
      xpEarned,
    },
    areas: Array.from(areaBuckets.values()).sort(
      (a, b) => b.xpEarned - a.xpEarned || b.completed - a.completed || a.label.localeCompare(b.label)
    ),
    completed,
    missed,
  };
}
