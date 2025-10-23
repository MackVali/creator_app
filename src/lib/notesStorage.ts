import { getSupabaseBrowser } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import type { Note } from "@/lib/types/note";
import type { Database } from "@/types/supabase";

const NOTES_TABLE = "notes";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

type CreateSkillNoteOptions = {
  metadata?: Record<string, unknown> | null;
  requireContent?: boolean;
  parentNoteId?: string | null;
  siblingOrder?: number | null;
};

type UpdateSkillNoteOptions = {
  parentNoteId?: string | null;
  siblingOrder?: number | null;
};

export type NoteWithChildren = {
  note: Note;
  children: Note[];
  parent: Note | null;
  parentTemplateOverrides: Record<string, unknown> | null;
};

function extractChildTemplateOverrides(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const value = metadata.childTemplateOverrides;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapRowToSkillNote(row: NoteRow): Note {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
  return {
    id: row.id,
    skillId: row.skill_id ?? "",
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
    parentNoteId: row.parent_note_id ?? null,
    siblingOrder: row.sibling_order ?? null,
    childTemplateOverrides: extractChildTemplateOverrides(metadata),
  };
}

function normalizeText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getNotes(
  skillId: string,
  options?: { parentNoteId?: string | null },
): Promise<Note[]> {
  if (!skillId) return [];

  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from(NOTES_TABLE)
    .select(
      "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
    )
    .eq("user_id", userId)
    .eq("skill_id", skillId);

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
    .select(
      "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
    )
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
  options?: CreateSkillNoteOptions,
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

  const insertPayload: Database["public"]["Tables"]["notes"]["Insert"] = {
    user_id: userId,
    skill_id: skillId,
    title: derivedTitle,
    content: contentToStore,
    metadata: options?.metadata ?? null,
    parent_note_id: options?.parentNoteId ?? null,
    sibling_order: options?.siblingOrder ?? null,
  };

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .insert(insertPayload)
    .select(
      "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
    )
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
  note: { title?: string | null; content: string },
  options?: UpdateSkillNoteOptions,
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

  const updatePayload: Database["public"]["Tables"]["notes"]["Update"] = {
    title: derivedTitle,
    content: contentToStore,
    updated_at: new Date().toISOString(),
  };

  if (options && Object.prototype.hasOwnProperty.call(options, "parentNoteId")) {
    updatePayload.parent_note_id = options?.parentNoteId ?? null;
  }

  if (options && Object.prototype.hasOwnProperty.call(options, "siblingOrder")) {
    updatePayload.sibling_order = options?.siblingOrder ?? null;
  }

  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .update(updatePayload)
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("id", noteId)
    .select(
      "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
    )
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

  const memoContainer = await ensureMemoContainerNote(
    supabase,
    userId,
    skillId,
    habitId,
    safeHabitName,
  );
  if (!memoContainer) {
    return null;
  }

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
    {
      metadata,
      requireContent: true,
      parentNoteId: memoContainer.id,
      siblingOrder: nextSequence,
    },
  );
}

function sortNotesForHierarchy(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const aOrder = a.siblingOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.siblingOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

export async function getNoteWithChildren(
  skillId: string,
  noteId: string,
): Promise<NoteWithChildren | null> {
  if (!skillId || !noteId) return null;

  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const [noteResult, childrenResult] = await Promise.all([
    supabase
      .from(NOTES_TABLE)
      .select(
        "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
      )
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .eq("id", noteId)
      .maybeSingle(),
    supabase
      .from(NOTES_TABLE)
      .select(
        "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
      )
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .eq("parent_note_id", noteId)
      .order("sibling_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
  ]);

  if (noteResult.error) {
    console.error("Failed to load skill note", {
      error: noteResult.error,
      skillId,
      noteId,
    });
    return null;
  }

  const noteRow = noteResult.data as NoteRow | null;
  if (!noteRow) {
    return null;
  }

  const parentPromise = noteRow.parent_note_id
    ? supabase
        .from(NOTES_TABLE)
        .select(
          "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
        )
        .eq("user_id", userId)
        .eq("skill_id", skillId)
        .eq("id", noteRow.parent_note_id)
        .maybeSingle()
    : null;

  let parent: Note | null = null;
  if (parentPromise) {
    const { data: parentRow, error: parentError } = await parentPromise;
    if (parentError) {
      console.error("Failed to load parent note", {
        error: parentError,
        skillId,
        noteId,
        parentId: noteRow.parent_note_id,
      });
    } else if (parentRow) {
      parent = mapRowToSkillNote(parentRow as NoteRow);
    }
  }

  if (childrenResult.error) {
    console.error("Failed to load child notes", {
      error: childrenResult.error,
      skillId,
      noteId,
    });
  }

  const note = mapRowToSkillNote(noteRow);
  const children = sortNotesForHierarchy(
    (childrenResult.data as NoteRow[] | null | undefined)?.map(mapRowToSkillNote) ?? [],
  );

  return {
    note,
    children,
    parent,
    parentTemplateOverrides: parent?.childTemplateOverrides ?? null,
  };
}

async function ensureMemoContainerNote(
  supabase: ReturnType<typeof getSupabaseBrowser>,
  userId: string,
  skillId: string,
  habitId: string,
  habitName: string,
): Promise<Note | null> {
  if (!supabase) return null;

  const { data: existingContainer, error } = await supabase
    .from(NOTES_TABLE)
    .select(
      "id, title, content, skill_id, created_at, updated_at, metadata, parent_note_id, sibling_order",
    )
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .is("parent_note_id", null)
    .contains("metadata", { memoHabitContainerForId: habitId })
    .maybeSingle();

  if (error) {
    console.error("Failed to locate memo container", {
      error,
      skillId,
      habitId,
    });
  } else if (existingContainer) {
    return mapRowToSkillNote(existingContainer as NoteRow);
  }

  const metadata: Record<string, unknown> = {
    memoHabitContainerForId: habitId,
    memoHabitName: habitName,
    childTemplateOverrides: {
      memoHabitId: habitId,
      memoHabitName: habitName,
    },
  };

  return await createSkillNote(
    skillId,
    {
      title: habitName,
      content: "",
    },
    {
      metadata,
      parentNoteId: null,
    },
  );
}
