"use client";

import Link from "next/link";
import { Reorder } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateCatColor, updateCatIcon } from "@/lib/data/cats";
import DraggableSkill from "./DraggableSkill";
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
  onColorChange?: (color: string) => void;
  onIconChange?: (icon: string | null) => void;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  onOrderRequest?: () => void;
  canReorder?: boolean;
}

export default function CategoryCard({
  category,
  skills,
  active,
  onSkillDrag,
  colorOverride,
  iconOverride,
  onColorChange,
  onIconChange,
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  onOrderRequest,
  canReorder = true,
}: Props) {
  const [color, setColor] = useState(colorOverride || category.color_hex || "#000000");
  const [menuOpenState, setMenuOpenState] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const [icon, setIcon] = useState<string>(iconOverride || category.icon || "");
  const [iconDraft, setIconDraft] = useState<string>(iconOverride || category.icon || "");
  const dragging = useRef(false);
  const menuOpen = menuOpenProp ?? menuOpenState;
  const setMenuOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setMenuOpenState((prevState) => {
      const previous = menuOpenProp ?? prevState;
      const value = typeof next === "function" ? next(previous) : next;
      onMenuOpenChange?.(value);
      return value;
    });
  };

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
      ? `linear-gradient(135deg, ${withAlpha(lighten(base, 0.18), 0.94)} 0%, ${withAlpha(base, 0.88)} 55%, ${withAlpha(
          darken(base, 0.12),
          0.78
        )} 100%)`
      : `linear-gradient(140deg, ${withAlpha(lighten(base, 0.12), 0.58)} 0%, ${withAlpha(base, 0.6)} 50%, ${withAlpha(
          darken(base, 0.16),
          0.52
        )} 100%)`;
    const halo = withAlpha(lighten(base, 0.4), active ? 0.3 : 0.18);
    const frame = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", active ? 0.22 : 0.16);
    const track = on === "#fff" ? withAlpha("#ffffff", 0.2) : withAlpha("#0f172a", 0.24);
    const fill = on === "#fff" ? withAlpha("#ffffff", 0.86) : withAlpha("#0f172a", 0.72);
    const listBg = withAlpha(on === "#fff" ? "#020817" : "#ffffff", 0.14);
    const badgeBg = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", 0.16);
    const badgeBorder = withAlpha(on === "#fff" ? "#ffffff" : "#0f172a", 0.24);
    const dropShadow = active
      ? `0 26px 60px ${withAlpha(darken(base, 0.6), 0.48)}`
      : "0 14px 32px rgba(15, 23, 42, 0.42)";
    const sheen = `linear-gradient(120deg, rgba(255,255,255,${active ? "0.32" : "0.2"}) 0%, rgba(255,255,255,0) 70%)`;

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
      dropShadow,
      sheen,
    };
  }, [active, color]);

  useEffect(() => {
    if (!menuOpen) {
      setPickerOpen(false);
      setIconPickerOpen(false);
    }
  }, [menuOpen]);

  const handleColorChange = async (newColor: string) => {
    setColor(newColor);
    try {
      await updateCatColor(category.id, newColor);
      onColorChange?.(newColor);
    } catch (e) {
      console.error("Failed to update category color", e);
    } finally {
      setPickerOpen(false);
      setMenuOpen(false);
    }
  };

  const handleIconSave = async (nextIcon: string) => {
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
      setMenuOpen(false);
    }
  };

  return (
    <div className="relative h-full">
      <article
        className="relative flex h-full flex-col rounded-[26px] border px-3 pb-4 pt-5 shadow-lg transition-all duration-200 sm:px-4"
        style={{
          color: palette.on,
          background: palette.surface,
          borderColor: palette.frame,
          boxShadow: palette.dropShadow,
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
                  backgroundColor: palette.badgeBg,
                  border: `1px solid ${palette.badgeBorder}`,
                }}
                onClick={() => setMenuOpen((o) => !o)}
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
                <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border border-black/10 bg-white/95 p-3 text-sm text-slate-900 shadow-xl backdrop-blur">
                  {pickerOpen ? (
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="h-24 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  ) : iconPickerOpen ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase text-slate-500">Choose an emoji</label>
                      <input
                        type="text"
                        value={iconDraft}
                        onChange={(e) => setIconDraft(e.target.value)}
                        maxLength={8}
                        className="w-full rounded border border-black/20 p-2 text-base"
                      />
                      <div className="flex flex-wrap gap-2">
                        {["🐱", "🐈", "😺", "🐾", "✨", "🌟", "🧠", "🛠️"].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleIconSave(emoji)}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-xl shadow-sm transition hover:border-black/20"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
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
                  ) : (
                    <div className="space-y-2">
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
                      {canReorder && (
                        <button
                          className="block text-left text-sm font-medium underline"
                          onClick={() => {
                            setMenuOpen(false);
                            onOrderRequest?.();
                          }}
                        >
                          Change order
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
          <Reorder.Group
            axis="y"
            values={localSkills}
            onReorder={setLocalSkills}
            as="div"
            className="flex-1 overflow-y-auto overscroll-contain rounded-2xl px-3 pb-5 pt-4 backdrop-blur-sm"
            style={{
              backgroundColor: palette.listBg,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
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
                  dragging={dragging}
                  onColor={palette.on}
                  trackColor={palette.track}
                  fillColor={palette.fill}
                  onDragStateChange={onSkillDrag}
                />
              ))
            )}
          </Reorder.Group>
        </div>
      </article>
    </div>
  );
}

