import React from "react";
import type { CatItem } from "@/types/dashboard";

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

interface CategoryTileProps {
  category: CatItem;
  onClick(): void;
}

export function CategoryTile({ category, onClick }: CategoryTileProps) {
  const topColor = category.color || "#353535";
  const preview = category.skills.slice(0, 4);
  const remaining = category.skill_count - preview.length;

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl border border-[#353535] bg-[#242424] p-3 text-left transition-transform hover:bg-[#2B2B2B] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
      style={{ borderTopColor: topColor, borderTopWidth: "2px" }}
      aria-label={`${category.cat_name} category`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate font-semibold text-[#E6E6E6]">
          {toTitleCase(category.cat_name)}
        </span>
        <span className="ml-2 rounded-full bg-[#353535] px-2 py-0.5 text-xs text-[#E6E6E6]">
          {category.skill_count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {preview.map((skill) => (
          <span
            key={skill.skill_id}
            className="flex items-center gap-1 rounded-full bg-[#2B2B2B] px-2 py-1 text-xs text-[#E6E6E6]"
          >
            <span className="text-sm">{skill.icon || "✨"}</span>
            <span className="max-w-[8ch] truncate">{skill.name}</span>
          </span>
        ))}
        {remaining > 0 && (
          <span
            className="rounded-full bg-[#2B2B2B] px-2 py-1 text-xs text-[#A6A6A6]"
            aria-label={`${remaining} more skills`}
          >
            +{remaining} more
          </span>
        )}
      </div>
    </button>
  );
}

export default CategoryTile;
