"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CatItem } from "@/types/dashboard";
import { SkillRow } from "./SkillRow";

interface CatCardProps {
  cat: CatItem;
}

export function CatCard({ cat }: CatCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="bg-[#2C2C2C] rounded-lg border border-[#333] overflow-hidden">
      {/* Category Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-[#353535] transition-colors"
        onClick={toggleExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium text-[#E0E0E0]">
              {cat.cat_name}
            </div>
            <div className="text-sm text-[#A0A0A0] bg-[#404040] px-2 py-1 rounded-full">
              {cat.skill_count} skills
            </div>
          </div>
          <div className="text-[#A0A0A0]">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* Skills List */}
      {isExpanded && (
        <div className="border-t border-[#333] bg-[#252525]">
          <div className="p-4 space-y-3">
            {cat.skills.length > 0 ? (
              cat.skills.map((skill) => (
                <SkillRow key={skill.skill_id} skill={skill} />
              ))
            ) : (
              <div className="text-sm text-[#808080] text-center py-2">
                No skills in this category
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
