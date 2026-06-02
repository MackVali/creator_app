"use client";

import { Reorder } from "framer-motion";
import { PaintBucket } from "lucide-react";
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
  onAddSkill?: () => void;
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
  onAddSkill,
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
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const [icon, setIcon] = useState<string>(iconOverride || category.icon || "");
  const [iconDraft, setIconDraft] = useState<string>(iconOverride || category.icon || "");
  const [isSavingSkillOrder, setIsSavingSkillOrder] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name || "");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragging = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

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
    if (!menuOpen) {
      setNameDraft(category.name ?? "");
      setIconDraft(icon);
    }
    setMenuOpenStateSafe(!menuOpen);
  }, [category.name, icon, menuOpen, setMenuOpenStateSafe]);

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
      closeMenu();
    }
  }, [editingRestricted, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeMenu, menuOpen]);

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
      return;
    }
    setIsRenaming(true);
    try {
      await updateCatName(category.id, trimmedName);
      onNameChange?.(trimmedName);
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
  const orderLabel =
    typeof category.order === "number" && Number.isFinite(category.order) ? `#${category.order}` : "#";

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
                ref={menuTriggerRef}
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
                  ref={menuRef}
                  className="absolute left-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl p-2 text-sm text-slate-300 shadow-2xl backdrop-blur-xl"
                  style={{
                    background: `linear-gradient(180deg, ${withAlpha("#0f172a", 0.94)} 0%, ${withAlpha("#020617", 0.9)} 100%)`,
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    boxShadow: "0 18px 36px rgba(2, 6, 23, 0.46), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  {deleteConfirmOpen ? (
                    <div className="space-y-3">
                      <p className="text-xs leading-relaxed text-slate-400">
                        Removing this category moves its skills to the uncategorized list. The built-in skills remain
                        locked.
                      </p>
                      <div className="flex justify-between text-xs font-medium uppercase tracking-wide">
                        <button
                          type="button"
                          className="text-slate-400"
                          onClick={() => setDeleteConfirmOpen(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-rose-300"
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
                          <p className="text-xs leading-relaxed text-slate-400">
                            This locked category can be deleted, but its skills stay intact and move to Uncategorized.
                          </p>
                          <button
                            type="button"
                            className="block text-left text-sm font-semibold uppercase tracking-wide text-rose-300 underline"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={isDeleting}
                          >
                            Delete category
                          </button>
                        </>
                      ) : (
                        <p className="text-xs font-semibold uppercase text-slate-400">Category locked</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-center gap-1.5">
                        <input
                          type="text"
                          value={iconDraft}
                          onChange={(event) => setIconDraft(event.target.value)}
                          onBlur={() => {
                            if (iconDraft !== icon) {
                              void handleIconSave(iconDraft);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleIconSave(iconDraft);
                            }
                          }}
                          maxLength={8}
                          className="h-9 w-10 rounded-md border border-black/70 bg-slate-800/80 px-2 text-center text-base text-white outline-none transition focus:border-black focus:bg-slate-800 focus:ring-2 focus:ring-white/10"
                          aria-label="Category icon"
                          disabled={isRenaming}
                        />
                        <input
                          type="text"
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onBlur={() => {
                            if (nameDraft.trim() && nameDraft.trim() !== category.name) {
                              void handleRenameSave();
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleRenameSave();
                            }
                          }}
                          className="h-9 min-w-0 rounded-md border border-black/70 bg-slate-800/80 px-2.5 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-black focus:bg-slate-800 focus:ring-2 focus:ring-white/10"
                          placeholder="Category name"
                          maxLength={80}
                          aria-label="Category name"
                          disabled={isRenaming}
                        />
                        <label
                          className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white/10 text-white shadow-inner transition hover:bg-white/15 focus-within:ring-2 focus-within:ring-white/35 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                          style={{ backgroundColor: withAlpha(color, 0.38) }}
                        >
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => handleColorChange(e.target.value)}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                            disabled={isRenaming}
                            aria-label="Change category color"
                          />
                          <span
                            aria-hidden
                            className="absolute inset-0"
                            style={{
                              background: `linear-gradient(135deg, ${withAlpha(color, 0.82)}, ${withAlpha(darken(color, 0.24), 0.68)})`,
                              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
                            }}
                          />
                          <PaintBucket
                            aria-hidden
                            className="relative z-10 h-4 w-4 drop-shadow-sm"
                            strokeWidth={2.1}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-[2rem_2rem_minmax(2.75rem,1fr)_2rem_2rem] items-center gap-0.5 rounded-md border border-black/60 bg-slate-950/35 p-0.5 text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => onReorder?.("first")}
                          disabled={!onReorder || !canMoveToStart || isReordering}
                          className="group relative flex h-6 items-center justify-center overflow-hidden rounded-sm text-sm leading-none transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move to first position"
                        >
                          <span aria-hidden className="relative text-slate-400">⇤</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#ffffff", 0.08) }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorder?.("left")}
                          disabled={!onReorder || !canMoveLeft || isReordering}
                          className="group relative flex h-6 items-center justify-center overflow-hidden rounded-sm text-base leading-none transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move earlier"
                        >
                          <span aria-hidden className="relative text-slate-400">‹</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#ffffff", 0.08) }}
                          />
                        </button>
                        <span className="min-w-0 border-x border-white/10 px-1.5 text-center text-[10px] font-semibold uppercase leading-6 tracking-wide text-slate-400">
                          {orderLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => onReorder?.("right")}
                          disabled={!onReorder || !canMoveRight || isReordering}
                          className="group relative flex h-6 items-center justify-center overflow-hidden rounded-sm text-base leading-none transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move later"
                        >
                          <span aria-hidden className="relative text-slate-400">›</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#ffffff", 0.08) }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorder?.("last")}
                          disabled={!onReorder || !canMoveToEnd || isReordering}
                          className="group relative flex h-6 items-center justify-center overflow-hidden rounded-sm text-sm leading-none transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Move to last position"
                        >
                          <span aria-hidden className="relative text-slate-400">⇥</span>
                          <span
                            className="pointer-events-none absolute inset-0 opacity-0 transition group-active:opacity-100 group-focus-visible:opacity-100"
                            style={{ background: withAlpha("#ffffff", 0.08) }}
                          />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => {
                          closeMenu();
                          onAddSkill?.();
                        }}
                        disabled={isRenaming || !onAddSkill}
                      >
                        ADD A NEW SKILL
                      </button>
                      {canDeleteCategory && (
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => setDeleteConfirmOpen(true)}
                          disabled={isRenaming}
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
                <span>add SKILL</span>
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
