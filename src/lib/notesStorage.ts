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
  };
}

function normalizeText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeForIlike(value: string) {
  return value.replace(/([%_\\])/g, '\\$1');
}

export function formatMemoNoteTitle(habitName: string, index: number) {
  return `${habitName} Memo #${index}`;
}

export async function getNotes(skillId: string): Promise<Note[]> {
  if (!skillId) return [];

  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select("id, title, content, skill_id, created_at, updated_at")
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
    .select("id, title, content, skill_id, created_at, updated_at")
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
  note: { title?: string | null; content: string }
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

  const hasMeaningfulContent = note.content.trim().length > 0;
  const contentToStore = hasMeaningfulContent ? note.content : null;

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .insert({
      user_id: userId,
      skill_id: skillId,
      title: derivedTitle,
      content: contentToStore,
    })
    .select("id, title, content, skill_id, created_at, updated_at")
    .single();

  if (error) {
    console.error("Failed to create skill note", { error, skillId });
    return null;
  }

  return mapRowToSkillNote(data);
}

export async function getNextMemoNoteIndex(
  skillId: string,
  habitName: string
): Promise<number> {
  if (!skillId || !habitName.trim()) return 1;

  const supabase = getSupabaseBrowser();
  if (!supabase) return 1;

  const userId = await getCurrentUserId();
  if (!userId) return 1;

  const normalizedName = habitName.trim();
  const prefix = `${normalizedName} Memo #`;
  const escapedPrefix = escapeForIlike(prefix);

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select('title')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .ilike('title', `${escapedPrefix}%`);

  if (error) {
    console.error('Failed to load memo notes for index', { error, skillId, habitName });
    return 1;
  }

  let maxIndex = 0;
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
  for (const row of data ?? []) {
    const title = (row as { title?: string | null }).title;
    if (!title) continue;
    const match = title.match(regex);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxIndex = Math.max(maxIndex, value);
      }
    }
  }

  return maxIndex + 1;
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
    .select("id, title, content, skill_id, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("Failed to update skill note", { error, skillId, noteId });
    return null;
  }

  return data ? mapRowToSkillNote(data) : null;
}
