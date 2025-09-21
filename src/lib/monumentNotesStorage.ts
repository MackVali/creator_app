import { getSupabaseBrowser } from "@/lib/supabase";
import type { MonumentNote } from "@/lib/types/monument-note";

type MonumentNoteRow = {
  id: string;
  monument_id: string;
  title: string | null;
  content: string | null;
};

function mapMonumentNote(row: MonumentNoteRow): MonumentNote {
  return {
    id: row.id,
    monumentId: row.monument_id,
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
    console.error("Failed to retrieve auth user for monument notes", error);
    return null;
  }

  return user?.id ?? null;
}

export async function fetchMonumentNotes(
  monumentId: string
): Promise<MonumentNote[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getUserId(supabase);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("monument_notes")
    .select("id, monument_id, title, content")
    .eq("monument_id", monumentId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch monument notes", error);
    return [];
  }

  return (data ?? []).map(mapMonumentNote);
}

export async function fetchMonumentNote(
  monumentId: string,
  noteId: string
): Promise<MonumentNote | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getUserId(supabase);
  if (!userId) return null;

  const { data, error } = await supabase
    .from("monument_notes")
    .select("id, monument_id, title, content")
    .eq("id", noteId)
    .eq("monument_id", monumentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST116") {
      console.error("Failed to fetch monument note", error);
    }
    return null;
  }

  return data ? mapMonumentNote(data) : null;
}

interface UpsertMonumentNoteInput {
  id?: string;
  monumentId: string;
  title: string;
  content: string;
}

export async function upsertMonumentNote(
  input: UpsertMonumentNoteInput
): Promise<MonumentNote | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getUserId(supabase);
  if (!userId) return null;

  const payload = {
    title: input.title,
    content: input.content,
    monument_id: input.monumentId,
    user_id: userId,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("monument_notes")
      .update({ title: input.title, content: input.content })
      .eq("id", input.id)
      .eq("monument_id", input.monumentId)
      .eq("user_id", userId)
      .select("id, monument_id, title, content")
      .maybeSingle();

    if (error) {
      console.error("Failed to update monument note", error);
      return null;
    }

    return data ? mapMonumentNote(data) : null;
  }

  const { data, error } = await supabase
    .from("monument_notes")
    .insert(payload)
    .select("id, monument_id, title, content")
    .maybeSingle();

  if (error) {
    console.error("Failed to create monument note", error);
    return null;
  }

  return data ? mapMonumentNote(data) : null;
}
