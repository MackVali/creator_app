"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

function formatTimestamp(note: Note): string {
  const source = note.updatedAt ?? note.createdAt;
  if (!source) return "";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const parentFromQuery = searchParams?.get("parent");
  const normalizedParentFromQuery = parentFromQuery ? String(parentFromQuery) : null;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    normalizedParentFromQuery,
  );
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [children, setChildren] = useState<Note[]>([]);
  const [parentTemplateOverrides, setParentTemplateOverrides] =
    useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setTitle("");
      setContent("");
      setChildren([]);
      setParentNote(null);
      setParentTemplateOverrides(null);
      setSelectedParentId(normalizedParentFromQuery);
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
          setCurrentNoteId(result.note.id);
          setTitle(result.note.title ?? "");
          setContent(result.note.content ?? "");
          setSelectedParentId(result.note.parentNoteId ?? null);
          setParentNote(result.parent);
          setParentTemplateOverrides(result.parentTemplateOverrides);
          setChildren(result.children);
        } else {
          setCurrentNoteId(null);
          setTitle("");
          setContent("");
          setSelectedParentId(null);
          setParentNote(null);
          setParentTemplateOverrides(null);
          setChildren([]);
        }
      } catch (error) {
        console.error("Failed to load skill note", { error, skillId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setTitle("");
        setContent("");
        setSelectedParentId(null);
        setParentNote(null);
        setParentTemplateOverrides(null);
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
      setParentTemplateOverrides(null);
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
        setParentTemplateOverrides(fetchedParent?.childTemplateOverrides ?? null);
      } catch (error) {
        console.error("Failed to load parent note", {
          error,
          skillId,
          parentId: selectedParentId,
        });
        if (!isActive) return;
        setParentNote(null);
        setParentTemplateOverrides(null);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedParentId, skillId, parentNote?.id]);

  const availableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.id !== currentNoteId),
    [parentOptions, currentNoteId],
  );

  const parentSelectValue = selectedParentId ?? ROOT_PARENT_VALUE;
  const canSave = title.trim().length > 0 || content.trim().length > 0;
  const inheritedFieldCount = parentTemplateOverrides
    ? Object.keys(parentTemplateOverrides).length
    : 0;

  const onSave = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);

    try {
      let saved: Note | null = null;

      if (currentNoteId) {
        saved = await updateSkillNote(
          skillId,
          currentNoteId,
          {
            title,
            content,
          },
          {
            parentNoteId: selectedParentId,
          },
        );
      } else {
        saved = await createSkillNote(
          skillId,
          {
            title,
            content,
          },
          {
            parentNoteId: selectedParentId,
          },
        );
      }

      if (!saved) return;

      setCurrentNoteId(saved.id);
      router.push(`/skills/${skillId}`);
    } catch (error) {
      console.error("Failed to save skill note", { error, skillId, noteId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="space-y-6 p-4">
      <div className="space-y-2">
        <nav className="text-xs text-white/60">
          <Link href={`/skills/${skillId}`} className="text-white/70 transition hover:text-white">
            Skill notes
          </Link>
          {parentNote ? (
            <>
              <span className="mx-1">/</span>
              <Link
                href={`/skills/${skillId}/notes/${parentNote.id}`}
                className="text-white/70 transition hover:text-white"
              >
                {getNoteTitle(parentNote)}
              </Link>
            </>
          ) : null}
          <span className="mx-1">/</span>
          <span className="text-white">
            {noteId === "new" ? "New note" : title.trim() || "Untitled"}
          </span>
        </nav>
        {inheritedFieldCount > 0 ? (
          <p className="text-xs text-white/60">
            Parent defaults active ({inheritedFieldCount} field
            {inheritedFieldCount === 1 ? "" : "s"} applied).
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-white/60">Loading note…</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-white/70">Parent page</Label>
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
              triggerClassName="h-10 rounded-lg border border-white/10 bg-white/5 text-left text-sm text-white"
            >
              <SelectContent className="bg-[#0f172a] text-white">
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
            <p className="text-xs text-white/50">
              Sub-notes can only nest one level deep.
            </p>
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            disabled={isLoading}
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note..."
            className="min-h-[300px]"
            disabled={isLoading}
          />
          <Button
            onClick={onSave}
            disabled={!canSave || isSaving || isLoading}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>

          {currentNoteId ? (
            <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Sub-pages</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    router.push(`/skills/${skillId}/notes/new?parent=${currentNoteId}`)
                  }
                >
                  Add sub-page
                </Button>
              </div>
              {children.length > 0 ? (
                <ul className="space-y-2">
                  {children.map((child) => {
                    const childTitle = getNoteTitle(child);
                    const subtitle = formatTimestamp(child);
                    return (
                      <li key={child.id}>
                        <Link
                          href={`/skills/${skillId}/notes/${child.id}`}
                          className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                        >
                          <span className="truncate font-medium">{childTitle}</span>
                          {subtitle ? (
                            <span className="text-xs text-white/60">{subtitle}</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-white/60">
                  No sub-pages yet. Add one to keep related details together.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
