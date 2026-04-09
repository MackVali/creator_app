import type { SupabaseClient } from "@supabase/supabase-js";
import type { Goal, Project } from "@/app/(app)/goals/types";
import type { GoalUpdateContext } from "@/app/(app)/goals/components/GoalDrawer";
import { ensureGoalRoadmapPriorityRank } from "@/lib/goals/roadmapPriority";

export const LIMIT_ERROR_CODES = [
  "GOAL_LIMIT_REACHED",
  "PROJECT_LIMIT_REACHED",
  "PROJECTS_PER_GOAL_LIMIT_REACHED",
  "TASK_LIMIT_REACHED",
  "HABIT_LIMIT_REACHED",
  "DAY_TYPE_LIMIT_REACHED",
  "TIME_BLOCK_LIMIT_REACHED",
  "SKILL_LIMIT_REACHED",
  "MONUMENT_LIMIT_REACHED",
] as const;
export type LimitErrorCode = (typeof LIMIT_ERROR_CODES)[number];

export class LimitReachedError extends Error {
  public readonly originalError: unknown;

  constructor(public readonly limitCode: LimitErrorCode, originalError: unknown) {
    super(`Limit reached: ${limitCode}`);
    this.name = "LimitReachedError";
    this.originalError = originalError;
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

export function getLimitCodeFromError(error: unknown): LimitErrorCode | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const message =
    typeof (error as { message?: string }).message === "string"
      ? (error as { message?: string }).message
      : "";
  if (!message) {
    return null;
  }
  return (
    LIMIT_ERROR_CODES.find((code) => message.includes(code)) ?? null
  );
}

const STATUS_TO_DB: Record<Goal["status"], string> = {
  Active: "ACTIVE",
  Completed: "COMPLETED",
  Overdue: "OVERDUE",
  Inactive: "INACTIVE",
};

const PRIORITY_TO_DB: Record<Goal["priority"], string> = {
  No: "NO",
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "CRITICAL",
  "Ultra-Critical": "ULTRA-CRITICAL",
};

const energyToDbValue = (energy: Goal["energy"]): string => {
  switch (energy) {
    case "Low":
      return "LOW";
    case "Medium":
      return "MEDIUM";
    case "High":
      return "HIGH";
    case "Ultra":
      return "ULTRA";
    case "Extreme":
      return "EXTREME";
    default:
      return "NO";
  }
};

const projectStatusToStage = (status: Project["status"]): string => {
  switch (status) {
    case "Todo":
      return "RESEARCH";
    case "Done":
      return "RELEASE";
    default:
      return "BUILD";
  }
};

const normalizeStage = (stage?: string | null, status?: Project["status"]) => {
  if (stage) return stage;
  return projectStatusToStage(status ?? "In-Progress");
};

const collectProjectSkillIds = (project: Project) => {
  const rawSkillIds = Array.isArray(project.skillIds) ? project.skillIds : [];
  return Array.from(
    new Set(
      rawSkillIds
        .filter((skillId): skillId is string => typeof skillId === "string")
        .map((skillId) => skillId.trim())
        .filter((skillId) => skillId.length > 0)
    )
  );
};

const GOAL_CODE_COLUMN_TOKENS = ["priority_code", "energy_code"];
const PG_COLUMN_MISSING_CODE = "42703";

const PROJECT_PRIORITY_STRENGTH: Record<string, number> = {
  "ULTRA-CRITICAL": 5,
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NO: 0,
};

const PROJECT_STAGE_STRENGTH: Record<string, number> = {
  RESEARCH: 5,
  TEST: 4,
  REFINE: 3,
  BUILD: 2,
  RELEASE: 1,
};

function normalizeFiniteRank(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function getPriorityStrength(value?: string | null): number {
  if (typeof value !== "string") return 0;
  const normalized = value.trim().toUpperCase();
  return PROJECT_PRIORITY_STRENGTH[normalized] ?? 0;
}

function getStageStrength(value?: string | null): number {
  if (typeof value !== "string") return 0;
  const normalized = value.trim().toUpperCase();
  return PROJECT_STAGE_STRENGTH[normalized] ?? 0;
}

export function isGoalCodeColumnMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cast = error as { message?: string; code?: string };
  const message =
    typeof cast.message === "string" ? cast.message.toLowerCase() : "";
  if (!message && !cast.code) return false;
  if (cast.code && cast.code !== PG_COLUMN_MISSING_CODE) return false;
  if (message.length === 0 && cast.code !== PG_COLUMN_MISSING_CODE) {
    return false;
  }
  return GOAL_CODE_COLUMN_TOKENS.some((token) => message.includes(token));
}

async function syncProjectsAndTasks(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  context: GoalUpdateContext
) {
  const { projects, removedProjectIds, removedTaskIds } = context;

  const uniqueProjectIds = Array.from(new Set(removedProjectIds));
  if (uniqueProjectIds.length > 0) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .in("id", uniqueProjectIds);
    if (error) {
      console.error("Error deleting projects:", error);
    }
  }

  const uniqueTaskIds = Array.from(new Set(removedTaskIds));
  if (uniqueTaskIds.length > 0) {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .in("id", uniqueTaskIds);
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
        stage: normalizeStage(project.stage, project.status),
        energy: project.energyCode ?? energyToDbValue(project.energy),
        priority: project.priorityCode ?? "NO",
        due_date: project.dueDate ?? null,
      }))
    );
    if (error) {
      const limitCode = getLimitCodeFromError(error);
      if (limitCode) {
        throw new LimitReachedError(limitCode, error);
      }
      console.error("Error inserting projects:", error);
      throw error;
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
            stage: normalizeStage(project.stage, project.status),
            energy: project.energyCode ?? energyToDbValue(project.energy),
            priority: project.priorityCode ?? "NO",
            due_date: project.dueDate ?? null,
          })
          .eq("id", project.id);
        if (error) {
          console.error("Error updating project:", error);
          throw error;
        }
      })
    );
  }

  await Promise.all(
    projects.map(async (project) => {
      const projectId = project.id;
      const projectSkillIds = collectProjectSkillIds(project);
      const projectWasNew = project.isNew;
      const { error: deleteSkillError } = await supabase
        .from("project_skills")
        .delete()
        .eq("project_id", projectId);
      if (deleteSkillError) {
        console.error("Error deleting project skills:", deleteSkillError);
      } else if (projectSkillIds.length > 0) {
        const { error: insertSkillError } = await supabase
          .from("project_skills")
          .insert(
            projectSkillIds.map((skillId) => ({
              project_id: projectId,
              skill_id: skillId,
            }))
          );
        if (insertSkillError) {
          console.error("Error inserting project skills:", {
            projectId,
            projectSkillIds,
            projectWasNew,
            error: insertSkillError,
            message:
              typeof insertSkillError === "object" &&
              insertSkillError !== null &&
              "message" in insertSkillError
                ? (insertSkillError as { message?: unknown }).message
                : undefined,
            details:
              typeof insertSkillError === "object" &&
              insertSkillError !== null &&
              "details" in insertSkillError
                ? (insertSkillError as { details?: unknown }).details
                : undefined,
            code:
              typeof insertSkillError === "object" &&
              insertSkillError !== null &&
              "code" in insertSkillError
                ? (insertSkillError as { code?: unknown }).code
                : undefined,
          });
        }
      }

      const projectTasks = (project.tasks ?? []).filter(
        (task) => task.name.trim().length > 0
      );

      const newTasks = projectTasks.filter((task) => task.isNew);
      if (newTasks.length > 0) {
        const { error } = await supabase.from("tasks").insert(
          newTasks.map((task) => ({
            id: task.id,
            name: task.name.trim(),
            project_id: projectId,
            user_id: userId,
            stage: task.stage,
            skill_id: task.skillId ?? null,
          }))
        );
        if (error) {
          const limitCode = getLimitCodeFromError(error);
          if (limitCode) {
            throw new LimitReachedError(limitCode, error);
          }
          console.error("Error inserting tasks:", error);
        }
      }

      const existingTasks = projectTasks.filter((task) => !task.isNew);
      if (existingTasks.length > 0) {
        await Promise.all(
          existingTasks.map(async (task) => {
            const trimmedName = task.name.trim();
            if (trimmedName.length === 0) return;
            const { error } = await supabase
              .from("tasks")
              .update({
                name: trimmedName,
                stage: task.stage,
                skill_id: task.skillId ?? null,
              })
              .eq("id", task.id);
            if (error) {
              console.error("Error updating task:", error);
            }
          })
        );
      }
    })
  );
}

async function persistProjectGlobalRanks(
  supabase: SupabaseClient,
  userId: string
) {
  const [{ data: goalRows, error: goalError }, { data: projectRows, error: projectError }] =
    await Promise.all([
      supabase.from("goals").select("id, global_rank").eq("user_id", userId),
      supabase
        .from("projects")
        .select("id, goal_id, priority, stage")
        .eq("user_id", userId)
        .is("completed_at", null),
    ]);

  if (goalError) {
    throw goalError;
  }
  if (projectError) {
    throw projectError;
  }

  const goalRankById = new Map<string, number>();
  for (const goal of goalRows ?? []) {
    if (!goal?.id) continue;
    const goalRank = normalizeFiniteRank(goal.global_rank);
    if (goalRank !== null) {
      goalRankById.set(goal.id, goalRank);
    }
  }

  const projectRankRecords: Array<{
    id: string;
    goalGlobalRank: number | null;
    priorityStrength: number;
    stageStrength: number;
  }> = [];

  for (const project of projectRows ?? []) {
    if (!project?.id) continue;

    const goalGlobalRank =
      project.goal_id && goalRankById.has(project.goal_id)
        ? goalRankById.get(project.goal_id) ?? null
        : null;

    projectRankRecords.push({
      id: project.id,
      goalGlobalRank,
      priorityStrength: getPriorityStrength(project.priority),
      stageStrength: getStageStrength(project.stage),
    });
  }

  projectRankRecords.sort((a, b) => {
    const aGoalRank = a.goalGlobalRank ?? Number.POSITIVE_INFINITY;
    const bGoalRank = b.goalGlobalRank ?? Number.POSITIVE_INFINITY;
    if (aGoalRank !== bGoalRank) {
      return aGoalRank - bGoalRank;
    }
    if (a.stageStrength !== b.stageStrength) {
      return b.stageStrength - a.stageStrength;
    }
    if (a.priorityStrength !== b.priorityStrength) {
      return b.priorityStrength - a.priorityStrength;
    }
    return a.id.localeCompare(b.id);
  });

  for (let index = 0; index < projectRankRecords.length; index += 1) {
    const { id } = projectRankRecords[index];
    const rank = index + 1;
    const { error } = await supabase
      .from("projects")
      .update({ global_rank: rank })
      .eq("id", id);
    if (error) {
      throw error;
    }
  }
}

interface PersistGoalOptions {
  supabase: SupabaseClient;
  goal: Goal;
  context?: GoalUpdateContext;
  userId?: string | null;
  onUserResolved?: (userId: string) => void;
}

export async function persistGoalUpdate({
  supabase,
  goal,
  context,
  userId,
  onUserResolved,
}: PersistGoalOptions) {
  const { data: existingGoalRow } = await supabase
    .from("goals")
    .select("roadmap_id, priority_rank")
    .eq("id", goal.id)
    .maybeSingle();

  const previousRoadmapId =
    typeof existingGoalRow?.roadmap_id === "string"
      ? existingGoalRow.roadmap_id
      : null;
  const previousPriorityRank =
    typeof existingGoalRow?.priority_rank === "number" &&
    Number.isFinite(existingGoalRow.priority_rank) &&
    existingGoalRow.priority_rank > 0
      ? existingGoalRow.priority_rank
      : null;

  const priorityDb = PRIORITY_TO_DB[goal.priority] ?? "LOW";
  const energyDb = energyToDbValue(goal.energy);

  const sharedFields = {
    name: goal.title,
    active: goal.active,
    status: STATUS_TO_DB[goal.status] ?? "ACTIVE",
    why: goal.why ?? null,
    monument_id: goal.monumentId || null,
    roadmap_id: goal.roadmapId || null,
    due_date: goal.dueDate ?? null,
    emoji: goal.emoji ?? null,
  };

  const buildEnumPayload = (includeCodeColumns: boolean) => {
    const payload: Record<string, unknown> = {
      ...sharedFields,
    };
    if (includeCodeColumns) {
      payload.priority_code = priorityDb;
      payload.energy_code = energyDb;
    } else {
      payload.priority = priorityDb;
      payload.energy = energyDb;
    }
    return payload;
  };

  const attemptUpdate = (payload: Record<string, unknown>) =>
    supabase.from("goals").update(payload).eq("id", goal.id);

  let { error } = await attemptUpdate(buildEnumPayload(true));
  if (error && isGoalCodeColumnMissingError(error)) {
    console.warn(
      "Goal code columns missing during update, retrying without them."
    );
    ({ error } = await attemptUpdate(buildEnumPayload(false)));
  }

  if (error) {
    console.error("Error updating goal:", error);
    throw error;
  }

  const hasValidIncomingPriorityRank =
    typeof goal.priorityRank === "number" &&
    Number.isFinite(goal.priorityRank) &&
    goal.priorityRank > 0;

  if (
    goal.roadmapId &&
    (previousRoadmapId !== goal.roadmapId ||
      !hasValidIncomingPriorityRank ||
      !previousPriorityRank)
  ) {
    await ensureGoalRoadmapPriorityRank({
      supabase,
      goalId: goal.id,
      roadmapId: goal.roadmapId,
    });
  }

  const { error: rankError } = await supabase.rpc("recalculate_goal_global_rank");
  if (rankError) {
    console.error("Error recalculating goal global rank:", rankError);
    throw rankError;
  }

  let ownerId = userId;
  if (!ownerId) {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error("Error fetching user for goal sync:", authError);
    }
    ownerId = data.user?.id ?? null;
    if (ownerId && onUserResolved) {
      onUserResolved(ownerId);
    }
  }

  if (ownerId) {
    if (context) {
      await syncProjectsAndTasks(supabase, ownerId, goal.id, context);
    }
    await persistProjectGlobalRanks(supabase, ownerId);
  }
}
