"use client";

import Link from "next/link";
import { Reorder } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateCatColor, updateCatIcon, updateCatName, deleteCat } from "@/lib/data/cats";
import { updateSkillsOrder } from "@/lib/data/skills";
import DraggableSkill from "./DraggableSkill";
import type { SkillProgressData } from "./useSkillProgress";
import type { Category, Skill } from "./useSkillsData";

function getOnColor(hex: string) {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // luminance
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#000" : "#fff";
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return { r, g, b };
}

function channelToHex(channel: number) {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));
  return clamped.toString(16).padStart(2, "0");
}

function blend(hex: string, target: string, amount: number) {
  const start = hexToRgb(hex);
  const end = hexToRgb(target);
  const r = start.r + (end.r - start.r) * amount;
  const g = start.g + (end.g - start.g) * amount;
  const b = start.b + (end.b - start.b) * amount;
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

function lighten(hex: string, amount: number) {
  return blend(hex, "#ffffff", amount);
}

function darken(hex: string, amount: number) {
  return blend(hex, "#000000", amount);
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const canDeleteCategory = !isUncategorized && (!isLocked || isDefaultCategory);
  const [color, setColor] = useState(colorOverride || category.color_hex || "#000000");
  const [menuOpenState, setMenuOpenState] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const [icon, setIcon] = useState<string>(iconOverride || category.icon || "");
  const [iconDraft, setIconDraft] = useState<string>(iconOverride || category.icon || "");
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
    [menuControlled, onMenuOpenChange]
  );

  const closeMenu = useCallback(() => {
    setMenuOpenStateSafe(false);
  }, [setMenuOpenStateSafe]);

  const toggleMenu = useCallback(() => {
    setMenuOpenStateSafe(!menuOpen);
  }, [menuOpen, setMenuOpenStateSafe]);

  useEffect(() => {
    setColor(colorOverride || category.color_hex || "#000000");
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

  const handleSkillReorder = useCallback(
    (nextSkills: Skill[]) => {
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
    },
    []
  );

  const extractFirstGlyph = (value: string): string => {
    if (!value) return "";
    if (typeof Intl !== "undefined") {
      const SegmenterCtor = (Intl as typeof Intl & {
        Segmenter?: typeof Intl.Segmenter;
      }).Segmenter;
      if (typeof SegmenterCtor === "function") {
        const segmenter = new SegmenterCtor(undefined, { granularity: "grapheme" });
        const iterator = segmenter.segment(value)[Symbol.iterator]();
        const first = iterator.next();
        return first.done ? "" : first.value.segment;
      }
    }
    return Array.from(value)[0] ?? "";
  };

  const palette = useMemo(() => {
    const base = color || "#6366f1";
    const on = getOnColor(base);
    const surface = active
      ? `linear-gradient(145deg, ${withAlpha(lighten(base, 0.2), 0.96)} 0%, ${withAlpha(base, 0.9)} 52%, ${withAlpha(
          darken(base, 0.14),
          0.82
        )} 100%)`
      : `linear-gradient(150deg, ${withAlpha(lighten(base, 0.14), 0.64)} 0%, ${withAlpha(base, 0.62)} 48%, ${withAlpha(
          darken(base, 0.18),
          0.54
        )} 100%)`;
    const halo = withAlpha(lighten(base, 0.42), active ? 0.32 : 0.18);
    const frame = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", active ? 0.26 : 0.18);
    const track = on === "#fff" ? withAlpha("#ffffff", 0.22) : withAlpha("#0f172a", 0.26);
    const fill = on === "#fff" ? withAlpha("#ffffff", 0.88) : withAlpha("#0f172a", 0.74);
    const listBg = withAlpha(on === "#fff" ? "#020817" : "#ffffff", 0.16);
    const badgeBg = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", 0.18);
    const badgeBorder = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", 0.28);
    const badgeNameBase = on === "#fff" ? darken("#ffffff", 0.16) : "#0f172a";
    const badgeNameBg = withAlpha(badgeNameBase, active ? 0.36 : 0.28);
    const badgeNameBorder = withAlpha(badgeNameBase, active ? 0.52 : 0.38);
    const dropShadow = active
      ? `0 22px 45px ${withAlpha(darken(base, 0.55), 0.42)}, 0 10px 18px ${withAlpha("#0f172a", 0.22)}`
      : "0 14px 30px rgba(15, 23, 42, 0.38), 0 6px 12px rgba(15, 23, 42, 0.24)";
    const sheen = `linear-gradient(120deg, rgba(255,255,255,${active ? "0.38" : "0.24"}) 0%, rgba(255,255,255,0) 72%)`;
    const edgeGlow = withAlpha(lighten(base, 0.55), active ? 0.26 : 0.16);

    return {
      base,
      on,
      surface,
      halo,
      frame,
      track,
      fill,
      listBg,
      badgeBg,
      badgeBorder,
      badgeNameBg,
      badgeNameBorder,
      dropShadow,
      sheen,
      edgeGlow,
    };
  }, [active, color]);

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
  }, [category.id, category.is_locked, closeMenu, isDeleting, onDeleteCategory]);

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

  const borderColor = isDropTarget
    ? withAlpha(palette.on === "#fff" ? "#ffffff" : "#0f172a", 0.6)
    : palette.frame;
  const boxShadow = isDropTarget
    ? `0 0 0 2px ${withAlpha(palette.on === "#fff" ? "#ffffff" : "#0f172a", 0.35)}, ${palette.dropShadow}`
    : palette.dropShadow;

  return (
    <div className="relative h-full" onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
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
              border: `1px solid ${withAlpha(palette.on === "#fff" ? "#ffffff" : "#0f172a", active ? 0.24 : 0.14)}`,
              opacity: active ? 0.75 : 0.5,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-[6px] rounded-[20px] transition-opacity duration-300"
            style={{
              boxShadow: `inset 0 0 0 1px ${palette.edgeGlow}`,
              opacity: active ? 0.7 : 0.45,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300"
            style={{ background: palette.sheen, mixBlendMode: "screen", opacity: active ? 0.6 : 0.35 }}
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
                  backgroundColor: palette.badgeNameBg,
                  border: `1px solid ${palette.badgeNameBorder}`,
                }}
                  onClick={toggleMenu}
              aria-disabled={editingRestricted && !canDeleteCategory}
              >
                {icon && <span className="mr-2 text-lg leading-none">{icon}</span>}
                <span className="pr-3">{category.name}</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300"
                  style={{ background: palette.sheen, mixBlendMode: "screen", opacity: active ? 0.55 : 0.4 }}
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
                      Removing this category moves its skills to the uncategorized list. The built-in skills remain locked.
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
                          This locked category can be deleted, but its skills stay intact and move to Uncategorized.
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
                      <p className="text-xs font-semibold uppercase text-slate-500">Category locked</p>
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
                      className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring focus:ring-slate-300"
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
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-24 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                  />
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
                        className="w-full rounded border border-black/20 p-2 text-base"
                        placeholder="Type any emoji"
                      />
                      <p className="text-[11px] text-slate-400">
                        Enter a custom emoji and save; we won’t suggest defaults anymore.
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
                        <button type="button" className="text-blue-600" onClick={() => handleIconSave(iconDraft)}>
                          Save
                        </button>
                      </div>
                    </div>
                  ) : orderOpen ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Reorder category</p>
                      <div className="flex items-stretch divide-x divide-black/10 overflow-hidden rounded-full border border-black/10 bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => onReorder?.("first")}
                          disabled={!onReorder || !canMoveToStart || isReordering}
                          className="group relative flex h-9 basis-[18%] items-center justify-center text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move to first position"
                        >
                          <span aria-hidden className="relative text-base">⏮</span>
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
                          <span aria-hidden className="relative text-base">⏭</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#0f172a", 0.04) }}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        {isReordering ? "Saving new order…" : "Move this category earlier or later in the carousel."}
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
                      <button className="block text-left text-sm font-medium underline" onClick={() => setPickerOpen(true)}>
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
                    <button className="block text-left text-sm font-medium underline" onClick={() => setOrderOpen(true)}>
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
                backgroundColor: palette.badgeBg,
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
              backgroundColor: palette.listBg,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -10px 18px rgba(15, 23, 42, 0.12)",
              border: `1px solid ${withAlpha(palette.on === "#fff" ? "#ffffff" : "#0f172a", 0.18)}`,
            }}
          >
            {localSkills.length === 0 ? (
              <div className="flex h-full flex-col items-start justify-center gap-2 text-sm leading-relaxed" style={{ color: palette.on }}>
                <span>No skills yet</span>
                <Link href="/skills" className="text-xs font-semibold uppercase tracking-wide underline">
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
