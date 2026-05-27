import { getSupabaseBrowser } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import type { MonumentNote } from "@/lib/types/monument-note";
import type { Database } from "@/types/supabase";

const NOTES_TABLE = "notes";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

type CreateMonumentNoteOptions = {
  parentNoteId?: string | null;
  siblingOrder?: number | null;
};

type UpdateMonumentNoteOptions = {
  parentNoteId?: string | null;
  siblingOrder?: number | null;
};

const MONUMENT_NOTE_SELECT =
  "id, title, content, monument_id, created_at, updated_at, metadata, parent_note_id, sibling_order";

function mapRowToMonumentNote(row: NoteRow): MonumentNote {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
  const icon = typeof metadata?.icon === "string" ? metadata.icon : null;
  const isBookmarked = metadata?.bookmarked === true;
  return {
    id: row.id,
    monumentId: row.monument_id ?? "",
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
    parentNoteId: row.parent_note_id ?? null,
    siblingOrder: row.sibling_order ?? null,
    icon,
    isBookmarked,
  };
}

function normalizeText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getMonumentNotes(
  monumentId: string,
  options?: { parentNoteId?: string | null },
): Promise<MonumentNote[]> {
  if (!monumentId) return [];

  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from(NOTES_TABLE)
    .select(MONUMENT_NOTE_SELECT)
    .eq("user_id", userId)
    .eq("monument_id", monumentId);

  if (options && Object.prototype.hasOwnProperty.call(options, "parentNoteId")) {
    const parentFilter = options.parentNoteId ?? null;
    if (parentFilter === null) {
      query = query.is("parent_note_id", null);
    } else {
      query = query.eq("parent_note_id", parentFilter);
    }
  }

  const { data, error } = await query
    .order("parent_note_id", { ascending: true, nullsFirst: true })
    .order("sibling_order", { ascending: true, nullsFirst: true })
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
    .select(MONUMENT_NOTE_SELECT)
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
  note: {
    title?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  },
  options?: CreateMonumentNoteOptions,
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
      metadata: note.metadata ?? null,
      parent_note_id: options?.parentNoteId ?? null,
      sibling_order: options?.siblingOrder ?? null,
    })
    .select(MONUMENT_NOTE_SELECT)
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
  note: {
    title?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  },
  options?: UpdateMonumentNoteOptions,
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

  const updatePayload: Database["public"]["Tables"]["notes"]["Update"] = {
    title: derivedTitle,
    content: contentToStore,
    metadata: note.metadata ?? null,
    updated_at: new Date().toISOString(),
  };

  if (options && Object.prototype.hasOwnProperty.call(options, "parentNoteId")) {
    updatePayload.parent_note_id = options.parentNoteId ?? null;
  }

  if (options && Object.prototype.hasOwnProperty.call(options, "siblingOrder")) {
    updatePayload.sibling_order = options.siblingOrder ?? null;
  }

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .update(updatePayload)
    .eq("user_id", userId)
    .eq("monument_id", monumentId)
    .eq("id", noteId)
    .select(MONUMENT_NOTE_SELECT)
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
