"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  NoteCard,
  skillNoteTileInnerClass,
  skillNoteTileOuterClass,
} from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";
import { cn } from "@/lib/utils";
import { NotesHeaderControls } from "./NotesHeaderControls";

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
      <Card className="h-full rounded-[22px] border border-white/[0.08] bg-[#050608]/85 py-0 text-slate-50 shadow-[0_18px_36px_-28px_rgba(0,0,0,0.95),0_6px_18px_-14px_rgba(0,0,0,0.88)] backdrop-blur">
        <CardContent className="space-y-3 p-3">
          <div className="flex items-start justify-between gap-3 rounded-[18px] border border-white/[0.06] bg-[linear-gradient(135deg,rgba(18,20,25,0.84),rgba(7,8,11,0.92))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                Memo habit
              </p>
              <h3 className="text-base font-semibold leading-tight text-[#f2f4f8]">
                {group.habitName || "Memo habit"}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="rounded-full border border-white/[0.1] bg-black/25 px-2.5 py-0.5 text-[11px] font-medium text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                {memoCount} memo{memoCount === 1 ? "" : "s"}
              </span>
              <Link
                href={`/skills/${skillId}/notes/${group.containerId}`}
                className="text-[11px] font-medium text-white/65 underline-offset-4 transition hover:text-white hover:underline"
              >
                Open page
              </Link>
            </div>
          </div>
          <div className="space-y-1.5">
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
                  className="group flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0b0d12]/75 px-2.5 py-1.5 text-xs text-white/80 shadow-[0_8px_18px_-16px_rgba(0,0,0,0.9)] transition hover:border-white/[0.16] hover:bg-[#10131a] hover:text-white"
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-[11px] text-white/50 group-hover:text-white/70">
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
  const [searchQuery, setSearchQuery] = useState("");

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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

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
  const visibleMemoGroups = useMemo(() => {
    if (!normalizedSearchQuery) return memoGroups;

    return memoGroups
      .map((group) => {
        const groupMatches = group.habitName.toLowerCase().includes(normalizedSearchQuery);
        if (groupMatches) return group;

        const matchingNotes = group.notes.filter(({ note }) => {
          const title = note.title?.toLowerCase() ?? "";
          const content = note.content?.toLowerCase() ?? "";
          return title.includes(normalizedSearchQuery) || content.includes(normalizedSearchQuery);
        });

        return matchingNotes.length > 0 ? { ...group, notes: matchingNotes } : null;
      })
      .filter((group): group is MemoNoteGroup => group !== null);
  }, [memoGroups, normalizedSearchQuery]);
  const visibleRegularNotes = useMemo(() => {
    if (!normalizedSearchQuery) return regularNotes;

    return regularNotes.filter((note) => {
      const title = note.title?.toLowerCase() ?? "";
      const content = note.content?.toLowerCase() ?? "";
      return title.includes(normalizedSearchQuery) || content.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, regularNotes]);
  const hasVisibleTopLevelNotes = visibleMemoGroups.length > 0 || visibleRegularNotes.length > 0;

  return (
    <div className="space-y-3">
      <NotesHeaderControls searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      {isLoading ? (
        <Card className="rounded-[22px] border border-white/[0.08] bg-[#050608]/85 py-0 text-slate-50 shadow-[0_18px_36px_-28px_rgba(0,0,0,0.95),0_6px_18px_-14px_rgba(0,0,0,0.88)] backdrop-blur">
          <CardContent className="p-3">
            <p className="text-sm font-medium text-[#f2f4f8]">Loading notes...</p>
            <p className="mt-1 text-xs text-white/55">
              {"We're pulling your notes from Supabase."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {hasTopLevelNotes && !hasVisibleTopLevelNotes && !isLoading ? (
        <div className={cn(skillNoteTileOuterClass, "col-span-3 w-full")}>
          <div
            className={cn(
              skillNoteTileInnerClass,
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

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibleMemoGroups.map((group) => (
          <MemoFolderCard key={group.habitId} group={group} skillId={skillId} />
        ))}

        {visibleRegularNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            skillId={skillId}
            childCount={childLookup.get(note.id)?.length ?? 0}
          />
        ))}

        {(() => {
          const regularNoteCount = visibleRegularNotes.length;
          const hasAnyVisibleNotes = hasVisibleTopLevelNotes;
          const remainder = regularNoteCount % 3;
          const spanClass = !hasAnyVisibleNotes
            ? "col-span-3"
            : remainder === 0
              ? "col-span-3"
              : remainder === 1
                ? "col-span-2"
                : "col-span-1";
          const isBarVariant = hasAnyVisibleNotes && remainder === 0;
          return (
            <Link
              href={`/skills/${skillId}/notes/new`}
              className={cn(skillNoteTileOuterClass, spanClass)}
              aria-label={hasTopLevelNotes ? "Add note" : "Create note"}
            >
              <div
                className={cn(
                  skillNoteTileInnerClass,
                  "items-center justify-center gap-2 text-center",
                  isBarVariant ? "min-h-[4.25rem] flex-row text-left" : "min-h-[4.25rem] flex-col"
                )}
              >
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-2xl border border-white/[0.12] bg-black/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_9px_18px_-14px_rgba(0,0,0,0.9)]">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <span className="relative z-10 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2f4f8]">
                  {hasTopLevelNotes ? "Add note" : "Create note"}
                </span>
              </div>
            </Link>
          );
        })()}
      </div>
    </div>
  );
}
