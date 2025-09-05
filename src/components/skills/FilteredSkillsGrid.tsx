"use client";

import { SkillCard } from "@/components/skills/SkillCard";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import useMonumentSkills from "@/lib/hooks/useMonumentSkills";

interface FilteredSkillsGridProps {
  monumentId: string;
}

export function FilteredSkillsGrid({ monumentId }: FilteredSkillsGridProps) {
  const { skills, loading, error } = useMonumentSkills(monumentId);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkillCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-2">Error loading skills</p>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!skills || skills.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4" role="img" aria-hidden="true">
          🛠️
        </div>
        <h3 className="text-lg font-medium text-white mb-2">
          No related skills yet
        </h3>
        <p className="text-gray-400 text-sm">
          Skills linked to this monument will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          icon={skill.icon || "🛠️"}
          name={skill.name}
          level={skill.level ?? 1}
          percent={skill.percent}
          skillId={skill.id}
        />
      ))}
    </div>
  );
}

export default FilteredSkillsGrid;

