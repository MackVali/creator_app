"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProgressBarGradient from "@/components/skills/ProgressBarGradient";
import type { GoalItem } from "@/types/dashboard";

interface GoalCardMiniProps {
  goal: GoalItem;
}

function priorityVariant(priority: GoalItem["priority"]):
  | "default"
  | "secondary"
  | "destructive"
  | "outline" {
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
}

export function GoalCardMini({ goal }: GoalCardMiniProps) {
  const router = useRouter();
  const progress = goal.progress ?? 0;
  return (
    <Card className="p-3 gap-2">
      <CardContent className="p-0 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground flex-1 pr-2">
            {goal.name}
          </h4>
          <Badge variant={priorityVariant(goal.priority)} className="text-xs">
            {goal.priority}
          </Badge>
        </div>
        <ProgressBarGradient value={progress} height={6} />
      </CardContent>
      <CardFooter className="p-0">
        <Button
          size="sm"
          className="w-full"
          onClick={() => router.push(`/schedule?goalId=${goal.id}`)}
        >
          Add to Schedule
        </Button>
      </CardFooter>
    </Card>
  );
}

export default GoalCardMini;
