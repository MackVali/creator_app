"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Folder, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";
import { NotesHeaderControls } from "./NotesHeaderControls";

type MemoNoteGroup = {
  containerId: string;
  habitId: string;
  habitName: string;
  notes: Array<{ note: Note; sequence: number | null }>;
};

interface NotesGridProps {
  skillId: string;
}

const skillNotesListSurfaceClass =
  "overflow-hidden border-y border-white/[0.06] bg-white/[0.025] sm:rounded-xl sm:border-x";

function getSkillNoteTitle(note: Note) {
  const noteTitle = note.title?.trim();
  return noteTitle && noteTitle.length > 0
    ? noteTitle
    : note.content
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? "Open this note to add a title.";
}

function getSkillNotePreview(note: Note, childCount: number) {
  const preview = note.content
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (preview) return preview;
  if (childCount > 0) {
    return `${childCount} sub-page${childCount === 1 ? "" : "s"}`;
  }
  return "No preview";
}

export function NotesGrid({ skillId }: NotesGridProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const handleSkillNotesChanged = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const changedSkillId =
        typeof event.detail?.skillId === "string" ? event.detail.skillId : null;
      if (changedSkillId === skillId) {
        setReloadToken((current) => current + 1);
      }
    };

    window.addEventListener("creator:skill-notes-changed", handleSkillNotesChanged);
    return () => {
      window.removeEventListener("creator:skill-notes-changed", handleSkillNotesChanged);
    };
  }, [skillId]);

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
  }, [skillId, reloadToken]);

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
      <NotesHeaderControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
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
        <div className="w-full rounded-2xl border border-white/[0.08] bg-[#07080A] px-3 py-3 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
          <p className="text-sm font-semibold tracking-tight text-white/90">
            No matching notes
          </p>
          <p className="text-xs leading-5 text-white/50">
            Try a different search.
          </p>
        </div>
      ) : null}

      {!hasTopLevelNotes && !isLoading ? (
        <Link
          href={`/skills/${skillId}/notes/new`}
          className="flex min-h-[64px] items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5"
          aria-label="Create note"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg"
            aria-hidden="true"
          >
            <Plus className="h-4 w-4 text-white/45" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium leading-tight text-white/84">
              No notes linked yet
            </h3>
            <p className="mt-0.5 text-[11px] leading-4 text-white/48">
              Create a note for this skill to keep ideas and references close.
            </p>
          </div>
        </Link>
      ) : (
        <div className={skillNotesListSurfaceClass}>
          {visibleMemoGroups.map((group) => {
            const memoCount = group.notes.length;
            return (
              <Link
                key={group.habitId}
                href={`/skills/${skillId}/notes/${group.containerId}`}
                className="group flex min-h-[54px] items-center gap-2.5 border-b border-white/[0.06] px-3 py-2 text-white transition last:border-b-0 hover:bg-white/[0.045] active:bg-white/[0.065]"
                aria-label={`Open ${group.habitName || "Memo habit"} memo notes`}
              >
                <Folder
                  className="h-3.5 w-3.5 shrink-0 text-white/45"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-5 text-white/88">
                    {group.habitName || "Memo habit"}
                  </p>
                  <p className="truncate text-[11px] leading-4 text-white/42">
                    {memoCount} memo{memoCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-white/24 transition group-hover:text-white/45"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </Link>
            );
          })}

          {visibleRegularNotes.map((note) => {
            const childCount = childLookup.get(note.id)?.length ?? 0;
            return (
              <Link
                key={note.id}
                href={`/skills/${skillId}/notes/${note.id}`}
                className="group flex min-h-[54px] items-center gap-2.5 border-b border-white/[0.06] px-3 py-2 text-white transition last:border-b-0 hover:bg-white/[0.045] active:bg-white/[0.065]"
              >
                <FileText
                  className="h-3.5 w-3.5 shrink-0 text-white/45"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-5 text-white/88">
                    {getSkillNoteTitle(note)}
                  </p>
                  <p className="truncate text-[11px] leading-4 text-white/42">
                    {getSkillNotePreview(note, childCount)}
                  </p>
                </div>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-white/24 transition group-hover:text-white/45"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </Link>
            );
          })}

          <Link
            href={`/skills/${skillId}/notes/new`}
            className="flex min-h-[54px] items-center gap-2.5 border-t border-white/[0.06] px-3 py-2 text-white/68 transition hover:bg-white/[0.045] hover:text-white active:bg-white/[0.065]"
            aria-label="Add note"
          >
            <Plus
              className="h-3.5 w-3.5 shrink-0 text-white/45"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium">Add note</span>
          </Link>
        </div>
      )}
    </div>
  );
}
