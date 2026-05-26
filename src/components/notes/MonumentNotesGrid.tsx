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
  const [filter, setFilter] = useState<"all" | "bookmarked">("all");
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
    if (filter === "bookmarked" && !note.isBookmarked) return false;
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
      <div className="flex items-center gap-2 rounded-[20px] border border-white/12 bg-[linear-gradient(135deg,rgba(57,61,70,0.75),rgba(28,31,38,0.86))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_-20px_rgba(0,0,0,0.95)]">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "bookmarked")}
          className="h-9 shrink-0 rounded-full border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(18,19,24,0.5))] px-3 text-xs font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
        >
          <option value="all">All Notes</option>
          <option value="bookmarked">Bookmarked</option>
        </select>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(18,19,24,0.5))] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles"
            className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(18,19,24,0.5))] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
        >
          <Filter className="h-3.5 w-3.5 text-slate-300" />
        </button>
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
