"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MonumentNote } from "@/lib/types/monument-note";
import { getMonumentNotes } from "@/lib/monumentNotesStorage";
import { cn } from "@/lib/utils";
import { MonumentNoteCard } from "./MonumentNoteCard";

interface MonumentNotesGridProps {
  monumentId: string;
}

export function MonumentNotesGrid({ monumentId }: MonumentNotesGridProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="rounded-3xl border border-white/70 bg-white/80 p-6 text-slate-700 shadow-[0_28px_70px_-36px_rgba(148,163,184,0.55)] backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-900">Loading notes…</p>
          <p className="mt-2 text-xs text-slate-600">Fetching your saved thoughts from Supabase.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {!hasNotes ? (
            <Card className="rounded-3xl border border-white/70 bg-white/80 p-6 text-slate-700 shadow-[0_28px_70px_-36px_rgba(148,163,184,0.55)] backdrop-blur-xl">
              <p className="text-sm font-medium text-slate-900">No notes yet</p>
              <p className="mt-2 text-xs text-slate-600">
                Capture your first thought here and keep ideas close at hand.
              </p>
            </Card>
          ) : null}

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visibleNotes.map((note) => (
              <MonumentNoteCard
                key={note.id}
                note={note}
                monumentId={monumentId}
              />
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
                  className={cn("group block", spanClass)}
                  aria-label={hasNotes ? "Add note" : "Create note"}
                >
                  <Card
                    className={cn(
                      "border border-white/70 bg-white/60 text-slate-700 shadow-[0_18px_48px_-28px_rgba(148,163,184,0.45)] backdrop-blur-xl transition hover:border-white hover:bg-white/80 hover:text-slate-900",
                      isBarVariant
                        ? "flex h-12 items-center justify-center rounded-2xl py-0"
                        : "flex h-full items-center justify-center rounded-3xl py-0 min-h-[6.75rem]"
                    )}
                  >
                    <CardContent
                      className={cn(
                        "flex items-center justify-center text-slate-800",
                        isBarVariant ? "px-4 py-2" : "p-4"
                      )}
                    >
                      <Plus className={cn(isBarVariant ? "h-4 w-4" : "h-5 w-5")} />
                      <span className="sr-only">{hasNotes ? "Add note" : "Create note"}</span>
                    </CardContent>
                  </Card>
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
      )}
    </div>
  );
}
