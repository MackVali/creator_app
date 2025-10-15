"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { Trophy, Target } from "lucide-react";
import type { GoalItem } from "@/types/dashboard";

interface GoalCardProps {
  goal: GoalItem;
  showLink?: boolean;
}

export function GoalCard({ goal, showLink = false }: GoalCardProps) {
  const getPriorityVariant = (
    priority: GoalItem["priority"]
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (priority) {
      case "CRITICAL":
      case "ULTRA-CRITICAL":
        return "destructive";
      case "HIGH":
        return "default";
      case "MEDIUM":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getEnergyVariant = (
    energy: GoalItem["energy"]
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (energy) {
      case "EXTREME":
        return "destructive";
      case "ULTRA":
        return "default";
      case "HIGH":
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const cardContent = (
    <Card className="relative h-full p-0 rounded-2xl border border-white/5 bg-[#111520] shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-colors hover:bg-white/5">
      <CardContent className="p-4 sm:p-5">
        {/* Header with title and optional monument icon */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="flex-1 pr-2 text-sm font-medium leading-tight text-[#E7ECF2]">
            {goal.name}
          </h3>
          <div className="flex-shrink-0 text-[#A7B0BD]">
            {goal.monument_id ? (
              <Trophy className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Target className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Priority and Energy badges */}
        <div className="mb-4 flex gap-2">
          <Badge
            variant={getPriorityVariant(goal.priority)}
            className="text-xs"
          >
            {goal.priority}
          </Badge>
          <Badge variant={getEnergyVariant(goal.energy)} className="text-xs">
            {goal.energy}
          </Badge>
        </div>

        {/* Created date */}
        <div className="text-xs text-[#A7B0BD]">
          Created {formatDate(goal.created_at)}
        </div>
      </CardContent>
      <div className="pointer-events-none absolute right-4 top-4">
        <FlameEmber level={goal.energy as FlameLevel} size="sm" />
      </div>
    </Card>
  );

  if (showLink) {
    return (
      <Link href={`/goals/${goal.id}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
