"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import { getMonumentNotes, updateMonumentNote } from "@/lib/monumentNotesStorage";
import { MonumentNoteCard } from "./MonumentNoteCard";
import { NotesHeaderControls } from "./NotesHeaderControls";

interface MonumentNotesGridProps {
  monumentId: string;
  initialNotes: MonumentNote[];
}

const monumentNoteActionOuterClass =
  "group relative block h-full overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#050608]/85 p-[1px] shadow-[0_18px_36px_-28px_rgba(0,0,0,0.95),0_6px_18px_-14px_rgba(0,0,0,0.88)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-[#07090d]/90 hover:shadow-[0_22px_44px_-30px_rgba(0,0,0,0.98)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

const monumentNoteActionInnerClass =
  "relative flex h-full overflow-hidden rounded-[21px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(18,20,25,0.92),rgba(7,8,11,0.96))] px-3 py-2.5 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color] duration-200 before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[19px] before:border before:border-white/[0.04] before:content-[''] group-hover:border-white/[0.14]";

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
      {hasAnyNotes && !hasVisibleNotes && !isLoading ? (
        <div className={cn(monumentNoteActionOuterClass, "w-full")}>
          <div
            className={cn(
              monumentNoteActionInnerClass,
              "min-h-[4rem] flex-col justify-center gap-1 text-left"
            )}
          >
            <p className="text-sm font-semibold tracking-tight text-[#f2f4f8]">
              No matching notes
            </p>
            <p className="text-xs leading-5 text-[#d2d7e0]">
              Try a different search.
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
              className={cn(monumentNoteActionOuterClass, "w-full")}
              aria-label={hasAnyNotes ? "Add note" : "Create note"}
            >
              <div
                className={cn(
                  monumentNoteActionInnerClass,
                  "min-h-[4.25rem] items-center justify-center gap-2 text-center"
                )}
              >
                <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-black/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_9px_18px_-14px_rgba(0,0,0,0.9)]">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <span className="relative z-10 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2f4f8]">
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
            className="rounded-full border border-white/[0.12] bg-black/25 px-4 text-xs font-semibold text-white/80 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
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
