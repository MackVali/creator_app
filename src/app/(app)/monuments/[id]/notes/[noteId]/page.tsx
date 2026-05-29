"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteTextActionBar } from "@/components/notes/NoteTextActionBar";
import {
  NoteSlashTextarea,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
  type NoteSlashTextareaHandle,
} from "@/components/notes/NoteSlashTextarea";
import { Button } from "@/components/ui/button";
import {
  createMonumentNote,
  getMonumentNote,
  getMonumentNotes,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import type { MonumentNote } from "@/lib/types/monument-note";

const DEFAULT_NOTE_ICON = "📝";

function getMetadataIcon(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.icon === "string" && metadata.icon.trim()
    ? metadata.icon
    : DEFAULT_NOTE_ICON;
}

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

function buildNoteMetadata(
  metadata: Record<string, unknown> | null | undefined,
  icon: string,
  bookmarked: boolean,
): Record<string, unknown> {
  return { ...(metadata ?? {}), icon, bookmarked };
}

function getNoteTitle(note: MonumentNote | null): string {
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

function createSaveSnapshot({
  title,
  content,
  icon,
  bookmarked,
  parentNoteId,
  metadata,
}: {
  title: string;
  content: string;
  icon: string;
  bookmarked: boolean;
  parentNoteId: string | null;
  metadata: Record<string, unknown> | null;
}) {
  return JSON.stringify({ title, content, icon, bookmarked, parentNoteId, metadata });
}

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;
  const noteTextareaRef = useRef<NoteSlashTextareaHandle | null>(null);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [noteIcon, setNoteIcon] = useState(DEFAULT_NOTE_ICON);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [parentNoteId, setParentNoteId] = useState<string | null>(null);
  const [children, setChildren] = useState<MonumentNote[]>([]);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteIcon(DEFAULT_NOTE_ICON);
      setIsBookmarked(false);
      setNoteMetadata(null);
      setParentNoteId(null);
      setChildren([]);
      setLastSavedSnapshot(
        createSaveSnapshot({
          title: "",
          content: "",
          icon: DEFAULT_NOTE_ICON,
          bookmarked: false,
          parentNoteId: null,
          metadata: buildNoteMetadata(null, DEFAULT_NOTE_ICON, false),
        }),
      );
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);

    (async () => {
      try {
        const note = await getMonumentNote(monumentId, noteId);
        if (!isMounted) return;

        if (note) {
          const childNotes = await getMonumentNotes(monumentId, { parentNoteId: noteId });
          if (!isMounted) return;

          const savedIcon = getMetadataIcon(note.metadata);
          setCurrentNoteId(note.id);
          setNoteTitle(note.title ?? "");
          setNoteContent(note.content ?? "");
          setNoteIcon(savedIcon);
          setIsBookmarked(note.metadata?.bookmarked === true);
          setNoteMetadata(note.metadata ?? null);
          setParentNoteId(note.parentNoteId ?? null);
          setChildren(childNotes);
          setLastSavedSnapshot(
            createSaveSnapshot({
              title: note.title ?? "",
              content: note.content ?? "",
              icon: savedIcon,
              bookmarked: note.metadata?.bookmarked === true,
              parentNoteId: note.parentNoteId ?? null,
              metadata: buildNoteMetadata(
                note.metadata,
                savedIcon,
                note.metadata?.bookmarked === true,
              ),
            }),
          );
        } else {
          setCurrentNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteIcon(DEFAULT_NOTE_ICON);
          setIsBookmarked(false);
          setNoteMetadata(null);
          setParentNoteId(null);
          setChildren([]);
          setLastSavedSnapshot("");
        }
      } catch (error) {
        console.error("Failed to load monument note", { error, monumentId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteTitle("");
        setNoteContent("");
        setNoteIcon(DEFAULT_NOTE_ICON);
        setIsBookmarked(false);
        setNoteMetadata(null);
        setParentNoteId(null);
        setChildren([]);
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
  }, [monumentId, noteId]);

  useEffect(() => {
    if (isLoading || isSaving) return;

    const hasDraft = noteTitle.trim().length > 0 || noteContent.trim().length > 0;
    if (!currentNoteId && !hasDraft) {
      return;
    }

    const nextSnapshot = createSaveSnapshot({
      title: noteTitle,
      content: noteContent,
      icon: noteIcon,
      bookmarked: isBookmarked,
      parentNoteId,
      metadata: buildNoteMetadata(noteMetadata, noteIcon, isBookmarked),
    });

    if (nextSnapshot === lastSavedSnapshot) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const metadata = buildNoteMetadata(noteMetadata, noteIcon, isBookmarked);
        const payload = {
          title: noteTitle.trim() || "Untitled",
          content: noteContent,
        };
        let saved: MonumentNote | null = null;

        if (currentNoteId) {
          saved = await updateMonumentNote(monumentId, currentNoteId, { ...payload, metadata });
        } else {
          saved = await createMonumentNote(monumentId, payload, { metadata });
        }

        if (!saved) return;

        setCurrentNoteId(saved.id);
        setNoteMetadata(saved.metadata ?? metadata);
        setLastSavedSnapshot(nextSnapshot);

        if (noteId === "new") {
          router.replace(`/monuments/${monumentId}/notes/${saved.id}`);
        }
      } catch (error) {
        console.error("Failed to autosave monument note", { error, monumentId, noteId });
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    currentNoteId,
    isBookmarked,
    isLoading,
    isSaving,
    lastSavedSnapshot,
    monumentId,
    noteContent,
    noteIcon,
    noteId,
    noteMetadata,
    noteTitle,
    parentNoteId,
    router,
  ]);

  async function handleCreateSubpage() {
    if (!currentNoteId) {
      return null;
    }

    const created = await createMonumentNote(
      monumentId,
      {
        title: "Untitled",
        content: "",
      },
      {
        metadata: { icon: DEFAULT_NOTE_ICON },
        parentNoteId: currentNoteId,
        siblingOrder: children.length,
      },
    );

    if (!created) {
      return null;
    }

    setChildren((current) => [...current, created]);
    return {
      id: created.id,
      title: getNoteTitle(created),
      href: `/monuments/${monumentId}/notes/${created.id}`,
    };
  }

  async function handleSubpageCreated(
    subpage: { id: string; title: string; href?: string },
    parentContent: string,
  ) {
    const href = subpage.href ?? `/monuments/${monumentId}/notes/${subpage.id}`;

    if (!currentNoteId) {
      console.error("Cannot save monument parent marker before opening subpage", {
        monumentId,
        currentNoteId,
        selectedParentId: parentNoteId,
        subpageId: subpage.id,
        href,
        parentContentLength: parentContent.length,
      });
      router.push(href);
      return;
    }

    setIsSaving(true);
    try {
      const metadata = buildNoteMetadata(noteMetadata, noteIcon, isBookmarked);
      const saved = await updateMonumentNote(monumentId, currentNoteId, {
        title: noteTitle.trim() || "Untitled",
        content: parentContent,
        metadata,
      });

      if (!saved) {
        console.error("Failed to save monument parent marker before opening subpage", {
          monumentId,
          currentNoteId,
          selectedParentId: parentNoteId,
          subpageId: subpage.id,
          href,
          parentContentLength: parentContent.length,
        });
      } else {
        setNoteMetadata(saved.metadata ?? metadata);
        setLastSavedSnapshot(
          createSaveSnapshot({
            title: noteTitle,
            content: parentContent,
            icon: noteIcon,
            bookmarked: isBookmarked,
            parentNoteId,
            metadata: buildNoteMetadata(saved.metadata ?? metadata, noteIcon, isBookmarked),
          }),
        );
      }
    } catch (error) {
      console.error("Failed to save parent monument note before opening subpage", {
        error,
        monumentId,
        currentNoteId,
        selectedParentId: parentNoteId,
        subpageId: subpage.id,
        href,
        parentContentLength: parentContent.length,
      });
    } finally {
      setIsSaving(false);
      router.push(href);
    }
  }

  function handleOpenSubpage(subpageId: string) {
    router.push(`/monuments/${monumentId}/notes/${subpageId}`);
  }

  function handleDatabaseDefinitionsChange(databases: NoteDatabaseDefinitions) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databases }));
  }

  function handleDatabaseEntriesChange(databaseEntries: NoteDatabaseEntries) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databaseEntries }));
  }

  function handleBack() {
    if (parentNoteId) {
      router.push(`/monuments/${monumentId}/notes/${parentNoteId}`);
      return;
    }

    router.push(`/monuments/${monumentId}`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 pb-[calc(10rem_+_env(safe-area-inset-bottom,0px))] pt-2 text-white sm:pb-[calc(9rem_+_env(safe-area-inset-bottom,0px))] sm:pt-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:gap-3">
        <div className="flex min-h-7 items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2 py-0 text-xs font-medium text-white/55 hover:bg-white/[0.06] hover:text-white/80"
            onClick={handleBack}
          >
            <ChevronLeft className="size-3.5" />
            Back
          </Button>
          <p className="text-[11px] font-medium leading-none text-white/38">
            {isSaving ? "Saving…" : "Autosaved"}
          </p>
        </div>

        <section className="rounded-[22px] border border-white/[0.07] bg-[#050505]/92 p-4 shadow-[0_18px_42px_-30px_rgba(0,0,0,0.95)] sm:p-5">
          {isLoading ? (
            <p className="text-sm text-white/60">Loading note…</p>
          ) : (
            <div className="space-y-4">
              <NoteEditorHeader
                icon={noteIcon}
                title={noteTitle}
                onIconChange={setNoteIcon}
                onTitleChange={setNoteTitle}
              />

              <NoteSlashTextarea
                ref={noteTextareaRef}
                value={noteContent}
                onValueChange={setNoteContent}
                databaseDefinitions={getMetadataDatabases(noteMetadata)}
                onDatabaseDefinitionsChange={handleDatabaseDefinitionsChange}
                databaseEntries={getMetadataDatabaseEntries(noteMetadata)}
                onDatabaseEntriesChange={handleDatabaseEntriesChange}
                onCreateSubpage={handleCreateSubpage}
                onSubpageCreated={handleSubpageCreated}
                onOpenSubpage={handleOpenSubpage}
                placeholder="Start typing, or press / for commands…"
                className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28"
                aria-label="Note editor"
              />
            </div>
          )}
        </section>

        {!isLoading ? (
          <NoteTextActionBar
            onFormat={(command) => noteTextareaRef.current?.applyTextFormat(command)}
          />
        ) : null}
      </div>
    </main>
  );
}
