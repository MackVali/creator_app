"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SkillTile from "./SkillTile";
import type { Category, Skill } from "./useSkillsData";

interface Props {
  category: Category;
  skills: Skill[];
  active: boolean;
}

const variants = {
  active: { scale: 1, opacity: 1, filter: "blur(0px)", y: 0 },
  inactive: { scale: 0.92, opacity: 0.6, filter: "blur(2px)", y: 6 },
};

export default function SkillCategoryCard({ category, skills, active }: Props) {
  return (
    <motion.div
      layout
      variants={variants}
      animate={active ? "active" : "inactive"}
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.9 }}
      className="rounded-3xl bg-zinc-900/70 border border-zinc-800 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] flex flex-col max-h-[60vh] overflow-y-auto overscroll-contain p-4 pb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 tracking-wide">
          {category.name.toUpperCase()}
        </h3>
        <span className="text-xs rounded-full bg-zinc-800/70 border border-zinc-700 px-2 py-0.5 text-zinc-300">
          {skills.length}
        </span>
      </div>
      {skills.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <SkillTile key={skill.id} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-400">
          No skills yet
          <div className="mt-2">
            <Link href="/skills" className="text-zinc-200 underline">
              Add Skill
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );
}
