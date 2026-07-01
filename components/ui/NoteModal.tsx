"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Button } from "./button";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import type { CatRow } from "@/lib/types/cat";
import { getMonumentIconOrDefault } from "@/lib/monuments/icon";
import { createSkillNote, getNotes } from "@/lib/notesStorage";
import { createMonumentNote } from "@/lib/monumentNotesStorage";
import type { Note } from "@/lib/types/note";
import { DEFAULT_NOTE_ICON, NoteIconPicker } from "@/components/notes/NoteEditorHeader";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  forceTopLevel?: boolean;
}

const ROOT_PARENT_VALUE = "__root__";
type NoteTargetType = "skill" | "monument";
const DEFAULT_SKILL_ICON = "🧩";
const DEFAULT_MONUMENT_ICON = getMonumentIconOrDefault(null);
const UNCATEGORIZED_SKILL_GROUP_ID = "__uncategorized_skill_group__";
const UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";

type SkillCategoryGroup = {
  id: string;
  label: string;
  sortOrder: number | null;
  skills: Skill[];
};

function compareNullableOrder(
  aOrder: number | null | undefined,
  bOrder: number | null | undefined,
) {
  const aHasOrder = typeof aOrder === "number" && Number.isFinite(aOrder);
  const bHasOrder = typeof bOrder === "number" && Number.isFinite(bOrder);

  if (aHasOrder && bHasOrder && aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  if (aHasOrder !== bHasOrder) {
    return aHasOrder ? -1 : 1;
  }

  return 0;
}

function compareByName(aName: string, bName: string) {
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

function TargetIcon({ icon, fallback }: { icon?: string | null; fallback: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.045] text-[0.92rem] leading-none text-white/85">
      {icon?.trim() || fallback}
    </span>
  );
}

export function NoteModal({ isOpen, onClose, forceTopLevel = false }: NoteModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [targetType, setTargetType] = useState<NoteTargetType>("skill");
  const [formData, setFormData] = useState({
    skillId: "",
    monumentId: "",
    title: "",
    content: "",
    icon: DEFAULT_NOTE_ICON,
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
    const loadTargets = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [skillsData, categoriesData, monumentsData] = await Promise.all([
        getSkillsForUser(user.id),
        getCatsForUser(user.id).catch((error) => {
          console.error(
            "Failed to load skill categories for note target picker",
            error,
          );
          return [] as CatRow[];
        }),
        getMonumentsForUser(user.id),
      ]);
      setSkills(skillsData);
      setSkillCategories(categoriesData);
      setMonuments(monumentsData);
    };
    if (isOpen && mounted) {
      loadTargets();
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen || !mounted) return;

    let isActive = true;

    const loadParents = async () => {
      if (forceTopLevel || targetType !== "skill" || !formData.skillId) {
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
  }, [forceTopLevel, formData.skillId, isOpen, mounted, targetType]);

  if (!isOpen || !mounted) return null;

  const resetForm = () => {
    setTargetType("skill");
    setFormData({
      skillId: "",
      monumentId: "",
      title: "",
      content: "",
      icon: DEFAULT_NOTE_ICON,
    });
    setParentOptions([]);
    setSelectedParentId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    const trimmedContent = formData.content.trim();
    const hasContent = trimmedTitle.length > 0 || trimmedContent.length > 0;
    const selectedSkillId = targetType === "skill" ? formData.skillId : "";
    const selectedMonumentId = targetType === "monument" ? formData.monumentId : "";

    if (targetType === "skill" && !selectedSkillId) {
      toast.error("Please select a skill");
      return;
    }

    if (targetType === "monument" && !selectedMonumentId) {
      toast.error("Please select a monument");
      return;
    }

    if (!hasContent) {
      toast.error("Add a title or some content before saving");
      return;
    }

    if (isSaving) return;

    setIsSaving(true);

    try {
      const metadata = { icon: formData.icon || DEFAULT_NOTE_ICON };
      const parentNoteId = forceTopLevel ? null : selectedParentId;
      const saved =
        targetType === "skill"
          ? await createSkillNote(
              selectedSkillId,
              {
                title: formData.title,
                content: formData.content,
              },
              {
                metadata,
                parentNoteId,
              },
            )
          : await createMonumentNote(
              selectedMonumentId,
              {
                title: formData.title,
                content: formData.content,
                metadata,
              },
              {
                metadata,
                parentNoteId: null,
              },
            );

      if (!saved) {
        toast.error("We couldn’t save your note. Try again.");
        return;
      }

      toast.success("Note saved");
      resetForm();
      onClose();
    } catch (error) {
      console.error("Failed to save note", error);
      toast.error("We couldn’t save your note. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit =
    (targetType === "skill" ? formData.skillId : formData.monumentId) &&
    (formData.title.trim().length > 0 || formData.content.trim().length > 0) &&
    !isSaving;
  const titleValue = formData.title.trim() || "Untitled";
  const selectedSkill = skills.find((skill) => skill.id === formData.skillId);
  const selectedMonument = monuments.find(
    (monument) => monument.id === formData.monumentId,
  );
  const targetLabel = targetType === "skill" ? "Skill" : "Monument";
  const groupedSkills = (() => {
    const categoriesById = new Map<string, CatRow>();
    skillCategories.forEach((category) => {
      categoriesById.set(category.id, category);
    });

    const groups = new Map<string, SkillCategoryGroup>();

    skills.forEach((skill) => {
      const groupId =
        skill.cat_id && categoriesById.has(skill.cat_id)
          ? skill.cat_id
          : UNCATEGORIZED_SKILL_GROUP_ID;
      const category = categoriesById.get(groupId);
      const label =
        groupId === UNCATEGORIZED_SKILL_GROUP_ID
          ? UNCATEGORIZED_SKILL_GROUP_LABEL
          : category?.name?.trim() || UNCATEGORIZED_SKILL_GROUP_LABEL;
      const group = groups.get(groupId) ?? {
        id: groupId,
        label,
        sortOrder: category?.sort_order ?? null,
        skills: [],
      };

      group.label = label;
      group.sortOrder = category?.sort_order ?? group.sortOrder;
      group.skills.push(skill);
      groups.set(groupId, group);
    });

    const orderedGroups: SkillCategoryGroup[] = [];
    const seen = new Set<string>();
    const orderedCategories = [...skillCategories].sort((a, b) => {
      const orderComparison = compareNullableOrder(a.sort_order, b.sort_order);
      if (orderComparison !== 0) return orderComparison;
      return compareByName(a.name ?? "", b.name ?? "");
    });

    orderedCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (!group) return;
      orderedGroups.push({
        ...group,
        label: category.name?.trim() || group.label,
        sortOrder: category.sort_order ?? null,
      });
      seen.add(category.id);
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_SKILL_GROUP_ID);
    if (uncategorizedGroup) {
      orderedGroups.push(uncategorizedGroup);
      seen.add(UNCATEGORIZED_SKILL_GROUP_ID);
    }

    groups.forEach((group, groupId) => {
      if (!seen.has(groupId)) {
        orderedGroups.push(group);
      }
    });

    return orderedGroups
      .sort((a, b) => {
        if (a.id === UNCATEGORIZED_SKILL_GROUP_ID) return 1;
        if (b.id === UNCATEGORIZED_SKILL_GROUP_ID) return -1;

        const orderComparison = compareNullableOrder(a.sortOrder, b.sortOrder);
        if (orderComparison !== 0) return orderComparison;
        return compareByName(a.label, b.label);
      })
      .map((group) => ({
        ...group,
        skills: [...group.skills].sort((a, b) => {
          const orderComparison = compareNullableOrder(
            a.sort_order,
            b.sort_order,
          );
          if (orderComparison !== 0) return orderComparison;
          return compareByName(a.name, b.name);
        }),
      }));
  })();

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-5">
      <div className="max-h-[min(calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)),680px)] w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.10),transparent_58%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(18,18,21,0.96)_52%,rgba(39,39,45,0.82)_100%)] text-white shadow-[0_28px_90px_-36px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.07)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <NoteIconPicker
              icon={formData.icon}
              onIconChange={(icon) => setFormData({ ...formData, icon })}
              popoverClassName="left-[-0.75rem] sm:left-0"
            />
            <div className="min-w-0 flex-1">
              <Label className="sr-only">Note title</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Untitled"
                className="h-auto border-0 bg-transparent px-0 py-0 text-[1.55rem] font-semibold leading-10 text-white shadow-none outline-none placeholder:text-white/28 focus-visible:ring-0 sm:text-[1.7rem]"
                aria-label="Note title"
                title={titleValue}
              />
            </div>
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
          className="max-h-[calc(min(calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)),680px)-68px)] space-y-4 overflow-y-auto px-4 pb-4 pt-4 [-webkit-overflow-scrolling:touch] sm:px-5 sm:pb-5"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-semibold text-white/60">
                  {targetLabel}
                </Label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={targetType === "monument"}
                  aria-label="Toggle note target between Skill and Monument"
                  onClick={() => {
                    const nextType = targetType === "skill" ? "monument" : "skill";
                    setTargetType(nextType);
                    setFormData({
                      ...formData,
                      skillId: nextType === "skill" ? formData.skillId : "",
                      monumentId:
                        nextType === "monument" ? formData.monumentId : "",
                    });
                    setSelectedParentId(null);
                  }}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition ${
                    targetType === "monument"
                      ? "border-zinc-400/35 bg-zinc-500/35"
                      : "border-white/[0.10] bg-white/[0.055]"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white/85 shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition ${
                      targetType === "monument" ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              {targetType === "skill" ? (
                <Select
                  value={formData.skillId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, skillId: value, monumentId: "" })
                  }
                  placeholder="Choose skill"
                  trigger={
                    selectedSkill ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <TargetIcon
                          icon={selectedSkill.icon}
                          fallback={DEFAULT_SKILL_ICON}
                        />
                        <span className="truncate">{selectedSkill.name}</span>
                      </span>
                    ) : (
                      <span className="truncate text-white/50">Choose skill</span>
                    )
                  }
                  triggerClassName="h-11 rounded-2xl border-white/[0.07] bg-black/24 text-left text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.11]"
                  contentWrapperClassName="border-white/[0.08] bg-[#090909] shadow-2xl shadow-black/60"
                >
                  <SelectContent className="bg-[#090909] text-white">
                    {groupedSkills.flatMap((group) => [
                      <SelectItem
                        key={`header-${group.id}`}
                        value={`__skill_group_header_${group.id}`}
                        disabled
                        className="cursor-default px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42 opacity-100 hover:bg-transparent hover:text-white/42"
                      >
                        {group.label}
                      </SelectItem>,
                      ...group.skills.map((skill) => (
                        <SelectItem
                          key={skill.id}
                          value={skill.id}
                          label={skill.name}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <TargetIcon
                              icon={skill.icon}
                              fallback={DEFAULT_SKILL_ICON}
                            />
                            <span className="truncate">{skill.name}</span>
                          </span>
                        </SelectItem>
                      )),
                    ])}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={formData.monumentId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, skillId: "", monumentId: value })
                  }
                  placeholder="Choose monument"
                  trigger={
                    selectedMonument ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <TargetIcon
                          icon={getMonumentIconOrDefault(selectedMonument.emoji)}
                          fallback={DEFAULT_MONUMENT_ICON}
                        />
                        <span className="truncate">{selectedMonument.title}</span>
                      </span>
                    ) : (
                      <span className="truncate text-white/50">Choose monument</span>
                    )
                  }
                  triggerClassName="h-11 rounded-2xl border-white/[0.07] bg-black/24 text-left text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.11]"
                  contentWrapperClassName="border-white/[0.08] bg-[#090909] shadow-2xl shadow-black/60"
                >
                  <SelectContent className="bg-[#090909] text-white">
                    {monuments.map((monument) => (
                      <SelectItem
                        key={monument.id}
                        value={monument.id}
                        label={monument.title}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <TargetIcon
                            icon={getMonumentIconOrDefault(monument.emoji)}
                            fallback={DEFAULT_MONUMENT_ICON}
                          />
                          <span className="truncate">{monument.title}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {!forceTopLevel && targetType === "skill" ? (
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
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/[0.07] bg-black/24 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
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
            className="h-12 w-full rounded-2xl border border-white/[0.12] bg-zinc-950/72 text-sm font-semibold text-white shadow-[0_18px_44px_-26px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:border-white/[0.18] hover:bg-zinc-900/82 active:bg-zinc-950/88 disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/36 disabled:shadow-none disabled:backdrop-blur-none"
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
