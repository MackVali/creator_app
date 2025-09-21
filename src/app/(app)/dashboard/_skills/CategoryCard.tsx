"use client";

import Link from "next/link";
import { motion, Reorder, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCatColor, updateCatOrder } from "@/lib/data/cats";
import DraggableSkill from "./DraggableSkill";
import type { Category, Skill } from "./useSkillsData";
import { FALLBACK_ACCENT, getReadableColor, rgba, tintColor } from "./carouselUtils";

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
  const [color, setColor] = useState(category.color_hex || FALLBACK_ACCENT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderValue, setOrderValue] = useState<number>(category.order ?? 0);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const dragging = useRef(false);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setColor(category.color_hex || FALLBACK_ACCENT);
  }, [category.color_hex]);
  useEffect(() => {
    setOrderValue(category.order ?? 0);
  }, [category.order]);
  useEffect(() => {
    setLocalSkills([...skills]);
  }, [skills]);

  const accent = color || FALLBACK_ACCENT;
  const on = useMemo(() => getReadableColor(accent), [accent]);
  const palette = useMemo(
    () => ({
      surface: tintColor(accent, active ? 0.92 : 0.85, active ? 0.22 : 0.16),
      glow: rgba(accent, active ? 0.45 : 0.26),
      halo: tintColor(accent, 0.96, active ? 0.45 : 0.32),
      border: rgba(accent, active ? 0.45 : 0.28),
      chip: tintColor(accent, 0.78, 0.22),
      track: rgba(accent, 0.22),
      fill: tintColor(accent, 0.35, 0.9),
      shadow: rgba(accent, active ? 0.42 : 0.24),
      highlight: tintColor(accent, 0.62, 0.5),
    }),
    [accent, active]
  );
  const sweepTransition = active
    ? { duration: 6, repeat: Infinity as const, repeatType: "loop" as const, ease: "easeInOut" }
    : { duration: 0.5, ease: "easeOut" };

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
    <motion.article
      layout
      className="group/card relative h-full overflow-hidden rounded-[32px] border"
      style={{
        color: on,
        borderColor: palette.border,
        background: `linear-gradient(140deg, ${palette.surface}, rgba(12, 10, 32, ${active ? 0.32 : 0.22}))`,
        transformStyle: "preserve-3d",
        transformOrigin: "center",
      }}
      animate={{
        scale: active ? 1.04 : 0.97,
        opacity: active ? 1 : 0.78,
        y: active ? 0 : 12,
        rotateX: active ? 0 : 3,
        boxShadow: active
          ? `0 48px 120px -60px ${palette.shadow}`
          : "0 24px 80px -60px rgba(15,23,42,0.55)",
      }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-12 opacity-80 blur-3xl"
        animate={{
          opacity: active ? 0.88 : 0.45,
          scale: active ? 1.08 : 0.94,
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ background: `radial-gradient(circle at 20% 20%, ${palette.glow}, transparent 65%)` }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: active ? 0.6 : 0.35 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ background: `linear-gradient(160deg, ${palette.halo} 0%, transparent 60%)` }}
      />
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-[-20%] left-[-45%] z-10 w-[135%] rotate-[18deg] blur-3xl"
          style={{ background: `linear-gradient(90deg, transparent, ${palette.highlight}, transparent)` }}
          animate={
            active
              ? { opacity: 0.7, x: ["-35%", "118%"] }
              : { opacity: 0, x: "-45%" }
          }
          transition={sweepTransition}
        />
      )}
      <div className="relative z-20 flex h-full flex-col px-5 py-6 sm:px-7 sm:py-8">
        <header className="relative mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              className="text-left text-lg font-semibold tracking-tight transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{ color: on }}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span
                className="block leading-snug"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {category.name}
              </span>
            </button>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em]"
            style={{
              background: palette.chip,
              color: on,
              borderColor: rgba(accent, 0.35),
              boxShadow: `0 18px 42px -28px ${palette.shadow}`,
            }}
          >
            {skills.length}
            <span className="hidden sm:inline">skills</span>
          </span>
          {menuOpen && (
            <div className="absolute left-0 top-full z-40 mt-2 min-w-[11rem] rounded-2xl border border-white/10 bg-black/70 p-3 text-sm text-white shadow-xl backdrop-blur-xl">
              {pickerOpen ? (
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="h-24 w-full cursor-pointer rounded-xl border border-white/20 bg-white/5 p-1"
                />
              ) : orderOpen ? (
                <div className="flex flex-col gap-3">
                  <input
                    type="number"
                    value={orderValue}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      setOrderValue(Number.isNaN(next) ? 0 : next);
                    }}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-base text-white"
                  />
                  <button
                    className="rounded-lg border border-white/20 px-3 py-1 font-medium tracking-wide text-white transition hover:bg-white/10"
                    onClick={handleOrderSave}
                  >
                    Save order
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    className="rounded-lg px-3 py-2 text-left font-medium transition hover:bg-white/10"
                    onClick={() => setPickerOpen(true)}
                  >
                    Change color palette
                  </button>
                  <button
                    className="rounded-lg px-3 py-2 text-left font-medium transition hover:bg-white/10"
                    onClick={() => setOrderOpen(true)}
                  >
                    Reorder category
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
          className="flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 sm:pr-2"
        >
          {localSkills.length === 0 ? (
            <div className="rounded-2xl border border-white/20 bg-white/5 p-4 text-sm text-white/80">
              No skills yet
              <div className="mt-2">
                <Link href="/skills" className="font-medium underline">
                  Add your first skill
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
                trackColor={palette.track}
                fillColor={palette.fill}
                onDragStateChange={onSkillDrag}
              />
            ))
          )}
        </Reorder.Group>
      </div>
    </motion.article>
  );
}

