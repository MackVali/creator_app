"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FocusedNoteParentBreadcrumb } from "@/components/notes/FocusedNoteParentBreadcrumb";
import { NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteTextActionBar } from "@/components/notes/NoteTextActionBar";
import {
  NoteSlashTextarea,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
  type NoteSlashTextareaHandle,
} from "@/components/notes/NoteSlashTextarea";
import {
  createSkillNote,
  getNoteWithChildren,
  updateSkillNote,
} from "@/lib/notesStorage";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Note } from "@/lib/types/note";

const DEFAULT_NOTE_ICON = "📝";
const DEFAULT_SKILL_ICON = "💡";

type ParentContext = {
  icon: string;
  name: string;
};

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
  const [children, setChildren] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [parentContext, setParentContext] = useState<ParentContext | null>(null);

  useEffect(() => {
    let isMounted = true;

    setParentContext(null);
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        if (!supabase) return;

        const { data, error } = await supabase
          .from("skills")
          .select("id,name,icon")
          .eq("id", skillId)
          .maybeSingle();

        if (!isMounted) return;

        if (error) {
          console.error("Failed to load skill note parent context", { error, skillId });
          return;
        }

        const skill = data as unknown as { icon?: string | null; name?: string | null } | null;
        setParentContext({
          icon: skill?.icon?.trim() || DEFAULT_SKILL_ICON,
          name: skill?.name?.trim() || "Skill",
        });
      } catch (error) {
        console.error("Failed to load skill note parent context", { error, skillId });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [skillId]);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteIcon(DEFAULT_NOTE_ICON);
      setNoteMetadata(null);
      setChildren([]);
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

  async function handleOpenDatabase(databaseId: string) {
    const targetNoteId = currentNoteId ?? (noteId !== "new" ? noteId : null);
    if (targetNoteId) {
      router.push(`/skills/${skillId}/notes/${targetNoteId}/databases/${databaseId}`);
      return;
    }

    setIsSaving(true);
    try {
      const metadata = buildNoteMetadata(noteMetadata, noteIcon);
      const saved = await createSkillNote(
        skillId,
        {
          title: noteTitle.trim() || "Untitled",
          content: noteContent,
        },
        { metadata, parentNoteId: selectedParentId },
      );

      if (!saved) return;

      setCurrentNoteId(saved.id);
      setNoteMetadata(saved.metadata ?? metadata);
      setLastSavedSnapshot(
        createSaveSnapshot({
          title: saved.title ?? noteTitle,
          content: saved.content ?? noteContent,
          icon: noteIcon,
          parentNoteId: saved.parentNoteId ?? selectedParentId,
          metadata: buildNoteMetadata(saved.metadata ?? metadata, noteIcon),
        }),
      );
      router.push(`/skills/${skillId}/notes/${saved.id}/databases/${databaseId}`);
    } catch (error) {
      console.error("Failed to save skill note before opening database", {
        error,
        skillId,
        noteId,
        databaseId,
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDatabaseDefinitionsChange(databases: NoteDatabaseDefinitions) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databases }));
  }

  function handleDatabaseEntriesChange(databaseEntries: NoteDatabaseEntries) {
    setNoteMetadata((current) => ({ ...(current ?? {}), databaseEntries }));
  }

  function handleParentBack() {
    router.push(`/skills/${skillId}`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 pb-16 pt-2 text-white sm:pb-14 sm:pt-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:gap-3">
        <section className="bg-transparent p-0">
          {isLoading ? (
            <p className="text-sm text-white/60">Loading note…</p>
          ) : (
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <FocusedNoteParentBreadcrumb
                icon={parentContext?.icon ?? DEFAULT_SKILL_ICON}
                name={parentContext?.name ?? "Skill"}
                onBack={handleParentBack}
              />

              <NoteEditorHeader
                icon={noteIcon}
                title={noteTitle}
                onIconChange={setNoteIcon}
                onTitleChange={setNoteTitle}
                autosaveLabel={isSaving ? "Saving…" : "Autosaved"}
              />

              <NoteTextActionBar
                onFormat={(command) => noteTextareaRef.current?.applyTextFormat(command)}
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
                onOpenDatabase={handleOpenDatabase}
                placeholder="Start typing, or press / for commands…"
                className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28"
                aria-label="Note editor"
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
