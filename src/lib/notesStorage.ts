import { getSupabaseBrowser } from "@/lib/supabase";
import type { Note } from "@/lib/types/note";

type SkillNoteRow = {
  id: string;
  skill_id: string;
  title: string | null;
  content: string | null;
};

function mapSkillNote(row: SkillNoteRow): Note {
  return {
    id: row.id,
    skillId: row.skill_id,
    title: row.title ?? "",
    content: row.content ?? "",
  };
}

async function getUserId(
  supabase: ReturnType<typeof getSupabaseBrowser>
) {
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Failed to retrieve auth user for notes", error);
    return null;
  }

  return user?.id ?? null;
}

export async function fetchSkillNotes(skillId: string): Promise<Note[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getUserId(supabase);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("skill_notes")
    .select("id, skill_id, title, content")
    .eq("skill_id", skillId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch skill notes", error);
    return [];
  }

  return (data ?? []).map(mapSkillNote);
}

export async function fetchSkillNote(
  skillId: string,
  noteId: string
): Promise<Note | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getUserId(supabase);
  if (!userId) return null;

  const { data, error } = await supabase
    .from("skill_notes")
    .select("id, skill_id, title, content")
    .eq("id", noteId)
    .eq("skill_id", skillId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST116") {
      console.error("Failed to fetch skill note", error);
    }
    return null;
  }

  return data ? mapSkillNote(data) : null;
}

interface UpsertSkillNoteInput {
  id?: string;
  skillId: string;
  title: string;
  content: string;
}

export async function upsertSkillNote(
  input: UpsertSkillNoteInput
): Promise<Note | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getUserId(supabase);
  if (!userId) return null;

  const payload = {
    title: input.title,
    content: input.content,
    skill_id: input.skillId,
    user_id: userId,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("skill_notes")
      .update({ title: input.title, content: input.content })
      .eq("id", input.id)
      .eq("skill_id", input.skillId)
      .eq("user_id", userId)
      .select("id, skill_id, title, content")
      .maybeSingle();

    if (error) {
      console.error("Failed to update skill note", error);
      return null;
    }

    return data ? mapSkillNote(data) : null;
  }

  const { data, error } = await supabase
    .from("skill_notes")
    .insert(payload)
    .select("id, skill_id, title, content")
    .maybeSingle();

  if (error) {
    console.error("Failed to create skill note", error);
    return null;
  }

  return data ? mapSkillNote(data) : null;
}
