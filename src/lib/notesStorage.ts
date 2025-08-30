import type { Note } from "@/lib/types/note";

const KEY_PREFIX = "skill-notes-";

export function getNotes(skillId: string): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const data = window.localStorage.getItem(`${KEY_PREFIX}${skillId}`);
    return data ? (JSON.parse(data) as Note[]) : [];
  } catch {
    return [];
  }
}

export function saveNotes(skillId: string, notes: Note[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${KEY_PREFIX}${skillId}`,
      JSON.stringify(notes)
    );
  } catch {
    // ignore
  }
}
