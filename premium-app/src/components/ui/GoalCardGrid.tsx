"use client";

import React from "react";
import { GoalCard } from "./GoalCard";
import { Card, CardContent } from "../../../components/ui/card";
import { Target } from "lucide-react";
import type { GoalItem } from "@/types/dashboard";

interface GoalCardGridProps {
  goals: GoalItem[];
  loading?: boolean;
  showLinks?: boolean;
}

export function GoalCardGrid({
  goals,
  loading = false,
  showLinks = false,
}: GoalCardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-3"></div>
              <div className="flex gap-2 mb-3">
                <div className="h-6 bg-gray-700 rounded w-16"></div>
                <div className="h-6 bg-gray-700 rounded w-16"></div>
              </div>
              <div className="h-3 bg-gray-700 rounded w-24"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <Card className="mx-4">
        <CardContent className="p-8 text-center">
          <div className="text-gray-400 mb-2">
            <Target className="w-8 h-8 mx-auto mb-3" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No goals yet</h3>
          <p className="text-sm text-gray-400 mb-4">
            Start by creating your first goal to track your progress
          </p>
          {/* Check if we have a route to create goals - for now, omit CTA */}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} showLink={showLinks} />
      ))}
    </div>
  );
}
