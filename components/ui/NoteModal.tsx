"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { Button } from "./button";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import type { CatRow } from "@/lib/types/cat";
import { AREAS, type AreaConfig } from "@/config/areas";
import { getMonumentIconOrDefault } from "@/lib/monuments/icon";
import { createSkillNote, getNotes } from "@/lib/notesStorage";
import { createAreaNote, createMonumentNote } from "@/lib/monumentNotesStorage";
import type { Note } from "@/lib/types/note";
import { DEFAULT_NOTE_ICON, NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteTextActionBar } from "@/components/notes/NoteTextActionBar";
import {
  NoteSlashTextarea,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
  type NoteSlashTextareaHandle,
} from "@/components/notes/NoteSlashTextarea";
import { NOTE_SOFT_OLED_CLASSES } from "@/lib/notes/softOled";
import {
  readNoteTodos,
  writeNoteTodosMetadata,
  type NoteTodo,
  type NoteTodoOwner,
} from "@/lib/notes/noteTodos";
import type { SkillRow } from "@/lib/types/skill";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  forceTopLevel?: boolean;
}

const ROOT_PARENT_VALUE = "__root__";
type NoteRelationType = "area" | "monument" | "skill";
const DEFAULT_SKILL_ICON = "🧩";
const UNCATEGORIZED_SKILL_GROUP_ID = "__uncategorized_skill_group__";
const UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";
const KEYBOARD_ACCESSORY_THRESHOLD_PX = 100;
const KEYBOARD_ACCESSORY_SIDE_PADDING_PX = 12;
const KEYBOARD_ACCESSORY_SCROLL_PADDING_PX = 72;

type KeyboardAccessoryGeometry = {
  inset: number;
  left: number;
  width: number;
};

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

export function NoteModal({ isOpen, onClose, forceTopLevel = false }: NoteModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();
  const noteTextareaRef = useRef<NoteSlashTextareaHandle | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const modalPanelRef = useRef<HTMLDivElement | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [noteTodoUserId, setNoteTodoUserId] = useState<string | null>(null);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [relationType, setRelationType] = useState<NoteRelationType | null>(null);
  const [isRelationPickerOpen, setIsRelationPickerOpen] = useState(false);
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [keyboardAccessoryGeometry, setKeyboardAccessoryGeometry] =
    useState<KeyboardAccessoryGeometry>({
      inset: 0,
      left: KEYBOARD_ACCESSORY_SIDE_PADDING_PX,
      width: 0,
    });
  const [formData, setFormData] = useState({
    areaId: "",
    skillId: "",
    monumentId: "",
    title: "",
    content: "",
    icon: DEFAULT_NOTE_ICON,
  });
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsEditorActive(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mounted || typeof window === "undefined") return;

    let animationFrameId: number | null = null;

    const measureKeyboardAccessoryGeometry = () => {
      animationFrameId = null;

      const viewport = window.visualViewport;
      const layoutHeight = window.innerHeight;
      const visualHeight = viewport?.height ?? layoutHeight;
      const visualTop = viewport?.offsetTop ?? 0;
      const visualLeft = viewport?.offsetLeft ?? 0;
      const visualWidth = viewport?.width ?? window.innerWidth;
      const visualRight = visualLeft + visualWidth;
      const keyboardInset = Math.max(
        0,
        Math.round(layoutHeight - (visualHeight + visualTop)),
      );
      const panelRect = modalPanelRef.current?.getBoundingClientRect();
      const fallbackWidth = Math.max(
        0,
        Math.min(560, visualWidth - KEYBOARD_ACCESSORY_SIDE_PADDING_PX * 2),
      );
      const fallbackLeft =
        visualLeft +
        Math.max(
          KEYBOARD_ACCESSORY_SIDE_PADDING_PX,
          (visualWidth - fallbackWidth) / 2,
        );
      const unclampedLeft = panelRect?.left ?? fallbackLeft;
      const unclampedRight = panelRect?.right ?? fallbackLeft + fallbackWidth;
      const left = Math.max(
        visualLeft + KEYBOARD_ACCESSORY_SIDE_PADDING_PX,
        Math.round(unclampedLeft),
      );
      const right = Math.min(
        visualRight - KEYBOARD_ACCESSORY_SIDE_PADDING_PX,
        Math.round(unclampedRight),
      );
      const width = Math.max(0, right - left);

      setKeyboardAccessoryGeometry((current) => {
        if (
          current.inset === keyboardInset &&
          current.left === left &&
          current.width === width
        ) {
          return current;
        }

        return { inset: keyboardInset, left, width };
      });
    };

    const scheduleMeasure = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(
        measureKeyboardAccessoryGeometry,
      );
    };

    const observedVisualViewport = window.visualViewport;

    measureKeyboardAccessoryGeometry();
    window.addEventListener("resize", scheduleMeasure);
    observedVisualViewport?.addEventListener("resize", scheduleMeasure);
    observedVisualViewport?.addEventListener("scroll", scheduleMeasure);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", scheduleMeasure);
      observedVisualViewport?.removeEventListener("resize", scheduleMeasure);
      observedVisualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [isOpen, mounted]);

  useEffect(() => {
    const loadTargets = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setNoteTodoUserId(user.id);
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
      if (forceTopLevel || relationType !== "skill" || !formData.skillId) {
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
  }, [forceTopLevel, formData.skillId, isOpen, mounted, relationType]);

  if (!isOpen || !mounted) return null;

  const resetForm = () => {
    setRelationType(null);
    setIsRelationPickerOpen(false);
    setIsEditorActive(false);
    setFormData({
      areaId: "",
      skillId: "",
      monumentId: "",
      title: "",
      content: "",
      icon: DEFAULT_NOTE_ICON,
    });
    setParentOptions([]);
    setSelectedParentId(null);
    setNoteMetadata(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    const trimmedContent = formData.content.trim();
    const hasContent = trimmedTitle.length > 0 || trimmedContent.length > 0;
    const selectedAreaId = relationType === "area" ? formData.areaId : "";
    const selectedSkillId = relationType === "skill" ? formData.skillId : "";
    const selectedMonumentId =
      relationType === "monument" ? formData.monumentId : "";

    if (!relationType) {
      toast.error("Add a relation before saving");
      setIsRelationPickerOpen(true);
      return;
    }

    if (relationType === "area" && !selectedAreaId) {
      toast.error("Please select an area");
      setIsRelationPickerOpen(true);
      return;
    }

    if (relationType === "skill" && !selectedSkillId) {
      toast.error("Please select a skill");
      setIsRelationPickerOpen(true);
      return;
    }

    if (relationType === "monument" && !selectedMonumentId) {
      toast.error("Please select a monument");
      setIsRelationPickerOpen(true);
      return;
    }

    if (!hasContent) {
      toast.error("Add a title or some content before saving");
      return;
    }

    if (isSaving) return;

    setIsSaving(true);

    try {
      const metadata: Record<string, unknown> = {
        ...(noteMetadata ?? {}),
        icon: formData.icon || DEFAULT_NOTE_ICON,
      };
      const parentNoteId = forceTopLevel ? null : selectedParentId;
      const saved = await (async () => {
        if (relationType === "skill") {
          return createSkillNote(
            selectedSkillId,
            {
              title: formData.title,
              content: formData.content,
            },
            {
              metadata,
              parentNoteId,
            },
          );
        }

        if (relationType === "area") {
          return createAreaNote(
            selectedAreaId,
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
        }

        return createMonumentNote(
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
      })();

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

  const handleEditorSurfaceBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;
    const editorSurface = editorSurfaceRef.current ?? event.currentTarget;
    if (
      nextFocusedElement instanceof Node &&
      editorSurface.contains(nextFocusedElement)
    ) {
      return;
    }

    setIsEditorActive(false);
  };

  const handleDatabaseDefinitionsChange = (
    databases: NoteDatabaseDefinitions,
  ) => {
    setNoteMetadata((current) => ({ ...(current ?? {}), databases }));
  };

  const handleDatabaseEntriesChange = (databaseEntries: NoteDatabaseEntries) => {
    setNoteMetadata((current) => ({ ...(current ?? {}), databaseEntries }));
  };

  const handleNoteTodosChange = (noteTodos: NoteTodo[]) => {
    setNoteMetadata((current) => writeNoteTodosMetadata(current, noteTodos));
  };

  const hasSelectedRelation =
    relationType === "area"
      ? Boolean(formData.areaId)
      : relationType === "monument"
        ? Boolean(formData.monumentId)
        : relationType === "skill"
          ? Boolean(formData.skillId)
          : false;
  const canSubmit =
    hasSelectedRelation &&
    (formData.title.trim().length > 0 || formData.content.trim().length > 0) &&
    !isSaving;
  const isKeyboardAccessoryActive =
    isEditorActive &&
    keyboardAccessoryGeometry.inset >= KEYBOARD_ACCESSORY_THRESHOLD_PX;
  const formScrollPaddingBottom = isKeyboardAccessoryActive
    ? KEYBOARD_ACCESSORY_SCROLL_PADDING_PX
    : undefined;
  const modalKeyboardAccessoryStyle = {
    "--note-modal-keyboard-inset": `${keyboardAccessoryGeometry.inset}px`,
    "--note-modal-toolbar-left": `${keyboardAccessoryGeometry.left}px`,
    "--note-modal-toolbar-width": `${keyboardAccessoryGeometry.width}px`,
  } as React.CSSProperties;
  const noteTodoOwner: NoteTodoOwner | null =
    relationType === "area" && formData.areaId
      ? { type: "AREA", id: formData.areaId }
      : relationType === "monument" && formData.monumentId
        ? { type: "MONUMENT", id: formData.monumentId }
        : relationType === "skill" && formData.skillId
          ? { type: "SKILL", id: formData.skillId }
          : null;
  const noteTodoSkills: SkillRow[] = skills.map((skill) => ({
    id: skill.id,
    user_id: noteTodoUserId ?? "",
    name: skill.name,
    icon: skill.icon ?? null,
    cat_id: skill.cat_id ?? null,
    monument_id: skill.monument_id ?? null,
    level: null,
    sort_order: skill.sort_order ?? null,
  }));
  const selectedArea = AREAS.find((area) => area.id === formData.areaId);
  const selectedSkill = skills.find((skill) => skill.id === formData.skillId);
  const selectedMonument = monuments.find(
    (monument) => monument.id === formData.monumentId,
  );
  const selectedRelation =
    relationType === "area" && selectedArea
      ? { icon: selectedArea.emoji, name: selectedArea.label }
      : relationType === "skill" && selectedSkill
        ? {
            icon: selectedSkill.icon?.trim() || DEFAULT_SKILL_ICON,
            name: selectedSkill.name,
          }
        : relationType === "monument" && selectedMonument
          ? {
              icon: getMonumentIconOrDefault(selectedMonument.emoji),
              name: selectedMonument.title,
            }
          : null;
  const selectedParent = parentOptions.find((note) => note.id === selectedParentId);
  const selectedParentTitle = selectedParent
    ? selectedParent.title?.trim() ||
      selectedParent.content
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ||
      "Untitled"
    : "Top-level page";
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

  const selectAreaRelation = (area: AreaConfig) => {
    setRelationType("area");
    setIsRelationPickerOpen(false);
    setFormData((current) => ({
      ...current,
      areaId: area.id,
      skillId: "",
      monumentId: "",
    }));
    setSelectedParentId(null);
  };

  const selectMonumentRelation = (monument: Monument) => {
    setRelationType("monument");
    setIsRelationPickerOpen(false);
    setFormData((current) => ({
      ...current,
      areaId: "",
      skillId: "",
      monumentId: monument.id,
    }));
    setSelectedParentId(null);
  };

  const selectSkillRelation = (skill: Skill) => {
    setRelationType("skill");
    setIsRelationPickerOpen(!forceTopLevel);
    setFormData((current) => ({
      ...current,
      areaId: "",
      skillId: skill.id,
      monumentId: "",
    }));
    setSelectedParentId(null);
  };

  const renderRelationButton = ({
    id,
    icon,
    label,
    isSelected,
    onClick,
  }: {
    id: string;
    icon?: string | null;
    label: string;
    isSelected: boolean;
    onClick: () => void;
  }) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition focus-visible:ring-1 focus-visible:ring-white/22 ${
        isSelected
          ? "bg-white/[0.075] text-white/82"
          : "text-white/54 hover:bg-white/[0.045] hover:text-white/78"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[0.84rem] leading-none">
        {icon?.trim() || DEFAULT_SKILL_ICON}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );

  const relationControl = (
    <div className="relative flex h-5 items-center">
      <button
        type="button"
        onClick={() => setIsRelationPickerOpen((isOpen) => !isOpen)}
        className="inline-flex min-w-0 items-center gap-1.5 px-0.5 py-0.5 text-[11px] font-medium leading-none text-white/38 outline-none transition hover:text-white/68 focus-visible:ring-1 focus-visible:ring-white/24"
        aria-expanded={isRelationPickerOpen}
        aria-haspopup="dialog"
      >
        {selectedRelation ? (
          <>
            <span
              className="shrink-0 text-[11px] leading-none"
              aria-hidden="true"
            >
              {selectedRelation.icon}
            </span>
            <span className="min-w-0 truncate uppercase tracking-[0.12em]">
              {selectedRelation.name}
            </span>
          </>
        ) : (
          <span>
            add <span className="tracking-[0.16em]">RELATION</span>
          </span>
        )}
      </button>

      {isRelationPickerOpen ? (
        <div
          role="dialog"
          aria-label="Choose note relation"
          className="absolute left-0 top-6 z-10 max-h-[min(440px,calc(100dvh-10rem))] w-[min(21rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#090909]/98 p-2 shadow-2xl shadow-black/70 backdrop-blur-xl"
        >
          <div className="space-y-2">
            <section>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/32">
                Areas
              </p>
              <div className="space-y-0.5">
                {AREAS.map((area) =>
                  renderRelationButton({
                    id: `area-${area.id}`,
                    icon: area.emoji,
                    label: area.label,
                    isSelected:
                      relationType === "area" && formData.areaId === area.id,
                    onClick: () => selectAreaRelation(area),
                  }),
                )}
              </div>
            </section>

            <section>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/32">
                Monuments
              </p>
              <div className="space-y-0.5">
                {monuments.length > 0 ? (
                  monuments.map((monument) =>
                    renderRelationButton({
                      id: `monument-${monument.id}`,
                      icon: getMonumentIconOrDefault(monument.emoji),
                      label: monument.title,
                      isSelected:
                        relationType === "monument" &&
                        formData.monumentId === monument.id,
                      onClick: () => selectMonumentRelation(monument),
                    }),
                  )
                ) : (
                  <p className="px-2 py-1.5 text-xs text-white/34">
                    No monuments available
                  </p>
                )}
              </div>
            </section>

            <section>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/32">
                Skills
              </p>
              <div className="space-y-1">
                {groupedSkills.length > 0 ? (
                  groupedSkills.map((group) => (
                    <div key={group.id}>
                      <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/24">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.skills.map((skill) =>
                          renderRelationButton({
                            id: `skill-${skill.id}`,
                            icon: skill.icon,
                            label: skill.name,
                            isSelected:
                              relationType === "skill" &&
                              formData.skillId === skill.id,
                            onClick: () => selectSkillRelation(skill),
                          }),
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-xs text-white/34">
                    No skills available
                  </p>
                )}
              </div>
            </section>

            {!forceTopLevel && relationType === "skill" && formData.skillId ? (
              <section className="border-t border-white/[0.06] px-2 pt-2">
                <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/32">
                  Parent note
                </p>
                <Select
                  value={selectedParentId ?? ROOT_PARENT_VALUE}
                  onValueChange={(value) => {
                    if (value === ROOT_PARENT_VALUE) {
                      setSelectedParentId(null);
                    } else {
                      setSelectedParentId(value);
                    }
                  }}
                  placeholder="Top-level page"
                  className="text-white"
                  trigger={
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/36" />
                      <span className="truncate">
                        {isLoadingParents ? "Loading..." : selectedParentTitle}
                      </span>
                    </span>
                  }
                  triggerClassName="h-9 rounded-lg border-white/[0.07] bg-black/24 text-left text-xs text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.11]"
                  contentWrapperClassName="border-white/[0.08] bg-[#090909] shadow-2xl shadow-black/60"
                >
                  <SelectContent className="bg-[#090909] text-white">
                    <SelectItem value={ROOT_PARENT_VALUE}>
                      {isLoadingParents ? "Loading..." : "Top-level page"}
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
                  <p className="pt-1.5 text-xs text-white/42">
                    Sub-notes can only nest one level deep.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/76 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md sm:p-5">
      <div
        ref={modalPanelRef}
        data-add-note-modal
        data-keyboard-accessory-active={
          isKeyboardAccessoryActive ? "true" : undefined
        }
        style={modalKeyboardAccessoryStyle}
        className={`flex max-h-[min(calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)),760px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[26px] border border-white/[0.08] ${NOTE_SOFT_OLED_CLASSES.surface} ${NOTE_SOFT_OLED_CLASSES.body} shadow-[0_28px_90px_-36px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.055)]`}
      >
        <div className="px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
          {relationControl}
          <div className="mt-1">
            <NoteEditorHeader
              icon={formData.icon}
              title={formData.title}
              onIconChange={(icon) => setFormData({ ...formData, icon })}
              onTitleChange={(title) => setFormData({ ...formData, title })}
              trailingControl={
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/55 outline-none transition hover:bg-white/[0.06] hover:text-white/82 focus-visible:ring-2 focus-visible:ring-emerald-300/20"
                  aria-label="Close Add Note"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            />
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2 [-webkit-overflow-scrolling:touch] sm:px-5 sm:pb-5"
          style={{
            paddingBottom: formScrollPaddingBottom,
            scrollPaddingBottom: formScrollPaddingBottom,
          }}
        >
          <div
            ref={editorSurfaceRef}
            onFocus={() => setIsEditorActive(true)}
            onBlur={handleEditorSurfaceBlur}
            className="flex min-h-[320px] flex-1 flex-col py-3 sm:min-h-[380px]"
          >
            <div className="min-h-0 flex-1">
              <NoteSlashTextarea
                ref={noteTextareaRef}
                value={formData.content}
                onValueChange={(content) =>
                  setFormData((current) => ({ ...current, content }))
                }
                databaseDefinitions={getMetadataDatabases(noteMetadata)}
                onDatabaseDefinitionsChange={handleDatabaseDefinitionsChange}
                databaseEntries={getMetadataDatabaseEntries(noteMetadata)}
                onDatabaseEntriesChange={handleDatabaseEntriesChange}
                noteTodos={readNoteTodos(noteMetadata)}
                onNoteTodosChange={
                  noteTodoOwner ? handleNoteTodosChange : undefined
                }
                noteTodoOwner={noteTodoOwner}
                skills={noteTodoSkills}
                skillCategories={skillCategories}
                onCreateSubpage={async () => null}
                placeholder="Start typing, or press / for commands…"
                className={`min-h-[320px] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 ${NOTE_SOFT_OLED_CLASSES.body} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder} sm:min-h-[380px]`}
                aria-label="Note editor"
              />
            </div>

            <div
              className={`grid transition-[grid-template-rows,opacity,margin-top] duration-150 ease-out ${
                isEditorActive
                  ? "mt-2 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {isEditorActive ? (
                  <NoteTextActionBar
                    onFormat={(command) =>
                      noteTextareaRef.current?.applyTextFormat(command)
                    }
                    onBlockFormat={(format) =>
                      noteTextareaRef.current?.applyBlockFormat(format)
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-3 border-t border-white/[0.06] pt-3">
            <Button
              type="submit"
              className="mt-3 h-11 w-full rounded-xl border border-white/[0.12] bg-zinc-950/72 text-sm font-semibold text-white shadow-[0_18px_44px_-26px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:border-white/[0.18] hover:bg-zinc-900/82 active:bg-zinc-950/88 disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/36 disabled:shadow-none disabled:backdrop-blur-none"
              disabled={!canSubmit}
              aria-busy={isSaving}
            >
              {isSaving ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </form>
        <style jsx global>{`
          [data-add-note-modal] [data-note-text-action-bar] {
            position: static !important;
            bottom: auto !important;
            padding-left: 0;
            padding-right: 0;
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          [data-add-note-modal] [data-note-text-action-bar] > div {
            align-items: flex-start;
            max-width: none;
          }

          [data-add-note-modal][data-keyboard-accessory-active="true"]
            [data-note-text-action-bar] {
            position: fixed !important;
            bottom: var(--note-modal-keyboard-inset) !important;
            left: var(--note-modal-toolbar-left) !important;
            right: auto !important;
            width: var(--note-modal-toolbar-width) !important;
            z-index: 60;
            padding-left: 0.5rem;
            padding-right: 0.5rem;
          }

          [data-add-note-modal][data-keyboard-accessory-active="true"]
            [data-note-text-action-bar]
            > div {
            align-items: center;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
