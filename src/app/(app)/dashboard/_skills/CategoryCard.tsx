"use client";

import Link from "next/link";
import { motion, Reorder } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCatColor, updateCatOrder } from "@/lib/data/cats";
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
}

export default function CategoryCard({
  category,
  skills,
  active,
  onSkillDrag,
}: Props) {
  const [color, setColor] = useState(category.color_hex || "#000000");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderValue, setOrderValue] = useState<number>(category.order ?? 0);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const dragging = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setColor(category.color_hex || "#000000");
  }, [category.color_hex]);
  useEffect(() => {
    setOrderValue(category.order ?? 0);
  }, [category.order]);
  useEffect(() => {
    setLocalSkills([...skills]);
  }, [skills]);

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
      setOrderOpen(false);
    }
  }, [menuOpen]);

  const handleColorChange = async (newColor: string) => {
    setColor(newColor);
    try {
      await updateCatColor(category.id, newColor);
    } catch (e) {
      console.error("Failed to update category color", e);
    } finally {
      setPickerOpen(false);
      setMenuOpen(false);
    }
  };

  const handleOrderSave = async () => {
    try {
      await updateCatOrder(category.id, orderValue);
      router.refresh();
    } catch (e) {
      console.error("Failed to update category order", e);
    } finally {
      setOrderOpen(false);
      setMenuOpen(false);
    }
  };

  return (
    <motion.div layout className="relative h-full">
      <motion.article
        className="relative flex h-full flex-col rounded-[26px] border px-3 pb-4 pt-5 shadow-lg sm:px-4"
        style={{
          color: palette.on,
          background: palette.surface,
          borderColor: palette.frame,
          boxShadow: palette.dropShadow,
        }}
        animate={{ scale: active ? 1.02 : 1, y: active ? -6 : 0, opacity: active ? 1 : 0.92 }}
        transition={{ type: "spring", stiffness: 230, damping: 28, mass: 0.9 }}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-12 rounded-[34px] blur-3xl"
          style={{ background: palette.halo }}
          animate={{ opacity: active ? 0.3 : 0.16 }}
          transition={{ duration: 0.6 }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
          <motion.span
            aria-hidden
            className="absolute inset-[1px] rounded-[24px]"
            style={{ border: `1px solid ${withAlpha(palette.on === "#fff" ? "#ffffff" : "#0f172a", active ? 0.24 : 0.14)}` }}
            animate={{ opacity: active ? [0.65, 0.9, 0.65] : 0.5 }}
            transition={{ duration: active ? 4.6 : 0.8, repeat: active ? Infinity : 0, ease: "easeInOut" }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0"
            style={{ background: palette.sheen, mixBlendMode: "screen" }}
            animate={{ x: active ? [-18, 18, -18] : 0, opacity: active ? [0.4, 0.75, 0.4] : 0.35 }}
            transition={{ duration: active ? 5.6 : 0.9, repeat: active ? Infinity : 0, ease: "easeInOut" }}
          />
        </div>
        <div className="relative z-10 flex h-full flex-col">
          <header className="mb-3 flex items-center justify-between gap-3">
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
              <span className="pr-3">{category.name}</span>
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ background: palette.sheen, mixBlendMode: "screen" }}
                animate={{ x: active ? [-12, 12, -12] : [-8, 8, -8] }}
                transition={{ duration: active ? 5 : 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </button>
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
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-black/10 bg-white/95 p-3 text-sm text-slate-900 shadow-xl backdrop-blur">
                {pickerOpen ? (
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-24 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                ) : orderOpen ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="number"
                      value={orderValue}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setOrderValue(Number.isNaN(next) ? 0 : next);
                      }}
                      className="w-full rounded border border-black/20 p-2"
                    />
                    <button className="self-end text-xs font-medium underline" onClick={handleOrderSave}>
                      Save order
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button className="block text-left text-sm font-medium underline" onClick={() => setPickerOpen(true)}>
                      Change color
                    </button>
                    <button className="block text-left text-sm font-medium underline" onClick={() => setOrderOpen(true)}>
                      Change order
                    </button>
                  </div>
                )}
              </div>
            )}
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
      </motion.article>
    </motion.div>
  );
}

