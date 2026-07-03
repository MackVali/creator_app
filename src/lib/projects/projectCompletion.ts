import { getSupabaseBrowser } from "@/lib/supabase";
import {
  completePendingProjectInstances,
  updateInstanceStatus,
} from "@/lib/scheduler/instanceRepo";
import {
  resolveCreatorXpSurgeTitle,
  type CreatorXpSurgeTitleParts,
} from "@/components/xp/CreatorXpSurgeHud";
import { dispatchCreatorXpRewardVisual } from "@/lib/effects/creatorXpRewardVisual";
import type {
  CreatorXpBurstRect,
  CreatorXpBurstSourceOrigin,
} from "@/lib/effects/creatorXpBurstBus";

const PROJECT_XP_AMOUNT = 3;

export interface ProjectCompletionContext {
  projectId: string;
  projectSkillIds?: string[] | null;
  taskSkillIds?: Array<string | null | undefined>;
  xpSurge?: CreatorXpSurgeTitleParts & {
    sourceIcon?: string | null;
    displayXp?: number | null;
  };
  xpSourceRect?: CreatorXpBurstRect | DOMRect | null;
  xpSourceOrigin?: CreatorXpBurstSourceOrigin;
}

export type ProjectCompletionAction = "complete" | "undo";

type ProjectXpAwardResponse = {
  success?: boolean;
  deduped?: boolean;
  inserted?: number;
  surge?: {
    title?: string | null;
    sourceIcon?: string | null;
    displayXp?: number | null;
    currentLevel?: number | null;
  } | null;
  awardKeyBase?: string | null;
};

export type ProjectCompletionResult = {
  ok: boolean;
  completedAt: string | null;
  scheduleInstanceId: string | null;
  didAwardXp: boolean;
  didDispatchVisual: boolean;
  inserted: number;
};

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
  supabase: ReturnType<typeof getSupabaseBrowser>,
  completedAtOverride?: string | null
): Promise<string | null> {
  const instance = await findProjectInstance(projectId, supabase);
  if (!instance) {
    return null;
  }

  const targetStatus = action === "complete" ? "completed" : "scheduled";
  const options =
    action === "complete"
      ? {
          completedAtUTC: completedAtOverride ?? new Date().toISOString(),
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

async function updateProjectCompletionFlag(
  projectId: string,
  action: ProjectCompletionAction,
  supabase: ReturnType<typeof getSupabaseBrowser>,
  completedAtOverride?: string | null
) {
  const timestamp = new Date().toISOString();
  const completedAt =
    action === "complete" ? completedAtOverride ?? timestamp : null;

  try {
    const { error } = await supabase
      .from("projects")
      .update({
        completed_at: completedAt,
        updated_at: timestamp,
      })
      .eq("id", projectId);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Failed to persist project completion flag", error);
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

async function fetchProjectDurationMinutes(
  projectId: string,
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("duration_min, effective_duration_min")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const effectiveDuration = Number(
      (data as { effective_duration_min?: number | null } | null)
        ?.effective_duration_min ?? Number.NaN
    );
    if (Number.isFinite(effectiveDuration) && effectiveDuration >= 0) {
      return Math.round(effectiveDuration);
    }

    const duration = Number(
      (data as { duration_min?: number | null } | null)?.duration_min ??
        Number.NaN
    );
    return Number.isFinite(duration) && duration >= 0
      ? Math.round(duration)
      : null;
  } catch (error) {
    console.error("Failed to resolve project completion duration", error);
    return null;
  }
}

function buildAwardKeyBase(
  projectId: string,
  scheduleInstanceId: string | null
) {
  if (scheduleInstanceId) {
    return `sched:${scheduleInstanceId}:project`;
  }
  return `project:${projectId}:project`;
}

async function awardProjectXp(
  projectId: string,
  skillIds: string[],
  monumentIds: string[],
  scheduleInstanceId: string | null,
  action: ProjectCompletionAction,
  completedAt: string | null,
  durationMin: number | null
): Promise<ProjectXpAwardResponse | null> {
  const awardKeyBase = buildAwardKeyBase(projectId, scheduleInstanceId);

  const body: Record<string, unknown> = {
    kind: "project",
    amount: PROJECT_XP_AMOUNT,
    awardKeyBase,
    reversible: {
      occurrenceStem: awardKeyBase,
    },
    completion: {
      action,
      sourceType: "PROJECT",
      sourceId: projectId,
      completedAt: completedAt ?? new Date().toISOString(),
      scheduleInstanceId: scheduleInstanceId ?? undefined,
      wasScheduled: Boolean(scheduleInstanceId),
      durationMin,
    },
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
      return null;
    }
    return (await response.json().catch(() => null)) as ProjectXpAwardResponse | null;
  } catch (error) {
    console.error("Failed to award XP for project completion", error);
    return null;
  }
}

async function reverseProjectXp(
  projectId: string,
  scheduleInstanceId: string | null
): Promise<boolean> {
  const occurrenceStem = buildAwardKeyBase(projectId, scheduleInstanceId);

  try {
    const response = await fetch("/api/xp/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occurrenceStem,
        legacyOccurrenceStems: [`project:${projectId}:project`],
      }),
    });

    if (!response.ok) {
      console.error("Failed to reverse project completion XP", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to reverse project completion XP", error);
    return false;
  }
}

export async function recordProjectCompletion(
  context: ProjectCompletionContext,
  action: ProjectCompletionAction = "complete"
): Promise<ProjectCompletionResult> {
  const failedResult: ProjectCompletionResult = {
    ok: false,
    completedAt: null,
    scheduleInstanceId: null,
    didAwardXp: false,
    didDispatchVisual: false,
    inserted: 0,
  };

  if (!context.projectId) {
    return failedResult;
  }

  const supabase = getSupabaseBrowser();
  if (!supabase) {
    console.warn("Supabase client not available for project completion");
    return failedResult;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    console.warn("Unable to determine user for project completion:", authError);
    return failedResult;
  }

  const userId = authData.user.id;
  const completionTimestamp = action === "complete" ? new Date().toISOString() : null;
  const skillIds = collectUniqueSkillIds(context.projectSkillIds, context.taskSkillIds);
  const durationMin = await fetchProjectDurationMinutes(
    context.projectId,
    userId,
    supabase
  );
  const scheduleInstanceId = await updateProjectInstanceStatus(
    context.projectId,
    action,
    supabase,
    completionTimestamp
  );
  if (action === "complete") {
    const { error } = await completePendingProjectInstances(
      context.projectId,
      {
        completedAtUTC: completionTimestamp ?? undefined,
        skipInstanceIds: scheduleInstanceId ? [scheduleInstanceId] : undefined,
      },
      supabase
    );
    if (error) {
      console.error("Failed to sync project schedule instances after completion", error);
    }
  }
  await updateProjectCompletionFlag(context.projectId, action, supabase, completionTimestamp);
  const monumentIds = await fetchMonumentIdsForSkills(userId, skillIds, supabase);

  if (action === "undo") {
    const didReverseXp = await reverseProjectXp(context.projectId, scheduleInstanceId);
    return {
      ok: didReverseXp,
      completedAt: null,
      scheduleInstanceId,
      didAwardXp: false,
      didDispatchVisual: false,
      inserted: 0,
    };
  }

  const awardPayload = await awardProjectXp(
    context.projectId,
    skillIds,
    monumentIds,
    scheduleInstanceId,
    action,
    completionTimestamp,
    durationMin
  );
  const inserted = awardPayload?.inserted ?? 0;
  const didAwardXp = Boolean(
    awardPayload?.success &&
      !awardPayload.deduped &&
      inserted > 0 &&
      awardPayload.surge
  );
  if (didAwardXp) {
    dispatchCreatorXpRewardVisual({
      surge: {
        sourceType: "PROJECT",
        title:
          awardPayload?.surge?.title ??
          resolveCreatorXpSurgeTitle(context.xpSurge ?? {}),
        sourceIcon:
          awardPayload?.surge?.sourceIcon ?? context.xpSurge?.sourceIcon ?? null,
        displayXp:
          awardPayload?.surge?.displayXp ??
          context.xpSurge?.displayXp ??
          PROJECT_XP_AMOUNT,
        currentLevel: awardPayload?.surge?.currentLevel ?? null,
        progressFrom: 18,
        progressTo: 78,
      },
      sourceRect: context.xpSourceRect,
      sourceOrigin: context.xpSourceOrigin,
      amount:
        awardPayload?.surge?.displayXp ??
        context.xpSurge?.displayXp ??
        PROJECT_XP_AMOUNT,
      kind: "project_complete",
      burstId: `project:${context.projectId}:${completionTimestamp ?? "completed"}`,
    });
  }

  return {
    ok: didAwardXp,
    completedAt: completionTimestamp,
    scheduleInstanceId,
    didAwardXp,
    didDispatchVisual: didAwardXp,
    inserted,
  };
}
