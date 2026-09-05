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
    if (name.includes('fitness') || name.includes('exercise')) return '🦾';
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
    <div className="flex items-center gap-3 p-3 bg-[#1E1E1E] rounded-md border border-[#333] hover:bg-[#252525] transition-colors">
      {/* Skill Icon */}
      <div className="text-xl flex-shrink-0">
        {getSkillIcon(skill.name, skill.icon)}
      </div>
      
      {/* Skill Name */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#E0E0E0] truncate">
          {skill.name}
        </div>
      </div>
      
      {/* Level Badge */}
      <div className="text-xs text-[#A0A0A0] bg-[#404040] px-2 py-1 rounded-full flex-shrink-0">
        Lv {skill.level}
      </div>
      
      {/* Progress Bar */}
      <div className="w-20 flex-shrink-0">
        <div className="w-full h-2 bg-[#333] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#BBB] rounded-full transition-all duration-300"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
      </div>
      
      {/* Progress Percentage */}
      <div className="text-xs text-[#A0A0A0] w-12 text-right flex-shrink-0">
        {skill.progress}%
      </div>
    </div>
  );
}
