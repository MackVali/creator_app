import { SkillItem } from "@/types/dashboard";

interface SkillRowProps {
  skill: SkillItem;
}

export function SkillRow({ skill }: SkillRowProps) {
  // Function to get emoji icon based on skill name or icon field
  const getSkillIcon = (skillName: string, iconField: string) => {
    // If icon field has an emoji, use it
    if (iconField && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(iconField)) {
      return iconField;
    }
    
    // Fallback to name-based icons
    const name = skillName.toLowerCase();
    if (name.includes('writing') || name.includes('write')) return '✏️';
    if (name.includes('time') || name.includes('management')) return '⏰';
    if (name.includes('speaking') || name.includes('public')) return '📢';
    if (name.includes('problem') || name.includes('solve')) return '🧩';
    if (name.includes('music')) return '🎵';
    if (name.includes('guitar')) return '🎸';
    if (name.includes('coding') || name.includes('programming')) return '💻';
    if (name.includes('design')) return '🎨';
    if (name.includes('cooking')) return '👨‍🍳';
    if (name.includes('fitness') || name.includes('exercise')) return '💪';
    if (name.includes('language')) return '🗣️';
    if (name.includes('art') || name.includes('drawing')) return '🖼️';
    if (name.includes('photography')) return '📸';
    if (name.includes('dance')) return '💃';
    if (name.includes('chess')) return '♟️';
    if (name.includes('math')) return '🔢';
    if (name.includes('science')) return '🔬';
    if (name.includes('history')) return '📚';
    if (name.includes('business')) return '💼';
    
    return '💡'; // Default icon
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-cardho">
      {/* Skill Icon */}
      <div className="flex-shrink-0 text-xl text-icon">
        {getSkillIcon(skill.name, skill.icon)}
      </div>

      {/* Skill Name */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-texthi">
          {skill.name}
        </div>
      </div>

      {/* Level Badge */}
      <div className="flex-shrink-0 rounded-full bg-pill px-2 py-1 text-xs text-textmed">
        Lv {skill.level}
      </div>

      {/* Progress Bar */}
      <div className="w-20 flex-shrink-0">
        <div className="h-2 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-fill transition-all duration-300"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
      </div>

      {/* Progress Percentage */}
      <div className="w-12 flex-shrink-0 text-right text-xs text-textmed">
        {skill.progress}%
      </div>
    </div>
  );
}
