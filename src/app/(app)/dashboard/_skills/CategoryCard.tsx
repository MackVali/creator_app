"use client";

import Link from "next/link";
import { motion, Reorder } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { updateCatColor, updateCatOrder } from "@/lib/data/cats";
import { BRAND_CAT_COLORS } from "./brandColors";
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
  const defaultColor = category.color_hex || BRAND_CAT_COLORS[0];
  const [color, setColor] = useState(defaultColor);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderValue, setOrderValue] = useState<number>(category.order ?? 0);
  const [localSkills, setLocalSkills] = useState(() => [...skills]);
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const dragging = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setColor(category.color_hex || BRAND_CAT_COLORS[0]);
  }, [category.color_hex]);
  useEffect(() => {
    setOrderValue(category.order ?? 0);
  }, [category.order]);
  useEffect(() => {
    setLocalSkills([...skills]);
  }, [skills]);
  useEffect(() => {
    if (!menuOpen) {
      setPickerOpen(false);
      setOrderOpen(false);
      setCustomColorOpen(false);
    }
  }, [menuOpen]);

  const bg = color;
  const on = getOnColor(bg);
  const track = on === "#fff" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const fill = on === "#fff" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";

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
    <motion.div
      layout
      className="h-full rounded-3xl border border-black/10 p-3 sm:p-4 flex flex-col shadow-md"
      style={{ backgroundColor: bg, color: on }}
      animate={{
        scale: active ? 1.02 : 1,
        boxShadow: active
          ? "0 12px 24px rgba(0,0,0,0.25)"
          : "0 4px 12px rgba(0,0,0,0.15)",
      }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <motion.div
        key={category.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <header className="flex items-center justify-between mb-2 relative">
          <button
            className="font-semibold"
            style={{ color: on }}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {category.name}
          </button>
          <span
            className="text-xs rounded-xl px-2 py-0.5"
            style={{ backgroundColor: track, color: on }}
          >
            {skills.length}
          </span>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-xl border border-white/10 bg-[#10131c]/95 p-3 text-sm text-white shadow-lg backdrop-blur">
              {pickerOpen ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Choose a color</span>
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 text-[11px] font-medium text-white/60 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      onClick={() => {
                        setPickerOpen(false);
                        setCustomColorOpen(false);
                      }}
                    >
                      Back
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {BRAND_CAT_COLORS.map((swatch) => {
                      const isActive = swatch.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => handleColorChange(swatch)}
                          style={{ backgroundColor: swatch }}
                          className={clsx(
                            "h-8 w-8 rounded-md border border-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80",
                            isActive ? "ring-2 ring-offset-1 ring-white/90 ring-offset-[#10131c]" : ""
                          )}
                          aria-label={`Use ${swatch} color`}
                          aria-pressed={isActive}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomColorOpen((o) => !o)}
                      className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-left text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    >
                      <span>Custom color</span>
                      <span className="text-[10px] uppercase tracking-wide">
                        {customColorOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {customColorOpen && (
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => handleColorChange(e.target.value)}
                        className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-[#05070b] p-1"
                      />
                    )}
                  </div>
                </div>
              ) : orderOpen ? (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between text-white/50">
                    <span>Sort order</span>
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 text-[11px] font-medium text-white/60 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      onClick={() => setOrderOpen(false)}
                    >
                      Back
                    </button>
                  </div>
                  <input
                    type="number"
                    value={orderValue}
                    onChange={(e) => setOrderValue(parseInt(e.target.value, 10))}
                    className="w-full rounded-md border border-white/15 bg-[#05070b] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
                  />
                  <button
                    className="self-start rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    onClick={handleOrderSave}
                  >
                    Save order
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs">
                  <button
                    className="block rounded-md px-2 py-1 text-left font-medium text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    onClick={() => {
                      setPickerOpen(true);
                      setOrderOpen(false);
                      setCustomColorOpen(false);
                    }}
                  >
                    Change cat color
                  </button>
                  <button
                    className="block rounded-md px-2 py-1 text-left font-medium text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    onClick={() => {
                      setOrderOpen(true);
                      setPickerOpen(false);
                      setCustomColorOpen(false);
                    }}
                  >
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
          className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-2 pt-3 pb-4"
        >
          {localSkills.length === 0 ? (
            <div className="text-sm" style={{ color: on }}>
              No skills yet
              <div className="mt-2">
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
      </motion.div>
    </motion.div>
  );
}

