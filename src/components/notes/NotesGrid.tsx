"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteCard } from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";
import { cn } from "@/lib/utils";

type MemoNoteGroup = {
  containerId: string;
  habitId: string;
  habitName: string;
  notes: Array<{ note: Note; sequence: number | null }>;
};

function MemoFolderCard({
  group,
  skillId,
}: {
  group: MemoNoteGroup;
  skillId: string;
}) {
  const memoCount = group.notes.length;
  return (
    <div className="col-span-3 sm:col-span-2 md:col-span-3">
      <Card className="h-full rounded-3xl border border-white/70 bg-white/80 text-slate-900 shadow-[0_26px_60px_-32px_rgba(148,163,184,0.55)] backdrop-blur-xl">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Memo habit
              </p>
              <h3 className="text-lg font-semibold text-slate-900">
                {group.habitName || "Memo habit"}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                {memoCount} memo{memoCount === 1 ? "" : "s"}
              </span>
              <Link
                href={`/skills/${skillId}/notes/${group.containerId}`}
                className="text-xs font-medium text-slate-700 underline-offset-4 transition hover:text-slate-900 hover:underline"
              >
                Open page
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {group.notes.map(({ note, sequence }, index) => {
              const label = sequence !== null ? `Memo #${sequence}` : `Memo ${index + 1}`;
              const createdAt = note.createdAt ? new Date(note.createdAt) : null;
              const dateLabel =
                createdAt && !Number.isNaN(createdAt.getTime())
                  ? createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "View";
              return (
                <Link
                  key={note.id}
                  href={`/skills/${skillId}/notes/${note.id}`}
                  className="group flex items-center justify-between rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-white hover:bg-white/90 hover:text-slate-900"
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-slate-600 group-hover:text-slate-800">
                    {dateLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface NotesGridProps {
  skillId: string;
}

export function NotesGrid({ skillId }: NotesGridProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);

    (async () => {
      try {
        const fetchedNotes = await getNotes(skillId);
        if (!isMounted) return;
        setNotes(fetchedNotes);
      } catch (error) {
        console.error("Failed to fetch skill notes", { error, skillId });
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
  }, [skillId]);

  const { memoGroups, regularNotes, childLookup } = useMemo(() => {
    if (notes.length === 0) {
      return {
        memoGroups: [] as MemoNoteGroup[],
        regularNotes: [] as Note[],
        childLookup: new Map<string, Note[]>(),
      };
    }

    const childrenByParent = new Map<string, Note[]>();
    const topLevelNotes: Note[] = [];

    for (const note of notes) {
      if (note.parentNoteId) {
        const existing = childrenByParent.get(note.parentNoteId) ?? [];
        existing.push(note);
        childrenByParent.set(note.parentNoteId, existing);
      } else {
        topLevelNotes.push(note);
      }
    }

    const sortChildren = (list: Note[]) =>
      [...list].sort((a, b) => {
        const aOrder = a.siblingOrder ?? Number.POSITIVE_INFINITY;
        const bOrder = b.siblingOrder ?? Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });

    const sortedChildrenByParent = new Map<string, Note[]>();
    for (const [parentId, list] of childrenByParent.entries()) {
      sortedChildrenByParent.set(parentId, sortChildren(list));
    }

    const parseSequence = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const memoGroups: MemoNoteGroup[] = [];
    const regularNotes: Note[] = [];

    for (const note of topLevelNotes) {
      const metadata = (note.metadata ?? null) as Record<string, unknown> | null;
      const memoHabitId =
        metadata && typeof metadata.memoHabitContainerForId === "string" && metadata.memoHabitContainerForId.trim()
          ? String(metadata.memoHabitContainerForId)
          : null;

      if (memoHabitId) {
        const memoHabitName =
          metadata && typeof metadata.memoHabitName === "string" && metadata.memoHabitName.trim()
            ? String(metadata.memoHabitName)
            : note.title?.trim() || "Memo habit";

        const childNotes = sortedChildrenByParent.get(note.id) ?? [];
        const memoNotes = childNotes.map((child, index) => {
          const childMetadata = (child.metadata ?? null) as Record<string, unknown> | null;
          const sequence = parseSequence(childMetadata?.memoSequence);
          return { note: child, sequence, index };
        });

        memoNotes.sort((a, b) => {
          if (a.sequence !== null && b.sequence !== null) {
            return a.sequence - b.sequence;
          }
          if (a.sequence !== null) return -1;
          if (b.sequence !== null) return 1;
          return a.index - b.index;
        });

        memoGroups.push({
          containerId: note.id,
          habitId: memoHabitId,
          habitName: memoHabitName,
          notes: memoNotes.map(({ note: memoNote, sequence }) => ({
            note: memoNote,
            sequence,
          })),
        });
      } else {
        regularNotes.push(note);
      }
    }

    memoGroups.sort((a, b) => a.habitName.localeCompare(b.habitName));
    regularNotes.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    return { memoGroups, regularNotes, childLookup: sortedChildrenByParent };
  }, [notes]);

  const hasTopLevelNotes = memoGroups.length > 0 || regularNotes.length > 0;
  const showEmptyState = !isLoading && !hasTopLevelNotes;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="rounded-3xl border border-white/70 bg-white/80 text-slate-700 shadow-[0_24px_60px_-32px_rgba(148,163,184,0.55)] backdrop-blur-xl">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-900">Loading notes…</p>
            <p className="mt-1 text-xs text-slate-600">
              We’re pulling your notes from Supabase.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {memoGroups.map((group) => (
          <MemoFolderCard key={group.habitId} group={group} skillId={skillId} />
        ))}

        {regularNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            skillId={skillId}
            childCount={childLookup.get(note.id)?.length ?? 0}
          />
        ))}

        {showEmptyState ? (
          <Card className="flex h-full flex-col justify-center rounded-3xl border border-white/70 bg-white/75 text-slate-600 shadow-[0_22px_56px_-30px_rgba(148,163,184,0.45)] backdrop-blur-xl">
            <CardContent className="p-4 text-center text-sm">
              No notes yet. Start capturing insights with the button below.
            </CardContent>
          </Card>
        ) : null}

        {(() => {
          const regularNoteCount = regularNotes.length;
          const hasAnyNotes = hasTopLevelNotes;
          const remainder = regularNoteCount % 3;
          const spanClass = !hasAnyNotes
            ? "col-span-3"
            : remainder === 0
              ? "col-span-3"
              : remainder === 1
                ? "col-span-2"
                : "col-span-1";
          const isBarVariant = hasAnyNotes && remainder === 0;
          const showLabel = !hasAnyNotes || isBarVariant;
          const labelText = !hasAnyNotes ? "Create note" : "Add note";

          return (
            <Link
              href={`/skills/${skillId}/notes/new`}
              className={cn("group block", spanClass)}
            >
              <Card
                className={cn(
                  "gap-0 border border-white/70 bg-white/60 text-slate-700 shadow-[0_18px_48px_-28px_rgba(148,163,184,0.45)] backdrop-blur-xl transition hover:border-white hover:bg-white/80 hover:text-slate-900",
                  isBarVariant
                    ? "flex h-12 items-center justify-center rounded-2xl py-0"
                    : "flex h-full items-center justify-center rounded-3xl py-0 min-h-[6.75rem]"
                )}
              >
                <CardContent
                  className={cn(
                    "flex items-center justify-center gap-2 text-sm font-semibold text-slate-800",
                    isBarVariant ? "px-4 py-2 uppercase tracking-[0.24em]" : "p-4"
                  )}
                >
                  <Plus className={cn(isBarVariant ? "h-4 w-4" : "h-5 w-5")} />
                  {showLabel ? <span>{labelText}</span> : null}
                </CardContent>
              </Card>
            </Link>
          );
        })()}
      </div>
    </div>
  );
}
