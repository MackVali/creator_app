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
      className="w-full rounded-2xl border border-border bg-card shadow-sm p-3 flex items-center gap-3"
    >
      <Link href={`/skills/${skill.id}`} className="flex items-center gap-3 flex-1">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-muted text-lg">
          {skill.icon || "💡"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-card-foreground truncate">{skill.name}</div>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <ProgressRing percent={skill.progress} className="text-accent" />
        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
          Lv {skill.level}
        </span>
      </div>
    </motion.div>
  );
}

export default SkillCard;
