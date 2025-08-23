"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  ContentCard,
  ListContainer,
  ListSkeleton,
  GoalsEmptyState,
  useToastHelpers,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Plus, Target, Calendar, TrendingUp } from "lucide-react";

interface Goal {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "paused";
  progress: number;
  dueDate?: string;
  category: string;
}

export default function GoalsPage() {
  return (
    <div className="p-6 text-white">
      <h1>Goals Page</h1>
      <p>Coming soon...</p>
    </div>
  );
}
