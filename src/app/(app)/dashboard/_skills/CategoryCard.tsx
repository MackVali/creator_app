"use client";

import Link from "next/link";
import { motion } from "framer-motion";
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
  const bg = category.color_hex || "#0B0B0F";
  const on = getOnColor(bg);
  const track = on === "#fff" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const fill = on === "#fff" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";

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
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-semibold" style={{ color: on }}>
            {category.name}
          </h3>
          <span
            className="text-xs rounded-xl px-2 py-0.5"
            style={{ backgroundColor: track, color: on }}
          >
            {skills.length}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-2 pt-3 pb-4">
          {skills.length === 0 ? (
            <div className="text-sm" style={{ color: on }}>
              No skills yet
              <div className="mt-2">
                <Link href="/skills" className="underline">
                  Add Skill
                </Link>
              </div>
            </div>
          ) : (
            skills.map((s) => (
              <SkillRow key={s.id} skill={s} onColor={on} trackColor={track} fillColor={fill} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

