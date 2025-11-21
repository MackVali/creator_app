import { getSupabaseBrowser } from "@/lib/supabase";
import { updateInstanceStatus } from "@/lib/scheduler/instanceRepo";

const PROJECT_XP_AMOUNT = 3;

export interface ProjectCompletionContext {
  projectId: string;
  projectSkillIds?: string[] | null;
  taskSkillIds?: Array<string | null | undefined>;
}

export type ProjectCompletionAction = "complete" | "undo";

function collectUniqueSkillIds(
  projectSkillIds?: string[] | null,
  taskSkillIds?: Array<string | null | undefined>
): string[] {
  const unique = new Set<string>();

  for (const skillId of projectSkillIds ?? []) {
    if (typeof skillId === "string" && skillId.trim().length > 0) {
      unique.add(skillId);
    }
  }

  for (const skillId of taskSkillIds ?? []) {
    if (typeof skillId === "string" && skillId.trim().length > 0) {
      unique.add(skillId);
    }
  }

  return Array.from(unique);
}

async function findProjectInstance(
  projectId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>
): Promise<{ id: string; status: string } | null> {
  try {
    const { data } = await supabase
      .from("schedule_instances")
      .select("id,status")
      .eq("source_type", "PROJECT")
      .eq("source_id", projectId)
      .in("status", ["scheduled", "completed", "missed"])
      .order("start_utc", { ascending: false })
      .limit(1);

    const instance = (data ?? [])[0];
    if (!instance?.id) {
      return null;
    }

    return instance;
  } catch (error) {
    console.error("Failed to lookup project schedule instance", error);
    return null;
  }
}

async function updateProjectInstanceStatus(
  projectId: string,
  action: ProjectCompletionAction,
  supabase: ReturnType<typeof getSupabaseBrowser>
): Promise<string | null> {
  const instance = await findProjectInstance(projectId, supabase);
  if (!instance) {
    return null;
  }

  const targetStatus = action === "complete" ? "completed" : "scheduled";
  const options =
    action === "complete"
      ? {
          completedAtUTC: new Date().toISOString(),
        }
      : undefined;

  try {
    await updateInstanceStatus(
      instance.id,
      targetStatus,
      action === "complete" ? options : undefined,
      supabase
    );
    return instance.id;
  } catch (error) {
    console.error("Failed to update project schedule instance status", error);
    return instance.id;
  }
}

async function fetchMonumentIdsForSkills(
  userId: string,
  skillIds: string[],
  supabase: ReturnType<typeof getSupabaseBrowser>
): Promise<string[]> {
  if (skillIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("skills")
      .select("id, monument_id")
      .eq("user_id", userId)
      .in("id", skillIds);

    if (error) {
      throw error;
    }

    const monuments = (data ?? [])
      .map((skill) => skill.monument_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    return Array.from(new Set(monuments));
  } catch (error) {
    console.error("Failed to resolve monuments for project skills", error);
    return [];
  }
}

function buildAwardKeyBase(
  projectId: string,
  scheduleInstanceId: string | null,
  action: ProjectCompletionAction
) {
  const kind = action === "complete" ? "project" : "project:undo";
  if (scheduleInstanceId) {
    return `sched:${scheduleInstanceId}:${kind}`;
  }
  return `project:${projectId}:${kind}`;
}

async function awardProjectXp(
  projectId: string,
  skillIds: string[],
  monumentIds: string[],
  scheduleInstanceId: string | null,
  action: ProjectCompletionAction
) {
  const awardKeyBase = buildAwardKeyBase(projectId, scheduleInstanceId, action);

  const body: Record<string, unknown> = {
    kind: "project",
    amount: action === "complete" ? PROJECT_XP_AMOUNT : -PROJECT_XP_AMOUNT,
    awardKeyBase,
  };

  if (scheduleInstanceId) {
    body.scheduleInstanceId = scheduleInstanceId;
  }

  if (skillIds.length > 0) {
    body.skillIds = skillIds;
  }

  if (monumentIds.length > 0) {
    body.monumentIds = monumentIds;
  }

  try {
    const response = await fetch("/api/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error("Failed to award XP for project completion", await response.text());
    }
  } catch (error) {
    console.error("Failed to award XP for project completion", error);
  }
}

export async function recordProjectCompletion(
  context: ProjectCompletionContext,
  action: ProjectCompletionAction = "complete"
) {
  if (!context.projectId) {
    return;
  }

  const supabase = getSupabaseBrowser();
  if (!supabase) {
    console.warn("Supabase client not available for project completion");
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    console.warn("Unable to determine user for project completion:", authError);
    return;
  }

  const userId = authData.user.id;
  const skillIds = collectUniqueSkillIds(context.projectSkillIds, context.taskSkillIds);
  const scheduleInstanceId = await updateProjectInstanceStatus(
    context.projectId,
    action,
    supabase
  );
  const monumentIds = await fetchMonumentIdsForSkills(userId, skillIds, supabase);

  await awardProjectXp(context.projectId, skillIds, monumentIds, scheduleInstanceId, action);
}
