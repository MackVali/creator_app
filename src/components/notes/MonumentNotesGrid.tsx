"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import {
  createMonumentNote,
  getMonumentNotes,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import { MonumentNoteCard } from "./MonumentNoteCard";
import { NotesHeaderControls } from "./NotesHeaderControls";
import { NoteCreatePicker } from "./NoteCreatePicker";
import {
  createTopLevelDatabaseNotePayload,
  getTopLevelDatabaseNoteDisplay,
} from "@/lib/topLevelDatabaseNotes";

interface MonumentNotesGridProps {
  monumentId: string;
  initialNotes: MonumentNote[];
}

const monumentNoteActionOuterClass =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.12),transparent_56%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(18,18,21,0.96)_48%,rgba(42,42,48,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 sm:p-4";

const monumentNoteActionInnerClass =
  "relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center text-center";

export function MonumentNotesGrid({ monumentId, initialNotes }: MonumentNotesGridProps) {
  const router = useRouter();
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [notes, setNotes] = useState<MonumentNote[]>(initialNotes ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const latestInitialNotesRef = useRef(initialNotes ?? []);

  useEffect(() => {
    latestInitialNotesRef.current = initialNotes ?? [];
  }, [initialNotes]);

  useEffect(() => {
    setShowAllNotes(false);
    setSearchQuery("");
    setNotes(latestInitialNotesRef.current);
  }, [monumentId]);

  useEffect(() => {
    let isMounted = true;
    async function loadNotes() {
      if (!monumentId) return;
      setIsLoading(true);
      const fetched = await getMonumentNotes(monumentId);
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
  }, [monumentId]);

  const filteredNotes = notes.filter((note) => {
    const title = note.title?.toLowerCase() ?? "";
    const content = note.content?.toLowerCase() ?? "";
    const databaseTitle =
      getTopLevelDatabaseNoteDisplay(note.metadata)?.title.toLowerCase() ?? "";
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return title.includes(q) || content.includes(q) || databaseTitle.includes(q);
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

  function handleCreateNote() {
    router.push(`/monuments/${monumentId}/notes/new`);
  }

  async function handleCreateDatabase() {
    const payload = createTopLevelDatabaseNotePayload();
    const created = await createMonumentNote(monumentId, payload.note, {
      metadata: payload.metadata,
    });
    if (!created) return;

    setNotes((currentNotes) => [...currentNotes, created]);
    setShowAllNotes(true);
  }

  return (
    <div className="max-w-full space-y-3">
      <NotesHeaderControls searchQuery={searchQuery} onSearchChange={setSearchQuery} />
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

      <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibleNotes.map((note) => (
          <MonumentNoteCard
            key={note.id}
            note={note}
            monumentId={monumentId}
            onToggleBookmark={handleToggleBookmark}
          />
        ))}

        <NoteCreatePicker
          label={hasAnyNotes ? "Add note" : "Create note"}
          className={monumentNoteActionOuterClass}
          innerClassName={monumentNoteActionInnerClass}
          onCreateNote={handleCreateNote}
          onCreateDatabase={handleCreateDatabase}
        />
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
