import { getSupabaseBrowser } from "@/lib/supabase";
import { get, set } from "idb-keyval";
import type { MonumentNote } from "@/lib/types/monument-note";

const KEY_PREFIX = "monument-notes-";

async function getCached(monumentId: string): Promise<MonumentNote[]> {
  try {
    return (await get<MonumentNote[]>(`${KEY_PREFIX}${monumentId}`)) ?? [];
  } catch {
    return [];
  }
}

async function setCached(monumentId: string, notes: MonumentNote[]) {
  try {
    await set(`${KEY_PREFIX}${monumentId}`, notes);
  } catch {
    // ignore
  }
}

export async function loadNotes(monumentId: string): Promise<MonumentNote[]> {
  const supabase = getSupabaseBrowser();
  const cached = await getCached(monumentId);
  if (supabase) {
    const { data, error } = await supabase
      .from("monument_notes")
      .select(
        "id, monument_id, title, content, pinned, tags, updated_at"
      )
      .eq("monument_id", monumentId)
      .order("updated_at", { ascending: false });
    if (!error && data) {
      type NoteRow = {
        id: string;
        monument_id: string;
        title: string | null;
        content: string | null;
        pinned: boolean | null;
        tags: string[] | null;
        updated_at: string | null;
      };
      const serverNotes: MonumentNote[] = (data as NoteRow[]).map((n) => ({
        id: n.id,
        monumentId: n.monument_id,
        title: n.title ?? "",
        content: n.content ?? "",
        pinned: n.pinned ?? false,
        tags: n.tags ?? [],
        updatedAt: n.updated_at ?? new Date().toISOString(),
        synced: true,
      }));
      const unsynced = cached.filter((n) => !n.synced);
      const mergedMap = new Map<string, MonumentNote>();
      serverNotes.forEach((n) => mergedMap.set(n.id, n));
      unsynced.forEach((n) => mergedMap.set(n.id, n));
      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      await setCached(monumentId, merged);
      syncNotes(monumentId).catch(() => {});
      return merged;
    }
  }
  syncNotes(monumentId).catch(() => {});
  return cached;
}

export async function addNote(
  monumentId: string,
  content: string,
  tags: string[] = []
): Promise<MonumentNote> {
  const note: MonumentNote = {
    id: crypto.randomUUID(),
    monumentId,
    title: content.split("\n")[0].slice(0, 100),
    content,
    pinned: false,
    tags,
    updatedAt: new Date().toISOString(),
    synced: false,
  };
  const notes = await getCached(monumentId);
  notes.unshift(note);
  await setCached(monumentId, notes);
  syncNotes(monumentId).catch(() => {});
  return note;
}

export async function togglePin(
  monumentId: string,
  noteId: string
): Promise<MonumentNote | undefined> {
  const notes = await getCached(monumentId);
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  notes[idx].pinned = !notes[idx].pinned;
  notes[idx].updatedAt = new Date().toISOString();
  notes[idx].synced = false;
  await setCached(monumentId, notes);
  syncNotes(monumentId).catch(() => {});
  return notes[idx];
}

export async function upsertNote(
  monumentId: string,
  note: MonumentNote
): Promise<void> {
  const notes = await getCached(monumentId);
  const idx = notes.findIndex((n) => n.id === note.id);
  const updated: MonumentNote = {
    ...note,
    monumentId,
    updatedAt: new Date().toISOString(),
    synced: false,
  };
  if (idx >= 0) notes[idx] = updated;
  else notes.unshift(updated);
  await setCached(monumentId, notes);
  syncNotes(monumentId).catch(() => {});
}

export async function syncNotes(monumentId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const notes = await getCached(monumentId);
  const unsynced = notes.filter((n) => !n.synced);
  if (!unsynced.length) return;
  for (const note of unsynced) {
    const { error } = await supabase.from("monument_notes").upsert({
      id: note.id,
      monument_id: note.monumentId,
      title: note.title,
      content: note.content,
      pinned: note.pinned,
      tags: note.tags,
      updated_at: note.updatedAt,
    });
    if (!error) {
      note.synced = true;
    }
  }
  await setCached(monumentId, notes);
}

export async function getNote(
  monumentId: string,
  noteId: string
): Promise<MonumentNote | undefined> {
  const notes = await loadNotes(monumentId);
  return notes.find((n) => n.id === noteId);
}
