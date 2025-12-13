import type { SupabaseClient } from "@supabase/supabase-js";
import type { Goal, Project } from "@/app/(app)/goals/types";
import type { GoalUpdateContext } from "@/app/(app)/goals/components/GoalDrawer";

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

const GOAL_CODE_COLUMN_TOKENS = ["priority_code", "energy_code"];
const PG_COLUMN_MISSING_CODE = "42703";

export function isGoalCodeColumnMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cast = error as { message?: string; code?: string };
  const message = typeof cast.message === "string" ? cast.message.toLowerCase() : "";
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
    const { error } = await supabase.from("projects").delete().in("id", uniqueProjectIds);
    if (error) {
      console.error("Error deleting projects:", error);
    }
  }

  const uniqueTaskIds = Array.from(new Set(removedTaskIds));
  if (uniqueTaskIds.length > 0) {
    const { error } = await supabase.from("tasks").delete().in("id", uniqueTaskIds);
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
            stage: normalizeStage(project.stage, project.status),
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

  await Promise.all(
    projects.map(async (project) => {
      const projectId = project.id;
      const projectTasks = (project.tasks ?? []).filter((task) => task.name.trim().length > 0);

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
  };

  const buildEnumPayload = (includeCodeColumns: boolean) => {
    const payload: Record<string, unknown> = {
      ...sharedFields,
      priority: priorityDb,
      energy: energyDb,
    };
    if (includeCodeColumns) {
      payload.priority_code = priorityDb;
      payload.energy_code = energyDb;
    }
    return payload;
  };

  const attemptUpdate = (payload: Record<string, unknown>) =>
    supabase.from("goals").update(payload).eq("id", goal.id);

  let { error } = await attemptUpdate(buildEnumPayload(true));
  if (error && isGoalCodeColumnMissingError(error)) {
    console.warn("Goal code columns missing during update, retrying without them.");
    ({ error } = await attemptUpdate(buildEnumPayload(false)));
  }

  if (error) {
    console.error("Error updating goal:", error);
    throw error;
  }

  if (!context) {
    return;
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
    await syncProjectsAndTasks(supabase, ownerId, goal.id, context);
  }
}
