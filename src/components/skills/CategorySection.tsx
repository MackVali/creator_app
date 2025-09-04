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
    <div className="rounded-lg border p-2" style={{ borderColor, backgroundColor }}>
      <div className="mb-2 truncate text-center text-sm font-semibold text-[#E6E6E6]">
        {title}
      </div>
      <div className="flex flex-col items-start gap-2">
        {skills && skills.length > 0 ? (
          skills.map((skill) => (
            <div
              key={skill.skill_id}
              className="flex items-center gap-2 rounded px-2 py-1 text-[#E6E6E6] hover:bg-[#2B2B2B] active:scale-[0.98] transition transform"
            >
              <span className="text-base">{skill.icon || "💡"}</span>
              <span className="truncate text-sm">{skill.name}</span>
            </div>
          ))
        ) : (
          <div className="text-center text-xs text-[#808080]">No skills</div>
        )}
      </div>
    </div>
  );
}

export default CategorySection;
