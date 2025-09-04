"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ProgressRing from "./ProgressRing";
import type { Skill } from "./useSkillsData";

interface Props {
  skill: Skill;
}

export default function SkillTile({ skill }: Props) {
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Link
        href={`/skills/${skill.id}`}
        className="relative block rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 hover:bg-zinc-900/60 active:scale-[.98]"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-zinc-800/70 border border-zinc-700 flex items-center justify-center text-lg">
            {skill.emoji || "💡"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-200 truncate">
              {skill.name}
            </div>
            <div className="text-xs text-zinc-400">Lv {skill.level}</div>
          </div>
        </div>
        <div className="absolute top-2 right-2 text-zinc-300">
          <ProgressRing percent={skill.xpPercent} size={22} />
        </div>
      </Link>
    </motion.div>
  );
}
