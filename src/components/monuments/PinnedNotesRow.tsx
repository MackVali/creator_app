"use client";

import type { MonumentNote } from "@/lib/types/monument-note";
import { MonumentNoteCard } from "./MonumentNoteCard";

interface PinnedNotesRowProps {
  notes: MonumentNote[];
  onTogglePin: (id: string) => void;
}

export function PinnedNotesRow({ notes, onTogglePin }: PinnedNotesRowProps) {
  if (notes.length === 0) return null;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {notes.map((note) => (
        <div key={note.id} className="min-w-[200px] flex-shrink-0">
          <MonumentNoteCard note={note} onTogglePin={onTogglePin} />
        </div>
      ))}
    </div>
  );
}
