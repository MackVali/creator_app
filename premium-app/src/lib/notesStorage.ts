import { getSupabaseBrowser } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import type { Note } from "@/lib/types/note";
import type { Database } from "@/types/supabase";

const NOTES_TABLE = "notes";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

function mapRowToSkillNote(row: NoteRow): Note {
  return {
    id: row.id,
    skillId: row.skill_id ?? "",
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

function normalizeText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getNotes(skillId: string): Promise<Note[]> {
  if (!skillId) return [];

  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select("id, title, content, skill_id, created_at, updated_at, metadata")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load skill notes", { error, skillId });
    return [];
  }

  return (data ?? []).map(mapRowToSkillNote);
}

export async function getNote(
  skillId: string,
  noteId: string
): Promise<Note | null> {
  if (!skillId || !noteId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select("id, title, content, skill_id, created_at, updated_at, metadata")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("id", noteId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load skill note", { error, skillId, noteId });
    return null;
  }

  return data ? mapRowToSkillNote(data) : null;
}

export async function createSkillNote(
  skillId: string,
  note: { title?: string | null; content: string },
  options?: { metadata?: Record<string, unknown> | null; requireContent?: boolean }
): Promise<Note | null> {
  if (!skillId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const derivedTitle =
    normalizeText(note.title) ??
    note.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ??
    null;

  const requireContent = options?.requireContent ?? false;
  const hasMeaningfulContent = note.content.trim().length > 0;
  const contentToStore = hasMeaningfulContent ? note.content : null;
  if (requireContent && !hasMeaningfulContent) {
    return null;
  }

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .insert({
      user_id: userId,
      skill_id: skillId,
      title: derivedTitle,
      content: contentToStore,
      metadata: options?.metadata ?? null,
    })
    .select("id, title, content, skill_id, created_at, updated_at, metadata")
    .single();

  if (error) {
    console.error("Failed to create skill note", { error, skillId });
    return null;
  }

  return mapRowToSkillNote(data);
}

export async function updateSkillNote(
  skillId: string,
  noteId: string,
  note: { title?: string | null; content: string }
): Promise<Note | null> {
  if (!skillId || !noteId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const derivedTitle =
    normalizeText(note.title) ??
    note.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ??
    null;

  const hasMeaningfulContent = note.content.trim().length > 0;
  const contentToStore = hasMeaningfulContent ? note.content : null;

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .update({
      title: derivedTitle,
      content: contentToStore,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("id", noteId)
    .select("id, title, content, skill_id, created_at, updated_at, metadata")
    .maybeSingle();

  if (error) {
    console.error("Failed to update skill note", { error, skillId, noteId });
    return null;
  }

  return data ? mapRowToSkillNote(data) : null;
}

export async function createMemoNoteForHabit(
  skillId: string,
  habitId: string,
  habitName: string,
  content: string,
): Promise<Note | null> {
  if (!skillId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const safeHabitName = habitName.trim() || "Memo";

  let nextSequence = 1;
  try {
    const { data: existing, error } = await supabase
      .from(NOTES_TABLE)
      .select("metadata")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .contains("metadata", { memoHabitId: habitId });

    if (error) {
      console.error("Failed to inspect existing memo notes", {
        error,
        skillId,
        habitId,
      });
    } else if (existing && existing.length > 0) {
      const maxSequence = existing.reduce((max, row) => {
        const metadata = (row?.metadata ?? null) as
          | { memoSequence?: unknown }
          | null;
        const sequence = Number(metadata?.memoSequence ?? 0);
        return Number.isFinite(sequence) && sequence > max ? sequence : max;
      }, 0);
      nextSequence = maxSequence + 1;
    }
  } catch (error) {
    console.error("Failed to prepare memo note sequence", {
      error,
      skillId,
      habitId,
    });
  }

  const metadata = {
    memoHabitId: habitId,
    memoHabitName: safeHabitName,
    memoSequence: nextSequence,
  } satisfies Record<string, unknown>;

  const title = `${safeHabitName} Memo #${nextSequence}`;

  return await createSkillNote(
    skillId,
    { title, content },
    { metadata, requireContent: true },
  );
}
