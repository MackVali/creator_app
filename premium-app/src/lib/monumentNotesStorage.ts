import { getSupabaseBrowser } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import type { MonumentNote } from "@/lib/types/monument-note";
import type { Database } from "@/types/supabase";

const NOTES_TABLE = "notes";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

function mapRowToMonumentNote(row: NoteRow): MonumentNote {
  return {
    id: row.id,
    monumentId: row.monument_id ?? "",
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

export async function getMonumentNotes(
  monumentId: string
): Promise<MonumentNote[]> {
  if (!monumentId) return [];

  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select("id, title, content, monument_id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("monument_id", monumentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load monument notes", { error, monumentId });
    return [];
  }

  return (data ?? []).map(mapRowToMonumentNote);
}

export async function getMonumentNote(
  monumentId: string,
  noteId: string
): Promise<MonumentNote | null> {
  if (!monumentId || !noteId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select("id, title, content, monument_id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("monument_id", monumentId)
    .eq("id", noteId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load monument note", { error, monumentId, noteId });
    return null;
  }

  return data ? mapRowToMonumentNote(data) : null;
}

export async function createMonumentNote(
  monumentId: string,
  note: { title?: string | null; content: string }
): Promise<MonumentNote | null> {
  if (!monumentId) return null;

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
      monument_id: monumentId,
      title: derivedTitle,
      content: contentToStore,
    })
    .select("id, title, content, monument_id, created_at, updated_at")
    .single();

  if (error) {
    console.error("Failed to create monument note", {
      error,
      monumentId,
    });
    return null;
  }

  return mapRowToMonumentNote(data);
}

export async function updateMonumentNote(
  monumentId: string,
  noteId: string,
  note: { title?: string | null; content: string }
): Promise<MonumentNote | null> {
  if (!monumentId || !noteId) return null;

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
    .eq("monument_id", monumentId)
    .eq("id", noteId)
    .select("id, title, content, monument_id, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("Failed to update monument note", {
      error,
      monumentId,
      noteId,
    });
    return null;
  }

  return data ? mapRowToMonumentNote(data) : null;
}
