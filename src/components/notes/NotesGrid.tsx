"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteCard } from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";

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
    <div className="sm:col-span-2 md:col-span-3">
      <Card className="h-full border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-purple-900/30 to-purple-900/20 text-white shadow-[0_24px_48px_rgba(76,29,149,0.28)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-purple-200/70">
                Memo habit
              </p>
              <h3 className="text-lg font-semibold text-white">
                {group.habitName || "Memo habit"}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full border border-purple-500/50 bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-100">
                {memoCount} memo{memoCount === 1 ? "" : "s"}
              </span>
              <Link
                href={`/skills/${skillId}/notes/${group.containerId}`}
                className="text-xs font-medium text-purple-100 underline-offset-4 transition hover:text-white hover:underline"
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
                  className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:border-purple-300/40 hover:bg-purple-500/20 hover:text-white"
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-white/60 group-hover:text-white/85">
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
        <Card className="border border-white/10 bg-white/5 text-white/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-white/80">Loading notes…</p>
            <p className="mt-1 text-xs text-white/60">
              We’re pulling your notes from Supabase.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
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
          <Card className="flex h-full flex-col justify-center border-dashed border-white/10 bg-white/5 text-white/60">
            <CardContent className="p-4 text-center text-sm">
              No notes yet. Start capturing insights with the button below.
            </CardContent>
          </Card>
        ) : null}

        <Link href={`/skills/${skillId}/notes/new`}>
          <Card className="flex h-full items-center justify-center border-dashed border-white/20 bg-transparent text-white/80 transition-colors hover:bg-white/10">
            <CardContent className="flex items-center justify-center p-4">
              <Plus className="h-5 w-5" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
