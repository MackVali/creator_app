"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import SkillRow from "./SkillRow";
import type { Category, Skill } from "./useSkillsData";

interface Props {
  category: Category;
  skills: Skill[];
  active: boolean;
}

export default function CategoryCard({ category, skills, active }: Props) {
  return (
    <motion.div
      layout
      className="absolute inset-0 flex flex-col rounded-lg border border-border bg-panel p-3 shadow-soft sm:p-4 text-texthi"
      style={{ pointerEvents: active ? "auto" : "none" }}
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
        className="flex flex-1 flex-col overflow-hidden"
      >
        <header className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">{category.name}</h3>
          <span className="rounded-xl bg-pill px-2 py-0.5 text-xs text-textmed">
            {skills.length}
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pt-3 pb-4">
          {skills.length === 0 ? (
            <div className="text-sm text-textmed">
              No skills yet
              <div className="mt-2">
                <Link href="/skills" className="underline">
                  Add Skill
                </Link>
              </div>
            </div>
          ) : (
            skills.map((s) => <SkillRow key={s.id} skill={s} />)
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

