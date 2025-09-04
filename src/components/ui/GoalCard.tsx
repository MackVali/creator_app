"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
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
    <Card className="relative h-full hover:bg-gray-800/50 transition-colors">
      <CardContent className="p-4">
        {/* Header with title and optional monument icon */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-medium text-white text-sm leading-tight flex-1 pr-2">
            {goal.name}
          </h3>
          <div className="flex-shrink-0">
            {goal.monument_id ? (
              <Trophy className="w-4 h-4 text-yellow-500" />
            ) : (
              <Target className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </div>

        {/* Priority and Energy badges */}
        <div className="flex gap-2 mb-3">
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
        <div className="text-xs text-gray-400">
          Created {formatDate(goal.created_at)}
        </div>
      </CardContent>
      <div className="absolute right-2 top-2 pointer-events-none">
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
