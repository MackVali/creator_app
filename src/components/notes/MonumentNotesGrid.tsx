"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import { getMonumentNotes } from "@/lib/monumentNotesStorage";
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

  const hasNotes = notes.length > 0;
  const hasMoreNotes = notes.length > 3;
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);

  return (
    <div className="space-y-4">
      {!hasNotes && !isLoading ? (
        <div className={cn(monumentNoteTileOuterClass, "max-w-md")}>
          <div
            className={cn(
              monumentNoteTileInnerClass,
              "flex flex-col justify-center gap-1 bg-white text-center"
            )}
          >
            <p className="text-sm font-semibold text-slate-900">No notes yet</p>
            <p className="text-xs font-medium text-slate-600">
              Capture your first thought here and keep ideas close at hand.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibleNotes.map((note) => (
          <MonumentNoteCard key={note.id} note={note} monumentId={monumentId} />
        ))}

        {(() => {
          const remainder = visibleNotes.length % 3;
          const spanClass = !hasNotes
            ? "col-span-3"
            : remainder === 0
              ? "col-span-3"
              : remainder === 1
                ? "col-span-2"
                : "col-span-1";
          const isBarVariant = hasNotes && remainder === 0;

          return (
            <Link
              href={`/monuments/${monumentId}/notes/new`}
              className={cn(monumentNoteTileOuterClass, spanClass)}
              aria-label={hasNotes ? "Add note" : "Create note"}
            >
              <div
                className={cn(
                  monumentNoteTileInnerClass,
                  "items-center justify-center gap-2 text-center",
                  isBarVariant ? "min-h-[4.5rem] flex-row text-left" : "flex-col"
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950/10 text-slate-900">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
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
