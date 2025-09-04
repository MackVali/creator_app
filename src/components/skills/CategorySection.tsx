import React from "react";

interface CategorySectionProps {
  title: string;
  skills: Array<{
    skill_id: string;
    cat_id: string;
    name: string;
    icon: string;
    level?: number;
    progress?: number;
  }>;
  /** Optional hex color assigned to this category */
  color?: string | null;
}

export function CategorySection({ title, skills, color }: CategorySectionProps) {
  const borderColor = color || "#353535";
  const backgroundColor = color ? `${color}20` : "#242424";

  return (
    <div
      className="rounded-lg border p-1"
      style={{ borderColor, backgroundColor }}
    >
      <div className="mb-1 text-center text-[10px] font-semibold text-[#E6E6E6] truncate">
        {title}
      </div>
      <div className="flex flex-col items-start gap-1">
        {skills && skills.length > 0 ? (
          skills.map((skill) => (
            <div
              key={skill.skill_id}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[#E6E6E6] hover:bg-[#2B2B2B] active:scale-[0.98] transition transform"
            >
              <span className="text-xs">{skill.icon || "💡"}</span>
              <span className="truncate text-[10px]">{skill.name}</span>
            </div>
          ))
        ) : (
          <div className="text-center text-[10px] text-[#808080]">No skills</div>
        )}
      </div>
    </div>
  );
}

export default CategorySection;
