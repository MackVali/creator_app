"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import {
  getAreaNotes,
  getMonumentNotes,
  updateAreaNote,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import { getFirstPlainNoteContentLine } from "@/lib/notes/plainText";
import { NotesHeaderControls } from "./NotesHeaderControls";

interface MonumentNotesGridProps {
  monumentId?: string;
  areaId?: string;
  sourceType?: "monument" | "area";
  initialNotes: MonumentNote[];
}

const monumentNoteListSurfaceClass =
  "flex w-full min-w-0 flex-col gap-0.5";

function getMonumentNoteTitle(note: MonumentNote) {
  return (
    note.title?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open this note to add a title."
  );
}

function getMonumentNotePreview(note: MonumentNote) {
  return getFirstPlainNoteContentLine(note.content) ?? "No preview";
}

export function MonumentNotesGrid({
  monumentId,
  areaId,
  sourceType = "monument",
  initialNotes,
}: MonumentNotesGridProps) {
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [notes, setNotes] = useState<MonumentNote[]>(initialNotes ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const latestInitialNotesRef = useRef(initialNotes ?? []);

  useEffect(() => {
    latestInitialNotesRef.current = initialNotes ?? [];
  }, [initialNotes]);

  const sourceId = sourceType === "area" ? areaId : monumentId;

  useEffect(() => {
    setShowAllNotes(false);
    setSearchQuery("");
    setNotes(latestInitialNotesRef.current);
  }, [sourceId]);

  useEffect(() => {
    let isMounted = true;
    async function loadNotes() {
      if (!sourceId) return;
      setIsLoading(true);
      const fetched =
        sourceType === "area"
          ? await getAreaNotes(sourceId)
          : await getMonumentNotes(sourceId);
      if (!isMounted) return;
      setNotes((currentNotes) => {
        if (fetched.length > 0) return fetched;
        if (currentNotes.length > 0 || latestInitialNotesRef.current.length > 0) {
          return currentNotes;
        }
        return fetched;
      });
      setIsLoading(false);
    }
    loadNotes();
    return () => {
      isMounted = false;
    };
  }, [sourceId, sourceType]);

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
    if (!sourceId) return;
    const payload = {
      title: target.title,
      content: target.content ?? "",
      metadata: { ...(target.metadata ?? {}), bookmarked: next },
    };
    const saved =
      sourceType === "area"
        ? await updateAreaNote(sourceId, noteId, payload)
        : await updateMonumentNote(sourceId, noteId, payload);
    if (!saved) {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, isBookmarked: target.isBookmarked } : n))
      );
    }
  }

  return (
    <div className="w-full min-w-0 space-y-1.5">
      <NotesHeaderControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        addHref={
          sourceType === "area"
            ? `/areas/${areaId}/notes/new`
            : `/monuments/${monumentId}/notes/new`
        }
      />
      {hasAnyNotes && !hasVisibleNotes && !isLoading ? (
        <div className="w-full px-2 py-3 text-slate-50">
          <p className="text-[13px] font-semibold text-white/75">
            No matching notes
          </p>
          <p className="mt-0.5 text-[10px] text-white/38">
            Try a different search.
          </p>
        </div>
      ) : null}

      {hasVisibleNotes ? (
        <div className={monumentNoteListSurfaceClass}>
          {visibleNotes.map((note) => (
          <Link
            key={note.id}
            href={
              sourceType === "area"
                ? `/areas/${areaId}/notes/${note.id}`
                : `/monuments/${monumentId}/notes/${note.id}`
            }
            className="group relative flex min-h-[48px] w-full items-center gap-1.5 overflow-hidden rounded-[8px] border border-white/[0.055] bg-[#090A0D]/95 px-2 py-0.5 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:bg-[#101116] active:bg-[#131419] sm:min-h-[50px] sm:px-2"
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-white/48">
              <FileText
                className="h-[14px] w-[14px]"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold leading-tight text-zinc-100/88 sm:text-[14px]">
                {getMonumentNoteTitle(note)}
              </p>
              <p className="mt-px truncate text-[10px] font-normal leading-none text-white/38">
                {getMonumentNotePreview(note)}
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                handleToggleBookmark(note.id);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/28 transition hover:bg-white/[0.055] hover:text-white/68"
              aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
            >
              <Bookmark
                className={cn(
                  "h-3.5 w-3.5",
                  note.isBookmarked
                    ? "fill-white/70 text-white/70"
                    : "text-white/28"
                )}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </button>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-white/22 transition group-hover:text-white/42"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </Link>
        ))}


        </div>
      ) : null}

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
