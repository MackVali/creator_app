"use client";

import Link from "next/link";
import { Reorder } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  updateCatColor,
  updateCatIcon,
  updateCatName,
  deleteCat,
} from "@/lib/data/cats";
import { updateSkillsOrder } from "@/lib/data/skills";
import DraggableSkill from "./DraggableSkill";
import {
  buildCategoryCardPalette,
  CATEGORY_COLOR_OPTIONS,
  FALLBACK_CATEGORY_COLOR,
  withAlpha,
} from "./categoryColorSystem";
import type { SkillProgressData } from "./useSkillProgress";
import type { Category, Skill } from "./useSkillsData";

interface Props {
  category: Category;
  skills: Skill[];
  active: boolean;
  onSkillDrag: (dragging: boolean) => void;
  colorOverride?: string | null;
  iconOverride?: string | null;
  progressBySkillId?: Record<string, SkillProgressData>;
  onColorChange?: (color: string) => void;
  onIconChange?: (icon: string | null) => void;
  onNameChange?: (name: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  onReorder?: (direction: "left" | "right" | "first" | "last") => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canMoveToStart?: boolean;
  canMoveToEnd?: boolean;
  isReordering?: boolean;
  isDropTarget?: boolean;
  isDraggingSkill?: boolean;
  onSkillDragStart?: (skill: Skill) => void;
  onSkillDragEnd?: (skill: Skill) => void;
  onDragCategoryHover?: () => void;
  onDragCategoryLeave?: () => void;
}

export default function CategoryCard({
  category,
  skills,
  active,
  onSkillDrag,
  colorOverride,
  iconOverride,
  progressBySkillId,
  onColorChange,
  onIconChange,
  onNameChange,
  onDeleteCategory,
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  onReorder,
  canMoveLeft,
  canMoveRight,
  canMoveToStart,
  canMoveToEnd,
  isReordering,
  isDropTarget,
  isDraggingSkill,
  onSkillDragStart,
  onSkillDragEnd,
  onDragCategoryHover,
  onDragCategoryLeave,
}: Props) {
  const isLocked = Boolean(category.is_locked);
  const isDefaultCategory = Boolean(category.is_default);
  const isUncategorized = category.id === "uncategorized";
  const editingRestricted = isLocked && !isDefaultCategory;
  const canDeleteCategory =
    !isUncategorized && (!isLocked || isDefaultCategory);
  const [color, setColor] = useState(
    colorOverride || category.color_hex || FALLBACK_CATEGORY_COLOR,
  );
  const [menuOpenState, setMenuOpenState] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const [icon, setIcon] = useState<string>(iconOverride || category.icon || "");
  const [iconDraft, setIconDraft] = useState<string>(
    iconOverride || category.icon || "",
  );
  const [isSavingSkillOrder, setIsSavingSkillOrder] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name || "");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragging = useRef(false);

  const menuControlled = menuOpenProp !== undefined;
  const menuOpen = menuOpenProp ?? menuOpenState;

  const setMenuOpenStateSafe = useCallback(
    (next: boolean) => {
      if (menuControlled) {
        onMenuOpenChange?.(next);
      } else {
        setMenuOpenState(next);
      }
    },
    [menuControlled, onMenuOpenChange],
  );

  const closeMenu = useCallback(() => {
    setMenuOpenStateSafe(false);
  }, [setMenuOpenStateSafe]);

  const toggleMenu = useCallback(() => {
    setMenuOpenStateSafe(!menuOpen);
  }, [menuOpen, setMenuOpenStateSafe]);

  useEffect(() => {
    setColor(colorOverride || category.color_hex || FALLBACK_CATEGORY_COLOR);
  }, [category.color_hex, colorOverride]);
  useEffect(() => {
    setLocalSkills([...skills]);
  }, [skills]);
  useEffect(() => {
    const nextIcon = iconOverride ?? category.icon ?? "";
    setIcon(nextIcon);
    setIconDraft(nextIcon);
  }, [category.icon, iconOverride]);

  useEffect(() => {
    setNameDraft(category.name ?? "");
  }, [category.name]);

  useEffect(() => {
    if (editingRestricted) {
      setPickerOpen(false);
      setOrderOpen(false);
      setIconPickerOpen(false);
      closeMenu();
    }
  }, [editingRestricted, closeMenu]);

  const handleSkillReorder = useCallback((nextSkills: Skill[]) => {
    setLocalSkills(nextSkills);
    if (nextSkills.length === 0) return;

    const updates = nextSkills.map((skill, index) => ({
      id: skill.id,
      sort_order: index + 1,
    }));

    setIsSavingSkillOrder(true);
    void updateSkillsOrder(updates)
      .catch((error) => {
        console.error("Failed to save skill order", error);
      })
      .finally(() => {
        setIsSavingSkillOrder(false);
      });
  }, []);

  const extractFirstGlyph = (value: string): string => {
    if (!value) return "";
    if (typeof Intl !== "undefined") {
      const SegmenterCtor = (
        Intl as typeof Intl & {
          Segmenter?: typeof Intl.Segmenter;
        }
      ).Segmenter;
      if (typeof SegmenterCtor === "function") {
        const segmenter = new SegmenterCtor(undefined, {
          granularity: "grapheme",
        });
        const iterator = segmenter.segment(value)[Symbol.iterator]();
        const first = iterator.next();
        return first.done ? "" : first.value.segment;
      }
    }
    return Array.from(value)[0] ?? "";
  };

  const palette = useMemo(
    () => buildCategoryCardPalette(color, active),
    [active, color],
  );

  useEffect(() => {
    if (!menuOpen) {
      setPickerOpen(false);
      setOrderOpen(false);
      setIconPickerOpen(false);
      setRenameOpen(false);
      setDeleteConfirmOpen(false);
      setIsDeleting(false);
    }
  }, [menuOpen]);

  const handleColorChange = async (newColor: string) => {
    if (editingRestricted) {
      return;
    }
    setColor(newColor);
    try {
      await updateCatColor(category.id, newColor);
      onColorChange?.(newColor);
    } catch (e) {
      console.error("Failed to update category color", e);
    } finally {
      setPickerOpen(false);
      closeMenu();
    }
  };

  const handleIconSave = async (nextIcon: string) => {
    if (editingRestricted) {
      return;
    }
    const trimmed = nextIcon.trim();
    const normalized = trimmed ? extractFirstGlyph(trimmed) : "";
    setIcon(normalized);
    setIconDraft(normalized);
    try {
      await updateCatIcon(category.id, normalized || null);
      onIconChange?.(normalized || null);
    } catch (e) {
      console.error("Failed to update category icon", e);
    } finally {
      setIconPickerOpen(false);
      closeMenu();
    }
  };

  const handleRenameSave = async () => {
    if (editingRestricted) {
      return;
    }
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      return;
    }
    if (trimmedName === category.name) {
      setRenameOpen(false);
      return;
    }
    setIsRenaming(true);
    try {
      await updateCatName(category.id, trimmedName);
      onNameChange?.(trimmedName);
      setRenameOpen(false);
      closeMenu();
    } catch (error) {
      console.error("Failed to rename category", error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteCategory = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteCat(category.id, {
        allowLocked: Boolean(category.is_locked),
      });
      onDeleteCategory?.(category.id);
      setDeleteConfirmOpen(false);
      closeMenu();
    } catch (error) {
      console.error("Failed to delete category", error);
    } finally {
      setIsDeleting(false);
    }
  }, [
    category.id,
    category.is_locked,
    closeMenu,
    isDeleting,
    onDeleteCategory,
  ]);

  const handlePointerEnter = useCallback(() => {
    if (isDraggingSkill && !isLocked) {
      onDragCategoryHover?.();
    }
  }, [isDraggingSkill, isLocked, onDragCategoryHover]);

  const handlePointerLeave = useCallback(() => {
    if (isDraggingSkill && !isLocked) {
      onDragCategoryLeave?.();
    }
  }, [isDraggingSkill, isLocked, onDragCategoryLeave]);

  const emphasisColor = palette.on === "#f8fafc" ? "#ffffff" : "#0f172a";
  const borderColor = isDropTarget
    ? withAlpha(emphasisColor, 0.58)
    : palette.frame;
  const boxShadow = isDropTarget
    ? `0 0 0 2px ${withAlpha(emphasisColor, 0.26)}, ${palette.dropShadow}`
    : palette.dropShadow;

  return (
    <div
      className="relative h-full"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <article
        className="relative flex h-full flex-col rounded-[26px] border px-3 pb-4 pt-5 shadow-lg transition-all duration-200 sm:px-4"
        style={{
          color: palette.on,
          background: palette.surface,
          borderColor,
          boxShadow,
          transform: active ? "translateY(-2px)" : "translateY(0)",
          opacity: active ? 1 : 0.92,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-12 rounded-[34px] blur-3xl transition-opacity duration-300"
          style={{ background: palette.halo, opacity: active ? 0.3 : 0.16 }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
          <span
            aria-hidden
            className="absolute inset-[1px] rounded-[24px] transition-opacity duration-300"
            style={{
              border: `1px solid ${palette.rim}`,
              opacity: active ? 0.8 : 0.58,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              background: palette.highlight,
              mixBlendMode: "screen",
              opacity: active ? 0.95 : 0.75,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              background: palette.colorBloom,
              opacity: active ? 0.9 : 0.7,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              background: palette.depthShade,
              opacity: active ? 1 : 0.92,
            }}
          />
        </div>
        <div className="relative z-10 flex h-full flex-col">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div className="relative inline-flex flex-col">
              <button
                type="button"
                className="relative inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{
                  color: palette.on,
                  background: palette.badgeNameBg,
                  border: `1px solid ${palette.badgeNameBorder}`,
                }}
                onClick={toggleMenu}
                aria-disabled={editingRestricted && !canDeleteCategory}
              >
                {icon && (
                  <span className="mr-2 text-lg leading-none">{icon}</span>
                )}
                <span className="pr-3">{category.name}</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300"
                  style={{
                    background: palette.highlight,
                    mixBlendMode: "screen",
                    opacity: active ? 0.28 : 0.18,
                  }}
                />
              </button>
              {menuOpen && (
                <div
                  className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl p-3 text-sm text-slate-400 shadow-xl backdrop-blur"
                  style={{
                    background: `linear-gradient(180deg, ${withAlpha("#0f172a", 0.92)} 0%, ${withAlpha("#0b1220", 0.85)} 100%)`,
                    border: "1px solid rgba(0, 0, 0, 0.9)",
                  }}
                >
                  {deleteConfirmOpen ? (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">
                        Removing this category moves its skills to the
                        uncategorized list. The built-in skills remain locked.
                      </p>
                      <div className="flex justify-between text-xs font-medium uppercase tracking-wide">
                        <button
                          type="button"
                          className="text-slate-500"
                          onClick={() => setDeleteConfirmOpen(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-rose-600"
                          onClick={handleDeleteCategory}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting…" : "Delete category"}
                        </button>
                      </div>
                    </div>
                  ) : editingRestricted ? (
                    <div className="space-y-3">
                      {canDeleteCategory ? (
                        <>
                          <p className="text-xs text-slate-500">
                            This locked category can be deleted, but its skills
                            stay intact and move to Uncategorized.
                          </p>
                          <button
                            type="button"
                            className="block text-left text-sm font-semibold uppercase tracking-wide text-rose-500 underline"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={isDeleting}
                          >
                            Delete category
                          </button>
                        </>
                      ) : (
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Category locked
                        </p>
                      )}
                    </div>
                  ) : renameOpen ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase text-slate-500">
                        Rename category
                      </label>
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleRenameSave();
                          }
                        }}
                        autoFocus
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none focus:ring focus:ring-white/20"
                        placeholder="Category name"
                        maxLength={80}
                      />
                      <div className="flex justify-between text-xs font-medium uppercase tracking-wide">
                        <button
                          type="button"
                          className="text-slate-500"
                          onClick={() => setRenameOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-blue-600"
                          onClick={handleRenameSave}
                          disabled={isRenaming || nameDraft.trim().length === 0}
                        >
                          {isRenaming ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : pickerOpen ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          Premium palette
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Richer hues with softer highlights and cleaner depth
                          across the carousel.
                        </p>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {CATEGORY_COLOR_OPTIONS.map((option) => {
                          const isSelected =
                            option.value.toLowerCase() === color.toLowerCase();
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleColorChange(option.value)}
                              className="group relative h-10 rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                              style={{
                                background: `linear-gradient(160deg, ${option.value} 0%, ${withAlpha(option.value, 0.78)} 100%)`,
                                borderColor: isSelected
                                  ? "rgba(255,255,255,0.72)"
                                  : "rgba(255,255,255,0.14)",
                                boxShadow: isSelected
                                  ? `0 0 0 1px rgba(255,255,255,0.28), 0 14px 28px ${withAlpha(option.value, 0.34)}`
                                  : `0 10px 20px ${withAlpha(option.value, 0.18)}`,
                              }}
                              aria-label={`Use ${option.label}`}
                              title={option.label}
                            >
                              <span
                                aria-hidden
                                className="absolute inset-x-2 top-1.5 h-3 rounded-full"
                                style={{
                                  background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))",
                                }}
                              />
                              {isSelected && (
                                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-[0.28em] text-white">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Custom color
                      </label>
                      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleColorChange(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded-xl border border-white/20 bg-transparent p-0"
                        />
                        <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
                          {color}
                        </span>
                      </div>
                    </div>
                  ) : iconPickerOpen ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase text-slate-500">
                        Pick an emoji
                      </label>
                      <input
                        type="text"
                        value={iconDraft}
                        onChange={(e) => setIconDraft(e.target.value)}
                        maxLength={8}
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-base text-white placeholder:text-slate-500"
                        placeholder="Type any emoji"
                      />
                      <p className="text-[11px] text-slate-400">
                        Enter a custom emoji and save; we won’t suggest defaults
                        anymore.
                      </p>
                      <div className="flex justify-end gap-2 text-xs font-medium uppercase">
                        <button
                          type="button"
                          className="text-slate-500"
                          onClick={() => {
                            setIconPickerOpen(false);
                            setIconDraft(icon);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-blue-600"
                          onClick={() => handleIconSave(iconDraft)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : orderOpen ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Reorder category
                      </p>
                      <div className="flex items-stretch divide-x divide-black/10 overflow-hidden rounded-full border border-black/10 bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => onReorder?.("first")}
                          disabled={
                            !onReorder || !canMoveToStart || isReordering
                          }
                          className="group relative flex h-9 basis-[18%] items-center justify-center text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move to first position"
                        >
                          <span aria-hidden className="relative text-base">
                            ⏮
                          </span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#0f172a", 0.04) }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorder?.("left")}
                          disabled={!onReorder || !canMoveLeft || isReordering}
                          className="group relative flex flex-1 items-center justify-center px-5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="relative">Move left</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#0f172a", 0.04) }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorder?.("right")}
                          disabled={!onReorder || !canMoveRight || isReordering}
                          className="group relative flex flex-1 items-center justify-center px-5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="relative">Move right</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#0f172a", 0.04) }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorder?.("last")}
                          disabled={!onReorder || !canMoveToEnd || isReordering}
                          className="group relative flex h-9 basis-[18%] items-center justify-center text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move to last position"
                        >
                          <span aria-hidden className="relative text-base">
                            ⏭
                          </span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#0f172a", 0.04) }}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        {isReordering
                          ? "Saving new order…"
                          : "Move this category earlier or later in the carousel."}
                      </p>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="text-xs font-medium uppercase text-slate-500"
                          onClick={() => setOrderOpen(false)}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        className="block text-left text-sm font-medium underline"
                        type="button"
                        onClick={() => {
                          setNameDraft(category.name ?? "");
                          setRenameOpen(true);
                        }}
                        disabled={editingRestricted}
                        aria-disabled={editingRestricted}
                      >
                        Rename category
                      </button>
                      <button
                        className="block text-left text-sm font-medium underline"
                        onClick={() => setPickerOpen(true)}
                      >
                        Change color
                      </button>
                      <button
                        className="block text-left text-sm font-medium underline"
                        onClick={() => {
                          setIconDraft(icon);
                          setIconPickerOpen(true);
                        }}
                      >
                        Change icon
                      </button>
                      <button
                        className="block text-left text-sm font-medium underline"
                        onClick={() => setOrderOpen(true)}
                      >
                        Change order
                      </button>
                      {canDeleteCategory && (
                        <button
                          type="button"
                          className="block text-left text-sm font-medium underline text-rose-500"
                          onClick={() => setDeleteConfirmOpen(true)}
                        >
                          Delete category
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide"
              style={{
                color: palette.on,
                background: palette.badgeBg,
                border: `1px solid ${palette.badgeBorder}`,
              }}
            >
              {skills.length} skills
            </span>
          </header>
          {isSavingSkillOrder && (
            <div className="mb-2 flex justify-end">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300/80">
                Saving order...
              </p>
            </div>
          )}
          <Reorder.Group
            axis="y"
            values={localSkills}
            onReorder={handleSkillReorder}
            as="div"
            className="flex-1 overflow-y-auto overscroll-contain rounded-2xl px-3 pb-5 pt-4 backdrop-blur-sm"
            style={{
              background: `${palette.contentGlass}, ${palette.listBg}`,
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -14px 24px rgba(15, 23, 42, 0.14)",
              border: `1px solid ${withAlpha(emphasisColor, 0.14)}`,
            }}
          >
            {localSkills.length === 0 ? (
              <div
                className="flex h-full flex-col items-start justify-center gap-2 text-sm leading-relaxed"
                style={{ color: palette.on }}
              >
                <span>No skills yet</span>
                <Link
                  href="/skills"
                  className="text-xs font-semibold uppercase tracking-wide underline"
                >
                  Add skill
                </Link>
              </div>
            ) : (
              localSkills.map((s) => (
                <DraggableSkill
                  key={s.id}
                  skill={s}
                  progress={progressBySkillId?.[s.id]}
                  dragging={dragging}
                  onColor={palette.on}
                  trackColor={palette.track}
                  fillColor={palette.fill}
                  onDragStateChange={onSkillDrag}
                  onDragStart={() => onSkillDragStart?.(s)}
                  onDragEnd={() => onSkillDragEnd?.(s)}
                />
              ))
            )}
          </Reorder.Group>
        </div>
      </article>
    </div>
  );
}
