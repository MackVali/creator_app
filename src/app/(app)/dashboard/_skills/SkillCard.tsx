"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ProgressRing from "./ProgressRing";
import { Skill } from "./useSkills";

interface SkillCardProps {
  skill: Skill;
}

export function SkillCard({ skill }: SkillCardProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-sm p-3 flex items-center gap-3"
    >
      <Link href={`/skills/${skill.id}`} className="flex items-center gap-3 flex-1">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-lg">
          {skill.icon || "💡"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 truncate">{skill.name}</div>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <ProgressRing percent={skill.progress} className="text-zinc-400" />
        <span className="text-xs bg-zinc-800 text-zinc-300 rounded-full px-2 py-0.5">
          Lv {skill.level}
        </span>
      </div>
    </motion.div>
  );
}

export default SkillCard;
