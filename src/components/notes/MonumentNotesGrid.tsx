"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Filter, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import { getMonumentNotes, updateMonumentNote } from "@/lib/monumentNotesStorage";
import {
  MonumentNoteCard,
  monumentNoteTileInnerClass,
  monumentNoteTileOuterClass,
} from "./MonumentNoteCard";

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
  const hasNotes = filteredNotes.length > 0;
  const hasMoreNotes = notes.length > 3;
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
    <div className="max-w-full space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-[#aeb5c1]">Notes</h3>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex h-8 min-w-0 w-[11rem] max-w-[52vw] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">Search notes</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-xs text-white/85 outline-none placeholder:text-slate-500"
            />
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition hover:bg-white/[0.06]"
            aria-label="Filter notes"
          >
            <Filter className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>
      {!hasNotes && !isLoading ? (
        <div className={cn(monumentNoteTileOuterClass, "w-full")}>
          <div
            className={cn(
              monumentNoteTileInnerClass,
              "flex min-h-[5.5rem] flex-col justify-center gap-1.5 text-left"
            )}
          >
            <p className="text-base font-semibold tracking-tight text-[#f2f4f8]">No notes yet</p>
            <p className="text-sm text-[#d2d7e0]">
              Capture your first thought here and keep ideas close at hand.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex w-full max-w-full flex-col gap-3 px-0">
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
              aria-label={hasNotes ? "Add note" : "Create note"}
            >
              <div
                className={cn(
                  monumentNoteTileInnerClass,
                  "min-h-[5.75rem] items-center justify-center gap-2.5 text-center"
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_20px_-14px_rgba(0,0,0,0.9)]">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f2f4f8]">
                  {hasNotes ? "Add note" : "Create note"}
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
