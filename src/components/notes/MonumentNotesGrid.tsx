"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import { getMonumentNotes, updateMonumentNote } from "@/lib/monumentNotesStorage";
import {
  MonumentNoteCard,
  monumentNoteTileInnerClass,
  monumentNoteTileOuterClass,
} from "./MonumentNoteCard";
import { NotesHeaderControls } from "./NotesHeaderControls";

interface MonumentNotesGridProps {
  monumentId: string;
  initialNotes: MonumentNote[];
}

export function MonumentNotesGrid({ monumentId, initialNotes }: MonumentNotesGridProps) {
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [notes, setNotes] = useState<MonumentNote[]>(initialNotes ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const initialNoteCount = initialNotes?.length ?? 0;

  useEffect(() => {
    setShowAllNotes(false);
    setNotes(initialNotes ?? []);
  }, [monumentId, initialNotes]);

  useEffect(() => {
    let isMounted = true;
    async function loadNotes() {
      if (!monumentId) return;
      setIsLoading(true);
      const fetched = await getMonumentNotes(monumentId);
      if (!isMounted) return;
      const shouldReplace = fetched.length > 0 || initialNoteCount === 0;
      if (shouldReplace) {
        setNotes(fetched);
      }
      setIsLoading(false);
    }
    loadNotes();
    return () => {
      isMounted = false;
    };
  }, [monumentId, initialNoteCount]);

  const filteredNotes = notes.filter((note) => {
    const title = note.title?.toLowerCase() ?? "";
    const content = note.content?.toLowerCase() ?? "";
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return title.includes(q) || content.includes(q);
  });
  const hasVisibleNotes = filteredNotes.length > 0;
  const hasAnyNotes = notes.length > 0;
  const hasMoreNotes = filteredNotes.length > 3;
  const visibleNotes = showAllNotes ? filteredNotes : filteredNotes.slice(0, 3);

  async function handleToggleBookmark(noteId: string) {
    const target = notes.find((note) => note.id === noteId);
    if (!target) return;
    const next = !target.isBookmarked;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, isBookmarked: next } : n)));
    const saved = await updateMonumentNote(monumentId, noteId, {
      title: target.title,
      content: target.content ?? "",
      metadata: { ...(target.metadata ?? {}), bookmarked: next },
    });
    if (!saved) {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, isBookmarked: target.isBookmarked } : n))
      );
    }
  }

  return (
    <div className="max-w-full space-y-3">
      <NotesHeaderControls searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      {!hasVisibleNotes && !isLoading ? (
        <div className={cn(monumentNoteTileOuterClass, "w-full")}>
          <div
            className={cn(
              monumentNoteTileInnerClass,
              "flex min-h-[4.5rem] flex-col justify-center gap-1 text-left"
            )}
          >
            <p className="text-sm font-semibold tracking-tight text-[#f2f4f8]">
              {hasAnyNotes ? "No matching notes" : "No notes yet"}
            </p>
            <p className="text-xs leading-5 text-[#d2d7e0]">
              {hasAnyNotes
                ? "Try a different search."
                : "Capture your first thought and keep ideas close at hand."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex w-full max-w-full flex-col gap-2.5 px-0">
        {visibleNotes.map((note) => (
          <MonumentNoteCard
            key={note.id}
            note={note}
            monumentId={monumentId}
            onToggleBookmark={handleToggleBookmark}
          />
        ))}

        {(() => {
          return (
            <Link
              href={`/monuments/${monumentId}/notes/new`}
              className={cn(monumentNoteTileOuterClass, "w-full")}
              aria-label={hasAnyNotes ? "Add note" : "Create note"}
            >
              <div
                className={cn(
                  monumentNoteTileInnerClass,
                  "min-h-[4.25rem] items-center justify-center gap-2 text-center"
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_9px_18px_-14px_rgba(0,0,0,0.9)]">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2f4f8]">
                  {hasAnyNotes ? "Add note" : "Create note"}
                </span>
              </div>
            </Link>
          );
        })()}
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
  );
}
