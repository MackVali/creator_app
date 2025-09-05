"use client";

import Link from "next/link";
import { motion, Reorder } from "framer-motion";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { updateCatColor, updateCatOrder } from "@/lib/data/cats";
import SkillRow from "./SkillRow";
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
}

export default function CategoryCard({ category, skills, active }: Props) {
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
      className="absolute inset-0 rounded-3xl border border-black/10 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] p-3 sm:p-4 flex flex-col"
      style={{ backgroundColor: bg, color: on, pointerEvents: active ? "auto" : "none" }}
      initial={false}
      animate={active ? "active" : "inactive"}
      variants={{
        active: { scale: 1, opacity: 1, filter: "blur(0px)", y: 0 },
        inactive: { scale: 0.92, opacity: 0.6, filter: "blur(1.5px)", y: 6 },
      }}
      transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
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
            <div className="absolute left-0 top-full mt-1 z-10 rounded-md bg-white/90 p-2 text-sm text-black shadow">
              {pickerOpen ? (
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="h-24 w-24 p-0 border-0 bg-transparent"
                />
              ) : orderOpen ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    value={orderValue}
                    onChange={(e) => setOrderValue(parseInt(e.target.value, 10))}
                    className="w-20 p-1 border border-black/20 rounded"
                  />
                  <button className="underline" onClick={handleOrderSave}>
                    Save order
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="underline block text-left"
                    onClick={() => setPickerOpen(true)}
                  >
                    Change cat color
                  </button>
                  <button
                    className="underline block text-left mt-1"
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
              <Reorder.Item
                key={s.id}
                value={s}
                as="div"
                className="cursor-grab"
                onDragStart={() => {
                  dragging.current = true;
                }}
                onDragEnd={() => {
                  setTimeout(() => {
                    dragging.current = false;
                  }, 0);
                }}
                onClickCapture={(e: MouseEvent) => {
                  if (dragging.current) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <SkillRow
                  skill={s}
                  onColor={on}
                  trackColor={track}
                  fillColor={fill}
                />
              </Reorder.Item>
            ))
          )}
        </Reorder.Group>
      </motion.div>
    </motion.div>
  );
}

