"use client";

import { CatItem } from "@/types/dashboard";
import { SkillRow } from "./SkillRow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { ChevronDown } from "lucide-react";

interface CatCardProps {
  cat: CatItem;
}

export function CatCard({ cat }: CatCardProps) {
  const skills = cat.skills || [];
  const visible = skills.slice(0, 5);
  const remaining = skills.slice(5);

  return (
    <div className="bg-[#2C2C2C] rounded-lg border border-[#333] overflow-hidden">
      {/* Category Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-medium text-[#E0E0E0]">
            {cat.cat_name}
          </div>
          <div className="text-sm text-[#A0A0A0] bg-[#404040] px-2 py-1 rounded-full">
            {cat.skill_count} skills
          </div>
        </div>
      </div>

      {/* Skills List */}
      <div className="border-t border-[#333] bg-[#252525]">
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) =>
            visible[i] ? (
              <SkillRow key={visible[i].skill_id} skill={visible[i]} />
            ) : (
              <div
                key={i}
                className="p-3 bg-[#1E1E1E] rounded-md border border-[#333]"
              />
            )
          )}

          {remaining.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between text-[#E0E0E0]"
                >
                  See more
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[360px] p-4 space-y-3">
                {remaining.map((skill) => (
                  <SkillRow key={skill.skill_id} skill={skill} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
