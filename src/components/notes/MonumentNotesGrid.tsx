"use client";

import { useEffect, useState, useRef, FormEvent, type Ref, type MutableRefObject } from "react";
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
  inputRef?: Ref<HTMLTextAreaElement>;
  onCountChange?: (count: number) => void;
}

export function MonumentNotesGrid({ monumentId, inputRef, onCountChange }: MonumentNotesGridProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!inputRef) return;
    if (typeof inputRef === "function") {
      inputRef(textareaRef.current);
    } else {
      (inputRef as MutableRefObject<HTMLTextAreaElement | null>).current = textareaRef.current;
    }
  }, [inputRef]);

  useEffect(() => {
    const loadedNotes = getMonumentNotes(monumentId);
    setNotes(loadedNotes);
    onCountChange?.(loadedNotes.length);
  }, [monumentId, onCountChange]);

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
    setNotes((prev) => {
      const updated = [...prev, newNote];
      onCountChange?.(updated.length);
      return updated;
    });
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-2xl border border-white/10 bg-gray-900 p-4 shadow-[0_40px_120px_rgba(15,23,42,0.35)] sm:p-5"
      >
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleInput}
          placeholder="Quick note..."
          className="min-h-0 resize-none overflow-hidden border-none bg-transparent p-0 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim()}
            aria-label="Save note"
            className="border-white/20 text-slate-200 hover:bg-gray-800"
            variant="outline"
          >
            Save
          </Button>
        </div>
      </form>

      {hasNotes ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <MonumentNoteCard
              key={note.id}
              note={note}
              monumentId={monumentId}
            />
          ))}
        </div>
      ) : (
        <Card className="rounded-3xl border border-white/10 bg-gray-950 p-5 text-slate-300 shadow-[0_40px_120px_rgba(15,23,42,0.45)]">
          <p>No notes yet. Capture your first thought here.</p>
        </Card>
      )}
    </div>
  );
}
