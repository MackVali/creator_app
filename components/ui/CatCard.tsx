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
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Category Header */}
      <div
        className="cursor-pointer p-4 transition-colors hover:bg-cardho"
        onClick={toggleExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium text-texthi">
              {cat.cat_name}
            </div>
            <div className="rounded-full bg-pill px-2 py-1 text-sm text-textmed">
              {cat.skill_count} skills
            </div>
          </div>
          <div className="text-icon">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </div>
        </div>
      </div>

      {/* Skills List */}
      {isExpanded && (
        <div className="border-t border-border bg-panel">
          <div className="space-y-3 p-4">
            {cat.skills && cat.skills.length > 0 ? (
              cat.skills.map((skill) => (
                <SkillRow key={skill.skill_id} skill={skill} />
              ))
            ) : (
              <div className="py-2 text-center text-sm text-textmed">
                No skills in this category
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
