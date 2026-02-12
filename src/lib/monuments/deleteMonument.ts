import type { SupabaseClient } from "@supabase/supabase-js";

const UNCATEGORIZED_MONUMENT_TITLE = "Uncategorized";
const UNCATEGORIZED_MONUMENT_EMOJI = "📂";

type DeleteMonumentInput = {
  monumentId: string;
  userId: string;
  supabase: SupabaseClient;
};

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

  const updateOperations = [
    supabase
      .from("skills")
      .update({ monument_id: uncategorizedId })
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
    supabase
      .from("goals")
      .update({ monument_id: uncategorizedId })
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
    supabase
      .from("notes")
      .update({ monument_id: uncategorizedId })
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
    supabase
      .from("schedule_instances")
      .update({ practice_context_monument_id: uncategorizedId })
      .eq("user_id", userId)
      .eq("practice_context_monument_id", monumentId),
    supabase
      .from("xp_events")
      .update({ monument_id: uncategorizedId })
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
    supabase
      .from("monument_skills")
      .delete()
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
    supabase
      .from("day_type_time_block_allowed_monuments")
      .delete()
      .eq("user_id", userId)
      .eq("monument_id", monumentId),
  ];

  const results = await Promise.all(updateOperations);
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    throw new Error(failedResult.error.message);
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
