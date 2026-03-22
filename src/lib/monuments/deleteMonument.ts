import type { SupabaseClient } from "@supabase/supabase-js";

const UNCATEGORIZED_MONUMENT_TITLE = "Uncategorized";
const UNCATEGORIZED_MONUMENT_EMOJI = "📂";

type DeleteMonumentInput = {
  monumentId: string;
  userId: string;
  supabase: SupabaseClient;
};

type ReassignOrDisconnectInput = {
  supabase: SupabaseClient;
  table: string;
  userId: string;
  filterColumn: string;
  monumentId: string;
  targetColumn: string;
  uncategorizedId: string;
};

function isBigintCastError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "22P02" ||
    error.message?.includes("invalid input syntax for type bigint") ||
    false
  );
}

async function ensureUncategorizedMonument({
  monumentId,
  userId,
  supabase,
}: {
  monumentId: string;
  userId: string;
  supabase: SupabaseClient;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("monuments")
    .select("id")
    .eq("user_id", userId)
    .eq("title", UNCATEGORIZED_MONUMENT_TITLE)
    .neq("id", monumentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("monuments")
    .insert({
      user_id: userId,
      title: UNCATEGORIZED_MONUMENT_TITLE,
      emoji: UNCATEGORIZED_MONUMENT_EMOJI,
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message || "Failed to create Uncategorized monument");
  }

  return created.id;
}

async function reassignOrDisconnectMonumentReference({
  supabase,
  table,
  userId,
  filterColumn,
  monumentId,
  targetColumn,
  uncategorizedId,
}: ReassignOrDisconnectInput) {
  const reassignmentResult = await supabase
    .from(table)
    .update({ [targetColumn]: uncategorizedId })
    .eq("user_id", userId)
    .eq(filterColumn, monumentId);

  if (!reassignmentResult.error) {
    return;
  }

  if (!isBigintCastError(reassignmentResult.error)) {
    throw new Error(`${table} reassignment failed: ${reassignmentResult.error.message}`);
  }

  const disconnectResult = await supabase
    .from(table)
    .update({ [targetColumn]: null })
    .eq("user_id", userId)
    .eq(filterColumn, monumentId);

  if (disconnectResult.error) {
    throw new Error(`${table} disconnect fallback failed: ${disconnectResult.error.message}`);
  }
}

export async function deleteMonumentWithReassignment({
  monumentId,
  userId,
  supabase,
}: DeleteMonumentInput) {
  const uncategorizedId = await ensureUncategorizedMonument({
    monumentId,
    userId,
    supabase,
  });

  const { data: linkedSkills, error: linkedSkillsError } = await supabase
    .from("monument_skills")
    .select("skill_id")
    .eq("user_id", userId)
    .eq("monument_id", monumentId)
    .not("skill_id", "is", null);

  if (linkedSkillsError) {
    throw new Error(linkedSkillsError.message);
  }

  const uniqueSkillIds = Array.from(
    new Set((linkedSkills ?? []).map((row) => row.skill_id).filter(Boolean)),
  ) as string[];

  if (uniqueSkillIds.length > 0) {
    const { error: upsertRelationsError } = await supabase
      .from("monument_skills")
      .upsert(
        uniqueSkillIds.map((skillId) => ({
          user_id: userId,
          monument_id: uncategorizedId,
          skill_id: skillId,
        })),
        { onConflict: "monument_id,skill_id" },
      );

    if (upsertRelationsError) {
      throw new Error(upsertRelationsError.message);
    }
  }

  await reassignOrDisconnectMonumentReference({
    supabase,
    table: "skills",
    userId,
    filterColumn: "monument_id",
    monumentId,
    targetColumn: "monument_id",
    uncategorizedId,
  });

  await reassignOrDisconnectMonumentReference({
    supabase,
    table: "goals",
    userId,
    filterColumn: "monument_id",
    monumentId,
    targetColumn: "monument_id",
    uncategorizedId,
  });

  await reassignOrDisconnectMonumentReference({
    supabase,
    table: "notes",
    userId,
    filterColumn: "monument_id",
    monumentId,
    targetColumn: "monument_id",
    uncategorizedId,
  });

  await reassignOrDisconnectMonumentReference({
    supabase,
    table: "schedule_instances",
    userId,
    filterColumn: "practice_context_monument_id",
    monumentId,
    targetColumn: "practice_context_monument_id",
    uncategorizedId,
  });

  await reassignOrDisconnectMonumentReference({
    supabase,
    table: "xp_events",
    userId,
    filterColumn: "monument_id",
    monumentId,
    targetColumn: "monument_id",
    uncategorizedId,
  });

  const { error: deleteMonumentSkillsError } = await supabase
    .from("monument_skills")
    .delete()
    .eq("user_id", userId)
    .eq("monument_id", monumentId);
  if (deleteMonumentSkillsError) {
    throw new Error(deleteMonumentSkillsError.message);
  }

  const { error: deleteDayTypeAllowlistError } = await supabase
    .from("day_type_time_block_allowed_monuments")
    .delete()
    .eq("user_id", userId)
    .eq("monument_id", monumentId);
  if (deleteDayTypeAllowlistError) {
    throw new Error(deleteDayTypeAllowlistError.message);
  }

  const { error: deleteMonumentError } = await supabase
    .from("monuments")
    .delete()
    .eq("user_id", userId)
    .eq("id", monumentId);

  if (deleteMonumentError) {
    throw new Error(deleteMonumentError.message);
  }
}
