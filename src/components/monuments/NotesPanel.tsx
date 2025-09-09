"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import {
  addNote,
  loadNotes,
  togglePin,
} from "@/lib/monumentNotesStore";
import { PinnedNotesRow } from "./PinnedNotesRow";
import { MonumentNoteCard } from "./MonumentNoteCard";

interface NotesPanelProps {
  monumentId: string;
}

export function NotesPanel({ monumentId }: NotesPanelProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    loadNotes(monumentId).then(setNotes);
  }, [monumentId]);

  async function handleAdd() {
    if (!content.trim()) return;
    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const note = await addNote(monumentId, content, tagArray);
    setNotes((prev) => [note, ...prev]);
    setContent("");
    setTags("");
  }

  async function handleTogglePin(id: string) {
    const updated = await togglePin(monumentId, id);
    if (updated) {
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    }
  }

  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Quick note..."
          className="min-h-[80px]"
        />
        <div className="flex gap-2">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags (comma separated)"
            className="flex-1"
          />
          <Button onClick={handleAdd}>Add</Button>
        </div>
      </div>

      <PinnedNotesRow notes={pinned} onTogglePin={handleTogglePin} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {others.map((note) => (
          <MonumentNoteCard
            key={note.id}
            note={note}
            onTogglePin={handleTogglePin}
          />
        ))}
      </div>
    </div>
  );
}
