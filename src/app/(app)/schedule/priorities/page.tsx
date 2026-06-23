import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseServer } from "@/lib/supabase";
import PriorityEditorClient from "./PriorityEditorClient";
import {
  normalizeHabitBucket,
  compareRankValues,
  sortHabitRoadmapItems,
  normalizeCampaignPriority,
  normalizePriority,
  parseGlobalRank,
  PRIORITY_ORDER,
  sortGlobalPriorityItems,
  type RoadmapFilterOptionData,
  type GlobalPriorityRoadmapItem,
  type RoadmapHabitItem,
  type RoadmapPriorityCampaign,
  type RoadmapPriorityGoal,
  type UserPriorityFilterOptionData,
  type UserPrioritySkillCategoryData,
} from "./utils";

export const runtime = "nodejs";

type GoalRow = {
  id: string;
  name?: string | null;
  emoji?: string | null;
  monument_id?: string | null;
  roadmap_id?: string | null;
  circle_id?: string | null;
  status?: string | null;
  priority?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  global_rank?: number | string | null;
  priority_rank?: number | string | null;
  created_at?: string | null;
  monument?: { id?: string | null; title?: string | null; emoji?: string | null } | null;
  projects?: GoalProjectRow[] | null;
};

type CampaignRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  emoji?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  scheduling_state?: string | null;
  position?: number | null;
  roadmap_id?: string | null;
  primary_monument_id?: string | null;
  created_at?: string | null;
};

type GoalProjectRow = {
  id?: string | null;
  name?: string | null;
  priority?: string | null;
  energy?: string | null;
  stage?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  global_rank?: number | string | null;
  tasks?: GoalProjectTaskRow[] | null;
  project_skills?: GoalProjectSkillRow[] | null;
};

type GoalProjectTaskRow = {
  id?: string | null;
  name?: string | null;
  skill_id?: string | null;
  priority?: string | null;
  energy?: string | null;
  stage?: string | null;
  completed_at?: string | null;
  duration_min?: number | null;
  created_at?: string | null;
  skills?: SkillMetadataRow | null;
};

type GoalProjectSkillRow = {
  skill_id?: string | null;
  skills?: SkillMetadataRow | null;
};

type SkillMetadataRow = {
  id?: string | null;
  name?: string | null;
  icon?: string | null;
  monument_id?: string | null;
  cat_id?: string | null;
  sort_order?: number | string | null;
  created_at?: string | null;
};

type SkillCategoryRow = {
  id?: string | null;
  name?: string | null;
  sort_order?: number | string | null;
  created_at?: string | null;
};

type HabitGoalMetadataRow = {
  id?: string | null;
  monument_id?: string | null;
};

type HabitRow = {
  id: string;
  name?: string | null;
  habit_type?: string | null;
  global_order?: number | string | null;
  skill_id?: string | null;
  goal_id?: string | null;
  routine_id?: string | null;
  routine_position?: number | string | null;
  duration_minutes?: number | null;
  energy?: string | null;
  recurrence_mode?: string | null;
  current_streak_days?: number | null;
  last_completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  circle_id?: string | null;
  skill?: SkillMetadataRow | SkillMetadataRow[] | null;
  goal?: HabitGoalMetadataRow | HabitGoalMetadataRow[] | null;
};

type CampaignGoalRow = {
  campaign_id: string;
  goal_id: string;
  position?: number | null;
  created_at?: string | null;
};

type GlobalPriorityCampaignCandidate = GlobalPriorityRoadmapItem & {
  normalizedName: string;
};

type GlobalPriorityCampaignGroup = {
  candidates: GlobalPriorityCampaignCandidate[];
  goalIds: Set<string>;
};

type MonumentRow = {
  id: string;
  title?: string | null;
  emoji?: string | null;
  created_at?: string | null;
};

function isCompletedGoal(status?: string | null) {
  return typeof status === "string" && status.trim().toUpperCase() === "COMPLETED";
}

function compareText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function createUserPriorityFilterOption(
  id?: string | null,
  name?: string | null,
  icon?: string | null
): UserPriorityFilterOptionData | null {
  const optionId = (id ?? "").trim();
  if (!optionId) return null;

  return {
    id: optionId,
    name: (name ?? "").trim() || optionId,
    icon: icon?.trim() || null,
  };
}

function parseSortOrder(value?: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createMonumentFilterOption(
  monument: MonumentRow
): UserPriorityFilterOptionData | null {
  return createUserPriorityFilterOption(
    monument.id,
    monument.title ?? null,
    monument.emoji ?? null
  );
}

function createSkillFilterOption(
  skill: SkillMetadataRow
): UserPriorityFilterOptionData | null {
  const option = createUserPriorityFilterOption(
    skill.id ?? null,
    skill.name ?? null,
    skill.icon ?? null
  );
  if (!option) return null;

  return {
    ...option,
    categoryId: skill.cat_id ?? null,
    sortOrder: parseSortOrder(skill.sort_order),
  };
}

function createSkillCategoryOption(
  category: SkillCategoryRow
): UserPrioritySkillCategoryData | null {
  const categoryId = (category.id ?? "").trim();
  if (!categoryId) return null;

  return {
    id: categoryId,
    name: (category.name ?? "").trim() || categoryId,
    sortOrder: parseSortOrder(category.sort_order),
  };
}

function normalizeMetadataKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function mergeFilterOptionData(
  optionsByKey: Map<string, RoadmapFilterOptionData>,
  option: RoadmapFilterOptionData | null
) {
  const id = (option?.id ?? "").trim();
  const name = (option?.name ?? "").trim();
  if (!id && !name) return;

  const key = normalizeMetadataKey(id || name);
  const existing = optionsByKey.get(key);
  optionsByKey.set(key, {
    id: (existing?.id ?? id) || null,
    name: (existing?.name ?? name) || null,
    icon: existing?.icon ?? option?.icon ?? null,
  });
}

function collectGoalSkillIds(row: GoalRow) {
  const skillIds = new Set<string>();

  for (const project of row.projects ?? []) {
    for (const task of project.tasks ?? []) {
      if (task.skill_id) {
        skillIds.add(task.skill_id);
      }
    }

    for (const projectSkill of project.project_skills ?? []) {
      if (projectSkill.skill_id) {
        skillIds.add(projectSkill.skill_id);
      }
    }
  }

  return Array.from(skillIds);
}

function collectGoalSkills(
  row: GoalRow,
  skillsById: Map<string, SkillMetadataRow> = new Map()
): RoadmapFilterOptionData[] {
  const optionsByKey = new Map<string, RoadmapFilterOptionData>();

  for (const project of row.projects ?? []) {
    for (const task of project.tasks ?? []) {
      const skill = task.skill_id ? skillsById.get(task.skill_id) : undefined;
      mergeFilterOptionData(optionsByKey, {
        id: task.skill_id ?? task.skills?.id ?? null,
        name: skill?.name ?? task.skills?.name ?? null,
        icon: skill?.icon ?? task.skills?.icon ?? null,
      });
    }

    for (const projectSkill of project.project_skills ?? []) {
      const skill = projectSkill.skill_id
        ? skillsById.get(projectSkill.skill_id)
        : undefined;
      mergeFilterOptionData(optionsByKey, {
        id: projectSkill.skill_id ?? projectSkill.skills?.id ?? null,
        name: skill?.name ?? projectSkill.skills?.name ?? null,
        icon: skill?.icon ?? projectSkill.skills?.icon ?? null,
      });
    }
  }

  return Array.from(optionsByKey.values()).sort((a, b) =>
    (a.name ?? a.id ?? "").localeCompare(b.name ?? b.id ?? "", undefined, {
      sensitivity: "base",
    })
  );
}

function getSkillFilterData(
  skillId?: string | null,
  rowSkill?: SkillMetadataRow | null,
  skillsById: Map<string, SkillMetadataRow> = new Map()
): RoadmapFilterOptionData | null {
  const skill = skillId ? skillsById.get(skillId) : undefined;
  const id = skillId ?? rowSkill?.id ?? skill?.id ?? null;
  const name = skill?.name ?? rowSkill?.name ?? null;
  const icon = skill?.icon ?? rowSkill?.icon ?? null;
  if (!id && !name && !icon) return null;
  return { id, name, icon };
}

function sortGoalProjects(projects: NonNullable<GoalRow["projects"]>) {
  return [...projects].sort((a, b) => {
    const rankDelta = compareRankValues(
      parseGlobalRank(a.global_rank),
      parseGlobalRank(b.global_rank)
    );
    if (rankDelta !== 0) return rankDelta;

    const createdDelta = compareText(a.created_at, b.created_at);
    if (createdDelta !== 0) return createdDelta;

    return compareText(a.id, b.id);
  });
}

function sortProjectTasks(tasks: NonNullable<GoalProjectRow["tasks"]>) {
  return [...tasks].sort((a, b) => {
    const createdDelta = compareText(a.created_at, b.created_at);
    if (createdDelta !== 0) return createdDelta;
    return compareText(a.id, b.id);
  });
}

function firstRelatedRow<T>(value?: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeGoal(
  row: GoalRow,
  skillsById: Map<string, SkillMetadataRow> = new Map()
): RoadmapPriorityGoal {
  return {
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled Goal",
    emoji: row.emoji ?? null,
    monumentId: row.monument_id ?? row.monument?.id ?? null,
    monumentName: row.monument?.title ?? null,
    monumentIcon: row.monument?.emoji ?? null,
    monumentEmoji: row.monument?.emoji ?? null,
    skills: collectGoalSkills(row, skillsById),
    priority: normalizePriority(row.priority_code ?? row.priority),
    status: row.status ?? null,
    globalRank: parseGlobalRank(row.global_rank),
    priorityOrder: parseGlobalRank(row.priority_order),
    priorityRank: parseGlobalRank(row.priority_rank),
    createdAt: row.created_at ?? null,
    projects: sortGoalProjects(row.projects ?? [])
      .filter((project) => project.id)
      .map((project) => {
        const projectSkills = (project.project_skills ?? [])
          .map((projectSkill) =>
            getSkillFilterData(
              projectSkill.skill_id,
              projectSkill.skills ?? null,
              skillsById
            )
          )
          .filter((skill): skill is RoadmapFilterOptionData => Boolean(skill));
        const tasks = sortProjectTasks(project.tasks ?? [])
          .filter((task) => task.id)
          .map((task) => {
            const skill = getSkillFilterData(
              task.skill_id,
              task.skills ?? null,
              skillsById
            );
            return {
              id: task.id as string,
              name: (task.name ?? "").trim() || "Untitled Task",
              skillId: task.skill_id ?? skill?.id ?? null,
              skillName: skill?.name ?? null,
              skillIcon: skill?.icon ?? null,
              priority: normalizePriority(task.priority),
              energy: task.energy ?? null,
              stage: task.stage ?? null,
              completedAt: task.completed_at ?? null,
              durationMin: task.duration_min ?? null,
              createdAt: task.created_at ?? null,
            };
          });
        const taskSkillOptions = tasks
          .map<RoadmapFilterOptionData>((task) => ({
            id: task.skillId ?? null,
            name: task.skillName ?? null,
            icon: task.skillIcon ?? null,
          }))
          .filter((skill) => Boolean(skill.id || skill.name || skill.icon));
        const primarySkill = [...projectSkills, ...taskSkillOptions].find(
          (skill) => skill.id || skill.name || skill.icon
        );
        const skillIds = Array.from(
          new Set(
            projectSkills
              .map((skill) => skill.id)
              .filter((skillId): skillId is string => Boolean(skillId))
          )
        );

        return {
          id: project.id as string,
          name: (project.name ?? "").trim() || "Untitled Project",
          emoji: primarySkill?.icon ?? null,
          skillId: primarySkill?.id ?? null,
          skillName: primarySkill?.name ?? null,
          skillIcon: primarySkill?.icon ?? null,
          skillIds,
          taskSkillIds: tasks.map((task) => task.skillId ?? null),
          priority: normalizePriority(project.priority),
          energy: project.energy ?? null,
          stage: project.stage ?? null,
          completedAt: project.completed_at ?? null,
          globalRank: parseGlobalRank(project.global_rank),
          createdAt: project.created_at ?? null,
          tasks,
        };
      }),
  };
}

function normalizeHabit(
  row: HabitRow,
  monumentsById: Map<string, MonumentRow> = new Map()
): RoadmapHabitItem {
  const skill = firstRelatedRow(row.skill);
  const goal = firstRelatedRow(row.goal);
  const skillMonumentId = skill?.monument_id ?? null;
  const goalMonumentId = goal?.monument_id ?? null;
  const monumentId = skillMonumentId ?? goalMonumentId;
  const monument = monumentId ? monumentsById.get(monumentId) : undefined;

  return {
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled Habit",
    habitType: normalizeHabitBucket(row.habit_type),
    rawHabitType: row.habit_type ?? null,
    globalOrder: parseGlobalRank(row.global_order),
    skillId: row.skill_id ?? skill?.id ?? null,
    skillName: skill?.name ?? null,
    skillIcon: skill?.icon ?? null,
    skillMonumentId,
    goalId: row.goal_id ?? goal?.id ?? null,
    goalMonumentId,
    monumentId,
    monumentName: monument?.title ?? null,
    monumentIcon: monument?.emoji ?? null,
    monumentEmoji: monument?.emoji ?? null,
    routineId: row.routine_id ?? null,
    routinePosition: parseGlobalRank(row.routine_position),
    durationMinutes: row.duration_minutes ?? null,
    energy: row.energy ?? null,
    recurrenceMode: row.recurrence_mode ?? null,
    currentStreakDays: row.current_streak_days ?? null,
    lastCompletedAt: row.last_completed_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function normalizeCampaignGoal(
  row: GoalRow,
  campaignGoal: CampaignGoalRow,
  skillsById: Map<string, SkillMetadataRow> = new Map()
): RoadmapPriorityGoal {
  return {
    ...normalizeGoal(row, skillsById),
    campaignPosition: parseGlobalRank(campaignGoal.position),
    campaignGoalCreatedAt: campaignGoal.created_at ?? null,
  };
}

function normalizeCampaign(
  campaign: CampaignRow,
  goals: RoadmapPriorityGoal[] = [],
  monumentsById: Map<string, MonumentRow> = new Map()
): RoadmapPriorityCampaign {
  const monument = campaign.primary_monument_id
    ? monumentsById.get(campaign.primary_monument_id)
    : undefined;

  return {
    id: campaign.id,
    name: (campaign.name ?? "").trim() || "Untitled Campaign",
    emoji: campaign.emoji ?? null,
    description: campaign.description ?? null,
    monumentId: campaign.primary_monument_id ?? null,
    monumentName: monument?.title ?? null,
    monumentIcon: monument?.emoji ?? null,
    priority: normalizeCampaignPriority(campaign.priority_code),
    schedulingState: campaign.scheduling_state ?? null,
    position: parseGlobalRank(campaign.position),
    goals,
  };
}

function sortCampaignNestedGoals(
  goals: RoadmapPriorityGoal[]
): RoadmapPriorityGoal[] {
  return [...goals].sort((a, b) => {
    const priorityDelta =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const rankDelta = compareRankValues(
      a.priorityOrder ?? a.priorityRank,
      b.priorityOrder ?? b.priorityRank
    );
    if (rankDelta !== 0) return rankDelta;

    const campaignPositionDelta = compareRankValues(
      a.campaignPosition,
      b.campaignPosition
    );
    if (campaignPositionDelta !== 0) return campaignPositionDelta;

    const campaignCreatedDelta = compareText(
      a.campaignGoalCreatedAt,
      b.campaignGoalCreatedAt
    );
    if (campaignCreatedDelta !== 0) return campaignCreatedDelta;

    const createdDelta = compareText(a.createdAt, b.createdAt);
    if (createdDelta !== 0) return createdDelta;

    return compareText(a.id, b.id);
  });
}

function buildGlobalPriorityItems({
  goals,
  campaigns,
  campaignGoals,
  monumentsById,
  skillsById,
}: {
  goals: GoalRow[];
  campaigns: CampaignRow[];
  campaignGoals: CampaignGoalRow[];
  monumentsById?: Map<string, MonumentRow>;
  skillsById?: Map<string, SkillMetadataRow>;
}): GlobalPriorityRoadmapItem[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const campaignGoalIds = new Set<string>();
  const campaignGoalsByCampaignId = new Map<string, CampaignGoalRow[]>();
  const campaignCandidatesById = new Map<string, GlobalPriorityCampaignCandidate>();

  for (const campaignGoal of campaignGoals) {
    campaignGoalIds.add(campaignGoal.goal_id);
    const existing = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    existing.push(campaignGoal);
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, existing);
  }

  for (const groupedCampaignGoals of campaignGoalsByCampaignId.values()) {
    groupedCampaignGoals.sort((a, b) => {
      const aPosition = a.position ?? Number.POSITIVE_INFINITY;
      const bPosition = b.position ?? Number.POSITIVE_INFINITY;
      if (aPosition !== bPosition) return aPosition - bPosition;
      const createdDelta = compareText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareText(a.goal_id, b.goal_id);
    });
  }

  for (const campaign of campaigns) {
    const campaignNestedGoalsById = new Map<string, RoadmapPriorityGoal>();
    for (const campaignGoal of campaignGoalsByCampaignId.get(campaign.id) ?? []) {
      const goal = goalsById.get(campaignGoal.goal_id);
      if (
        !goal ||
        goal.circle_id ||
        isCompletedGoal(goal.status) ||
        campaignNestedGoalsById.has(goal.id)
      ) {
        continue;
      }
      campaignNestedGoalsById.set(
        goal.id,
        normalizeCampaignGoal(goal, campaignGoal, skillsById)
      );
    }

    if (campaignNestedGoalsById.size === 0) continue;

    const normalizedCampaign = normalizeCampaign(
      campaign,
      sortCampaignNestedGoals(Array.from(campaignNestedGoalsById.values())),
      monumentsById
    );
    const candidate: GlobalPriorityCampaignCandidate = {
      id: campaign.id,
      type: "campaign",
      sourceIds: [campaign.id],
      normalizedName: normalizeGlobalPriorityCampaignName(normalizedCampaign.name),
      name: normalizedCampaign.name,
      emoji: normalizedCampaign.emoji,
      monumentId: normalizedCampaign.monumentId,
      monumentName: normalizedCampaign.monumentName,
      monumentIcon: normalizedCampaign.monumentIcon,
      priority: normalizedCampaign.priority,
      priorityOrder: parseGlobalRank(campaign.priority_order),
      position: normalizedCampaign.position,
      createdAt: campaign.created_at ?? null,
      goals: normalizedCampaign.goals,
    };
    const existing = campaignCandidatesById.get(campaign.id);

    if (!existing) {
      campaignCandidatesById.set(campaign.id, candidate);
      continue;
    }

    const goalsForMergedItem = mergeGlobalPriorityCampaignGoals(
      existing.goals,
      candidate.goals
    );
    const preferredItem =
      compareGlobalPriorityCampaignStability(candidate, existing) < 0
        ? candidate
        : existing;

    campaignCandidatesById.set(campaign.id, {
      ...preferredItem,
      sourceIds: mergeSourceIds(existing.sourceIds, candidate.sourceIds),
      goals: sortCampaignNestedGoals(goalsForMergedItem),
    });
  }

  const campaignItems = buildGlobalPriorityCampaignItems(
    Array.from(campaignCandidatesById.values())
  );

  const standaloneGoalItems: GlobalPriorityRoadmapItem[] = goals
    .filter(
      (goal) =>
        !goal.circle_id && !isCompletedGoal(goal.status) && !campaignGoalIds.has(goal.id)
    )
    .map((goal) => {
      const normalizedGoal = normalizeGoal(goal, skillsById);

      return {
        id: goal.id,
        type: "goal",
        name: normalizedGoal.name,
        emoji: normalizedGoal.emoji,
        monumentId: normalizedGoal.monumentId,
        monumentName: normalizedGoal.monumentName,
        monumentIcon: normalizedGoal.monumentIcon,
        monumentEmoji: normalizedGoal.monumentEmoji,
        skills: normalizedGoal.skills,
        priority: normalizedGoal.priority,
        priorityOrder: parseGlobalRank(goal.priority_order),
        globalRank: normalizedGoal.globalRank,
        priorityRank: normalizedGoal.priorityRank,
        createdAt: goal.created_at ?? null,
        projects: normalizedGoal.projects,
      };
    });

  return sortGlobalPriorityItems([...campaignItems, ...standaloneGoalItems]);
}

function compareGlobalPriorityCampaignStability(
  a: GlobalPriorityRoadmapItem,
  b: GlobalPriorityRoadmapItem
) {
  const priorityOrderDelta = compareRankValues(a.priorityOrder, b.priorityOrder);
  if (priorityOrderDelta !== 0) return priorityOrderDelta;

  const createdDelta = compareText(a.createdAt, b.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return compareText(a.id, b.id);
}

function mergeGlobalPriorityCampaignGoals(
  first?: RoadmapPriorityGoal[],
  second?: RoadmapPriorityGoal[]
) {
  const goalsById = new Map<string, RoadmapPriorityGoal>();

  for (const goal of [...(first ?? []), ...(second ?? [])]) {
    if (goalsById.has(goal.id)) continue;
    goalsById.set(goal.id, goal);
  }

  return Array.from(goalsById.values());
}

function mergeRoadmapFilterOptions(
  first?: RoadmapFilterOptionData[],
  second?: RoadmapFilterOptionData[]
) {
  const optionsByKey = new Map<string, RoadmapFilterOptionData>();
  for (const option of [...(first ?? []), ...(second ?? [])]) {
    mergeFilterOptionData(optionsByKey, option);
  }
  return Array.from(optionsByKey.values());
}

function normalizeGlobalPriorityCampaignName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeSourceIds(first?: string[], second?: string[]) {
  return Array.from(new Set([...(first ?? []), ...(second ?? [])]));
}

function campaignCandidatesOverlap(
  group: GlobalPriorityCampaignGroup,
  candidate: GlobalPriorityCampaignCandidate
) {
  if (!candidate.normalizedName) return false;
  const candidateGoalIds = new Set((candidate.goals ?? []).map((goal) => goal.id));
  if (candidateGoalIds.size === 0) return false;

  for (const goalId of candidateGoalIds) {
    if (group.goalIds.has(goalId)) return true;
  }

  return false;
}

function mergeGlobalPriorityCampaignGroup(
  group: GlobalPriorityCampaignGroup
): GlobalPriorityRoadmapItem {
  const { candidates } = group;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(
      "Invalid Global Priority Campaign group: expected a non-empty candidates array."
    );
  }

  const sortedCandidates = [...candidates].sort(
    compareGlobalPriorityCampaignStability
  );
  const preferredItem = sortedCandidates[0];
  const sourceIds = sortedCandidates.reduce<string[]>(
    (mergedIds, candidate) =>
      mergeSourceIds(mergedIds, candidate.sourceIds ?? [candidate.id]),
    []
  );
  return {
    id: preferredItem.id,
    type: "campaign",
    name: preferredItem.name,
    emoji: preferredItem.emoji,
    monumentId: preferredItem.monumentId,
    monumentName: preferredItem.monumentName,
    monumentIcon: preferredItem.monumentIcon,
    skills: sortedCandidates.reduce<RoadmapFilterOptionData[]>(
      (mergedOptions, candidate) =>
        mergeRoadmapFilterOptions(mergedOptions, candidate.skills),
      []
    ),
    priority: preferredItem.priority,
    priorityOrder: preferredItem.priorityOrder,
    position: preferredItem.position,
    createdAt: preferredItem.createdAt,
    sourceIds,
    goals: sortCampaignNestedGoals(
      sortedCandidates.reduce<RoadmapPriorityGoal[]>(
        (mergedGoals, candidate) =>
          mergeGlobalPriorityCampaignGoals(mergedGoals, candidate.goals),
        []
      )
    ),
  };
}

function buildGlobalPriorityCampaignItems(
  candidates: GlobalPriorityCampaignCandidate[]
) {
  const groupsByName = new Map<string, GlobalPriorityCampaignGroup[]>();

  for (const candidate of candidates) {
    const groups = groupsByName.get(candidate.normalizedName) ?? [];
    const overlappingGroup = groups.find((group) =>
      campaignCandidatesOverlap(group, candidate)
    );

    if (overlappingGroup) {
      overlappingGroup.candidates.push(candidate);
      for (const goal of candidate.goals ?? []) {
        overlappingGroup.goalIds.add(goal.id);
      }
    } else {
      groups.push({
        candidates: [candidate],
        goalIds: new Set((candidate.goals ?? []).map((goal) => goal.id)),
      });
      groupsByName.set(candidate.normalizedName, groups);
    }
  }

  return Array.from(groupsByName.values())
    .flat()
    .map((group) => mergeGlobalPriorityCampaignGroup(group));
}

export default async function PriorityEditorPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer({
    get: (name) => cookieStore.get(name),
  });

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const userId = user.id;

  const { data: allMonumentData, error: allMonumentError } = await supabase
    .from("monuments")
    .select("id,title,emoji,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (allMonumentError) {
    console.error(
      "Failed to load Monument options for priority editor",
      allMonumentError
    );
  }

  const { data: allSkillData, error: allSkillError } = await supabase
    .from("skills")
    .select("id,name,icon,monument_id,cat_id,sort_order,created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (allSkillError) {
    console.error("Failed to load Skill options for priority editor", allSkillError);
  }

  const { data: skillCategoryData, error: skillCategoryError } = await supabase
    .from("cats")
    .select("id,name,sort_order,created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (skillCategoryError) {
    console.error(
      "Failed to load Skill categories for priority editor",
      skillCategoryError
    );
  }

  const { data: goalData, error: goalError } = await supabase
    .from("goals")
    .select(
      `id,name,emoji,monument_id,roadmap_id,circle_id,status,priority,priority_code,priority_order,global_rank,priority_rank,created_at,monument:monuments(id,title,emoji),
      projects(
        id,name,priority,energy,stage,completed_at,created_at,global_rank,
        tasks(id,name,skill_id,priority,energy,stage,completed_at,duration_min,created_at,skills(id,name,icon,monument_id,cat_id,sort_order,created_at)),
        project_skills(skill_id,skills(id,name,icon,monument_id,cat_id,sort_order,created_at))
      )`
    )
    .eq("user_id", userId);

  if (goalError) {
    console.error("Failed to load goals for priority editor", goalError);
  }

  const { data: habitData, error: habitError } = await supabase
    .from("habits")
    .select(
      `id,name,habit_type,global_order,skill_id,goal_id,routine_id,routine_position,duration_minutes,energy,recurrence_mode,current_streak_days,last_completed_at,created_at,updated_at,circle_id,
      skill:skills(id,name,icon,monument_id),
      goal:goals(id,monument_id)`
    )
    .eq("user_id", userId)
    .is("circle_id", null);

  if (habitError) {
    console.error("Failed to load habits for priority editor", habitError);
  }

  let campaigns: CampaignRow[] = [];
  let campaignGoals: CampaignGoalRow[] = [];
  let campaignErrorMessage: string | null = null;
  let campaignGoalErrorMessage: string | null = null;

  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id,name,description,emoji,priority_code,priority_order,scheduling_state,position,roadmap_id,primary_monument_id,created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (campaignError) {
    console.error("Failed to load campaigns for priority editor", campaignError);
    campaignErrorMessage = campaignError.message || "Unable to load Campaigns.";
  } else {
    campaigns = (campaignData ?? []) as CampaignRow[];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);

  if (campaignIds.length > 0) {
    const { data: campaignGoalData, error: campaignGoalError } = await supabase
      .from("campaign_goals")
      .select("campaign_id,goal_id,position,created_at")
      .eq("user_id", userId)
      .in("campaign_id", campaignIds)
      .order("position", { ascending: true });

    if (campaignGoalError) {
      console.error("Failed to load campaign goals for priority editor", campaignGoalError);
      campaignGoalErrorMessage =
        campaignGoalError.message || "Unable to load Campaign Goals.";
    } else {
      campaignGoals = (campaignGoalData ?? []) as CampaignGoalRow[];
    }
  }

  const goals = (goalData ?? []) as GoalRow[];
  const habits = (habitData ?? []) as HabitRow[];
  const allMonuments = (allMonumentData ?? []) as MonumentRow[];
  const allSkills = (allSkillData ?? []) as SkillMetadataRow[];
  const skillIds = Array.from(
    new Set(goals.flatMap((goal) => collectGoalSkillIds(goal)))
  );
  const skillsById = new Map<string, SkillMetadataRow>();

  if (!allSkillError) {
    for (const skill of allSkills) {
      if (skill.id) {
        skillsById.set(skill.id, skill);
      }
    }
  } else if (skillIds.length > 0) {
    const { data: skillData, error: skillError } = await supabase
      .from("skills")
      .select("id,name,icon,monument_id,cat_id,sort_order")
      .eq("user_id", userId)
      .in("id", skillIds);

    if (skillError) {
      console.error("Failed to load skills for priority editor", skillError);
    } else {
      for (const skill of (skillData ?? []) as SkillMetadataRow[]) {
        if (skill.id) {
          skillsById.set(skill.id, skill);
        }
      }
    }
  }

  const monumentIds = Array.from(
    new Set(
      [
        ...goals.map((goal) => goal.monument_id),
        ...campaigns.map((campaign) => campaign.primary_monument_id),
        ...habits.flatMap((habit) => {
          const skill = firstRelatedRow(habit.skill);
          const goal = firstRelatedRow(habit.goal);
          return [skill?.monument_id, goal?.monument_id];
        }),
      ].filter((id): id is string => Boolean(id))
    )
  );
  const monumentsById = new Map<string, MonumentRow>();

  if (!allMonumentError) {
    for (const monument of allMonuments) {
      monumentsById.set(monument.id, monument);
    }
  } else if (monumentIds.length > 0) {
    const { data: monumentData, error: monumentError } = await supabase
      .from("monuments")
      .select("id,title,emoji")
      .eq("user_id", userId)
      .in("id", monumentIds);

    if (monumentError) {
      console.error("Failed to load monuments for priority editor", monumentError);
    } else {
      for (const monument of (monumentData ?? []) as MonumentRow[]) {
        monumentsById.set(monument.id, monument);
      }
    }
  }

  const fetchErrorMessages = [];
  if (allMonumentError) {
    fetchErrorMessages.push(
      `Monuments select error: ${
        allMonumentError.message || "Unable to load Monument options."
      }`
    );
  }
  if (allSkillError) {
    fetchErrorMessages.push(
      `Skills select error: ${allSkillError.message || "Unable to load Skill options."}`
    );
  }
  if (goalError) {
    fetchErrorMessages.push(
      `Goals select error: ${goalError.message || "Unable to load Goals."}`
    );
  }
  if (habitError) {
    fetchErrorMessages.push(
      `Habits select error: ${habitError.message || "Unable to load Habits."}`
    );
  }
  if (campaignErrorMessage) {
    fetchErrorMessages.push(`Campaigns select error: ${campaignErrorMessage}`);
  }
  if (campaignGoalErrorMessage) {
    fetchErrorMessages.push(`Campaign Goals select error: ${campaignGoalErrorMessage}`);
  }

  const nonCompletedGoals = goals.filter((goal) => !isCompletedGoal(goal.status));
  const globalPriorityItems = buildGlobalPriorityItems({
    goals: nonCompletedGoals,
    campaigns,
    campaignGoals,
    monumentsById,
    skillsById,
  });
  const habitItems = sortHabitRoadmapItems(
    habits
      .filter((habit) => !habit.circle_id)
      .map((habit) => normalizeHabit(habit, monumentsById))
  );
  const monumentFilterOptions = allMonuments
    .map(createMonumentFilterOption)
    .filter((option): option is UserPriorityFilterOptionData => Boolean(option));
  const skillFilterOptions = allSkills
    .map(createSkillFilterOption)
    .filter((option): option is UserPriorityFilterOptionData => Boolean(option));
  const skillCategoryOptions = ((skillCategoryData ?? []) as SkillCategoryRow[])
    .map(createSkillCategoryOption)
    .filter((option): option is UserPrioritySkillCategoryData => Boolean(option));

  return (
    <ProtectedRoute>
      <PriorityEditorClient
        userId={userId}
        initialGlobalPriorityItems={globalPriorityItems}
        initialHabitItems={habitItems}
        initialMonumentOptions={monumentFilterOptions}
        initialSkillOptions={skillFilterOptions}
        initialSkillCategories={skillCategoryOptions}
        initialError={fetchErrorMessages.length ? fetchErrorMessages.join(" ") : null}
      />
    </ProtectedRoute>
  );
}
