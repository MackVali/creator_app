import type { MonumentNote } from "@/lib/types/monument-note";

const KEY_PREFIX = "monument-notes-";

export function getMonumentNotes(monumentId: string): MonumentNote[] {
  if (typeof window === "undefined") return [];
  try {
    const data = window.localStorage.getItem(`${KEY_PREFIX}${monumentId}`);
    return data ? (JSON.parse(data) as MonumentNote[]) : [];
  } catch {
    return [];
  }
}

export function saveMonumentNotes(monumentId: string, notes: MonumentNote[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${KEY_PREFIX}${monumentId}`,
      JSON.stringify(notes)
    );
  } catch {
    // ignore
  }
}
