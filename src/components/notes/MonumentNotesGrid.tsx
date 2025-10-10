"use client";

import {
  useEffect,
  useState,
  useRef,
  FormEvent,
  type Ref,
  type MutableRefObject,
} from "react";

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
}

export function MonumentNotesGrid({ monumentId, inputRef }: MonumentNotesGridProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!inputRef) return;
    if (typeof inputRef === "function") {
      inputRef(textareaRef.current);
    } else {
      (inputRef as MutableRefObject<HTMLTextAreaElement | null>).current =
        textareaRef.current;
    }
  }, [inputRef]);

  useEffect(() => {
    setNotes(getMonumentNotes(monumentId));
  }, [monumentId]);

  useEffect(() => {
    setShowAllNotes(false);
  }, [monumentId]);

  useEffect(() => {
    saveMonumentNotes(monumentId, notes);
  }, [monumentId, notes]);

  const hasNotes = notes && notes.length > 0;
  const hasMoreNotes = notes.length > 3;
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);

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
      <form onSubmit={handleAdd} className="space-y-3">
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleInput}
          placeholder="Quick note..."
          className="resize-none overflow-hidden rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/60 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.78)] backdrop-blur focus-visible:ring-white/30 focus-visible:ring-offset-0"
        />
        {draft.trim() ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim()}
              aria-label="Save note"
              className="rounded-full px-5"
            >
              Save note
            </Button>
          </div>
        ) : null}
      </form>

      {hasNotes ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleNotes.map((note) => (
              <MonumentNoteCard
                key={note.id}
                note={note}
                monumentId={monumentId}
              />
            ))}
          </div>

          {!showAllNotes && hasMoreNotes ? (
            <div className="flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full px-4 text-xs font-medium text-white/80 hover:text-white"
                onClick={() => setShowAllNotes(true)}
                aria-label="See more notes"
              >
                See more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Card className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 text-white/70 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-sm font-medium text-white">No notes yet</p>
          <p className="mt-2 text-xs text-white/60">
            Capture your first thought here and keep ideas close at hand.
          </p>
        </Card>
      )}
    </div>
  );
}
