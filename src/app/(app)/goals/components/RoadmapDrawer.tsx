"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GoalCard } from "./GoalCard";
import type { Goal } from "../types";
import type { Roadmap } from "@/lib/queries/roadmaps";

interface RoadmapDrawerProps {
  open: boolean;
  onClose(): void;
  roadmap: Roadmap | null;
  goals: Goal[];
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onProjectUpdated?: (goalId: string, projectId: string, updates: Partial<import("../types").Project>) => void;
  onProjectDeleted?: (goalId: string, projectId: string) => void;
  onCreateProject?: (goal: Goal) => void;
}

export function RoadmapDrawer({
  open,
  onClose,
  roadmap,
  goals,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onProjectUpdated,
  onProjectDeleted,
  onCreateProject,
}: RoadmapDrawerProps) {
  const [openGoalIds, setOpenGoalIds] = useState<Set<string>>(new Set());

  const handleGoalOpenChange = useCallback((goalId: string, isOpen: boolean) => {
    setOpenGoalIds((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(goalId);
      } else {
        next.delete(goalId);
      }
      return next;
    });
  }, []);

  if (!roadmap) {
    return null;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="center"
        className="h-[90vh] w-full max-w-3xl overflow-hidden border border-white/10 bg-[#05070c] text-white shadow-[0_45px_120px_-40px_rgba(5,8,21,0.85)] sm:max-w-4xl"
      >
        <SheetHeader className="border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center gap-3">
            {roadmap.emoji && (
              <span className="text-2xl" aria-hidden="true">
                {roadmap.emoji}
              </span>
            )}
            <SheetTitle className="text-left text-xl font-semibold text-white tracking-[0.2em] uppercase">
              {roadmap.title}
            </SheetTitle>
          </div>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10 pt-6 sm:px-8 sm:pb-12">
          {goals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/60">
              No goals in this roadmap yet.
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map((goal) => (
                <div key={goal.id} className="goal-card-wrapper relative z-0 w-full isolate min-w-0">
                  <GoalCard
                    goal={goal}
                    showWeight={false}
                    showCreatedAt={false}
                    showEmojiPrefix={false}
                    variant="compact"
                    onEdit={() => onGoalEdit?.(goal)}
                    onToggleActive={() => onGoalToggleActive?.(goal)}
                    onDelete={() => onGoalDelete?.(goal)}
                    onProjectUpdated={(projectId, updates) =>
                      onProjectUpdated?.(goal.id, projectId, updates)
                    }
                    onProjectDeleted={(projectId) =>
                      onProjectDeleted?.(goal.id, projectId)
                    }
                    open={openGoalIds.has(goal.id)}
                    onOpenChange={(isOpen) => handleGoalOpenChange(goal.id, isOpen)}
                    onCreateProject={() => onCreateProject?.(goal)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
