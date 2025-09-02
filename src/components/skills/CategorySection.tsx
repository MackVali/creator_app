import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import SkillCard from "@/components/skills/SkillCard";
import { cn } from "@/lib/utils";
// Removed unused import

interface CategorySectionProps {
  title: string;
  skillCount: number;
  skills: Array<{
    skill_id: string;
    cat_id: string;
    name: string;
    icon: string;
    level: number;
    progress: number;
  }>;
}

export function CategorySection({
  title,
  skillCount,
  skills,
}: CategorySectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-slate-800/40 ring-1 ring-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 px-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-wide">
            {title}
          </span>
          <span className="text-[11px] rounded-full bg-white/8 ring-1 ring-white/10 px-2 py-[2px]">
            {skillCount} skills
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-gray-400 transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-slate-900/60 border-t border-white/5 px-4 pb-4 pt-2 space-y-2 overflow-hidden"
            >
              {skills && skills.length > 0 ? (
                skills.map((skill) => (
                  <SkillCard
                    key={skill.skill_id}
                    icon={skill.icon}
                    name={skill.name}
                    level={skill.level}
                    percent={skill.progress || 0}
                    skillId={skill.skill_id}
                  />
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No skills
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

export default CategorySection;
