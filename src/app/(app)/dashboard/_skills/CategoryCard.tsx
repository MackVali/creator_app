"use client";

import Link from "next/link";
import { motion, Reorder } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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

