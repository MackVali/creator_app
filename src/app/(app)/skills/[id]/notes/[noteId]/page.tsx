"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteTextActionBar } from "@/components/notes/NoteTextActionBar";
import {
  NoteSlashTextarea,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
  type NoteSlashTextareaHandle,
} from "@/components/notes/NoteSlashTextarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import {
  createSkillNote,
  getNote,
  getNoteWithChildren,
  getNotes,
  updateSkillNote,
} from "@/lib/notesStorage";
import type { Note } from "@/lib/types/note";

const ROOT_PARENT_VALUE = "__root__";
const DEFAULT_NOTE_ICON = "📝";

function getNoteTitle(note: Note | null): string {
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
): Record<string, unknown> {
  return { ...(metadata ?? {}), icon };
}

function createSaveSnapshot({
  title,
  content,
  icon,
  parentNoteId,
  metadata,
}: {
  title: string;
  content: string;
  icon: string;
  parentNoteId: string | null;
  metadata: Record<string, unknown> | null;
}) {
  return JSON.stringify({
    title,
    content,
    icon,
    parentNoteId,
    metadata,
  });
}

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const parentFromQuery = searchParams?.get("parent");
  const normalizedParentFromQuery = parentFromQuery ? String(parentFromQuery) : null;
  const noteTextareaRef = useRef<NoteSlashTextareaHandle | null>(null);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteIcon, setNoteIcon] = useState(DEFAULT_NOTE_ICON);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(normalizedParentFromQuery);
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [children, setChildren] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteIcon(DEFAULT_NOTE_ICON);
      setNoteMetadata(null);
      setChildren([]);
      setParentNote(null);
      setSelectedParentId(normalizedParentFromQuery);
      setLastSavedSnapshot(
        createSaveSnapshot({
          title: "",
          content: "",
          icon: DEFAULT_NOTE_ICON,
          parentNoteId: normalizedParentFromQuery,
          metadata: buildNoteMetadata(null, DEFAULT_NOTE_ICON),
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
        const result = await getNoteWithChildren(skillId, noteId);
        if (!isMounted) return;

        if (result) {
          const icon = getMetadataIcon(result.note.metadata);
          setCurrentNoteId(result.note.id);
          setNoteTitle(result.note.title ?? "");
          setNoteContent(result.note.content ?? "");
          setNoteIcon(icon);
          setNoteMetadata(result.note.metadata ?? null);
          setSelectedParentId(result.note.parentNoteId ?? null);
          setParentNote(result.parent);
          setChildren(result.children);
          setLastSavedSnapshot(
            createSaveSnapshot({
              title: result.note.title ?? "",
              content: result.note.content ?? "",
              icon,
              parentNoteId: result.note.parentNoteId ?? null,
              metadata: buildNoteMetadata(result.note.metadata, icon),
            }),
          );
        } else {
          setCurrentNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteIcon(DEFAULT_NOTE_ICON);
          setNoteMetadata(null);
          setLastSavedSnapshot("");
          setSelectedParentId(null);
          setParentNote(null);
          setChildren([]);
        }
      } catch (error) {
        console.error("Failed to load skill note", { error, skillId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteTitle("");
        setNoteContent("");
        setNoteIcon(DEFAULT_NOTE_ICON);
        setNoteMetadata(null);
        setLastSavedSnapshot("");
        setSelectedParentId(null);
        setParentNote(null);
        setChildren([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [skillId, noteId, normalizedParentFromQuery]);

  useEffect(() => {
    let isActive = true;
    setIsLoadingParents(true);

    (async () => {
      try {
        const options = await getNotes(skillId, { parentNoteId: null });
        if (!isActive) return;
        setParentOptions(options);
      } catch (error) {
        console.error("Failed to load parent options", { error, skillId });
        if (!isActive) return;
        setParentOptions([]);
      } finally {
        if (isActive) {
          setIsLoadingParents(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [skillId]);

  useEffect(() => {
    if (!selectedParentId) {
      setParentNote(null);
      return;
    }

    if (parentNote?.id === selectedParentId) {
      return;
    }

    let isActive = true;

    (async () => {
      try {
        const fetchedParent = await getNote(skillId, selectedParentId);
        if (!isActive) return;
        setParentNote(fetchedParent);
      } catch (error) {
        console.error("Failed to load parent note", {
          error,
          skillId,
          parentId: selectedParentId,
        });
        if (!isActive) return;
        setParentNote(null);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedParentId, skillId, parentNote?.id]);

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
      parentNoteId: selectedParentId,
      metadata: buildNoteMetadata(noteMetadata, noteIcon),
    });

    if (nextSnapshot === lastSavedSnapshot) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const metadata = buildNoteMetadata(noteMetadata, noteIcon);
        const payload = {
          title: noteTitle.trim() || "Untitled",
          content: noteContent,
        };
        let saved: Note | null = null;

        if (currentNoteId) {
          saved = await updateSkillNote(
            skillId,
            currentNoteId,
            payload,
            { metadata, parentNoteId: selectedParentId },
          );
        } else {
          saved = await createSkillNote(
            skillId,
            payload,
            { metadata, parentNoteId: selectedParentId },
          );
        }

        if (!saved) return;

        setCurrentNoteId(saved.id);
        setNoteMetadata(saved.metadata ?? metadata);
        setLastSavedSnapshot(nextSnapshot);

        if (noteId === "new") {
          router.replace(`/skills/${skillId}/notes/${saved.id}`);
        }
      } catch (error) {
        console.error("Failed to autosave skill note", { error, skillId, noteId });
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    currentNoteId,
    isLoading,
    isSaving,
    lastSavedSnapshot,
    noteContent,
    noteIcon,
    noteId,
    noteMetadata,
    noteTitle,
    router,
    selectedParentId,
    skillId,
  ]);

  const availableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.id !== currentNoteId),
    [parentOptions, currentNoteId],
  );

  const parentSelectValue = selectedParentId ?? ROOT_PARENT_VALUE;

  async function handleCreateSubpage() {
    if (!currentNoteId) {
      return null;
    }

    const created = await createSkillNote(
      skillId,
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
      href: `/skills/${skillId}/notes/${created.id}`,
    };
  }

  async function handleSubpageCreated(
    subpage: { id: string; title: string; href?: string },
    parentContent: string,
  ) {
    const href = subpage.href ?? `/skills/${skillId}/notes/${subpage.id}`;

    if (!currentNoteId) {
      console.error("Cannot save skill parent marker before opening subpage", {
        skillId,
        currentNoteId,
        selectedParentId,
        subpageId: subpage.id,
        href,
        parentContentLength: parentContent.length,
      });
      router.push(href);
      return;
    }

    setIsSaving(true);
    try {
      const metadata = buildNoteMetadata(noteMetadata, noteIcon);
      const saved = await updateSkillNote(
        skillId,
        currentNoteId,
        {
          title: noteTitle.trim() || "Untitled",
          content: parentContent,
        },
        { metadata },
      );

      if (!saved) {
        console.error("Failed to save skill parent marker before opening subpage", {
          skillId,
          currentNoteId,
          selectedParentId,
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
            parentNoteId: selectedParentId,
            metadata: buildNoteMetadata(saved.metadata ?? metadata, noteIcon),
          }),
        );
      }
    } catch (error) {
      console.error("Failed to save parent note before opening subpage", {
        error,
        skillId,
        currentNoteId,
        selectedParentId,
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
    router.push(`/skills/${skillId}/notes/${subpageId}`);
  }

  function handleDatabaseDefinitionsChange(databases: NoteDatabaseDefinitions) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databases }));
  }

  function handleDatabaseEntriesChange(databaseEntries: NoteDatabaseEntries) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databaseEntries }));
  }

  function handleBack() {
    if (selectedParentId) {
      router.push(`/skills/${skillId}/notes/${selectedParentId}`);
      return;
    }

    router.push(`/skills/${skillId}`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 pb-[calc(10rem_+_env(safe-area-inset-bottom,0px))] pt-2 text-white sm:pb-[calc(9rem_+_env(safe-area-inset-bottom,0px))] sm:pt-3">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:gap-3">
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
              <div className="flex justify-end">
                <Select
                  value={parentSelectValue}
                  onValueChange={(value) => {
                    if (value === ROOT_PARENT_VALUE) {
                      setSelectedParentId(null);
                    } else {
                      setSelectedParentId(value);
                    }
                  }}
                  placeholder="Top-level page"
                  triggerClassName="h-8 max-w-full rounded-full border border-white/[0.08] bg-white/[0.045] px-3 text-left text-xs text-white/70 shadow-none hover:bg-white/[0.07]"
                >
                  <SelectContent className="border-white/[0.08] bg-[#101010] text-white">
                    <SelectItem value={ROOT_PARENT_VALUE}>
                      {isLoadingParents ? "Loading…" : "Top-level page"}
                    </SelectItem>
                    {availableParentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {getNoteTitle(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                className="min-h-[62vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28"
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
