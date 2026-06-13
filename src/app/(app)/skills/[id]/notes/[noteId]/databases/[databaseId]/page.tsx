"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  NoteDatabaseFocusedView,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
} from "@/components/notes/NoteSlashTextarea";
import { getNote, updateSkillNote } from "@/lib/notesStorage";
import type { Note } from "@/lib/types/note";

function getMetadataDatabases(
  metadata: Record<string, unknown> | null | undefined,
): NoteDatabaseDefinitions {
  const databases = metadata?.databases;
  return databases && typeof databases === "object" && !Array.isArray(databases)
    ? (databases as NoteDatabaseDefinitions)
    : {};
}

function getMetadataDatabaseEntries(
  metadata: Record<string, unknown> | null | undefined,
): NoteDatabaseEntries {
  const databaseEntries = metadata?.databaseEntries;
  return databaseEntries && typeof databaseEntries === "object" && !Array.isArray(databaseEntries)
    ? (databaseEntries as NoteDatabaseEntries)
    : {};
}

function getNoteTitle(note: Note | null) {
  if (!note) return "Untitled";
  return (
    note.title?.trim() ||
    note.content
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ||
    "Untitled"
  );
}

export default function SkillNoteDatabasePage() {
  const params = useParams();
  const router = useRouter();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const databaseId = params.databaseId as string;
  const [note, setNote] = useState<Note | null>(null);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    (async () => {
      try {
        const fetchedNote = await getNote(skillId, noteId);
        if (!isMounted) return;

        setNote(fetchedNote);
        setNoteMetadata(fetchedNote?.metadata ?? null);
        setLastSavedSnapshot(JSON.stringify(fetchedNote?.metadata ?? null));
      } catch (error) {
        console.error("Failed to load skill note database", {
          error,
          skillId,
          noteId,
          databaseId,
        });
        if (!isMounted) return;
        setNote(null);
        setNoteMetadata(null);
        setLastSavedSnapshot("");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [databaseId, noteId, skillId]);

  useEffect(() => {
    if (isLoading || isSaving || !note) return;

    const nextSnapshot = JSON.stringify(noteMetadata ?? null);
    if (nextSnapshot === lastSavedSnapshot) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const saved = await updateSkillNote(
          skillId,
          note.id,
          {
            title: note.title ?? "Untitled",
            content: note.content ?? "",
          },
          { metadata: noteMetadata },
        );

        if (!saved) return;

        setNote(saved);
        setNoteMetadata(saved.metadata ?? noteMetadata);
        setLastSavedSnapshot(JSON.stringify(saved.metadata ?? noteMetadata ?? null));
        window.dispatchEvent(new Event("creator:pinned-body-databases-changed"));
        window.dispatchEvent(
          new CustomEvent("creator:skill-notes-changed", {
            detail: { skillId, noteId: saved.id },
          }),
        );
      } catch (error) {
        console.error("Failed to save skill note database", {
          error,
          skillId,
          noteId,
          databaseId,
        });
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [databaseId, isLoading, isSaving, lastSavedSnapshot, note, noteId, noteMetadata, skillId]);

  function handleBack() {
    router.push(`/skills/${skillId}/notes/${noteId}`);
  }

  function handleDatabaseDefinitionsChange(databases: NoteDatabaseDefinitions) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databases }));
  }

  function handleDatabaseEntriesChange(databaseEntries: NoteDatabaseEntries) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databaseEntries }));
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 pb-[calc(8rem_+_env(safe-area-inset-bottom,0px))] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] text-white sm:pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
      <div className="mx-auto w-full max-w-6xl">
        {isLoading ? (
          <section className="rounded-[22px] border border-white/[0.08] bg-[#050505]/92 p-4 text-sm text-white/60 sm:p-5">
            Loading database...
          </section>
        ) : (
          <NoteDatabaseFocusedView
            autosaveLabel={isSaving ? "Saving..." : "Autosaved"}
            databaseDefinitions={getMetadataDatabases(noteMetadata)}
            databaseEntries={getMetadataDatabaseEntries(noteMetadata)}
            databaseId={databaseId}
            noteContent={note?.content ?? ""}
            noteTitle={getNoteTitle(note)}
            onBack={handleBack}
            onDatabaseDefinitionsChange={handleDatabaseDefinitionsChange}
            onDatabaseEntriesChange={handleDatabaseEntriesChange}
          />
        )}
      </div>
    </main>
  );
}
