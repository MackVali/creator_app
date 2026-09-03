"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight, FileText, Plus } from "lucide-react";

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
  "-mx-3 overflow-hidden border-y border-white/[0.06] bg-white/[0.025] sm:mx-0 sm:rounded-xl sm:border-x";

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
    <div className="max-w-full space-y-3">
      <NotesHeaderControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {hasAnyNotes && !hasVisibleNotes && !isLoading ? (
        <div className="w-full rounded-2xl border border-white/[0.08] bg-[#07080A] px-3 py-3 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
          <p className="text-sm font-semibold tracking-tight text-white/90">
            No matching notes
          </p>
          <p className="text-xs leading-5 text-white/50">
            Try a different search.
          </p>
        </div>
      ) : null}

      <div className={monumentNoteListSurfaceClass}>
        {visibleNotes.map((note) => (
          <Link
            key={note.id}
            href={
              sourceType === "area"
                ? `/areas/${areaId}/notes/${note.id}`
                : `/monuments/${monumentId}/notes/${note.id}`
            }
            className="group flex min-h-[54px] items-center gap-2.5 border-b border-white/[0.06] px-3 py-2 text-white transition last:border-b-0 hover:bg-white/[0.045] active:bg-white/[0.065]"
          >
            <FileText
              className="h-3.5 w-3.5 shrink-0 text-white/45"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-5 text-white/88">
                {getMonumentNoteTitle(note)}
              </p>
              <p className="truncate text-[11px] leading-4 text-white/42">
                {getMonumentNotePreview(note)}
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                handleToggleBookmark(note.id);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/32 transition hover:bg-white/[0.06] hover:text-white/70"
              aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
            >
              <Bookmark
                className={cn(
                  "h-3.5 w-3.5",
                  note.isBookmarked ? "fill-white/72 text-white/72" : ""
                )}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </button>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-white/24 transition group-hover:text-white/45"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </Link>
        ))}

        <Link
          href={
            sourceType === "area"
              ? `/areas/${areaId}/notes/new`
              : `/monuments/${monumentId}/notes/new`
          }
          className="flex min-h-[54px] items-center gap-2.5 border-t border-white/[0.06] px-3 py-2 text-white/68 transition hover:bg-white/[0.045] hover:text-white active:bg-white/[0.065]"
          aria-label={hasAnyNotes ? "Add note" : "Create note"}
        >
          <Plus
            className="h-3.5 w-3.5 shrink-0 text-white/45"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium">
            {hasAnyNotes ? "Add note" : "Create note"}
          </span>
        </Link>
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
