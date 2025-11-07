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
  createMonumentNote,
  getMonumentNotes,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    let isMounted = true;

    setIsLoading(true);

    (async () => {
      try {
        const fetchedNotes = await getMonumentNotes(monumentId);
        if (!isMounted) return;
        setNotes(fetchedNotes);
      } catch (error) {
        console.error("Failed to fetch monument notes", { error, monumentId });
        if (!isMounted) return;
        setNotes([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [monumentId]);

  useEffect(() => {
    setShowAllNotes(false);
  }, [monumentId]);

  const hasNotes = notes.length > 0;
  const hasMoreNotes = notes.length > 3;
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || isSaving) return;

    setIsSaving(true);

    try {
      const created = await createMonumentNote(monumentId, {
        title: draft,
        content: draft,
      });

      if (created) {
        setNotes((prev) => [...prev, created]);
        setDraft("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
    } catch (error) {
      console.error("Failed to save monument note", { error, monumentId });
    } finally {
      setIsSaving(false);
    }
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
          className="resize-none overflow-hidden rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 shadow-[0_22px_52px_-32px_rgba(148,163,184,0.55)] backdrop-blur focus-visible:ring-slate-200 focus-visible:ring-offset-0"
        />
        {draft.trim() ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim() || isSaving}
              aria-label="Save note"
              aria-busy={isSaving}
              className="rounded-full px-5"
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
          </div>
        ) : null}
      </form>

      {isLoading ? (
        <Card className="rounded-3xl border border-white/70 bg-white/80 p-6 text-slate-700 shadow-[0_28px_70px_-36px_rgba(148,163,184,0.55)] backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-900">Loading notes…</p>
          <p className="mt-2 text-xs text-slate-600">Fetching your saved thoughts from Supabase.</p>
        </Card>
      ) : hasNotes ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
                className="rounded-full border border-white/60 bg-white/70 px-4 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white/80 hover:text-slate-900"
                onClick={() => setShowAllNotes(true)}
                aria-label="See more notes"
              >
                See more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Card className="rounded-3xl border border-white/70 bg-white/80 p-6 text-slate-700 shadow-[0_28px_70px_-36px_rgba(148,163,184,0.55)] backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-900">No notes yet</p>
          <p className="mt-2 text-xs text-slate-600">
            Capture your first thought here and keep ideas close at hand.
          </p>
        </Card>
      )}
    </div>
  );
}
