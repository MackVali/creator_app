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

  const on = useMemo(() => getOnColor(color), [color]);
  const track = useMemo(
    () => (on === "#fff" ? withAlpha(lighten(color, 0.55), 0.25) : withAlpha(darken(color, 0.45), 0.35)),
    [color, on]
  );
  const fill = useMemo(
    () => (on === "#fff" ? withAlpha("#ffffff", 0.85) : withAlpha("#0f172a", 0.75)),
    [on]
  );
  const haloColor = useMemo(() => withAlpha(lighten(color, 0.35), 0.25), [color]);
  const cardSurface = useMemo(() => {
    if (active) {
      return `linear-gradient(140deg, ${withAlpha(color, 0.92)} 0%, ${withAlpha(
        lighten(color, 0.2),
        0.86
      )} 50%, ${withAlpha(lighten(color, 0.45), 0.72)} 100%)`;
    }
    return `linear-gradient(150deg, ${withAlpha(color, 0.68)} 0%, ${withAlpha(
      darken(color, 0.12),
      0.64
    )} 100%)`;
  }, [active, color]);
  const borderSheen = useMemo(
    () =>
      active
        ? "linear-gradient(120deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 45%, transparent 70%)"
        : "linear-gradient(130deg, rgba(255,255,255,0.22) 0%, transparent 75%)",
    [active]
  );
  const dropShadow = useMemo(
    () =>
      active
        ? `0 34px 66px ${withAlpha(darken(color, 0.6), 0.5)}`
        : "0 18px 40px rgba(15, 23, 42, 0.4)",
    [active, color]
  );
  const headerChipBg = useMemo(
    () => (on === "#fff" ? withAlpha("#ffffff", 0.16) : withAlpha("#0f172a", 0.22)),
    [on]
  );
  const badgeBg = useMemo(
    () => (on === "#fff" ? withAlpha("#ffffff", 0.2) : withAlpha("#0f172a", 0.28)),
    [on]
  );
  const listBackground = useMemo(
    () => (on === "#fff" ? withAlpha("#000000", 0.18) : withAlpha("#ffffff", 0.14)),
    [on]
  );

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
    <motion.div layout className="relative h-full" style={{ perspective: 1400 }}>
      <motion.div
        className="relative h-full"
        animate={{
          scale: active ? 1.05 : 0.98,
          y: active ? -6 : 0,
          boxShadow: dropShadow,
          filter: active ? "brightness(1.05) saturate(1.08)" : "brightness(0.92) saturate(0.85)",
          opacity: active ? 1 : 0.88,
        }}
        whileHover={{ rotateX: active ? 0 : 2, rotateY: active ? 0 : -2, scale: active ? 1.07 : 1.02 }}
        transition={{ type: "spring", stiffness: 240, damping: 28, mass: 1 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <motion.div
          className="pointer-events-none absolute -inset-12 rounded-[38px] blur-3xl"
          style={{ background: haloColor }}
          animate={{ opacity: active ? 0.34 : 0.18 }}
        />
        <div
          className="relative z-10 flex h-full flex-col rounded-[28px] border border-white/12 bg-transparent p-3 sm:p-4 backdrop-blur-xl"
          style={{ color: on, background: cardSurface }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
            <motion.div
              className="absolute inset-[1px] rounded-[26px] border border-white/20"
              animate={{ opacity: active ? [0.65, 1, 0.65] : 0.4 }}
              transition={{ duration: active ? 5 : 0.8, repeat: active ? Infinity : 0, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0"
              style={{ background: borderSheen }}
              animate={{ opacity: active ? [0.65, 1, 0.65] : 0.45, x: active ? [0, 10, 0] : 0 }}
              transition={{ duration: active ? 5.6 : 0.6, repeat: active ? Infinity : 0, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0"
              style={{
                background: active
                  ? "linear-gradient(115deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 45%, transparent 70%)"
                  : "linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 75%)",
                mixBlendMode: "screen",
              }}
              animate={{ x: active ? [-40, 40, -40] : 0 }}
              transition={{ duration: active ? 6 : 0.6, repeat: active ? Infinity : 0, ease: "easeInOut" }}
            />
          </div>
          <div className="relative z-10 flex flex-1 flex-col">
            <header className="relative mb-3 flex items-center justify-between gap-3">
              <button
                className="relative overflow-hidden rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wide"
                style={{ backgroundColor: headerChipBg, color: on }}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="relative z-10">{category.name}</span>
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  animate={{ x: [-24, 0, -24] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    background: "linear-gradient(120deg, rgba(255,255,255,0.24) 0%, transparent 60%)",
                    mixBlendMode: "screen",
                  }}
                />
              </button>
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: badgeBg,
                  color: on,
                  borderRadius: "9999px",
                  padding: "0.35rem 0.75rem",
                }}
              >
                {skills.length} skills
              </span>
              {menuOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border border-black/10 bg-white/95 p-3 text-sm text-black shadow-xl backdrop-blur">
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
                        onChange={(e) => setOrderValue(parseInt(e.target.value, 10))}
                        className="w-full rounded border border-black/20 p-1"
                      />
                      <button className="underline" onClick={handleOrderSave}>
                        Save order
                      </button>
                    </div>
                  ) : (
                    <>
                      <button className="underline block text-left" onClick={() => setPickerOpen(true)}>
                        Change cat color
                      </button>
                      <button
                        className="underline block text-left pt-2"
                        onClick={() => setOrderOpen(true)}
                      >
                        Change order
                      </button>
                    </>
                  )}
                </div>
              )}
            </header>
            <Reorder.Group
              axis="y"
              values={localSkills}
              onReorder={setLocalSkills}
              as="div"
              className="flex-1 overflow-y-auto overscroll-contain rounded-2xl px-3 pb-5 pt-4 backdrop-blur-sm flex flex-col gap-2"
              style={{ backgroundColor: listBackground }}
            >
              {localSkills.length === 0 ? (
                <div className="text-sm leading-relaxed" style={{ color: on }}>
                  No skills yet
                  <div className="mt-2 text-xs uppercase tracking-wide">
                    <Link href="/skills" className="underline">
                      Add Skill
                    </Link>
                  </div>
                </div>
              ) : (
                localSkills.map((s) => (
                  <DraggableSkill
                    key={s.id}
                    skill={s}
                    dragging={dragging}
                    onColor={on}
                    trackColor={track}
                    fillColor={fill}
                    onDragStateChange={onSkillDrag}
                  />
                ))
              )}
            </Reorder.Group>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

