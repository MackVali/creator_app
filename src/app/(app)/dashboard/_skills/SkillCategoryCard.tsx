"use client";

import Link from "next/link";
import SkillCard from "./SkillCard";
import type { Category, Skill } from "./useSkills";

interface Props {
  category: Category;
  skills: Skill[];
}

export default function SkillCategoryCard({ category, skills }: Props) {
  return (
    <div className="h-full flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-zinc-100">
          {category.name.toUpperCase()}
        </h3>
        <span className="text-xs rounded-full bg-zinc-800 text-zinc-300 px-2 py-0.5">
          {skills.length}
        </span>
      </div>
      {skills.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-400">
          No skills yet
          <div className="mt-2">
            <Link href="/skills" className="text-accent underline">
              Add Skill
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

