import React from "react";
import type { CatItem, SkillItem } from "@/types/dashboard";
import { Progress } from "@/components/ui/Progress";

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

interface CategoryTileProps {
  category: CatItem;
}

function SkillRow({ skill }: { skill: SkillItem }) {
  return (
    <div className="rounded-lg bg-[#1E1E1E] p-2 hover:bg-[#2B2B2B] transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-base">{skill.icon || "💡"}</span>
        <span className="flex-1 truncate text-sm text-[#E6E6E6]">{skill.name}</span>
        <span className="rounded-full bg-[#353535] px-1.5 py-0.5 text-[10px] text-[#E6E6E6]">
          Lv {skill.level}
        </span>
      </div>
      <Progress
        value={skill.progress}
        trackClass="bg-[#353535]"
        barClass="bg-[#9966CC]"
        className="mt-1"
      />
    </div>
  );
}

export function CategoryTile({ category }: CategoryTileProps) {
  const topColor = category.color || "#353535";

  return (
    <div
      className="flex flex-col rounded-2xl border border-[#353535] bg-[#242424] p-3 text-left"
      style={{ borderTopColor: topColor, borderTopWidth: "2px" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate font-semibold text-[#E6E6E6]">
          {toTitleCase(category.cat_name)}
        </span>
        <span className="ml-2 rounded-full bg-[#353535] px-2 py-0.5 text-xs text-[#E6E6E6]">
          {category.skill_count}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {category.skills.map((skill) => (
          <SkillRow key={skill.skill_id} skill={skill} />
        ))}
      </div>
    </div>
  );
}

export default CategoryTile;
