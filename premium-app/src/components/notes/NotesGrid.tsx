"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteCard } from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";

type MemoNoteGroup = {
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
            <span className="rounded-full border border-purple-500/50 bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-100">
              {memoCount} memo{memoCount === 1 ? "" : "s"}
            </span>
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

  const memoGroups = useMemo<MemoNoteGroup[]>(() => {
    if (notes.length === 0) return [];

    const groups = new Map<string, MemoNoteGroup>();

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

    for (const note of notes) {
      const metadata = (note.metadata ?? null) as Record<string, unknown> | null;
      const memoHabitId =
        metadata && typeof metadata.memoHabitId === "string" && metadata.memoHabitId.trim()
          ? String(metadata.memoHabitId)
          : null;
      if (!memoHabitId) continue;

      const memoHabitName =
        metadata && typeof metadata.memoHabitName === "string" && metadata.memoHabitName.trim()
          ? String(metadata.memoHabitName)
          : "Memo habit";
      const sequence = parseSequence(metadata?.memoSequence);

      const existing = groups.get(memoHabitId);
      const nextEntry: MemoNoteGroup =
        existing ?? {
          habitId: memoHabitId,
          habitName: memoHabitName,
          notes: [],
        };

      nextEntry.habitName = memoHabitName;
      nextEntry.notes.push({ note, sequence });
      groups.set(memoHabitId, nextEntry);
    }

    return Array.from(groups.values())
      .map((group) => {
        group.notes.sort((a, b) => {
          if (a.sequence !== null && b.sequence !== null) {
            return a.sequence - b.sequence;
          }
          if (a.sequence !== null) return -1;
          if (b.sequence !== null) return 1;
          const aTime = a.note.createdAt ? new Date(a.note.createdAt).getTime() : 0;
          const bTime = b.note.createdAt ? new Date(b.note.createdAt).getTime() : 0;
          return aTime - bTime;
        });
        return group;
      })
      .sort((a, b) => a.habitName.localeCompare(b.habitName));
  }, [notes]);

  const regularNotes = useMemo(() => {
    if (notes.length === 0) return [];
    return notes.filter((note) => {
      const metadata = (note.metadata ?? null) as Record<string, unknown> | null;
      const memoHabitId =
        metadata && typeof metadata.memoHabitId === "string" && metadata.memoHabitId.trim()
          ? String(metadata.memoHabitId)
          : null;
      return !memoHabitId;
    });
  }, [notes]);

  const hasNotes = notes.length > 0;
  const showEmptyState = !isLoading && !hasNotes;

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
          <NoteCard key={note.id} note={note} skillId={skillId} />
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
