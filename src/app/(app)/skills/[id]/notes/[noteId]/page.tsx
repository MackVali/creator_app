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

  const fieldClass =
    "bg-[#070707] text-white placeholder:text-white/50 border border-white/10 rounded-[16px] px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

  return (
    <main className="min-h-screen bg-[#020202] text-white px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-3">
          <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            <Link
              href={`/skills/${skillId}`}
              className="rounded-full border border-white/20 px-3 py-1 text-white/70 hover:border-white/40"
            >
              Skill notes
            </Link>
            {parentNote ? (
              <>
                <span className="text-white/30">/</span>
                <Link
                  href={`/skills/${skillId}/notes/${parentNote.id}`}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-white/40"
                >
                  {getNoteTitle(parentNote)}
                </Link>
              </>
            ) : null}
            <span className="text-white/30">/</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-white">
              {noteId === "new" ? "New note" : "Current note"}
            </span>
          </nav>
          {inheritedFieldCount > 0 ? (
            <p className="text-xs text-white/60">
              Parent defaults active ({inheritedFieldCount} field
              {inheritedFieldCount === 1 ? "" : "s"} applied).
            </p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {title.trim() || "Give this note a memorable headline"}
            </h1>
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              {noteId === "new" ? "Fresh capture" : "Update in progress"}
            </span>
          </div>
        </header>

        <section className="space-y-6 rounded-[28px] border border-white/10 bg-[#050505]/70 p-6">
          {isLoading ? (
            <p className="text-sm text-white/60">Loading note…</p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                  Parent page
                </Label>
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
                  triggerClassName="h-12 rounded-[16px] border border-white/10 bg-transparent px-4 text-left text-sm text-white"
                >
                  <SelectContent className="border border-white/10 bg-[#050505] text-white">
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
                <p className="text-xs text-white/50">Sub-notes can only nest one level deep.</p>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name the idea, ritual, or breakthrough you’re capturing"
                disabled={isLoading}
                className={`${fieldClass} text-lg font-semibold`}
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Expand on what changed, what you learned, or what you want to explore next..."
                className={`${fieldClass} min-h-[320px] resize-none text-base leading-relaxed`}
                disabled={isLoading}
              />
              <div className="flex justify-end pt-2">
                <Button
                  onClick={onSave}
                  disabled={!canSave || isSaving || isLoading}
                  aria-busy={isSaving}
                  className="h-12 rounded-[18px] border border-white/20 bg-white/10 px-6 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/40 hover:bg-white/20"
                >
                  {isSaving ? "Saving…" : currentNoteId ? "Update note" : "Save note"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {currentNoteId ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#050505]/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                  Sub-pages
                </h2>
                <p className="text-sm text-white/60">
                  Stitch related notes together to keep this skill evolving.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-full border border-white/20 bg-white/10 text-white"
                onClick={() => router.push(`/skills/${skillId}/notes/new?parent=${currentNoteId}`)}
              >
                Add sub-page
              </Button>
            </div>
            <div className="space-y-3">
              {children.length > 0 ? (
                <ul className="space-y-2">
                  {children.map((child) => {
                    const childTitle = getNoteTitle(child);
                    const subtitle = formatTimestamp(child);
                    return (
                      <li key={child.id}>
                        <Link
                          href={`/skills/${skillId}/notes/${child.id}`}
                          className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white/80"
                        >
                          <span className="truncate font-medium">{childTitle}</span>
                          {subtitle ? (
                            <span className="text-xs text-white/50">{subtitle}</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/60">
                  No sub-pages yet. Add one to keep related details together.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
