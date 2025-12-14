"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GoalsHeader } from "./components/GoalsHeader";
import {
  GoalsUtilityBar,
  EnergyFilter,
  PriorityFilter,
  SortOption,
} from "./components/GoalsUtilityBar";
import { GoalCard } from "./components/GoalCard";
import { RoadmapCard } from "./components/RoadmapCard";
import { RoadmapDrawer } from "./components/RoadmapDrawer";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { EmptyState } from "./components/EmptyState";
import { GoalDrawer, type GoalUpdateContext } from "./components/GoalDrawer";
import type { Goal, Project } from "./types";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  persistGoalUpdate,
  isGoalCodeColumnMissingError,
} from "@/lib/goals/persistGoalUpdate";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { getSkillsForUser } from "@/lib/queries/skills";
import { listRoadmaps, type Roadmap } from "@/lib/queries/roadmaps";
import {
  projectWeight,
  taskWeight,
  type TaskLite,
  type ProjectLite,
  dueDateUrgencyBoost,
} from "@/lib/scheduler/weight";

function mapPriority(
  priority: { name?: string | null } | string | null | undefined
): Goal["priority"] {
  const normalized = extractLookupValue(priority)?.toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra-Critical";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(
  energy: { name?: string | null } | string | null | undefined
): Goal["energy"] {
  const normalized = extractLookupValue(energy)?.toUpperCase();
  switch (normalized) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function projectStageToStatus(stage: string): Project["status"] {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
}

function projectStatusToStage(status: Project["status"]): string {
  switch (status) {
    case "Todo":
      return "RESEARCH";
    case "Done":
      return "RELEASE";
    default:
      return "BUILD";
  }
}

function priorityToDbValue(priority: Goal["priority"]): string {
  switch (priority) {
    case "Ultra-Critical":
      return "ULTRA-CRITICAL";
    case "Critical":
      return "CRITICAL";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
}

function energyToDbValue(energy: Goal["energy"]): string {
  switch (energy) {
    case "Extreme":
      return "EXTREME";
    case "Ultra":
      return "ULTRA";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
}

const DAY_IN_MS = 86_400_000;
const GOAL_BATCH_SIZE = 6;

const GOAL_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 10,
  MEDIUM: 200,
  HIGH: 300,
  CRITICAL: 500,
  "ULTRA-CRITICAL": 1000,
};

const SCHEDULER_PRIORITY_MAP: Record<string, string> = {
  NO: "NO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra-Critical",
};
const NORMALIZED_PRIORITY_VALUES = new Set([
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
]);
const NORMALIZED_ENERGY_VALUES = new Set([
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
]);

function normalizeProjectPriority(value?: string | null): string {
  if (typeof value !== "string") return "NO";
  const normalized = value.toUpperCase();
  return NORMALIZED_PRIORITY_VALUES.has(normalized) ? normalized : "NO";
}

function normalizeProjectEnergyCode(value?: string | null): string {
  if (typeof value !== "string") return "NO";
  const normalized = value.toUpperCase();
  return NORMALIZED_ENERGY_VALUES.has(normalized) ? normalized : "NO";
}

function extractLookupValue(
  field: { name?: string | null } | string | null | undefined
): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (typeof field === "object" && "name" in field) {
    const candidate = field.name;
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
}

const TASK_STAGE_MAP: Record<string, string> = {
  PREPARE: "Prepare",
  PRODUCE: "Produce",
  PERFECT: "Perfect",
};

function mapSchedulerPriority(priority?: string | null): string {
  if (typeof priority !== "string") return "NO";
  const upper = priority.toUpperCase();
  return SCHEDULER_PRIORITY_MAP[upper] || "NO";
}

function mapSchedulerTaskStage(stage?: string | null): string {
  if (typeof stage !== "string") return "Produce";
  const upper = stage.toUpperCase();
  return TASK_STAGE_MAP[upper] || "Produce";
}

function normalizePriorityCode(code?: string | null) {
  if (typeof code !== "string") return "NO";
  return code.toUpperCase();
}

function computeGoalWeight(goal: Goal): number {
  const priorityCode = normalizePriorityCode(goal.priorityCode);
  const priorityWeight = GOAL_PRIORITY_WEIGHT[priorityCode] ?? 0;
  const projectWeightSum = goal.projects.reduce(
    (sum, project) => sum + (project.weight ?? 0),
    0
  );
  const ageInDays =
    goal.status === "Completed"
      ? 0
      : Math.max(
          0,
          Math.floor((Date.now() - Date.parse(goal.updatedAt)) / DAY_IN_MS)
        );
  const boost = goal.weightBoost ?? 0;
  const dueDateBoost = dueDateUrgencyBoost(goal.dueDate ?? null, {
    linearMax: 220,
    surgeMax: 420,
    surgeWindowDays: 4,
    linearWindowDays: 30,
    overdueBonusPerDay: 85,
    overdueMax: 360,
  });
  return priorityWeight + projectWeightSum + ageInDays + boost + dueDateBoost;
}

const GOAL_WEIGHT_UPDATE_BATCH_SIZE = 8;

async function persistGoalWeights(
  supabase: SupabaseClient,
  updates: { id: string; weight: number }[]
) {
  for (let i = 0; i < updates.length; i += GOAL_WEIGHT_UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + GOAL_WEIGHT_UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, weight }) =>
        supabase.from("goals").update({ weight }).eq("id", id)
      )
    );
  }
}

type GoalRowWithRelations = GoalRow & {
  projects?: {
    id: string;
    name: string;
    goal_id: string;
    priority: string | null;
    energy: string | null;
    stage: string | null;
    duration_min?: number | null;
    created_at: string;
    tasks?: {
      id: string;
      project_id: string | null;
      stage: string;
      name: string;
      skill_id: string | null;
      priority: string | null;
    }[];
    project_skills?: {
      skill_id: string | null;
    }[];
  }[];
};

async function fetchGoalsWithRelations(
  supabase: SupabaseClient,
  userId: string
): Promise<GoalRowWithRelations[]> {
  const baseSelect =
    "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, roadmap_id, weight, weight_boost, due_date, emoji";
  const selectWithEnumColumns = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority,
      energy,
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;
  const selectWithLookupRelations = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority,
      energy,
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;
  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

  const variants = [
    { description: "enum column project fetch", select: selectWithEnumColumns },
    {
      description: "lookup relation project fetch",
      select: selectWithLookupRelations,
    },
  ];
  for (const variant of variants) {
    const { data, error } = await runQuery(variant.select);
    if (!error) {
      return data ?? [];
    }
    console.warn(`Goal fetch variant failed (${variant.description}):`, error);
  }

  console.warn("Falling back to basic goal fetch (relations unavailable)");

  const fallback = await runQuery(baseSelect);
  if (fallback.error) {
    console.error("Fallback goal fetch also failed:", fallback.error);
    throw fallback.error;
  }
  return fallback.data ?? [];
}

async function fetchGoalsByRoadmapId(
  supabase: SupabaseClient,
  userId: string,
  roadmapId: string
): Promise<GoalRowWithRelations[]> {
  const baseSelect =
    "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, roadmap_id, weight, weight_boost, due_date, emoji";
  const selectWithEnumColumns = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority,
      energy,
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;
  const selectWithLookupRelations = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority,
      energy,
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;
  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .eq("roadmap_id", roadmapId)
      .order("priority_code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

  const variants = [
    { description: "enum column project fetch", select: selectWithEnumColumns },
    {
      description: "lookup relation project fetch",
      select: selectWithLookupRelations,
    },
  ];
  for (const variant of variants) {
    const { data, error } = await runQuery(variant.select);
    if (!error) {
      return data ?? [];
    }
    console.warn(
      `Roadmap goal fetch variant failed (${variant.description}):`,
      error
    );
  }

  console.warn(
    "Falling back to basic roadmap goal fetch (relations unavailable)"
  );

  const fallback = await runQuery(baseSelect);
  if (fallback.error) {
    console.error("Fallback roadmap goal fetch also failed:", fallback.error);
    throw fallback.error;
  }
  return fallback.data ?? [];
}

async function fetchProjectScheduleEndLookup(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("source_id, end_utc")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT")
    .in("status", ["scheduled", "completed", "missed"])
    .order("end_utc", { ascending: false });

  if (error) {
    throw error;
  }

  (data ?? []).forEach((record) => {
    const projectId = record?.source_id;
    const endUtc = record?.end_utc;
    if (!projectId || !endUtc) return;
    if (!lookup.has(projectId)) {
      lookup.set(projectId, endUtc);
    }
  });

  return lookup;
}

function toSchedulerTask(task: {
  id: string;
  name: string;
  stage: string;
  priorityCode?: string | null;
}): TaskLite {
  return {
    id: task.id,
    name: task.name,
    stage: mapSchedulerTaskStage(task.stage),
    priority: mapSchedulerPriority(task.priorityCode ?? null),
    duration_min: 0,
    energy: null,
  };
}

function toSchedulerProject(project: {
  id: string;
  priorityCode?: string | null;
  stage?: string | null;
  dueDate?: string | null;
}): ProjectLite {
  return {
    id: project.id,
    priority: mapSchedulerPriority(project.priorityCode ?? null),
    stage: project.stage ?? "BUILD",
    due_date: project.dueDate ?? null,
  };
}

async function syncProjectsAndTasks(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  context: GoalUpdateContext
) {
  const { projects, removedProjectIds, removedTaskIds } = context;

  const uniqueRemovedProjectIds = Array.from(new Set(removedProjectIds));
  if (uniqueRemovedProjectIds.length > 0) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .in("id", uniqueRemovedProjectIds);
    if (error) {
      console.error("Error deleting projects:", error);
    }
  }

  const uniqueRemovedTaskIds = Array.from(new Set(removedTaskIds));
  if (uniqueRemovedTaskIds.length > 0) {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .in("id", uniqueRemovedTaskIds);
    if (error) {
      console.error("Error deleting tasks:", error);
    }
  }

  const newProjects = projects
    .filter((project) => project.isNew)
    .filter((project) => project.name.trim().length > 0);
  if (newProjects.length > 0) {
    const { error } = await supabase.from("projects").insert(
      newProjects.map((project) => ({
        id: project.id,
        name: project.name.trim(),
        goal_id: goalId,
        user_id: userId,
        stage: project.stage ?? projectStatusToStage(project.status),
        energy: project.energyCode ?? energyToDbValue(project.energy),
        priority: project.priorityCode ?? "NO",
        due_date: project.dueDate ?? null,
      }))
    );
    if (error) {
      console.error("Error inserting projects:", error);
    }
  }

  const existingProjects = projects.filter((project) => !project.isNew);
  if (existingProjects.length > 0) {
    await Promise.all(
      existingProjects.map(async (project) => {
        const trimmedName = project.name.trim();
        if (trimmedName.length === 0) return;
        const { error } = await supabase
          .from("projects")
          .update({
            name: trimmedName,
            stage: project.stage ?? projectStatusToStage(project.status),
            energy: project.energyCode ?? energyToDbValue(project.energy),
            priority: project.priorityCode ?? "NO",
            due_date: project.dueDate ?? null,
          })
          .eq("id", project.id);
        if (error) {
          console.error("Error updating project:", error);
        }
      })
    );
  }

  const taskInserts: {
    id: string;
    name: string;
    stage: string;
    project_id: string;
    user_id: string;
  }[] = [];
  const taskUpdates: {
    id: string;
    name: string;
    stage: string;
    project_id: string;
  }[] = [];

  projects.forEach((project) => {
    project.tasks.forEach((task) => {
      const trimmedName = task.name.trim();
      if (trimmedName.length === 0) return;
      if (task.isNew) {
        taskInserts.push({
          id: task.id,
          name: trimmedName,
          stage: task.stage,
          project_id: project.id,
          user_id: userId,
        });
      } else {
        taskUpdates.push({
          id: task.id,
          name: trimmedName,
          stage: task.stage,
          project_id: project.id,
        });
      }
    });
  });

  if (taskInserts.length > 0) {
    const { error } = await supabase.from("tasks").insert(taskInserts);
    if (error) {
      console.error("Error inserting tasks:", error);
    }
  }

  if (taskUpdates.length > 0) {
    await Promise.all(
      taskUpdates.map(async (task) => {
        const { error } = await supabase
          .from("tasks")
          .update({
            name: task.name,
            stage: task.stage,
            project_id: task.project_id,
          })
          .eq("id", task.id);
        if (error) {
          console.error("Error updating task:", error);
        }
      })
    );
  }
}

function goalStatusToStatus(status?: string | null): Goal["status"] {
  switch (status) {
    case "COMPLETED":
    case "Completed":
    case "DONE":
      return "Completed";
    case "INACTIVE":
    case "Inactive":
      return "Inactive";
    case "OVERDUE":
    case "Overdue":
      return "Overdue";
    case "ACTIVE":
    case "Active":
    case "IN_PROGRESS":
    case "IN PROGRESS":
    default:
      return "Active";
  }
}

export default function GoalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [roadmapGoals, setRoadmapGoals] = useState<Map<string, Goal[]>>(
    new Map()
  );
  const [search, setSearch] = useState("");
  const [energy, setEnergy] = useState<EnergyFilter>("All");
  const [priority, setPriority] = useState<PriorityFilter>("All");
  const [sort, setSort] = useState<SortOption>("A→Z");
  const [monuments, setMonuments] = useState<
    { id: string; title: string; emoji: string | null }[]
  >([]);
  const [skills, setSkills] = useState<
    { id: string; name: string; icon: string | null }[]
  >([]);
  const [monument, setMonument] = useState<string>("All");
  const [skill, setSkill] = useState<string>("All");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [roadmapDrawer, setRoadmapDrawer] = useState(false);
  const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [visibleGoalCount, setVisibleGoalCount] = useState(GOAL_BATCH_SIZE);

  const getMonumentEmoji = useCallback(
    (monumentId?: string | null) => {
      if (!monumentId) return null;
      const match = monuments.find((m) => m.id === monumentId);
      return match?.emoji ?? null;
    },
    [monuments]
  );

  const decorateGoal = useCallback(
    (goal: Goal, lookup?: Map<string, string | null>) => {
      const emojiFromLookup =
        lookup?.get(goal.monumentId ?? "") ??
        getMonumentEmoji(goal.monumentId ?? null);
      const withEmoji = {
        ...goal,
        monumentEmoji: emojiFromLookup ?? null,
      };
      return {
        ...withEmoji,
        weight: computeGoalWeight(withEmoji),
      };
    },
    [getMonumentEmoji]
  );

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          return {
            ...goal,
            projects: goal.projects.map((project) =>
              project.id === projectId ? { ...project, ...updates } : project
            ),
          };
        })
      );
    },
    []
  );

  const handleProjectDeleted = useCallback(
    (goalId: string, projectId: string) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          return {
            ...goal,
            projects: goal.projects.filter(
              (project) => project.id !== projectId
            ),
          };
        })
      );
    },
    []
  );

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && goals.length > 0) {
      const goal = goals.find((g) => g.id === editId);
      if (goal) {
        setEditing(goal);
        setDrawer(true);
      }
    }
  }, [searchParams, goals]);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setUserId(null);
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const goalsPromise = fetchGoalsWithRelations(supabase, user.id).catch(
          (err) => {
            console.error("Error fetching goals:", err);
            return [];
          }
        );

        const monumentsPromise = getMonumentsForUser(user.id).catch((err) => {
          console.error("Error fetching monuments:", err);
          return [];
        });

        const skillsPromise = getSkillsForUser(user.id).catch((err) => {
          console.error("Error fetching skills:", err);
          return [];
        });

        const roadmapsPromise = listRoadmaps(user.id).catch((err) => {
          console.error("Error fetching roadmaps:", err);
          return [];
        });

        const projectSchedulesPromise = fetchProjectScheduleEndLookup(
          supabase,
          user.id
        ).catch((err) => {
          console.error("Error fetching scheduled projects:", err);
          return new Map<string, string>();
        });

        const [
          goalsData,
          monumentsData,
          skillsData,
          roadmapsData,
          projectScheduleLookup,
        ] = await Promise.all([
          goalsPromise,
          monumentsPromise,
          skillsPromise,
          roadmapsPromise,
          projectSchedulesPromise,
        ]);

        setRoadmaps(roadmapsData);

        const monumentEmojiLookup = new Map(
          monumentsData.map((m) => [m.id, m.emoji ?? null])
        );
        const skillEmojiLookup = new Map(
          skillsData.map((s) => [s.id, s.icon ?? null])
        );
        const resolveSkillEmoji = (skillId?: string | null) => {
          if (!skillId) return null;
          return skillEmojiLookup.get(skillId) ?? null;
        };

        const originalWeightMap = new Map(
          goalsData.map((g) => [g.id, g.weight ?? null])
        );

        const realGoals: Goal[] = goalsData.map((g) => {
          const goalSkills = new Set<string>();
          const projList: Project[] = (g.projects ?? []).map((p) => {
            const normalizedTasks = (p.tasks ?? []).map((task) => {
              const normalized = {
                id: task.id,
                name: task.name,
                stage: task.stage,
                skillId: task.skill_id ?? null,
                priorityCode: task.priority ?? null,
                isNew: false,
              };
              if (normalized.skillId) {
                goalSkills.add(normalized.skillId);
              }
              return normalized;
            });
            const projectSkillIds: string[] = [];
            (p.project_skills ?? []).forEach((record) => {
              if (record?.skill_id) {
                goalSkills.add(record.skill_id);
                projectSkillIds.push(record.skill_id);
              }
            });
            const total = normalizedTasks.length;
            const done = normalizedTasks.filter(
              (t) => t.stage === "PERFECT"
            ).length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const status = projectStageToStatus(p.stage ?? "BUILD");
            const schedulerTasks = normalizedTasks.map(toSchedulerTask);
            const relatedTaskWeightSum = schedulerTasks.reduce(
              (sum, t) => sum + taskWeight(t),
              0
            );
            const projectWeightValue = projectWeight(
              toSchedulerProject({
                id: p.id,
                priorityCode: p.priority ?? undefined,
                stage: p.stage ?? undefined,
                dueDate: p.due_date ?? null,
              }),
              relatedTaskWeightSum
            );
            const normalizedTaskSkillIds = normalizedTasks
              .map((task) => task.skillId)
              .filter((value): value is string => Boolean(value));
            const projectEmoji =
              projectSkillIds
                .map(resolveSkillEmoji)
                .find((emoji): emoji is string => Boolean(emoji)) ??
              normalizedTaskSkillIds
                .map(resolveSkillEmoji)
                .find((emoji): emoji is string => Boolean(emoji)) ??
              null;
            const rawEnergy = extractLookupValue(p.energy);
            const rawPriority = extractLookupValue(p.priority);
            const energyCode = normalizeProjectEnergyCode(rawEnergy);
            const priorityCode = normalizeProjectPriority(rawPriority);
            return {
              id: p.id,
              name: p.name,
              status,
              progress,
              energy: mapEnergy(energyCode),
              energyCode,
              dueDate: p.due_date ?? null,
              durationMinutes:
                typeof p.duration_min === "number" &&
                Number.isFinite(p.duration_min)
                  ? p.duration_min
                  : null,
              skillIds: projectSkillIds,
              emoji: projectEmoji,
              stage: p.stage ?? "BUILD",
              priorityCode,
              weight: projectWeightValue,
              isNew: false,
              tasks: normalizedTasks,
            };
          });
          const progress =
            projList.length > 0
              ? Math.round(
                  projList.reduce((sum, p) => sum + p.progress, 0) /
                    projList.length
                )
              : 0;
          const status = g.status
            ? goalStatusToStatus(g.status)
            : progress >= 100
            ? "Completed"
            : "Active";
          const estimatedCompletionAt = projList.reduce<string | null>(
            (latest, project) => {
              const scheduledEnd =
                projectScheduleLookup.get(project.id) ?? null;
              if (!scheduledEnd) return latest;
              const scheduledTime = Date.parse(scheduledEnd);
              if (Number.isNaN(scheduledTime)) return latest;
              if (!latest) return scheduledEnd;
              const latestTime = Date.parse(latest);
              if (Number.isNaN(latestTime) || scheduledTime > latestTime) {
                return scheduledEnd;
              }
              return latest;
            },
            null
          );
          const goalPriorityCode =
            g.priority_code ?? extractLookupValue(g.priority);
          const normalizedGoalPriorityCode = goalPriorityCode
            ? goalPriorityCode.toUpperCase()
            : null;
          const goalEnergyCode = g.energy_code ?? extractLookupValue(g.energy);
          const normalizedGoalEnergyCode = goalEnergyCode
            ? goalEnergyCode.toUpperCase()
            : null;
          const baseGoal: Goal = {
            id: g.id,
            title: g.name,
            priority: mapPriority(goalPriorityCode ?? null),
            energy: mapEnergy(goalEnergyCode ?? null),
            progress,
            status,
            active: g.active ?? status === "Active",
            createdAt: g.created_at,
            updatedAt: g.created_at,
            dueDate: g.due_date ?? undefined,
            projects: projList,
            monumentId: g.monument_id ?? null,
            roadmapId: g.roadmap_id ?? null,
            priorityCode: normalizedGoalPriorityCode,
            energyCode: normalizedGoalEnergyCode,
            weightBoost: g.weight_boost ?? 0,
            skills: Array.from(goalSkills),
            why: g.why || undefined,
            estimatedCompletionAt,
          };
          return decorateGoal(baseGoal, monumentEmojiLookup);
        });

        // Separate goals with and without roadmap_id
        // Only hide goals with a valid roadmap_id (non-null, non-undefined, non-empty string)
        const goalsWithoutRoadmap = realGoals.filter((goal) => {
          const roadmapId = goal.roadmapId;
          // Keep goals where roadmap_id is null, undefined, or empty string
          return !roadmapId || roadmapId.trim() === "";
        });

        const goalsWithRoadmap = realGoals.filter((goal) => {
          const roadmapId = goal.roadmapId;
          // Only include goals with a valid roadmap_id (non-empty string)
          return roadmapId && roadmapId.trim() !== "";
        });

        const goalsNeedingUpdate = realGoals.filter((goal) => {
          const existing = originalWeightMap.get(goal.id) ?? null;
          return (existing ?? 0) !== (goal.weight ?? 0);
        });

        if (goalsNeedingUpdate.length > 0) {
          const weightUpdates = goalsNeedingUpdate.map((goal) => ({
            id: goal.id,
            weight: goal.weight ?? 0,
          }));
          persistGoalWeights(supabase, weightUpdates).catch((err) => {
            console.error("Error updating goal weights:", err);
          });
        }

        // Fetch goals for each roadmap
        const roadmapGoalsMap = new Map<string, Goal[]>();
        for (const roadmap of roadmapsData) {
          try {
            const roadmapGoalsData = await fetchGoalsByRoadmapId(
              supabase,
              user.id,
              roadmap.id
            );
            const roadmapGoalsList: Goal[] = roadmapGoalsData.map((g) => {
              // Reuse the same transformation logic as above
              const goalSkills = new Set<string>();
              const projList: Project[] = (g.projects ?? []).map((p) => {
                const normalizedTasks = (p.tasks ?? []).map((task) => {
                  const normalized = {
                    id: task.id,
                    name: task.name,
                    stage: task.stage,
                    skillId: task.skill_id ?? null,
                    priorityCode: task.priority ?? null,
                    isNew: false,
                  };
                  if (normalized.skillId) {
                    goalSkills.add(normalized.skillId);
                  }
                  return normalized;
                });
                const projectSkillIds: string[] = [];
                (p.project_skills ?? []).forEach((record) => {
                  if (record?.skill_id) {
                    goalSkills.add(record.skill_id);
                    projectSkillIds.push(record.skill_id);
                  }
                });
                const total = normalizedTasks.length;
                const done = normalizedTasks.filter(
                  (t) => t.stage === "PERFECT"
                ).length;
                const progress = total ? Math.round((done / total) * 100) : 0;
                const status = projectStageToStatus(p.stage ?? "BUILD");
                const schedulerTasks = normalizedTasks.map(toSchedulerTask);
                const relatedTaskWeightSum = schedulerTasks.reduce(
                  (sum, t) => sum + taskWeight(t),
                  0
                );
                const projectWeightValue = projectWeight(
                  toSchedulerProject({
                    id: p.id,
                    priorityCode: p.priority ?? undefined,
                    stage: p.stage ?? undefined,
                    dueDate: p.due_date ?? null,
                  }),
                  relatedTaskWeightSum
                );
                const normalizedTaskSkillIds = normalizedTasks
                  .map((task) => task.skillId)
                  .filter((value): value is string => Boolean(value));
                const projectEmoji =
                  projectSkillIds
                    .map(resolveSkillEmoji)
                    .find((emoji): emoji is string => Boolean(emoji)) ??
                  normalizedTaskSkillIds
                    .map(resolveSkillEmoji)
                    .find((emoji): emoji is string => Boolean(emoji)) ??
                  null;
                const rawEnergy = extractLookupValue(p.energy);
                const rawPriority = extractLookupValue(p.priority);
                const energyCode = normalizeProjectEnergyCode(rawEnergy);
                const priorityCode = normalizeProjectPriority(rawPriority);
                return {
                  id: p.id,
                  name: p.name,
                  status,
                  progress,
                  energy: mapEnergy(energyCode),
                  energyCode,
                  dueDate: p.due_date ?? null,
                  durationMinutes:
                    typeof p.duration_min === "number" &&
                    Number.isFinite(p.duration_min)
                      ? p.duration_min
                      : null,
                  skillIds: projectSkillIds,
                  emoji: projectEmoji,
                  stage: p.stage ?? "BUILD",
                  priorityCode,
                  weight: projectWeightValue,
                  isNew: false,
                  tasks: normalizedTasks,
                };
              });
              const progress =
                projList.length > 0
                  ? Math.round(
                      projList.reduce((sum, p) => sum + p.progress, 0) /
                        projList.length
                    )
                  : 0;
              const status = g.status
                ? goalStatusToStatus(g.status)
                : progress >= 100
                ? "Completed"
                : "Active";
              const estimatedCompletionAt = projList.reduce<string | null>(
                (latest, project) => {
                  const scheduledEnd =
                    projectScheduleLookup.get(project.id) ?? null;
                  if (!scheduledEnd) return latest;
                  const scheduledTime = Date.parse(scheduledEnd);
                  if (Number.isNaN(scheduledTime)) return latest;
                  if (!latest) return scheduledEnd;
                  const latestTime = Date.parse(latest);
                  if (Number.isNaN(latestTime) || scheduledTime > latestTime) {
                    return scheduledEnd;
                  }
                  return latest;
                },
                null
              );
              const goalPriorityCode =
                g.priority_code ?? extractLookupValue(g.priority);
              const normalizedGoalPriorityCode = goalPriorityCode
                ? goalPriorityCode.toUpperCase()
                : null;
              const goalEnergyCode =
                g.energy_code ?? extractLookupValue(g.energy);
              const normalizedGoalEnergyCode = goalEnergyCode
                ? goalEnergyCode.toUpperCase()
                : null;
              const baseGoal: Goal = {
                id: g.id,
                title: g.name,
                priority: mapPriority(goalPriorityCode ?? null),
                energy: mapEnergy(goalEnergyCode ?? null),
                progress,
                status,
                active: g.active ?? status === "Active",
                createdAt: g.created_at,
                updatedAt: g.created_at,
                dueDate: g.due_date ?? undefined,
                projects: projList,
                monumentId: g.monument_id ?? null,
                roadmapId: g.roadmap_id ?? null,
                priorityCode: normalizedGoalPriorityCode,
                energyCode: normalizedGoalEnergyCode,
                weightBoost: g.weight_boost ?? 0,
                skills: Array.from(goalSkills),
                why: g.why || undefined,
                estimatedCompletionAt,
              };
              return decorateGoal(baseGoal, monumentEmojiLookup);
            });
            roadmapGoalsMap.set(roadmap.id, roadmapGoalsList);
          } catch (err) {
            console.error(
              `Error fetching goals for roadmap ${roadmap.id}:`,
              err
            );
            roadmapGoalsMap.set(roadmap.id, []);
          }
        }
        setRoadmapGoals(roadmapGoalsMap);

        setGoals(goalsWithoutRoadmap);
        setMonuments(monumentsData);
        setSkills(skillsData);
      } catch (err) {
        console.error("Error loading goals", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [decorateGoal]);

  const filteredGoals = useMemo(() => {
    let data = goals.filter((g) => {
      const term = search.toLowerCase();
      if (!term) return true;
      const goalMatch = g.title.toLowerCase().includes(term);
      const projectMatch = g.projects.some((p) =>
        p.name.toLowerCase().includes(term)
      );
      return goalMatch || projectMatch;
    });
    if (energy !== "All") {
      data = data.filter((g) => g.energy === energy);
    }
    if (priority !== "All") {
      data = data.filter((g) => {
        const code = g.priorityCode?.toUpperCase() ?? "NO";
        return code === priority;
      });
    }
    if (monument !== "All") {
      data = data.filter((g) => g.monumentId === monument);
    }
    if (skill !== "All") {
      data = data.filter((g) => g.skills?.includes(skill));
    }
    const sorted = [...data];
    const primarySort = (a: Goal, b: Goal) => (b.weight ?? 0) - (a.weight ?? 0);
    sorted.sort((a, b) => {
      const weightDelta = primarySort(a, b);
      if (weightDelta !== 0) return weightDelta;
      switch (sort) {
        case "A→Z":
          return a.title.localeCompare(b.title);
        case "Due Soon": {
          const ad = a.dueDate ? Date.parse(a.dueDate) : Infinity;
          const bd = b.dueDate ? Date.parse(b.dueDate) : Infinity;
          return ad - bd;
        }
        case "Progress":
          return b.progress - a.progress;
        case "Recently Updated":
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        case "Weight":
        default:
          return 0;
      }
    });
    return sorted;
  }, [goals, search, energy, priority, monument, skill, sort]);

  const goalStats = useMemo(() => {
    if (goals.length === 0) {
      return { total: 0, active: 0, completed: 0, momentum: 0, xp: 0 };
    }
    const total = goals.length;
    const active = goals.filter((g) => g.status === "Active").length;
    const completed = goals.filter((g) => g.status === "Completed").length;
    const momentum = Math.round(
      goals.reduce((sum, g) => sum + g.progress, 0) / total
    );
    const xp = goals.reduce(
      (sum, goal) => sum + goal.progress + goal.projects.length * 20,
      0
    );
    return { total, active, completed, momentum, xp };
  }, [goals]);

  useEffect(() => {
    setVisibleGoalCount(GOAL_BATCH_SIZE);
  }, [search, energy, priority, monument, skill, sort]);

  const visibleGoals = useMemo(
    () => filteredGoals.slice(0, visibleGoalCount),
    [filteredGoals, visibleGoalCount]
  );

  const handleBoost = async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const newBoost = (goal.weightBoost ?? 0) + 250;
    const updatedGoal = decorateGoal(
      {
        ...goal,
        weightBoost: newBoost,
      },
      undefined
    );
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? updatedGoal : g)));
    await supabase
      .from("goals")
      .update({ weight_boost: newBoost, weight: updatedGoal.weight })
      .eq("id", goal.id);
  };

  const addGoal = async (_goal: Goal, _context: GoalUpdateContext) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      // Optimistic local add if Supabase client is unavailable
      setGoals((g) => [decorateGoal(_goal), ...g]);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Not authenticated; keep optimistic state
        setGoals((g) => [decorateGoal(_goal), ...g]);
        return;
      }

      // Use monument emoji if goal doesn't have one
      let goalEmoji = _goal.emoji;
      if (!goalEmoji && _goal.monumentId) {
        goalEmoji = getMonumentEmoji(_goal.monumentId);
      }

      // Insert the goal first
      const priorityDb = priorityToDbValue(_goal.priority);
      const energyDb = energyToDbValue(_goal.energy);
      const statusDb =
        _goal.status === "Completed"
          ? "COMPLETED"
          : _goal.status === "Overdue"
          ? "OVERDUE"
          : _goal.status === "Inactive"
          ? "INACTIVE"
          : "ACTIVE";

      const performInsert = (includeCodeColumns: boolean) =>
        supabase
          .from("goals")
          .insert({
            user_id: user.id,
            name: _goal.title.trim(),
            priority: priorityDb,
            energy: energyDb,
            active: _goal.active,
            status: statusDb,
            why: _goal.why ?? null,
            monument_id: _goal.monumentId || null,
            roadmap_id: _goal.roadmapId || null,
            due_date: _goal.dueDate ?? null,
            emoji: goalEmoji || undefined,
            ...(includeCodeColumns
              ? {
                  priority_code: priorityDb,
                  energy_code: energyDb,
                }
              : {}),
          })
          .select(
            "id, created_at, weight, weight_boost, monument_id, roadmap_id, due_date"
          )
          .single();

      let insertResult = await performInsert(true);
      if (
        insertResult.error &&
        isGoalCodeColumnMissingError(insertResult.error)
      ) {
        console.warn(
          "Goal code columns missing during insert, retrying without them."
        );
        insertResult = await performInsert(false);
      }

      const { data: inserted, error: insertErr } = insertResult;

      if (insertErr || !inserted) {
        console.error("Error inserting goal:", insertErr);
        // Fallback to local state to avoid user losing input
        setGoals((g) => [decorateGoal(_goal), ...g]);
        return;
      }

      const newGoalId = inserted.id;

      // If there are any projects/tasks in context, sync them now
      if (_context) {
        await syncProjectsAndTasks(supabase, user.id, newGoalId, _context);
      }

      // Reflect the saved goal in local state with the server id
      const saved: Goal = decorateGoal({
        ..._goal,
        id: newGoalId,
        createdAt: inserted.created_at ?? _goal.createdAt,
        monumentId: inserted.monument_id ?? _goal.monumentId ?? null,
        roadmapId: inserted.roadmap_id ?? _goal.roadmapId ?? null,
        dueDate: inserted.due_date ?? _goal.dueDate,
        weight: inserted.weight ?? _goal.weight,
        weightBoost: inserted.weight_boost ?? _goal.weightBoost,
      });
      setGoals((g) => [saved, ...g]);
    } catch (err) {
      console.error("Unexpected error creating goal:", err);
      // Keep optimistic add to avoid losing user input
      setGoals((g) => [decorateGoal(_goal), ...g]);
    }
  };

  const updateGoal = (goal: Goal) =>
    setGoals((gs) =>
      gs.map((g) => (g.id === goal.id ? decorateGoal(goal) : g))
    );

  const handleEdit = (goal: Goal) => {
    setEditing(goal);
    setDrawer(true);
    router.push(`/goals?edit=${goal.id}`);
  };

  const handleToggleActive = async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const nextActive = !goal.active;
    const status: Goal["status"] = nextActive ? "Active" : "Inactive";
    await supabase
      .from("goals")
      .update({ active: nextActive, status })
      .eq("id", goal.id);
    updateGoal({ ...goal, active: nextActive, status });
  };

  const handleDelete = async (goal: Goal) => {
    if (!userId) return;

    const shouldProceed =
      typeof window === "undefined" ||
      window.confirm(
        "Deleting this goal will also delete any related projects and tasks. Are you sure?"
      );

    if (!shouldProceed) {
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    try {
      const { data: projectRows, error: projectFetchError } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("goal_id", goal.id);

      if (projectFetchError) {
        throw projectFetchError;
      }

      const projectIds = projectRows?.map((project) => project.id) ?? [];

      if (projectIds.length > 0) {
        const { error: deleteTasksError } = await supabase
          .from("tasks")
          .delete()
          .eq("user_id", userId)
          .in("project_id", projectIds);

        if (deleteTasksError) {
          throw deleteTasksError;
        }

        const { error: deleteProjectSkillsError } = await supabase
          .from("project_skills")
          .delete()
          .in("project_id", projectIds);

        if (deleteProjectSkillsError) {
          throw deleteProjectSkillsError;
        }

        const { error: deleteProjectsError } = await supabase
          .from("projects")
          .delete()
          .in("id", projectIds);

        if (deleteProjectsError) {
          throw deleteProjectsError;
        }
      }

      const { error: deleteGoalError } = await supabase
        .from("goals")
        .delete()
        .eq("id", goal.id);

      if (deleteGoalError) {
        throw deleteGoalError;
      }

      setGoals((gs) => gs.filter((g) => g.id !== goal.id));

      if (editing?.id === goal.id) {
        setEditing(null);
        setDrawer(false);
        router.replace("/goals");
      }
    } catch (err) {
      console.error("Error deleting goal:", err);
    }
  };

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen overflow-hidden bg-[#05040b] text-white">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#12040b] via-[#080304] to-[#010000]" />
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-rose-600/35 blur-[200px]" />
          <div className="absolute bottom-0 right-0 h-[460px] w-[460px] translate-x-1/4 rounded-full bg-red-500/25 blur-[220px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,80,80,0.12),_transparent_55%)] opacity-60" />
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
          <GoalsHeader stats={goalStats} onCreate={() => setDrawer(true)} />
          <GoalsUtilityBar
            search={search}
            onSearch={setSearch}
            energy={energy}
            onEnergy={setEnergy}
            priority={priority}
            onPriority={setPriority}
            sort={sort}
            onSort={setSort}
            monuments={monuments}
            monument={monument}
            onMonument={setMonument}
            skills={skills}
            skill={skill}
            onSkill={setSkill}
          />
          {loading ? (
            <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
              <LoadingSkeleton />
            </div>
          ) : filteredGoals.length === 0 && roadmaps.length === 0 ? (
            <div className="rounded-[32px] border border-dashed border-white/20 bg-white/[0.02] p-10 text-center backdrop-blur">
              <EmptyState onCreate={() => setDrawer(true)} />
            </div>
          ) : (
            <div className="relative">
              {(visibleGoals.length > 0 || roadmaps.length > 0) && (
                <div className="pointer-events-none absolute -top-8 right-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/60 sm:hidden">
                  Swipe to browse
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}
              <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-6 overflow-x-auto pb-6 snap-x snap-mandatory sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible sm:pb-0 sm:snap-none xl:grid-cols-3">
                {roadmaps.map((roadmap) => {
                  const roadmapGoalsList = roadmapGoals.get(roadmap.id) ?? [];
                  return (
                    <div
                      key={roadmap.id}
                      className="relative h-full snap-center sm:[scroll-snap-align:unset] mb-[22px] overflow-visible"
                    >
                      <RoadmapCard
                        roadmap={roadmap}
                        goalCount={roadmapGoalsList.length}
                        goals={roadmapGoalsList}
                        onClick={() => {
                          setSelectedRoadmap(roadmap);
                          setRoadmapDrawer(true);
                        }}
                      />
                    </div>
                  );
                })}
                {visibleGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="relative h-full snap-center sm:[scroll-snap-align:unset] mb-[22px] overflow-visible"
                  >
                    <GoalCard
                      goal={goal}
                      onEdit={() => handleEdit(goal)}
                      onToggleActive={() => handleToggleActive(goal)}
                      onDelete={() => handleDelete(goal)}
                      onBoost={() => handleBoost(goal)}
                      onProjectUpdated={(projectId, updates) =>
                        handleProjectUpdated(goal.id, projectId, updates)
                      }
                      onProjectDeleted={(projectId) =>
                        handleProjectDeleted(goal.id, projectId)
                      }
                    />
                  </div>
                ))}
              </div>
              {filteredGoals.length > visibleGoalCount && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleGoalCount((prev) =>
                        Math.min(filteredGoals.length, prev + GOAL_BATCH_SIZE)
                      )
                    }
                    className="rounded-full border border-white/20 bg-white/[0.05] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/40 hover:bg-white/[0.08]"
                  >
                    See more goals
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <GoalDrawer
          open={drawer}
          onClose={() => {
            setDrawer(false);
            setEditing(null);
            router.replace("/goals");
          }}
          onAdd={addGoal}
          initialGoal={editing}
          monuments={monuments}
          onUpdate={async (goal, context) => {
            const supabase = getSupabaseBrowser();
            if (supabase) {
              try {
                await persistGoalUpdate({
                  supabase,
                  goal,
                  context,
                  userId,
                  onUserResolved: setUserId,
                });
              } catch (err) {
                console.error("Unexpected error updating goal:", err);
              }
            }
            updateGoal(goal);
          }}
          onDelete={handleDelete}
        />
        <RoadmapDrawer
          open={roadmapDrawer}
          onClose={() => {
            setRoadmapDrawer(false);
            setSelectedRoadmap(null);
          }}
          roadmap={selectedRoadmap}
          goals={
            selectedRoadmap ? roadmapGoals.get(selectedRoadmap.id) ?? [] : []
          }
          onGoalEdit={(goal) => {
            setEditing(goal);
            setDrawer(true);
            setRoadmapDrawer(false);
            router.push(`/goals?edit=${goal.id}`);
          }}
          onGoalToggleActive={handleToggleActive}
          onGoalDelete={handleDelete}
          onProjectUpdated={handleProjectUpdated}
          onProjectDeleted={handleProjectDeleted}
        />
      </div>
    </ProtectedRoute>
  );
}
