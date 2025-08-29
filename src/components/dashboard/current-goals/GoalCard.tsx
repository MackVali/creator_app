"use client";

import { Folder, ChevronDown, ChevronRight } from "lucide-react";
import { Progress } from "../../../../components/ui/Progress";
import type { Goal } from "./types";
import { useRouter } from "next/navigation";
import { goalDetailRoute } from "../../../../lib/route-helpers";

interface GoalCardProps {
  goal: Goal;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function GoalCard({ goal, expanded, onToggle, children }: GoalCardProps) {
  const router = useRouter();
  const icon = goal.emoji ? (
    <span className="text-xl mr-2">{goal.emoji}</span>
  ) : (
    <Folder className="w-5 h-5 mr-2" />
  );

  return (
    <div className="border-b border-white/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5"
      >
        <div className="flex items-center flex-1 overflow-hidden">
          {icon}
          <div
            className="flex-1 min-w-0"
            onClick={(e) => {
              e.stopPropagation();
              router.push(goalDetailRoute(goal.id));
            }}
          >
            <div className="font-medium truncate">{goal.title}</div>
            <div className="text-xs text-zinc-400 truncate">
              {goal.projectCount} projects • {goal.taskCount} tasks • {goal.progressPct}%
            </div>
            <Progress
              value={goal.progressPct}
              className="mt-1 h-1"
              trackClass="bg-zinc-800"
              barClass="bg-zinc-300"
            />
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
      </button>
      {expanded && children && <div className="pl-6">{children}</div>}
    </div>
  );
}

