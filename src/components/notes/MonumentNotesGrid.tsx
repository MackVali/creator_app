"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MonumentNote } from "@/lib/types/monument-note";
import {
  getMonumentNotes,
  saveMonumentNotes,
} from "@/lib/monumentNotesStorage";
import { MonumentNoteCard } from "./MonumentNoteCard";

interface MonumentNotesGridProps {
  monumentId: string;
}

export function MonumentNotesGrid({ monumentId }: MonumentNotesGridProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNotes(getMonumentNotes(monumentId));
  }, [monumentId]);

  useEffect(() => {
    saveMonumentNotes(monumentId, notes);
  }, [monumentId, notes]);

  const hasNotes = notes && notes.length > 0;

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const newNote: MonumentNote = {
      id: Date.now().toString(),
      monumentId,
      title: draft.trim(),
      content: draft.trim(),
    };
    setNotes([...notes, newNote]);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-2">
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleInput}
          placeholder="Quick note..."
          className="resize-none overflow-hidden rounded-2xl border border-white/5 bg-[#111520] p-3 text-sm text-[#E7ECF2] placeholder-[#A7B0BD]"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </form>

      {hasNotes ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {notes.map((note) => (
            <MonumentNoteCard
              key={note.id}
              note={note}
              monumentId={monumentId}
            />
          ))}
        </div>
      ) : (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4">
          <p className="text-[#A7B0BD]">No notes yet. Capture your first thought here.</p>
        </Card>
      )}
    </div>
  );
}
