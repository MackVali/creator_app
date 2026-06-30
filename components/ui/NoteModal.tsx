"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NotebookPen, X } from "lucide-react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Button } from "./button";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { createSkillNote, getNotes } from "@/lib/notesStorage";
import type { Note } from "@/lib/types/note";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROOT_PARENT_VALUE = "__root__";

export function NoteModal({ isOpen, onClose }: NoteModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [formData, setFormData] = useState({
    skillId: "",
    title: "",
    content: "",
  });
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const loadSkills = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const skillsData = await getSkillsForUser(user.id);
      setSkills(skillsData);
    };
    if (isOpen && mounted) {
      loadSkills();
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen || !mounted) return;

    let isActive = true;

    const loadParents = async () => {
      if (!formData.skillId) {
        setParentOptions([]);
        setSelectedParentId(null);
        setIsLoadingParents(false);
        return;
      }

      setIsLoadingParents(true);

      try {
        const notes = await getNotes(formData.skillId, { parentNoteId: null });
        if (!isActive) return;
        setParentOptions(notes);
        setSelectedParentId(null);
      } catch (error) {
        console.error("Failed to load parent note options", {
          error,
          skillId: formData.skillId,
        });
        if (!isActive) return;
        setParentOptions([]);
        setSelectedParentId(null);
      } finally {
        if (isActive) {
          setIsLoadingParents(false);
        }
      }
    };

    loadParents();

    return () => {
      isActive = false;
    };
  }, [formData.skillId, isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    const trimmedContent = formData.content.trim();
    const hasContent = trimmedTitle.length > 0 || trimmedContent.length > 0;

    if (!formData.skillId) {
      toast.error("Please select a skill");
      return;
    }

    if (!hasContent) {
      toast.error("Add a title or some content before saving");
      return;
    }

    if (isSaving) return;

    setIsSaving(true);

    try {
      const saved = await createSkillNote(formData.skillId, {
        title: formData.title,
        content: formData.content,
      }, {
        parentNoteId: selectedParentId,
      });

      if (!saved) {
        toast.error("We couldn’t save your note. Try again.");
        return;
      }

      toast.success("Note saved");
      setFormData({ skillId: "", title: "", content: "" });
      setParentOptions([]);
      setSelectedParentId(null);
      onClose();
    } catch (error) {
      console.error("Failed to save note", error);
      toast.error("We couldn’t save your note. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit =
    formData.skillId &&
    (formData.title.trim().length > 0 || formData.content.trim().length > 0) &&
    !isSaving;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-4 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="w-full max-w-[430px] max-h-[min(88vh,680px)] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.10),transparent_58%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(18,18,21,0.96)_52%,rgba(39,39,45,0.82)_100%)] text-white shadow-[0_28px_90px_-36px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.07)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),0_10px_24px_rgba(0,0,0,0.32)]">
              <NotebookPen className="h-5 w-5 text-white/80" aria-hidden="true" />
            </span>
            <h2 className="truncate text-lg font-semibold leading-6 text-white">
              Add Note
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.08] focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="Close Add Note"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="max-h-[calc(min(88vh,680px)-68px)] space-y-4 overflow-y-auto px-4 pb-4 pt-4 [-webkit-overflow-scrolling:touch] sm:px-5 sm:pb-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-white/60">Skill</Label>
              <Select
                value={formData.skillId}
                onValueChange={(value) =>
                  setFormData({ ...formData, skillId: value })
                }
                placeholder="Choose skill"
                triggerClassName="h-11 rounded-2xl border-white/[0.07] bg-black/24 text-left text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.11]"
                contentWrapperClassName="border-white/[0.08] bg-[#090909] shadow-2xl shadow-black/60"
              >
                <SelectContent className="bg-[#090909] text-white">
                  {skills.map((skill) => (
                    <SelectItem key={skill.id} value={skill.id}>
                      {skill.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-white/60">
                Parent page (optional)
              </Label>
              <Select
                value={selectedParentId ?? ROOT_PARENT_VALUE}
                onValueChange={(value) => {
                  if (value === ROOT_PARENT_VALUE) {
                    setSelectedParentId(null);
                  } else {
                    setSelectedParentId(value);
                  }
                }}
                placeholder="Add to top level"
                className="text-white"
                triggerClassName="h-11 rounded-2xl border-white/[0.07] bg-black/24 text-left text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.11]"
                contentWrapperClassName="border-white/[0.08] bg-[#090909] shadow-2xl shadow-black/60"
              >
                <SelectContent className="bg-[#090909] text-white">
                  <SelectItem value={ROOT_PARENT_VALUE}>
                    {isLoadingParents ? "Loading…" : "Top-level page"}
                  </SelectItem>
                  {parentOptions.map((note) => {
                    const displayTitle =
                      note.title?.trim() ||
                      note.content
                        ?.split(/\r?\n/)
                        .map((line) => line.trim())
                        .find((line) => line.length > 0) ||
                      "Untitled";

                    return (
                      <SelectItem key={note.id} value={note.id}>
                        {displayTitle}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedParentId ? (
                <p className="text-xs text-white/60">
                  Sub-notes can only nest one level deep.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.07] bg-black/24 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <Label className="sr-only">Title</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Untitled"
                className="h-auto border-0 bg-transparent px-0 py-0 text-[1.55rem] font-semibold leading-10 text-white shadow-none outline-none placeholder:text-white/28 focus-visible:ring-0 sm:text-[1.7rem]"
                aria-label="Note title"
              />
            </div>
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <Label className="sr-only">Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Start typing your note..."
                className="min-h-[180px] resize-none border-0 bg-transparent px-0 py-0 text-base leading-7 text-white shadow-none outline-none ring-0 placeholder:text-white/28 focus-visible:ring-0 focus-visible:ring-offset-0 sm:min-h-[220px]"
                rows={7}
                aria-label="Note content"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-2xl border border-emerald-300/20 bg-emerald-400/90 text-sm font-semibold text-black shadow-[0_18px_40px_-24px_rgba(52,211,153,0.9)] transition hover:bg-emerald-300 disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/36 disabled:shadow-none"
            disabled={!canSubmit}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving…" : "Save Note"}
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}
